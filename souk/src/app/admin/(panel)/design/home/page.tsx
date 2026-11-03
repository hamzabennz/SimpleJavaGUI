import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { sectionTypes } from "@/lib/sections";
import { PageBuilder } from "./PageBuilder";

export default async function HomeBuilder() {
  const { tenant } = await requireAdmin("design");
  const page = await db.page.findFirst({ where: { tenantId: tenant.id, isHome: true } });
  return (<><h1>Page d'accueil</h1><PageBuilder initial={(page?.sections as any[]) ?? []} registry={sectionTypes} /></>);
}
