package ssbot.core

/** Axis-aligned rectangle (x, y, w, h), as used by the original bot for goals and the playground. */
data class Rect(val x: Double, val y: Double, val w: Double, val h: Double) {
    val cx get() = x + w / 2
    val cy get() = y + h / 2
}

data class Point(val x: Double, val y: Double)

/**
 * Port of the bot's `game_state` tuple:
 * (players_position, opponents_position, ball_position, player_goal, opponent_goal, playground)
 */
data class GameState(
    val players: List<Point>,
    val opponents: List<Point>,
    val ball: Point,
    val playerGoal: Rect,
    val opponentGoal: Rect,
    val playground: Rect,
)

/**
 * Physics parameters fitted by the bot's `simulate.py` (simulation/simulation_report_N.txt):
 * [player_radius, player_mass, player_elasticity, ball_radius, ball_mass, ball_elasticity,
 *  walls_thickness, walls_elasticity, max_force, force, angle]
 */
data class SimParameters(
    val playerRadius: Double,
    val playerMass: Double,
    val playerElasticity: Double,
    val ballRadius: Double,
    val ballMass: Double,
    val ballElasticity: Double,
    val wallsThickness: Double,
    val wallsElasticity: Double,
    val maxForce: Double,
) {
    companion object {
        /** `util.get_environment_parameters(3)` – the set main.py loads. */
        val REPORT_3 = SimParameters(
            23.713254694135834, 27.087892946690758, 0.6477491352956183,
            11.856627347067917, 12.463283589269098, 0.9031891633692508,
            2.59820555075832, 0.7839959399142863, 1600.5011199624246,
        )

        fun parse(values: List<Double>) = SimParameters(
            values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7], values[8],
        )
    }
}

/**
 * The bot ran on a 1071x621 BlueStacks window whose pitch was at (116, 142, 797, 461); its
 * physics parameters, goal templates, Hough limits and arrow force scale all assume that size.
 * Each phone frame is therefore scaled and shifted into that "reference window" before the
 * bot's pipeline runs on it: ref = screen * s + o. Results are mapped back for drawing/swiping.
 */
class RefFrame(val sx: Double, val sy: Double, val ox: Double, val oy: Double) {
    fun toRef(p: Point) = Point(p.x * sx + ox, p.y * sy + oy)
    fun toScreen(p: Point) = Point((p.x - ox) / sx, (p.y - oy) / sy)
    fun toScreen(r: Rect) = Rect((r.x - ox) / sx, (r.y - oy) / sy, r.w / sx, r.h / sy)
    fun vecToRef(dx: Double, dy: Double) = Point(dx * sx, dy * sy)
    fun vecToScreen(dx: Double, dy: Double) = Point(dx / sx, dy / sy)

    val isIdentity get() = sx == 1.0 && sy == 1.0 && ox == 0.0 && oy == 0.0

    companion object {
        val REFERENCE_PLAYGROUND = Rect(116.0, 142.0, 797.0, 461.0)
        const val WINDOW_W = 1071
        const val WINDOW_H = 621

        /**
         * Frame that puts [screenPlayground] onto the reference pitch. [scaledW]/[scaledH] are the
         * integer sizes the screen is resized to, so the scale is exact; the shift is rounded to
         * whole pixels so the resized image can be pasted without resampling again.
         */
        fun forPlayground(screenPlayground: Rect, screenW: Int, screenH: Int): RefFrame {
            val ref = REFERENCE_PLAYGROUND
            val scaledW = Math.round(screenW * ref.w / screenPlayground.w).toInt()
            val scaledH = Math.round(screenH * ref.h / screenPlayground.h).toInt()
            val sx = scaledW.toDouble() / screenW
            val sy = scaledH.toDouble() / screenH
            val ox = Math.round(ref.x - screenPlayground.x * sx).toDouble()
            val oy = Math.round(ref.y - screenPlayground.y * sy).toDouble()
            return RefFrame(sx, sy, ox, oy)
        }
    }
}
