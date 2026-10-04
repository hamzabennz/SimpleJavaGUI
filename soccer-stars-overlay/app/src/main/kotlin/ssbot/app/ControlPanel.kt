package ssbot.app

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs

/**
 * Small draggable floating panel: mode, analyse now, re-init, hide drawings, stop.
 * Text is light grey (never pure white) so it cannot trigger the bot's white-pixel turn check.
 */
@SuppressLint("ViewConstructor", "SetTextI18n")
class ControlPanel(
    context: Context,
    private val settings: Settings,
    private val wm: WindowManager,
    private val onAnalyze: () -> Unit,
    private val onReinit: () -> Unit,
    private val onToggleDrawings: () -> Unit,
    private val onReport: () -> Unit,
    private val onCalibrate: () -> Unit,
    private val onStop: () -> Unit,
) : LinearLayout(context) {
    private val density = resources.displayMetrics.density
    private val status = TextView(context)
    private val body = LinearLayout(context)
    private val modeButton: Button
    private var onModeChanged: () -> Unit = {}
    lateinit var params: WindowManager.LayoutParams

    init {
        orientation = VERTICAL
        background = GradientDrawable().apply {
            setColor(Color.argb(200, 25, 25, 35))
            cornerRadius = 12 * density
        }
        val pad = (6 * density).toInt()
        setPadding(pad, pad, pad, pad)

        val handle = TextView(context).apply {
            text = "⠿ Stars Bot"
            setTextColor(Color.rgb(200, 200, 210))
            textSize = 12f
            setPadding(pad, 0, pad, pad / 2)
        }
        addView(handle)

        status.setTextColor(Color.rgb(200, 200, 210))
        status.textSize = 10f
        status.maxLines = 9
        status.maxWidth = (PANEL_DP * density).toInt()
        status.setPadding(pad, 0, pad, pad)
        addView(status)

        // A narrow column that fits in the green strip left of the pitch, so it never hides pieces.
        body.orientation = VERTICAL
        modeButton = button(shortMode()) {
            settings.mode = Mode.entries[(settings.mode.ordinal + 1) % Mode.entries.size]
            modeButtonText()
            onModeChanged()
        }
        val buttons = listOf(
            modeButton, button("Analyze") { onAnalyze() },
            button("Calibrate") { onCalibrate() }, button("Report") { onReport() },
            button("Re-init") { onReinit() }, button("Draw") { onToggleDrawings() },
            button("Stop") { onStop() },
        )
        val rows = buttons.chunked(2).map { pair ->
            LinearLayout(context).apply {
                orientation = HORIZONTAL
                setPadding(0, pad / 3, 0, 0)
                pair.forEach { addView(it) }
            }
        }
        rows.forEach { body.addView(it) }
        addView(body)

        // Tap the title to collapse/expand, drag it to move the panel.
        handle.setOnTouchListener(DragListener { body.visibility = if (body.visibility == View.VISIBLE) View.GONE else View.VISIBLE })
    }

    fun setOnModeChanged(f: () -> Unit) { onModeChanged = f }

    private fun shortMode() = when (settings.mode) {
        Mode.PREDICT -> "Predict"
        Mode.SUGGEST -> "Suggest"
        Mode.AUTO -> "Auto"
    }

    private fun modeButtonText() { modeButton.text = shortMode() }

    fun setStatus(text: String) {
        post { status.text = text }
    }

    private fun button(label: String, onClick: () -> Unit) = Button(context).apply {
        text = label
        isAllCaps = false
        textSize = 10f
        setTextColor(Color.rgb(220, 220, 230))
        minWidth = 0; minimumWidth = 0
        minHeight = 0; minimumHeight = 0
        val p = (8 * density).toInt()
        setPadding(p, p / 2, p, p / 2)
        background = GradientDrawable().apply {
            setColor(Color.argb(230, 60, 60, 90))
            cornerRadius = 8 * density
        }
        layoutParams = LinearLayout.LayoutParams(((PANEL_DP / 2 - 3) * density).toInt(), LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            marginEnd = (3 * density).toInt()
        }
        setOnClickListener { onClick() }
    }

    private inner class DragListener(private val onTap: () -> Unit) : View.OnTouchListener {
        private var startX = 0
        private var startY = 0
        private var downX = 0f
        private var downY = 0f
        private var dragging = false

        @SuppressLint("ClickableViewAccessibility")
        override fun onTouch(v: View, e: MotionEvent): Boolean {
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    startX = params.x; startY = params.y
                    downX = e.rawX; downY = e.rawY
                    dragging = false
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (abs(dx) + abs(dy) > 10 * density) dragging = true
                    if (dragging) {
                        params.x = startX + dx.toInt()
                        params.y = startY + dy.toInt()
                        wm.updateViewLayout(this@ControlPanel, params)
                    }
                }
                MotionEvent.ACTION_UP -> if (!dragging) onTap()
            }
            return true
        }
    }

    companion object {
        /** Panel width in dp: fits the strip left of the pitch on 19.5:9 phones. */
        const val PANEL_DP = 120

        fun layoutParams(type: Int) = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            android.graphics.PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0
            y = 0
        }
    }
}
