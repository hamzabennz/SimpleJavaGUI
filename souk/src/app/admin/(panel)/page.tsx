import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { wilayaName } from "@/lib/algeria";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { tenant } = await requireAdmin();
  const days = Number((await searchParams).d) || 30;
  const since = new Date(Date.now() - days * 864e5);
  const where = { tenantId: tenant.id, createdAt: { gte: since } };
  const [byStatus, byWilaya, topItems, revenue] = await Promise.all([
    db.order.groupBy({ by: ["status"], where, _count: true, _sum: { total: true } }),
    db.order.groupBy({ by: ["wilayaCode"], where, _count: true, orderBy: { _count: { wilayaCode: "desc" } }, take: 6 }),
    db.orderItem.groupBy({ by: ["name"], where: { order: where }, _sum: { qty: true }, orderBy: { _sum: { qty: "desc" } }, take: 6 }),
    db.order.aggregate({ where: { ...where, status: "delivered" }, _sum: { total: true, deliveryFee: true } }),
  ]);
  const count = (s: string[]) => byStatus.filter((x) => s.includes(x.status)).reduce((a, x) => a + x._count, 0);
  const total = byStatus.reduce((a, x) => a + x._count, 0);
  const confirmedish = count(["confirmed", "shipped", "delivered", "returned"]);
  const decided = confirmedish + count(["cancelled"]);
  const shipped = count(["delivered", "returned"]);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const kpis = [
    ["Commandes", String(total)],
    ["À confirmer", String(count(["new", "no_answer", "postponed"]))],
    ["Taux de confirmation", pct(confirmedish, decided)],
    ["Taux de livraison", pct(count(["delivered"]), shipped)],
    ["CA livré", dzd(revenue._sum.total ?? 0)],
    ["Panier moyen", total ? dzd(Math.round(byStatus.reduce((a, x) => a + (x._sum.total ?? 0), 0) / total)) : "—"],
  ];
  const statusMeta = (k: string) => tenant.config.orderStatuses.find((s) => s.key === k);
  return (
    <>
      <div className="row between wrap">
        <h1>Tableau de bord</h1>
        <div className="tabs">{[1, 7, 30, 90].map((d) => <Link key={d} href={`?d=${d}`} className={d === days ? "on" : ""}>{d === 1 ? "Aujourd'hui" : `${d} jours`}</Link>)}</div>
      </div>
      <div className="kpis">{kpis.map(([l, v]) => <div key={l} className="card kpi"><div className="l">{l}</div><div className="v">{v}</div></div>)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, marginTop: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Par statut</h3>
          {byStatus.sort((a, b) => b._count - a._count).map((s) => {
            const m = statusMeta(s.status);
            return (
              <div key={s.status} style={{ marginBottom: 8 }}>
                <div className="row between"><span>{m?.label.fr ?? s.status}</span><b>{s._count}</b></div>
                <div style={{ height: 6, background: "var(--c-border)", borderRadius: 4 }}><div style={{ width: `${(s._count / total) * 100}%`, height: "100%", background: m?.color ?? "#999", borderRadius: 4 }} /></div>
              </div>
            );
          })}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Top wilayas</h3>
          <table className="tbl"><tbody>{byWilaya.map((w) => <tr key={w.wilayaCode}><td>{wilayaName(w.wilayaCode)}</td><td style={{ textAlign: "end" }}><b>{w._count}</b></td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Top produits</h3>
          <table className="tbl"><tbody>{topItems.map((p) => <tr key={p.name}><td>{p.name}</td><td style={{ textAlign: "end" }}><b>{p._sum.qty}</b></td></tr>)}</tbody></table>
        </div>
      </div>
    </>
  );
}
