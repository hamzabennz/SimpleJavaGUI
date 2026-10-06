package ssbot.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class AimGuideTest {
    private val pg = Rect(116.0, 142.0, 797.0, 461.0)
    private fun state(players: List<Point>, opp: List<Point>, ball: Point) =
        GameState(players, opp, ball, Rect(58.0, 283.0, 60.0, 171.0), Rect(913.0, 285.0, 57.0, 167.0), pg)

    @Test
    fun straightHitSendsBallIntoGoal() {
        val s = state(listOf(Point(200.0, 370.0)), emptyList(), Point(500.0, 370.0))
        val g = AimGuideCalc.compute(s, Point(200.0, 370.0), 0.0, 23.7, 11.9)
        val c = assertNotNull(g.contact)
        assertTrue(g.hitIsBall)
        assertEquals(500.0 - 35.6, c.x, 0.5)
        assertEquals(370.0, c.y, 1e-6)
        assertTrue(g.ballToRightGoal, "ball heads straight into the right goal")
    }

    @Test
    fun glancingHitKnocksBallAlongLineOfCentres() {
        val s = state(listOf(Point(200.0, 370.0)), emptyList(), Point(500.0, 350.0))
        val g = AimGuideCalc.compute(s, Point(200.0, 370.0), 0.0, 23.7, 11.9)
        val c = assertNotNull(g.contact)
        val dir = g.hitPath[1].let { Point(it.x - 500.0, it.y - 350.0) }
        // Normal from contact point to ball centre.
        val nx = 500.0 - c.x
        val ny = 350.0 - c.y
        assertTrue(abs(dir.x * ny - dir.y * nx) / kotlin.math.hypot(dir.x, dir.y) < 1e-6 * kotlin.math.hypot(nx, ny) + 1e-6)
        assertTrue(dir.y < 0, "ball goes up-right")
    }

    @Test
    fun bouncesOffWallBeforeHitting() {
        // Aim up at 45 deg, bounce off the top wall, then hit a piece.
        val s = state(listOf(Point(200.0, 300.0)), listOf(Point(500.0, 330.0)), Point(800.0, 550.0))
        val g = AimGuideCalc.compute(s, Point(200.0, 300.0), 45.0, 23.7, 11.9)
        assertTrue(g.shooterPath.size >= 3, "path has a wall bounce")
        assertEquals(142.0 + 23.7, g.shooterPath[1].y, 0.5)
    }
}
