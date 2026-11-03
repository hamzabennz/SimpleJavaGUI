"use client";
import { useActionState, useEffect, useState } from "react";
import { login } from "../actions";

export default function Login() {
  const [state, action, pending] = useActionState(login, null);
  const [ar, setAr] = useState(false);
  useEffect(() => { setAr(document.cookie.includes("admin_lang=ar")); }, []);
  const L = ar
    ? { title: "فضاء التاجر", email: "البريد الإلكتروني", pw: "كلمة المرور", go: "تسجيل الدخول", other: "Français", demo: "تجريبي" }
    : { title: "Espace marchand", email: "Email", pw: "Mot de passe", go: "Se connecter", other: "العربية", demo: "Démo" };
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form action={action} className="card stack" style={{ width: "100%", maxWidth: 380 }} dir={ar ? "rtl" : "ltr"}>
        <div className="row between"><h1 style={{ margin: 0 }}>{L.title}</h1><a href={`?alang=${ar ? "fr" : "ar"}`} className="muted" style={{ fontSize: ".85rem" }}>{L.other}</a></div>
        <div className="field"><label>{L.email}</label><input name="email" type="email" required dir="ltr" /></div>
        <div className="field"><label>{L.pw}</label><input name="password" type="password" required dir="ltr" /></div>
        {state?.error && <div className="alert">{state.error}</div>}
        <button className="btn" disabled={pending}>{pending ? "..." : L.go}</button>
        <p className="muted" style={{ fontSize: ".8rem", margin: 0 }}>{L.demo} : admin@demo.dz / admin123</p>
      </form>
    </div>
  );
}
