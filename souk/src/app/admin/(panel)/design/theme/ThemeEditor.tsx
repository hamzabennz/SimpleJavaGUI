"use client";
import { useAdminT } from "@/components/AdminLang";
import { useState, useTransition } from "react";
import { saveSettings } from "../../../actions";
import type { Settings } from "@/lib/settings";
import { themePresets } from "@/lib/theme";

const COLOR_LABELS: Record<string, string> = {
  primary: "Principale", primaryText: "Texte sur principale", accent: "Accent", background: "Fond", surface: "Cartes",
  text: "Texte", muted: "Texte secondaire", border: "Bordures", danger: "Erreur", success: "Succès",
};
const FONTS_AR = ["Cairo", "Tajawal", "Almarai", "Noto Kufi Arabic", "IBM Plex Sans Arabic", "Changa"];
const FONTS_LATIN = ["Inter", "Poppins", "Montserrat", "Roboto", "Nunito", "Playfair Display"];

export function ThemeEditor({ initial, orderFlow }: { initial: Settings["theme"]; orderFlow: Settings["orderFlow"] }) {
  const T = useAdminT();
  const [t, setT] = useState(initial);
  const [flow, setFlow] = useState(orderFlow);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const upd = (patch: Partial<Settings["theme"]>) => { setT((s) => ({ ...s, ...patch })); setSaved(false); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,380px) 1fr", gap: 16 }}>
      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0 }}>{T("Préréglages")}</h3>
          <div className="row wrap">
            {Object.entries(themePresets).map(([k, c]) => (
              <button key={k} type="button" className={`btn sm ${t.preset === k ? "" : "ghost"}`} onClick={() => upd({ preset: k, colors: { ...initial.colors, ...c } as any })}>
                <span style={{ width: 14, height: 14, borderRadius: 99, background: c.primary, display: "inline-block" }} /> {k}
              </button>
            ))}
          </div>
        </div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>{T("Couleurs")}</h3>
          {Object.entries(t.colors).map(([k, v]) => (
            <div key={k} className="swatch">
              <input type="color" value={v} onChange={(e) => upd({ colors: { ...t.colors, [k]: e.target.value } })} />
              <span style={{ flex: 1 }}>{COLOR_LABELS[k] ?? k}</span>
              <code className="muted">{v}</code>
            </div>
          ))}
        </div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>{T("Style")}</h3>
          <div className="field"><label>Arrondi : {t.radius}px</label><input type="range" min={0} max={24} value={t.radius} onChange={(e) => upd({ radius: Number(e.target.value) })} /></div>
          <div className="field"><label>{T("Police arabe")}</label><select value={t.fontAr} onChange={(e) => upd({ fontAr: e.target.value })}>{FONTS_AR.map((f) => <option key={f}>{f}</option>)}</select></div>
          <div className="field"><label>{T("Police latine")}</label><select value={t.fontLatin} onChange={(e) => upd({ fontLatin: e.target.value })}>{FONTS_LATIN.map((f) => <option key={f}>{f}</option>)}</select></div>
          <div className="field"><label>{T("Boutons")}</label><select value={t.buttonStyle} onChange={(e) => upd({ buttonStyle: e.target.value as any })}><option value="solid">{T("Pleins")}</option><option value="outline">{T("Contour")}</option><option value="pill">{T("Pilule")}</option></select></div>
          <div className="field"><label>{T("Carte produit")}</label><select value={t.productCard} onChange={(e) => upd({ productCard: e.target.value as any })}><option value="simple">{T("Simple")}</option><option value="bordered">{T("Avec bordure")}</option><option value="overlay">{T("Texte sur image")}</option></select></div>
          <div className="field"><label>{T("Colonnes de la grille (desktop)")}</label><input type="number" min={2} max={5} value={t.gridColumns} onChange={(e) => upd({ gridColumns: Number(e.target.value) })} /></div>
        </div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>{T("Parcours de commande")}</h3>
          {([["landing", "Formulaire sur la page produit (sans panier)"], ["cart", "Panier classique"], ["both", "Les deux"]] as const).map(([k, l]) => (
            <label key={k} className="row" style={{ fontWeight: 500 }}><input type="radio" style={{ width: "auto" }} checked={flow === k} onChange={() => { setFlow(k); setSaved(false); }} /> {l}</label>
          ))}
        </div>
        <button className="btn lg" disabled={pending} onClick={() => start(async () => { await saveSettings({ theme: t, orderFlow: flow }); setSaved(true); setPreviewKey((k) => k + 1); })}>
          {pending ? "..." : saved ? T("Enregistré ✓") : T("Enregistrer & publier")}
        </button>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden", position: "sticky", top: 16, height: "calc(100vh - 48px)" }}>
        <div className="muted" style={{ padding: "6px 12px", fontSize: ".8rem", borderBottom: "1px solid var(--c-border)" }}>{T("Aperçu (mis à jour après enregistrement)")}</div>
        <iframe key={previewKey} src="/" style={{ width: "100%", height: "100%", border: 0 }} />
      </div>
    </div>
  );
}
