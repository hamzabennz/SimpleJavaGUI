"use client";
import { useActionState } from "react";
import { addStaff } from "../../actions";

export function StaffForm() {
  const [state, action, pending] = useActionState(addStaff, null);
  return (
    <form action={action} className="card row wrap" style={{ alignItems: "end" }}>
      <div className="field"><label>Email</label><input name="email" type="email" required dir="ltr" /></div>
      <div className="field"><label>Nom</label><input name="name" /></div>
      <div className="field"><label>Mot de passe (nouveau compte)</label><input name="password" type="password" dir="ltr" /></div>
      <div className="field"><label>Rôle</label>
        <select name="role"><option value="confirmer">Confirmateur (commandes)</option><option value="stock">Stock (produits)</option><option value="manager">Manager</option></select>
      </div>
      <button className="btn" disabled={pending}>Ajouter</button>
      {state?.error && <div className="alert">{state.error}</div>}
      {state?.ok && <div className="alert ok">Ajouté ✓</div>}
    </form>
  );
}
