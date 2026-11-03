import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { wilayaName } from "@/lib/algeria";

/** Profit = delivered revenue − product cost − (delivery fees paid on returns). */
export default async function Reports({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { tenant } = await requireAdmin("reports");
  const days = Number((await searchParams).d) || 30;
  const since = new Date(Date.now() - days * 864e5);
  const orders = await db.order.findMany({
    where: { tenantId: tenant.id, createdAt: { gte: since } },
    select: { status: true, total: true, deliveryFee: true, discount: true, wilayaCode: true, createdAt: true, items: { select: { qty: true, unitPrice: true, name: true, product: { select: { cost: true } } } } },
  });
  const delivered = orders.filter((o) => o.status === "delivered");
  const returned = orders.filter((o) => o.status === "returned");
  const revenue = delivered.reduce((s, o) => s + o.total - o.deliveryFee, 0);
  const cogs = delivered.reduce((s, o) => s + o.items.reduce((a, i) => a + (i.product?.cost ?? 0) * i.qty, 0), 0);
  const returnCost = returned.reduce((s, o) => s + o.deliveryFee, 0); // the merchant usually pays the return trip
  const profit = revenue - cogs - returnCost;

  // per day series (delivered revenue)
  const byDay = new Map<string, { orders: number; revenue: number }>();
  for (let i = days - 1; i >= 0; i--) byDay.set(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10), { orders: 0, revenue: 0 });
  for (const o of orders) {
    const k = o.createdAt.toISOString().slice(0, 10);
    const r = byDay.get(k); if (!r) continue;
    r.orders++; if (o.status === "delivered") r.revenue += o.total;
  }
  const series = [...byDay.entries()];
  const maxOrders = Math.max(1, ...series.map(([, v]) => v.orders));

  // per product
  const prod = new Map<string, { qty: number; revenue: number; cost: number }>();
  for (const o of delivered) for (const i of o.items) {
    const r = prod.get(i.name) ?? { qty: 0, revenue: 0, cost: 0 };
    r.qty += i.qty; r.revenue += i.unitPrice * i.qty; r.cost += (i.product?.cost ?? 0) * i.qty; prod.set(i.name, r);
  }
  // per wilaya: delivery success
  const wil = new Map<number, { total: number; delivered: number; returned: number }>();
  for (const o of orders) {
    const r = wil.get(o.wilayaCode) ?? { total: 0, delivered: 0, returned: 0 };
    r.total++; if (o.status === "delivered") r.delivered++; if (o.status === "returned") r.returned++; wil.set(o.wilayaCode, r);
  }
  return (
    <>
      <div className="row between wrap">
        <h1>Rapports</h1>
        <div className="tabs">{[7, 30, 90, 365].map((d) => <Link key={d} href={`?d=${d}`} className={d === days ? "on" : ""}>{d} jours</Link>)}</div>
      </div>
      <div className="kpis">
        {[["CA livré (hors livraison)", dzd(revenue)], ["Coût des produits", dzd(cogs)], ["Frais de retour", dzd(returnCost)], ["Bénéfice estimé", dzd(profit)], ["Marge", revenue ? `${Math.round((profit / revenue) * 100)}%` : "—"]].map(([l, v]) => (
          <div key={l} className="card kpi"><div className="l">{l}</div><div className="v">{v}</div></div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Commandes par jour</h3>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 140 }}>
          {series.map(([d, v]) => (
            <div key={d} title={`${d}: ${v.orders} commandes · ${dzd(v.revenue)}`} style={{ flex: 1, height: `${(v.orders / maxOrders) * 100}%`, minHeight: v.orders ? 3 : 0, background: "var(--c-primary)", borderRadius: "3px 3px 0 0" }} />
          ))}
        </div>
        <div className="row between muted" style={{ fontSize: ".75rem" }}><span>{series[0]?.[0]}</span><span>{series.at(-1)?.[0]}</span></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(380px,1fr))", gap: 16, marginTop: 16 }}>
        <div className="card table-wrap">
          <h3 style={{ marginTop: 0 }}>Par produit (livrées)</h3>
          <table className="tbl"><thead><tr><th>Produit</th><th>Qté</th><th>CA</th><th>Marge</th></tr></thead>
            <tbody>{[...prod.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([n, r]) => <tr key={n}><td>{n}</td><td>{r.qty}</td><td>{dzd(r.revenue)}</td><td>{dzd(r.revenue - r.cost)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card table-wrap">
          <h3 style={{ marginTop: 0 }}>Par wilaya</h3>
          <table className="tbl"><thead><tr><th>Wilaya</th><th>Cmd</th><th>Livrées</th><th>Retours</th><th>Taux</th></tr></thead>
            <tbody>{[...wil.entries()].sort((a, b) => b[1].total - a[1].total).map(([w, r]) => {
              const rate = r.delivered + r.returned ? Math.round((r.delivered / (r.delivered + r.returned)) * 100) : null;
              return <tr key={w}><td>{wilayaName(w)}</td><td>{r.total}</td><td>{r.delivered}</td><td>{r.returned}</td><td>{rate === null ? "—" : <b style={{ color: rate >= 70 ? "var(--c-success)" : "var(--c-danger)" }}>{rate}%</b>}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}
