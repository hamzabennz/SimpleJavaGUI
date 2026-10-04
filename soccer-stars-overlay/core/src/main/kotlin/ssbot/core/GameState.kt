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
 * The bot's physics parameters were fitted on a 1071x621 BlueStacks window whose
 * playground was (116, 142, 797, 461). To keep the simulation identical on any
 * screen, detected positions are mapped into that reference frame before simulating
 * and mapped back for drawing / gestures.
 */
class RefFrame(val screenPlayground: Rect, val refPlayground: Rect = REFERENCE_PLAYGROUND) {
    val sx = refPlayground.w / screenPlayground.w
    val sy = refPlayground.h / screenPlayground.h

    fun toRef(p: Point) = Point(refPlayground.x + (p.x - screenPlayground.x) * sx, refPlayground.y + (p.y - screenPlayground.y) * sy)
    fun toRef(r: Rect) = Rect(refPlayground.x + (r.x - screenPlayground.x) * sx, refPlayground.y + (r.y - screenPlayground.y) * sy, r.w * sx, r.h * sy)
    fun toScreen(p: Point) = Point(screenPlayground.x + (p.x - refPlayground.x) / sx, screenPlayground.y + (p.y - refPlayground.y) / sy)
    fun vecToRef(dx: Double, dy: Double) = Point(dx * sx, dy * sy)
    fun vecToScreen(dx: Double, dy: Double) = Point(dx / sx, dy / sy)

    /** Average screen-pixels-per-reference-pixel, for radii. */
    val screenPerRef get() = 2.0 / (sx + sy)

    fun toRef(state: GameState) = GameState(
        state.players.map(::toRef), state.opponents.map(::toRef), toRef(state.ball),
        toRef(state.playerGoal), toRef(state.opponentGoal), refPlayground,
    )

    companion object {
        val REFERENCE_PLAYGROUND = Rect(116.0, 142.0, 797.0, 461.0)
    }
}
