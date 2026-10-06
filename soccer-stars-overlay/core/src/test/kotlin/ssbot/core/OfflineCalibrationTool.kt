package ssbot.core

import nu.pattern.OpenCV
import org.opencv.imgcodecs.Imgcodecs
import ssbot.core.ai.Calibration
import ssbot.core.ai.ShotRecord
import ssbot.core.vision.Yolo
import java.io.File
import java.util.concurrent.Executors
import kotlin.random.Random
import kotlin.test.Test

/**
 * Dev tool: rebuild shots from a RunLogger folder and calibrate offline. Skipped unless SSBOT_RUN
 * (run folder) and SSBOT_SHOTS (lines "before.jpg aim-last.jpg after.jpg") are set.
 */
class OfflineCalibrationTool {
    @Test
    fun run() {
        val dir = System.getenv("SSBOT_RUN") ?: return
        val list = File(System.getenv("SSBOT_SHOTS")).readLines().map { it.split(' ') }
        OpenCV.loadLocally()
        val assets = File(System.getProperty("ssbot.assets"))
        val ball = Yolo(File(assets, "models/soccer_ball.onnx").readBytes())
        val arrow = Yolo(File(assets, "models/arrow.onnx").readBytes())
        val shots = ArrayList<ShotRecord>()
        for ((b, a, af) in list) {
            val g = GameAnalyzer(ball, arrow, Imgcodecs.imread(File(assets, "templates/player_goal.jpg").path), Imgcodecs.imread(File(assets, "templates/opponent_goal.jpg").path))
            g.robustPieces = true
            val bi = Imgcodecs.imread("$dir/$b"); val ai = Imgcodecs.imread("$dir/$a"); val fi = Imgcodecs.imread("$dir/$af")
            if (runCatching { g.initialize(bi) }.isFailure) { println("$b init fail"); continue }
            val before = g.detectState(g.normalize(bi)) ?: run { println("$b: no state"); null } ?: continue
            val r = g.readArrow(g.normalize(ai), before) ?: run { println("$a: no arrow"); null } ?: continue
            val after = g.detectState(g.normalize(fi)) ?: run { println("$af: no state"); null } ?: continue
            val (mine, idx) = g.shooterOf(before, r) ?: continue
            fun flip(x: GameState) = x.copy(players = x.opponents, opponents = x.players)
            // match team colours between before/after: after's split may differ if teams not locked; use colour of first piece
            val rec = if (mine) ShotRecord(before.ref, idx, r.angleDeg, r.force.toDouble(), after.ref)
                      else ShotRecord(flip(before.ref), idx, r.angleDeg, r.force.toDouble(), flip(after.ref))
            val e = Calibration.error(SimParameters.REPORT_3, rec)
            println("%s %s %s: %s angle=%.1f force=%d counts %d/%d -> %d/%d ball %s -> %s err ball=%.0f pieces=%.0f".format(b, a, af, if (mine) "you" else "opp",
                r.angleDeg, r.force, before.ref.players.size, before.ref.opponents.size, after.ref.players.size, after.ref.opponents.size,
                "(%.0f,%.0f)".format(before.ref.ball.x, before.ref.ball.y), "(%.0f,%.0f)".format(after.ref.ball.x, after.ref.ball.y), e.ball, e.pieces))
            shots.add(rec)
        }
        val pool = Executors.newFixedThreadPool(4)
        println("shots=${shots.size} mean ball error (bot physics) = %.1f".format(Calibration.meanBallError(SimParameters.REPORT_3, shots)))
        val fitted = Calibration.fit(shots, SimParameters.REPORT_3, pool, iterations = 80, population = 48, random = Random(3),
            onProgress = { i, e -> if (i % 10 == 0) println("  iter $i ball err %.1f".format(e)) })
        println("fitted=${fitted.toList()}")
        for ((i, s) in shots.withIndex()) println("  shot $i: err %.0f -> %.0f".format(Calibration.error(SimParameters.REPORT_3, s).ball, Calibration.error(fitted, s).ball))
        println("mean ball error fitted = %.1f".format(Calibration.meanBallError(fitted, shots)))
        pool.shutdown()
    }
}
