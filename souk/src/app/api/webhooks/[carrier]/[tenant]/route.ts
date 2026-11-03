import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { carriers } from "@/lib/carriers";
import { parseSettings } from "@/lib/settings";

/**
 * Carrier status webhook: POST /api/webhooks/<carrier>/<tenantSlug>?key=<webhookKey>
 * Body (normalized): { tracking: string, status: string } or an array of them.
 * Each carrier's raw payload shape differs; adapters map statuses via mapStatus().
 */
export async function POST(req: Request, { params }: { params: Promise<{ carrier: string; tenant: string }> }) {
  const { carrier, tenant: slug } = await params;
  const adapter = carriers[carrier];
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!adapter || !tenant) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const settings = parseSettings(tenant.settings);
  const expected = settings.integrations.carriers[carrier]?.webhookKey;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!expected || key.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const events: any[] = Array.isArray(body) ? body : body?.data ?? (body ? [body] : []);
  let updated = 0;
  for (const e of events) {
    const tracking = String(e.tracking ?? e.Tracking ?? "");
    const raw = String(e.status ?? e.last_status ?? e.Situation ?? "");
    const status = adapter.mapStatus?.(raw) ?? (settings.orderStatuses.some((s) => s.key === raw) ? raw : null);
    if (!tracking || !status) continue;
    const o = await db.order.findFirst({ where: { tenantId: tenant.id, trackingNumber: tracking } });
    if (!o || o.status === status) continue;
    await db.order.update({ where: { id: o.id }, data: { status, events: { create: { type: "status", fromStatus: o.status, toStatus: status, note: `${adapter.name}: ${raw}` } } } });
    updated++;
  }
  return NextResponse.json({ ok: true, updated });
}
