import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { setTenantStatus, setTenantPlan } from "../admin/actions";
import { CreateTenant } from "./CreateTenant";

export const dynamic = "force-dynamic";

/** Platform owner console: manage tenants & plans. Requires User.isSuperAdmin. */
export default async function Platform() {
  const { user } = await requireAdmin();
  if (!user.isSuperAdmin) redirect("/admin");
  const since = new Date(Date.now() - 30 * 864e5);
  const [tenants, plans, orders] = await Promise.all([
    db.tenant.findMany({ include: { plan: true, _count: { select: { products: true, orders: true } } }, orderBy: { createdAt: "desc" } }),
    db.plan.findMany({ orderBy: { priceDzd: "asc" } }),
    db.order.groupBy({ by: ["tenantId"], where: { createdAt: { gte: since } }, _count: true, _sum: { total: true } }),
  ]);
  const root = process.env.ROOT_DOMAIN ?? "localhost:3000";
  const mrr = tenants.filter((t) => t.status === "active").reduce((s, t) => s + (t.plan?.priceDzd ?? 0), 0);
  return (
    <div className="admin" dir="ltr" style={{ gridTemplateColumns: "1fr" }}>
      <main style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <h1>🏢 Plateforme Souk</h1>
        <div className="kpis" style={{ marginBottom: 16 }}>
          <div className="card kpi"><div className="l">Boutiques</div><div className="v">{tenants.length}</div></div>
          <div className="card kpi"><div className="l">Actives</div><div className="v">{tenants.filter((t) => t.status === "active").length}</div></div>
          <div className="card kpi"><div className="l">MRR</div><div className="v">{dzd(mrr)}</div></div>
          <div className="card kpi"><div className="l">Commandes 30j (toutes)</div><div className="v">{orders.reduce((s, o) => s + o._count, 0)}</div></div>
        </div>
        <div className="card table-wrap" style={{ padding: 0, marginBottom: 16 }}>
          <table className="tbl">
            <thead><tr><th>Boutique</th><th>URL</th><th>Plan</th><th>Produits</th><th>Commandes 30j</th><th>GMV 30j</th><th>Statut</th><th></th></tr></thead>
            <tbody>{tenants.map((t) => {
              const o = orders.find((x) => x.tenantId === t.id);
              return (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td>
                  <td><a href={`http://${t.slug}.${root}`} target="_blank" dir="ltr">{t.slug}.{root}</a></td>
                  <td>
                    <form action={setTenantPlan.bind(null, t.id)} className="row">
                      <select name="planId" defaultValue={t.planId ?? ""} style={{ width: "auto", padding: "4px 8px" }}><option value="">—</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({dzd(p.priceDzd)})</option>)}</select>
                      <button className="btn sm ghost">OK</button>
                    </form>
                  </td>
                  <td>{t._count.products}</td><td>{o?._count ?? 0}</td><td>{dzd(o?._sum.total ?? 0)}</td>
                  <td><span className="badge" style={{ background: t.status === "active" ? "#16a34a" : "#dc2626" }}>{t.status}</span></td>
                  <td><form action={setTenantStatus.bind(null, t.id, t.status === "active" ? "suspended" : "active")}><button className="btn sm ghost">{t.status === "active" ? "Suspendre" : "Réactiver"}</button></form></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <CreateTenant plans={plans.map((p) => ({ id: p.id, name: p.name }))} />
      </main>
    </div>
  );
}
