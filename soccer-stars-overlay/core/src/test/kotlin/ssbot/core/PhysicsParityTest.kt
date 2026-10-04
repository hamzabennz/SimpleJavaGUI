package ssbot.core

import org.json.JSONArray
import org.json.JSONObject
import ssbot.core.physics.Environment
import java.io.File
import kotlin.math.hypot
import kotlin.test.Test
import kotlin.test.assertTrue

/** Compares the Kotlin physics port with the original pymunk environment (fixtures from tools/make_physics_fixtures.py). */
class PhysicsParityTest {
    private fun fixtures() = JSONObject(File(System.getProperty("ssbot.fixtures"), "physics_fixtures.json").readText())

    private fun JSONArray.point(i: Int) = getJSONArray(i).let { Point(it.getDouble(0), it.getDouble(1)) }
    private fun JSONArray.rect(i: Int) = getJSONArray(i).let { Rect(it.getDouble(0), it.getDouble(1), it.getDouble(2), it.getDouble(3)) }

    private fun state(a: JSONArray) = GameState(
        List(a.getJSONArray(0).length()) { a.getJSONArray(0).point(it) },
        List(a.getJSONArray(1).length()) { a.getJSONArray(1).point(it) },
        a.getJSONArray(2).let { Point(it.getDouble(0), it.getDouble(1)) },
        a.rect(3), a.rect(4), a.rect(5),
    )

    @Test
    fun matchesPymunk() {
        val fx = fixtures()
        val params = SimParameters.parse(List(9) { fx.getJSONArray("params").getDouble(it) })
        val states = fx.getJSONArray("states").let { s -> List(s.length()) { state(s.getJSONArray(it)) } }
        val cases = fx.getJSONArray("cases")
        val finalErrors = ArrayList<Double>()
        var goalMismatch = 0
        val perStep = sortedMapOf<Int, MutableList<Double>>()
        for (c in 0 until cases.length()) {
            val case = cases.getJSONObject(c)
            val env = Environment(states[case.getInt("state")], params).simulate()
            Environment.shoot(env.playersShapes[case.getInt("player") - 1], case.getDouble("angle"), case.getDouble("force"))
            val shapes = listOf(env.ballShape) + env.playersShapes + env.opponentShapes
            val snaps = case.getJSONArray("snaps")
            var si = 0
            for (step in 1..500) {
                env.space.step(1.0 / 120)
                val snap = snaps.getJSONObject(si)
                if (snap.getInt("step") == step) {
                    val bodies = snap.getJSONArray("bodies")
                    val err = shapes.indices.maxOf { hypot(shapes[it].body.px - bodies.point(it).x, shapes[it].body.py - bodies.point(it).y) }
                    perStep.getOrPut(step) { ArrayList() }.add(err)
                    if (step == 500) finalErrors.add(err)
                    si = minOf(si + 1, snaps.length() - 1)
                }
            }
            if (env.checkPlayerGoalScored() != case.getBoolean("playerGoal") || env.checkOpponentGoalScored() != case.getBoolean("opponentGoal")) goalMismatch++
        }
        for ((step, errs) in perStep) {
            val s = errs.sorted()
            println("step %3d: median %.3g  p90 %.3g  max %.3g px".format(step, s[s.size / 2], s[s.size * 9 / 10], s.last()))
        }
        val sorted = finalErrors.sorted()
        println("cases=${finalErrors.size} exact(<1e-6)=${finalErrors.count { it < 1e-6 }} under1px=${finalErrors.count { it < 1.0 }} goalMismatch=$goalMismatch")
        assertTrue(sorted.last() < 1e-3, "every shot should match pymunk")
    }
}
