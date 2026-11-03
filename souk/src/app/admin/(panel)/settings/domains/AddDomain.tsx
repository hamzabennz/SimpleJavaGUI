"use client";
import { useActionState } from "react";
import { addDomain } from "../../../actions";

export function AddDomain() {
  const [state, action, pending] = useActionState(addDomain, null);
  return (
    <form action={action} className="card row wrap">
      <input name="host" placeholder="www.maboutique.dz" dir="ltr" style={{ maxWidth: 300 }} required />
      <button className="btn sm" disabled={pending}>Ajouter</button>
      {state?.error && <div className="alert">{state.error}</div>}
    </form>
  );
}
