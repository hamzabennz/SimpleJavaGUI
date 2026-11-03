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
import { checkLimit } from "@/lib/plans";
import { createOrder, OrderError, type CartLine } from "@/lib/orders";

// ---------- auth ----------
const loginFails = new Map<string, { n: number; until: number }>();
export async function login(_: unknown, fd: FormData) {
  const email = String(fd.get("email") ?? "").toLowerCase().trim();
  const f = loginFails.get(email);
  if (f && f.n >= 5 && f.until > Date.now()) return { error: "Trop de tentatives. Réessayez dans 15 minutes." };
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(String(fd.get("password") ?? ""), user.passwordHash))) {
    const cur = loginFails.get(email);
    loginFails.set(email, { n: (cur && cur.until > Date.now() ? cur.n : 0) + 1, until: Date.now() + 15 * 60_000 });
    return { error: "Email ou mot de passe incorrect" };
  }
  loginFails.delete(email);
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

export async function saveHomeSections(sections: unknown[], slug?: string) {
  const { tenant } = await requireAdmin("design");
  if (slug && slug !== "home") {
    await db.page.updateMany({ where: { tenantId: tenant.id, slug }, data: { sections: sections as any } });
    revalidatePath("/", "layout");
    return { ok: true };
  }
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
  if (d.categoryId && !(await db.category.findFirst({ where: { id: d.categoryId, tenantId: tenant.id } }))) return { error: "Catégorie invalide" };
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
      const limit = await checkLimit(tenant.id, "products");
      if (limit) return { error: limit };
      id = (await db.product.create({ data: { ...data, tenantId: tenant.id } })).id;
    }
    // sync variants
    const keep = d.variants.filter((v) => v.id).map((v) => v.id!);
    await db.variant.deleteMany({ where: { productId: id, id: { notIn: keep } } });
    for (const v of d.variants) {
      const vd = { optionValues: v.optionValues, sku: v.sku, price: v.price, stock: v.stock };
      if (v.id) await db.variant.updateMany({ where: { id: v.id, productId: id }, data: vd }); // scoped to this product
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

export async function saveIntegrations(patch: { defaultCarrier: string; carriers: Record<string, Record<string, string>>; metaAccessToken?: string; tiktokAccessToken?: string; telegramBotToken?: string; telegramChatId?: string }) {
  const { tenant } = await requireAdmin("*");
  const next = mergeSettings(tenant.config, {
    integrations: { defaultCarrier: patch.defaultCarrier, carriers: patch.carriers },
    tracking: { metaAccessToken: patch.metaAccessToken || undefined, tiktokAccessToken: patch.tiktokAccessToken || undefined },
    notifications: { telegram: { botToken: patch.telegramBotToken || undefined, chatId: patch.telegramChatId || undefined } },
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
  const limit = await checkLimit(tenant.id, "staff");
  if (limit) return { error: limit };
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

// ---------- manual order (phone / WhatsApp / Messenger) ----------
export async function createManualOrder(input: { form: Record<string, string>; lines: CartLine[]; source: string; deliveryFee?: number | null }) {
  const { tenant, user } = await requireAdmin("orders");
  try {
    const o = await createOrder(tenant, input.form, input.lines, {
      source: input.source, skipBlacklist: true, deliveryFeeOverride: input.deliveryFee ?? undefined,
    });
    await db.orderEvent.create({ data: { orderId: o.id, type: "note", note: `Commande manuelle (${input.source})`, userId: user.id } });
    revalidatePath("/admin/orders");
    return { ok: true, id: o.id };
  } catch (e) {
    if (e instanceof OrderError) return { error: e.code, fieldErrors: e.fieldErrors };
    throw e;
  }
}

// ---------- custom domains ----------
export async function addDomain(_: unknown, fd: FormData) {
  const { tenant } = await requireAdmin("*");
  const { getPlan } = await import("@/lib/plans");
  if (!(await getPlan(tenant.id)).features.customDomain) return { error: "Les domaines personnalisés sont disponibles à partir du plan Pro." };
  const host = String(fd.get("host") ?? "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host)) return { error: "Domaine invalide" };
  try { await db.domain.create({ data: { tenantId: tenant.id, host } }); } catch { return { error: "Domaine déjà utilisé" }; }
  revalidatePath("/admin/settings/domains");
  return { ok: true };
}
export async function verifyDomain(id: string) {
  const { tenant } = await requireAdmin("*");
  const d = await db.domain.findFirst({ where: { id, tenantId: tenant.id } });
  if (!d) return;
  const { resolveCname, resolve4 } = await import("node:dns/promises");
  const target = (process.env.CNAME_TARGET ?? `stores.${(process.env.ROOT_DOMAIN ?? "").split(":")[0]}`).toLowerCase();
  const ip = process.env.SERVER_IP;
  const cname = await resolveCname(d.host).catch(() => [] as string[]);
  const a = await resolve4(d.host).catch(() => [] as string[]);
  const ok = cname.some((c) => c.toLowerCase() === target) || (!!ip && a.includes(ip));
  await db.domain.update({ where: { id }, data: { verified: ok } });
  revalidatePath("/admin/settings/domains");
}
export async function removeDomain(id: string) {
  const { tenant } = await requireAdmin("*");
  await db.domain.deleteMany({ where: { id, tenantId: tenant.id } });
  revalidatePath("/admin/settings/domains");
}

// ---------- custom pages ----------
export async function createPage(fd: FormData) {
  const { tenant } = await requireAdmin("design");
  const fr = String(fd.get("fr") ?? "").trim(), ar = String(fd.get("ar") ?? "").trim();
  const slug = (fr || ar).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `page-${Date.now()}`;
  if (slug === "home") return;
  await db.page.create({ data: { tenantId: tenant.id, slug, title: { fr, ar }, sections: [{ id: "t", type: "rich_text", enabled: true, props: { body_fr: "", body_ar: "" } }] } }).catch(() => null);
  revalidatePath("/admin/design/home");
  redirect(`/admin/design/home?page=${slug}`);
}
export async function deletePage(slug: string) {
  const { tenant } = await requireAdmin("design");
  await db.page.deleteMany({ where: { tenantId: tenant.id, slug, isHome: false } });
  revalidatePath("/", "layout");
  redirect("/admin/design/home");
}

// ---------- bulk order actions ----------
export async function bulkOrders(fd: FormData) {
  const { tenant, user } = await requireAdmin("orders");
  const ids = fd.getAll("ids").map(String).slice(0, 500);
  const op = String(fd.get("op") ?? "");
  if (!ids.length) return;
  if (op === "ship") { await shipOrders(ids); return; }
  if (op === "print") redirect(`/admin/print?ids=${ids.join(",")}`);
  if (op.startsWith("status:")) {
    const status = op.slice(7);
    if (!tenant.config.orderStatuses.some((s) => s.key === status)) return;
    const orders = await db.order.findMany({ where: { id: { in: ids }, tenantId: tenant.id, NOT: { status } }, select: { id: true, status: true } });
    await db.$transaction([
      db.order.updateMany({ where: { id: { in: orders.map((o) => o.id) } }, data: { status } }),
      db.orderEvent.createMany({ data: orders.map((o) => ({ orderId: o.id, type: "status", fromStatus: o.status, toStatus: status, userId: user.id, note: "bulk" })) }),
    ]);
    revalidatePath("/admin/orders");
  }
}

// ---------- edit order (during confirmation call) ----------
export async function editOrder(orderId: string, input: { name: string; phone: string; commune: string; address: string; deliveryType: "home" | "desk"; deliveryFee: number; discount: number; items: { id?: string; productId?: string | null; variantId?: string | null; qty: number; unitPrice: number }[] }) {
  const { tenant, user } = await requireAdmin("orders");
  const o = await db.order.findFirst({ where: { id: orderId, tenantId: tenant.id }, include: { items: true } });
  if (!o) return { error: "not found" };
  if (["shipped", "delivered", "returned"].includes(o.status)) return { error: "Commande déjà expédiée" };
  const items = input.items.filter((i) => i.qty > 0);
  if (!items.length) return { error: "Au moins un produit" };
  // new lines must reference this tenant's products
  const newIds = items.filter((i) => !i.id && i.productId).map((i) => i.productId!);
  const prods = await db.product.findMany({ where: { tenantId: tenant.id, id: { in: newIds } }, include: { variants: true } });
  if (prods.length !== new Set(newIds).size) return { error: "Produit invalide" };
  const subtotal = items.reduce((s, i) => s + Math.max(0, Math.round(i.unitPrice)) * Math.round(i.qty), 0);
  const fee = Math.max(0, Math.round(input.deliveryFee)), discount = Math.max(0, Math.round(input.discount));
  await db.$transaction(async (tx) => {
    const keep = items.filter((i) => i.id).map((i) => i.id!);
    await tx.orderItem.deleteMany({ where: { orderId: o.id, id: { notIn: keep } } });
    for (const i of items) {
      if (i.id) await tx.orderItem.updateMany({ where: { id: i.id, orderId: o.id }, data: { qty: Math.round(i.qty), unitPrice: Math.round(i.unitPrice) } });
      else {
        const p = prods.find((x) => x.id === i.productId)!;
        const v = p.variants.find((x) => x.id === i.variantId);
        await tx.orderItem.create({ data: { orderId: o.id, productId: p.id, variantId: v?.id, name: (p.name as any)?.fr || (p.name as any)?.ar || p.slug, variant: v ? Object.values(v.optionValues as Record<string, string>).join(" / ") : null, unitPrice: Math.round(i.unitPrice), qty: Math.round(i.qty) } });
      }
    }
    await tx.order.update({ where: { id: o.id }, data: {
      name: input.name, phone: input.phone.replace(/\s/g, ""), commune: input.commune || null, address: input.address || null, deliveryType: input.deliveryType,
      deliveryFee: fee, discount, subtotal, total: Math.max(0, subtotal - discount + fee),
      events: { create: { type: "note", note: `Commande modifiée (total ${o.total} → ${Math.max(0, subtotal - discount + fee)} DA)`, userId: user.id } },
    } });
  });
  revalidatePath(`/admin/orders/${o.id}`);
  return { ok: true };
}

// ---------- plans (super admin) ----------
export async function savePlan(fd: FormData) {
  await requireSuperAdmin();
  const id = String(fd.get("planId") || "");
  const num = (k: string) => (fd.get(k) === "" || fd.get(k) === null ? undefined : Math.max(0, Number(fd.get(k))));
  const data = {
    name: String(fd.get("name") ?? "").trim() || "Plan",
    priceDzd: num("priceDzd") ?? 0,
    limits: Object.fromEntries(Object.entries({ products: num("products"), staff: num("staff"), ordersPerMonth: num("ordersPerMonth") }).filter(([, v]) => v !== undefined)),
    features: { customDomain: fd.get("customDomain") === "on", pixels: fd.get("pixels") === "on", removeBranding: fd.get("removeBranding") === "on", carriers: fd.get("carriers") === "on" },
  };
  if (id) await db.plan.update({ where: { id }, data });
  else await db.plan.create({ data }).catch(() => null);
  revalidatePath("/platform");
}

export async function assignOrder(orderId: string, fd: FormData) {
  const { tenant, user } = await requireAdmin("orders");
  const to = String(fd.get("userId") || "") || null;
  if (to && !(await db.membership.findFirst({ where: { tenantId: tenant.id, userId: to } }))) return;
  const o = await db.order.findFirst({ where: { id: orderId, tenantId: tenant.id } });
  if (!o) return;
  await db.order.update({ where: { id: o.id }, data: { assignedToId: to, events: { create: { type: "note", note: `Assignée à ${to ? (await db.user.findUnique({ where: { id: to } }))?.name : "personne"}`, userId: user.id } } } });
  revalidatePath(`/admin/orders/${orderId}`);
}
export async function toggleAutoAssign() {
  const { tenant } = await requireAdmin("*");
  await db.tenant.update({ where: { id: tenant.id }, data: { settings: mergeSettings(tenant.config, { checkout: { autoAssign: !tenant.config.checkout.autoAssign } }) as any } });
  revalidatePath("/admin/staff");
}

// ---------- reviews moderation ----------
export async function moderateReview(id: string, op: "approve" | "hide" | "delete") {
  const { tenant } = await requireAdmin("products");
  if (op === "delete") await db.review.deleteMany({ where: { id, tenantId: tenant.id } });
  else await db.review.updateMany({ where: { id, tenantId: tenant.id }, data: { approved: op === "approve" } });
  revalidatePath("/admin/reviews");
}
