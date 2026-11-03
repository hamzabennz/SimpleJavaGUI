import type { CarrierAdapter } from "./types";

/** ZR Express (Procolis platform). Verify endpoint/fields with ZR Express before going live. */
export const zrexpress: CarrierAdapter = {
  id: "zrexpress",
  name: "ZR Express",
  credentials: [{ key: "token", label: "Token" }, { key: "key", label: "Clé (key)", secret: true }],
  async createShipment(o, creds) {
    const body = {
      Colis: [{
        Tracking: `${o.number}`,
        TypeLivraison: o.deliveryType === "desk" ? "1" : "0",
        TypeColis: "0",
        Confrimee: "",
        Client: o.name,
        MobileA: o.phone,
        MobileB: "",
        Adresse: o.address || o.commune || "",
        IDWilaya: String(o.wilayaCode),
        Commune: o.commune || "",
        Total: String(o.total),
        Note: "",
        TProduit: o.items.map((i) => `${i.name} x${i.qty}`).join(", "),
        id_Externe: o.id,
        Source: "souk",
      }],
    };
    try {
      const res = await fetch("https://procolis.com/api_v1/add_colis", {
        method: "POST",
        headers: { token: creds.token, key: creds.key, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j: any = await res.json().catch(() => ({}));
      const c = j?.Colis?.[0];
      if (!res.ok || !c || c.MessageRetour !== "Good") return { ok: false, error: c?.MessageRetour || `HTTP ${res.status}` };
      return { ok: true, tracking: c.Tracking };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  },
};
