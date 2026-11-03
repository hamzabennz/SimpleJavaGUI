import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { normalizePhone } from "@/lib/forms";

const Body = z.object({ productId: z.string(), name: z.string().trim().min(2).max(60), phone: z.string().max(20).optional(), rating: z.number().int().min(1).max(5), body: z.string().trim().min(3).max(1000), website: z.string().optional() });

export async function POST(req: Request) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({}, { status: 404 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success || b.data.website) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const product = await db.product.findFirst({ where: { id: b.data.productId, tenantId: tenant.id } });
  if (!product) return NextResponse.json({}, { status: 404 });
  const phone = b.data.phone ? normalizePhone(b.data.phone) : null;
  const verified = phone ? !!(await db.order.findFirst({ where: { tenantId: tenant.id, phone, status: "delivered", items: { some: { productId: product.id } } } })) : false;
  await db.review.create({ data: { tenantId: tenant.id, productId: product.id, name: b.data.name, phone, rating: b.data.rating, body: b.data.body, verified } });
  return NextResponse.json({ ok: true });
}
