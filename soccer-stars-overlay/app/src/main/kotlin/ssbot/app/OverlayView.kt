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
import kotlin.math.sin

/**
 * Full-screen, touch-through drawing layer.
 *
 * The overlay is itself captured by the screen recording, so it never uses colours the bot's
 * detectors look for: no pure white (turn check), no red/orange/yellow (arrow mask) and no
 * green (pitch mask). Pieces/paths use cyan, blue, magenta and violet.
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

    private val pitchPaint = stroke(Color.argb(150, 120, 140, 255), 1.5f, dashed = true)
    private val goalPaint = stroke(Color.argb(170, 180, 120, 255), 2f)
    private val playerPaint = stroke(Color.rgb(70, 150, 255), 2f)
    private val opponentPaint = stroke(Color.rgb(230, 80, 230), 2f)
    private val ballPaint = stroke(Color.rgb(0, 230, 230), 2f)
    private val ballPathPaint = stroke(Color.rgb(0, 230, 230), 3f)
    private val piecePathPaint = stroke(Color.argb(200, 110, 170, 255), 2f, dashed = true)
    private val oppPathPaint = stroke(Color.argb(200, 230, 110, 230), 2f, dashed = true)
    private val endPaint = stroke(Color.rgb(0, 230, 230), 2f)
    private val suggestPaint = stroke(Color.rgb(150, 100, 255), 4f)
    private val suggestPathPaint = stroke(Color.rgb(150, 100, 255), 3f, dashed = true)

    override fun onDraw(canvas: Canvas) {
        val m = model
        if (m.frameWidth == 0) return
        getLocationOnScreen(loc)
        canvas.save()
        // Frame pixels are screen pixels; shift if the window does not start at the screen origin.
        canvas.translate(-loc[0].toFloat(), -loc[1].toFloat())

        if (settings.showDetections) {
            m.playground?.let { canvas.drawRect(it, pitchPaint) }
            m.playerGoal?.let { canvas.drawRect(it, goalPaint) }
            m.opponentGoal?.let { canvas.drawRect(it, goalPaint) }
            m.turn?.let { t ->
                for (b in t.playerBoxes) canvas.drawRect(b.x.toFloat(), b.y.toFloat(), (b.x + b.width).toFloat(), (b.y + b.height).toFloat(), playerPaint)
                for (b in t.opponentBoxes) canvas.drawRect(b.x.toFloat(), b.y.toFloat(), (b.x + b.width).toFloat(), (b.y + b.height).toFloat(), opponentPaint)
                val bb = t.ballBox
                canvas.drawRect(bb.x1.toFloat(), bb.y1.toFloat(), bb.x2.toFloat(), bb.y2.toFloat(), ballPaint)
            }
        }

        // The bot's "Action Result": simulated outcome of the shot being aimed.
        m.arrowPrediction?.let { p ->
            p.paths.players.forEachIndexed { i, path -> if (moved(path)) drawPath(canvas, path, if (i == p.playerIndex) ballPathPaint else piecePathPaint) }
            p.paths.opponents.forEach { if (moved(it)) drawPath(canvas, it, oppPathPaint) }
            drawPath(canvas, p.paths.ball, ballPathPaint)
            val end = p.paths.ball.last()
            canvas.drawCircle(end.x.toFloat(), end.y.toFloat(), 9 * density, endPaint)
        }

        // Best shot from the evolutionary search.
        m.suggestion?.let { s ->
            val path = s.prediction.paths
            drawPath(canvas, path.ball, suggestPathPaint)
            val start = s.dragStart
            canvas.drawCircle(start.x.toFloat(), start.y.toFloat(), 22 * density, suggestPaint)
            // Shot direction (opposite of the drag).
            val dx = start.x - s.dragEnd.x
            val dy = start.y - s.dragEnd.y
            drawArrow(canvas, start, Point(start.x + dx, start.y + dy), suggestPaint)
            val end = path.ball.last()
            canvas.drawCircle(end.x.toFloat(), end.y.toFloat(), 9 * density, suggestPaint)
        }
        canvas.restore()
    }

    private fun moved(path: List<Point>): Boolean {
        val a = path.first()
        val b = path.last()
        return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) > 4.0
    }

    private fun drawPath(canvas: Canvas, pts: List<Point>, paint: Paint) {
        if (pts.size < 2) return
        val p = Path()
        p.moveTo(pts[0].x.toFloat(), pts[0].y.toFloat())
        for (i in 1 until pts.size) p.lineTo(pts[i].x.toFloat(), pts[i].y.toFloat())
        canvas.drawPath(p, paint)
    }

    private fun drawArrow(canvas: Canvas, from: Point, to: Point, paint: Paint) {
        canvas.drawLine(from.x.toFloat(), from.y.toFloat(), to.x.toFloat(), to.y.toFloat(), paint)
        val a = atan2(to.y - from.y, to.x - from.x)
        val l = 18 * density
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
