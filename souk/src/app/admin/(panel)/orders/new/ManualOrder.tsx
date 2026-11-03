"use client";
import { useAdminT } from "@/components/AdminLang";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualOrder } from "../../../actions";
import { FieldInput } from "@/components/FieldInput";
import type { FieldDef } from "@/lib/forms";
import { dzd } from "@/lib/money";

type Product = { id: string; name: string; price: number; variants: { id: string; label: string; price: number | null }[] };
type Props = { products: Product[]; fields: FieldDef[]; wilayas: { code: number; fr: string }[]; rates: { w: number; home: number | null; desk: number | null }[] };

export function ManualOrder({ products, fields, wilayas, rates }: Props) {
  const t = useAdminT();
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>({ delivery_type: "home" });
  const [lines, setLines] = useState<{ productId: string; variantId: string | null; qty: number }[]>([]);
  const [communes, setCommunes] = useState<[string, string][]>([]);
  const [source, setSource] = useState("phone");
  const [fee, setFee] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const w = Number(vals.wilaya || 0);
  useEffect(() => { if (w) fetch(`/api/communes?w=${w}`).then((r) => r.json()).then(setCommunes); }, [w]);
  const rate = rates.find((r) => r.w === w);
  const autoFee = rate ? (vals.delivery_type === "desk" ? rate.desk : rate.home) : null;
  const priceOf = (l: (typeof lines)[number]) => { const p = products.find((x) => x.id === l.productId)!; return p.variants.find((v) => v.id === l.variantId)?.price ?? p.price; };
  const subtotal = useMemo(() => lines.reduce((s, l) => s + priceOf(l) * l.qty, 0), [lines]);
  const effFee = fee === "" ? autoFee ?? 0 : Number(fee);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(340px,100%),1fr))", gap: 16 }}>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t("Client")}</h3>
        <div className="field"><label>{t("Source")}</label>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="phone">{t("Téléphone")}</option><option value="whatsapp">{t("WhatsApp")}</option><option value="messenger">{t("Messenger")}</option><option value="instagram">{t("Instagram")}</option><option value="store">{t("Magasin")}</option>
          </select>
        </div>
        <div className="form-grid">
          {fields.filter((f) => f.enabled).map((f) => f.type === "delivery_type" ? (
            <div key={f.key} className="field full"><label>{t("Livraison")}</label>
              <select value={vals.delivery_type} onChange={(e) => setVals({ ...vals, delivery_type: e.target.value })}><option value="home">{t("Domicile")}</option><option value="desk">{t("Stop desk")}</option></select>
            </div>
          ) : (
            <FieldInput key={f.key} field={f} lang="fr" value={vals[f.key]} error={errors[f.key]} chooseLabel="—"
              onChange={(v) => setVals({ ...vals, [f.key]: v, ...(f.key === "wilaya" ? { commune: "" } : {}) })}
              options={f.type === "wilaya" ? wilayas.map((x) => ({ value: String(x.code), label: `${String(x.code).padStart(2, "0")} - ${x.fr}` })) : f.type === "commune" ? communes.map(([fr]) => ({ value: fr, label: fr })) : undefined} />
          ))}
        </div>
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t("Produits")}</h3>
        {lines.map((l, i) => {
          const p = products.find((x) => x.id === l.productId)!;
          return (
            <div key={i} className="row wrap">
              <b style={{ flex: 1 }}>{p.name}</b>
              {p.variants.length > 0 && (
                <select value={l.variantId ?? ""} style={{ width: "auto" }} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, variantId: e.target.value } : x)))}>
                  {p.variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              )}
              <input type="number" min={1} value={l.qty} style={{ width: 70 }} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)))} />
              <span>{dzd(priceOf(l) * l.qty)}</span>
              <button type="button" className="btn sm ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>
            </div>
          );
        })}
        <select value="" onChange={(e) => { const p = products.find((x) => x.id === e.target.value); if (p) setLines([...lines, { productId: p.id, variantId: p.variants[0]?.id ?? null, qty: 1 }]); }}>
          <option value="">{t("+ Ajouter un produit…")}</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {dzd(p.price)}</option>)}
        </select>
        <div className="field"><label>Frais de livraison (vide = tarif automatique{autoFee !== null ? ` : ${dzd(autoFee)}` : ""})</label>
          <input type="number" value={fee} onChange={(e) => setFee(e.target.value)} style={{ maxWidth: 180 }} /></div>
        <div className="summary">
          <div className="line"><span>{t("Sous-total")}</span><span>{dzd(subtotal)}</span></div>
          <div className="line"><span>{t("Livraison")}</span><span>{dzd(effFee)}</span></div>
          <div className="line total"><span>{t("Total")}</span><span>{dzd(subtotal + effFee)}</span></div>
        </div>
        {msg && <div className="alert">{msg}</div>}
        <button className="btn lg" disabled={pending || !lines.length} onClick={() => start(async () => {
          setErrors({}); setMsg("");
          const r = await createManualOrder({ form: vals, lines, source, deliveryFee: fee === "" ? null : Number(fee) });
          if ("error" in r && r.error) { setErrors((r.fieldErrors as Record<string, string>) ?? {}); setMsg(r.error === "validation" ? "Vérifiez les champs" : r.error); return; }
          if ("id" in r) router.push(`/admin/orders/${r.id}`);
        })}>{pending ? "..." : t("Créer la commande")}</button>
      </div>
    </div>
  );
}
