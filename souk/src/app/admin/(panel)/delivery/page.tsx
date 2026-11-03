import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { wilayas } from "@/lib/algeria";
import { saveDeliveryRates } from "../../actions";

export default async function Delivery() {
  const { tenant } = await requireAdmin("delivery");
  const rates = await db.deliveryRate.findMany({ where: { tenantId: tenant.id } });
  return (
    <form action={saveDeliveryRates}>
      <div className="row between wrap">
        <h1>Tarifs de livraison</h1>
        <button className="btn">Enregistrer</button>
      </div>
      <p className="muted">Laissez un prix vide pour désactiver ce mode de livraison dans la wilaya. Mettez 0 pour la livraison gratuite.</p>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="tbl">
          <thead><tr><th>Active</th><th>Wilaya</th><th>Domicile (DA)</th><th>Stop desk (DA)</th></tr></thead>
          <tbody>
            {wilayas.map((w) => {
              const r = rates.find((x) => x.wilayaCode === w.code);
              return (
                <tr key={w.code}>
                  <td><input type="checkbox" name={`e${w.code}`} defaultChecked={r?.enabled ?? false} style={{ width: "auto" }} /></td>
                  <td>{String(w.code).padStart(2, "0")} - {w.fr} <span className="muted">{w.ar}</span></td>
                  <td><input name={`h${w.code}`} type="number" min={0} defaultValue={r?.homePrice ?? ""} style={{ maxWidth: 120 }} /></td>
                  <td><input name={`d${w.code}`} type="number" min={0} defaultValue={r?.deskPrice ?? ""} style={{ maxWidth: 120 }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
