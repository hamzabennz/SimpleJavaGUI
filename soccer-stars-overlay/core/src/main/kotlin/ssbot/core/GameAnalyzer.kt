package ssbot.core

import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Scalar
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import ssbot.core.ai.ChooseAction
import ssbot.core.ai.Chromosome
import ssbot.core.ai.MAX_STEPS
import ssbot.core.physics.Environment
import ssbot.core.physics.Trajectories
import ssbot.core.vision.ArrowDetector
import ssbot.core.vision.ArrowReading
import ssbot.core.vision.TemplateDetector
import ssbot.core.vision.Piece
import ssbot.core.vision.PieceDetector
import ssbot.core.vision.Teams
import ssbot.core.vision.Vision
import ssbot.core.vision.Yolo
import java.util.concurrent.ExecutorService
import kotlin.math.cos
import kotlin.math.sin
import org.opencv.core.Rect as CvRect

/**
 * The board at the start of a shot. [ref] is in reference-window pixels (what the bot's
 * physics uses); [screen] and the boxes are in screen pixels for drawing.
 */
data class TurnState(
    val ref: GameState,
    val screen: GameState,
    val playerBoxes: List<Rect>,
    val opponentBoxes: List<Rect>,
    val ballBox: Rect,
    /** Colour/radius of each piece (robust detection only), same order as ref.players / ref.opponents. */
    val playerPieces: List<Piece> = emptyList(),
    val opponentPieces: List<Piece> = emptyList(),
) {
    /** The same board with the teams the other way round. */
    fun swapped() = TurnState(
        ref.copy(players = ref.opponents, opponents = ref.players),
        screen.copy(players = screen.opponents, opponents = screen.players),
        opponentBoxes, playerBoxes, ballBox, opponentPieces, playerPieces,
    )
}

