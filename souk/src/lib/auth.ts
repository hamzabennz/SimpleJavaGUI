import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getTenant } from "./tenant";

const COOKIE = "souk_admin";
const secret = () => process.env.SESSION_SECRET ?? "dev-secret";

function sign(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verify(token: string): { uid: string; exp: number } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const p = JSON.parse(Buffer.from(body, "base64url").toString());
  return p.exp > Date.now() ? p : null;
}

/** Share the session across <slug>.ROOT_DOMAIN (not for custom domains or localhost). */
function cookieDomain() {
  const root = (process.env.ROOT_DOMAIN ?? "").split(":")[0];
  return root && root !== "localhost" ? "." + root : undefined;
}

export async function createSession(uid: string) {
  (await cookies()).set(COOKIE, sign({ uid, exp: Date.now() + 7 * 864e5 }), {
    domain: cookieDomain(), httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 86400,
  });
}
export async function destroySession() {
  (await cookies()).set(COOKIE, "", { domain: cookieDomain(), path: "/", maxAge: 0 });
}

export const PERMISSIONS = {
  owner: ["*"],
  manager: ["orders", "products", "customers", "delivery", "design", "reports"],
  confirmer: ["orders"],
  stock: ["products"],
} as Record<string, string[]>;

/** Logged-in user regardless of tenant (platform console). */
export async function requireUser() {
  const tok = (await cookies()).get(COOKIE)?.value;
  const s = tok ? verify(tok) : null;
  const user = s ? await db.user.findUnique({ where: { id: s.uid } }) : null;
  if (!user) redirect("/admin/login");
  return user;
}

/** Current admin for the current tenant, or redirect to login. */
export async function requireAdmin(permission?: string) {
  const tenant = await getTenant();
  if (!tenant) redirect("/");
  const tok = (await cookies()).get(COOKIE)?.value;
  const s = tok ? verify(tok) : null;
  if (!s) redirect("/admin/login");
  const user = await db.user.findUnique({ where: { id: s.uid } });
  if (!user) redirect("/admin/login");
  const m = await db.membership.findUnique({ where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } } });
  if (!m && !user.isSuperAdmin) redirect("/admin/login?e=forbidden");
  const perms = m?.permissions.length ? m.permissions : PERMISSIONS[m?.role ?? "owner"] ?? [];
  const can = (p: string) => user.isSuperAdmin || perms.includes("*") || perms.includes(p);
  if (permission && !can(permission)) redirect("/admin?e=forbidden");
  return { user, tenant, role: m?.role ?? "owner", can };
}
