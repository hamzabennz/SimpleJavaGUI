import { adminT } from "@/lib/admin-lang";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { createCoupon, toggleCoupon } from "../../actions";

export default async function Coupons() {
  const { tenant } = await requireAdmin("orders");
  const { t } = await adminT();
  const coupons = await db.coupon.findMany({ where: { tenantId: tenant.id }, orderBy: { code: "asc" } });
  return (
    <>
      <h1>{t("Coupons")}</h1>
      <form action={createCoupon} className="card row wrap" style={{ marginBottom: 16, alignItems: "end" }}>
        <div className="field"><label>{t("Code")}</label><input name="code" required style={{ width: 160 }} /></div>
        <div className="field"><label>{t("Type")}</label><select name="type" style={{ width: 140 }}><option value="percent">%</option><option value="fixed">{t("Montant (DA)")}</option></select></div>
        <div className="field"><label>{t("Valeur")}</label><input name="value" type="number" required style={{ width: 110 }} /></div>
        <div className="field"><label>{t("Min. commande")}</label><input name="minTotal" type="number" style={{ width: 130 }} /></div>
        <div className="field"><label>{t("Utilisations max")}</label><input name="maxUses" type="number" style={{ width: 130 }} /></div>
        <div className="field"><label>{t("Expire le")}</label><input name="endsAt" type="date" style={{ width: 160 }} /></div>
        <button className="btn">{t("Créer")}</button>
      </form>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="tbl">
          <thead><tr><th>{t("Code")}</th><th>{t("Remise")}</th><th>{t("Min.")}</th><th>{t("Utilisé")}</th><th>{t("Expire")}</th><th></th></tr></thead>
          <tbody>{coupons.map((c) => (
            <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
              <td><b>{c.code}</b></td><td>{c.type === "percent" ? `${c.value}%` : dzd(c.value)}</td><td>{dzd(c.minTotal)}</td>
              <td>{c.used}{c.maxUses ? ` / ${c.maxUses}` : ""}</td><td>{c.endsAt?.toLocaleDateString("fr-DZ") ?? "—"}</td>
              <td><form action={toggleCoupon.bind(null, c.id)}><button className="btn sm ghost">{c.active ? t("Désactiver") : t("Activer")}</button></form></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
