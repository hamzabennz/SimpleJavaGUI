package ssbot.core.vision

import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfByte
import org.opencv.core.MatOfInt
import org.opencv.core.MatOfPoint
import org.opencv.core.MatOfRect
import org.opencv.core.Scalar
import org.opencv.core.Size
import org.opencv.imgcodecs.Imgcodecs
import org.opencv.imgproc.Imgproc
import org.opencv.objdetect.Objdetect
import ssbot.core.Rect
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import org.opencv.core.Rect as CvRect

/**
 * Ports of the bot's image helpers (rect_detection.py, util.py, save_element_screenshot.py).
 * All frames are BGR `CV_8UC3` Mats, like the screenshots the bot gets from `WindowCapture`.
 */
object Vision {

    /** rect_detection.get_rectangle: bounding box of the largest green area (the pitch). */
    fun getRectangle(bgr: Mat): Rect? {
        val hsv = Mat()
        Imgproc.cvtColor(bgr, hsv, Imgproc.COLOR_BGR2HSV)
        val mask = Mat()
        Core.inRange(hsv, Scalar(35.0, 50.0, 50.0), Scalar(85.0, 255.0, 255.0), mask)
        val kernel = Mat.ones(5, 5, CvType.CV_8U)
        Imgproc.erode(mask, mask, kernel, org.opencv.core.Point(-1.0, -1.0), 1)
        Imgproc.dilate(mask, mask, kernel, org.opencv.core.Point(-1.0, -1.0), 1)
        val contours = ArrayList<MatOfPoint>()
        Imgproc.findContours(mask, contours, Mat(), Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_SIMPLE)
        hsv.release(); kernel.release()
        val largest = contours.maxByOrNull { Imgproc.contourArea(it) } ?: return null
        var r = Imgproc.boundingRect(largest)

        // On some screens the grass inside the goal mouths joins the pitch and widens the box.
        // Trim columns/rows that are mostly not pitch; on the bot's reference window this never
        // changes the box by more than 5 %, so the original result is kept there.
        mask.setTo(Scalar(0.0))
        Imgproc.drawContours(mask, listOf(largest), -1, Scalar(255.0), -1)
        val refined = coreBox(mask.submat(r))
        if (refined != null && (refined.width < r.width * 0.95 || refined.height < r.height * 0.95)) {
            r = CvRect(r.x + refined.x, r.y + refined.y, refined.width, refined.height)
        }
        mask.release()
        contours.forEach { it.release() }
        return Rect(r.x.toDouble(), r.y.toDouble(), r.width.toDouble(), r.height.toDouble())
    }

