"use client";
import Link from "next/link";
import { useCart } from "@/components/store/CartProvider";
import { OrderForm, type Rate } from "@/components/store/OrderForm";
import type { FieldDef } from "@/lib/forms";
import { dzd } from "@/lib/money";

type Props = { lang: "ar" | "fr"; t: Record<string, string>; checkout: { fields: FieldDef[]; wilayas: { code: number; ar: string; fr: string }[]; rates: Rate[]; deskEnabled: boolean; freeShippingOver: number | null } };

export function CartView({ lang, t, checkout }: Props) {
  const cart = useCart();
  if (!cart.items.length) {
    return <div className="card" style={{ textAlign: "center", padding: 48 }}><p>{t.empty_cart}</p><Link className="btn" href="/products">{t.continue_shopping}</Link></div>;
  }
  return (
    <div className="pdp">
      <div className="stack">
        {cart.items.map((i, idx) => (
          <div key={idx} className="card row">
            {i.image && <img src={i.image} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />}
            <div style={{ flex: 1 }}>
              <Link href={`/products/${i.slug}`}><b>{i.name}</b></Link>
              {i.variant && <div className="muted">{i.variant}</div>}
              <div className="price">{dzd(i.price, lang)}</div>
            </div>
            <div className="qty">
              <button onClick={() => cart.setQty(idx, i.qty - 1)}>−</button>
              <input value={i.qty} readOnly />
              <button onClick={() => cart.setQty(idx, i.qty + 1)}>+</button>
            </div>
            <button className="btn ghost sm" onClick={() => cart.remove(idx)}>✕</button>
          </div>
        ))}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t.checkout}</h2>
        <OrderForm {...checkout} lang={lang} t={t} lines={cart.items} onDone={cart.clear} />
      </div>
    </div>
  );
}
