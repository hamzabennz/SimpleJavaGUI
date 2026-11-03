import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container" style={{ minHeight: "60vh", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div className="stack" style={{ alignItems: "center" }}>
        <div style={{ fontSize: "4rem", fontWeight: 800, color: "var(--c-primary)", lineHeight: 1 }}>404</div>
        <h1 style={{ margin: 0, fontSize: "1.3rem" }}>الصفحة غير موجودة · Page introuvable</h1>
        <p className="muted" style={{ margin: 0 }}>قد يكون الرابط خاطئاً أو أن المنتج لم يعد متوفراً.<br />Le lien est peut-être erroné ou le produit n&apos;est plus disponible.</p>
        <Link href="/" className="btn">الرئيسية · Accueil</Link>
      </div>
    </div>
  );
}
