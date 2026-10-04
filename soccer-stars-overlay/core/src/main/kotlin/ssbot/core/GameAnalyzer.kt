package ssbot.core

import org.opencv.core.Mat
import ssbot.core.ai.ChooseAction
import ssbot.core.ai.Chromosome
import ssbot.core.physics.Environment
import ssbot.core.physics.Trajectories
import ssbot.core.vision.ArrowDetector
import ssbot.core.vision.ArrowReading
import ssbot.core.vision.Detection
import ssbot.core.vision.TemplateDetector
import ssbot.core.vision.Vision
import ssbot.core.vision.Yolo
import java.util.concurrent.ExecutorService
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.roundToInt
import kotlin.math.sin
import org.opencv.core.Rect as CvRect

/** Everything found on screen for one turn (screen pixels) plus the same state in the reference frame. */
data class TurnState(
    val playerBoxes: List<CvRect>,
    val opponentBoxes: List<CvRect>,
    val ballBox: Detection,
    val screen: GameState,
    val ref: GameState,
)

/** Simulated outcome of a shot, with paths converted back to screen pixels for drawing. */
data class Prediction(
    val playerIndex: Int,
    val angleRef: Double,
    val forceRef: Double,
    val paths: Trajectories,
    val playerGoal: Boolean,
    val opponentGoal: Boolean,
)

data class Suggestion(
    val action: Chromosome,
    val prediction: Prediction,
    /** Drag gesture for util.perform_drag_action, screen pixels. */
    val dragStart: Point,
    val dragEnd: Point,
)

class InitError(message: String) : Exception(message)

/**
 * Port of `GameAnalyzer` from the bot's main.py, split into steps the Android service can call:
 *  - [initialize]: playground, goals and piece templates (once per match)
 *  - [isPlayersTurn]: white-pixel turn check on every frame
 *  - [detectState]: pieces (template matching) + ball (YOLO) at the start of our turn
 *  - [predictArrow]: arrow (YOLO + colour mask) -> simulate the shot being aimed
 *  - [chooseAction]: the evolutionary search for the best shot (commented out in main.py)
 */
