package ssbot.core

import nu.pattern.OpenCV
import org.opencv.core.Mat
import org.opencv.imgcodecs.Imgcodecs
import org.opencv.imgproc.Imgproc
import ssbot.core.vision.Yolo
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Robust piece detection on real phone screenshots (2340x1080, overlay drawings included). */
class RobustDetectionTest {
    companion object {
        init { OpenCV.loadLocally() }
        val fixtures = File(System.getProperty("ssbot.fixtures"))
        val assets = File(System.getProperty("ssbot.assets"))
        val ball by lazy { Yolo(File(assets, "models/soccer_ball.onnx").readBytes()) }
        val arrow by lazy { Yolo(File(assets, "models/arrow.onnx").readBytes()) }
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
    ).also { it.robustPieces = true }

    @Test
    fun allPiecesAnySkin() {
        for (name in listOf("phone_orange_vs_blue.jpg", "phone_aiming.jpg", "soccer_stars.png", "angle.png")) {
            val img = load(name)
            val a = analyzer()
            a.initialize(img)
            val win = a.normalize(img)
            val st = assertNotNull(a.detectState(win), name)
            println("$name: ${st.ref.players.size} vs ${st.ref.opponents.size}; yours=${st.ref.players.map { "(%.0f,%.0f)".format(it.x, it.y) }} ball=(%.0f,%.0f)".format(st.ref.ball.x, st.ref.ball.y))
            assertEquals(5, st.ref.players.size, "$name: your pieces")
            assertEquals(5, st.ref.opponents.size, "$name: opponent pieces")
            // One colour per team.
            val pa = st.playerPieces.map { it.b }
            val oa = st.opponentPieces.map { it.b }
            assertTrue(pa.max() < oa.min() || oa.max() < pa.min(), "$name: teams separated by colour")
        }
    }

    @Test
    fun arrowWithPiecesMasked() {
        val img = load("phone_aiming.jpg")
        val a = analyzer()
        a.initialize(img)
        val win = a.normalize(img)
        var st = assertNotNull(a.detectState(win))
        val r = assertNotNull(a.readArrow(win, st))
        st = a.ownShot(st, r)
        val pred = a.predictArrow(st, r)
        val shooter = st.ref.players[pred.playerIndex]
        println("aiming: angle=%.1f force=%d tail=%s shooter=%s teamsConfirmed=%s".format(r.angleDeg, r.force, r.tail, shooter, a.teams.confirmed))
        assertTrue(r.angleDeg in 30.0..50.0, "arrow points up-right")
        assertTrue(r.force in 7000..10000, "plausible force")
        assertTrue(kotlin.math.hypot(shooter.x - r.tail.x, shooter.y - r.tail.y) < 40, "shooter under the arrow tail")
    }
}
