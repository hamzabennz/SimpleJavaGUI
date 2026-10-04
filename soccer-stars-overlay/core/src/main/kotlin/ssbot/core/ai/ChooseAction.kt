package ssbot.core.ai

import ssbot.core.GameState
import ssbot.core.Point
import ssbot.core.SimParameters
import ssbot.core.physics.Environment
import java.util.concurrent.Callable
import java.util.concurrent.ExecutorService
import kotlin.math.abs
import kotlin.math.round
import kotlin.math.sqrt
import kotlin.random.Random

/** One shot: [player_id (1-based), angle in degrees, force]. Port of the bot's `chromosome.py`. */
class Chromosome(var playerId: Int, var angle: Double, var force: Double) {
    var fitness = 0.0

    fun copyAction() = Chromosome(playerId, angle, force)

    override fun toString() = "[$playerId, $angle, $force] fitness=$fitness"
}

data class ShotResult(val fitness: Double, val ballEnd: Point)

/** Longest simulated shot when running until rest: 20 s. */
const val MAX_STEPS = 2400

/**
 * Port of `Chromosome.calculate_fitness`. With [untilRest] the shot is simulated until everything
 * stops (the bot cut it off after 500 steps = 4.2 s, which ends long shots mid-flight).
 */
fun evaluateShot(
    state: GameState,
    params: SimParameters,
    playerId: Int,
    angle: Double,
    force: Double,
    untilRest: Boolean = false,
): ShotResult {
    val env = Environment(state, params).simulate()
    env.shootScaled(env.playersShapes[playerId - 1], round(angle), round(force))
    if (untilRest) env.run(MAX_STEPS, 1.0 / 120, untilRest = true) else env.run(500, 1.0 / 120)

    val ball = env.ballPosition()
    val fitness = when {
        env.checkPlayerGoalScored() -> 100.0
        env.checkOpponentGoalScored() -> -10000.0
        else -> {
            val g = state.opponentGoal
            // Kept exactly as in the bot (note the goal "end" uses y - h).
            -distanceToLine(ball, Point(g.x, g.y), Point(g.x, g.y - g.h))
        }
    }
    return ShotResult(fitness, ball)
}

private fun distanceToLine(p: Point, a: Point, b: Point): Double {
    val (x, y) = p
    val (x1, y1) = a
    val (x2, y2) = b
    return abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / sqrt((y2 - y1) * (y2 - y1) + (x2 - x1) * (x2 - x1))
}

/**
 * Port of `evolutionary.py` + `choose_action.py`:
 * tournament parent selection, one-point crossover, mutation, (mu + lambda) survival,
 * stopping early as soon as a goal-scoring shot (fitness > 0) is found.
 *
 * Fitness evaluations are independent, so they are run in parallel on [executor];
 * the random choices are still made sequentially, exactly in the bot's order.
 */
class ChooseAction(
    private val nIter: Int = 50,
    private val populationSize: Int = 50,
    private val mutProb: Double = 0.9,
    private val recombProb: Double = 0.5,
    private val minForce: Double = 10.0,
    private val maxForce: Double = 10000.0,
    private val state: GameState,
    private val params: SimParameters,
    private val random: Random = Random.Default,
    private val executor: ExecutorService? = null,
    private val onIteration: (iter: Int, best: Chromosome) -> Unit = { _, _ -> },
    private val isCancelled: () -> Boolean = { false },
    private val untilRest: Boolean = false,
) {
    private val nPlayers = state.players.size
    val fitnessHistory = ArrayList<Double>()
    lateinit var bestAction: Chromosome
        private set

    private fun randomChromosome() = Chromosome(
        random.nextInt(1, nPlayers + 1),
        random.nextDouble(0.0, 360.0),
        random.nextDouble(minForce, maxForce),
    )

    private fun evaluate(list: List<Chromosome>) {
        val ex = executor
        if (ex == null) {
            for (c in list) c.fitness = evaluateShot(state, params, c.playerId, c.angle, c.force, untilRest).fitness
        } else {
            val futures = list.map { c -> ex.submit(Callable { evaluateShot(state, params, c.playerId, c.angle, c.force, untilRest).fitness }) }
            futures.forEachIndexed { i, f -> list[i].fitness = f.get() }
        }
    }

    private fun mutate(c: Chromosome) {
        if (random.nextDouble() <= mutProb) c.playerId = random.nextInt(1, nPlayers + 1)
        if (random.nextDouble() <= mutProb) {
            val newDeg = c.angle + random.nextDouble(-10.0, 10.0)
            c.angle = minOf(maxOf(0.0, newDeg), 360.0)
        }
        if (random.nextDouble() <= mutProb) {
            val newForce = c.force + random.nextDouble(-200.0, 200.0)
            c.force = minOf(maxOf(minForce, newForce), maxForce)
        }
    }

    private fun tournament(pop: List<Chromosome>, k: Int): Chromosome {
        val sample = pop.shuffled(random).take(k)
        return sample.sortedByDescending { it.fitness }[0]
    }

    fun search(): Chromosome {
        require(nPlayers > 0) { "No players detected" }
        var population = List(populationSize) { randomChromosome() }
        evaluate(population)

        for (iter in 0 until nIter) {
            if (isCancelled()) break
            val k = maxOf(2, population.size * iter / nIter)
            val parents = List(populationSize) { tournament(population, k) }

            val youngs = ArrayList<Chromosome>()
            repeat(populationSize / 2) {
                val p0 = parents[random.nextInt(parents.size)]
                val p1 = parents[random.nextInt(parents.size)]
                val y1: Chromosome
                val y2: Chromosome
                if (random.nextDouble() <= recombProb) {
                    val cp = random.nextInt(1, 3)
                    val g0 = genes(p0)
                    val g1 = genes(p1)
                    y1 = fromGenes(g0.take(cp) + g1.drop(cp))
                    y2 = fromGenes(g1.take(cp) + g0.drop(cp))
                } else {
                    y1 = p0.copyAction()
                    y2 = p1.copyAction()
                }
                youngs.add(y1); youngs.add(y2)
            }
            youngs.forEach(::mutate)
            evaluate(youngs)

            population = (population + youngs).sortedByDescending { it.fitness }.take(populationSize)
            fitnessHistory.add(population.sumOf { it.fitness } / populationSize)
            val best = population[0]
            onIteration(iter + 1, best)
            if (best.fitness > 0) break
        }
        bestAction = population.maxBy { it.fitness }
        return bestAction
    }

    private fun genes(c: Chromosome) = listOf<Number>(c.playerId, c.angle, c.force)
    private fun fromGenes(g: List<Number>) = Chromosome(g[0].toInt(), g[1].toDouble(), g[2].toDouble())
}
