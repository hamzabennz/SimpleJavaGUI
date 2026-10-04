package ssbot.core.ai

import ssbot.core.GameState
import ssbot.core.Point
import ssbot.core.SimParameters
import ssbot.core.physics.Environment
import java.util.concurrent.Callable
import java.util.concurrent.ExecutorService
import kotlin.math.hypot
import kotlin.math.min
import kotlin.random.Random

/**
 * One real shot seen on screen, in reference-window pixels: the board before, the aim that was
 * on screen when the finger was released (piece index, angle, bot force = arrow length x 100),
 * and the board after everything stopped.
 */
data class ShotRecord(
    val before: GameState,
    val pieceIndex: Int,
    val angle: Double,
    val force: Double,
    val after: GameState,
) {
    fun encode(): String = buildString {
        append(pieceIndex).append(';').append(angle).append(';').append(force).append(';')
        append(encodeState(before)).append(';').append(encodeState(after))
    }

    companion object {
        private fun pts(l: List<Point>) = l.joinToString(" ") { "${it.x},${it.y}" }
        private fun parsePts(s: String) = if (s.isBlank()) emptyList() else s.split(' ').map { p ->
            p.split(',').let { Point(it[0].toDouble(), it[1].toDouble()) }
        }
        private fun rect(r: ssbot.core.Rect) = "${r.x},${r.y},${r.w},${r.h}"
        private fun parseRect(s: String) = s.split(',').map { it.toDouble() }.let { ssbot.core.Rect(it[0], it[1], it[2], it[3]) }

        private fun encodeState(g: GameState) =
            listOf(pts(g.players), pts(g.opponents), "${g.ball.x},${g.ball.y}", rect(g.playerGoal), rect(g.opponentGoal), rect(g.playground)).joinToString("|")

        private fun decodeState(s: String): GameState {
            val f = s.split('|')
            return GameState(parsePts(f[0]), parsePts(f[1]), parsePts(f[2])[0], parseRect(f[3]), parseRect(f[4]), parseRect(f[5]))
        }

        fun decode(line: String): ShotRecord? = runCatching {
            val f = line.split(';')
            ShotRecord(decodeState(f[3]), f[0].toInt(), f[1].toDouble(), f[2].toDouble(), decodeState(f[4]))
        }.getOrNull()
    }
}

/** How far a simulated shot ended from what really happened (reference pixels). */
data class ShotError(val ball: Double, val pieces: Double) {
    val cost get() = 2 * ball + pieces
}

/**
 * Fits the physics parameters to real shots, like the bot's simulate.py / sim_chromosome.py
 * (which fitted one shot), but over every recorded shot and with the aim known from the arrow.
 * Fitted: masses, elasticities, friction (max_force), damping and the arrow-force scale.
 * Radii and wall thickness stay as the bot measured them.
 */
object Calibration {
    private val ranges = listOf(
        5.0 to 100.0, // player mass
        0.0 to 1.0, // player elasticity
        2.0 to 100.0, // ball mass
        0.0 to 1.0, // ball elasticity
        0.0 to 1.0, // walls elasticity
        50.0 to 6000.0, // max_force (friction)
        0.05 to 1.0, // damping
        0.2 to 4.0, // force scale
    )

    private fun genes(p: SimParameters) = doubleArrayOf(
        p.playerMass, p.playerElasticity, p.ballMass, p.ballElasticity, p.wallsElasticity, p.maxForce, p.damping, p.forceScale,
    )

    private fun params(base: SimParameters, g: DoubleArray) = base.copy(
        playerMass = g[0], playerElasticity = g[1], ballMass = g[2], ballElasticity = g[3],
        wallsElasticity = g[4], maxForce = g[5], damping = g[6], forceScale = g[7],
    )

    fun error(p: SimParameters, shot: ShotRecord): ShotError {
        val env = Environment(shot.before, p).simulate()
        if (shot.pieceIndex !in env.playersShapes.indices) return ShotError(300.0, 0.0)
        env.shootScaled(env.playersShapes[shot.pieceIndex], shot.angle, shot.force)
        env.run(MAX_STEPS, 1.0 / 120, untilRest = true)
        val (ball, players, opponents) = env.positions()
        val ballErr = min(300.0, dist(ball, shot.after.ball))
        val pieceErr = matchError(players, shot.after.players) + matchError(opponents, shot.after.opponents)
        return ShotError(ballErr, pieceErr)
    }

    /** Greedy nearest matching between simulated and detected pieces of one team; each error capped. */
    private fun matchError(sim: List<Point>, real: List<Point>): Double {
        val left = real.toMutableList()
        var sum = 0.0
        for (s in sim) {
            if (left.isEmpty()) break
            val best = left.minBy { dist(it, s) }
            sum += min(150.0, dist(best, s))
            left.remove(best)
        }
        return sum
    }

    fun meanBallError(p: SimParameters, shots: List<ShotRecord>) = shots.map { error(p, it).ball }.average()

    private fun cost(p: SimParameters, shots: List<ShotRecord>) = shots.sumOf { error(p, it).cost } / shots.size

    fun fit(
        shots: List<ShotRecord>,
        start: SimParameters,
        executor: ExecutorService?,
        iterations: Int = 60,
        population: Int = 40,
        random: Random = Random.Default,
        onProgress: (iter: Int, bestBallError: Double) -> Unit = { _, _ -> },
        isCancelled: () -> Boolean = { false },
    ): SimParameters {
        require(shots.isNotEmpty())
        fun clampGenes(g: DoubleArray) = DoubleArray(g.size) { g[it].coerceIn(ranges[it].first, ranges[it].second) }
        fun evaluate(pop: List<DoubleArray>): List<Double> {
            val ex = executor ?: return pop.map { cost(params(start, it), shots) }
            return pop.map { g -> ex.submit(Callable { cost(params(start, g), shots) }) }.map { it.get() }
        }

        // Start from the current parameters plus random variations of them.
        var pop = List(population) { i ->
            if (i == 0) clampGenes(genes(start)) else clampGenes(DoubleArray(ranges.size) { k ->
                val (lo, hi) = ranges[k]
                if (i < population / 2) genes(start)[k] + random.nextDouble(-0.25, 0.25) * (hi - lo)
                else random.nextDouble(lo, hi)
            })
        }
        var costs = evaluate(pop)
        for (iter in 1..iterations) {
            if (isCancelled()) break
            val order = costs.indices.sortedBy { costs[it] }
            val elite = order.take(population / 4).map { pop[it] }
            val children = List(population - elite.size) {
                val a = elite[random.nextInt(elite.size)]
                val b = elite[random.nextInt(elite.size)]
                clampGenes(DoubleArray(ranges.size) { k ->
                    val (lo, hi) = ranges[k]
                    val v = if (random.nextBoolean()) a[k] else b[k]
                    if (random.nextDouble() < 0.5) v + random.nextDouble(-0.08, 0.08) * (hi - lo) else v
                })
            }
            val childCosts = evaluate(children)
            pop = elite + children
            costs = order.take(elite.size).map { costs[it] } + childCosts
            val best = pop[costs.indices.minBy { costs[it] }]
            onProgress(iter, meanBallError(params(start, best), shots))
        }
        return params(start, pop[costs.indices.minBy { costs[it] }])
    }

    private fun dist(a: Point, b: Point) = hypot(a.x - b.x, a.y - b.y)
}
