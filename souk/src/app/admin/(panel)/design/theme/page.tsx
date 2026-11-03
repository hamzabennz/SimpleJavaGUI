import { adminT } from "@/lib/admin-lang";
import { requireAdmin } from "@/lib/auth";
import { ThemeEditor } from "./ThemeEditor";

export default async function ThemePage() {
  const { tenant } = await requireAdmin("design");
  const { t } = await adminT();
  return (<><h1>{t("Thème & couleurs")}</h1><ThemeEditor initial={tenant.config.theme} orderFlow={tenant.config.orderFlow} /></>);
}
