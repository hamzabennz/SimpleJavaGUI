"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, requireAdmin } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { mergeSettings } from "@/lib/settings";
import { carriers } from "@/lib/carriers";
import { wilayas } from "@/lib/algeria";
import { provisionTenant, storeUrl } from "@/lib/provision";

// ---------- auth ----------
export async function login(_: unknown, fd: FormData) {
  const email = String(fd.get("email") ?? "").toLowerCase().trim();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(String(fd.get("password") ?? ""), user.passwordHash))) return { error: "Email ou mot de passe incorrect" };
  const tenant = await getTenant();
  if (!user.isSuperAdmin && tenant && !(await db.membership.findUnique({ where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } } }))) {
    return { error: "Ce compte n'a pas accès à cette boutique" };
  }
  await createSession(user.id);
  redirect("/admin");
}
export async function logout() {
  await destroySession();
  redirect("/admin/login");
}

// ---------- settings (theme, layout, checkout form, store info...) ----------
export async function saveSettings(patch: Record<string, unknown>) {
  const { tenant } = await requireAdmin("design");
  const next = mergeSettings(tenant.config, patch);
  await db.tenant.update({ where: { id: tenant.id }, data: { settings: next as any } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveHomeSections(sections: unknown[]) {
  const { tenant } = await requireAdmin("design");
  const page = await db.page.findFirst({ where: { tenantId: tenant.id, isHome: true } });
  if (page) await db.page.update({ where: { id: page.id }, data: { sections: sections as any } });
  else await db.page.create({ data: { tenantId: tenant.id, slug: "home", isHome: true, title: { ar: "الرئيسية", fr: "Accueil" }, sections: sections as any } });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------- orders ----------
export async function setOrderStatus(orderId: string, status: string, note?: string) {
  const { tenant, user } = await requireAdmin("orders");
  if (!tenant.config.orderStatuses.some((s) => s.key === status)) throw new Error("bad status");
  const o = await db.order.findFirst({ where: { id: orderId, tenantId: tenant.id } });
  if (!o) throw new Error("not found");
  await db.order.update({
    where: { id: o.id },
    data: { status, events: { create: { type: "status", fromStatus: o.status, toStatus: status, note, userId: user.id } } },
  });
  revalidatePath("/admin/orders");
}

export async function addOrderNote(orderId: string, fd: FormData) {
  const { tenant, user } = await requireAdmin("orders");
  const note = String(fd.get("note") ?? "").trim();
  const type = fd.get("type") === "call" ? "call" : "note";
  const o = await db.order.findFirst({ where: { id: orderId, tenantId: tenant.id } });
  if (!o || (!note && type === "note")) return;
  await db.orderEvent.create({ data: { orderId: o.id, type, note: note || null, userId: user.id } });
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function updateOrderShipping(orderId: string, fd: FormData) {
  const { tenant } = await requireAdmin("orders");
  await db.order.updateMany({
    where: { id: orderId, tenantId: tenant.id },
    data: { carrier: String(fd.get("carrier") || "") || null, trackingNumber: String(fd.get("trackingNumber") || "") || null, address: String(fd.get("address") || "") || null },
  });
  revalidatePath(`/admin/orders/${orderId}`);
}

// ---------- customers ----------
export async function toggleBlacklist(customerId: string) {
  const { tenant } = await requireAdmin("customers");
  const c = await db.customer.findFirst({ where: { id: customerId, tenantId: tenant.id } });
  if (c) await db.customer.update({ where: { id: c.id }, data: { blacklisted: !c.blacklisted } });
  revalidatePath("/admin/customers");
}

// ---------- products ----------
const ProductInput = z.object({
  id: z.string().optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug: a-z, 0-9, -"),
  name: z.object({ ar: z.string(), fr: z.string() }),
  description: z.object({ ar: z.string(), fr: z.string() }),
  status: z.enum(["draft", "active", "archived"]),
  price: z.coerce.number().int().min(0),
  compareAt: z.coerce.number().int().min(0).nullable(),
  cost: z.coerce.number().int().min(0).nullable(),
  categoryId: z.string().nullable(),
  trackStock: z.boolean(),
  stock: z.coerce.number().int(),
  images: z.array(z.string().refine((u) => /^https?:\/\//.test(u) || u.startsWith("/uploads/"), "URL invalide")),
  attributes: z.record(z.unknown()),
  freeShipping: z.boolean(),
  offers: z.array(z.object({ qty: z.coerce.number().int().min(2), price: z.coerce.number().int().min(0), label: z.object({ ar: z.string(), fr: z.string() }) })).default([]),
  options: z.array(z.object({ name: z.object({ ar: z.string(), fr: z.string() }), values: z.array(z.string()) })),
  variants: z.array(z.object({ id: z.string().optional(), optionValues: z.record(z.string()), sku: z.string().nullable(), price: z.coerce.number().int().nullable(), stock: z.coerce.number().int() })),
});
export type ProductInputT = z.infer<typeof ProductInput>;

export async function saveProduct(input: ProductInputT) {
  const { tenant } = await requireAdmin("products");
  const r = ProductInput.safeParse(input);
  if (!r.success) return { error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") };
  const d = r.data;
  const data = {
    slug: d.slug, name: d.name, description: d.description, status: d.status, price: d.price, compareAt: d.compareAt, cost: d.cost,
    categoryId: d.categoryId, trackStock: d.trackStock, stock: d.stock, images: d.images, attributes: d.attributes as any,
    extra: { freeShipping: d.freeShipping, offers: d.offers }, options: d.options,
  };
  try {
    let id = d.id;
    if (id) {
      const own = await db.product.findFirst({ where: { id, tenantId: tenant.id } });
      if (!own) return { error: "not found" };
      await db.product.update({ where: { id }, data });
    } else {
      id = (await db.product.create({ data: { ...data, tenantId: tenant.id } })).id;
    }
    // sync variants
    const keep = d.variants.filter((v) => v.id).map((v) => v.id!);
    await db.variant.deleteMany({ where: { productId: id, id: { notIn: keep } } });
    for (const v of d.variants) {
      const vd = { optionValues: v.optionValues, sku: v.sku, price: v.price, stock: v.stock };
      if (v.id) await db.variant.update({ where: { id: v.id }, data: vd });
      else await db.variant.create({ data: { ...vd, productId: id } });
    }
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e: any) {
    if (e?.code === "P2002") return { error: "Ce slug existe déjà" };
    throw e;
  }
}

export async function deleteProduct(id: string) {
  const { tenant } = await requireAdmin("products");
  await db.product.deleteMany({ where: { id, tenantId: tenant.id } });
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function saveCategory(fd: FormData) {
  const { tenant } = await requireAdmin("products");
  const fr = String(fd.get("fr") ?? "").trim();
  const ar = String(fd.get("ar") ?? "").trim();
  const slug = (fr || ar).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `cat-${Date.now()}`;
  await db.category.create({ data: { tenantId: tenant.id, slug, name: { ar, fr } } }).catch(() => null);
  revalidatePath("/admin/products");
}

// ---------- delivery ----------
export async function saveDeliveryRates(fd: FormData) {
  const { tenant } = await requireAdmin("delivery");
  const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Math.max(0, Math.round(Number(v))));
  for (let w = 1; w <= 58; w++) {
    const data = { homePrice: num(fd.get(`h${w}`)), deskPrice: num(fd.get(`d${w}`)), enabled: fd.get(`e${w}`) === "on" };
    await db.deliveryRate.upsert({ where: { tenantId_wilayaCode: { tenantId: tenant.id, wilayaCode: w } }, create: { tenantId: tenant.id, wilayaCode: w, ...data }, update: data });
  }
  revalidatePath("/admin/delivery");
}

// ---------- coupons ----------
export async function createCoupon(fd: FormData) {
  const { tenant } = await requireAdmin("orders");
  const code = String(fd.get("code") ?? "").trim().toUpperCase();
  if (!code) return;
  await db.coupon.create({
    data: {
      tenantId: tenant.id, code, type: fd.get("type") === "fixed" ? "fixed" : "percent", value: Number(fd.get("value")) || 0,
      minTotal: Number(fd.get("minTotal")) || 0, maxUses: Number(fd.get("maxUses")) || null,
      endsAt: fd.get("endsAt") ? new Date(String(fd.get("endsAt"))) : null,
    },
  }).catch(() => null);
  revalidatePath("/admin/coupons");
}
export async function toggleCoupon(id: string) {
  const { tenant } = await requireAdmin("orders");
  const c = await db.coupon.findFirst({ where: { id, tenantId: tenant.id } });
  if (c) await db.coupon.update({ where: { id }, data: { active: !c.active } });
  revalidatePath("/admin/coupons");
}

// ---------- shipping (carrier adapters) ----------

/** Push orders to the tenant's carrier. Returns per-order result. */
export async function shipOrders(orderIds: string[], carrierId?: string) {
  const { tenant, user } = await requireAdmin("orders");
  const id = carrierId || tenant.config.integrations.defaultCarrier;
  const adapter = carriers[id];
  if (!adapter) return { results: [{ number: 0, ok: false, error: "Transporteur inconnu" }] };
  const creds = tenant.config.integrations.carriers[id] ?? {};
  const missing = adapter.credentials.filter((c) => !creds[c.key]);
  if (missing.length) return { results: [{ number: 0, ok: false, error: `Identifiants ${adapter.name} manquants (Paramètres)` }] };
  const orders = await db.order.findMany({ where: { id: { in: orderIds }, tenantId: tenant.id, trackingNumber: null }, include: { items: true } });
  const results = [];
  for (const o of orders) {
    const r = await adapter.createShipment(o, creds, { wilayaFr: wilayas.find((w) => w.code === o.wilayaCode)?.fr ?? "", storeName: tenant.name });
    if (r.ok) {
      await db.order.update({
        where: { id: o.id },
        data: { carrier: adapter.name, trackingNumber: r.tracking, status: "shipped", events: { create: { type: "status", fromStatus: o.status, toStatus: "shipped", note: `${adapter.name}: ${r.tracking}`, userId: user.id } } },
      });
    } else {
      await db.orderEvent.create({ data: { orderId: o.id, type: "note", note: `Échec ${adapter.name}: ${r.error}`, userId: user.id } });
    }
    results.push({ number: o.number, ...r });
  }
  revalidatePath("/admin/orders");
  return { results };
}

export async function shipConfirmed() {
  const { tenant } = await requireAdmin("orders");
  const ids = (await db.order.findMany({ where: { tenantId: tenant.id, status: "confirmed", trackingNumber: null }, select: { id: true } })).map((o) => o.id);
  return shipOrders(ids);
}

export async function saveIntegrations(patch: { defaultCarrier: string; carriers: Record<string, Record<string, string>>; metaAccessToken?: string; tiktokAccessToken?: string }) {
  const { tenant } = await requireAdmin("*");
  const next = mergeSettings(tenant.config, {
    integrations: { defaultCarrier: patch.defaultCarrier, carriers: patch.carriers },
    tracking: { metaAccessToken: patch.metaAccessToken || undefined, tiktokAccessToken: patch.tiktokAccessToken || undefined },
  });
  await db.tenant.update({ where: { id: tenant.id }, data: { settings: next as any } });
  return { ok: true };
}

// ---------- staff ----------
export async function addStaff(_: unknown, fd: FormData) {
  const { tenant } = await requireAdmin("*");
  const email = String(fd.get("email") ?? "").toLowerCase().trim();
  const role = String(fd.get("role") ?? "confirmer");
  if (!email || !["manager", "confirmer", "stock"].includes(role)) return { error: "Données invalides" };
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    const pw = String(fd.get("password") ?? "");
    if (pw.length < 8) return { error: "Mot de passe : 8 caractères minimum" };
    user = await db.user.create({ data: { email, name: String(fd.get("name") || email), passwordHash: await bcrypt.hash(pw, 10) } });
  }
  await db.membership.upsert({ where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } }, create: { userId: user.id, tenantId: tenant.id, role }, update: { role } });
  revalidatePath("/admin/staff");
  return { ok: true };
}
export async function removeStaff(membershipId: string) {
  const { tenant, user } = await requireAdmin("*");
  await db.membership.deleteMany({ where: { id: membershipId, tenantId: tenant.id, role: { not: "owner" }, NOT: { userId: user.id } } });
  revalidatePath("/admin/staff");
}

// ---------- platform (super admin) ----------
async function requireSuperAdmin() {
  const { user } = await requireAdmin();
  if (!user.isSuperAdmin) redirect("/admin");
  return user;
}
export async function createTenant(_: unknown, fd: FormData) {
  await requireSuperAdmin();
  const r = await provisionTenant({
    slug: String(fd.get("slug") ?? ""), name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""),
    password: String(fd.get("password") ?? ""), planId: String(fd.get("planId") || "") || null,
  });
  if ("error" in r) return { error: r.error };
  revalidatePath("/platform");
  return { ok: true };
}
export async function setTenantStatus(id: string, status: "active" | "suspended") {
  await requireSuperAdmin();
  await db.tenant.update({ where: { id }, data: { status } });
  revalidatePath("/platform");
}
export async function setTenantPlan(id: string, fd: FormData) {
  await requireSuperAdmin();
  await db.tenant.update({ where: { id }, data: { planId: String(fd.get("planId") || "") || null } });
  revalidatePath("/platform");
}

// ---------- public self-serve signup ----------
const signupHits = new Map<string, number>();
export async function signup(_: unknown, fd: FormData) {
  if (String(fd.get("website") ?? "")) return { error: "spam" }; // honeypot
  const email = String(fd.get("email") ?? "").toLowerCase();
  const n = (signupHits.get(email) ?? 0) + 1; signupHits.set(email, n);
  if (n > 5) return { error: "Trop de tentatives" };
  const r = await provisionTenant({ slug: String(fd.get("slug") ?? ""), name: String(fd.get("name") ?? ""), email, password: String(fd.get("password") ?? "") });
  if ("error" in r) return { error: r.error };
  const user = await db.user.findUnique({ where: { email } });
  if (user) await createSession(user.id);
  return { ok: true, adminUrl: storeUrl(r.tenant.slug, "/admin"), storeUrl: storeUrl(r.tenant.slug) };
}
