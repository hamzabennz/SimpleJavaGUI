package ssbot.core

import nu.pattern.OpenCV
import org.json.JSONObject
import org.opencv.core.Mat
import org.opencv.imgcodecs.Imgcodecs
import org.opencv.imgproc.Imgproc
import ssbot.core.vision.Yolo
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Runs the Kotlin pipeline on the bot's own screenshots and compares it with the original Python
 * pipeline's output (tools/reference_pipeline.py -> vision_reference.json).
 */
class VisionParityTest {
    companion object {
        init { OpenCV.loadLocally() }
        val fixtures = File(System.getProperty("ssbot.fixtures"))
        val assets = File(System.getProperty("ssbot.assets"))
        val ball by lazy { Yolo(File(assets, "models/soccer_ball.onnx").readBytes()) }
        val arrow by lazy { Yolo(File(assets, "models/arrow.onnx").readBytes()) }
        val reference by lazy { JSONObject(File(fixtures, "vision_reference.json").readText()) }
    }

    private fun load(name: String): Mat {
        val m = Imgcodecs.imread(File(fixtures, "screens/$name").path, Imgcodecs.IMREAD_UNCHANGED)
        if (m.channels() == 4) Imgproc.cvtColor(m, m, Imgproc.COLOR_BGRA2BGR)
        return m
    }

    private fun analyzer() = GameAnalyzer(
        ball, arrow,
        Imgcodecs.imread(File(assets, "templates/player_goal.jpg").path),
        Imgcodecs.imread(File(assets, "templates/opponent_goal.jpg").path),
    )

    @Test
    fun yoloMatchesTorchHub() {
        for (name in listOf("angle.png", "soccer_stars.png")) {
            val ref = reference.getJSONObject(name).getJSONArray("ballBox")
            val det = ball.detect(load(name)).maxBy { it.confidence }
            val got = listOf(det.x1, det.y1, det.x2, det.y2)
            println("$name ball: kotlin=$got python=$ref")
            for (i in 0 until 4) assertTrue(abs(got[i] - ref.getDouble(i)) < 0.5, "ball box coordinate $i")
        }
    }

    @Test
    fun referenceWindowMatchesPython() {
        val img = load("angle.png")
        val ref = reference.getJSONObject("angle.png")
        val a = analyzer()
        a.initialize(img)
        val pg = a.playground!!
        assertEquals(listOf(116.0, 142.0, 797.0, 461.0), listOf(pg.x, pg.y, pg.w, pg.h))
        val pgl = ref.getJSONArray("playerGoal")
        val ogl = ref.getJSONArray("opponentGoal")
        assertTrue(a.goalsFromTemplates)
        assertEquals(List(4) { pgl.getDouble(it) }, a.playerGoal!!.let { listOf(it.x, it.y, it.w, it.h) })
        assertEquals(List(4) { ogl.getDouble(it) }, a.opponentGoal!!.let { listOf(it.x, it.y, it.w, it.h) })
        assertEquals(ref.getBoolean("turn"), a.isPlayersTurn(img))

        val st = assertNotNull(a.detectState(img))
        println("players  kotlin=${st.screen.players} python=${ref.getJSONArray("players")}")
        println("opponents kotlin=${st.screen.opponents} python=${ref.getJSONArray("opponents")}")
        val rp = ref.getJSONArray("players")
        assertEquals(rp.length(), st.screen.players.size)
        for (i in 0 until rp.length()) {
            assertEquals(rp.getJSONArray(i).getDouble(0), st.screen.players[i].x)
            assertEquals(rp.getJSONArray(i).getDouble(1), st.screen.players[i].y)
        }
        assertEquals(ref.getJSONArray("opponents").length(), st.screen.opponents.size)

        val arrowRef = ref.getJSONObject("arrow")
        val reading = assertNotNull(a.readArrow(img))
        println("arrow kotlin=$reading python=$arrowRef")
        assertEquals(arrowRef.getDouble("angle"), reading.angleDeg, 1e-9)
        assertEquals(arrowRef.getDouble("length"), reading.length, 1e-9)
        assertEquals(arrowRef.getInt("force"), reading.force)

        val pred = a.predictArrow(st, reading)
        val refPred = ref.getJSONArray("prediction")
        val finals = listOf(pred.paths.ball.last()) + pred.paths.players.map { it.last() } + pred.paths.opponents.map { it.last() }
        val err = finals.indices.maxOf { hypot(finals[it].x - refPred.getJSONArray(it).getDouble(0), finals[it].y - refPred.getJSONArray(it).getDouble(1)) }
        println("prediction max error vs pymunk: $err px")
        assertTrue(err < 1e-3)
    }

    @Test
    fun fullHdScreenshotWorks() {
        val img = load("soccer_stars.png")
        val a = analyzer()
        a.initialize(img)
        println("1080p playground=${a.playground} goalsFromTemplates=${a.goalsFromTemplates} playerGoal=${a.playerGoal} opponentGoal=${a.opponentGoal}")
        assertTrue(a.isPlayersTurn(img))
        val st = assertNotNull(a.detectState(img))
        println("1080p players=${st.screen.players}\n      opponents=${st.screen.opponents}\n      ball=${st.screen.ball}")
        println("      ref players=${st.ref.players.map { "(%.0f, %.0f)".format(it.x, it.y) }}")
        assertEquals(5, st.screen.players.size)
        assertEquals(5, st.screen.opponents.size)

        val pool = Executors.newFixedThreadPool(4)
        val t0 = System.nanoTime()
        val s = a.chooseAction(st, pool, onIteration = { i, b -> if (i % 10 == 0) println("  iter $i best $b") })
        println("GA took %.1f s -> %s goal=%s drag %s -> %s".format((System.nanoTime() - t0) / 1e9, s.action, s.prediction.playerGoal, s.dragStart, s.dragEnd))
        pool.shutdown()
    }
}
