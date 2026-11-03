import { adminT } from "@/lib/admin-lang";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { wilayaName } from "@/lib/algeria";
import { tr } from "@/lib/i18n";
import { StatusButtons } from "../StatusButtons";
import { ShipButton } from "../ShipButton";
import { EditOrder } from "./EditOrder";
import { addOrderNote, updateOrderShipping, toggleBlacklist, assignOrder } from "../../../actions";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { tenant } = await requireAdmin("orders");
  const { t, lang } = await adminT();
  const { id } = await params;
  const o = await db.order.findFirst({ where: { id, tenantId: tenant.id }, include: { items: true, events: { orderBy: { createdAt: "desc" } }, customer: true } });
  if (!o) notFound();
  const history = await db.order.groupBy({ by: ["status"], where: { tenantId: tenant.id, phone: o.phone }, _count: true });
  const delivered = history.find((h) => h.status === "delivered")?._count ?? 0;
  const returned = history.find((h) => h.status === "returned")?._count ?? 0;
  const statuses = tenant.config.orderStatuses.map((s) => ({ key: s.key, label: s.label[lang] || s.label.fr, color: s.color }));
  const label = (k: string | null) => statuses.find((s) => s.key === k)?.label ?? k;
  const products = ["shipped", "delivered", "returned"].includes(o.status) ? [] : await db.product.findMany({ where: { tenantId: tenant.id, status: "active" }, include: { variants: true } });
  const team = await db.membership.findMany({ where: { tenantId: tenant.id }, include: { user: { select: { id: true, name: true } } } });
  const customFields = tenant.config.checkout.fields.filter((f) => (o.customFields as any)?.[f.key] !== undefined);
  return (
    <>
      <Link href="/admin/orders" className="muted">{t("← Commandes")}</Link>
      <div className="row between wrap"><h1>{t("Commande")} #{o.number}</h1><a className="btn ghost sm" target="_blank" href={`/admin/print?id=${o.id}`}>{t("🖨 Imprimer")}</a></div>
      <div className="card" style={{ marginBottom: 16 }}><StatusButtons orderId={o.id} current={o.status} statuses={statuses} /></div>
      {!["shipped", "delivered", "returned"].includes(o.status) && (
        <div style={{ marginBottom: 16 }}>
          <EditOrder
            order={{ id: o.id, name: o.name, phone: o.phone, commune: o.commune ?? "", address: o.address ?? "", deliveryType: o.deliveryType === "desk" ? "desk" : "home", deliveryFee: o.deliveryFee, discount: o.discount, items: o.items.map((i) => ({ id: i.id, name: i.name, variant: i.variant, qty: i.qty, unitPrice: i.unitPrice })) }}
            products={products.map((p) => ({ id: p.id, name: tr(p.name, "fr"), price: p.price, variants: p.variants.map((v) => ({ id: v.id, label: Object.values(v.optionValues as Record<string, string>).join(" / "), price: v.price })) }))}
          />
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        <div className="stack">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{t("Client")}</h3>
            <p style={{ margin: 0 }}><b>{o.name}</b></p>
            <p className="row" style={{ margin: "6px 0" }}>
              <a href={`tel:${o.phone}`} className="btn sm" dir="ltr">📞 {o.phone}</a>
              <a href={`https://wa.me/213${o.phone.slice(1)}`} target="_blank" className="btn sm ghost">{t("💬 WhatsApp")}</a>
            </p>
            <p style={{ margin: 0 }}>{wilayaName(o.wilayaCode, lang)} · {o.commune ?? "—"} · {o.deliveryType === "desk" ? t("Stop desk") : t("Domicile")}</p>
            <p className="muted" style={{ margin: "6px 0" }}>{t("Historique")} : {delivered} {t("livrée(s)")}, {returned} {t("retour(s)")}</p>
            {o.customer && (
              <form action={toggleBlacklist.bind(null, o.customer.id)}>
                <button className={`btn sm ${o.customer.blacklisted ? "" : "danger"}`}>{o.customer.blacklisted ? t("Retirer de la blacklist") : t("⛔ Blacklister ce numéro")}</button>
              </form>
            )}
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{t("Produits")}</h3>
            <div className="summary">
              {o.items.map((i) => <div key={i.id} className="line"><span>{i.name}{i.variant ? ` (${i.variant})` : ""} × {i.qty}</span><span>{dzd(i.unitPrice * i.qty, lang)}</span></div>)}
              {o.discount > 0 && <div className="line"><span>Remise {o.couponCode}</span><span>-{dzd(o.discount, lang)}</span></div>}
              <div className="line"><span>{t("Livraison")}</span><span>{dzd(o.deliveryFee, lang)}</span></div>
              <div className="line total"><span>{t("Total")}</span><span>{dzd(o.total, lang)}</span></div>
            </div>
            {customFields.length > 0 && (
              <table className="tbl" style={{ marginTop: 12 }}><tbody>{customFields.map((f) => <tr key={f.key}><th>{tr(f.label, "fr")}</th><td>{String((o.customFields as any)[f.key])}</td></tr>)}</tbody></table>
            )}
          </div>
          <form action={updateOrderShipping.bind(null, o.id)} className="card stack">
            <div className="row between wrap"><h3 style={{ margin: 0 }}>{t("Expédition")}</h3>{!o.trackingNumber && <ShipButton orderId={o.id} label={t("Envoyer au transporteur")} />}</div>
            <div className="field"><label>{t("Adresse")}</label><input name="address" defaultValue={o.address ?? ""} /></div>
            <div className="form-grid">
              <div className="field half"><label>{t("Transporteur")}</label>
                <select name="carrier" defaultValue={o.carrier ?? ""}><option value="">—</option>{["Yalidine", "ZR Express", "Maystro", "Noest", "EcoTrack", "Autre"].map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <div className="field half"><label>{t("N° de suivi")}</label><input name="trackingNumber" defaultValue={o.trackingNumber ?? ""} dir="ltr" /></div>
            </div>
            <button className="btn sm" style={{ alignSelf: "start" }}>{t("Enregistrer")}</button>
          </form>
        </div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>{t("Suivi & appels")}</h3>
          <form action={assignOrder.bind(null, o.id)} className="row">
            <label style={{ whiteSpace: "nowrap" }}>{t("Assignée à")}</label>
            <select name="userId" defaultValue={o.assignedToId ?? ""}><option value="">—</option>{team.map((m) => <option key={m.userId} value={m.userId}>{m.user.name} ({m.role})</option>)}</select>
            <button className="btn sm ghost">OK</button>
          </form>
          <form action={addOrderNote.bind(null, o.id)} className="stack">
            <textarea name="note" rows={2} placeholder={t("Note (ex: rappeler à 18h)")} />
            <div className="row">
              <button className="btn sm" name="type" value="note">{t("Ajouter une note")}</button>
              <button className="btn sm ghost" name="type" value="call">{t("📞 Enregistrer un appel")}</button>
            </div>
          </form>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {o.events.map((e) => (
              <li key={e.id} style={{ borderInlineStart: "3px solid var(--c-border)", paddingInlineStart: 10, marginBottom: 10 }}>
                <div style={{ fontSize: ".9rem" }}>
                  {e.type === "status" ? <>{t("Statut :")} <b>{e.fromStatus ? `${label(e.fromStatus)} → ` : ""}{label(e.toStatus)}</b></> : e.type === "call" ? "📞 Appel" : "📝 Note"}
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
