import type { Order, OrderItem } from "@prisma/client";
import type { Settings } from "./settings";
import { wilayaName } from "./algeria";
import { dzd } from "./money";

/**
 * Merchant notifications on new orders. Telegram is the de-facto channel for Algerian sellers.
 * Each channel is optional and fire-and-forget.
 */
export async function notifyNewOrder(settings: Settings, storeName: string, order: Order & { items: OrderItem[] }) {
  const tg = settings.notifications.telegram;
  if (tg.botToken && tg.chatId) {
    const text = [
      `🛒 <b>${esc(storeName)}</b> — nouvelle commande #${order.number}`,
      `👤 ${esc(order.name)} · <code>${order.phone}</code>`,
      `📍 ${esc(wilayaName(order.wilayaCode))}${order.commune ? " · " + esc(order.commune) : ""} (${order.deliveryType === "desk" ? "Stop desk" : "Domicile"})`,
      ...order.items.map((i) => `• ${esc(i.name)}${i.variant ? ` (${esc(i.variant)})` : ""} × ${i.qty}`),
      `💰 <b>${dzd(order.total)}</b>`,
    ].join("\n");
    await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: tg.chatId, text, parse_mode: "HTML" }),
    }).catch((e) => console.error("telegram", e));
  }
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
