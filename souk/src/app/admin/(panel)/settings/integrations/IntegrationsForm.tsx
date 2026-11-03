"use client";
import { useState, useTransition } from "react";
import { saveIntegrations } from "../../../actions";

type Adapter = { id: string; name: string; credentials: { key: string; label: string; secret?: boolean }[] };
type Props = { adapters: Adapter[]; initial: { defaultCarrier: string; carriers: Record<string, Record<string, string>>; metaAccessToken?: string; tiktokAccessToken?: string } };

export function IntegrationsForm({ adapters, initial }: Props) {
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Transporteurs</h3>
        <div className="field"><label>Transporteur par défaut</label>
          <select value={s.defaultCarrier} onChange={(e) => { setS({ ...s, defaultCarrier: e.target.value }); setSaved(false); }} style={{ maxWidth: 260 }}>
            {adapters.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {adapters.filter((a) => a.credentials.length).map((a) => (
          <div key={a.id} className="stack" style={{ borderTop: "1px solid var(--c-border)", paddingTop: 12 }}>
            <b>{a.name}</b>
            <div className="form-grid">
              {a.credentials.map((c) => (
                <div key={c.key} className="field half"><label>{c.label}</label>
                  <input dir="ltr" type={c.secret ? "password" : "text"} value={s.carriers[a.id]?.[c.key] ?? ""}
                    onChange={(e) => { setS({ ...s, carriers: { ...s.carriers, [a.id]: { ...s.carriers[a.id], [c.key]: e.target.value } } }); setSaved(false); }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Événements serveur (Conversions API)</h3>
        <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>Optionnel. Améliore le suivi des achats quand les bloqueurs de pub empêchent le pixel du navigateur. Les pixel IDs se règlent dans Paramètres.</p>
        <div className="field"><label>Meta access token</label><input dir="ltr" type="password" value={s.metaAccessToken ?? ""} onChange={(e) => setS({ ...s, metaAccessToken: e.target.value })} /></div>
        <div className="field"><label>TikTok Events API access token</label><input dir="ltr" type="password" value={s.tiktokAccessToken ?? ""} onChange={(e) => setS({ ...s, tiktokAccessToken: e.target.value })} /></div>
      </div>
      <button className="btn lg" disabled={pending} onClick={() => start(async () => { await saveIntegrations(s); setSaved(true); })}>{pending ? "..." : saved ? "Enregistré ✓" : "Enregistrer"}</button>
    </div>
  );
}
