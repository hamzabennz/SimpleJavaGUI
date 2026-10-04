package ssbot.core

import ssbot.core.ai.Calibration
import ssbot.core.ai.MAX_STEPS
import ssbot.core.ai.ShotRecord
import ssbot.core.physics.Environment
import java.util.concurrent.Executors
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Shots generated with known "true" physics must pull the fitted parameters towards them. */
class CalibrationTest {
    private val start = GameState(
        listOf(Point(267.0, 243.0), Point(422.0, 318.0), Point(147.0, 363.0), Point(421.0, 411.0), Point(269.0, 487.0)),
        listOf(Point(792.0, 240.0), Point(606.0, 363.0), Point(884.0, 363.0), Point(699.0, 365.0), Point(790.0, 487.0)),
        Point(512.4, 368.6),
        Rect(58.0, 259.0, 60.0, 201.0), Rect(917.0, 258.0, 48.0, 200.0), Rect(116.0, 142.0, 797.0, 461.0),
    )

    private fun shot(truth: SimParameters, piece: Int, angle: Double, force: Double): ShotRecord {
        val env = Environment(start, truth).simulate()
        env.shootScaled(env.playersShapes[piece], angle, force)
        env.run(MAX_STEPS, 1.0 / 120, untilRest = true)
        val (b, p, o) = env.positions()
        return ShotRecord(start, piece, angle, force, start.copy(players = p, opponents = o, ball = b))
    }

    @Test
    fun recordRoundTrip() {
        val s = shot(SimParameters.REPORT_3, 1, 10.0, 5000.0)
        val d = ShotRecord.decode(s.encode())!!
        assertEquals(s, d)
    }

    @Test
    fun fitReducesError() {
        val truth = SimParameters.REPORT_3.copy(maxForce = 700.0, damping = 0.55, forceScale = 0.6, ballElasticity = 0.7, wallsElasticity = 0.5)
        val rnd = Random(7)
        val shots = List(8) {
            val piece = rnd.nextInt(5)
            val target = start.ball
            val from = start.players[piece]
            val angle = -Math.toDegrees(kotlin.math.atan2(target.y - from.y, target.x - from.x)) + rnd.nextDouble(-15.0, 15.0)
            shot(truth, piece, (angle + 360) % 360, rnd.nextDouble(3000.0, 9500.0))
        }
        val before = Calibration.meanBallError(SimParameters.REPORT_3, shots)
        val pool = Executors.newFixedThreadPool(4)
        val t0 = System.nanoTime()
        val fitted = Calibration.fit(shots, SimParameters.REPORT_3, pool, random = Random(1))
        pool.shutdown()
        val after = Calibration.meanBallError(fitted, shots)
        println("calibration: mean ball error %.1f px -> %.1f px in %.1f s; fitted=%s".format(before, after, (System.nanoTime() - t0) / 1e9, fitted))
        assertTrue(after < before * 0.4, "fit should reduce the error a lot")
    }
}