/** Simulated outcome of a shot, with paths converted to screen pixels for drawing. */
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
 * Port of `GameAnalyzer` from the bot's main.py, split into steps the Android service calls.
 *
 * Every phone frame is first converted to the bot's 1071x621 reference window ([normalize]),
 * so the original pipeline runs at the exact scale it was written for:
 *  - [initialize]: playground, goals and piece templates
 *  - [isPlayersTurn]: white-pixel turn check (on the screen frame)
 *  - [detectState]: pieces (template matching) + ball (YOLO)
 *  - [readArrow] / [predictArrow]: arrow (YOLO + colour mask) -> simulate the aimed shot
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

    /**
     * Simulate shots until everything stops instead of the bot's fixed 500 steps (4.2 s).
     * Off by default so the parity tests compare against the original exactly.
     */
    var untilRest = false

    /** Screen <-> reference window mapping. */
    var frame: RefFrame? = null; private set
    /** Pitch on the screen. */
    var screenPlayground: Rect? = null; private set
    /** Pitch, goals in reference-window pixels (as the bot sees them). */
    var playground: Rect? = null; private set
    var playerGoal: Rect? = null; private set
    var opponentGoal: Rect? = null; private set
    var goalsFromTemplates = false; private set
    private var playerDetector: TemplateDetector? = null
    private var opponentDetector: TemplateDetector? = null

    /**
     * Find pieces with [PieceDetector] + [Teams] (any team skin, anywhere on the pitch) instead of
     * the bot's half-pitch templates. Off by default so the parity tests run the original.
     */
    var robustPieces = false
    val teams = Teams()

    val isInitialized get() = playground != null && (robustPieces || playerDetector != null)

    fun initialize(screen: Mat) {
        val spg = Vision.getRectangle(screen) ?: throw InitError("pitch not found")
        if (spg.w < screen.cols() * 0.3 || spg.h < screen.rows() * 0.3) throw InitError("pitch not found")
        val aspect = spg.w / spg.h
        if (aspect < 1.3 || aspect > 2.3) throw InitError("pitch not found")
        val f = RefFrame.forPlayground(spg, screen.cols(), screen.rows())
        val norm = normalize(screen, f)
        try {
            initOnWindow(norm)
        } finally {
            norm.release()
        }
        screenPlayground = spg
        frame = f
    }

    /** main.py initialize() + init_players(), on the reference window. */
    private fun initOnWindow(win: Mat) {
        val pg = Vision.getRectangle(win)?.takeIf { it.w > 600 && it.h > 350 } ?: RefFrame.REFERENCE_PLAYGROUND

        val pgl = TemplateDetector(playerGoalTemplate).findObjects(win, 0.7).firstOrNull()
        val ogl = TemplateDetector(opponentGoalTemplate).findObjects(win, 0.7).firstOrNull()
        goalsFromTemplates = pgl != null && ogl != null
        val dx = pg.x - RefFrame.REFERENCE_PLAYGROUND.x
        val dy = pg.y - RefFrame.REFERENCE_PLAYGROUND.y
        playerGoal = pgl?.toRect() ?: REF_PLAYER_GOAL.let { Rect(it.x + dx, it.y + dy, it.w, it.h) }
        opponentGoal = ogl?.toRect() ?: REF_OPPONENT_GOAL.let { Rect(it.x + dx, it.y + dy, it.w, it.h) }

        teams.reset()
        if (robustPieces) {
            playground = pg
            return
        }

        // init_players: one piece from each half becomes the matching template.
        val x = pg.x.toInt(); val y = pg.y.toInt(); val w = pg.w.toInt(); val h = pg.h.toInt()
        val oppRegion = CvRect(x + w / 2, y, w / 2, h)
        val plyRegion = CvRect(x, y, w / 2, h)
        val opp = Vision.captureCircleTemplate(win, oppRegion, 1.0, preferRadius = PIECE_RADIUS) ?: throw InitError("opponent piece not found")
        val ply = Vision.captureCircleTemplate(win, plyRegion, 1.0, preferRadius = PIECE_RADIUS) ?: throw InitError("your piece not found")
        val (pt, ot) = Vision.compareAndResize(ply.first, opp.first)
        playerDetector = TemplateDetector(pt)
        opponentDetector = TemplateDetector(ot)
        playground = pg
    }

    /** The screen frame as the bot's 1071x621 BlueStacks window. Caller releases the result. */
    fun normalize(screen: Mat): Mat = normalize(screen, frame ?: error("not initialized"))

    private fun normalize(screen: Mat, f: RefFrame): Mat {
        if (f.isIdentity && screen.cols() == RefFrame.WINDOW_W && screen.rows() == RefFrame.WINDOW_H) return screen.clone()
        val out = Mat(RefFrame.WINDOW_H, RefFrame.WINDOW_W, CvType.CV_8UC3, Scalar(0.0, 0.0, 0.0))
        val sw = Math.round(screen.cols() * f.sx).toInt()
        val sh = Math.round(screen.rows() * f.sy).toInt()
        val scaled = if (sw == screen.cols() && sh == screen.rows()) screen else Mat().also {
            Imgproc.resize(screen, it, Size(sw.toDouble(), sh.toDouble()), 0.0, 0.0, Imgproc.INTER_AREA)
        }
        val ox = f.ox.toInt()
        val oy = f.oy.toInt()
        val dst = Vision.clip(CvRect(ox, oy, sw, sh), RefFrame.WINDOW_W, RefFrame.WINDOW_H)
        if (dst != null) {
            val src = CvRect(dst.x - ox, dst.y - oy, dst.width, dst.height)
            scaled.submat(src).copyTo(out.submat(dst))
        }
        if (scaled !== screen) scaled.release()
        return out
    }

    /** main.py: area = (playground.x, 0, playground.w // 3, height // 4), on the screen frame. */
    fun turnArea(screen: Mat): CvRect {
        val pg = screenPlayground ?: Rect(0.0, 0.0, screen.cols().toDouble(), screen.rows().toDouble())
        return CvRect(pg.x.toInt(), 0, pg.w.toInt() / 3, screen.rows() / 4)
    }

    /** The bot's original check: any pure-white pixel in the top-left area. */
    fun isPlayersTurnOriginal(screen: Mat) = Vision.isPlayersTurn(screen, turnArea(screen))

    /** Name-brightness turn check (see Vision.namesTurn); null when undecided. */
    fun whoseTurn(screen: Mat): Boolean? = screenPlayground?.let { Vision.namesTurn(screen, it) }

    /** Pieces and ball on the reference window [win] (from [normalize]). */
    fun detectState(win: Mat): TurnState? {
        if (robustPieces) return detectStateRobust(win)
        val pd = playerDetector ?: return null
        val od = opponentDetector ?: return null
        val f = frame ?: return null
        val players = pd.findObjects(win, 0.7)
        val opponents = od.findObjects(win, 0.7)
        if (players.isEmpty()) return null
        val ball = ballModel.detect(win).filter { it.cls == 0 }.maxByOrNull { it.confidence } ?: return null
        val ref = GameState(
            TemplateDetector.clickPoints(players),
            TemplateDetector.clickPoints(opponents),
            Point((ball.x1 + ball.x2) / 2, (ball.y1 + ball.y2) / 2),
            playerGoal!!, opponentGoal!!, playground!!,
        )
        val screen = GameState(
            ref.players.map(f::toScreen), ref.opponents.map(f::toScreen), f.toScreen(ref.ball),
            f.toScreen(ref.playerGoal), f.toScreen(ref.opponentGoal), f.toScreen(ref.playground),
        )
        return TurnState(
            ref, screen,
            players.map { f.toScreen(it.toRect()) },
            opponents.map { f.toScreen(it.toRect()) },
            f.toScreen(Rect(ball.x1, ball.y1, ball.x2 - ball.x1, ball.y2 - ball.y1)),
        )
    }

    private fun detectStateRobust(win: Mat): TurnState? {
        val f = frame ?: return null
        val pg = playground ?: return null
        val ball = ballModel.detect(win).filter { it.cls == 0 }.maxByOrNull { it.confidence } ?: return null
        val ballC = Point((ball.x1 + ball.x2) / 2, (ball.y1 + ball.y2) / 2)
        val pieces = PieceDetector.detect(win, pg).filter { kotlin.math.hypot(it.center.x - ballC.x, it.center.y - ballC.y) > 15 }
        if (pieces.isEmpty()) return null
        val (mine, theirs) = teams.split(pieces)
        val ref = GameState(mine.map { it.center }, theirs.map { it.center }, ballC, playerGoal!!, opponentGoal!!, pg)
        val screen = GameState(
            ref.players.map(f::toScreen), ref.opponents.map(f::toScreen), f.toScreen(ballC),
            f.toScreen(ref.playerGoal), f.toScreen(ref.opponentGoal), f.toScreen(pg),
        )
        fun box(p: Piece) = f.toScreen(Rect(p.center.x - p.radius, p.center.y - p.radius, 2 * p.radius, 2 * p.radius))
        return TurnState(
            ref, screen, mine.map(::box), theirs.map(::box),
            f.toScreen(Rect(ball.x1, ball.y1, ball.x2 - ball.x1, ball.y2 - ball.y1)),
            mine, theirs,
        )
    }

    /**
     * get_arrow_angle on the reference window; all values in reference pixels. With a [state]
     * (robust mode) the piece faces are ignored when reading the arrow's colour.
     */
    fun readArrow(win: Mat, state: TurnState? = null): ArrowReading? =
        if (robustPieces && state != null) arrowDetector.read(win, pieces = state.ref.players + state.ref.opponents)
        else arrowDetector.read(win)

    /**
     * Only your own pieces can be aimed: if the piece under the arrow was classed as an opponent's,
     * the team colours were guessed the wrong way round. Returns the corrected board.
     */
    fun ownShot(state: TurnState, arrow: ArrowReading): TurnState {
        if (!robustPieces) return state
        val all = state.playerPieces.map { it to true } + state.opponentPieces.map { it to false }
        val (piece, isMine) = all.minByOrNull { kotlin.math.hypot(it.first.center.x - arrow.tail.x, it.first.center.y - arrow.tail.y) } ?: return state
        if (kotlin.math.hypot(piece.center.x - arrow.tail.x, piece.center.y - arrow.tail.y) > 45) return state
        teams.confirmMine(piece)
        return if (isMine) state else state.swapped()
    }

    /** main.py arrow branch: closest piece to the arrow tail, shoot(angle, force), 500 steps. */
    fun predictArrow(state: TurnState, arrow: ArrowReading): Prediction {
        val env = Environment(state.ref, params).simulate()
        val idx = env.findClosestShape(arrow.tail)
        env.shootScaled(env.playersShapes[idx], arrow.angleDeg, arrow.force.toDouble())
        return finish(env, idx, arrow.angleDeg, arrow.force.toDouble())
    }

    /** Index of your piece the arrow belongs to (the one closest to the arrow tail). */
    fun closestPlayer(state: TurnState, arrow: ArrowReading): Int =
        Environment(state.ref, params).simulate().findClosestShape(arrow.tail)

    fun simulate(state: TurnState, playerIndex: Int, angle: Double, force: Double, roundInputs: Boolean): Prediction {
        val env = Environment(state.ref, params).simulate()
        val a = if (roundInputs) Math.rint(angle) else angle
        val fo = if (roundInputs) Math.rint(force) else force
        env.shootScaled(env.playersShapes[playerIndex], a, fo)
        return finish(env, playerIndex, angle, force)
    }

    private fun finish(env: Environment, idx: Int, angle: Double, force: Double): Prediction {
        val f = frame!!
        val paths = if (untilRest) env.run(MAX_STEPS, 1.0 / 120, record = 5, untilRest = true)!! else env.run(500, 1.0 / 120, record = 5)!!
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
        val f = frame!!
        val ca = ChooseAction(
            nIter, populationSize, 0.9, 0.5, 10.0, 10000.0, state.ref, params,
            executor = executor, onIteration = onIteration, isCancelled = isCancelled, untilRest = untilRest,
        )
        val best = ca.search()
        val pred = simulate(state, best.playerId - 1, best.angle, best.force, roundInputs = true)
        // calculate_target_point(start, angle, -force/60) in window pixels: drag backwards from the piece.
        val startRef = state.ref.players[best.playerId - 1]
        val len = -best.force / 60
        val rad = Math.toRadians(best.angle)
        val endRef = Point(startRef.x + len * cos(rad), startRef.y + len * -sin(rad))
        return Suggestion(best, pred, f.toScreen(startRef), f.toScreen(endRef))
    }

    private fun CvRect.toRect() = Rect(x.toDouble(), y.toDouble(), width.toDouble(), height.toDouble())

    companion object {
        /** Goal rectangles measured on the reference window (used if template matching fails). */
        val REF_PLAYER_GOAL = Rect(58.0, 259.0, 60.0, 201.0)
        val REF_OPPONENT_GOAL = Rect(917.0, 258.0, 48.0, 200.0)

        /** Radius of a piece face on the reference window (Hough result on the bot's screenshots). */
        const val PIECE_RADIUS = 23.0
    }
}
