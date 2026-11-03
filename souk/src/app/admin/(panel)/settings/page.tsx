import { requireAdmin } from "@/lib/auth";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const { tenant } = await requireAdmin("design");
  return (<><h1>Paramètres</h1><SettingsForm initial={tenant.config} /></>);
}
