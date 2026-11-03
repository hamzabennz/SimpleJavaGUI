import { db } from "./db";
import { wilayas } from "./algeria";
import type { CurrentTenant } from "./tenant";

/** Everything the client-side order form needs. */
export async function checkoutContext(tenant: CurrentTenant) {
  const rates = await db.deliveryRate.findMany({ where: { tenantId: tenant.id, enabled: true } });
  return {
    fields: tenant.config.checkout.fields,
    wilayas,
    rates: rates.map((r) => ({ w: r.wilayaCode, home: r.homePrice, desk: tenant.config.checkout.deskEnabled ? r.deskPrice : null })),
    deskEnabled: tenant.config.checkout.deskEnabled,
    freeShippingOver: tenant.config.checkout.freeShippingOver,
  };
}
