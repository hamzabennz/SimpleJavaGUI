import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { createCoupon, toggleCoupon } from "../../actions";

export default async function Coupons() {
  const { tenant } = await requireAdmin("orders");
  const coupons = await db.coupon.findMany({ where: { tenantId: tenant.id }, orderBy: { code: "asc" } });
  return (
    <>
      <h1>Coupons</h1>
      <form action={createCoupon} className="card row wrap" style={{ marginBottom: 16, alignItems: "end" }}>
        <div className="field"><label>Code</label><input name="code" required style={{ width: 160 }} /></div>
        <div className="field"><label>Type</label><select name="type" style={{ width: 140 }}><option value="percent">%</option><option value="fixed">Montant (DA)</option></select></div>
        <div className="field"><label>Valeur</label><input name="value" type="number" required style={{ width: 110 }} /></div>
        <div className="field"><label>Min. commande</label><input name="minTotal" type="number" style={{ width: 130 }} /></div>
        <div className="field"><label>Utilisations max</label><input name="maxUses" type="number" style={{ width: 130 }} /></div>
        <div className="field"><label>Expire le</label><input name="endsAt" type="date" style={{ width: 160 }} /></div>
        <button className="btn">Créer</button>
      </form>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="tbl">
          <thead><tr><th>Code</th><th>Remise</th><th>Min.</th><th>Utilisé</th><th>Expire</th><th></th></tr></thead>
          <tbody>{coupons.map((c) => (
            <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
              <td><b>{c.code}</b></td><td>{c.type === "percent" ? `${c.value}%` : dzd(c.value)}</td><td>{dzd(c.minTotal)}</td>
              <td>{c.used}{c.maxUses ? ` / ${c.maxUses}` : ""}</td><td>{c.endsAt?.toLocaleDateString("fr-DZ") ?? "—"}</td>
              <td><form action={toggleCoupon.bind(null, c.id)}><button className="btn sm ghost">{c.active ? "Désactiver" : "Activer"}</button></form></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
