import { adminT } from "@/lib/admin-lang";
import { db } from "@/lib/db";
import { requireAdmin, PERMISSIONS } from "@/lib/auth";
import { removeStaff, toggleAutoAssign } from "../../actions";
import { StaffForm } from "./StaffForm";

export default async function Staff() {
  const { tenant } = await requireAdmin("*");
  const { t } = await adminT();
  const members = await db.membership.findMany({ where: { tenantId: tenant.id }, include: { user: true } });
  const done = await db.orderEvent.groupBy({ by: ["userId"], where: { order: { tenantId: tenant.id }, type: "status", toStatus: "confirmed" }, _count: true });
  return (
    <>
      <h1>{t("Équipe")}</h1>
      <div className="card table-wrap" style={{ padding: 0, marginBottom: 16 }}>
        <table className="tbl">
          <thead><tr><th>{t("Nom")}</th><th>{t("Email")}</th><th>{t("Rôle")}</th><th>{t("Accès")}</th><th>{t("Confirmations")}</th><th></th></tr></thead>
          <tbody>{members.map((m) => (
            <tr key={m.id}>
              <td>{m.user.name}</td><td dir="ltr">{m.user.email}</td><td><b>{m.role}</b></td>
              <td className="muted" style={{ fontSize: ".85rem" }}>{(m.permissions.length ? m.permissions : PERMISSIONS[m.role] ?? []).join(", ")}</td>
              <td>{done.find((d) => d.userId === m.userId)?._count ?? 0}</td>
              <td>{m.role !== "owner" && <form action={removeStaff.bind(null, m.id)}><button className="btn sm ghost">{t("Retirer")}</button></form>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <form action={toggleAutoAssign} className="card row between wrap" style={{ marginBottom: 16 }}>
        <span>{t("Répartition automatique des nouvelles commandes entre les confirmateurs")} : <b>{tenant.config.checkout.autoAssign ? t("Activée") : t("Désactivée")}</b></span>
        <button className="btn sm ghost">{tenant.config.checkout.autoAssign ? t("Désactiver") : t("Activer")}</button>
      </form>
      <StaffForm />
    </>
  );
}
