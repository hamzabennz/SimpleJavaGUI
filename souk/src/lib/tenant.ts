import { cache } from "react";
import { headers, cookies } from "next/headers";
import { db } from "./db";
import { parseSettings } from "./settings";

/**
 * Resolve the current tenant from the Host header:
 *   1. custom domain (Domain table)
 *   2. <slug>.<ROOT_DOMAIN>
 *   3. dev override: ?store= is persisted as a "store" cookie by middleware
 *   4. DEFAULT_TENANT
 */
export const getTenant = cache(async () => {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase();
  const root = (process.env.ROOT_DOMAIN ?? "localhost:3000").toLowerCase();
  const override = (await cookies()).get("store")?.value;

  let tenant = null;
  if (override) tenant = await db.tenant.findUnique({ where: { slug: override } });
  if (!tenant && host) {
    const dom = await db.domain.findUnique({ where: { host }, include: { tenant: true } });
    if (dom) tenant = dom.tenant;
  }
  if (!tenant && host.endsWith("." + root)) {
    const slug = host.slice(0, -(root.length + 1));
    tenant = await db.tenant.findUnique({ where: { slug } });
  }
  if (!tenant && process.env.DEFAULT_TENANT) {
    tenant = await db.tenant.findUnique({ where: { slug: process.env.DEFAULT_TENANT } });
  }
  if (!tenant || tenant.status !== "active") return null;
  return { ...tenant, config: parseSettings(tenant.settings) };
});

export type CurrentTenant = NonNullable<Awaited<ReturnType<typeof getTenant>>>;

export async function requireTenant() {
  const t = await getTenant();
  if (!t) throw new Error("Store not found");
  return t;
}
