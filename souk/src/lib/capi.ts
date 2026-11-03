import crypto from "node:crypto";
import type { Order } from "@prisma/client";
import type { Settings } from "./settings";

const sha = (s: string) => crypto.createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
const e164 = (phone: string) => "213" + phone.replace(/^0/, "");

/**
 * Server-side conversion events (Meta Conversions API + TikTok Events API).
 * Fire-and-forget: failures are logged and never block the order.
 * event_id = order id so the browser pixel and server event are de-duplicated.
 */
export async function sendPurchaseEvents(tracking: Settings["tracking"], order: Order, ctx: { ip?: string; ua?: string; url?: string }) {
  const jobs: Promise<unknown>[] = [];
  if (tracking.metaPixelId && tracking.metaAccessToken) {
    jobs.push(fetch(`https://graph.facebook.com/v19.0/${tracking.metaPixelId}/events?access_token=${encodeURIComponent(tracking.metaAccessToken)}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: [{
          event_name: "Purchase", event_time: Math.floor(order.createdAt.getTime() / 1000), event_id: order.id, action_source: "website",
          event_source_url: ctx.url,
          user_data: { ph: [sha(e164(order.phone))], fn: [sha(order.name.split(" ")[0] ?? "")], ct: [sha(order.commune ?? "")], country: [sha("dz")], client_ip_address: ctx.ip, client_user_agent: ctx.ua },
          custom_data: { currency: "DZD", value: order.total },
        }],
      }),
    }));
  }
  if (tracking.tiktokPixelId && tracking.tiktokAccessToken) {
    jobs.push(fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
      method: "POST", headers: { "content-type": "application/json", "Access-Token": tracking.tiktokAccessToken },
      body: JSON.stringify({
        event_source: "web", event_source_id: tracking.tiktokPixelId,
        data: [{ event: "CompletePayment", event_time: Math.floor(order.createdAt.getTime() / 1000), event_id: order.id,
          user: { phone: sha("+" + e164(order.phone)), ip: ctx.ip, user_agent: ctx.ua },
          properties: { currency: "DZD", value: order.total }, page: { url: ctx.url } }],
      }),
    }));
  }
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.error("CAPI error", r.reason);
}
