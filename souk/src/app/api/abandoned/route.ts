import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { DZ_PHONE, normalizePhone } from "@/lib/forms";

const Body = z.object({
  visitorId: z.string().regex(/^[a-z0-9]{8,40}$/).optional(),
  form: z.record(z.string().max(500)).default({}),
  lines: z.array(z.object({ productId: z.string(), variantId: z.string().nullish(), qty: z.number(), name: z.string().max(200), variant: z.string().nullish(), price: z.number() })).max(50),
});

/**
 * Saved carts & abandoned checkouts.
 * - Cart changed, no phone yet  → row keyed by visitorId (stage "cart")
 * - Phone typed in order form   → row keyed by phone (stage "checkout"), visitor row merged into it
 */
const hits = new Map<string, number[]>();
function limited(key: string, max = 60, windowMs = 10 * 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 50_000) hits.clear(); // bound memory
  return arr.length > max;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (limited(ip)) return NextResponse.json({}, { status: 429 });
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({}, { status: 404 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({}, { status: 400 });
  const { visitorId, form, lines } = b.data;
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const phone = normalizePhone(form.phone ?? "");

  if (!DZ_PHONE.test(phone)) {
    if (!visitorId) return NextResponse.json({}, { status: 204 });
    if (!lines.length) {
      await db.abandonedCheckout.deleteMany({ where: { tenantId: tenant.id, visitorId, phone: null } });
      return NextResponse.json({ ok: true });
    }
    const data = { lines, total, stage: "cart", recovered: false };
    // if this visitor already left a phone, update that row instead
    const existing = await db.abandonedCheckout.findUnique({ where: { tenantId_visitorId: { tenantId: tenant.id, visitorId } } });
    if (existing?.recovered) return NextResponse.json({ ok: true });
    await db.abandonedCheckout.upsert({ where: { tenantId_visitorId: { tenantId: tenant.id, visitorId } }, create: { tenantId: tenant.id, visitorId, ...data }, update: { lines, total } });
    return NextResponse.json({ ok: true });
  }

  // the debounced draft can arrive right after the order was placed: ignore it then
  const recent = await db.order.findFirst({ where: { tenantId: tenant.id, phone, createdAt: { gte: new Date(Date.now() - 30 * 60_000) } }, select: { id: true } });
  if (recent) return NextResponse.json({ ok: true, recovered: true });
  // NOTE: NOT { phone } would skip NULL phones (SQL three-valued logic), so match them explicitly
  if (visitorId) await db.abandonedCheckout.deleteMany({ where: { tenantId: tenant.id, visitorId, OR: [{ phone: null }, { phone: { not: phone } }] } });
  const data = { name: form.name || null, form, lines, total, stage: "checkout", recovered: false, visitorId: visitorId ?? null };
  await db.abandonedCheckout.upsert({ where: { tenantId_phone: { tenantId: tenant.id, phone } }, create: { tenantId: tenant.id, phone, ...data }, update: data });
  return NextResponse.json({ ok: true });
}
