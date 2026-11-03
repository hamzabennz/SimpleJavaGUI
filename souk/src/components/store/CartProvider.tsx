"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type CartItem = { productId: string; variantId?: string | null; qty: number; name: string; variant?: string | null; price: number; image?: string; slug: string };
type Ctx = { items: CartItem[]; add: (i: CartItem) => void; setQty: (idx: number, q: number) => void; remove: (idx: number) => void; clear: () => void };
const CartCtx = createContext<Ctx | null>(null);

export function CartProvider({ storeKey, children }: { storeKey: string; children: React.ReactNode }) {
  const key = `cart:${storeKey}`;
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem(key) || "[]")); } catch {}
  }, [key]);
  const save = (next: CartItem[]) => {
    setItems(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  };
  return (
    <CartCtx.Provider value={{
      items,
      add: (i) => {
        const idx = items.findIndex((x) => x.productId === i.productId && (x.variantId ?? null) === (i.variantId ?? null));
        if (idx >= 0) save(items.map((x, j) => (j === idx ? { ...x, qty: x.qty + i.qty } : x)));
        else save([...items, i]);
      },
      setQty: (idx, q) => save(items.map((x, j) => (j === idx ? { ...x, qty: Math.max(1, q) } : x))),
      remove: (idx) => save(items.filter((_, j) => j !== idx)),
      clear: () => save([]),
    }}>
      {children}
    </CartCtx.Provider>
  );
}

export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}

export function CartCount() {
  const { items } = useCart();
  const n = items.reduce((s, i) => s + i.qty, 0);
  return n ? <span className="cart-count">{n}</span> : null;
}
