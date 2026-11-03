import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { wilayaName } from "@/lib/algeria";
import { PrintButton } from "./PrintButton";

/** Printable invoices / delivery slips, one per page. ?id=<orderId> or ?s=<status> */
export default async function Print({ searchParams }: { searchParams: Promise<{ id?: string; s?: string }> }) {
  const { tenant } = await requireAdmin("orders");
  const sp = await searchParams;
  const orders = await db.order.findMany({
    where: { tenantId: tenant.id, ...(sp.id ? { id: sp.id } : { status: sp.s ?? "confirmed" }) },
    include: { items: true }, orderBy: { number: "asc" }, take: 200,
  });
  const st = tenant.config.store;
  return (
    <div dir="ltr" style={{ background: "#fff", color: "#000", fontFamily: "system-ui" }}>
      <style>{`@media print{.noprint{display:none}} .slip{page-break-after:always;padding:24px;max-width:760px;margin:0 auto} .slip table{width:100%;border-collapse:collapse} .slip td,.slip th{border:1px solid #ccc;padding:6px;text-align:left}`}</style>
      <div className="noprint row" style={{ padding: 16, gap: 12 }}><PrintButton /><span>{orders.length} commande(s)</span></div>
      {orders.map((o) => (
        <div key={o.id} className="slip">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div><h2 style={{ margin: 0 }}>{tenant.name}</h2><div>{st.phone}</div></div>
            <div style={{ textAlign: "right" }}><h2 style={{ margin: 0 }}>#{o.number}</h2><div>{o.createdAt.toLocaleDateString("fr-DZ")}</div>{o.trackingNumber && <div>Suivi : <b>{o.trackingNumber}</b> ({o.carrier})</div>}</div>
          </div>
          <hr />
          <p><b>{o.name}</b> — <b>{o.phone}</b><br />{wilayaName(o.wilayaCode)} · {o.commune ?? ""} · {o.address ?? ""}<br />Livraison : {o.deliveryType === "desk" ? "Stop desk" : "Domicile"}</p>
          <table>
            <thead><tr><th>Produit</th><th>Qté</th><th>P.U.</th><th>Total</th></tr></thead>
            <tbody>
              {o.items.map((i) => <tr key={i.id}><td>{i.name}{i.variant ? ` (${i.variant})` : ""}</td><td>{i.qty}</td><td>{dzd(i.unitPrice)}</td><td>{dzd(i.unitPrice * i.qty)}</td></tr>)}
              {o.discount > 0 && <tr><td colSpan={3}>Remise</td><td>-{dzd(o.discount)}</td></tr>}
              <tr><td colSpan={3}>Livraison</td><td>{dzd(o.deliveryFee)}</td></tr>
              <tr><th colSpan={3}>À PAYER À LA LIVRAISON</th><th>{dzd(o.total)}</th></tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
