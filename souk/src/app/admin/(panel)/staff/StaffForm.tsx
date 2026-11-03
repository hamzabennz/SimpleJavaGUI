"use client";
import { useAdminT } from "@/components/AdminLang";
import { useActionState } from "react";
import { addStaff } from "../../actions";

export function StaffForm() {
  const t = useAdminT();
  const [state, action, pending] = useActionState(addStaff, null);
  return (
    <form action={action} className="card row wrap" style={{ alignItems: "end" }}>
      <div className="field"><label>{t("Email")}</label><input name="email" type="email" required dir="ltr" /></div>
      <div className="field"><label>{t("Nom")}</label><input name="name" /></div>
      <div className="field"><label>{t("Mot de passe (nouveau compte)")}</label><input name="password" type="password" dir="ltr" /></div>
      <div className="field"><label>{t("Rôle")}</label>
        <select name="role"><option value="confirmer">{t("Confirmateur (commandes)")}</option><option value="stock">{t("Stock (produits)")}</option><option value="manager">{t("Manager")}</option></select>
      </div>
      <button className="btn" disabled={pending}>{t("Ajouter")}</button>
      {state?.error && <div className="alert">{state.error}</div>}
      {state?.ok && <div className="alert ok">{t("Ajouté ✓")}</div>}
    </form>
  );
}
