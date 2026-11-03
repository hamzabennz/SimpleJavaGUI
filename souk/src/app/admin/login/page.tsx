"use client";
import { useActionState } from "react";
import { login } from "../actions";

export default function Login() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form action={action} className="card stack" style={{ width: "100%", maxWidth: 380 }}>
        <h1 style={{ margin: 0 }}>Espace marchand</h1>
        <div className="field"><label>Email</label><input name="email" type="email" required dir="ltr" /></div>
        <div className="field"><label>Mot de passe</label><input name="password" type="password" required dir="ltr" /></div>
        {state?.error && <div className="alert">{state.error}</div>}
        <button className="btn" disabled={pending}>{pending ? "..." : "Se connecter"}</button>
        <p className="muted" style={{ fontSize: ".8rem", margin: 0 }}>Démo : admin@demo.dz / admin123</p>
      </form>
    </div>
  );
}
