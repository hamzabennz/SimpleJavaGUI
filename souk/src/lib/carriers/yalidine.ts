import type { CarrierAdapter } from "./types";

/** Yalidine API v1. Docs: https://yalidine.app/app/dev/docs/api (verify field names against your account's docs). */
export const yalidine: CarrierAdapter = {
  id: "yalidine",
  name: "Yalidine",
  credentials: [{ key: "apiId", label: "API ID" }, { key: "apiToken", label: "API Token", secret: true }],
  async createShipment(o, creds, ctx) {
    const [firstname, ...rest] = o.name.trim().split(/\s+/);
    const body = [{
      order_id: String(o.number),
      from_wilaya_name: creds.fromWilaya || "Alger",
      firstname, familyname: rest.join(" ") || firstname,
      contact_phone: o.phone,
      address: o.address || o.commune || ctx.wilayaFr,
      to_commune_name: o.commune || "",
      to_wilaya_name: ctx.wilayaFr,
      product_list: o.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ""} x${i.qty}`).join(", "),
      price: o.total,
      do_insurance: false, declared_value: o.subtotal,
      height: 10, width: 20, length: 30, weight: 1,
      freeshipping: o.deliveryFee === 0,
      is_stopdesk: o.deliveryType === "desk",
      has_exchange: false,
    }];
    try {
      const res = await fetch("https://api.yalidine.app/v1/parcels/", {
        method: "POST",
        headers: { "X-API-ID": creds.apiId, "X-API-TOKEN": creds.apiToken, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j: any = await res.json().catch(() => ({}));
      const r = j?.[String(o.number)];
      if (!res.ok || !r?.success) return { ok: false, error: r?.message || j?.error?.message || `HTTP ${res.status}` };
      return { ok: true, tracking: r.tracking, label: r.label };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  },
  mapStatus(s) {
    const m: Record<string, string> = { "Livré": "delivered", "Expédié": "shipped", "En livraison": "shipped", "Retourné au vendeur": "returned", "Echèc livraison": "returned" };
    return m[s] ?? null;
  },
};
