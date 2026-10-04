package ssbot.core.vision

import org.opencv.core.Core
import org.opencv.core.Mat
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import ssbot.core.Point
import ssbot.core.Rect
import ssbot.core.TurnState
import kotlin.math.roundToInt
import org.opencv.core.Rect as CvRect

/**
 * Keeps the detected board in sync with the game without relying on the turn indicator:
 *
 *  - [settle] reports when the pitch has stopped changing (pieces finished moving), which is
 *    when the board should be (re)detected;
 *  - [moved] reports when a piece or the ball has left the spot it was detected at, which
 *    makes the current detection stale.
 *
 * Works on the reference window (see GameAnalyzer.normalize).
 */
class BoardWatcher(
    private val stillThreshold: Double = 2.5,
    private val patchThreshold: Double = 28.0,
) {
    private var prevSig: Mat? = null
    var stillFrames = 0
        private set
    private var patches: List<Pair<CvRect, Mat>> = emptyList()

    /** Updates the "pitch is still" counter with a new window frame and returns the motion value. */
    fun settle(win: Mat, playground: Rect): Double {
        val box = Vision.clip(
            CvRect(playground.x.toInt(), playground.y.toInt(), playground.w.toInt(), playground.h.toInt()),
            win.cols(), win.rows(),
        ) ?: return Double.MAX_VALUE
        val gray = Mat()
        Imgproc.cvtColor(win.submat(box), gray, Imgproc.COLOR_BGR2GRAY)
        val sig = Mat()
        Imgproc.resize(gray, sig, Size(120.0, 70.0), 0.0, 0.0, Imgproc.INTER_AREA)
        gray.release()
        val prev = prevSig
        val motion = if (prev == null) Double.MAX_VALUE else {
            val d = Mat()
            Core.absdiff(prev, sig, d)
            Core.mean(d).`val`[0].also { d.release() }
        }
        prev?.release()
        prevSig = sig
        stillFrames = if (motion < stillThreshold) stillFrames + 1 else 0
        return motion
    }

    /** Remembers the centre of every detected piece and the ball. */
    fun capture(win: Mat, state: TurnState) {
        release()
        // Colour patches: a blue piece and the grass have almost the same grey level.
        patches = (state.ref.players + state.ref.opponents).map { patchAt(win, it, 8) } +
            listOf(patchAt(win, state.ref.ball, 5))
    }

    private fun patchAt(img: Mat, p: Point, half: Int): Pair<CvRect, Mat> {
        val r = Vision.clip(CvRect(p.x.roundToInt() - half, p.y.roundToInt() - half, 2 * half, 2 * half), img.cols(), img.rows())
            ?: CvRect(0, 0, 1, 1)
        return r to img.submat(r).clone()
    }

    /** True when any remembered patch (outside [exclude]) changed: the board is no longer as detected. */
    fun moved(win: Mat, exclude: CvRect?): Boolean {
        if (patches.isEmpty()) return false
        val d = Mat()
        var changed = false
        for ((r, ref) in patches) {
            if (exclude != null && intersects(r, exclude)) continue
            Core.absdiff(win.submat(r), ref, d)
            if (medianDiff(d) > patchThreshold) { changed = true; break }
        }
        d.release()
        return changed
    }

    /**
     * Median over the patch of the per-pixel colour difference. A piece or ball leaving changes
     * every pixel; a thin line drawn by the overlay changes only a few, so it is ignored.
     */
    private fun medianDiff(d: Mat): Double {
        val n = d.rows() * d.cols()
        val bytes = ByteArray(n * 3)
        d.get(0, 0, bytes)
        val v = IntArray(n) { ((bytes[3 * it].toInt() and 0xFF) + (bytes[3 * it + 1].toInt() and 0xFF) + (bytes[3 * it + 2].toInt() and 0xFF)) / 3 }
        v.sort()
        return v[n / 2].toDouble()
    }

    fun reset() {
        stillFrames = 0
        prevSig?.release()
        prevSig = null
        release()
    }

    private fun release() {
        patches.forEach { it.second.release() }
        patches = emptyList()
    }

    private fun intersects(a: CvRect, b: CvRect) =
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}
