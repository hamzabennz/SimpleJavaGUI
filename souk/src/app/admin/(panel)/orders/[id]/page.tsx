import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { wilayaName } from "@/lib/algeria";
import { tr } from "@/lib/i18n";
import { StatusButtons } from "../StatusButtons";
import { ShipButton } from "../ShipButton";
import { addOrderNote, updateOrderShipping, toggleBlacklist } from "../../../actions";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { tenant } = await requireAdmin("orders");
  const { id } = await params;
  const o = await db.order.findFirst({ where: { id, tenantId: tenant.id }, include: { items: true, events: { orderBy: { createdAt: "desc" } }, customer: true } });
  if (!o) notFound();
  const history = await db.order.groupBy({ by: ["status"], where: { tenantId: tenant.id, phone: o.phone }, _count: true });
  const delivered = history.find((h) => h.status === "delivered")?._count ?? 0;
  const returned = history.find((h) => h.status === "returned")?._count ?? 0;
  const statuses = tenant.config.orderStatuses.map((s) => ({ key: s.key, label: s.label.fr, color: s.color }));
  const label = (k: string | null) => statuses.find((s) => s.key === k)?.label ?? k;
  const customFields = tenant.config.checkout.fields.filter((f) => (o.customFields as any)?.[f.key] !== undefined);
  return (
    <>
      <Link href="/admin/orders" className="muted">← Commandes</Link>
      <h1>Commande #{o.number}</h1>
      <div className="card" style={{ marginBottom: 16 }}><StatusButtons orderId={o.id} current={o.status} statuses={statuses} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        <div className="stack">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Client</h3>
            <p style={{ margin: 0 }}><b>{o.name}</b></p>
            <p className="row" style={{ margin: "6px 0" }}>
              <a href={`tel:${o.phone}`} className="btn sm" dir="ltr">📞 {o.phone}</a>
              <a href={`https://wa.me/213${o.phone.slice(1)}`} target="_blank" className="btn sm ghost">💬 WhatsApp</a>
            </p>
            <p style={{ margin: 0 }}>{wilayaName(o.wilayaCode)} · {o.commune ?? "—"} · {o.deliveryType === "desk" ? "Stop desk" : "Domicile"}</p>
            <p className="muted" style={{ margin: "6px 0" }}>Historique : {delivered} livrée(s), {returned} retour(s)</p>
            {o.customer && (
              <form action={toggleBlacklist.bind(null, o.customer.id)}>
                <button className={`btn sm ${o.customer.blacklisted ? "" : "danger"}`}>{o.customer.blacklisted ? "Retirer de la blacklist" : "⛔ Blacklister ce numéro"}</button>
              </form>
            )}
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Produits</h3>
            <div className="summary">
              {o.items.map((i) => <div key={i.id} className="line"><span>{i.name}{i.variant ? ` (${i.variant})` : ""} × {i.qty}</span><span>{dzd(i.unitPrice * i.qty)}</span></div>)}
              {o.discount > 0 && <div className="line"><span>Remise {o.couponCode}</span><span>-{dzd(o.discount)}</span></div>}
              <div className="line"><span>Livraison</span><span>{dzd(o.deliveryFee)}</span></div>
              <div className="line total"><span>Total</span><span>{dzd(o.total)}</span></div>
            </div>
            {customFields.length > 0 && (
              <table className="tbl" style={{ marginTop: 12 }}><tbody>{customFields.map((f) => <tr key={f.key}><th>{tr(f.label, "fr")}</th><td>{String((o.customFields as any)[f.key])}</td></tr>)}</tbody></table>
            )}
          </div>
          <form action={updateOrderShipping.bind(null, o.id)} className="card stack">
            <div className="row between wrap"><h3 style={{ margin: 0 }}>Expédition</h3>{!o.trackingNumber && <ShipButton orderId={o.id} label="Envoyer au transporteur" />}</div>
            <div className="field"><label>Adresse</label><input name="address" defaultValue={o.address ?? ""} /></div>
            <div className="form-grid">
              <div className="field half"><label>Transporteur</label>
                <select name="carrier" defaultValue={o.carrier ?? ""}><option value="">—</option>{["Yalidine", "ZR Express", "Maystro", "Noest", "EcoTrack", "Autre"].map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <div className="field half"><label>N° de suivi</label><input name="trackingNumber" defaultValue={o.trackingNumber ?? ""} dir="ltr" /></div>
            </div>
            <button className="btn sm" style={{ alignSelf: "start" }}>Enregistrer</button>
          </form>
        </div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Suivi & appels</h3>
          <form action={addOrderNote.bind(null, o.id)} className="stack">
            <textarea name="note" rows={2} placeholder="Note (ex: rappeler à 18h)" />
            <div className="row">
              <button className="btn sm" name="type" value="note">Ajouter une note</button>
              <button className="btn sm ghost" name="type" value="call">📞 Enregistrer un appel</button>
            </div>
          </form>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {o.events.map((e) => (
              <li key={e.id} style={{ borderInlineStart: "3px solid var(--c-border)", paddingInlineStart: 10, marginBottom: 10 }}>
                <div style={{ fontSize: ".9rem" }}>
                  {e.type === "status" ? <>Statut : <b>{e.fromStatus ? `${label(e.fromStatus)} → ` : ""}{label(e.toStatus)}</b></> : e.type === "call" ? "📞 Appel" : "📝 Note"}
                  {e.note && e.note !== "created" && <div>{e.note}</div>}
                </div>
                <div className="muted" style={{ fontSize: ".75rem" }}>{e.createdAt.toLocaleString("fr-DZ")}</div>
              </li>
            ))}
          </ul>
          {o.ip && <div className="muted" style={{ fontSize: ".75rem" }}>IP : {o.ip}</div>}
        </div>
      </div>
    </>
  );
}
