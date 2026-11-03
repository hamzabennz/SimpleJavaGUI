"use client";
import { useAdminT } from "@/components/AdminLang";
import { useState, useTransition } from "react";
import { saveIntegrations } from "../../../actions";

type Adapter = { id: string; name: string; credentials: { key: string; label: string; secret?: boolean }[] };
type Props = { webhookBase: string; slug: string; adapters: Adapter[]; initial: { defaultCarrier: string; carriers: Record<string, Record<string, string>>; metaAccessToken?: string; tiktokAccessToken?: string; telegramBotToken?: string; telegramChatId?: string } };

export function IntegrationsForm({ webhookBase, slug, adapters, initial }: Props) {
  const t = useAdminT();
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t("Transporteurs")}</h3>
        <div className="field"><label>{t("Transporteur par défaut")}</label>
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
            <div className="field"><label>Webhook de statut (à coller chez {a.name})</label>
              {s.carriers[a.id]?.webhookKey
                ? <input readOnly dir="ltr" value={`${webhookBase}/${a.id}/${slug}?key=${s.carriers[a.id].webhookKey}`} onFocus={(e) => e.target.select()} />
                : <button type="button" className="btn sm ghost" style={{ alignSelf: "start" }} onClick={() => setS({ ...s, carriers: { ...s.carriers, [a.id]: { ...s.carriers[a.id], webhookKey: crypto.randomUUID().replace(/-/g, "") } } })}>{t("Générer une URL de webhook")}</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Telegram</h3>
        <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>{t("Recevez chaque nouvelle commande sur Telegram. Créez un bot avec @BotFather, puis envoyez-lui un message et récupérez votre chat ID.")}</p>
        <div className="form-grid">
          <div className="field half"><label>Bot token</label><input dir="ltr" type="password" value={s.telegramBotToken ?? ""} onChange={(e) => setS({ ...s, telegramBotToken: e.target.value })} /></div>
          <div className="field half"><label>Chat ID</label><input dir="ltr" value={s.telegramChatId ?? ""} onChange={(e) => setS({ ...s, telegramChatId: e.target.value })} /></div>
        </div>
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t("Événements serveur (Conversions API)")}</h3>
        <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>{t("Optionnel. Améliore le suivi des achats quand les bloqueurs de pub empêchent le pixel du navigateur. Les pixel IDs se règlent dans Paramètres.")}</p>
        <div className="field"><label>{t("Meta access token")}</label><input dir="ltr" type="password" value={s.metaAccessToken ?? ""} onChange={(e) => setS({ ...s, metaAccessToken: e.target.value })} /></div>
        <div className="field"><label>{t("TikTok Events API access token")}</label><input dir="ltr" type="password" value={s.tiktokAccessToken ?? ""} onChange={(e) => setS({ ...s, tiktokAccessToken: e.target.value })} /></div>
      </div>
      <button className="btn lg" disabled={pending} onClick={() => start(async () => { await saveIntegrations(s); setSaved(true); })}>{pending ? "..." : saved ? t("Enregistré ✓") : t("Enregistrer")}</button>
    </div>
  );
}
