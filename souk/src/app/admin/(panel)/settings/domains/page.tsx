import { adminT } from "@/lib/admin-lang";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { verifyDomain, removeDomain } from "../../../actions";
import { AddDomain } from "./AddDomain";

export default async function Domains() {
  const { tenant } = await requireAdmin("*");
  const { t } = await adminT();
  const domains = await db.domain.findMany({ where: { tenantId: tenant.id } });
  const root = (process.env.ROOT_DOMAIN ?? "localhost:3000").split(":")[0];
  const target = process.env.CNAME_TARGET ?? `stores.${root}`;
  return (
    <>
      <h1>{t("Domaines")}</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        Adresse par défaut : <b dir="ltr">{tenant.slug}.{process.env.ROOT_DOMAIN ?? "localhost:3000"}</b>
      </div>
      <div className="card stack" style={{ marginBottom: 16 }}>
        <b>{t("Connecter votre propre domaine")}</b>
        <ol style={{ margin: 0 }}>
          <li>{t("Ajoutez le domaine ci-dessous.")}</li>
          <li>{t("Chez votre registrar, créez un enregistrement")} <b>{t("CNAME")}</b> {t("pointant vers")} <code dir="ltr">{target}</code>{process.env.SERVER_IP && <> {t("(ou un")} <b>A</b> {t("vers")} <code>{process.env.SERVER_IP}</code>)</>}.</li>
          <li>{t("Cliquez sur « Vérifier » (la propagation DNS peut prendre quelques heures).")}</li>
        </ol>
      </div>
      <div className="card table-wrap" style={{ padding: 0, marginBottom: 16 }}>
        <table className="tbl">
          <thead><tr><th>{t("Domaine")}</th><th>{t("Statut")}</th><th></th></tr></thead>
          <tbody>{domains.map((d) => (
            <tr key={d.id}>
              <td dir="ltr"><b>{d.host}</b></td>
              <td><span className="badge" style={{ background: d.verified ? "#16a34a" : "#f59e0b" }}>{d.verified ? "Vérifié" : "En attente DNS"}</span></td>
              <td className="row">
                <form action={verifyDomain.bind(null, d.id)}><button className="btn sm ghost">{t("Vérifier")}</button></form>
                <form action={removeDomain.bind(null, d.id)}><button className="btn sm ghost">{t("Supprimer")}</button></form>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <AddDomain />
    </>
  );
}
