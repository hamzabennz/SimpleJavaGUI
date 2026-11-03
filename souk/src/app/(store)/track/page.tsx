import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { getDict, getLang, tr } from "@/lib/i18n";
import { normalizePhone } from "@/lib/forms";
import { dzd } from "@/lib/money";

export default async function Track({ searchParams }: { searchParams: Promise<{ n?: string; p?: string }> }) {
  const tenant = await requireTenant();
  const lang = await getLang(tenant);
  const t = getDict(lang);
  const sp = await searchParams;
  const order = sp.n && sp.p
    ? await db.order.findFirst({ where: { tenantId: tenant.id, number: Number(sp.n) || 0, phone: normalizePhone(sp.p) }, include: { events: { where: { type: "status" }, orderBy: { createdAt: "asc" } } } })
    : null;
  const label = (k: string | null) => { const s = tenant.config.orderStatuses.find((x) => x.key === k); return s ? { text: tr(s.label, lang), color: s.color } : { text: k ?? "", color: "#64748b" }; };
  return (
    <div className="container section" style={{ maxWidth: 560 }}>
      <h1>{t.track_order}</h1>
      <form className="card stack">
        <div className="field"><label>{t.order_number}</label><input name="n" defaultValue={sp.n} inputMode="numeric" required /></div>
        <div className="field"><label>{t.phone}</label><input name="p" defaultValue={sp.p} inputMode="tel" dir="ltr" required /></div>
        <button className="btn">{t.find}</button>
      </form>
      {sp.n && !order && <div className="alert" style={{ marginTop: 16 }}>{t.not_found}</div>}
      {order && (
        <div className="card stack" style={{ marginTop: 16 }}>
          <div className="row between"><b>#{order.number}</b><span className="badge" style={{ background: label(order.status).color }}>{label(order.status).text}</span></div>
          <div>{t.total}: <b>{dzd(order.total, lang)}</b></div>
          {order.trackingNumber && <div>Tracking: <b dir="ltr">{order.trackingNumber}</b></div>}
          <ol>{order.events.map((e) => <li key={e.id}>{label(e.toStatus).text} <span className="muted">· {e.createdAt.toLocaleString("fr-DZ")}</span></li>)}</ol>
        </div>
      )}
    </div>
  );
}
