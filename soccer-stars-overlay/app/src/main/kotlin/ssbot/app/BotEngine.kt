package ssbot.app

import android.content.Context
import org.opencv.core.Mat
import org.opencv.core.MatOfByte
import org.opencv.imgcodecs.Imgcodecs
import ssbot.core.GameAnalyzer
import ssbot.core.InitError
import ssbot.core.Point
import ssbot.core.Prediction
import ssbot.core.Rect
import ssbot.core.Suggestion
import ssbot.core.TurnState
import ssbot.core.vision.BoardWatcher
import ssbot.core.vision.Yolo
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicBoolean

/** Everything the overlay draws for one processed frame (screen pixels). */
data class OverlayModel(
    val frameWidth: Int = 0,
    val frameHeight: Int = 0,
    val playground: Rect? = null,
    val playerGoal: Rect? = null,
    val opponentGoal: Rect? = null,
    /** Radius around a piece centre that drawings keep clear of (screen px). */
    val pieceRadius: Float = 0f,
    val turn: TurnState? = null,
    val arrowPrediction: Prediction? = null,
    val suggestion: Suggestion? = null,
    val hint: String = "",
    val status: String = "",
)

/**
 * The bot's main loop (GameAnalyzer.run in main.py) driven by captured frames.
 *
 * Unlike main.py, the board is not tied to the white-pixel turn check (which depends on the
 * game version): it is re-detected every time the pitch has come to rest after pieces moved,
 * so the drawings always match the current position.
 *
 *  - initialise once a pitch is visible (playground, goals, piece templates)
 *  - when the pitch is still: detect pieces + ball; in Suggest/Auto start ChooseAction
 *  - while you aim: read the arrow and simulate that shot (what main.py shows)
 *  - when a piece leaves its spot: the detection is stale, wait for the pitch to settle again
 */
class BotEngine(context: Context, private val settings: Settings) : AutoCloseable {
    private val ballModel: Yolo
    private val arrowModel: Yolo
    private val analyzer: GameAnalyzer
    private val watcher = BoardWatcher()
    private val cores = Runtime.getRuntime().availableProcessors()
    // Leave half of the cores to the vision models so aiming stays responsive during a search.
    private val gaPool: ExecutorService = Executors.newFixedThreadPool(maxOf(1, cores / 2))
    private val gaRunner: ExecutorService = Executors.newSingleThreadExecutor()

    private var initSize = 0 to 0
    private var turnState: TurnState? = null
    private var gaFuture: Future<*>? = null
    private var gaCancel = AtomicBoolean(true)
    @Volatile private var suggestion: Suggestion? = null
    @Volatile private var gaProgress = ""
    private var shotDone = false
    private var lastMode = settings.mode

    @Volatile var reinitRequested = false
    @Volatile var analyzeRequested = false
    val accelerated get() = ballModel.accelerated

    /** Called when the engine wants to perform a drag (Auto mode). */
    var onShot: ((Point, Point) -> Unit)? = null

    init {
        val assets = context.assets
        val threads = maxOf(2, minOf(4, cores))
        ballModel = Yolo(assets.open("models/soccer_ball.onnx").use { it.readBytes() }, threads, useXnnpack = true)
        arrowModel = Yolo(assets.open("models/arrow.onnx").use { it.readBytes() }, threads, useXnnpack = true)
        fun template(name: String): Mat {
            val bytes = assets.open("templates/$name").use { it.readBytes() }
            return Imgcodecs.imdecode(MatOfByte(*bytes), Imgcodecs.IMREAD_COLOR)
        }
        analyzer = GameAnalyzer(ballModel, arrowModel, template("player_goal.jpg"), template("opponent_goal.jpg"))
    }

