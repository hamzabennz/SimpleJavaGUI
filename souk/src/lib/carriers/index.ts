import type { CarrierAdapter } from "./types";
import { yalidine } from "./yalidine";
import { zrexpress } from "./zrexpress";

/** Manual = merchant ships themselves and types the tracking number. */
const manual: CarrierAdapter = {
  id: "manual", name: "Manuel", credentials: [],
  async createShipment(o) { return { ok: true, tracking: `M-${o.number}` }; },
};

export const carriers: Record<string, CarrierAdapter> = { yalidine, zrexpress, manual };
export type { CarrierAdapter };