    /** Box spanning the columns and rows of [fill] that are at least half filled. */
    private fun coreBox(fill: Mat): CvRect? {
        val cols = Mat()
        val rows = Mat()
        Core.reduce(fill, cols, 0, Core.REDUCE_AVG, CvType.CV_32F)
        Core.reduce(fill, rows, 1, Core.REDUCE_AVG, CvType.CV_32F)
        val c = FloatArray(fill.cols()).also { cols.get(0, 0, it) }
        val r = FloatArray(fill.rows()).also { rows.get(0, 0, it) }
        cols.release(); rows.release()
        val x0 = c.indexOfFirst { it >= 127.5f }
        val x1 = c.indexOfLast { it >= 127.5f }
        val y0 = r.indexOfFirst { it >= 127.5f }
        val y1 = r.indexOfLast { it >= 127.5f }
        if (x0 < 0 || y0 < 0) return null
        return CvRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1)
    }

    /**
     * util.trim (PIL): bounding box of pixels that differ from the top-left pixel by more
     * than 100 in any channel. Returns null when nothing differs (PIL returns None).
     */
    fun trimBox(img: Mat): CvRect? {
        val px = img.get(0, 0)
        val ref = Scalar(px[0], px.getOrElse(1) { 0.0 }, px.getOrElse(2) { 0.0 })
        val diff = Mat()
        Core.absdiff(img, ref, diff)
        val mask = Mat()
        // (d + d) / 2.0 - 100 > 0  <=>  d > 100
        Imgproc.threshold(diff, diff, 100.0, 255.0, Imgproc.THRESH_BINARY)
        val channels = ArrayList<Mat>()
        Core.split(diff, channels)
        mask.create(img.rows(), img.cols(), CvType.CV_8U)
        mask.setTo(Scalar(0.0))
        for (c in channels) { Core.bitwise_or(mask, c, mask); c.release() }
        val nz = Mat()
        Core.findNonZero(mask, nz)
        diff.release(); mask.release()
        if (nz.empty()) { nz.release(); return null }
        val box = Imgproc.boundingRect(MatOfPoint(nz))
        nz.release()
        return box
    }

    /**
     * util.is_players_turn: crop the top-left score area, trim it, and report whether
     * any pixel is pure white (the active player's name is drawn in white).
     */
    fun isPlayersTurn(bgr: Mat, area: CvRect): Boolean {
        val a = clip(area, bgr.cols(), bgr.rows()) ?: return false
        val crop = bgr.submat(a)
        val box = trimBox(crop) ?: return false
        val trimmed = crop.submat(box)
        val gray = Mat()
        Imgproc.cvtColor(trimmed, gray, Imgproc.COLOR_BGR2GRAY)
        val white = Mat()
        Core.inRange(gray, Scalar(255.0), Scalar(255.0), white)
        val any = Core.countNonZero(white) > 0
        gray.release(); white.release()
        return any
    }

    /**
     * Turn check that compares the two player names above the pitch: the side to move has its
     * name in bright white, the other in grey. Returns true (you, left), false (opponent, right)
     * or null when it cannot tell (e.g. a dialog covers the bar).
     * More robust than the bot's "any pure white pixel" check, which also fires on banners.
     */
    fun namesTurn(bgr: Mat, playground: Rect): Boolean? {
        val y0 = (playground.y * 0.45).toInt()
        val y1 = playground.y.toInt()
        val w3 = (playground.w / 3).toInt()
        if (y1 - y0 < 4 || w3 < 4) return null
        val left = clip(CvRect(playground.x.toInt(), y0, w3, y1 - y0), bgr.cols(), bgr.rows()) ?: return null
        val right = clip(CvRect((playground.x + playground.w).toInt() - w3, y0, w3, y1 - y0), bgr.cols(), bgr.rows()) ?: return null
        fun bright(r: CvRect): Int {
            val gray = Mat()
            Imgproc.cvtColor(bgr.submat(r), gray, Imgproc.COLOR_BGR2GRAY)
            val m = Mat()
            Core.inRange(gray, Scalar(245.0), Scalar(255.0), m)
            return Core.countNonZero(m).also { gray.release(); m.release() }
        }
        val l = bright(left)
        val r = bright(right)
        val min = max(8, (left.area() * 0.0008).toInt())
        return when {
            l >= min && l > 2 * r -> true
            r >= min && r > 2 * l -> false
            else -> null
        }
    }

    /**
     * save_element_screenshot: find the strongest Hough circle inside the given region and
     * crop it as a template (round-tripped through JPEG like the bot's cv2.imwrite).
     * [scale] adapts the limits (minDist 20, radius 10..37 px on the reference window) to this screen;
     * [maxRadius] overrides the upper radius limit; [preferRadius] picks the circle closest to that radius.
     */
    fun captureCircleTemplate(
        bgr: Mat,
        region: CvRect,
        scale: Double,
        maxRadius: Int = (37 * scale).roundToInt(),
        preferRadius: Double = 0.0,
    ): Pair<Mat, Int>? {
        val r = clip(region, bgr.cols(), bgr.rows()) ?: return null
        val crop = bgr.submat(r)
        val gray = Mat()
        Imgproc.cvtColor(crop, gray, Imgproc.COLOR_BGR2GRAY)
        val circles = Mat()
        Imgproc.HoughCircles(
            gray, circles, Imgproc.HOUGH_GRADIENT, 1.0, 20.0 * scale, 50.0, 30.0,
            (10 * scale).roundToInt(), maxRadius,
        )
        gray.release()
        if (circles.empty()) return null
        // The bot takes circles[0]. On its reference window that is always a piece face (r = 23);
        // newer game versions add a glow ring / visible piece base, which Hough may rank first.
        // Prefer the circle closest to the face radius (circles[0] whenever it already is).
        var c = circles.get(0, 0)
        if (preferRadius > 0) {
            for (i in 1 until circles.cols()) {
                val o = circles.get(0, i)
                if (abs(o[2] - preferRadius) < abs(c[2] - preferRadius) - 1.0) c = o
            }
        }
        circles.release()
        val x = Math.rint(c[0]).toInt()
        val y = Math.rint(c[1]).toInt()
        val rad = Math.rint(c[2]).toInt()
        val box = clip(CvRect(x - rad, y - rad, 2 * rad, 2 * rad), crop.cols(), crop.rows()) ?: return null
        val tpl = jpegRoundTrip(crop.submat(box), 95)
        return tpl to rad
    }

    /**
     * util.compare_and_resize_images: centre-crop the wider template to the other's size
     * (PIL re-saves it as JPEG with quality 75).
     */
    fun compareAndResize(player: Mat, opponent: Mat): Pair<Mat, Mat> {
        fun cropTo(img: Mat, w: Int, h: Int): Mat {
            val left = (img.cols() - w) / 2
            val top = (img.rows() - h) / 2
            val box = clip(CvRect(left, top, w, h), img.cols(), img.rows()) ?: return img
            return jpegRoundTrip(img.submat(box), 75)
        }
        return when {
            player.cols() < opponent.cols() -> player to cropTo(opponent, player.cols(), player.rows())
            player.cols() > opponent.cols() -> cropTo(player, opponent.cols(), opponent.rows()) to opponent
            else -> player to opponent
        }
    }

    fun jpegRoundTrip(img: Mat, quality: Int): Mat {
        val buf = MatOfByte()
        Imgcodecs.imencode(".jpg", img, buf, MatOfInt(Imgcodecs.IMWRITE_JPEG_QUALITY, quality))
        val out = Imgcodecs.imdecode(buf, Imgcodecs.IMREAD_COLOR)
        buf.release()
        return out
    }

    fun resize(img: Mat, sx: Double, sy: Double): Mat {
        if (sx == 1.0 && sy == 1.0) return img
        val out = Mat()
        val w = max(1, (img.cols() * sx).roundToInt())
        val h = max(1, (img.rows() * sy).roundToInt())
        val interp = if (sx * sy > 1.0) Imgproc.INTER_LINEAR else Imgproc.INTER_AREA
        Imgproc.resize(img, out, Size(w.toDouble(), h.toDouble()), 0.0, 0.0, interp)
        return out
    }

    fun clip(r: CvRect, w: Int, h: Int): CvRect? {
        val x0 = max(0, r.x)
        val y0 = max(0, r.y)
        val x1 = min(w, r.x + r.width)
        val y1 = min(h, r.y + r.height)
        if (x1 <= x0 || y1 <= y0) return null
        return CvRect(x0, y0, x1 - x0, y1 - y0)
    }
}

