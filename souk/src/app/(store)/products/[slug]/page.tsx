import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { getDict, getLang, tr } from "@/lib/i18n";
import { checkoutContext } from "@/lib/storefront";
import { ProductBuy } from "@/components/store/ProductBuy";
import { ProductCard } from "@/components/store/ProductCard";
import { ReviewForm } from "@/components/store/ReviewForm";

async function load(slug: string) {
  const tenant = await requireTenant();
  const product = await db.product.findUnique({ where: { tenantId_slug: { tenantId: tenant.id, slug: decodeURIComponent(slug) } }, include: { variants: true } });
  if (!product || product.status !== "active") notFound();
  return { tenant, product };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { tenant, product } = await load((await params).slug);
  const lang = await getLang(tenant);
  return { title: `${tr(product.name, lang)} | ${tenant.name}`, openGraph: { images: product.images.slice(0, 1) } };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { tenant, product } = await load((await params).slug);
  const lang = await getLang(tenant);
  const t = getDict(lang);
  const options = ((product.options as any[]) ?? []).map((o) => ({ name: tr(o.name, lang), key: o.name?.fr || o.name?.ar, values: o.values as string[] }));
  // variant optionValues are keyed by the option's FR name; re-key them to the displayed name
  const variants = product.variants.map((v) => {
    const ov = v.optionValues as Record<string, string>;
    return { id: v.id, price: v.price, stock: v.stock, image: v.image, optionValues: Object.fromEntries(options.map((o) => [o.name, ov[o.key]])) };
  });
  const attrs = tenant.config.productAttributes.filter((a) => a.enabled && (product.attributes as any)?.[a.key]);
  const up = (product.extra as any)?.upsell as { productId: string; price: number; label?: { ar?: string; fr?: string } } | undefined;
  const upProduct = up?.productId ? await db.product.findFirst({ where: { id: up.productId, tenantId: tenant.id, status: "active" } }) : null;
  const reviews = await db.review.findMany({ where: { tenantId: tenant.id, productId: product.id, approved: true }, orderBy: { createdAt: "desc" }, take: 30 });
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const related = await db.product.findMany({ where: { tenantId: tenant.id, status: "active", categoryId: product.categoryId, NOT: { id: product.id } }, take: 4 });
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: tr(product.name, lang), image: product.images, description: tr(product.description, lang),
    ...(reviews.length ? { aggregateRating: { "@type": "AggregateRating", ratingValue: avg.toFixed(1), reviewCount: reviews.length } } : {}),
    offers: { "@type": "Offer", priceCurrency: "DZD", price: product.price, availability: product.trackStock && product.stock <= 0 && !product.variants.some((v) => v.stock > 0) ? "https://schema.org/OutOfStock" : "https://schema.org/InStock" },
  };
  return (
    <div className="container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ProductBuy
        product={{ id: product.id, slug: product.slug, name: tr(product.name, lang), price: product.price, compareAt: product.compareAt, images: product.images, trackStock: product.trackStock, stock: product.stock, freeShipping: !!(product.extra as any)?.freeShipping }}
        options={options.map(({ name, values }) => ({ name, values }))}
        variants={variants}
        offers={(((product.extra as any)?.offers ?? []) as any[]).map((o) => ({ qty: o.qty, price: o.price, label: tr(o.label, lang) || undefined }))}
        flow={tenant.config.orderFlow}
        whatsapp={tenant.config.store.whatsapp}
        upsell={upProduct && up ? { productId: upProduct.id, name: tr(upProduct.name, lang), price: up.price, regular: upProduct.price, image: upProduct.images[0], label: tr(up.label, lang) || undefined } : null}
        lang={lang}
        t={t}
        checkout={await checkoutContext(tenant)}
      />
      {attrs.length > 0 && (
        <table className="tbl card" style={{ marginBottom: 16 }}>
          <tbody>{attrs.map((a) => <tr key={a.key}><th>{tr(a.label, lang)}</th><td>{String((product.attributes as any)[a.key])}</td></tr>)}</tbody>
        </table>
      )}
      {tr(product.description, lang) && <div className="card rich">{tr(product.description, lang)}</div>}
      <section className="section">
        <h2>{lang === "ar" ? "آراء الزبائن" : "Avis clients"} {reviews.length > 0 && <span className="muted" style={{ fontSize: "1rem" }}>★ {avg.toFixed(1)} ({reviews.length})</span>}</h2>
        <div className="stack">
          {reviews.map((r) => (
            <div key={r.id} className="card">
              <div className="row between"><b>{r.name}{r.verified && <span className="badge" style={{ background: "var(--c-success)", marginInlineStart: 8 }}>✓ {lang === "ar" ? "شراء مؤكد" : "Achat vérifié"}</span>}</b><span style={{ color: "var(--c-accent)" }} dir="ltr">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span></div>
              <p style={{ margin: "6px 0 0" }}>{r.body}</p>
            </div>
          ))}
          <ReviewForm productId={product.id} lang={lang} />
        </div>
      </section>
      {related.length > 0 && (
        <section className="section">
          <h2>{t.related}</h2>
          <div className="grid">{related.map((p) => <ProductCard key={p.id} p={p} lang={lang} style={tenant.config.theme.productCard} />)}</div>
        </section>
      )}
    </div>
  );
}
