import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const { tenant } = await requireAdmin("customers");
  const customers = await db.customer.findMany({ where: { tenantId: tenant.id }, include: { orders: { select: { status: true, total: true } } }, orderBy: { createdAt: "desc" } });
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = customers.map((c) => {
    const d = c.orders.filter((o) => o.status === "delivered");
    return [c.name, c.phone, c.email, c.orders.length, d.length, c.orders.filter((o) => o.status === "returned").length, d.reduce((s, o) => s + o.total, 0), c.blacklisted ? "yes" : "", c.createdAt.toISOString()].map(esc).join(",");
  });
  return new Response("\uFEFF" + ["name,phone,email,orders,delivered,returned,spent,blacklisted,created_at", ...rows].join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="clients-${tenant.slug}.csv"` },
  });
}
