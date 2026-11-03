import type { Order, OrderItem } from "@prisma/client";

export type ShipmentOrder = Order & { items: OrderItem[] };
export type ShipResult = { ok: true; tracking: string; label?: string } | { ok: false; error: string };

/**
 * Carrier adapter contract. Adding a new delivery company = one file implementing this
 * and one line in ./index.ts. Credentials come from tenant settings (integrations.carriers[id]).
 */
export interface CarrierAdapter {
  id: string;
  name: string;
  /** Credential fields shown in the admin settings form */
  credentials: { key: string; label: string; secret?: boolean }[];
  createShipment(order: ShipmentOrder, creds: Record<string, string>, ctx: { wilayaFr: string; storeName: string }): Promise<ShipResult>;
  /** Optional: map carrier status → our order status */
  mapStatus?(carrierStatus: string): string | null;
}
