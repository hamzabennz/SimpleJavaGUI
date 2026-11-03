"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FieldDef } from "@/lib/forms";
import { FieldInput } from "../FieldInput";
import { dzd } from "@/lib/money";
import { track } from "./Pixels";

export type Rate = { w: number; home: number | null; desk: number | null };
export type Line = { productId: string; variantId?: string | null; qty: number; name: string; variant?: string | null; price: number };

type Props = {
  fields: FieldDef[];
  lang: "ar" | "fr";
  t: Record<string, string>;
  wilayas: { code: number; ar: string; fr: string }[];
  rates: Rate[];
  deskEnabled: boolean;
  freeShippingOver: number | null;
  allFreeShipping?: boolean;
  lines: Line[];
  onDone?: () => void;
  submitLabel?: string;
};

export function OrderForm(p: Props) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>({ delivery_type: "home" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [communes, setCommunes] = useState<[string, string][]>([]);
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v, ...(k === "wilaya" ? { commune: "" } : {}) }));

  const wilaya = Number(vals.wilaya || 0);
  useEffect(() => {
    if (!wilaya) return setCommunes([]);
    fetch(`/api/communes?w=${wilaya}`).then((r) => r.json()).then(setCommunes).catch(() => setCommunes([]));
  }, [wilaya]);

  const servedWilayas = useMemo(() => p.wilayas.filter((w) => p.rates.some((r) => r.w === w.code && (r.home !== null || r.desk !== null))), [p.wilayas, p.rates]);
  const rate = p.rates.find((r) => r.w === wilaya);
  const type = vals.delivery_type === "desk" ? "desk" : "home";
  const subtotal = p.lines.reduce((s, l) => s + l.price * l.qty, 0);
  let fee: number | null = rate ? (type === "desk" ? rate.desk : rate.home) : null;
  if (fee !== null && ((p.freeShippingOver && subtotal >= p.freeShippingOver) || p.allFreeShipping)) fee = 0;
  const total = subtotal + (fee ?? 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMsg("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ form: vals, lines: p.lines.map(({ productId, variantId, qty }) => ({ productId, variantId, qty })), coupon }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.fieldErrors) setErrors(Object.fromEntries(Object.entries(j.fieldErrors).map(([k, v]) => [k, p.t[v as string] ?? String(v)])));
        setMsg(p.t[j.error] ?? j.error ?? "Error");
        return;
      }
      track("Purchase", { value: j.total, currency: "DZD" }, j.id);
      p.onDone?.();
      router.push(`/thank-you/${j.number}?p=${encodeURIComponent(j.phone)}`);
    } finally {
      setBusy(false);
    }
  }

  const fields = p.fields.filter((f) => f.enabled && !(f.type === "delivery_type" && !p.deskEnabled));
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <div className="form-grid">
        {fields.map((f) => {
          if (f.type === "delivery_type") {
            return (
              <div key={f.key} className="field full">
                <label>{f.label[p.lang] || f.label.fr}</label>
                <div className="seg">
                  {(["home", "desk"] as const).map((k) => {
                    const price = rate ? (k === "desk" ? rate.desk : rate.home) : null;
                    const disabled = !!rate && price === null;
                    return (
                      <label key={k} className={type === k ? "on" : ""} style={disabled ? { opacity: 0.5 } : undefined}>
                        <input type="radio" name="delivery_type" checked={type === k} disabled={disabled} onChange={() => set("delivery_type", k)} />
                        <span>{k === "home" ? p.t.home_delivery : p.t.desk_delivery}{price !== null && price !== undefined && <b className="muted"> · {price === 0 ? p.t.free : dzd(price, p.lang)}</b>}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          }
          const options =
            f.type === "wilaya" ? servedWilayas.map((w) => ({ value: String(w.code), label: `${String(w.code).padStart(2, "0")} - ${w[p.lang]}` }))
            : f.type === "commune" ? communes.map(([fr, ar]) => ({ value: fr, label: p.lang === "ar" ? ar : fr }))
            : undefined;
          return <FieldInput key={f.key} field={f} lang={p.lang} value={vals[f.key]} error={errors[f.key]} onChange={(v) => set(f.key, v)} options={options} chooseLabel={p.t.choose} />;
        })}
      </div>
      <div className="row">
        <input placeholder={p.t.coupon} value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} style={{ maxWidth: 220 }} />
      </div>
      <div className="summary">
        {p.lines.map((l, i) => (
          <div key={i} className="line"><span>{l.name}{l.variant ? ` (${l.variant})` : ""} × {l.qty}</span><span>{dzd(l.price * l.qty, p.lang)}</span></div>
        ))}
        <div className="line"><span>{p.t.delivery}</span><span>{fee === null ? "—" : fee === 0 ? p.t.free : dzd(fee, p.lang)}</span></div>
        <div className="line total"><span>{p.t.total}</span><span>{dzd(total, p.lang)}</span></div>
        <div className="muted" style={{ fontSize: ".85rem" }}>💵 {p.t.cod}</div>
      </div>
      {msg && <div className="alert">{msg}</div>}
      <button className="btn lg block" disabled={busy || !p.lines.length}>{busy ? p.t.sending : p.submitLabel ?? p.t.order_now}</button>
    </form>
  );
}
