package ssbot.core.physics

import kotlin.math.pow
import kotlin.math.sqrt

/**
 * A minimal, line-by-line port of the parts of Chipmunk2D (the engine behind pymunk)
 * that the original bot's `environment.py` uses:
 *
 *  - dynamic circle bodies (pieces and ball)
 *  - static segment walls with a radius (`walls_thickness`)
 *  - a PivotJoint to the static body with `max_bias = 0`, which acts as
 *    "top-down friction" limited by `max_force`
 *  - default space settings: 10 iterations, no gravity, damping 1,
 *    collision slop 0.1, collision bias (1 - 0.1)^60, persistence 3
 *
 * The step order, solver, warm starting and arbiter caching follow
 * cpSpaceStep.c / cpArbiter.c / cpPivotJoint.c so trajectories match pymunk.
 */
class Body(mass: Double, moment: Double) {
    val isStatic = mass.isInfinite()
    val mInv = if (isStatic) 0.0 else 1.0 / mass
    val iInv = if (isStatic) 0.0 else 1.0 / moment

    var px = 0.0
    var py = 0.0
    var vx = 0.0
    var vy = 0.0
    var w = 0.0
    var angle = 0.0

    var vbx = 0.0
    var vby = 0.0
    var wBias = 0.0

    fun applyImpulse(jx: Double, jy: Double, rx: Double, ry: Double) {
        vx += jx * mInv
        vy += jy * mInv
        w += iInv * (rx * jy - ry * jx)
    }

    fun applyBiasImpulse(jx: Double, jy: Double, rx: Double, ry: Double) {
        vbx += jx * mInv
        vby += jy * mInv
        wBias += iInv * (rx * jy - ry * jx)
    }

    /** pymunk `body.apply_impulse_at_local_point(impulse, (0, 0))`. */
    fun applyImpulseAtCenter(jx: Double, jy: Double) {
        val c = kotlin.math.cos(angle)
        val s = kotlin.math.sin(angle)
        applyImpulse(c * jx - s * jy, s * jx + c * jy, 0.0, 0.0)
    }

    companion object {
        fun static() = Body(Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY)

        /** pymunk.moment_for_circle(mass, 0, radius, (0, 0)) */
        fun momentForCircle(m: Double, r1: Double, r2: Double) = m * (0.5 * (r1 * r1 + r2 * r2))
    }
}

sealed class Shape(val body: Body, val radius: Double) {
    var elasticity = 0.0
    var friction = 0.0
    internal var id = -1
}

class Circle(body: Body, radius: Double) : Shape(body, radius)

class Segment(body: Body, val ax: Double, val ay: Double, val bx: Double, val by: Double, radius: Double) :
    Shape(body, radius) {
    // Shape type order matches Chipmunk: circle (0) < segment (1).
}

/** cpPivotJoint between the static body (anchor 0,0) and [body] (anchor 0,0). */
class PivotJoint(private val a: Body, private val b: Body) {
    var maxForce = Double.POSITIVE_INFINITY
    var maxBias = Double.POSITIVE_INFINITY
    private val errorBias = (1.0 - 0.1).pow(60.0)

    private var r1x = 0.0
    private var r1y = 0.0
    private var r2x = 0.0
    private var r2y = 0.0
    private var k11 = 0.0
    private var k12 = 0.0
    private var k21 = 0.0
    private var k22 = 0.0
    private var biasX = 0.0
    private var biasY = 0.0
    private var jAccX = 0.0
    private var jAccY = 0.0

    internal fun preStep(dt: Double) {
        // Anchors are (0,0) and the cog is (0,0), so r1 = r2 = 0 after rotation.
        r1x = 0.0; r1y = 0.0; r2x = 0.0; r2y = 0.0

        val mSum = a.mInv + b.mInv
        var a11 = mSum
        var a12 = 0.0
        var a21 = 0.0
        var a22 = mSum
        val r1xsq = r1x * r1x * a.iInv
        val r1ysq = r1y * r1y * a.iInv
        val r1nxy = -r1x * r1y * a.iInv
        a11 += r1ysq; a12 += r1nxy; a21 += r1nxy; a22 += r1xsq
        val r2xsq = r2x * r2x * b.iInv
        val r2ysq = r2y * r2y * b.iInv
        val r2nxy = -r2x * r2y * b.iInv
        a11 += r2ysq; a12 += r2nxy; a21 += r2nxy; a22 += r2xsq
        val det = a11 * a22 - a12 * a21
        val detInv = 1.0 / det
        k11 = a22 * detInv; k12 = -a12 * detInv
        k21 = -a21 * detInv; k22 = a11 * detInv

        val dx = (b.px + r2x) - (a.px + r1x)
        val dy = (b.py + r2y) - (a.py + r1y)
        val coef = -(1.0 - errorBias.pow(dt)) / dt
        val c = clamp(dx * coef, dy * coef, maxBias)
        biasX = c[0]; biasY = c[1]
    }

