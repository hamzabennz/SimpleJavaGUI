package ssbot.app

import android.content.Context

enum class Mode(val label: String) {
    /** What the bot's main.py does: read the arrow you are aiming and show where the shot goes. */
    PREDICT("Predict my aim"),

    /** The (commented-out) ChooseAction search: compute and draw the best shot. */
    SUGGEST("Suggest best shot"),

    /** Suggest + perform_drag_action: play the best shot with a swipe. */
    AUTO("Auto-play best shot"),
}

class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    var mode: Mode
        get() = runCatching { Mode.valueOf(prefs.getString("mode", Mode.PREDICT.name)!!) }.getOrDefault(Mode.PREDICT)
        set(v) = prefs.edit().putString("mode", v.name).apply()

    /** Multiplies the bot's drag length (force / 60 reference pixels). */
    var dragScale: Float
        get() = prefs.getFloat("dragScale", 1f)
        set(v) = prefs.edit().putFloat("dragScale", v).apply()

    var gaIterations: Int
        get() = prefs.getInt("gaIterations", 50)
        set(v) = prefs.edit().putInt("gaIterations", v).apply()

    var gaPopulation: Int
        get() = prefs.getInt("gaPopulation", 50)
        set(v) = prefs.edit().putInt("gaPopulation", v).apply()

    /** Auto mode only shoots when the bot's white-pixel turn check says it is your turn. */
    var useTurnCheck: Boolean
        get() = prefs.getBoolean("useTurnCheck", true)
        set(v) = prefs.edit().putBoolean("useTurnCheck", v).apply()

    var showDetections: Boolean
        get() = prefs.getBoolean("showDetections", true)
        set(v) = prefs.edit().putBoolean("showDetections", v).apply()
}
