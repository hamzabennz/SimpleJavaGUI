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
import ssbot.core.vision.ArrowReading
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
    val turn: TurnState? = null,
    val arrow: ArrowReading? = null,
    val arrowPrediction: Prediction? = null,
    val suggestion: Suggestion? = null,
    val myTurn: Boolean = false,
    val status: String = "",
)

/**
 * The bot's main loop (GameAnalyzer.run in main.py) driven by captured frames:
 *
 *  - initialise once a pitch is visible (playground, goals, piece templates)
 *  - on every frame check whose turn it is
 *  - at the start of our turn detect the pieces and the ball (game state)
 *  - while it is our turn read the aiming arrow and simulate that shot (main.py)
 *  - in Suggest/Auto mode also run ChooseAction and, in Auto mode, swipe the best shot
 */
class BotEngine(context: Context, private val settings: Settings) : AutoCloseable {
    private val ballModel: Yolo
    private val arrowModel: Yolo
    private val analyzer: GameAnalyzer
    private val gaPool: ExecutorService = Executors.newFixedThreadPool(maxOf(1, Runtime.getRuntime().availableProcessors() - 1))
    private val gaRunner: ExecutorService = Executors.newSingleThreadExecutor()

    private var initSize = 0 to 0
    private var getState = true
    private var turnSeen = 0
    private var turnState: TurnState? = null
    private var gaFuture: Future<*>? = null
    private val gaCancel = AtomicBoolean(false)
    @Volatile private var suggestion: Suggestion? = null
    @Volatile private var gaProgress = ""
    private var shotDone = false

    @Volatile var reinitRequested = false
    @Volatile var analyzeRequested = false

    /** Called when the engine wants to perform a drag (Auto mode). */
    var onShot: ((Point, Point) -> Unit)? = null

    init {
        val assets = context.assets
        ballModel = Yolo(assets.open("models/soccer_ball.onnx").use { it.readBytes() })
        arrowModel = Yolo(assets.open("models/arrow.onnx").use { it.readBytes() })
        fun template(name: String): Mat {
            val bytes = assets.open("templates/$name").use { it.readBytes() }
            return Imgcodecs.imdecode(MatOfByte(*bytes), Imgcodecs.IMREAD_COLOR)
        }
        analyzer = GameAnalyzer(ballModel, arrowModel, template("player_goal.jpg"), template("opponent_goal.jpg"))
    }

    fun process(frame: Mat): OverlayModel {
        val w = frame.cols()
        val h = frame.rows()
        if (w < h) {
            resetTurn()
            return OverlayModel(w, h, status = "Waiting for the game (landscape)…")
        }
        if (!analyzer.isInitialized || reinitRequested || initSize != (w to h)) {
            try {
                analyzer.initialize(frame)
                initSize = w to h
                reinitRequested = false
                resetTurn()
            } catch (e: InitError) {
                return OverlayModel(w, h, status = "Looking for the pitch… (${e.message})")
            }
        }
        val base = OverlayModel(
            w, h, analyzer.playground, analyzer.playerGoal, analyzer.opponentGoal,
            status = if (analyzer.goalsFromTemplates) "" else "goals estimated; ",
        )

        val forced = analyzeRequested
        val myTurn = forced || analyzer.isPlayersTurn(frame)
        if (!myTurn) {
            resetTurn()
            return base.copy(status = base.status + "Opponent's turn")
        }
        // Require the turn indicator on two consecutive frames so pieces have stopped moving.
        turnSeen++
        if (!forced && turnSeen < 2) return base.copy(myTurn = true, status = base.status + "Your turn…")

        if (getState) {
            analyzeRequested = false
            val st = analyzer.detectState(frame)
                ?: return base.copy(myTurn = true, status = base.status + "Your turn – ball or pieces not found, retrying")
            getState = false
            shotDone = false
            turnState = st
            if (settings.mode != Mode.PREDICT) startSearch(st)
        }
        val st = turnState!!

        val arrow = analyzer.readArrow(frame)
        val arrowPrediction = arrow?.let { analyzer.predictArrow(st, it) }

        val sug = suggestion
        if (settings.mode == Mode.AUTO && sug != null && !shotDone) {
            shotDone = true
            onShot?.invoke(sug.dragStart, scaleDrag(sug.dragStart, sug.dragEnd))
        }

        val status = buildString {
            append(base.status)
            append("Your turn: ${st.screen.players.size} vs ${st.screen.opponents.size}")
            if (arrow != null) append(" · aim ${"%.0f".format(arrowPrediction!!.angleRef)}° force ${arrowPrediction.forceRef.toInt()}")
            if (arrowPrediction?.playerGoal == true) append(" · GOAL!")
            if (arrowPrediction?.opponentGoal == true) append(" · OWN GOAL")
            when {
                sug != null -> append(" · best: piece ${sug.action.playerId}, ${"%.0f".format(sug.action.angle)}°, fitness ${"%.0f".format(sug.action.fitness)}")
                gaProgress.isNotEmpty() -> append(" · $gaProgress")
            }
        }
        return base.copy(turn = st, arrow = arrow, arrowPrediction = arrowPrediction, suggestion = sug, myTurn = true, status = status)
    }

    private fun scaleDrag(start: Point, end: Point): Point {
        val s = settings.dragScale.toDouble()
        return Point(start.x + (end.x - start.x) * s, start.y + (end.y - start.y) * s)
    }

    private fun startSearch(st: TurnState) {
        gaCancel.set(false)
        suggestion = null
        gaProgress = "searching…"
        val iters = settings.gaIterations
        val pop = settings.gaPopulation
        gaFuture = gaRunner.submit {
            try {
                val s = analyzer.chooseAction(
                    st, gaPool, iters, pop,
                    onIteration = { i, best -> gaProgress = "search $i/$iters (fitness ${"%.0f".format(best.fitness)})" },
                    isCancelled = { gaCancel.get() },
                )
                if (!gaCancel.get()) suggestion = s
            } catch (e: Exception) {
                gaProgress = "search failed: ${e.message}"
            }
        }
    }

    private fun resetTurn() {
        getState = true
        turnSeen = 0
        turnState = null
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
}
