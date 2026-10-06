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
 * You always play from the left. The first time the board looks like a kick-off (one colour
 * entirely in the left half, the other entirely in the right half) the left colour is locked in as
 * yours. Until then the team further left is assumed to be yours. Aiming does not change it:
 * the game shows the opponent's aiming arrow too.
 */
class Teams {
    private var mine: DoubleArray? = null
    private var theirs: DoubleArray? = null
    var confirmed = false
        private set

    fun reset() {
        mine = null; theirs = null; confirmed = false
    }

    /** Splits [pieces] into (yours, opponent's); [midX] is the x of the halfway line. */
    fun split(pieces: List<Piece>, midX: Double): Pair<List<Piece>, List<Piece>> {
        if (pieces.isEmpty()) return emptyList<Piece>() to emptyList()
        val (c1, c2) = kMeans(pieces)
        if (c2.isEmpty()) {
            // One colour visible only: assign by the remembered colours if we have them.
            val m = mine ?: return c1 to c2
            val t = theirs ?: return c1 to c2
            return pieces.partition { dist(it, m) <= dist(it, t) }
        }
        val left = if (c1.map { it.center.x }.average() <= c2.map { it.center.x }.average()) c1 else c2
        val right = if (left === c1) c2 else c1
        if (!confirmed && left.size >= 4 && right.size >= 4 && left.all { it.center.x < midX } && right.all { it.center.x > midX }) {
            mine = mean(left); theirs = mean(right); confirmed = true
        }
        val m = mine
        val t = theirs
        if (confirmed && m != null && t != null) {
            // Locked colours decide; k-means only separated the two groups.
            val c1Mine = dist(mean(c1), m) + dist(mean(c2), t) <= dist(mean(c1), t) + dist(mean(c2), m)
            return if (c1Mine) c1 to c2 else c2 to c1
        }
        mine = mean(left); theirs = mean(right)
        return left to right
    }

    /**
     * Splits the pieces into two colour groups of at most 5 each (a team has 5 pieces), trying
     * every such split and keeping the one with the smallest within-group colour spread. This
     * separates close skins (orange vs dark red) that a plain 2-means split mixes up.
     */
    private fun kMeans(pieces: List<Piece>): Pair<List<Piece>, List<Piece>> {
        val n = pieces.size
        var spread = 0.0
        for (p in pieces) for (q in pieces) spread = maxOf(spread, hypot(p.a - q.a, p.b - q.b))
        if (spread < 12) return pieces to emptyList() // one colour only
        val lo = maxOf(1, n - 5)
        val hi = minOf(5, n - 1)
        if (n > 12 || lo > hi) return twoMeans(pieces)
        var bestCost = Double.POSITIVE_INFINITY
        var bestMask = 0
        for (mask in 1 until (1 shl n) - 1) {
            val k = Integer.bitCount(mask)
            if (k < lo || k > hi) continue
            val cost = sse(pieces.filterIndexed { i, _ -> mask and (1 shl i) != 0 }) +
                sse(pieces.filterIndexed { i, _ -> mask and (1 shl i) == 0 })
            if (cost < bestCost) { bestCost = cost; bestMask = mask }
        }
        return pieces.filterIndexed { i, _ -> bestMask and (1 shl i) != 0 } to pieces.filterIndexed { i, _ -> bestMask and (1 shl i) == 0 }
    }

    private fun sse(l: List<Piece>): Double {
        val m = mean(l)
        return l.sumOf { (it.a - m[0]) * (it.a - m[0]) + (it.b - m[1]) * (it.b - m[1]) }
    }

    private fun twoMeans(pieces: List<Piece>): Pair<List<Piece>, List<Piece>> {
        // Seed with the two pieces furthest apart in colour.
        var s1 = pieces[0]
        var s2 = pieces[0]
        var best = -1.0
        for (p in pieces) for (q in pieces) {
            val d = hypot(p.a - q.a, p.b - q.b)
            if (d > best) { best = d; s1 = p; s2 = q }
        }
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
    private fun dist(a: DoubleArray, b: DoubleArray) = hypot(a[0] - b[0], a[1] - b[1])
}
