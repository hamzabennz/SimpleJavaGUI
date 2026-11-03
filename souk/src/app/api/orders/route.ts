import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenant } from "@/lib/tenant";
import { createOrder, OrderError } from "@/lib/orders";
import { sendPurchaseEvents } from "@/lib/capi";
import { notifyNewOrder } from "@/lib/notify";

const Body = z.object({
  form: z.record(z.unknown()),
  lines: z.array(z.object({ productId: z.string(), variantId: z.string().nullish(), qty: z.number().int().min(1).max(99), upsellOf: z.string().nullish() })).min(1).max(50),
  coupon: z.string().max(40).optional(),
});

// naive in-memory rate limiter (swap for Redis in production)
const hits = new Map<string, number[]>();
function limited(key: string, max = 5, windowMs = 10 * 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}

export async function POST(req: Request) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "store_not_found" }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  // Mobile carriers in Algeria use CGNAT (many customers share one IP): limit mostly per phone, loosely per IP.
  const phoneKey = String(body.data.form.phone ?? "").replace(/\D/g, "").slice(-9);
  if (limited(`${tenant.id}:ip:${ip}`, 40) || (phoneKey && limited(`${tenant.id}:ph:${phoneKey}`, 3))) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }
  try {
    const order = await createOrder(tenant, body.data.form, body.data.lines, { ip, coupon: body.data.coupon });
    void notifyNewOrder(tenant.config, tenant.name, order);
    void sendPurchaseEvents(tenant.config.tracking, order, { ip, ua: req.headers.get("user-agent") ?? undefined, url: req.headers.get("referer") ?? undefined });
    return NextResponse.json({ id: order.id, number: order.number, total: order.total, phone: order.phone });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.code, fieldErrors: e.fieldErrors }, { status: 422 });
    console.error(e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
