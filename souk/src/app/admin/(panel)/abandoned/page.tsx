import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { wilayaName } from "@/lib/algeria";

export default async function Abandoned({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { tenant } = await requireAdmin("orders");
  const all = !!(await searchParams).all;
  const rows = await db.abandonedCheckout.findMany({ where: { tenantId: tenant.id, ...(all ? {} : { recovered: false }) }, orderBy: { updatedAt: "desc" }, take: 200 });
  return (
    <>
      <h1>Paniers abandonnés</h1>
      <p className="muted">Clients ayant saisi leur numéro sans valider la commande. Appelez-les pour récupérer la vente.</p>
      <div className="tabs"><a href="?" className={!all ? "on" : ""}>À relancer</a><a href="?all=1" className={all ? "on" : ""}>Tous</a></div>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="tbl">
          <thead><tr><th>Client</th><th>Wilaya</th><th>Produits</th><th>Montant</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const f = r.form as Record<string, string>;
              return (
                <tr key={r.id} style={{ opacity: r.recovered ? 0.5 : 1 }}>
                  <td>{r.name ?? "—"} {r.recovered && <span className="badge" style={{ background: "#16a34a" }}>récupéré</span>}<div className="muted" dir="ltr">{r.phone}</div></td>
                  <td>{f.wilaya ? wilayaName(Number(f.wilaya)) : "—"}</td>
                  <td style={{ fontSize: ".85rem" }}>{(r.lines as any[]).map((l) => `${l.name} ×${l.qty}`).join(", ")}</td>
                  <td>{dzd(r.total)}</td>
                  <td className="muted" style={{ fontSize: ".8rem" }}>{r.updatedAt.toLocaleString("fr-DZ", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="row" style={{ gap: 6 }}>
                    <a className="btn sm ghost" href={`tel:${r.phone}`}>📞</a>
                    <a className="btn sm ghost" target="_blank" href={`https://wa.me/213${r.phone.slice(1)}`}>💬</a>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 32 }}>Rien pour l'instant 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
