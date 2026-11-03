"use client";
import { useAdminT } from "@/components/AdminLang";
import { useState, useTransition } from "react";
import { saveSettings } from "../../actions";
import type { Settings } from "@/lib/settings";
import { FieldInput } from "@/components/FieldInput";

export function SettingsForm({ initial }: { initial: Settings }) {
  const t = useAdminT();
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const store = (k: keyof Settings["store"], v: any) => { setS({ ...s, store: { ...s.store, [k]: v } }); setSaved(false); };
  const text = (k: keyof Settings["store"], label: string, dir?: "ltr") => (
    <div className="field half"><label>{label}</label><input dir={dir} value={(s.store[k] as string) ?? ""} onChange={(e) => store(k, e.target.value || undefined)} /></div>
  );
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t("Boutique")}</h3>
        <div className="form-grid">
          <div className="field half"><label>{t("Slogan FR")}</label><input value={s.store.tagline.fr} onChange={(e) => store("tagline", { ...s.store.tagline, fr: e.target.value })} /></div>
          <div className="field half"><label>{t("الشعار AR")}</label><input dir="rtl" value={s.store.tagline.ar} onChange={(e) => store("tagline", { ...s.store.tagline, ar: e.target.value })} /></div>
          <div className="field half"><label>{t("Bandeau d'annonce FR")}</label><input value={s.store.announcement?.fr ?? ""} onChange={(e) => store("announcement", { ar: s.store.announcement?.ar ?? "", fr: e.target.value })} /></div>
          <div className="field half"><label>{t("شريط الإعلان AR")}</label><input dir="rtl" value={s.store.announcement?.ar ?? ""} onChange={(e) => store("announcement", { fr: s.store.announcement?.fr ?? "", ar: e.target.value })} /></div>
          <FieldInput field={{ key: "logo", type: "image", label: { fr: "Logo", ar: "الشعار" }, required: false, enabled: true, width: "half" }} lang="fr" value={s.store.logo ?? ""} onChange={(v) => store("logo", v || undefined)} />{text("phone", "Téléphone", "ltr")}{text("whatsapp", "WhatsApp", "ltr")}{text("email", "Email", "ltr")}
          {text("facebook", "Facebook", "ltr")}{text("instagram", "Instagram", "ltr")}{text("tiktok", "TikTok", "ltr")}
        </div>
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t("Langues")}</h3>
        <div className="row wrap">
          <label>{t("Langue par défaut")}</label>
          <select value={s.locale.default} style={{ width: "auto" }} onChange={(e) => setS({ ...s, locale: { ...s.locale, default: e.target.value as any } })}><option value="ar">العربية</option><option value="fr">{t("Français")}</option></select>
          {(["ar", "fr"] as const).map((l) => (
            <label key={l} className="row" style={{ fontWeight: 500 }}><input type="checkbox" style={{ width: "auto" }} checked={s.locale.enabled.includes(l)} disabled={l === s.locale.default}
              onChange={(e) => setS({ ...s, locale: { ...s.locale, enabled: e.target.checked ? [...s.locale.enabled, l] : s.locale.enabled.filter((x) => x !== l) } })} /> {l.toUpperCase()}</label>
          ))}
        </div>
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t("Suivi publicitaire")}</h3>
        <div className="form-grid">
          <div className="field half"><label>{t("Meta (Facebook) Pixel ID")}</label><input dir="ltr" value={s.tracking.metaPixelId ?? ""} onChange={(e) => setS({ ...s, tracking: { ...s.tracking, metaPixelId: e.target.value || undefined } })} /></div>
          <div className="field half"><label>{t("TikTok Pixel ID")}</label><input dir="ltr" value={s.tracking.tiktokPixelId ?? ""} onChange={(e) => setS({ ...s, tracking: { ...s.tracking, tiktokPixelId: e.target.value || undefined } })} /></div>
        </div>
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t("Statuts de commande")}</h3>
        <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>{t("Renommez les statuts et changez leurs couleurs.")}</p>
        {s.orderStatuses.map((st, i) => (
          <div key={st.key} className="row wrap">
            <input type="color" value={st.color} style={{ width: 44, padding: 2 }} onChange={(e) => setS({ ...s, orderStatuses: s.orderStatuses.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })} />
            <code style={{ width: 90 }}>{st.key}</code>
            <input value={st.label.fr} style={{ maxWidth: 180 }} onChange={(e) => setS({ ...s, orderStatuses: s.orderStatuses.map((x, j) => (j === i ? { ...x, label: { ...x.label, fr: e.target.value } } : x)) })} />
            <input dir="rtl" value={st.label.ar} style={{ maxWidth: 180 }} onChange={(e) => setS({ ...s, orderStatuses: s.orderStatuses.map((x, j) => (j === i ? { ...x, label: { ...x.label, ar: e.target.value } } : x)) })} />
          </div>
        ))}
      </div>
      <button className="btn lg" disabled={pending} onClick={() => start(async () => { await saveSettings({ store: s.store, locale: s.locale, tracking: s.tracking, orderStatuses: s.orderStatuses }); setSaved(true); })}>
        {pending ? "..." : saved ? t("Enregistré ✓") : t("Enregistrer")}
      </button>
    </div>
  );
}
