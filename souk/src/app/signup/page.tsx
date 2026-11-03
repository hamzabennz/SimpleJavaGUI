"use client";
import { useActionState, useState } from "react";
import { signup } from "../admin/actions";

const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

export default function Signup() {
  const [state, action, pending] = useActionState(signup, null);
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  if (state && "ok" in state && state.ok) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }} dir="ltr">
        <div className="card stack" style={{ maxWidth: 440, textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>🎉</div>
          <h1 style={{ margin: 0 }}>Votre boutique est prête</h1>
          <p className="muted">Ajoutez vos produits, réglez vos tarifs de livraison et commencez à vendre.</p>
          <a className="btn lg" href={state.adminUrl}>Ouvrir mon espace marchand</a>
          <a className="btn ghost" href={state.storeUrl} target="_blank">Voir ma boutique ↗</a>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }} dir="ltr">
      <div style={{ background: "var(--c-primary)", color: "var(--c-primary-text)", padding: "48px 32px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <h1 style={{ fontSize: "2.4rem", margin: "0 0 12px" }}>Lancez votre boutique en ligne en 2 minutes</h1>
        <p style={{ fontSize: "1.1rem", opacity: 0.9 }}>متجرك الإلكتروني جاهز في دقيقتين</p>
        <ul style={{ lineHeight: 2, paddingInlineStart: 20 }}>
          <li>Paiement à la livraison & 58 wilayas</li>
          <li>Formulaire de commande personnalisable</li>
          <li>Yalidine, ZR Express, Pixels Facebook & TikTok</li>
          <li>Boutique en arabe et en français</li>
        </ul>
      </div>
      <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <form action={action} className="card stack" style={{ width: "100%", maxWidth: 420 }}>
          <h2 style={{ margin: 0 }}>Créer ma boutique</h2>
          <div className="field"><label>Nom de la boutique</label>
            <input name="name" required onChange={(e) => { if (!touched) setSlug(slugify(e.target.value)); }} /></div>
          <div className="field"><label>Adresse de la boutique</label>
            <div className="row" style={{ gap: 6 }}><input name="slug" required value={slug} onChange={(e) => { setTouched(true); setSlug(slugify(e.target.value)); }} /><span className="muted" style={{ whiteSpace: "nowrap" }}>.souk.dz</span></div></div>
          <div className="field"><label>Email</label><input name="email" type="email" required /></div>
          <div className="field"><label>Mot de passe</label><input name="password" type="password" minLength={8} required /></div>
          <input name="website" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999 }} aria-hidden />
          {state && "error" in state && state.error && <div className="alert">{state.error}</div>}
          <button className="btn lg" disabled={pending}>{pending ? "Création..." : "Créer ma boutique gratuitement"}</button>
          <a href="/admin/login" className="muted" style={{ fontSize: ".85rem", textAlign: "center" }}>Déjà inscrit ? Se connecter</a>
        </form>
      </div>
    </div>
  );
}