    internal fun applyCachedImpulse(dtCoef: Double) {
        applyImpulses(a, b, r1x, r1y, r2x, r2y, jAccX * dtCoef, jAccY * dtCoef)
    }

    internal fun applyImpulse(dt: Double) {
        val vrx = (b.vx + -r2y * b.w) - (a.vx + -r1y * a.w)
        val vry = (b.vy + r2x * b.w) - (a.vy + r1x * a.w)
        val ex = biasX - vrx
        val ey = biasY - vry
        val jx = ex * k11 + ey * k12
        val jy = ex * k21 + ey * k22
        val oldX = jAccX
        val oldY = jAccY
        val c = clamp(jAccX + jx, jAccY + jy, maxForce * dt)
        jAccX = c[0]; jAccY = c[1]
        applyImpulses(a, b, r1x, r1y, r2x, r2y, jAccX - oldX, jAccY - oldY)
    }

    private fun clamp(x: Double, y: Double, len: Double): DoubleArray {
        return if (x * x + y * y > len * len) {
            val inv = 1.0 / (sqrt(x * x + y * y) + java.lang.Double.MIN_NORMAL)
            doubleArrayOf(x * inv * len, y * inv * len)
        } else doubleArrayOf(x, y)
    }
}

internal fun applyImpulses(a: Body, b: Body, r1x: Double, r1y: Double, r2x: Double, r2y: Double, jx: Double, jy: Double) {
    a.applyImpulse(-jx, -jy, r1x, r1y)
    b.applyImpulse(jx, jy, r2x, r2y)
}

private enum class ArbiterState { FIRST_COLLISION, NORMAL, CACHED }

private class Arbiter(var a: Shape, var b: Shape) {
    var state = ArbiterState.FIRST_COLLISION
    var stamp = 0L
    var count = 0

    var nx = 0.0
    var ny = 0.0
    var e = 0.0
    var u = 0.0

    // Single contact (circle/circle and circle/segment produce at most one).
    var r1x = 0.0
    var r1y = 0.0
    var r2x = 0.0
    var r2y = 0.0
    var nMass = 0.0
    var tMass = 0.0
    var bias = 0.0
    var jBias = 0.0
    var bounce = 0.0
    var jnAcc = 0.0
    var jtAcc = 0.0
}

class Space {
    var iterations = 10
    var collisionSlop = 0.1
    var collisionBias = (1.0 - 0.1).pow(60.0)
    var collisionPersistence = 3

    /** cpSpace damping: fraction of velocity kept per second (1 = none, as in the bot). */
    var damping = 1.0

    /** True when every dynamic body is (almost) at rest. */
    fun isAtRest(speed: Double = 1.0): Boolean = bodies.all { it.vx * it.vx + it.vy * it.vy < speed * speed }

    val staticBody = Body.static()

    private val bodies = ArrayList<Body>()
    private val dynamicShapes = ArrayList<Shape>()
    private val staticShapes = ArrayList<Shape>()
    private val constraints = ArrayList<PivotJoint>()

    private val arbiters = ArrayList<Arbiter>()
    private val cachedArbiters = HashMap<Long, Arbiter>()

    private var stamp = 0L
    private var currDt = 0.0

    fun addBody(body: Body) {
        bodies.add(body)
    }

    fun addShape(shape: Shape) {
        shape.id = dynamicShapes.size + staticShapes.size
        if (shape.body.isStatic) staticShapes.add(shape) else dynamicShapes.add(shape)
    }

    fun addConstraint(joint: PivotJoint) {
        constraints.add(joint)
    }

