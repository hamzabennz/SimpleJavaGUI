"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editOrder } from "../../../actions";
import { useAdminT } from "@/components/AdminLang";
import { dzd } from "@/lib/money";

type Item = { id?: string; productId?: string | null; variantId?: string | null; name: string; variant?: string | null; qty: number; unitPrice: number };
type Props = {
  order: { id: string; name: string; phone: string; commune: string; address: string; deliveryType: "home" | "desk"; deliveryFee: number; discount: number; items: Item[] };
  products: { id: string; name: string; price: number; variants: { id: string; label: string; price: number | null }[] }[];
};

export function EditOrder({ order, products }: Props) {
  const t = useAdminT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [o, setO] = useState(order);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const subtotal = o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const updItem = (idx: number, patch: Partial<Item>) => setO({ ...o, items: o.items.map((x, j) => (j === idx ? { ...x, ...patch } : x)) });
  if (!open) return <button type="button" className="btn sm ghost" onClick={() => setOpen(true)}>✎ {t("Modifier la commande")}</button>;
  return (
    <div className="card stack" style={{ borderColor: "var(--c-primary)" }}>
      <h3 style={{ margin: 0 }}>✎ {t("Modifier la commande")}</h3>
      <div className="form-grid">
        <div className="field half"><label>{t("Nom")}</label><input value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} /></div>
        <div className="field half"><label>{t("Téléphone")}</label><input dir="ltr" value={o.phone} onChange={(e) => setO({ ...o, phone: e.target.value })} /></div>
        <div className="field half"><label>Commune</label><input value={o.commune} onChange={(e) => setO({ ...o, commune: e.target.value })} /></div>
        <div className="field half"><label>{t("Adresse")}</label><input value={o.address} onChange={(e) => setO({ ...o, address: e.target.value })} /></div>
      </div>
      <table className="tbl">
        <thead><tr><th>{t("Produit")}</th><th>{t("Qté")}</th><th>{t("Prix")}</th><th></th></tr></thead>
        <tbody>{o.items.map((i, idx) => (
          <tr key={idx}>
            <td>{i.name}{i.variant ? ` (${i.variant})` : ""}</td>
            <td><input type="number" min={1} value={i.qty} style={{ width: 70 }} onChange={(e) => updItem(idx, { qty: Math.max(1, Number(e.target.value)) })} /></td>
            <td><input type="number" min={0} value={i.unitPrice} style={{ width: 110 }} onChange={(e) => updItem(idx, { unitPrice: Number(e.target.value) })} /></td>
            <td><button type="button" className="btn sm ghost" onClick={() => setO({ ...o, items: o.items.filter((_, j) => j !== idx) })}>✕</button></td>
          </tr>
        ))}</tbody>
      </table>
      <select value="" onChange={(e) => {
        const [pid, vid] = e.target.value.split(":"); const p = products.find((x) => x.id === pid); if (!p) return;
        const v = p.variants.find((x) => x.id === vid);
        setO({ ...o, items: [...o.items, { productId: p.id, variantId: v?.id ?? null, name: p.name, variant: v?.label, qty: 1, unitPrice: v?.price ?? p.price }] });
      }}>
        <option value="">{t("+ Ajouter un produit…")}</option>
        {products.flatMap((p) => p.variants.length ? p.variants.map((v) => <option key={v.id} value={`${p.id}:${v.id}`}>{p.name} ({v.label})</option>) : [<option key={p.id} value={p.id}>{p.name}</option>])}
      </select>
      <div className="form-grid">
        <div className="field half"><label>{t("Livraison")}</label>
          <select value={o.deliveryType} onChange={(e) => setO({ ...o, deliveryType: e.target.value as any })}><option value="home">{t("Domicile")}</option><option value="desk">{t("Stop desk")}</option></select></div>
        <div className="field half"><label>{t("Frais de livraison")}</label><input type="number" min={0} value={o.deliveryFee} onChange={(e) => setO({ ...o, deliveryFee: Number(e.target.value) })} /></div>
        <div className="field half"><label>{t("Remise")}</label><input type="number" min={0} value={o.discount} onChange={(e) => setO({ ...o, discount: Number(e.target.value) })} /></div>
      </div>
      <div className="summary"><div className="line total"><span>{t("Total")}</span><span>{dzd(Math.max(0, subtotal - o.discount + o.deliveryFee))}</span></div></div>
      {err && <div className="alert">{err}</div>}
      <div className="row">
        <button type="button" className="btn" disabled={pending} onClick={() => start(async () => {
          const r = await editOrder(o.id, { ...o, items: o.items.map(({ id, productId, variantId, qty, unitPrice }) => ({ id, productId, variantId, qty, unitPrice })) });
          if ("error" in r && r.error) return setErr(r.error);
          setOpen(false); router.refresh();
        })}>{pending ? "..." : t("Enregistrer")}</button>
        <button type="button" className="btn ghost" onClick={() => { setO(order); setOpen(false); }}>{t("Annuler")}</button>
      </div>
    </div>
  );
}
