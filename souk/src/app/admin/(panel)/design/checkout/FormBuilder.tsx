"use client";
import { useAdminT } from "@/components/AdminLang";
import { useState, useTransition } from "react";
import { saveSettings } from "../../../actions";
import type { FieldDef } from "@/lib/forms";
import { FieldInput } from "@/components/FieldInput";

const BUILTIN = ["name", "phone", "wilaya", "commune", "address", "delivery_type"];
const TYPES: [FieldDef["type"], string][] = [["text", "Texte"], ["textarea", "Texte long"], ["number", "Nombre"], ["email", "Email"], ["phone", "Téléphone"], ["select", "Liste"], ["radio", "Choix unique"], ["checkbox", "Case à cocher"], ["date", "Date"]];

/** Generic schema editor: used for the checkout form and the product attributes. */
export function FormBuilder({ initial, target, extra }: { initial: FieldDef[]; target: "checkout" | "productAttributes"; extra?: { deskEnabled: boolean; freeShippingOver: number | null; blockAfterReturns: number } }) {
  const t = useAdminT();
  const [fields, setFields] = useState(initial);
  const [opts, setOpts] = useState(extra);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [lang, setLang] = useState<"ar" | "fr">("ar");
  const upd = (i: number, patch: Partial<FieldDef>) => { setFields(fields.map((f, j) => (j === i ? { ...f, ...patch } : f))); setSaved(false); };
  const move = (i: number, d: number) => { const a = [...fields]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setFields(a); setSaved(false); };

  function save() {
    start(async () => {
      if (target === "checkout") await saveSettings({ checkout: { fields, ...opts } });
      else await saveSettings({ productAttributes: fields });
      setSaved(true);
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(min(280px,100%),1fr)", gap: 16 }}>
      <div className="stack">
        {fields.map((f, i) => (
          <div key={f.key} className={`card stack ${f.enabled ? "" : "off"}`} style={{ opacity: f.enabled ? 1 : 0.6 }}>
            <div className="row wrap">
              <div className="row" style={{ gap: 2 }}>
                <button type="button" className="btn sm ghost" onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="btn sm ghost" onClick={() => move(i, 1)}>↓</button>
              </div>
              <code style={{ flex: 1 }}>{f.key}</code>
              <span className="muted" style={{ fontSize: ".8rem" }}>{t(TYPES.find(([ty]) => ty === f.type)?.[1] ?? f.type)}</span>
              <label className="row" style={{ fontWeight: 500, fontSize: ".85rem" }}><input type="checkbox" style={{ width: "auto" }} checked={f.enabled} disabled={target === "checkout" && ["phone", "wilaya"].includes(f.key)} onChange={(e) => upd(i, { enabled: e.target.checked })} /> {t("Actif")}</label>
              <label className="row" style={{ fontWeight: 500, fontSize: ".85rem" }}><input type="checkbox" style={{ width: "auto" }} checked={f.required} disabled={target === "checkout" && ["phone", "wilaya"].includes(f.key)} onChange={(e) => upd(i, { required: e.target.checked })} /> {t("Obligatoire")}</label>
              <select value={f.width} style={{ width: "auto" }} onChange={(e) => upd(i, { width: e.target.value as any })}><option value="full">{t("Pleine largeur")}</option><option value="half">{t("Demi-largeur")}</option></select>
              {!(target === "checkout" && BUILTIN.includes(f.key)) && <button type="button" className="btn sm ghost" onClick={() => setFields(fields.filter((_, j) => j !== i))}></button>}
            </div>
            <div className="form-grid">
              <div className="field half"><label>{t("Libellé FR")}</label><input value={f.label.fr} onChange={(e) => upd(i, { label: { ...f.label, fr: e.target.value } })} /></div>
              <div className="field half"><label>{t("التسمية AR")}</label><input dir="rtl" value={f.label.ar} onChange={(e) => upd(i, { label: { ...f.label, ar: e.target.value } })} /></div>
              {(f.type === "select" || f.type === "radio") && (
                <div className="field full"><label>{t("Options (une par ligne : valeur|libellé FR|libellé AR)")}</label>
                  <textarea rows={3} defaultValue={(f.options ?? []).map((o) => `${o.value}|${o.label.fr}|${o.label.ar}`).join("\n")}
                    onBlur={(e) => upd(i, { options: e.target.value.split("\n").filter(Boolean).map((l) => { const [value, fr, ar] = l.split("|"); return { value: value.trim(), label: { fr: (fr ?? value).trim(), ar: (ar ?? fr ?? value).trim() } }; }) })} />
                </div>
              )}
            </div>
          </div>
        ))}
        <form className="card row wrap" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const key = String(fd.get("key")).toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "");
          if (!key || fields.some((f) => f.key === key)) return;
          setFields([...fields, { key, type: fd.get("type") as any, label: { fr: String(fd.get("fr") || key), ar: String(fd.get("fr") || key) }, required: false, enabled: true, width: "full", options: [] }]);
          e.currentTarget.reset();
        }}>
          <input name="key" placeholder={t("clé (ex: taille_pied)")} required style={{ maxWidth: 180 }} />
          <input name="fr" placeholder={t("Libellé")} style={{ maxWidth: 180 }} />
          <select name="type" style={{ maxWidth: 160 }}>{TYPES.map(([ty, l]) => <option key={ty} value={ty}>{t(l)}</option>)}</select>
          <button className="btn sm">{t("+ Ajouter un champ")}</button>
        </form>
        {opts && (
          <div className="card stack">
            <label className="row" style={{ fontWeight: 500 }}><input type="checkbox" style={{ width: "auto" }} checked={opts.deskEnabled} onChange={(e) => setOpts({ ...opts, deskEnabled: e.target.checked })} /> {t("Proposer le Stop desk")}</label>
            <div className="field"><label>Livraison gratuite à partir de (DA, vide = jamais)</label>
              <input type="number" value={opts.freeShippingOver ?? ""} onChange={(e) => setOpts({ ...opts, freeShippingOver: e.target.value === "" ? null : Number(e.target.value) })} style={{ maxWidth: 200 }} /></div>
            <div className="field"><label>{t("Bloquer les numéros ayant au moins N retours (0 = désactivé)")}</label>
              <input type="number" min={0} max={20} value={opts.blockAfterReturns} onChange={(e) => setOpts({ ...opts, blockAfterReturns: Number(e.target.value) || 0 })} style={{ maxWidth: 120 }} /></div>
          </div>
        )}
        <button className="btn lg" onClick={save} disabled={pending}>{pending ? "..." : saved ? t("Enregistré ✓") : t("Enregistrer")}</button>
      </div>
      <div className="card stack" style={{ position: "sticky", top: 16, alignSelf: "start" }}>
        <div className="row between"><b>{t("Aperçu")}</b>
          <div className="tabs" style={{ margin: 0 }}>{(["ar", "fr"] as const).map((l) => <a key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)} style={{ cursor: "pointer" }}>{l.toUpperCase()}</a>)}</div>
        </div>
        <div className="form-grid" dir={lang === "ar" ? "rtl" : "ltr"}>
          {fields.filter((f) => f.enabled).map((f) => (
            f.type === "delivery_type"
              ? <div key={f.key} className="field full"><label>{f.label[lang]}</label><div className="seg"><label className="on"><input type="radio" readOnly checked /> </label><label><input type="radio" readOnly /> </label></div></div>
              : <FieldInput key={f.key} field={f} lang={lang} options={f.type === "wilaya" ? [{ value: "16", label: "16 - Alger" }] : f.type === "commune" ? [] : undefined} chooseLabel="..." />
          ))}
        </div>
      </div>
    </div>
  );
}