    fun step(dt: Double) {
        if (dt == 0.0) return
        stamp++
        val prevDt = currDt
        currDt = dt

        for (arb in arbiters) arb.state = ArbiterState.NORMAL
        arbiters.clear()

        // Integrate positions.
        for (body in bodies) {
            body.px += (body.vx + body.vbx) * dt
            body.py += (body.vy + body.vby) * dt
            body.angle += (body.w + body.wBias) * dt
            body.vbx = 0.0; body.vby = 0.0; body.wBias = 0.0
        }

        // Find colliding pairs.
        for (i in dynamicShapes.indices) {
            val a = dynamicShapes[i]
            for (s in staticShapes) collide(a, s)
            for (j in i + 1 until dynamicShapes.size) collide(a, dynamicShapes[j])
        }

        // Clear out old cached arbiters.
        val it = cachedArbiters.values.iterator()
        while (it.hasNext()) {
            val arb = it.next()
            val ticks = stamp - arb.stamp
            if (ticks >= 1 && arb.state != ArbiterState.CACHED) arb.state = ArbiterState.CACHED
            if (ticks >= collisionPersistence) {
                arb.count = 0
                it.remove()
            }
        }

        // Prestep.
        val slop = collisionSlop
        val biasCoef = 1.0 - collisionBias.pow(dt)
        for (arb in arbiters) preStep(arb, dt, slop, biasCoef)
        for (c in constraints) c.preStep(dt)

        // Integrate velocities: no gravity or forces; v = v * damping^dt (damping 1 in the bot).
        val damp = damping.pow(dt)
        for (body in bodies) {
            body.vx = body.vx * damp + 0.0 * dt
            body.vy = body.vy * damp + 0.0 * dt
            body.w = body.w * damp + 0.0 * dt
        }

        val dtCoef = if (prevDt == 0.0) 0.0 else dt / prevDt
        for (arb in arbiters) applyCachedImpulse(arb, dtCoef)
        for (c in constraints) c.applyCachedImpulse(dtCoef)

        for (i in 0 until iterations) {
            for (arb in arbiters) applyImpulse(arb)
            for (c in constraints) c.applyImpulse(dt)
        }
    }

    private fun collide(s1: Shape, s2: Shape) {
        if (s1.body === s2.body) return
        // Chipmunk orders the pair by shape type (circle before segment).
        val a: Shape
        val b: Shape
        if (s1 is Segment && s2 is Circle) { a = s2; b = s1 } else { a = s1; b = s2 }

        var nx: Double
        var ny: Double
        val p1x: Double
        val p1y: Double
        val p2x: Double
        val p2y: Double

        if (b is Circle) {
            val mindist = a.radius + b.radius
            val dx = b.body.px - a.body.px
            val dy = b.body.py - a.body.py
            val distsq = dx * dx + dy * dy
            if (distsq >= mindist * mindist) return
            val dist = sqrt(distsq)
            if (dist != 0.0) { nx = dx * (1.0 / dist); ny = dy * (1.0 / dist) } else { nx = 1.0; ny = 0.0 }
            p1x = a.body.px + nx * a.radius
            p1y = a.body.py + ny * a.radius
            p2x = b.body.px + nx * -b.radius
            p2y = b.body.py + ny * -b.radius
        } else {
            b as Segment
            val cx = a.body.px
            val cy = a.body.py
            val sdx = b.bx - b.ax
            val sdy = b.by - b.ay
            val t = ((sdx * (cx - b.ax) + sdy * (cy - b.ay)) / (sdx * sdx + sdy * sdy)).coerceIn(0.0, 1.0)
            val closestX = b.ax + sdx * t
            val closestY = b.ay + sdy * t
            val mindist = a.radius + b.radius
            val dx = closestX - cx
            val dy = closestY - cy
            val distsq = dx * dx + dy * dy
            if (distsq >= mindist * mindist) return
            val dist = sqrt(distsq)
            if (dist != 0.0) {
                nx = dx * (1.0 / dist); ny = dy * (1.0 / dist)
            } else {
                // segment->tn: normalized perpendicular of (b - a)
                val len = sqrt(sdx * sdx + sdy * sdy)
                nx = -sdy / len; ny = sdx / len
            }
            p1x = cx + nx * a.radius
            p1y = cy + ny * a.radius
            p2x = closestX + nx * -b.radius
            p2y = closestY + ny * -b.radius
        }

        val key = pairKey(a.id, b.id)
        val arb = cachedArbiters.getOrPut(key) { Arbiter(a, b) }

        // cpArbiterUpdate
        arb.a = a; arb.b = b
        val newR1x = p1x - a.body.px
        val newR1y = p1y - a.body.py
        val newR2x = p2x - b.body.px
        val newR2y = p2y - b.body.py
        var jn = 0.0
        var jt = 0.0
        if (arb.count > 0) { jn = arb.jnAcc; jt = arb.jtAcc }
        arb.r1x = newR1x; arb.r1y = newR1y; arb.r2x = newR2x; arb.r2y = newR2y
        arb.jnAcc = jn; arb.jtAcc = jt
        arb.count = 1
        arb.nx = nx; arb.ny = ny
        arb.e = a.elasticity * b.elasticity
        arb.u = a.friction * b.friction
        if (arb.state == ArbiterState.CACHED) arb.state = ArbiterState.FIRST_COLLISION

        arbiters.add(arb)
        arb.stamp = stamp
    }

