import { adminT } from "@/lib/admin-lang";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { sectionTypes } from "@/lib/sections";
import { PageBuilder } from "./PageBuilder";

export default async function HomeBuilder() {
  const { tenant } = await requireAdmin("design");
  const { t } = await adminT();
  const page = await db.page.findFirst({ where: { tenantId: tenant.id, isHome: true } });
  return (<><h1>{t("Page d'accueil")}</h1><PageBuilder initial={(page?.sections as any[]) ?? []} registry={sectionTypes} /></>);
}
