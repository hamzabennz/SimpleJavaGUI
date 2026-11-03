import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { wilayaName } from "@/lib/algeria";
import { StatusButtons } from "./StatusButtons";

export default async function Orders({ searchParams }: { searchParams: Promise<{ s?: string; q?: string; page?: string }> }) {
  const { tenant } = await requireAdmin("orders");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const where = {
    tenantId: tenant.id,
    ...(sp.s ? { status: sp.s } : {}),
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
  const statuses = tenant.config.orderStatuses.map((s) => ({ key: s.key, label: s.label.fr, color: s.color }));
  const qs = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ s: sp.s, q, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <div className="row between wrap">
        <h1>Commandes</h1>
        <div className="row">
          <a className="btn ghost sm" href={`/admin/orders/export${qs({})}`}>⬇ Export CSV</a>
        </div>
      </div>
      <div className="tabs">
        <Link href={qs({ s: undefined, page: undefined })} className={!sp.s ? "on" : ""}>Toutes</Link>
        {statuses.map((s) => (
          <Link key={s.key} href={qs({ s: s.key, page: undefined })} className={sp.s === s.key ? "on" : ""}>
            {s.label} <b>{counts.find((c) => c.status === s.key)?._count ?? 0}</b>
          </Link>
        ))}
      </div>
      <form className="row" style={{ marginBottom: 12 }}>
        {sp.s && <input type="hidden" name="s" value={sp.s} />}
        <input name="q" defaultValue={q} placeholder="N°, nom ou téléphone" style={{ maxWidth: 320 }} />
        <button className="btn sm">Rechercher</button>
      </form>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="tbl">
          <thead><tr><th>#</th><th>Client</th><th>Wilaya</th><th>Produits</th><th>Total</th><th>Statut</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/admin/orders/${o.id}`}><b>#{o.number}</b></Link></td>
                <td>
                  {o.name} {o.customer?.blacklisted && <span className="badge" style={{ background: "#000" }}>⛔ blacklist</span>}
                  {dupPhones.has(o.phone) && <span className="badge" style={{ background: "#f59e0b" }}>doublon?</span>}
                  <div className="muted" dir="ltr" style={{ fontSize: ".85rem" }}>{o.phone}</div>
                </td>
                <td>{wilayaName(o.wilayaCode)}<div className="muted" style={{ fontSize: ".8rem" }}>{o.deliveryType === "desk" ? "Stop desk" : "Domicile"}</div></td>
                <td style={{ fontSize: ".85rem" }}>{o.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ""} ×${i.qty}`).join(", ")}</td>
                <td><b>{dzd(o.total)}</b></td>
                <td><StatusButtons compact orderId={o.id} current={o.status} statuses={statuses} /></td>
                <td className="muted" style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>{o.createdAt.toLocaleString("fr-DZ", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="row" style={{ gap: 6 }}>
                  <a className="btn sm ghost" href={`tel:${o.phone}`} title="Appeler">📞</a>
                  <a className="btn sm ghost" href={`https://wa.me/213${o.phone.slice(1)}`} target="_blank" title="WhatsApp">💬</a>
                </td>
              </tr>
            ))}
            {!orders.length && <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 32 }}>Aucune commande</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {page > 1 && <Link className="btn ghost sm" href={qs({ page: String(page - 1) })}>← Précédent</Link>}
        <span className="muted">{total} commande(s) · page {page}</span>
        {page * 50 < total && <Link className="btn ghost sm" href={qs({ page: String(page + 1) })}>Suivant →</Link>}
      </div>
    </>
  );
}
