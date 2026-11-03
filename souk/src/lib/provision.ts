import bcrypt from "bcryptjs";
import { db } from "./db";

export const RESERVED_SLUGS = ["www", "admin", "app", "api", "platform", "mail", "static", "cdn", "souk"];

/** Create a ready-to-sell store: tenant + owner + default delivery rates + starter home page. */
export async function provisionTenant(input: { slug: string; name: string; email: string; password: string; planId?: string | null }) {
  const slug = input.slug.toLowerCase().trim();
  const email = input.email.toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(slug) || RESERVED_SLUGS.includes(slug)) return { error: "Adresse invalide (3-30 caractères : a-z, 0-9, -)" };
  if (!input.name.trim()) return { error: "Nom de la boutique requis" };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Email invalide" };
  if (input.password.length < 8) return { error: "Mot de passe : 8 caractères minimum" };
  if (await db.tenant.findUnique({ where: { slug } })) return { error: "Cette adresse est déjà prise" };
  const existing = await db.user.findUnique({ where: { email } });
  if (existing && !(await bcrypt.compare(input.password, existing.passwordHash))) return { error: "Un compte existe déjà avec cet email (mot de passe différent)" };

  const name = input.name.trim();
  const planId = input.planId ?? (await db.plan.findFirst({ orderBy: { priceDzd: "asc" } }))?.id ?? null;
  const tenant = await db.$transaction(async (tx) => {
    const t = await tx.tenant.create({ data: { slug, name, planId, settings: {} } });
    const user = existing ?? (await tx.user.create({ data: { email, name, passwordHash: await bcrypt.hash(input.password, 10) } }));
    await tx.membership.create({ data: { userId: user.id, tenantId: t.id, role: "owner" } });
    await tx.deliveryRate.createMany({ data: Array.from({ length: 58 }, (_, i) => ({ tenantId: t.id, wilayaCode: i + 1, homePrice: 700, deskPrice: 450 })) });
    await tx.page.create({ data: { tenantId: t.id, slug: "home", isHome: true, title: { ar: "الرئيسية", fr: "Accueil" }, sections: [
      { id: "h", type: "hero", enabled: true, props: { title_ar: name, title_fr: name, cta_ar: "تسوق الآن", cta_fr: "Voir les produits", cta_link: "/products", align: "center" } },
      { id: "t", type: "trust_badges", enabled: true, props: {} },
      { id: "g", type: "product_grid", enabled: true, props: { title_ar: "منتجاتنا", title_fr: "Nos produits", limit: 12 } },
    ] } });
    return t;
  });
  return { ok: true as const, tenant };
}

export function storeUrl(slug: string, path = "/") {
  const root = process.env.ROOT_DOMAIN ?? "localhost:3000";
  if (root.startsWith("localhost")) return `http://${root}${path}${path.includes("?") ? "&" : "?"}store=${slug}`;
  return `https://${slug}.${root}${path}`;
}
