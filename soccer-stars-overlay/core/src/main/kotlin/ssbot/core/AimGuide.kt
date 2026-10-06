package ssbot.core

import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * The geometric part of a shot, which does not depend on any physics constant:
 * the line the aimed piece travels (with wall bounces), the first piece or ball it touches, and
 * the direction that object is knocked (along the line through both centres at contact).
 * Unlike the full simulation this stays exact however many collisions follow later.
 *
 * All coordinates are reference-window pixels.
 */
data class AimGuide(
    /** Path of the aimed piece's centre: start, wall bounce points, and the end (contact or limit). */
    val shooterPath: List<Point>,
    /** Where the aimed piece's centre is when it touches [hitCenter] (null: nothing hit). */
    val contact: Point?,
    val hitCenter: Point?,
    val hitIsBall: Boolean,
    /** Line the hit object starts moving along (from its centre), with wall bounces. */
    val hitPath: List<Point>,
    /** The hit ball heads into the opponent's goal (right) / your goal (left) along [hitPath]. */
    val ballToRightGoal: Boolean,
    val ballToLeftGoal: Boolean,
)

object AimGuideCalc {
    /**
     * [angleDeg]: shot direction as used by the physics (0 = right, 90 = up on screen).
     * [maxLength]: how far to follow the aimed piece (reference px).
     */
    fun compute(
        state: GameState,
        shooter: Point,
        angleDeg: Double,
        pieceRadius: Double,
        ballRadius: Double,
        maxLength: Double = 900.0,
    ): AimGuide {
        val rad = Math.toRadians(angleDeg)
        var dx = cos(rad)
        var dy = -sin(rad)
        val pg = state.playground
        val obstacles = (state.players + state.opponents)
            .filter { hypot(it.x - shooter.x, it.y - shooter.y) > 1.0 }
            .map { it to false } + listOf(state.ball to true)

        val path = mutableListOf(shooter)
        var pos = shooter
        var left = maxLength
        repeat(4) {
            // First obstacle along the current segment.
            var bestT = Double.POSITIVE_INFINITY
            var best: Pair<Point, Boolean>? = null
            for (o in obstacles) {
                val r = pieceRadius + if (o.second) ballRadius else pieceRadius
                val t = rayCircle(pos, dx, dy, o.first, r) ?: continue
                if (t < bestT) { bestT = t; best = o }
            }
            val (tWall, nx, ny) = rayBox(pos, dx, dy, pg, pieceRadius)
            if (best != null && bestT <= tWall && bestT <= left) {
                val contact = Point(pos.x + dx * bestT, pos.y + dy * bestT)
                path.add(contact)
                val c = best.first
                val isBall = best.second
                val hx = c.x - contact.x
                val hy = c.y - contact.y
                val hl = hypot(hx, hy)
                val hitPath = followLine(c, hx / hl, hy / hl, pg, if (isBall) ballRadius else pieceRadius, 900.0)
                val (toRight, toLeft) = if (isBall) goalCheck(hitPath, state) else false to false
                return AimGuide(path, contact, c, isBall, hitPath, toRight, toLeft)
            }
            if (tWall > left) {
                path.add(Point(pos.x + dx * left, pos.y + dy * left))
                return AimGuide(path, null, null, false, emptyList(), false, false)
            }
            pos = Point(pos.x + dx * tWall, pos.y + dy * tWall)
            path.add(pos)
            left -= tWall
            // Reflect off the wall.
            val dot = dx * nx + dy * ny
            dx -= 2 * dot * nx
            dy -= 2 * dot * ny
        }
        return AimGuide(path, null, null, false, emptyList(), false, false)
    }

    /** Straight line with up to 2 wall bounces, [length] long in total. */
    private fun followLine(start: Point, dx0: Double, dy0: Double, pg: Rect, radius: Double, length: Double): List<Point> {
        val out = mutableListOf(start)
        var pos = start
        var dx = dx0
        var dy = dy0
        var left = length
        repeat(3) {
            val (t, nx, ny) = rayBox(pos, dx, dy, pg, radius)
            if (t >= left) {
                out.add(Point(pos.x + dx * left, pos.y + dy * left))
                return out
            }
            pos = Point(pos.x + dx * t, pos.y + dy * t)
            out.add(pos)
            left -= t
            val dot = dx * nx + dy * ny
            dx -= 2 * dot * nx
            dy -= 2 * dot * ny
        }
        return out
    }

    /** Does the first leg of the ball's line end on the left/right wall inside a goal mouth? */
    private fun goalCheck(path: List<Point>, s: GameState): Pair<Boolean, Boolean> {
        if (path.size < 2) return false to false
        val a = path[0]
        val b = path[1]
        if (b.x == a.x) return false to false
        val pg = s.playground
        fun yAt(x: Double) = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x)
        val right = b.x > a.x && b.x >= pg.x + pg.w - 20 && yAt(pg.x + pg.w).let { it > s.opponentGoal.y && it < s.opponentGoal.y + s.opponentGoal.h }
        val left = b.x < a.x && b.x <= pg.x + 20 && yAt(pg.x).let { it > s.playerGoal.y && it < s.playerGoal.y + s.playerGoal.h }
        return right to left
    }

    /** Distance along (dx,dy) from p until it is [r] from c, or null. */
    private fun rayCircle(p: Point, dx: Double, dy: Double, c: Point, r: Double): Double? {
        val fx = p.x - c.x
        val fy = p.y - c.y
        val b = fx * dx + fy * dy
        val cc = fx * fx + fy * fy - r * r
        val disc = b * b - cc
        if (disc < 0) return null
        val t = -b - sqrt(disc)
        return if (t > 0.5) t else null
    }

    /** Distance to the pitch boundary (shrunk by [r]) and the wall normal. */
    private fun rayBox(p: Point, dx: Double, dy: Double, pg: Rect, r: Double): Triple<Double, Double, Double> {
        var best = Double.POSITIVE_INFINITY
        var nx = 0.0
        var ny = 0.0
        if (dx > 1e-9) { val t = (pg.x + pg.w - r - p.x) / dx; if (t < best) { best = t; nx = -1.0; ny = 0.0 } }
        if (dx < -1e-9) { val t = (pg.x + r - p.x) / dx; if (t < best) { best = t; nx = 1.0; ny = 0.0 } }
        if (dy > 1e-9) { val t = (pg.y + pg.h - r - p.y) / dy; if (t < best) { best = t; nx = 0.0; ny = -1.0 } }
        if (dy < -1e-9) { val t = (pg.y + r - p.y) / dy; if (t < best) { best = t; nx = 0.0; ny = 1.0 } }
        return Triple(maxOf(0.0, best), nx, ny)
    }
}
