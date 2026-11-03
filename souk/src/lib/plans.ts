import { db } from "./db";

export type Limits = { products?: number; staff?: number; ordersPerMonth?: number };
export type Features = { customDomain?: boolean; pixels?: boolean; removeBranding?: boolean; carriers?: boolean };

export async function getPlan(tenantId: string) {
  const t = await db.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
  return { limits: (t?.plan?.limits ?? {}) as Limits, features: (t?.plan?.features ?? {}) as Features, name: t?.plan?.name ?? "—" };
}

/** Returns an error message if the tenant hit a plan limit, else null. */
export async function checkLimit(tenantId: string, what: keyof Limits): Promise<string | null> {
  const { limits, name } = await getPlan(tenantId);
  const max = limits[what];
  if (max === undefined) return null;
  const count =
    what === "products" ? await db.product.count({ where: { tenantId } })
    : what === "staff" ? await db.membership.count({ where: { tenantId, role: { not: "owner" } } })
    : await db.order.count({ where: { tenantId, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } });
  return count >= max ? `Limite du plan ${name} atteinte (${what}: ${max}). Passez au plan supérieur.` : null;
}
