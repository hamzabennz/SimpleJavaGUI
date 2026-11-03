"use client";
import { useState, useTransition } from "react";
import { shipOrders, shipConfirmed } from "../../actions";

export function ShipButton({ orderId, label }: { orderId?: string; label: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="row wrap">
      <button type="button" className="btn sm" disabled={pending} onClick={() => start(async () => {
        const { results } = orderId ? await shipOrders([orderId]) : await shipConfirmed();
        const ok = results.filter((r) => r.ok).length;
        const errs = results.filter((r) => !r.ok).map((r) => ("error" in r ? `${r.number ? "#" + r.number + ": " : ""}${r.error}` : ""));
        setMsg(results.length ? `${ok} envoyée(s)${errs.length ? " · " + errs.join(" · ") : ""}` : "Aucune commande à envoyer");
      })}>{pending ? "..." : `🚚 ${label}`}</button>
      {msg && <span className="muted" style={{ fontSize: ".85rem" }}>{msg}</span>}
    </span>
  );
}
