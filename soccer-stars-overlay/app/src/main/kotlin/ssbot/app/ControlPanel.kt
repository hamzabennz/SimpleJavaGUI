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
        status.textSize = 11f
        status.maxWidth = (230 * density).toInt()
        status.setPadding(pad, 0, pad, pad)
        addView(status)

        body.orientation = VERTICAL
        val row1 = LinearLayout(context).apply { orientation = HORIZONTAL }
        val row2 = LinearLayout(context).apply {
            orientation = HORIZONTAL
            setPadding(0, pad / 2, 0, 0)
        }
        modeButton = button(shortMode()) {
            settings.mode = Mode.entries[(settings.mode.ordinal + 1) % Mode.entries.size]
            modeButtonText()
            onModeChanged()
        }
        row1.addView(modeButton)
        row1.addView(button("Analyze") { onAnalyze() })
        row1.addView(button("Re-init") { onReinit() })
        row1.addView(button("Stop") { onStop() })
        row2.addView(button("Calibrate") { onCalibrate() })
        row2.addView(button("Report") { onReport() })
        row2.addView(button("Draw") { onToggleDrawings() })
        body.addView(row1)
        body.addView(row2)
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
        textSize = 11f
        setTextColor(Color.rgb(220, 220, 230))
        minWidth = 0; minimumWidth = 0
        minHeight = 0; minimumHeight = 0
        val p = (8 * density).toInt()
        setPadding(p, p / 2, p, p / 2)
        background = GradientDrawable().apply {
            setColor(Color.argb(230, 60, 60, 90))
            cornerRadius = 8 * density
        }
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            marginEnd = (4 * density).toInt()
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
                        params.x = startX - dx.toInt() // gravity END: x grows leftwards
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
        fun layoutParams(type: Int) = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            android.graphics.PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 0
            y = 0
        }
    }
}
