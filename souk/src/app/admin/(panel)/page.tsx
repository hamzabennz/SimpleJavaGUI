import { adminT } from "@/lib/admin-lang";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { wilayaName } from "@/lib/algeria";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { tenant } = await requireAdmin();
  const { t, lang } = await adminT();
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
    ["CA livré", dzd(revenue._sum.total ?? 0, lang)],
    ["Panier moyen", total ? dzd(Math.round(byStatus.reduce((a, x) => a + (x._sum.total ?? 0), 0) / total)) : "—"],
  ];
  const [productCount, hasOrders] = await Promise.all([
    db.product.count({ where: { tenantId: tenant.id, status: "active" } }),
    db.order.count({ where: { tenantId: tenant.id } }),
  ]);
  const cfg = tenant.config;
  const steps: [boolean, string, string][] = [
    [productCount > 0, t("Ajouter votre premier produit"), "/admin/products/new"],
    [!!cfg.store.phone, t("Renseigner le téléphone et les réseaux sociaux"), "/admin/settings"],
    [cfg.theme.colors.primary !== "#0f766e" || cfg.theme.preset !== "classic", t("Personnaliser les couleurs de la boutique"), "/admin/design/theme"],
    [!!cfg.tracking.metaPixelId || !!cfg.tracking.tiktokPixelId, t("Connecter le pixel Facebook ou TikTok"), "/admin/settings"],
    [cfg.integrations.defaultCarrier !== "manual" || !!cfg.notifications.telegram.chatId, t("Connecter un transporteur ou Telegram"), "/admin/settings/integrations"],
    [hasOrders > 0, t("Recevoir votre première commande"), "/"],
  ];
  const doneCount = steps.filter(([d]) => d).length;
  const statusMeta = (k: string) => tenant.config.orderStatuses.find((s) => s.key === k);
  return (
    <>
      <div className="row between wrap">
        <h1>{t("Tableau de bord")}</h1>
        <div className="tabs">{[1, 7, 30, 90].map((d) => <Link key={d} href={`?d=${d}`} className={d === days ? "on" : ""}>{d === 1 ? t("Aujourd'hui") : `${d} ${t("jours")}`}</Link>)}</div>
      </div>
      {doneCount < steps.length && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row between"><b>🚀 {t("Démarrage")} — {doneCount}/{steps.length}</b>
            <div style={{ width: 160, height: 6, background: "var(--c-border)", borderRadius: 4 }}><div style={{ width: `${(doneCount / steps.length) * 100}%`, height: "100%", background: "var(--c-success)", borderRadius: 4 }} /></div>
          </div>
          <ul className="checklist" style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
            {steps.map(([d, l, h]) => <li key={l}><span>{d ? "✅" : "⬜"}</span>{d ? <span className="done">{l}</span> : <Link href={h}>{l} →</Link>}</li>)}
          </ul>
        </div>
      )}
      <div className="kpis">{kpis.map(([l, v]) => <div key={l} className="card kpi"><div className="l">{t(l)}</div><div className="v">{v}</div></div>)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, marginTop: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t("Par statut")}</h3>
          {byStatus.sort((a, b) => b._count - a._count).map((s) => {
            const m = statusMeta(s.status);
            return (
              <div key={s.status} style={{ marginBottom: 8 }}>
                <div className="row between"><span>{m?.label[lang] || m?.label.fr || s.status}</span><b>{s._count}</b></div>
                <div style={{ height: 6, background: "var(--c-border)", borderRadius: 4 }}><div style={{ width: `${(s._count / total) * 100}%`, height: "100%", background: m?.color ?? "#999", borderRadius: 4 }} /></div>
              </div>
            );
          })}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t("Top wilayas")}</h3>
          <table className="tbl"><tbody>{byWilaya.map((w) => <tr key={w.wilayaCode}><td>{wilayaName(w.wilayaCode, lang)}</td><td style={{ textAlign: "end" }}><b>{w._count}</b></td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t("Top produits")}</h3>
          <table className="tbl"><tbody>{topItems.map((p) => <tr key={p.name}><td>{p.name}</td><td style={{ textAlign: "end" }}><b>{p._sum.qty}</b></td></tr>)}</tbody></table>
        </div>
      </div>
    </>
  );
}