/** object_detection.ObjectDetection: template matching + cv.groupRectangles. */
class TemplateDetector(val template: Mat, private val method: Int = Imgproc.TM_CCOEFF_NORMED) {
    private val groupThreshold = 2
    private val eps = 0.1

    fun findObjects(target: Mat, threshold: Double = 0.7, maxResults: Int = 10): List<CvRect> {
        if (template.cols() > target.cols() || template.rows() > target.rows()) return emptyList()
        val result = Mat()
        Imgproc.matchTemplate(target, template, result, method)
        val ge = Mat()
        Core.compare(result, Scalar(threshold), ge, Core.CMP_GE)
        val nz = Mat()
        Core.findNonZero(ge, nz)
        result.release(); ge.release()
        if (nz.empty()) { nz.release(); return emptyList() }

        // np.where returns locations in row-major order; zip(*loc[::-1]) gives (x, y).
        val pts = IntArray(nz.rows() * 2)
        nz.get(0, 0, pts)
        nz.release()
        val rects = ArrayList<CvRect>()
        for (i in 0 until pts.size / 2) {
            val r = CvRect(pts[2 * i], pts[2 * i + 1], template.cols(), template.rows())
            rects.add(r); rects.add(r)
        }
        val list = MatOfRect(*rects.toTypedArray())
        val weights = MatOfInt()
        Objdetect.groupRectangles(list, weights, groupThreshold, eps)
        var out = list.toList()
        list.release(); weights.release()
        if (out.size > maxResults) out = out.subList(0, maxResults)
        return out
    }

    companion object {
        fun clickPoints(rects: List<CvRect>) = rects.map { ssbot.core.Point((it.x + it.width / 2).toDouble(), (it.y + it.height / 2).toDouble()) }
    }
}
