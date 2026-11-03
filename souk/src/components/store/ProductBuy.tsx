"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "./CartProvider";
import { OrderForm, type Rate } from "./OrderForm";
import type { FieldDef } from "@/lib/forms";
import { dzd } from "@/lib/money";
import { track } from "./Pixels";

type Variant = { id: string; optionValues: Record<string, string>; price: number | null; stock: number; image: string | null };
type Props = {
  product: { id: string; slug: string; name: string; price: number; compareAt: number | null; images: string[]; trackStock: boolean; stock: number; freeShipping: boolean };
  options: { name: string; values: string[] }[];
  variants: Variant[];
  offers?: { qty: number; price: number; label?: string }[];
  flow: "landing" | "cart" | "both";
  lang: "ar" | "fr";
  t: Record<string, string>;
  checkout: { fields: FieldDef[]; wilayas: { code: number; ar: string; fr: string }[]; rates: Rate[]; deskEnabled: boolean; freeShippingOver: number | null };
};

export function ProductBuy({ product, options, variants, offers = [], flow, lang, t, checkout }: Props) {
  const router = useRouter();
  const cart = useCart();
  const [sel, setSel] = useState<Record<string, string>>(() => Object.fromEntries(options.map((o) => [o.name, o.values[0]])));
  const [qty, setQty] = useState(1);
  const variant = useMemo(() => variants.find((v) => options.every((o) => v.optionValues[o.name] === sel[o.name])) ?? null, [sel, variants, options]);
  const [img, setImg] = useState(0);
  const images = product.images.length ? product.images : [""];
  const offer = offers.find((o) => o.qty === qty);
  const basePrice = variant?.price ?? product.price;
  const price = offer ? Math.round(offer.price / offer.qty) : basePrice;
  const stock = variant ? variant.stock : product.stock;
  const soldOut = product.trackStock && stock <= 0;
  const variantLabel = variant ? Object.values(variant.optionValues).join(" / ") : null;
  const shownImg = variant?.image || images[img];

  const line = { productId: product.id, variantId: variant?.id ?? null, qty, name: product.name, variant: variantLabel, price };

  return (
    <div className="pdp">
      <div className="gallery">
        {shownImg ? <img className="main" src={shownImg} alt={product.name} /> : <div className="main" />}
        {images.length > 1 && (
          <div className="thumbs">
            {images.map((s, i) => <img key={i} src={s} alt="" className={i === img ? "on" : ""} onClick={() => setImg(i)} />)}
          </div>
        )}
      </div>
      <div className="stack">
        <h1 style={{ margin: 0 }}>{product.name}</h1>
        <div className="row" style={{ fontSize: "1.4rem" }}>
          <span className="price">{dzd(basePrice, lang)}</span>
          {product.compareAt && product.compareAt > basePrice && <span className="compare">{dzd(product.compareAt, lang)}</span>}
        </div>
        {options.map((o) => (
          <div key={o.name} className="field">
            <label>{o.name}</label>
            <div className="opts">
              {o.values.map((v) => <button type="button" key={v} className={`opt ${sel[o.name] === v ? "on" : ""}`} onClick={() => setSel({ ...sel, [o.name]: v })}>{v}</button>)}
            </div>
          </div>
        ))}
        {offers.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            {[{ qty: 1, price: basePrice, label: undefined as string | undefined }, ...offers].map((o) => {
              const save = basePrice * o.qty - o.price;
              return (
                <label key={o.qty} className="card row" style={{ cursor: "pointer", padding: 12, borderColor: qty === o.qty ? "var(--c-primary)" : undefined, borderWidth: qty === o.qty ? 2 : 1 }}>
                  <input type="radio" style={{ width: "auto" }} checked={qty === o.qty} onChange={() => setQty(o.qty)} />
                  <span style={{ flex: 1 }}><b>{o.label || `${o.qty} ×`}</b></span>
                  {save > 0 && <span className="badge" style={{ background: "var(--c-accent)" }}>-{dzd(save, lang)}</span>}
                  <b className="price">{dzd(o.price, lang)}</b>
                </label>
              );
            })}
          </div>
        )}
        <div className="field">
          <label>{t.quantity}</label>
          <div className="qty">
            <button type="button" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <input value={qty} inputMode="numeric" onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
            <button type="button" onClick={() => setQty(qty + 1)}>+</button>
          </div>
        </div>
        {soldOut ? (
          <div className="alert">{t.out_of_stock}</div>
        ) : (
          <>
            {flow !== "landing" && (
              <button className={`btn lg ${flow === "both" ? "outline" : ""}`} onClick={() => {
                cart.add({ ...line, slug: product.slug, image: images[0] });
                track("AddToCart", { value: price * qty, currency: "DZD" });
                if (flow === "cart") router.push("/cart");
              }}>🛒 {t.add_to_cart}</button>
            )}
            {flow !== "cart" && (
              <div id="order-form" className="card" style={{ borderColor: "var(--c-primary)", borderWidth: 2 }}>
                <h3 style={{ marginTop: 0 }}>{t.order_now}</h3>
                <OrderForm {...checkout} lang={lang} t={t} lines={[line]} allFreeShipping={product.freeShipping} />
              </div>
            )}
          </>
        )}
      </div>
      {!soldOut && flow !== "cart" && (
        <div className="sticky-cta">
          <div><b>{product.name}</b><div className="price">{dzd(price * qty, lang)}</div></div>
          <button type="button" className="btn" onClick={() => document.getElementById("order-form")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t.order_now}</button>
        </div>
      )}
    </div>
  );
}
