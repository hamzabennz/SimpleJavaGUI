"use client";

/** Never show a raw stack trace to customers. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container" style={{ minHeight: "60vh", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div className="stack" style={{ alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: "1.3rem" }}>حدث خطأ مؤقت · Une erreur est survenue</h1>
        <p className="muted" style={{ margin: 0 }}>يرجى إعادة المحاولة بعد لحظات. · Merci de réessayer dans un instant.</p>
        <div className="row">
          <button className="btn" onClick={() => reset()}>إعادة المحاولة · Réessayer</button>
          <a className="btn ghost" href="/">الرئيسية · Accueil</a>
        </div>
      </div>
    </div>
  );
}
