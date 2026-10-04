package ssbot.app

import android.content.Context
import android.os.SystemClock
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
import ssbot.core.ai.Calibration
import ssbot.core.ai.ShotRecord
import ssbot.core.vision.ArrowReading
import ssbot.core.vision.BoardWatcher
import ssbot.core.vision.Yolo
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.hypot

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
 *  - initialise once a pitch is visible (playground, goals, piece templates)
 *  - when the pitch is still: detect pieces + ball; in Suggest/Auto start ChooseAction
 *  - while you aim: read the arrow and simulate that shot (what main.py shows)
 *  - when a piece leaves its spot: the detection is stale, wait for the pitch to settle again
 *
 * Additions over main.py:
 *  - whose turn it is follows the game's alternation (your aiming arrow = your turn; every shot
 *    passes the turn), because the name colours differ between game versions;
 *  - each of your shots is recorded (board before, aim, board after) and Calibrate fits the
 *    physics to those real shots, like the bot's simulate.py did for one shot.
 */
class BotEngine(context: Context, private val settings: Settings) : AutoCloseable {
    private val ballModel: Yolo
    private val arrowModel: Yolo
    private val analyzer: GameAnalyzer
    private val watcher = BoardWatcher(stillThreshold = 4.0)
    private val cores = Runtime.getRuntime().availableProcessors()
    // Leave half of the cores to the vision models so aiming stays responsive during a search.
    private val gaPool: ExecutorService = Executors.newFixedThreadPool(maxOf(1, cores / 2))
    private val gaRunner: ExecutorService = Executors.newSingleThreadExecutor()
    private val shotFile = File(context.filesDir, "shots.txt")
    private val shots = ArrayList<ShotRecord>()

    private var initSize = 0 to 0
    private var turnState: TurnState? = null
    private var stateSince = 0L
    private var noStateSince = 0L
    private var gaFuture: Future<*>? = null
    private var gaCancel = AtomicBoolean(true)
    @Volatile private var suggestion: Suggestion? = null
    @Volatile private var gaProgress = ""
    private var shotDone = false
    private var lastMode = settings.mode

    /** true = your turn, false = opponent's, null = unknown (until you aim once). */
    private var myTurn: Boolean? = null

    /** Last aim seen on screen (board, arrow, when) – becomes a recorded shot once pieces move. */
    private var lastAim: Triple<TurnState, ArrowReading, Long>? = null
    private var pendingShot: Pair<TurnState, ArrowReading>? = null
    private var lastShotError: Double? = null
    @Volatile private var calibrating = false
    @Volatile private var calibrationStatus = ""

