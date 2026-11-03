import { adminT } from "@/lib/admin-lang";
import { requireAdmin } from "@/lib/auth";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const { tenant } = await requireAdmin("design");
  const { t } = await adminT();
  return (<><h1>{t("Paramètres")}</h1><SettingsForm initial={tenant.config} /></>);
}
