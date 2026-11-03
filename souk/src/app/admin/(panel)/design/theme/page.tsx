import { requireAdmin } from "@/lib/auth";
import { ThemeEditor } from "./ThemeEditor";

export default async function ThemePage() {
  const { tenant } = await requireAdmin("design");
  return (<><h1>Thème & couleurs</h1><ThemeEditor initial={tenant.config.theme} orderFlow={tenant.config.orderFlow} /></>);
}
