"use client";
import { useActionState } from "react";
import { createTenant } from "../admin/actions";

export function CreateTenant({ plans }: { plans: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createTenant, null);
  return (
    <form action={action} className="card stack">
      <h3 style={{ margin: 0 }}>Nouvelle boutique</h3>
      <div className="form-grid">
        <div className="field half"><label>Nom de la boutique</label><input name="name" required /></div>
        <div className="field half"><label>Slug (sous-domaine)</label><input name="slug" required dir="ltr" placeholder="ma-boutique" /></div>
        <div className="field half"><label>Email du propriétaire</label><input name="email" type="email" required dir="ltr" /></div>
        <div className="field half"><label>Mot de passe initial</label><input name="password" type="password" required dir="ltr" /></div>
        <div className="field half"><label>Plan</label><select name="planId"><option value="">—</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      </div>
      {state?.error && <div className="alert">{state.error}</div>}
      {state?.ok && <div className="alert ok">Boutique créée ✓</div>}
      <button className="btn" disabled={pending} style={{ alignSelf: "start" }}>Créer</button>
    </form>
  );
}
