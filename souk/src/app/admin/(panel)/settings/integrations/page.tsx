import { requireAdmin } from "@/lib/auth";
import { carriers } from "@/lib/carriers";
import { IntegrationsForm } from "./IntegrationsForm";

export default async function Integrations() {
  const { tenant } = await requireAdmin("*");
  const c = tenant.config;
  return (
    <>
      <h1>Intégrations</h1>
      <IntegrationsForm
        adapters={Object.values(carriers).map(({ id, name, credentials }) => ({ id, name, credentials }))}
        initial={{ defaultCarrier: c.integrations.defaultCarrier, carriers: c.integrations.carriers, metaAccessToken: c.tracking.metaAccessToken, tiktokAccessToken: c.tracking.tiktokAccessToken }}
      />
    </>
  );
}
