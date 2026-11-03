import { db } from "./db";
import { checkLimit } from "./plans";
import { buildValidator, BUILTIN_ORDER_KEYS } from "./forms";
import type { CurrentTenant } from "./tenant";

/** Quantity offers: product.extra.offers = [{ qty: 2, price: 7000 }] → total price for exactly that qty */
export type Offer = { qty: number; price: number; label?: { ar?: string; fr?: string } };
export function offerUnitPrice(extra: unknown, qty: number): number | null {
  const offers = ((extra as any)?.offers ?? []) as Offer[];
  const o = offers.find((x) => x.qty === qty);
  return o ? Math.round(o.price / o.qty) : null;
}

export type CartLine = { productId: string; variantId?: string | null; qty: number };

export async function deliveryFee(tenantId: string, wilayaCode: number, type: "home" | "desk") {
  const r = await db.deliveryRate.findUnique({ where: { tenantId_wilayaCode: { tenantId, wilayaCode } } });
  if (!r || !r.enabled) return null;
  const p = type === "desk" ? r.deskPrice : r.homePrice;
  return p ?? null;
}

/** Price lines from the DB (never trust client prices). */
export async function priceLines(tenantId: string, lines: CartLine[]) {
  const ids = Array.from(new Set(lines.map((l) => l.productId)));
  const products = await db.product.findMany({ where: { tenantId, id: { in: ids }, status: "active" }, include: { variants: true } });
  const out = [];
  for (const l of lines) {
    const p = products.find((x) => x.id === l.productId);
    if (!p) throw new OrderError("product_unavailable");
    const v = l.variantId ? p.variants.find((x) => x.id === l.variantId) : null;
    if (l.variantId && !v) throw new OrderError("product_unavailable");
    const qty = Math.max(1, Math.min(99, Math.floor(l.qty)));
    const stock = v ? v.stock : p.stock;
    if (p.trackStock && stock < qty) throw new OrderError("out_of_stock");
    out.push({
      product: p, variant: v, qty,
      name: (p.name as any)?.ar || (p.name as any)?.fr || p.slug,
      variantLabel: v ? Object.values(v.optionValues as Record<string, string>).join(" / ") : null,
      unitPrice: offerUnitPrice(p.extra, qty) ?? v?.price ?? p.price,
    });
  }
  return out;
}

export class OrderError extends Error {
  constructor(public code: string, public fieldErrors?: Record<string, string>) { super(code); }
}

export async function createOrder(tenant: CurrentTenant, form: Record<string, unknown>, lines: CartLine[], meta: { ip?: string; coupon?: string; source?: string; skipBlacklist?: boolean; deliveryFeeOverride?: number }) {
  if (!lines.length) throw new OrderError("empty_cart");
  if (await checkLimit(tenant.id, "ordersPerMonth")) throw new OrderError("store_unavailable");
  const fields = tenant.config.checkout.fields;
  const parsed = buildValidator(fields).safeParse(form);
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0]);
      fe[k] ??= i.code === "invalid_type" ? "required" : i.message.match(/^[a-z_]+$/) ? i.message : "invalid_format";
    }
    throw new OrderError("validation", fe);
  }
  const data = parsed.data as Record<string, any>;
  const wilaya = Number(data.wilaya);
  const deliveryType: "home" | "desk" = data.delivery_type === "desk" && tenant.config.checkout.deskEnabled ? "desk" : "home";

  const priced = await priceLines(tenant.id, lines);
  const subtotal = priced.reduce((s, l) => s + l.unitPrice * l.qty, 0);

  let fee = await deliveryFee(tenant.id, wilaya, deliveryType);
  if (meta.deliveryFeeOverride !== undefined) fee = meta.deliveryFeeOverride;
  if (fee === null) throw new OrderError("validation", { wilaya: "not_delivered" });
  const freeOver = tenant.config.checkout.freeShippingOver;
  if ((freeOver && subtotal >= freeOver) || priced.every((l) => (l.product.extra as any)?.freeShipping)) fee = 0;

  let discount = 0;
  let couponCode: string | null = null;
  if (meta.coupon) {
    const c = await db.coupon.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code: meta.coupon.trim().toUpperCase() } } });
    const now = new Date();
    if (c && c.active && subtotal >= c.minTotal && (!c.maxUses || c.used < c.maxUses) && (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt >= now)) {
      discount = c.type === "percent" ? Math.round((subtotal * c.value) / 100) : Math.min(c.value, subtotal);
      couponCode = c.code;
    }
  }

  const phone = String(data.phone);
  const customer = await db.customer.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone } },
    create: { tenantId: tenant.id, phone, name: String(data.name ?? phone), email: data.email },
    update: { name: String(data.name ?? phone) },
  });
  if (customer.blacklisted && !meta.skipBlacklist) throw new OrderError("blocked");

  const custom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!(BUILTIN_ORDER_KEYS as readonly string[]).includes(k)) custom[k] = v;

  // round-robin: confirmer with the fewest open orders
  let assignedToId: string | undefined;
  if (tenant.config.checkout.autoAssign) {
    const confirmers = await db.membership.findMany({ where: { tenantId: tenant.id, role: "confirmer" }, select: { userId: true } });
    if (confirmers.length) {
      const loads = await db.order.groupBy({ by: ["assignedToId"], where: { tenantId: tenant.id, status: { in: ["new", "no_answer", "postponed"] }, assignedToId: { in: confirmers.map((c) => c.userId) } }, _count: true });
      assignedToId = confirmers.map((c) => ({ id: c.userId, n: loads.find((l) => l.assignedToId === c.userId)?._count ?? 0 })).sort((a, b) => a.n - b.n)[0].id;
    }
  }

  return db.$transaction(async (tx) => {
    const last = await tx.order.findFirst({ where: { tenantId: tenant.id }, orderBy: { number: "desc" }, select: { number: true } });
    const order = await tx.order.create({
      data: {
        tenantId: tenant.id, number: (last?.number ?? 1000) + 1, customerId: customer.id,
        name: String(data.name ?? ""), phone, wilayaCode: wilaya, commune: data.commune, address: data.address,
        deliveryType, deliveryFee: fee!, subtotal, discount, total: subtotal - discount + fee!, couponCode,
        customFields: custom as any, ip: meta.ip, assignedToId, source: meta.source ?? "storefront",
        items: { create: priced.map((l) => ({ productId: l.product.id, variantId: l.variant?.id, name: l.name, variant: l.variantLabel, unitPrice: l.unitPrice, qty: l.qty })) },
        events: { create: { type: "status", toStatus: "new", note: "created" } },
      },
      include: { items: true },
    });
    for (const l of priced) {
      if (!l.product.trackStock) continue;
      if (l.variant) await tx.variant.update({ where: { id: l.variant.id }, data: { stock: { decrement: l.qty } } });
      else await tx.product.update({ where: { id: l.product.id }, data: { stock: { decrement: l.qty } } });
    }
    await tx.abandonedCheckout.updateMany({ where: { tenantId: tenant.id, phone }, data: { recovered: true } });
    if (couponCode) await tx.coupon.update({ where: { tenantId_code: { tenantId: tenant.id, code: couponCode } }, data: { used: { increment: 1 } } });
    return order;
  });
}
