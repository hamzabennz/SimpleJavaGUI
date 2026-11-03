import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { adminT } from "@/lib/admin-lang";
import { tr } from "@/lib/i18n";
import { sectionTypes } from "@/lib/sections";
import { PageBuilder } from "./PageBuilder";
import { createPage, deletePage } from "../../../actions";

export default async function HomeBuilder({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { tenant } = await requireAdmin("design");
  const { t, lang } = await adminT();
  const slug = (await searchParams).page;
  const pages = await db.page.findMany({ where: { tenantId: tenant.id }, orderBy: [{ isHome: "desc" }, { slug: "asc" }] });
  const page = slug ? pages.find((p) => p.slug === slug) : pages.find((p) => p.isHome);
  return (
    <>
      <div className="tabs">
        {pages.map((p) => <Link key={p.id} href={p.isHome ? "/admin/design/home" : `/admin/design/home?page=${p.slug}`} className={p.id === page?.id ? "on" : ""}>{p.isHome ? t("Page d'accueil") : tr(p.title, lang)}</Link>)}
      </div>
      <div className="row between wrap">
        <h1>{page && !page.isHome ? tr(page.title, lang) : t("Page d'accueil")}</h1>
        {page && !page.isHome && (
          <div className="row">
            <a className="btn sm ghost" href={`/p/${page.slug}`} target="_blank">↗ /p/{page.slug}</a>
            <form action={deletePage.bind(null, page.slug)}><button className="btn sm danger">{t("Supprimer")}</button></form>
          </div>
        )}
      </div>
      <PageBuilder key={page?.id ?? "home"} slug={page?.slug} previewPath={page && !page.isHome ? `/p/${page.slug}` : "/"} initial={(page?.sections as any[]) ?? []} registry={sectionTypes} />
      <form action={createPage} className="card row wrap" style={{ marginTop: 16 }}>
        <b>{t("Nouvelle page")}</b>
        <input name="fr" placeholder={t("Titre (FR) ex: Politique de retour")} style={{ maxWidth: 260 }} />
        <input name="ar" placeholder="العنوان (عربي)" dir="rtl" style={{ maxWidth: 220 }} />
        <button className="btn sm">{t("Créer")}</button>
      </form>
    </>
  );
}
