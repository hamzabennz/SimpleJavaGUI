import { adminT } from "@/lib/admin-lang";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { wilayaName } from "@/lib/algeria";
import { StatusButtons } from "./StatusButtons";
import { ShipButton } from "./ShipButton";
import { bulkOrders } from "../../actions";
import { SelectAll } from "./SelectAll";

export default async function Orders({ searchParams }: { searchParams: Promise<{ s?: string; q?: string; page?: string; mine?: string }> }) {
  const { tenant, user, role } = await requireAdmin("orders");
  const { t, lang } = await adminT();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const where = {
    tenantId: tenant.id,
    ...(sp.s ? { status: sp.s } : {}),
    ...(role === "confirmer" || sp.mine ? { assignedToId: user.id } : {}),
    ...(q ? { OR: [{ phone: { contains: q.replace(/\s/g, "") } }, { name: { contains: q, mode: "insensitive" as const } }, ...(Number(q) ? [{ number: Number(q) }] : [])] } : {}),
  };
  const [orders, total, counts] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, take: 50, skip: (page - 1) * 50, include: { items: true, customer: true } }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], where: { tenantId: tenant.id }, _count: true }),
  ]);
  // duplicate detection: same phone with >1 order in the window
  const windowStart = new Date(Date.now() - tenant.config.checkout.duplicateWindowHours * 3600_000);
  const dupPhones = new Set((await db.order.groupBy({ by: ["phone"], where: { tenantId: tenant.id, createdAt: { gte: windowStart } }, _count: true, having: { phone: { _count: { gt: 1 } } } })).map((d) => d.phone));
  // risk score per phone: past returns vs deliveries
  const hist = await db.order.groupBy({ by: ["phone", "status"], where: { tenantId: tenant.id, phone: { in: orders.map((o) => o.phone) }, status: { in: ["delivered", "returned"] } }, _count: true });
  const risk = (phone: string) => {
    const r = hist.find((h) => h.phone === phone && h.status === "returned")?._count ?? 0;
    const d = hist.find((h) => h.phone === phone && h.status === "delivered")?._count ?? 0;
    return r >= 2 || (r >= 1 && r >= d) ? { r, d } : null;
  };
  const statuses = tenant.config.orderStatuses.map((s) => ({ key: s.key, label: s.label[lang] || s.label.fr, color: s.color }));
  const qs = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ s: sp.s, q, mine: sp.mine, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <div className="row between wrap">
        <h1>{t("Commandes")}</h1>
        <div className="row wrap">
          <Link href="/admin/orders/new" className="btn sm">{t("+ Commande manuelle")}</Link>
          <ShipButton label={t("Expédier les commandes confirmées")} />
          <a className="btn ghost sm" target="_blank" href={`/admin/print?s=${sp.s ?? "confirmed"}`}>{t("Imprimer")} ({statuses.find((x) => x.key === (sp.s ?? "confirmed"))?.label})</a>
          <a className="btn ghost sm" href={`/admin/orders/export${qs({})}`}>{t("Export CSV")}</a>
        </div>
      </div>
      <div className="tabs">
        {role !== "confirmer" && <Link href={qs({ mine: sp.mine ? undefined : "1", page: undefined })} className={sp.mine ? "on" : ""}>{t("Mes commandes")}</Link>}
        <Link href={qs({ s: undefined, page: undefined })} className={!sp.s ? "on" : ""}>{t("Toutes")}</Link>
        {statuses.map((s) => (
          <Link key={s.key} href={qs({ s: s.key, page: undefined })} className={sp.s === s.key ? "on" : ""}>
            {s.label} <b>{counts.find((c) => c.status === s.key)?._count ?? 0}</b>
          </Link>
        ))}
      </div>
      <form className="row" style={{ marginBottom: 12 }}>
        {sp.s && <input type="hidden" name="s" value={sp.s} />}
        <input name="q" defaultValue={q} placeholder={t("N°, nom ou téléphone")} style={{ maxWidth: 320 }} />
        <button className="btn sm">{t("Rechercher")}</button>
      </form>
      <form action={bulkOrders} id="bulk">
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <select name="op" defaultValue="" style={{ width: "auto" }} required>
          <option value="" disabled>{t("Action groupée…")}</option>
          {statuses.map((s) => <option key={s.key} value={`status:${s.key}`}>→ {s.label}</option>)}
          <option value="ship">{t("Envoyer au transporteur")}</option>
          <option value="print">{t("Imprimer")}</option>
        </select>
        <button className="btn sm ghost">{t("Appliquer à la sélection")}</button>
      </div>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="tbl">
          <thead><tr><th><SelectAll /></th><th>#</th><th>{t("Client")}</th><th>{t("Wilaya")}</th><th>{t("Produits")}</th><th>{t("Total")}</th><th>{t("Statut")}</th><th>{t("Date")}</th><th></th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><input type="checkbox" name="ids" value={o.id} style={{ width: "auto" }} /></td>
                <td><Link href={`/admin/orders/${o.id}`}><b>#{o.number}</b></Link></td>
                <td>
                  {o.name} {o.customer?.blacklisted && <span className="badge" style={{ background: "#000" }}>{t("blacklist")}</span>}
                  {dupPhones.has(o.phone) && <span className="badge" style={{ background: "#f59e0b" }}>{t("doublon?")}</span>}
                  {(() => { const k = risk(o.phone); return k && <span className="badge" style={{ background: "#dc2626" }} title={`${k.r} retour(s) / ${k.d} livrée(s)`}>{t("risque")} {k.r}↩</span>; })()}
                  <div className="muted" dir="ltr" style={{ fontSize: ".85rem" }}>{o.phone}{o.source !== "storefront" && <> · {o.source}</>}</div>
                </td>
                <td>{wilayaName(o.wilayaCode, lang)}<div className="muted" style={{ fontSize: ".8rem" }}>{o.deliveryType === "desk" ? t("Stop desk") : t("Domicile")}</div></td>
                <td style={{ fontSize: ".85rem" }}>{o.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ""} ×${i.qty}`).join(", ")}</td>
                <td><b>{dzd(o.total, lang)}</b></td>
                <td><StatusButtons compact orderId={o.id} current={o.status} statuses={statuses} /></td>
                <td className="muted" style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>{o.createdAt.toLocaleString("fr-DZ", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="row" style={{ gap: 6 }}>
                  <a className="btn sm ghost" href={`tel:${o.phone}`} title={t("Appeler")}></a>
                  <a className="btn sm ghost" href={`https://wa.me/213${o.phone.slice(1)}`} target="_blank" title={t("WhatsApp")}></a>
                </td>
              </tr>
            ))}
            {!orders.length && <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 32 }}>{t("Aucune commande")}</td></tr>}
          </tbody>
        </table>
      </div>
      </form>
      <div className="row" style={{ marginTop: 12 }}>
        {page > 1 && <Link className="btn ghost sm" href={qs({ page: String(page - 1) })}>{t("← Précédent")}</Link>}
        <span className="muted">{total} {t("commande(s)")} · {t("page")} {page}</span>
        {page * 50 < total && <Link className="btn ghost sm" href={qs({ page: String(page + 1) })}>{t("Suivant →")}</Link>}
      </div>
    </>
  );
}