    private fun pairKey(i: Int, j: Int): Long {
        val lo = minOf(i, j).toLong()
        val hi = maxOf(i, j).toLong()
        return (hi shl 32) or lo
    }

    private fun kScalarBody(body: Body, rx: Double, ry: Double, nx: Double, ny: Double): Double {
        val rcn = rx * ny - ry * nx
        return body.mInv + body.iInv * rcn * rcn
    }

    private fun preStep(arb: Arbiter, dt: Double, slop: Double, bias: Double) {
        val a = arb.a.body
        val b = arb.b.body
        val nx = arb.nx
        val ny = arb.ny
        val bdx = b.px - a.px
        val bdy = b.py - a.py

        arb.nMass = 1.0 / (kScalarBody(a, arb.r1x, arb.r1y, nx, ny) + kScalarBody(b, arb.r2x, arb.r2y, nx, ny))
        arb.tMass = 1.0 / (kScalarBody(a, arb.r1x, arb.r1y, -ny, nx) + kScalarBody(b, arb.r2x, arb.r2y, -ny, nx))

        val dist = ((arb.r2x - arb.r1x) + bdx) * nx + ((arb.r2y - arb.r1y) + bdy) * ny
        arb.bias = -bias * minOf(0.0, dist + slop) / dt
        arb.jBias = 0.0

        val vrx = (b.vx + -arb.r2y * b.w) - (a.vx + -arb.r1y * a.w)
        val vry = (b.vy + arb.r2x * b.w) - (a.vy + arb.r1x * a.w)
        arb.bounce = (vrx * nx + vry * ny) * arb.e
    }

    private fun applyCachedImpulse(arb: Arbiter, dtCoef: Double) {
        if (arb.state == ArbiterState.FIRST_COLLISION) return
        val nx = arb.nx
        val ny = arb.ny
        // cpvrotate(n, (jnAcc, jtAcc))
        val jx = nx * arb.jnAcc - ny * arb.jtAcc
        val jy = nx * arb.jtAcc + ny * arb.jnAcc
        applyImpulses(arb.a.body, arb.b.body, arb.r1x, arb.r1y, arb.r2x, arb.r2y, jx * dtCoef, jy * dtCoef)
    }

    private fun applyImpulse(arb: Arbiter) {
        val a = arb.a.body
        val b = arb.b.body
        val nx = arb.nx
        val ny = arb.ny
        val r1x = arb.r1x
        val r1y = arb.r1y
        val r2x = arb.r2x
        val r2y = arb.r2y

        val vb1x = a.vbx + -r1y * a.wBias
        val vb1y = a.vby + r1x * a.wBias
        val vb2x = b.vbx + -r2y * b.wBias
        val vb2y = b.vby + r2x * b.wBias
        // surface_vr is zero for these shapes.
        val vrx = (b.vx + -r2y * b.w) - (a.vx + -r1y * a.w) + 0.0
        val vry = (b.vy + r2x * b.w) - (a.vy + r1x * a.w) + 0.0

        val vbn = (vb2x - vb1x) * nx + (vb2y - vb1y) * ny
        val vrn = vrx * nx + vry * ny
        val vrt = vrx * -ny + vry * nx

        val jbn = (arb.bias - vbn) * arb.nMass
        val jbnOld = arb.jBias
        arb.jBias = maxOf(jbnOld + jbn, 0.0)

        val jn = -(arb.bounce + vrn) * arb.nMass
        val jnOld = arb.jnAcc
        arb.jnAcc = maxOf(jnOld + jn, 0.0)

        val jtMax = arb.u * arb.jnAcc
        val jt = -vrt * arb.tMass
        val jtOld = arb.jtAcc
        arb.jtAcc = (jtOld + jt).coerceIn(-jtMax, jtMax)

        val bj = arb.jBias - jbnOld
        a.applyBiasImpulse(-nx * bj, -ny * bj, r1x, r1y)
        b.applyBiasImpulse(nx * bj, ny * bj, r2x, r2y)

        val djn = arb.jnAcc - jnOld
        val djt = arb.jtAcc - jtOld
        val jx = nx * djn - ny * djt
        val jy = nx * djt + ny * djn
        applyImpulses(a, b, r1x, r1y, r2x, r2y, jx, jy)
    }
}