    @Volatile var reinitRequested = false
    @Volatile var analyzeRequested = false
    @Volatile var calibrateRequested = false
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
        analyzer.untilRest = true
        settings.physics?.let { analyzer.params = it }
        if (shotFile.exists()) shotFile.readLines().mapNotNullTo(shots) { ShotRecord.decode(it) }
    }

    val shotCount get() = shots.size

    fun process(screen: Mat): OverlayModel {
        val w = screen.cols()
        val h = screen.rows()
        val now = SystemClock.uptimeMillis()
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
                noStateSince = now
            } catch (e: InitError) {
                return OverlayModel(w, h, status = "Looking for the pitch… (${e.message}). Start a match.")
            }
        }
        if (calibrateRequested) {
            calibrateRequested = false
            startCalibration()
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
            val arrow = analyzer.readArrow(win)
            watcher.settle(win, analyzer.playground!!)
            if (arrow != null) myTurn = true // only your own aiming arrow is ever shown

            // Pieces cannot move while you are aiming; otherwise a piece leaving its spot means the
            // detection is stale – a shot is under way.
            if (turnState != null && arrow == null && watcher.moved(win, null)) {
                val aim = lastAim
                pendingShot = if (aim != null && now - aim.third < 1500) aim.first to aim.second else null
                // Every shot passes the turn (after a goal the side that conceded kicks off, which
                // is also the other side). Ignore a second move right after the board settled.
                if (now - stateSince > 1200) myTurn = myTurn?.not() ?: if (pendingShot != null) false else null
                clearBoard()
                noStateSince = now
            }

            // Read the board once the pitch is still (or after 2 s without a reading, or on request).
            val forced = analyzeRequested
            val waitedLong = turnState == null && now - noStateSince > 2000 && watcher.stillFrames >= 1
            if (forced || (turnState == null && (watcher.stillFrames >= STILL_FRAMES || waitedLong))) {
                analyzeRequested = false
                val st = analyzer.detectState(win)
                if (st != null) {
                    clearBoard()
                    turnState = st
                    stateSince = now
                    watcher.capture(win, st)
                    recordShot(st)
                    if (settings.mode != Mode.PREDICT) startSearch(st)
                } else {
                    noStateSince = now
                }
            }

            val st = turnState
                ?: return base.copy(
                    hint = calibrationStatus,
                    status = if (watcher.stillFrames >= STILL_FRAMES) "Pitch found – can't see the ball or your pieces (tap Analyze)" else "Pieces moving…",
                )

            val prediction = arrow?.let { analyzer.predictArrow(st, it) }
            if (arrow != null) lastAim = Triple(st, arrow, now)

            val sug = suggestion
            val turnOk = myTurn == true || !settings.useTurnCheck
            if (settings.mode == Mode.AUTO && sug != null && !shotDone && arrow == null && turnOk) {
                shotDone = true
                onShot?.invoke(sug.dragStart, scaleDrag(sug.dragStart, sug.dragEnd))
            }

            val hint = when {
                calibrationStatus.isNotEmpty() && calibrating -> calibrationStatus
                prediction != null -> ""
                settings.mode == Mode.PREDICT -> "Aim with your finger – the cyan line shows where the ball goes"
                sug == null -> gaProgress.ifEmpty { "Searching for the best shot…" }
                settings.mode == Mode.SUGGEST -> "Drag the circled piece back to the violet dot"
                else -> if (shotDone) "Shot played" else if (turnOk) "" else "Waiting for your turn to shoot"
            }
            val status = buildString {
                append("${st.screen.players.size} vs ${st.screen.opponents.size}")
                append(" · turn: " + when (myTurn) { true -> "you"; false -> "opponent"; null -> "?" })
                if (prediction != null) {
                    append(" · aim ${"%.0f".format(prediction.angleRef)}° force ${prediction.forceRef.toInt()}")
                    if (prediction.playerGoal) append(" · GOAL!")
                    if (prediction.opponentGoal) append(" · OWN GOAL!")
                }
                if (sug != null) append(" · best: fitness ${"%.0f".format(sug.action.fitness)}${if (sug.prediction.playerGoal) " (goal)" else ""}")
                lastShotError?.let { append(" · last shot: ball off by ${it.toInt()} px") }
                append(" · shots recorded: ${shots.size}")
                if (!calibrating && calibrationStatus.isNotEmpty()) append(" · $calibrationStatus")
                if (!analyzer.goalsFromTemplates) append(" · goals estimated")
            }
            return base.copy(turn = st, arrowPrediction = prediction, suggestion = sug, hint = hint, status = status)
        } finally {
            win.release()
        }
    }

    /** A shot you aimed has finished: store before/aim/after and show how far off the prediction was. */
    private fun recordShot(after: TurnState) {
        val (before, arrow) = pendingShot ?: return
        pendingShot = null
        // A goal resets the pieces to kick-off: the "after" board is not the shot's result.
        val pg = after.ref.playground
        val centre = Point(pg.x + pg.w / 2, pg.y + pg.h / 2)
        if (hypot(after.ref.ball.x - centre.x, after.ref.ball.y - centre.y) < 15) return
        val idx = analyzer.closestPlayer(before, arrow)
        val rec = ShotRecord(before.ref, idx, arrow.angleDeg, arrow.force.toDouble(), after.ref)
        lastShotError = Calibration.error(analyzer.params, rec).ball
        shots.add(rec)
        while (shots.size > MAX_SHOTS) shots.removeAt(0)
        runCatching { shotFile.writeText(shots.joinToString("\n") { it.encode() }) }
    }

    private fun startCalibration() {
        if (calibrating) return
        if (shots.size < 3) {
            calibrationStatus = "Calibrate needs at least 3 recorded shots (have ${shots.size}). Play a few shots in Predict mode first."
            return
        }
        calibrating = true
        val data = shots.toList()
        val start = analyzer.params
        calibrationStatus = "Calibrating on ${data.size} shots…"
        gaRunner.submit {
            try {
                val before = Calibration.meanBallError(start, data)
                val fitted = Calibration.fit(
                    data, start, gaPool,
                    onProgress = { i, e -> calibrationStatus = "Calibrating $i/60 – ball error ${before.toInt()} → ${e.toInt()} px" },
                )
                val after = Calibration.meanBallError(fitted, data)
                if (after < before) {
                    analyzer.params = fitted
                    settings.physics = fitted
                    calibrationStatus = "Calibrated on ${data.size} shots: ball error ${before.toInt()} → ${after.toInt()} px"
                } else {
                    calibrationStatus = "Calibration did not improve (${before.toInt()} px) – kept the old physics"
                }
            } catch (e: Exception) {
                calibrationStatus = "Calibration failed: ${e.message}"
            } finally {
                calibrating = false
            }
        }
    }

    fun resetCalibration() {
        settings.physics = null
        analyzer.params = ssbot.core.SimParameters.REPORT_3
        calibrationStatus = "Physics reset to the bot's original values"
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
        /** Consecutive still frames before the board is read (~0.2 s). */
        private const val STILL_FRAMES = 2
        private const val MAX_SHOTS = 40
    }
}
