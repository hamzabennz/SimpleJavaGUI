import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { DZ_PHONE, normalizePhone } from "@/lib/forms";

const Body = z.object({
  form: z.record(z.string().max(500)),
  lines: z.array(z.object({ productId: z.string(), variantId: z.string().nullish(), qty: z.number(), name: z.string().max(200), price: z.number() })).max(50),
});

/** Called (debounced) by the order form once a valid phone is typed. */
export async function POST(req: Request) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({}, { status: 404 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({}, { status: 400 });
  const phone = normalizePhone(b.data.form.phone ?? "");
  if (!DZ_PHONE.test(phone)) return NextResponse.json({}, { status: 204 });
  // the debounced draft can arrive right after the order was placed: ignore it then
  const recent = await db.order.findFirst({ where: { tenantId: tenant.id, phone, createdAt: { gte: new Date(Date.now() - 30 * 60_000) } }, select: { id: true } });
  if (recent) return NextResponse.json({ ok: true, recovered: true });
  const total = b.data.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const data = { name: b.data.form.name || null, form: b.data.form, lines: b.data.lines, total, recovered: false };
  await db.abandonedCheckout.upsert({ where: { tenantId_phone: { tenantId: tenant.id, phone } }, create: { tenantId: tenant.id, phone, ...data }, update: data });
  return NextResponse.json({ ok: true });
}
