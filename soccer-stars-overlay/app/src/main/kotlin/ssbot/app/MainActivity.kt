package ssbot.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings as AndroidSettings
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/** Setup screen: permissions, mode, a few settings, and start/stop. */
@SuppressLint("SetTextI18n")
class MainActivity : Activity() {
    private lateinit var settings: Settings
    private lateinit var overlayStatus: TextView
    private lateinit var gestureStatus: TextView
    private val density get() = resources.displayMetrics.density

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = Settings(this)
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 2)

        val pad = (16 * density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        root.addView(text("Stars Bot Overlay", 22f, bold = true))
        root.addView(text(
            "An Android port of the Soccer-Stars-Game-Bot: it watches the game through screen capture, " +
                "finds the pitch, goals, pieces, ball and your aiming arrow, simulates the shot with the bot's " +
                "fitted physics and draws the result on top of the game.", 14f,
        ))

        root.addView(header("1. Permissions"))
        overlayStatus = text("", 14f)
        root.addView(overlayStatus)
        root.addView(button("Allow drawing over other apps") {
            startActivity(Intent(AndroidSettings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        })
        gestureStatus = text("", 14f)
        root.addView(gestureStatus)
        root.addView(button("Open Accessibility settings (Auto mode only)") {
            startActivity(Intent(AndroidSettings.ACTION_ACCESSIBILITY_SETTINGS))
        })

        root.addView(header("2. Mode"))
        val group = RadioGroup(this)
        Mode.entries.forEach { m ->
            group.addView(RadioButton(this).apply {
                id = View.generateViewId()
                text = m.label + when (m) {
                    Mode.PREDICT -> " – what the bot's main.py does"
                    Mode.SUGGEST -> " – evolutionary search (ChooseAction)"
                    Mode.AUTO -> " – search + swipe (needs Accessibility)"
                }
                isChecked = settings.mode == m
                setOnCheckedChangeListener { _, checked -> if (checked) settings.mode = m }
            })
        }
        root.addView(group)

        root.addView(header("3. Settings"))
        root.addView(numberField("Search iterations (bot: 50)", settings.gaIterations.toString(), false) { v ->
            v.toIntOrNull()?.takeIf { it in 1..500 }?.let { settings.gaIterations = it }
        })
        root.addView(numberField("Search population (bot: 50)", settings.gaPopulation.toString(), false) { v ->
            v.toIntOrNull()?.takeIf { it in 2..500 }?.let { settings.gaPopulation = it }
        })
        root.addView(numberField("Swipe length multiplier (bot: 1.0 = force/60)", settings.dragScale.toString(), true) { v ->
            v.toFloatOrNull()?.takeIf { it in 0.05f..10f }?.let { settings.dragScale = it }
        })

        root.addView(android.widget.CheckBox(this).apply {
            text = "Auto mode: only shoot when the bot's turn check says it's your turn (untick if Auto never shoots)"
            isChecked = settings.useTurnCheck
            setOnCheckedChangeListener { _, c -> settings.useTurnCheck = c }
        })

        root.addView(header("4. Run"))
        root.addView(button("Start overlay") { start() })
        root.addView(button("Stop overlay") { OverlayService.stop(this) })
        root.addView(text(
            "After starting, choose \"Entire screen\" when Android asks what to share, then open the game.\n\n" +
                "How it works: whenever the pieces stop moving the overlay reads the board (blue boxes = your " +
                "pieces, pink = opponent, cyan = ball).\n" +
                "• Predict: start aiming – the cyan line shows where the ball will go, a light-blue ring marks a goal.\n" +
                "• Suggest: the violet ring marks the best piece, the arrow the shot direction; drag that piece " +
                "back to the small violet dot.\n" +
                "• Auto: the app plays that shot for you.\n" +
                "Floating panel: tap the title to fold it, drag it to move. Mode = switch mode, Analyze = read " +
                "the board now, Re-init = new match/table, Draw = hide boxes, Stop.\n\n" +
                "Note: automated play in online matches against other people may break the game's terms of " +
                "service. Prefer offline/friend matches for Auto mode.", 13f,
        ))

        setContentView(ScrollView(this).apply {
            fitsSystemWindows = true
            addView(root)
        })
    }

    override fun onResume() {
        super.onResume()
        val canDraw = AndroidSettings.canDrawOverlays(this)
        overlayStatus.text = if (canDraw) "✓ Draw over other apps: allowed" else "✗ Draw over other apps: not allowed (required)"
        val gestures = isGestureServiceEnabled()
        gestureStatus.text = if (gestures) "✓ Auto-play service: enabled" else "– Auto-play service: off (only needed for Auto mode)"
    }

    private fun isGestureServiceEnabled(): Boolean {
        val enabled = AndroidSettings.Secure.getString(contentResolver, AndroidSettings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val me = ComponentName(this, GestureService::class.java).flattenToString()
        return enabled.split(':').any { it.equals(me, ignoreCase = true) }
    }

    private fun start() {
        if (!AndroidSettings.canDrawOverlays(this)) {
            Toast.makeText(this, "Allow drawing over other apps first", Toast.LENGTH_LONG).show()
            return
        }
        val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        @Suppress("DEPRECATION")
        startActivityForResult(mpm.createScreenCaptureIntent(), REQUEST_CAPTURE)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_CAPTURE) return
        if (resultCode != RESULT_OK || data == null) {
            Toast.makeText(this, "Screen capture was not allowed", Toast.LENGTH_LONG).show()
            return
        }
        OverlayService.start(this, resultCode, data)
        Toast.makeText(this, "Overlay started – open the game", Toast.LENGTH_LONG).show()
        moveTaskToBack(true)
    }

    private fun text(s: String, size: Float, bold: Boolean = false) = TextView(this).apply {
        text = s
        textSize = size
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setPadding(0, (4 * density).toInt(), 0, (4 * density).toInt())
    }

    private fun header(s: String) = text(s, 17f, bold = true).apply {
        setPadding(0, (18 * density).toInt(), 0, (4 * density).toInt())
        setTextColor(Color.rgb(120, 200, 140))
    }

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setOnClickListener { onClick() }
    }

    private fun numberField(label: String, value: String, decimal: Boolean, onChange: (String) -> Unit): LinearLayout {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        box.addView(text(label, 13f))
        box.addView(EditText(this).apply {
            setText(value)
            inputType = InputType.TYPE_CLASS_NUMBER or (if (decimal) InputType.TYPE_NUMBER_FLAG_DECIMAL else 0)
            setOnFocusChangeListener { _, focused -> if (!focused) onChange(text.toString()) }
            addTextChangedListener(object : android.text.TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: android.text.Editable?) { onChange(s.toString()) }
            })
        })
        return box
    }

    companion object {
        private const val REQUEST_CAPTURE = 1
    }
}