class GameAnalyzer(
    private val ballModel: Yolo,
    arrowModel: Yolo,
    private val playerGoalTemplate: Mat,
    private val opponentGoalTemplate: Mat,
    var params: SimParameters = SimParameters.REPORT_3,
) {
    private val arrowDetector = ArrowDetector(arrowModel)

    var playground: Rect? = null; private set
    var frame: RefFrame? = null; private set
    var playerGoal: Rect? = null; private set
    var opponentGoal: Rect? = null; private set
    var goalsFromTemplates = false; private set
    private var playerDetector: TemplateDetector? = null
    private var opponentDetector: TemplateDetector? = null

    val isInitialized get() = playerDetector != null

    fun initialize(bgr: Mat) {
        val pg = Vision.getRectangle(bgr) ?: throw InitError("Pitch not found")
        if (pg.w < bgr.cols() * 0.3 || pg.h < bgr.rows() * 0.3) throw InitError("Pitch not found")
        val f = RefFrame(pg)

        // Goals: template match with the bot's goal images, scaled from the reference window to this screen.
        val ref = RefFrame.REFERENCE_PLAYGROUND
        val sx = pg.w / ref.w
        val sy = pg.h / ref.h
        val pgTpl = Vision.resize(playerGoalTemplate, sx, sy)
        val ogTpl = Vision.resize(opponentGoalTemplate, sx, sy)
        val pgl = TemplateDetector(pgTpl).findObjects(bgr, 0.7).firstOrNull()
        val ogl = TemplateDetector(ogTpl).findObjects(bgr, 0.7).firstOrNull()
        goalsFromTemplates = pgl != null && ogl != null
        playerGoal = pgl?.toRect() ?: f.toScreenRect(REF_PLAYER_GOAL)
        opponentGoal = ogl?.toRect() ?: f.toScreenRect(REF_OPPONENT_GOAL)

        // init_players: one piece from each half becomes the matching template.
        val scale = (sx + sy) / 2
        val x = pg.x.toInt(); val y = pg.y.toInt(); val w = pg.w.toInt(); val h = pg.h.toInt()
        val oppRegion = CvRect(x + w / 2, y, w / 2, h)
        val plyRegion = CvRect(x, y, w / 2, h)
        var opp = Vision.captureCircleTemplate(bgr, oppRegion, scale) ?: throw InitError("Opponent piece not found")
        var ply = Vision.captureCircleTemplate(bgr, plyRegion, scale) ?: throw InitError("Player piece not found")
        // Newer game versions draw a glow ring around the pieces of the side to move; Hough then
        // picks the ring instead of the piece. Both teams' pieces have the same size, so if one
        // circle is much larger, search that side again below the other side's radius.
        // (On the bot's reference screenshots both radii are equal and nothing changes.)
        if (ply.second > opp.second * 1.25) {
            ply = Vision.captureCircleTemplate(bgr, plyRegion, scale, (opp.second * 1.15).roundToInt()) ?: ply
        } else if (opp.second > ply.second * 1.25) {
            opp = Vision.captureCircleTemplate(bgr, oppRegion, scale, (ply.second * 1.15).roundToInt()) ?: opp
        }
        val (pt, ot) = Vision.compareAndResize(ply.first, opp.first)
        playerDetector = TemplateDetector(pt)
        opponentDetector = TemplateDetector(ot)
        playground = pg
        frame = f
    }

    /** main.py: area = (playground.x, 0, playground.w // 3, height // 4). */
    fun turnArea(bgr: Mat): CvRect {
        val pg = playground ?: Rect(0.0, 0.0, bgr.cols().toDouble(), bgr.rows().toDouble())
        return CvRect(pg.x.toInt(), 0, pg.w.toInt() / 3, bgr.rows() / 4)
    }

    fun isPlayersTurn(bgr: Mat) = Vision.isPlayersTurn(bgr, turnArea(bgr))

    fun detectState(bgr: Mat): TurnState? {
        val pd = playerDetector ?: return null
        val od = opponentDetector ?: return null
        val f = frame ?: return null
        val players = pd.findObjects(bgr, 0.7)
        val opponents = od.findObjects(bgr, 0.7)
        val ball = ballModel.detect(bgr).filter { it.cls == 0 }.maxByOrNull { it.confidence } ?: return null
        if (players.isEmpty()) return null
        val screen = GameState(
            TemplateDetector.clickPoints(players),
            TemplateDetector.clickPoints(opponents),
            Point((ball.x1 + ball.x2) / 2, (ball.y1 + ball.y2) / 2),
            playerGoal!!, opponentGoal!!, playground!!,
        )
        return TurnState(players, opponents, ball, screen, f.toRef(screen))
    }

    fun readArrow(bgr: Mat): ArrowReading? = arrowDetector.read(bgr)

    /** main.py arrow branch: closest piece to the arrow tail, shoot(angle, force), 500 steps. */
    fun predictArrow(state: TurnState, arrow: ArrowReading): Prediction {
        val f = frame!!
        // Angle and length are measured in screen pixels; express them in the reference frame.
        val dir = f.vecToRef(arrow.head.x - arrow.tail.x, arrow.head.y - arrow.tail.y)
        var angle = -Math.toDegrees(kotlin.math.atan2(dir.y, dir.x))
        if (angle < 0) angle += 360.0
        val span = f.vecToRef(arrow.spanB.x - arrow.spanA.x, arrow.spanB.y - arrow.spanA.y)
        val force = (hypot(span.x, span.y)).toInt() * 100.0
        val env = Environment(state.ref, params).simulate()
        val idx = env.findClosestShape(f.toRef(arrow.tail))
        Environment.shoot(env.playersShapes[idx], angle, force)
        return finish(env, idx, angle, force)
    }

    fun simulate(state: TurnState, playerIndex: Int, angle: Double, force: Double, roundInputs: Boolean): Prediction {
        val env = Environment(state.ref, params).simulate()
        val a = if (roundInputs) Math.rint(angle) else angle
        val fo = if (roundInputs) Math.rint(force) else force
        Environment.shoot(env.playersShapes[playerIndex], a, fo)
        return finish(env, playerIndex, angle, force)
    }

    private fun finish(env: Environment, idx: Int, angle: Double, force: Double): Prediction {
        val f = frame!!
        val paths = env.run(500, 1.0 / 120, record = 5)!!
        val toScreen = { l: List<Point> -> l.map(f::toScreen) }
        return Prediction(
            idx, angle, force,
            Trajectories(toScreen(paths.ball), paths.players.map(toScreen), paths.opponents.map(toScreen)),
            env.checkPlayerGoalScored(), env.checkOpponentGoalScored(),
        )
    }

    /** choose_action.ChooseAction(50, 50, 0.9, 0.5, 10, 10000) + perform_drag_action geometry. */
    fun chooseAction(
        state: TurnState,
        executor: ExecutorService?,
        nIter: Int = 50,
        populationSize: Int = 50,
        onIteration: (Int, Chromosome) -> Unit = { _, _ -> },
        isCancelled: () -> Boolean = { false },
    ): Suggestion {
        val ca = ChooseAction(
            nIter, populationSize, 0.9, 0.5, 10.0, 10000.0, state.ref, params,
            executor = executor, onIteration = onIteration, isCancelled = isCancelled,
        )
        val best = ca.search()
        val pred = simulate(state, best.playerId - 1, best.angle, best.force, roundInputs = true)
        val f = frame!!
        val start = state.screen.players[best.playerId - 1]
        // calculate_target_point(start, angle, -force/60): drag backwards from the piece.
        val len = -best.force / 60
        val rad = Math.toRadians(best.angle)
        val v = f.vecToScreen(len * cos(rad), len * -sin(rad))
        return Suggestion(best, pred, start, Point(start.x + v.x, start.y + v.y))
    }

    private fun CvRect.toRect() = Rect(x.toDouble(), y.toDouble(), width.toDouble(), height.toDouble())

    private fun RefFrame.toScreenRect(r: Rect): Rect {
        val p = toScreen(Point(r.x, r.y))
        val v = vecToScreen(r.w, r.h)
        return Rect(p.x, p.y, v.x, v.y)
    }

    companion object {
        /** Goal rectangles measured on the reference window (used if template matching fails). */
        val REF_PLAYER_GOAL = Rect(58.0, 259.0, 60.0, 201.0)
        val REF_OPPONENT_GOAL = Rect(917.0, 258.0, 48.0, 200.0)
    }
}
