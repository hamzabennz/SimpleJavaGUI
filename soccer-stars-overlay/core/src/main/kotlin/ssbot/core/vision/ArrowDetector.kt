package ssbot.core.vision

import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfPoint
import org.opencv.core.Scalar
import org.opencv.imgproc.Imgproc
import ssbot.core.Point
import kotlin.math.atan2
import kotlin.math.sqrt
import org.opencv.core.Rect as CvRect

/**
 * Result of `angle_detection.get_arrow_angle`, in screen pixels.
 * [head] is the centroid of the arrow blob, [tail] the contour point farthest from it,
 * [spanA]/[spanB] the two contour points that are farthest apart (their distance is the arrow length).
 */
data class ArrowReading(
    val box: CvRect,
    val confidence: Double,
    val angleDeg: Double,
    val length: Double,
    val force: Int,
    val head: Point,
    val tail: Point,
    val spanA: Point,
    val spanB: Point,
    /** Centre of the piece the arrow starts from ([readOnBoard] only). */
    val shooter: Point? = null,
)

/** Port of angle_detection.get_arrow_angle (YOLO arrow box -> yellow/orange mask -> angle, length, tail). */
class ArrowDetector(private val yolo: Yolo) {

    /**
     * [pieces]: centres of the pieces on the board, if known. Their faces are removed from the
     * colour mask first, and only the largest remaining blob is used, so orange/red team skins
     * inside the arrow's box cannot be mistaken for the arrow (the bot used every blob).
     */
    fun read(bgr: Mat, offset: Int = 0, pieces: List<Point>? = null, pieceRadius: Double = 26.0): ArrowReading? {
        val best = yolo.detect(bgr).filter { it.cls == 0 }.maxByOrNull { it.confidence } ?: return null
        // PIL crop with int() coordinates
        val box = Vision.clip(
            CvRect(best.x1.toInt(), best.y1.toInt(), best.x2.toInt() - best.x1.toInt(), best.y2.toInt() - best.y1.toInt()),
            bgr.cols(), bgr.rows(),
        ) ?: return null
        val region = bgr.submat(box)
        val hsv = pilHsv(region)
        val yellow = Mat()
        val orange = Mat()
        Core.inRange(hsv, Scalar(20.0, 100.0, 100.0), Scalar(40.0, 255.0, 255.0), yellow)
        Core.inRange(hsv, Scalar(0.0, 100.0, 100.0), Scalar(20.0, 255.0, 255.0), orange)
        val mask = Mat()
        Core.bitwise_or(yellow, orange, mask)
        if (pieces != null) {
            for (p in pieces) {
                Imgproc.circle(mask, org.opencv.core.Point(p.x - box.x, p.y - box.y), pieceRadius.toInt(), Scalar(0.0), -1)
            }
        }
        val found = ArrayList<MatOfPoint>()
        Imgproc.findContours(mask, found, Mat(), Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_SIMPLE)
        hsv.release(); yellow.release(); orange.release(); mask.release()
        if (found.isEmpty()) return null
        val contours = if (pieces != null) listOf(found.maxBy { Imgproc.contourArea(it) }) else found

        val maxContour = contours.maxBy { Imgproc.contourArea(it) }
        val m = Imgproc.moments(maxContour)
        if (m.m00 == 0.0) return null
        val cx = (m.m10 / m.m00).toInt()
        val cy = (m.m01 / m.m00).toInt()

        val pts = contours.map { it.toArray() }
        // calculate_angle: farthest contour point from the centroid is the tail
        var maxD = 0.0
        var p1: org.opencv.core.Point? = null
        for (c in pts) for (p in c) {
            val d = sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy))
            if (d > maxD) { maxD = d; p1 = p }
        }
        val tail = p1 ?: return null
        var angle = -Math.toDegrees(atan2(cy - tail.y, cx - tail.x))
        if (angle < 0) angle += 360.0

        // find_max_distance_between_points (pairs within each contour)
        var maxSpan = 0.0
        var a = tail
        var b = tail
        for (c in pts) for (i in c.indices) for (j in i + 1 until c.size) {
            val d = sqrt((c[j].x - c[i].x) * (c[j].x - c[i].x) + (c[j].y - c[i].y) * (c[j].y - c[i].y))
            if (d > maxSpan) { maxSpan = d; a = c[i]; b = c[j] }
        }
        found.forEach { it.release() }
        val force = (maxSpan - offset).toInt() * 100
        return ArrowReading(
            box, best.confidence, angle, maxSpan, force,
            Point(box.x + cx.toDouble(), box.y + cy.toDouble()),
            Point(box.x + tail.x, box.y + tail.y),
            Point(box.x + a.x, box.y + a.y), Point(box.x + b.x, box.y + b.y),
        )
    }

    /**
     * Arrow reading that uses the board: the arrow is drawn radially from the centre of the piece
     * being aimed, so the shot direction is measured from that centre to the arrow tip (a ~120 px
     * baseline instead of the arrow's own ~10 px width, which made the bot's centroid method
     * several degrees off). Piece faces are removed from the colour mask, only the largest blob is
     * used, and an arrow that does not start at a piece is rejected (false detections in the UI).
     * Works for either player's arrow; [ArrowReading.shooter] says which piece.
     */
    fun readOnBoard(bgr: Mat, pieces: List<Point>, pieceRadius: Double = 26.0, minConfidence: Double = 0.4): ArrowReading? {
        if (pieces.isEmpty()) return null
        val best = yolo.detect(bgr).filter { it.cls == 0 && it.confidence >= minConfidence }.maxByOrNull { it.confidence } ?: return null
        // Widen the box so an arrow tip clipped by the detector is still inside.
        val pad = 6
        val box = Vision.clip(
            CvRect(best.x1.toInt() - pad, best.y1.toInt() - pad, (best.x2 - best.x1).toInt() + 2 * pad, (best.y2 - best.y1).toInt() + 2 * pad),
            bgr.cols(), bgr.rows(),
        ) ?: return null
        val hsv = pilHsv(bgr.submat(box))
        val yellow = Mat()
        val orange = Mat()
        Core.inRange(hsv, Scalar(20.0, 100.0, 100.0), Scalar(40.0, 255.0, 255.0), yellow)
        Core.inRange(hsv, Scalar(0.0, 100.0, 100.0), Scalar(20.0, 255.0, 255.0), orange)
        val mask = Mat()
        Core.bitwise_or(yellow, orange, mask)
        for (p in pieces) Imgproc.circle(mask, org.opencv.core.Point(p.x - box.x, p.y - box.y), pieceRadius.toInt(), Scalar(0.0), -1)
        val found = ArrayList<MatOfPoint>()
        Imgproc.findContours(mask, found, Mat(), Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_NONE)
        hsv.release(); yellow.release(); orange.release(); mask.release()
        val blob = found.maxByOrNull { Imgproc.contourArea(it) }
        val area = blob?.let { Imgproc.contourArea(it) } ?: 0.0
        val pts = blob?.toArray()?.map { Point(it.x + box.x, it.y + box.y) }
        found.forEach { it.release() }
        if (pts == null || area < 25) return null

        // The aimed piece: the one whose centre is closest to the blob.
        fun d(a: Point, b: Point) = kotlin.math.hypot(a.x - b.x, a.y - b.y)
        val shooter = pieces.minBy { c -> pts.minOf { d(it, c) } }
        val near = pts.minBy { d(it, shooter) }
        if (d(near, shooter) > pieceRadius + 20) return null // not attached to a piece
        val tip = pts.maxBy { d(it, shooter) }
        var angle = -Math.toDegrees(atan2(tip.y - shooter.y, tip.x - shooter.x))
        if (angle < 0) angle += 360.0
        val length = d(tip, near)
        return ArrowReading(box, best.confidence, angle, length, length.toInt() * 100, tip, near, near, tip, shooter)
    }

    companion object {
        /** PIL `Image.convert("HSV")` (H, S, V all scaled to 0..255) for a BGR Mat. */
        fun pilHsv(bgr: Mat): Mat {
            val n = bgr.rows() * bgr.cols()
            val src = ByteArray(n * 3)
            val cont = if (bgr.isContinuous) bgr else bgr.clone()
            cont.get(0, 0, src)
            val dst = ByteArray(n * 3)
            for (i in 0 until n) {
                val b = src[3 * i].toInt() and 0xFF
                val g = src[3 * i + 1].toInt() and 0xFF
                val r = src[3 * i + 2].toInt() and 0xFF
                val maxc = maxOf(r, maxOf(g, b))
                val minc = minOf(r, minOf(g, b))
                var uh = 0
                var us = 0
                if (minc != maxc) {
                    val cr = (maxc - minc).toFloat()
                    val s = cr / maxc.toFloat()
                    val rc = (maxc - r).toFloat() / cr
                    val gc = (maxc - g).toFloat() / cr
                    val bc = (maxc - b).toFloat() / cr
                    var h: Float = when {
                        r == maxc -> bc - gc
                        g == maxc -> (2.0 + rc - bc).toFloat()
                        else -> (4.0 + gc - rc).toFloat()
                    }
                    h = ((h / 6.0 + 1.0) % 1.0).toFloat()
                    uh = (h * 255.0).toInt().coerceIn(0, 255)
                    us = (s * 255.0).toInt().coerceIn(0, 255)
                }
                dst[3 * i] = uh.toByte()
                dst[3 * i + 1] = us.toByte()
                dst[3 * i + 2] = maxc.toByte()
            }
            val out = Mat(bgr.rows(), bgr.cols(), CvType.CV_8UC3)
            out.put(0, 0, dst)
            return out
        }
    }
}
