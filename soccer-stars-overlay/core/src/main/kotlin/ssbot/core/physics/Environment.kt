package ssbot.core.physics

import ssbot.core.GameState
import ssbot.core.Point
import ssbot.core.SimParameters
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** Port of the bot's `environment.py` (minus the pygame drawing). */
class Environment(val state: GameState, private val p: SimParameters) {
    val space = Space()
    val playersShapes = ArrayList<Circle>()
    val opponentShapes = ArrayList<Circle>()
    lateinit var ballShape: Circle
        private set

    private val playerGoalCriteria = state.opponentGoal.x
    private val opponentGoalCriteria = state.playerGoal.x + state.playerGoal.w

    /** `Environment.simulate()` – builds the space (ball, walls, teams in that order). */
    fun simulate(): Environment {
        space.damping = p.damping
        createSoccerBall()
        createWalls()
        createTeams()
        return this
    }

    private fun createWalls() {
        val pg = state.playground
        val pgl = state.playerGoal
        val og = state.opponentGoal
        val t = p.wallsThickness
        val sb = space.staticBody
        val lines = listOf(
            Segment(sb, pg.x, pg.y, pg.x + pg.w, pg.y, t), // 1
            Segment(sb, pg.x, pg.y + pg.h, pg.x + pg.w, pg.y + pg.h, t), // 2
            Segment(sb, pg.x, pg.y, pg.x, pgl.y, t), // 3
            Segment(sb, pg.x, pgl.y + pgl.h, pg.x, pg.y + pg.h, t), // 4
            Segment(sb, pg.x + pg.w, pg.y, pg.x + pg.w, og.y, t), // 5
            Segment(sb, pg.x + pg.w, pg.y + pg.h, pg.x + pg.w, og.y + og.h, t), // 6
            Segment(sb, pgl.x, pgl.y, pgl.x, pgl.y + pgl.h, t), // 7
            Segment(sb, og.x + og.w, og.y, og.x + og.w, og.y + og.h, t), // 8
            Segment(sb, pg.x, pgl.y, pgl.x, pgl.y, t), // 9
            Segment(sb, pgl.x, pgl.y + pgl.h, pg.x, pgl.y + pgl.h, t), // 10
            Segment(sb, og.x, og.y, og.x + og.w, og.y, t), // 11
            Segment(sb, og.x, og.y + og.h, og.x + og.w, og.y + og.h, t), // 12
        )
        for (line in lines) {
            line.elasticity = p.wallsElasticity
            space.addShape(line)
        }
    }

    private fun createSoccerBall() {
        val moment = Body.momentForCircle(p.ballMass, 0.0, p.ballRadius)
        val body = Body(p.ballMass, moment)
        val shape = Circle(body, p.ballRadius)
        shape.elasticity = p.ballElasticity
        body.px = state.ball.x
        body.py = state.ball.y
        val pivot = PivotJoint(space.staticBody, body)
        pivot.maxBias = 0.0
        pivot.maxForce = p.maxForce
        space.addBody(body); space.addShape(shape); space.addConstraint(pivot)
        ballShape = shape
    }

    private fun createSoccerPlayer(pos: Point): Circle {
        val moment = Body.momentForCircle(p.playerMass, 0.0, p.playerRadius)
        val body = Body(p.playerMass, moment)
        val shape = Circle(body, p.playerRadius)
        shape.elasticity = p.playerElasticity
        body.px = pos.x
        body.py = pos.y
        val pivot = PivotJoint(space.staticBody, body)
        pivot.maxBias = 0.0
        pivot.maxForce = p.maxForce
        space.addBody(body); space.addShape(shape); space.addConstraint(pivot)
        return shape
    }

    private fun createTeams() {
        for (pos in state.players) playersShapes.add(createSoccerPlayer(pos))
        for (pos in state.opponents) opponentShapes.add(createSoccerPlayer(pos))
    }

    /** `check_player_goal_scored` – ball inside the opponent's goal rectangle. */
    fun checkPlayerGoalScored(): Boolean {
        val bx = ballShape.body.px
        val by = ballShape.body.py
        val g = state.opponentGoal
        return g.x <= bx && bx <= g.x + g.w && g.y <= by && by <= g.y + g.h
    }

    /** `check_opponent_goal_scored` – ball x left of our goal line. */
    fun checkOpponentGoalScored(): Boolean = ballShape.body.px <= opponentGoalCriteria

    fun findClosestShape(point: Point): Int {
        var best = -1
        var min = Double.POSITIVE_INFINITY
        for ((i, s) in playersShapes.withIndex()) {
            val d = sqrt((s.body.px - point.x).let { it * it } + (s.body.py - point.y).let { it * it })
            if (d < min) { min = d; best = i }
        }
        return best
    }

    /**
     * Steps the space, optionally recording every body's path (ball first, then players, then
     * opponents). With [untilRest] it stops early once everything has stopped (checked every 10
     * steps), otherwise it runs exactly [steps] steps like the bot (500 x 1/120 s).
     */
    fun run(steps: Int = 500, dt: Double = 1.0 / 120, record: Int = 0, untilRest: Boolean = false): Trajectories? {
        val shapes = listOf(ballShape) + playersShapes + opponentShapes
        val paths = if (record > 0) shapes.map { mutableListOf(Point(it.body.px, it.body.py)) } else null
        for (i in 1..steps) {
            space.step(dt)
            val last = i == steps || (untilRest && i % 10 == 0 && space.isAtRest())
            if (paths != null && (i % record == 0 || last)) {
                shapes.forEachIndexed { k, s -> paths[k].add(Point(s.body.px, s.body.py)) }
            }
            if (last) break
        }
        return paths?.let { Trajectories(it[0], it.subList(1, 1 + playersShapes.size), it.subList(1 + playersShapes.size, it.size)) }
    }

    /** Shot with the bot's force units, scaled by the calibrated [SimParameters.forceScale]. */
    fun shootScaled(shape: Circle, angleDeg: Double, force: Double) = shoot(shape, angleDeg, force * p.forceScale)

    fun positions(): Triple<Point, List<Point>, List<Point>> = Triple(
        ballPosition(),
        playersShapes.map { Point(it.body.px, it.body.py) },
        opponentShapes.map { Point(it.body.px, it.body.py) },
    )

    fun ballPosition() = Point(ballShape.body.px, ballShape.body.py)

    companion object {
        /** `Environment.shoot` – impulse (force*cos, -force*sin) at the piece centre. */
        fun shoot(shape: Circle, angleDeg: Double, force: Double) {
            val xi = cos(Math.toRadians(angleDeg))
            val yi = sin(Math.toRadians(angleDeg))
            shape.body.applyImpulseAtCenter(force * xi, force * -yi)
        }
    }
}

data class Trajectories(val ball: List<Point>, val players: List<List<Point>>, val opponents: List<List<Point>>)
