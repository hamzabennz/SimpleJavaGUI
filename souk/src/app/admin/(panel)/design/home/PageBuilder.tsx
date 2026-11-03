"use client";
import { useState, useTransition } from "react";
import { saveHomeSections } from "../../../actions";
import { FieldInput } from "@/components/FieldInput";
import type { FieldDef } from "@/lib/forms";

type Section = { id: string; type: string; enabled: boolean; props: Record<string, any> };
type Registry = Record<string, { label: { ar: string; fr: string }; fields: FieldDef[]; defaults: Record<string, unknown> }>;

export function PageBuilder({ initial, registry }: { initial: Section[]; registry: Registry }) {
  const [sections, setSections] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const update = (next: Section[]) => { setSections(next); setSaved(false); };
  const move = (i: number, d: number) => { const a = [...sections]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; update(a); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,440px) 1fr", gap: 16 }}>
      <div className="stack">
        {sections.map((s, i) => {
          const def = registry[s.type];
          return (
            <div key={s.id} className="stack">
              <div className={`builder-item ${s.enabled ? "" : "off"}`}>
                <div className="row" style={{ gap: 2 }}>
                  <button type="button" className="btn sm ghost" onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="btn sm ghost" onClick={() => move(i, 1)}>↓</button>
                </div>
                <b className="grow" style={{ cursor: "pointer" }} onClick={() => setOpen(open === s.id ? null : s.id)}>{def?.label.fr ?? s.type}</b>
                <input type="checkbox" title="Visible" style={{ width: "auto" }} checked={s.enabled} onChange={(e) => update(sections.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x)))} />
                {def?.fields.length ? <button type="button" className="btn sm ghost" onClick={() => setOpen(open === s.id ? null : s.id)}>✎</button> : null}
                <button type="button" className="btn sm ghost" onClick={() => update(sections.filter((x) => x.id !== s.id))}>🗑</button>
              </div>
              {open === s.id && def && (
                <div className="card form-grid">
                  {def.fields.map((f) => (
                    <FieldInput key={f.key} field={{ ...f, width: "full" }} lang="fr" value={s.props[f.key] === undefined ? "" : String(s.props[f.key])} chooseLabel="—"
                      onChange={(v) => update(sections.map((x) => (x.id === s.id ? { ...x, props: { ...x.props, [f.key]: f.type === "number" ? Number(v) : v } } : x)))} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="card row wrap">
          <span className="muted">Ajouter :</span>
          {Object.entries(registry).map(([k, d]) => (
            <button key={k} type="button" className="btn sm ghost" onClick={() => { const id = Math.random().toString(36).slice(2, 8); update([...sections, { id, type: k, enabled: true, props: { ...d.defaults } }]); setOpen(id); }}>+ {d.label.fr}</button>
          ))}
        </div>
        <button className="btn lg" disabled={pending} onClick={() => start(async () => { await saveHomeSections(sections); setSaved(true); setPreviewKey((k) => k + 1); })}>
          {pending ? "..." : saved ? "Publié ✓" : "Enregistrer & publier"}
        </button>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden", position: "sticky", top: 16, height: "calc(100vh - 48px)" }}>
        <iframe key={previewKey} src="/" style={{ width: "100%", height: "100%", border: 0 }} />
      </div>
    </div>
  );
}
