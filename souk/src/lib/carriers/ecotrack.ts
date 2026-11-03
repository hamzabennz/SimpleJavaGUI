import type { CarrierAdapter } from "./types";

/**
 * EcoTrack platform: used by many Algerian delivery companies, each on its own sub-domain
 * (e.g. https://<company>.ecotrack.dz). One adapter covers all of them via the "baseUrl" credential.
 * Verify parameter names with the carrier's API docs before going live.
 */
export const ecotrack: CarrierAdapter = {
  id: "ecotrack",
  name: "EcoTrack (DHD, Conexlog, …)",
  credentials: [{ key: "baseUrl", label: "URL (ex: https://dhd.ecotrack.dz)" }, { key: "token", label: "API Token", secret: true }],
  async createShipment(o, creds) {
  const base = (creds.baseUrl || "").replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(base)) return { ok: false, error: "URL EcoTrack invalide" };
  const params = new URLSearchParams({
    reference: String(o.number),
    nom_client: o.name,
    telephone: o.phone,
    adresse: o.address || o.commune || "",
    code_wilaya: String(o.wilayaCode),
    commune: o.commune || "",
    montant: String(o.total),
    produit: o.items.map((i) => `${i.name} x${i.qty}`).join(", "),
    type: "1",
    stop_desk: o.deliveryType === "desk" ? "1" : "0",
  });
  try {
    const res = await fetch(`${base}/api/v1/create/order?${params}`, { method: "POST", headers: { Authorization: `Bearer ${creds.token}`, Accept: "application/json" } });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || !j?.tracking) return { ok: false, error: j?.message || `HTTP ${res.status}` };
    return { ok: true, tracking: j.tracking };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  },
};
