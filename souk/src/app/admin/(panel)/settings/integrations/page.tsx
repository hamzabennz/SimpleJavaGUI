import { adminT } from "@/lib/admin-lang";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { carriers } from "@/lib/carriers";
import { mask } from "@/lib/secrets";
import { IntegrationsForm } from "./IntegrationsForm";

export default async function Integrations() {
  const { tenant } = await requireAdmin("*");
  const { t } = await adminT();
  const c = tenant.config;
  const secret = new Set(Object.values(carriers).flatMap((a) => a.credentials.filter((x) => x.secret).map((x) => x.key)));
  const maskedCarriers = Object.fromEntries(Object.entries(c.integrations.carriers).map(([id, v]) => [id, Object.fromEntries(Object.entries(v).map(([k, val]) => [k, secret.has(k) ? mask(val) : val]))]));
  const h = await headers();
  const webhookBase = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/api/webhooks`;
  return (
    <>
      <h1>{t("Intégrations")}</h1>
      <IntegrationsForm
        webhookBase={webhookBase}
        slug={tenant.slug}
        adapters={Object.values(carriers).map(({ id, name, credentials }) => ({ id, name, credentials }))}
        initial={{ defaultCarrier: c.integrations.defaultCarrier, carriers: maskedCarriers, metaAccessToken: mask(c.tracking.metaAccessToken), tiktokAccessToken: mask(c.tracking.tiktokAccessToken), telegramBotToken: mask(c.notifications.telegram.botToken), telegramChatId: c.notifications.telegram.chatId }}
      />
    </>
  );
}
