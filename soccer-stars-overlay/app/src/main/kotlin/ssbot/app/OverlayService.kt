package ssbot.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Display
import android.view.WindowManager
import android.widget.Toast
import org.opencv.android.OpenCVLoader
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.imgproc.Imgproc

/**
 * Foreground service: captures the screen (MediaProjection), runs [BotEngine] on the frames
 * on a worker thread, and shows the results in a touch-through overlay plus a control panel.
 */
class OverlayService : Service() {
    private lateinit var settings: Settings
    private lateinit var wm: WindowManager
    private lateinit var displayManager: DisplayManager
    private val main = Handler(Looper.getMainLooper())
    private lateinit var worker: HandlerThread
    private lateinit var workerHandler: Handler

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var captureW = 0
    private var captureH = 0

    private var engine: BotEngine? = null
    private var overlay: OverlayView? = null
    private var panel: ControlPanel? = null
    @Volatile private var running = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        settings = Settings(this)
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        displayManager = getSystemService(DISPLAY_SERVICE) as DisplayManager
        worker = HandlerThread("bot-worker").also { it.start() }
        workerHandler = Handler(worker.looper)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (running) return START_NOT_STICKY
        startForegroundWithNotification()

        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
        @Suppress("DEPRECATION")
        val data: Intent? = if (Build.VERSION.SDK_INT >= 33) intent?.getParcelableExtra(EXTRA_DATA, Intent::class.java) else intent?.getParcelableExtra(EXTRA_DATA)
        if (data == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val mp = mpm.getMediaProjection(resultCode, data)
        if (mp == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        projection = mp
        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                main.post { stopSelf() }
            }
        }, main)

        running = true
        addOverlayWindows()
        startCapture()
        displayManager.registerDisplayListener(displayListener, main)

        panel?.setStatus("Loading models…")
        workerHandler.post {
            try {
                if (!OpenCVLoader.initLocal()) error("OpenCV failed to load")
                engine = BotEngine(this, settings).also { e ->
                    e.onShot = { start, end ->
                        main.post {
                            val g = GestureService.instance
                            if (g == null) {
                                Toast.makeText(this, "Enable the accessibility service for Auto mode", Toast.LENGTH_SHORT).show()
                            } else {
                                g.drag(start.x.toFloat(), start.y.toFloat(), end.x.toFloat(), end.y.toFloat(), 500)
                            }
                        }
                    }
                }
                panel?.setStatus(if (engine!!.accelerated) "Ready (ARM-accelerated) – open the game" else "Ready – open the game")
                workerHandler.post(loop)
            } catch (t: Throwable) {
                Log.e(TAG, "init failed", t)
                panel?.setStatus("Failed to start: ${t.message}")
            }
        }
        return START_NOT_STICKY
    }

    private fun startForegroundWithNotification() {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Overlay", NotificationManager.IMPORTANCE_LOW))
        val stop = PendingIntent.getService(
            this, 1, Intent(this, OverlayService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val open = PendingIntent.getActivity(this, 2, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, CHANNEL)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("Overlay running – watching the game")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, "Stop", stop).build())
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIFICATION_ID, n)
        }
    }

    private fun addOverlayWindows() {
        val type = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        val ov = OverlayView(this, settings)
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            // Android 12+ only passes touches through overlays with opacity <= 0.8.
            alpha = 0.8f
            if (Build.VERSION.SDK_INT >= 30) {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            } else if (Build.VERSION.SDK_INT >= 28) {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        wm.addView(ov, lp)
        overlay = ov

        val p = ControlPanel(
            this, settings, wm,
            onAnalyze = { engine?.analyzeRequested = true },
            onReinit = { engine?.reinitRequested = true },
            onToggleDrawings = {
                settings.showDetections = !settings.showDetections
                ov.invalidate()
            },
            onStop = { stopSelf() },
        )
        p.params = ControlPanel.layoutParams(type).apply {
            if (Build.VERSION.SDK_INT >= 28) layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            y = (resources.displayMetrics.heightPixels * 0.18).toInt()
        }
        wm.addView(p, p.params)
        panel = p
    }

    private fun realSize(): Pair<Int, Int> {
        val d = displayManager.getDisplay(Display.DEFAULT_DISPLAY)
        val pt = android.graphics.Point()
        @Suppress("DEPRECATION")
        d.getRealSize(pt)
        return pt.x to pt.y
    }

    private fun startCapture() {
        val (w, h) = realSize()
        captureW = w; captureH = h
        val r = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2)
        reader = r
        virtualDisplay = projection!!.createVirtualDisplay(
            "stars-bot", w, h, resources.displayMetrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, null,
        )
    }

    /** Rotation: resize the capture so frames always match the screen. */
    private val displayListener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(displayId: Int) {}
        override fun onDisplayRemoved(displayId: Int) {}
        override fun onDisplayChanged(displayId: Int) {
            if (displayId != Display.DEFAULT_DISPLAY || !running) return
            val (w, h) = realSize()
            if (w == captureW && h == captureH) return
            workerHandler.post {
                val vd = virtualDisplay ?: return@post
                val old = reader
                val r = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2)
                vd.resize(w, h, resources.displayMetrics.densityDpi)
                vd.surface = r.surface
                reader = r
                captureW = w; captureH = h
                old?.close()
            }
        }
    }

    private val loop = object : Runnable {
        override fun run() {
            if (!running) return
            val t0 = SystemClock.uptimeMillis()
            try {
                val frame = grabFrame()
                if (frame != null) {
                    val model = engine!!.process(frame)
                    frame.release()
                    overlay?.model = model
                    panel?.setStatus(listOf(model.hint, model.status).filter { it.isNotEmpty() }.joinToString("\n"))
                }
            } catch (t: Throwable) {
                Log.e(TAG, "frame failed", t)
                panel?.setStatus("Error: ${t.message}")
            }
            val elapsed = SystemClock.uptimeMillis() - t0
            workerHandler.postDelayed(this, maxOf(30L, FRAME_INTERVAL_MS - elapsed))
        }
    }

    /** Latest screen image as a BGR Mat (the format the bot's detectors use). */
    private fun grabFrame(): Mat? {
        val image = reader?.acquireLatestImage() ?: return null
        try {
            val plane = image.planes[0]
            val w = image.width
            val h = image.height
            val buf = plane.buffer
            val rowStride = plane.rowStride
            val pixelStride = plane.pixelStride
            val rgba = Mat(h, w, CvType.CV_8UC4)
            val row = ByteArray(w * 4)
            if (pixelStride == 4) {
                for (y in 0 until h) {
                    buf.position(y * rowStride)
                    buf.get(row, 0, w * 4)
                    rgba.put(y, 0, row)
                }
            } else {
                return null
            }
            val bgr = Mat()
            Imgproc.cvtColor(rgba, bgr, Imgproc.COLOR_RGBA2BGR)
            rgba.release()
            return bgr
        } finally {
            image.close()
        }
    }

    override fun onDestroy() {
        running = false
        runCatching { displayManager.unregisterDisplayListener(displayListener) }
        workerHandler.removeCallbacksAndMessages(null)
        workerHandler.post {
            engine?.close()
            engine = null
            virtualDisplay?.release()
            reader?.close()
            worker.quitSafely()
        }
        projection?.stop()
        overlay?.let { runCatching { wm.removeView(it) } }
        panel?.let { runCatching { wm.removeView(it) } }
        super.onDestroy()
    }

    companion object {
        private const val TAG = "StarsBot"
        private const val CHANNEL = "overlay"
        private const val NOTIFICATION_ID = 1
        private const val FRAME_INTERVAL_MS = 80L
        const val ACTION_STOP = "ssbot.app.STOP"
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_DATA = "data"

        fun start(context: Context, resultCode: Int, data: Intent) {
            context.startForegroundService(
                Intent(context, OverlayService::class.java)
                    .putExtra(EXTRA_RESULT_CODE, resultCode)
                    .putExtra(EXTRA_DATA, data),
            )
        }

        fun stop(context: Context) {
            context.startService(Intent(context, OverlayService::class.java).setAction(ACTION_STOP))
        }
    }
}