    fun process(screen: Mat): OverlayModel {
        val w = screen.cols()
        val h = screen.rows()
        if (w < h) {
            clearBoard()
            return OverlayModel(w, h, status = "Waiting for the game (turn the phone to landscape)…")
        }
        if (!analyzer.isInitialized || reinitRequested || initSize != (w to h)) {
            try {
                analyzer.initialize(screen)
                initSize = w to h
                reinitRequested = false
                clearBoard()
                watcher.reset()
            } catch (e: InitError) {
                return OverlayModel(w, h, status = "Looking for the pitch… (${e.message}). Start a match.")
            }
        }
        val f = analyzer.frame!!
        val base = OverlayModel(
            w, h,
            f.toScreen(analyzer.playground!!), f.toScreen(analyzer.playerGoal!!), f.toScreen(analyzer.opponentGoal!!),
            pieceRadius = (30 / f.sx).toFloat(),
        )
        if (settings.mode != lastMode) {
            lastMode = settings.mode
            turnState?.let { if (settings.mode != Mode.PREDICT && suggestion == null) startSearch(it) }
        }

        val win = analyzer.normalize(screen)
        try {
            val myTurn = analyzer.isPlayersTurn(screen)
            val arrow = analyzer.readArrow(win)
            watcher.settle(win, analyzer.playground!!)

            // Pieces cannot move while you are aiming; otherwise a piece leaving its spot means the
            // detection is stale.
            if (turnState != null && arrow == null && watcher.moved(win, null)) clearBoard()

            val forced = analyzeRequested
            if (forced || (turnState == null && watcher.stillFrames >= STILL_FRAMES)) {
                analyzeRequested = false
                val st = analyzer.detectState(win)
                if (st != null) {
                    clearBoard()
                    turnState = st
                    watcher.capture(win, st)
                    if (settings.mode != Mode.PREDICT) startSearch(st)
                }
            }

            val st = turnState
                ?: return base.copy(status = if (watcher.stillFrames >= STILL_FRAMES) "Pitch found – can't see the ball or your pieces" else "Pieces moving…")

            val prediction = arrow?.let { analyzer.predictArrow(st, it) }
            val sug = suggestion
            if (settings.mode == Mode.AUTO && sug != null && !shotDone && arrow == null &&
                (myTurn || !settings.useTurnCheck)
            ) {
                shotDone = true
                onShot?.invoke(sug.dragStart, scaleDrag(sug.dragStart, sug.dragEnd))
            }

            val hint = when {
                prediction != null -> ""
                settings.mode == Mode.PREDICT -> "Aim with your finger – the cyan line shows where the ball goes"
                sug == null -> gaProgress.ifEmpty { "Searching for the best shot…" }
                settings.mode == Mode.SUGGEST -> "Drag the circled piece back to the violet dot"
                else -> if (shotDone) "Shot played" else if (myTurn || !settings.useTurnCheck) "" else "Waiting for your turn to shoot"
            }
            val status = buildString {
                append("${st.screen.players.size} vs ${st.screen.opponents.size}")
                append(if (myTurn) " · turn: you" else " · turn: opponent?")
                if (prediction != null) {
                    append(" · aim ${"%.0f".format(prediction.angleRef)}° force ${prediction.forceRef.toInt()}")
                    if (prediction.playerGoal) append(" · GOAL!")
                    if (prediction.opponentGoal) append(" · OWN GOAL!")
                }
                if (sug != null) append(" · best: fitness ${"%.0f".format(sug.action.fitness)}${if (sug.prediction.playerGoal) " (goal)" else ""}")
                if (!analyzer.goalsFromTemplates) append(" · goals estimated")
            }
            return base.copy(turn = st, arrowPrediction = prediction, suggestion = sug, hint = hint, status = status)
        } finally {
            win.release()
        }
    }

    private fun scaleDrag(start: Point, end: Point): Point {
        val s = settings.dragScale.toDouble()
        return Point(start.x + (end.x - start.x) * s, start.y + (end.y - start.y) * s)
    }

    private fun startSearch(st: TurnState) {
        gaCancel.set(true)
        val cancel = AtomicBoolean(false)
        gaCancel = cancel
        suggestion = null
        gaProgress = "Searching for the best shot…"
        val iters = settings.gaIterations
        val pop = settings.gaPopulation
        gaFuture = gaRunner.submit {
            try {
                val s = analyzer.chooseAction(
                    st, gaPool, iters, pop,
                    onIteration = { i, best -> if (!cancel.get()) gaProgress = "Searching $i/$iters (best fitness ${"%.0f".format(best.fitness)})" },
                    isCancelled = { cancel.get() },
                )
                if (!cancel.get()) suggestion = s
            } catch (e: Exception) {
                if (!cancel.get()) gaProgress = "Search failed: ${e.message}"
            }
        }
    }

    private fun clearBoard() {
        turnState = null
        shotDone = false
        gaCancel.set(true)
        gaFuture?.cancel(false)
        gaFuture = null
        suggestion = null
        gaProgress = ""
    }

    override fun close() {
        gaCancel.set(true)
        gaRunner.shutdownNow()
        gaPool.shutdownNow()
        ballModel.close()
        arrowModel.close()
    }

    companion object {
        /** Consecutive still frames before the board is read (~0.3 s). */
        private const val STILL_FRAMES = 2
    }
}
