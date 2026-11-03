import Link from "next/link";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { getDict, getLang, tr } from "@/lib/i18n";
import { ProductCard } from "@/components/store/ProductCard";

export default async function Products({ searchParams }: { searchParams: Promise<{ c?: string; q?: string; sort?: string }> }) {
  const sp = await searchParams;
  const tenant = await requireTenant();
  const lang = await getLang(tenant);
  const t = getDict(lang);
  const cats = await db.category.findMany({ where: { tenantId: tenant.id }, orderBy: { position: "asc" } });
  const cat = cats.find((c) => c.slug === sp.c);
  const q = sp.q?.trim();
  const products = await db.product.findMany({
    where: {
      tenantId: tenant.id, status: "active", ...(cat ? { categoryId: cat.id } : {}),
      ...(q ? { OR: [{ slug: { contains: q, mode: "insensitive" } }, { name: { path: ["fr"], string_contains: q } }, { name: { path: ["ar"], string_contains: q } }] } : {}),
    },
    orderBy: sp.sort === "price_asc" ? { price: "asc" } : sp.sort === "price_desc" ? { price: "desc" } : { createdAt: "desc" },
  });
  return (
    <div className="container section">
      <div className="row between wrap" style={{ marginBottom: 16 }}>
        <div className="tabs" style={{ margin: 0 }}>
          <Link href="/products" className={!cat ? "on" : ""}>{t.all}</Link>
          {cats.map((c) => <Link key={c.id} href={`/products?c=${c.slug}`} className={cat?.id === c.id ? "on" : ""}>{tr(c.name, lang)}</Link>)}
        </div>
        <form className="row">
          {cat && <input type="hidden" name="c" value={cat.slug} />}
          <input name="q" defaultValue={q} placeholder={t.search} style={{ width: 200 }} />
          <select name="sort" defaultValue={sp.sort} style={{ width: 150 }}>
            <option value="">↕</option><option value="price_asc">↑ DA</option><option value="price_desc">↓ DA</option>
          </select>
          <button className="btn sm">{t.find}</button>
        </form>
      </div>
      <div className="grid">{products.map((p) => <ProductCard key={p.id} p={p} lang={lang} style={tenant.config.theme.productCard} />)}</div>
    </div>
  );
}
