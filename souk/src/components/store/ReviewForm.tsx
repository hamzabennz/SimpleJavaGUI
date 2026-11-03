"use client";
import { useState } from "react";

export function ReviewForm({ productId, lang }: { productId: string; lang: "ar" | "fr" }) {
  const T = lang === "ar"
    ? { title: "اكتب رأيك", name: "الاسم", phone: "الهاتف (اختياري، لتأكيد الشراء)", body: "رأيك", send: "إرسال", thanks: "شكراً! سيظهر رأيك بعد المراجعة." }
    : { title: "Donner votre avis", name: "Nom", phone: "Téléphone (optionnel, pour « achat vérifié »)", body: "Votre avis", send: "Envoyer", thanks: "Merci ! Votre avis sera publié après validation." };
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [done, setDone] = useState(false);
  if (done) return <div className="alert ok">{T.thanks}</div>;
  if (!open) return <button className="btn ghost" onClick={() => setOpen(true)}>{T.title}</button>;
  return (
    <form className="card stack" onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const r = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId, rating, name: fd.get("rv_name"), phone: fd.get("rv_phone") || undefined, body: fd.get("rv_body"), website: fd.get("website") || undefined }) });
      if (r.ok) setDone(true);
    }}>
      <div className="row" style={{ fontSize: "1.6rem", cursor: "pointer" }} dir="ltr">
        {[1, 2, 3, 4, 5].map((n) => <span key={n} onClick={() => setRating(n)} style={{ color: n <= rating ? "var(--c-accent)" : "var(--c-border)" }}>★</span>)}
      </div>
      <div className="form-grid">
        <div className="field half"><label>{T.name}</label><input name="rv_name" required minLength={2} /></div>
        <div className="field half"><label>{T.phone}</label><input name="rv_phone" inputMode="tel" dir="ltr" /></div>
        <div className="field full"><label>{T.body}</label><textarea name="rv_body" rows={3} required minLength={3} /></div>
      </div>
      <input name="website" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999 }} aria-hidden />
      <button className="btn" style={{ alignSelf: "start" }}>{T.send}</button>
    </form>
  );
}
