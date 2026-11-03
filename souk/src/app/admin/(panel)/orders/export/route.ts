import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { wilayaName } from "@/lib/algeria";

export async function GET(req: Request) {
  const { tenant } = await requireAdmin("orders");
  const s = new URL(req.url).searchParams.get("s");
  const orders = await db.order.findMany({ where: { tenantId: tenant.id, ...(s ? { status: s } : {}) }, include: { items: true }, orderBy: { number: "desc" } });
  const custom = tenant.config.checkout.fields.filter((f) => !["name", "phone", "wilaya", "commune", "address", "delivery_type"].includes(f.key));
  const head = ["number", "date", "status", "name", "phone", "wilaya", "commune", "address", "delivery", "products", "subtotal", "delivery_fee", "discount", "total", ...custom.map((f) => f.key)];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = orders.map((o) => [
    o.number, o.createdAt.toISOString(), o.status, o.name, o.phone, wilayaName(o.wilayaCode), o.commune, o.address, o.deliveryType,
    o.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ""} x${i.qty}`).join(" | "), o.subtotal, o.deliveryFee, o.discount, o.total,
    ...custom.map((f) => (o.customFields as any)?.[f.key]),
  ].map(esc).join(","));
  return new Response("﻿" + [head.join(","), ...rows].join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="orders-${tenant.slug}.csv"` },
  });
}
