import Link from "next/link";
import { db } from "@/lib/db";
import type { Section } from "@/lib/settings";
import type { CurrentTenant } from "@/lib/tenant";
import { tr, type Lang } from "@/lib/i18n";
import { ProductCard } from "./ProductCard";

const safeHref = (u: unknown) => (typeof u === "string" && /^(\/(?!\/)|https?:\/\/)/.test(u) ? u : "/products");
const pick = (props: Record<string, any>, key: string, lang: Lang) => props[`${key}_${lang}`] || props[`${key}_ar`] || props[`${key}_fr`] || "";

export async function Sections({ sections, tenant, lang }: { sections: Section[]; tenant: CurrentTenant; lang: Lang }) {
  return <>{sections.filter((s) => s.enabled).map((s) => <SectionView key={s.id} s={s} tenant={tenant} lang={lang} />)}</>;
}

async function SectionView({ s, tenant, lang }: { s: Section; tenant: CurrentTenant; lang: Lang }) {
  const p = s.props;
  switch (s.type) {
    case "hero":
      return (
        <section className={`hero ${p.align === "center" ? "center" : ""}`} style={typeof p.image === "string" && /^(https?:\/\/|\/uploads\/)[^"'()\s]+$/.test(p.image) ? { backgroundImage: `url("${p.image}")` } : undefined}>
          <div className="container">
            <h1>{pick(p, "title", lang)}</h1>
            <p style={{ fontSize: "1.15rem", maxWidth: 640, marginInline: p.align === "center" ? "auto" : undefined }}>{pick(p, "subtitle", lang)}</p>
            {pick(p, "cta", lang) && <Link href={safeHref(p.cta_link)} className="btn lg" style={{ marginTop: 12, background: "var(--c-accent)", borderColor: "var(--c-accent)" }}>{pick(p, "cta", lang)}</Link>}
          </div>
        </section>
      );
    case "product_grid": {
      const cat = p.category ? await db.category.findUnique({ where: { tenantId_slug: { tenantId: tenant.id, slug: p.category } } }) : null;
      const products = await db.product.findMany({
        where: { tenantId: tenant.id, status: "active", ...(cat ? { categoryId: cat.id } : {}) },
        orderBy: { createdAt: "desc" }, take: Number(p.limit) || 8,
      });
      return (
        <section className="section container">
          <h2>{pick(p, "title", lang)}</h2>
          <div className="grid">{products.map((x) => <ProductCard key={x.id} p={x} lang={lang} style={tenant.config.theme.productCard} />)}</div>
        </section>
      );
    }
    case "categories": {
      const cats = await db.category.findMany({ where: { tenantId: tenant.id }, orderBy: { position: "asc" } });
      if (!cats.length) return null;
      return (
        <section className="section container">
          <h2>{pick(p, "title", lang)}</h2>
          <div className="row wrap">
            {cats.map((c) => <Link key={c.id} href={`/products?c=${c.slug}`} className="btn ghost">{tr(c.name, lang)}</Link>)}
          </div>
        </section>
      );
    }
    case "rich_text":
      return <section className="section container rich">{pick(p, "body", lang)}</section>;
    case "trust_badges": {
      const items = lang === "ar"
        ? [["🚚", "توصيل لـ 58 ولاية"], ["💵", "الدفع عند الاستلام"], ["🔁", "إمكانية الاستبدال"], ["📞", "خدمة عملاء"]]
        : [["🚚", "Livraison 58 wilayas"], ["💵", "Paiement à la livraison"], ["🔁", "Échange possible"], ["📞", "Service client"]];
      return (
        <section className="section container badges">
          {items.map(([i, l]) => <div key={l} className="card"><div className="ico">{i}</div><b>{l}</b></div>)}
        </section>
      );
    }
    case "faq": {
      const lines = String(pick(p, "items", lang)).split("\n").filter((l) => l.includes("|"));
      return (
        <section className="section container">
          <h2>{pick(p, "title", lang)}</h2>
          {lines.map((l, i) => { const [q, a] = l.split("|"); return <details key={i} className="faq"><summary>{q}</summary><p>{a}</p></details>; })}
        </section>
      );
    }
    default:
      return null;
  }
}
