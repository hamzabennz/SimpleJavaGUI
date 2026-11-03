import { adminT } from "@/lib/admin-lang";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { toggleBlacklist } from "../../actions";

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { tenant } = await requireAdmin("customers");
  const { t, lang } = await adminT();
  const q = (await searchParams).q?.trim();
  const customers = await db.customer.findMany({
    where: { tenantId: tenant.id, ...(q ? { OR: [{ phone: { contains: q } }, { name: { contains: q, mode: "insensitive" } }] } : {}) },
    include: { orders: { select: { status: true, total: true } } }, orderBy: { createdAt: "desc" }, take: 100,
  });
  return (
    <>
      <h1>{t("Clients")}</h1>
      <form className="row" style={{ marginBottom: 12 }}><input name="q" defaultValue={q} placeholder={t("Nom ou téléphone")} style={{ maxWidth: 300 }} /><button className="btn sm">{t("Rechercher")}</button></form>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="tbl">
          <thead><tr><th>{t("Nom")}</th><th>{t("Téléphone")}</th><th>{t("Commandes")}</th><th>{t("Livrées")}</th><th>{t("Retours")}</th><th>{t("Taux")}</th><th>{t("Dépensé")}</th><th></th></tr></thead>
          <tbody>
            {customers.map((c) => {
              const d = c.orders.filter((o) => o.status === "delivered");
              const r = c.orders.filter((o) => o.status === "returned").length;
              const rate = d.length + r ? Math.round((d.length / (d.length + r)) * 100) : null;
              return (
                <tr key={c.id}>
                  <td>{c.name} {c.blacklisted && <span className="badge" style={{ background: "#000" }}>⛔</span>}</td>
                  <td dir="ltr">{c.phone}</td>
                  <td>{c.orders.length}</td><td>{d.length}</td><td>{r}</td>
                  <td>{rate === null ? "—" : <b style={{ color: rate >= 70 ? "var(--c-success)" : "var(--c-danger)" }}>{rate}%</b>}</td>
                  <td>{dzd(d.reduce((s, o) => s + o.total, 0))}</td>
                  <td><form action={toggleBlacklist.bind(null, c.id)}><button className="btn sm ghost">{c.blacklisted ? t("Débloquer") : t("Blacklister")}</button></form></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
