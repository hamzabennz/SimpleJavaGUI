import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { getLang, tr } from "@/lib/i18n";
import { SectionSchema } from "@/lib/settings";
import { Sections } from "@/components/store/Sections";

async function load(slug: string) {
  const tenant = await requireTenant();
  const page = await db.page.findUnique({ where: { tenantId_slug: { tenantId: tenant.id, slug } } });
  if (!page || page.isHome) notFound();
  return { tenant, page };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { tenant, page } = await load((await params).slug);
  return { title: `${tr(page.title, await getLang(tenant))} | ${tenant.name}` };
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { tenant, page } = await load((await params).slug);
  const lang = await getLang(tenant);
  return (
    <>
      <div className="container" style={{ paddingTop: 32 }}><h1 style={{ margin: 0 }}>{tr(page.title, lang)}</h1></div>
      <Sections sections={z.array(SectionSchema).catch([]).parse(page.sections)} tenant={tenant} lang={lang} />
    </>
  );
}
