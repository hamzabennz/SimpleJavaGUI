import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { adminT } from "@/lib/admin-lang";
import { dzd } from "@/lib/money";
import { wilayaName } from "@/lib/algeria";

type Tab = "contact" | "cart" | "recovered";

export default async function Abandoned({ searchParams }: { searchParams: Promise<{ tab?: Tab }> }) {
  const { tenant } = await requireAdmin("orders");
  const { t, lang } = await adminT();
  const tab: Tab = (await searchParams).tab ?? "contact";
  const where = { tenantId: tenant.id, ...(tab === "recovered" ? { recovered: true } : tab === "cart" ? { recovered: false, phone: null } : { recovered: false, NOT: { phone: null } }) };
  const base = { tenantId: tenant.id };
  const [rows, nContact, nCart, nRecovered] = await Promise.all([
    db.abandonedCheckout.findMany({ where, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.abandonedCheckout.count({ where: { ...base, recovered: false, NOT: { phone: null } } }),
    db.abandonedCheckout.count({ where: { ...base, recovered: false, phone: null } }),
    db.abandonedCheckout.count({ where: { ...base, recovered: true } }),
  ]);
  const value = rows.reduce((s, r) => s + r.total, 0);
  const tabs: [Tab, string, number][] = [["contact", t("À relancer"), nContact], ["cart", t("Paniers sans contact"), nCart], ["recovered", t("Récupérés"), nRecovered]];
  return (
    <>
      <h1>{t("Paniers abandonnés")}</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        {tab === "cart" ? t("Visiteurs qui ont ajouté des produits au panier sans commander ni laisser de numéro. Utile pour voir les produits qui intéressent mais ne convertissent pas.")
          : t("Clients ayant saisi leur numéro sans valider la commande. Appelez-les pour récupérer la vente.")}
      </p>
      <div className="tabs">
        {tabs.map(([k, l, n]) => <Link key={k} href={`?tab=${k}`} className={tab === k ? "on" : ""}>{l} <b>{n}</b></Link>)}
      </div>
      {rows.length > 0 && <div className="muted" style={{ fontSize: ".85rem", marginBottom: 8 }}>{t("Valeur totale")} : <b>{dzd(value, lang)}</b></div>}
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="tbl">
          <thead><tr><th>{t("Client")}</th><th>{t("Wilaya")}</th><th>{t("Produits")}</th><th>{t("Montant")}</th><th>{t("Dernière activité")}</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const f = (r.form ?? {}) as Record<string, string>;
              return (
                <tr key={r.id}>
                  <td>
                    {r.phone ? <>{r.name ?? "—"}<div className="muted" dir="ltr">{r.phone}</div></> : <span className="muted">{t("Visiteur anonyme")}</span>}
                  </td>
                  <td>{f.wilaya ? wilayaName(Number(f.wilaya), lang) : "—"}</td>
                  <td style={{ fontSize: ".85rem" }}>{(r.lines as any[]).map((l) => `${l.name}${l.variant ? ` (${l.variant})` : ""} ×${l.qty}`).join(", ")}</td>
                  <td>{dzd(r.total, lang)}</td>
                  <td className="muted" style={{ fontSize: ".8rem", whiteSpace: "nowrap" }}>{r.updatedAt.toLocaleString("fr-DZ", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="row" style={{ gap: 6 }}>
                    {r.phone && <>
                      <a className="btn sm ghost" href={`tel:${r.phone}`}>{t("Appeler")}</a>
                      <a className="btn sm ghost" target="_blank" href={`https://wa.me/213${r.phone.slice(1)}`}>WhatsApp</a>
                    </>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 32 }}>{t("Aucun panier pour l'instant")}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
