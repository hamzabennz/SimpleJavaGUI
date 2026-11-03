import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { getLang } from "@/lib/i18n";
import { SectionSchema } from "@/lib/settings";
import { Sections } from "@/components/store/Sections";
import { z } from "zod";

export default async function Home() {
  const tenant = await requireTenant();
  const lang = await getLang(tenant);
  const page = await db.page.findFirst({ where: { tenantId: tenant.id, isHome: true } });
  const sections = z.array(SectionSchema).catch([]).parse(page?.sections ?? [
    { id: "g", type: "product_grid", props: { title_ar: "منتجاتنا", title_fr: "Nos produits", limit: 12 } },
  ]);
  return <Sections sections={sections} tenant={tenant} lang={lang} />;
}
