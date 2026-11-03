import { adminT } from "@/lib/admin-lang";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { carriers } from "@/lib/carriers";
import { IntegrationsForm } from "./IntegrationsForm";

export default async function Integrations() {
  const { tenant } = await requireAdmin("*");
  const { t } = await adminT();
  const c = tenant.config;
  const h = await headers();
  const webhookBase = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/api/webhooks`;
  return (
    <>
      <h1>{t("Intégrations")}</h1>
      <IntegrationsForm
        webhookBase={webhookBase}
        slug={tenant.slug}
        adapters={Object.values(carriers).map(({ id, name, credentials }) => ({ id, name, credentials }))}
        initial={{ defaultCarrier: c.integrations.defaultCarrier, carriers: c.integrations.carriers, metaAccessToken: c.tracking.metaAccessToken, tiktokAccessToken: c.tracking.tiktokAccessToken }}
      />
    </>
  );
}
