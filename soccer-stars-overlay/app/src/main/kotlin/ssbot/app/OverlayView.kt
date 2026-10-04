package ssbot.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import ssbot.core.Point
import ssbot.core.Rect
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * Full-screen, touch-through drawing layer.
 *
 * The overlay is itself captured by the screen recording, so:
 *  - it never uses colours the bot's detectors look for: no pure white (turn check),
 *    no red/orange/yellow (arrow mask), no pitch green;
 *  - lines stay thin and keep clear of piece centres, so they do not look like a moved piece.
 */
class OverlayView(context: Context, private val settings: Settings) : View(context) {
    @Volatile var model = OverlayModel()
        set(value) { field = value; postInvalidate() }

    private val density = resources.displayMetrics.density
    private val loc = IntArray(2)

    private fun stroke(color: Int, width: Float, dashed: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        this.color = color
        strokeWidth = width * density
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        if (dashed) pathEffect = DashPathEffect(floatArrayOf(6 * density, 5 * density), 0f)
    }

    private val pitchPaint = stroke(Color.argb(140, 120, 140, 255), 1.2f, dashed = true)
    private val goalPaint = stroke(Color.argb(160, 180, 120, 255), 1.5f)
    private val playerPaint = stroke(Color.argb(200, 70, 150, 255), 1.5f)
    private val opponentPaint = stroke(Color.argb(200, 230, 80, 230), 1.5f)
    private val ballBoxPaint = stroke(Color.argb(200, 0, 230, 230), 1.5f)
    private val ballPathPaint = stroke(Color.rgb(0, 235, 235), 2.5f)
    private val shooterPathPaint = stroke(Color.rgb(90, 160, 255), 2f)
    private val piecePathPaint = stroke(Color.argb(210, 110, 170, 255), 1.5f, dashed = true)
    private val oppPathPaint = stroke(Color.argb(210, 230, 110, 230), 1.5f, dashed = true)
    private val endPaint = stroke(Color.rgb(0, 235, 235), 2f)
    private val goalHitPaint = stroke(Color.rgb(100, 210, 255), 3.5f)
    private val suggestPaint = stroke(Color.rgb(160, 110, 255), 3f)
    private val suggestPathPaint = stroke(Color.rgb(160, 110, 255), 2f, dashed = true)
    private val dragPaint = stroke(Color.rgb(200, 170, 255), 2f, dashed = true)

    override fun onDraw(canvas: Canvas) {
        val m = model
        if (m.frameWidth == 0) return
        getLocationOnScreen(loc)
        canvas.save()
        // Frame pixels are screen pixels; shift if the window does not start at the screen origin.
        canvas.translate(-loc[0].toFloat(), -loc[1].toFloat())
        val r = m.pieceRadius

        if (settings.showDetections) {
            m.playground?.let { canvas.drawRect(it, pitchPaint) }
            m.playerGoal?.let { canvas.drawRect(it, goalPaint) }
            m.opponentGoal?.let { canvas.drawRect(it, goalPaint) }
            m.turn?.let { t ->
                t.playerBoxes.forEach { canvas.drawRect(it, playerPaint) }
                t.opponentBoxes.forEach { canvas.drawRect(it, opponentPaint) }
                canvas.drawRect(t.ballBox, ballBoxPaint)
            }
        }

        // The bot's "Action Result": simulated outcome of the shot you are aiming.
        m.arrowPrediction?.let { p ->
            p.paths.players.forEachIndexed { i, path ->
                if (moved(path)) drawPath(canvas, path, if (i == p.playerIndex) shooterPathPaint else piecePathPaint, r)
            }
            p.paths.opponents.forEach { if (moved(it)) drawPath(canvas, it, oppPathPaint, r) }
            drawPath(canvas, p.paths.ball, ballPathPaint, r * 0.6f)
            val end = p.paths.ball.last()
            canvas.drawCircle(end.x.toFloat(), end.y.toFloat(), r * 0.7f, if (p.playerGoal) goalHitPaint else endPaint)
        }

        // Best shot from the evolutionary search: ring the piece, show the shot direction,
        // and where to drag your finger to.
        m.suggestion?.let { s ->
            drawPath(canvas, s.prediction.paths.ball, suggestPathPaint, r * 0.6f)
            val start = s.dragStart
            canvas.drawCircle(start.x.toFloat(), start.y.toFloat(), r * 1.25f, suggestPaint)
            val dx = start.x - s.dragEnd.x
            val dy = start.y - s.dragEnd.y
            val len = hypot(dx, dy).coerceAtLeast(1.0)
            val ux = dx / len
            val uy = dy / len
            val from = Point(start.x + ux * r * 1.25, start.y + uy * r * 1.25)
            drawArrow(canvas, from, Point(start.x + ux * (r * 1.25 + r * 2.5), start.y + uy * (r * 1.25 + r * 2.5)), suggestPaint)
            // Finger path: from the piece edge back to the drag end.
            canvas.drawLine(
                (start.x - ux * r * 1.25).toFloat(), (start.y - uy * r * 1.25).toFloat(),
                s.dragEnd.x.toFloat(), s.dragEnd.y.toFloat(), dragPaint,
            )
            canvas.drawCircle(s.dragEnd.x.toFloat(), s.dragEnd.y.toFloat(), r * 0.45f, suggestPaint)
            val end = s.prediction.paths.ball.last()
            canvas.drawCircle(end.x.toFloat(), end.y.toFloat(), r * 0.7f, if (s.prediction.playerGoal) goalHitPaint else suggestPaint)
        }
        canvas.restore()
    }

    private fun moved(path: List<Point>): Boolean {
        val a = path.first()
        val b = path.last()
        return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) > 4.0
    }

    /** Polyline that starts outside [skipRadius] of its first point (keeps piece centres clear). */
    private fun drawPath(canvas: Canvas, pts: List<Point>, paint: Paint, skipRadius: Float) {
        if (pts.size < 2) return
        val o = pts[0]
        val startIdx = pts.indexOfFirst { hypot(it.x - o.x, it.y - o.y) > skipRadius }
        if (startIdx < 0) return
        val p = Path()
        p.moveTo(pts[startIdx].x.toFloat(), pts[startIdx].y.toFloat())
        for (i in startIdx + 1 until pts.size) p.lineTo(pts[i].x.toFloat(), pts[i].y.toFloat())
        canvas.drawPath(p, paint)
    }

    private fun drawArrow(canvas: Canvas, from: Point, to: Point, paint: Paint) {
        canvas.drawLine(from.x.toFloat(), from.y.toFloat(), to.x.toFloat(), to.y.toFloat(), paint)
        val a = atan2(to.y - from.y, to.x - from.x)
        val l = 14 * density
        for (d in listOf(2.6, -2.6)) {
            canvas.drawLine(
                to.x.toFloat(), to.y.toFloat(),
                (to.x + l * cos(a + d)).toFloat(), (to.y + l * sin(a + d)).toFloat(), paint,
            )
        }
    }

    private fun Canvas.drawRect(r: Rect, paint: Paint) =
        drawRect(r.x.toFloat(), r.y.toFloat(), (r.x + r.w).toFloat(), (r.y + r.h).toFloat(), paint)
}
