package ssbot.core

import nu.pattern.OpenCV
import org.opencv.imgcodecs.Imgcodecs
import ssbot.core.vision.Yolo
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Frames from a real run on the user's phone (reference-window images saved by RunLogger,
 * overlay drawings included). Expected angles measured by hand from the arrow in each frame.
 */
class RunReplayTest {
    companion object {
        init { OpenCV.loadLocally() }
        val fixtures = File(System.getProperty("ssbot.fixtures"))
        val assets = File(System.getProperty("ssbot.assets"))
        val ball by lazy { Yolo(File(assets, "models/soccer_ball.onnx").readBytes()) }
        val arrow by lazy { Yolo(File(assets, "models/arrow.onnx").readBytes()) }
    }

    private fun analyzer() = GameAnalyzer(
        ball, arrow,
        Imgcodecs.imread(File(assets, "templates/player_goal.jpg").path),
        Imgcodecs.imread(File(assets, "templates/opponent_goal.jpg").path),
    ).also { it.robustPieces = true }

    private fun check(name: String, expectedAngle: Double, expectMine: Boolean) {
        val img = Imgcodecs.imread(File(fixtures, "run1/$name").path)
        val a = analyzer()
        a.initialize(img)
        val win = a.normalize(img)
        val st = assertNotNull(a.detectState(win), name)
        val r = assertNotNull(a.readArrow(win, st), "$name arrow")
        val (mine, idx) = assertNotNull(a.shooterOf(st, r))
        val pred = a.predictArrow(st, r)
        println("$name: ${st.ref.players.size} vs ${st.ref.opponents.size} angle=%.1f (expected %.0f) force=%d shooter=%s mine=$mine predicted ball end=%s".format(
            r.angleDeg, expectedAngle, r.force, r.shooter, pred.paths.ball.last()))
        var diff = kotlin.math.abs(r.angleDeg - expectedAngle) % 360
        if (diff > 180) diff = 360 - diff
        assertTrue(diff < 3.0, "$name: angle within 3 degrees")
        assertEquals(expectMine, mine, "$name: whose piece")
        assertTrue(r.force in 3000..11000, "$name: plausible force")
    }

    @Test fun yourShotUpRight() = check("0017-aim-start.jpg", 59.0, true)
    @Test fun opponentShotLeft() = check("0036-aim-start.jpg", 180.0, false)
}
