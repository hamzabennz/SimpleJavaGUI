import Link from "next/link";
import { db } from "@/lib/db";
import type { Section } from "@/lib/settings";
import type { CurrentTenant } from "@/lib/tenant";
import { tr, type Lang } from "@/lib/i18n";
import { ProductCard } from "./ProductCard";
import { Countdown } from "./Countdown";
import { Icon } from "../Icon";

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
        ? [["truck", "توصيل لـ 58 ولاية"], ["cash", "الدفع عند الاستلام"], ["refresh", "إمكانية الاستبدال"], ["headset", "خدمة عملاء"]]
        : [["truck", "Livraison 58 wilayas"], ["cash", "Paiement à la livraison"], ["refresh", "Échange possible"], ["headset", "Service client"]];
      return (
        <section className="section container badges">
          {items.map(([i, l]) => <div key={l} className="card"><div className="ico"><Icon name={i} size={28} /></div><b>{l}</b></div>)}
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
    case "testimonials": {
      const items = String(p.items ?? "").split("\n").map((l) => l.split("|")).filter((x) => x.length >= 3);
      return (
        <section className="section container">
          <h2>{pick(p, "title", lang)}</h2>
          <div className="grid" style={{ ["--grid-cols" as any]: 3 }}>
            {items.map(([n, w, txt], i) => (
              <div key={i} className="card stack" style={{ gap: 6 }}>
                <div style={{ color: "var(--c-accent)" }}>★★★★★</div>
                <div>“{txt}”</div>
                <div className="muted" style={{ fontSize: ".85rem" }}>— {n}, {w}</div>
              </div>
            ))}
          </div>
        </section>
      );
    }
    case "countdown":
      return (
        <section className="section container">
          <div className="card" style={{ textAlign: "center", borderColor: "var(--c-danger)" }}>
            <h2 style={{ marginBottom: 8 }}>{pick(p, "title", lang)}</h2>
            <Countdown endsAt={p.ends_at ? String(p.ends_at) : undefined} hours={Number(p.hours) || 24} units={lang === "ar" ? ["يوم", "ساعة", "دقيقة", "ثانية"] : ["J", "H", "M", "S"]} />
          </div>
        </section>
      );
    case "image_text": {
      const img = typeof p.image === "string" && /^(https?:\/\/|\/uploads\/)/.test(p.image) ? p.image : null;
      return (
        <section className="section container">
          <div className="pdp" style={{ padding: 0, alignItems: "center", direction: p.reverse === "true" || p.reverse === true ? (lang === "ar" ? "ltr" : "rtl") : undefined }}>
            {img ? <img src={img} alt="" style={{ borderRadius: "var(--radius)", width: "100%" }} /> : <div />}
            <div style={{ direction: lang === "ar" ? "rtl" : "ltr" }}><h2>{pick(p, "title", lang)}</h2><p className="rich">{pick(p, "body", lang)}</p></div>
          </div>
        </section>
      );
    }
    case "video": {
      const id = String(p.youtube ?? "").match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/)?.[1];
      if (!id) return null;
      return (
        <section className="section container">
          <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: "var(--radius)", overflow: "hidden" }}>
            <iframe src={`https://www.youtube-nocookie.com/embed/${id}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} allowFullScreen loading="lazy" />
          </div>
        </section>
      );
    }
    default:
      return null;
  }
}
