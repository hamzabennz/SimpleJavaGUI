package ssbot.core.vision

import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Scalar
import org.opencv.imgproc.Imgproc
import ssbot.core.Point
import ssbot.core.Rect
import kotlin.math.hypot
import org.opencv.core.Rect as CvRect

/** A detected piece on the reference window: centre, radius and mean Lab colour of its face. */
data class Piece(val center: Point, val radius: Double, val l: Double, val a: Double, val b: Double)

/**
 * Finds every piece on the pitch, whatever the team skin.
 *
 * The bot instead cropped "the strongest circle in each half" at start-up and template-matched it,
 * which breaks with team skins, glow rings, or when pieces are not in their own half. Here every
 * piece face is found as a circle of the right size (r 17-28 on the reference window) whose inside
 * is not pitch-green and not dark; the teams are then told apart by colour ([Teams]).
 */
object PieceDetector {
    fun detect(win: Mat, playground: Rect, maxPieces: Int = 10): List<Piece> {
        val m = 6
        val box = Vision.clip(
            CvRect(playground.x.toInt() - m, playground.y.toInt() - m, playground.w.toInt() + 2 * m, playground.h.toInt() + 2 * m),
            win.cols(), win.rows(),
        ) ?: return emptyList()
        val roi = win.submat(box)
        val gray = Mat()
        Imgproc.cvtColor(roi, gray, Imgproc.COLOR_BGR2GRAY)
        Imgproc.medianBlur(gray, gray, 5)
        val circles = Mat()
        Imgproc.HoughCircles(gray, circles, Imgproc.HOUGH_GRADIENT, 1.0, 30.0, 60.0, 20.0, 17, 28)
        gray.release()
        if (circles.empty()) return emptyList()

        val hsv = Mat()
        Imgproc.cvtColor(roi, hsv, Imgproc.COLOR_BGR2HSV)
        val green = Mat()
        Core.inRange(hsv, Scalar(35.0, 50.0, 50.0), Scalar(85.0, 255.0, 255.0), green)
        hsv.release()
        val lab = Mat()
        Imgproc.cvtColor(roi, lab, Imgproc.COLOR_BGR2Lab)

        val out = ArrayList<Pair<Piece, Double>>()
        val mask = Mat.zeros(roi.rows(), roi.cols(), CvType.CV_8U)
        val notGreen = Mat()
        for (i in 0 until circles.cols()) {
            val c = circles.get(0, i)
            val cx = c[0]
            val cy = c[1]
            val r = c[2]
            mask.setTo(Scalar(0.0))
            Imgproc.circle(mask, org.opencv.core.Point(cx, cy), (r * 0.8).toInt(), Scalar(255.0), -1)
            val n = Core.countNonZero(mask)
            if (n == 0) continue
            Core.bitwise_not(green, notGreen)
            Core.bitwise_and(notGreen, mask, notGreen)
            val ng = Core.countNonZero(notGreen).toDouble() / n
            if (ng < 0.75) continue
            val mean = Core.mean(lab, mask).`val`
            if (mean[0] < 110) continue // dark: overlay panel or shadows, not a piece face
            out.add(Piece(Point(cx + box.x, cy + box.y), r, mean[0], mean[1], mean[2]) to ng)
        }
        mask.release(); notGreen.release(); green.release(); lab.release(); circles.release()
        // Hough already suppresses circles closer than 30 px; keep the most piece-like ones.
        return out.sortedByDescending { it.second }.take(maxPieces).map { it.first }
            .sortedWith(compareBy({ it.center.x }, { it.center.y }))
    }
}

/**
 * Tells the two teams apart by face colour and remembers which one is yours.
 *
 * Before you have aimed, your team is guessed as the one further left (your half at kick-off);
 * once you aim, the piece under the arrow is yours and the colours are fixed from then on.
 */
class Teams {
    private var mine: DoubleArray? = null
    private var theirs: DoubleArray? = null
    var confirmed = false
        private set

    fun reset() {
        mine = null; theirs = null; confirmed = false
    }

    /** Splits [pieces] into (yours, opponent's). */
    fun split(pieces: List<Piece>): Pair<List<Piece>, List<Piece>> {
        if (pieces.isEmpty()) return emptyList<Piece>() to emptyList()
        val m = mine
        val t = theirs
        if (m != null && t != null) {
            val (a, b) = pieces.partition { dist(it, m) <= dist(it, t) }
            if (!confirmed) {
                // Keep refining the guess while it is only a guess.
                if (a.isNotEmpty()) mine = mean(a)
                if (b.isNotEmpty()) theirs = mean(b)
            }
            return a to b
        }
        val (c1, c2) = kMeans(pieces)
        if (c2.isEmpty()) return c1 to c2
        val left = if (c1.map { it.center.x }.average() <= c2.map { it.center.x }.average()) c1 else c2
        val right = if (left === c1) c2 else c1
        mine = mean(left)
        theirs = mean(right)
        return left to right
    }

    /** You aimed with [piece]: make sure its colour is "yours". Returns true if the teams were swapped. */
    fun confirmMine(piece: Piece): Boolean {
        val m = mine ?: return false
        val t = theirs ?: return false
        confirmed = true
        if (dist(piece, t) < dist(piece, m)) {
            mine = t; theirs = m
            return true
        }
        return false
    }

    private fun kMeans(pieces: List<Piece>): Pair<List<Piece>, List<Piece>> {
        // Seed with the two pieces furthest apart in colour.
        var s1 = pieces[0]
        var s2 = pieces[0]
        var best = -1.0
        for (p in pieces) for (q in pieces) {
            val d = hypot(p.a - q.a, p.b - q.b)
            if (d > best) { best = d; s1 = p; s2 = q }
        }
        if (best < 12) return pieces to emptyList() // one colour only
        var c1 = doubleArrayOf(s1.a, s1.b)
        var c2 = doubleArrayOf(s2.a, s2.b)
        var g1 = listOf<Piece>()
        var g2 = listOf<Piece>()
        repeat(10) {
            val (a, b) = pieces.partition { dist(it, c1) <= dist(it, c2) }
            g1 = a; g2 = b
            if (a.isNotEmpty()) c1 = mean(a)
            if (b.isNotEmpty()) c2 = mean(b)
        }
        return g1 to g2
    }

    private fun mean(l: List<Piece>) = doubleArrayOf(l.sumOf { it.a } / l.size, l.sumOf { it.b } / l.size)
    private fun dist(p: Piece, c: DoubleArray) = hypot(p.a - c[0], p.b - c[1])
}
