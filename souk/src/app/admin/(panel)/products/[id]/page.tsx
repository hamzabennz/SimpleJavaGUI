import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { tr } from "@/lib/i18n";
import { ProductForm } from "../ProductForm";
import { deleteProduct } from "../../../actions";

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { tenant } = await requireAdmin("products");
  const { id } = await params;
  const p = await db.product.findFirst({ where: { id, tenantId: tenant.id }, include: { variants: true } });
  if (!p) notFound();
  const cats = await db.category.findMany({ where: { tenantId: tenant.id } });
  const L = (v: unknown) => ({ ar: (v as any)?.ar ?? "", fr: (v as any)?.fr ?? "" });
  return (
    <>
      <div className="row between wrap">
        <h1>{tr(p.name, "fr")}</h1>
        <form action={deleteProduct.bind(null, p.id)}><button className="btn sm danger">Supprimer</button></form>
      </div>
      <ProductForm
        categories={cats.map((c) => ({ id: c.id, name: tr(c.name, "fr") }))}
        attributeFields={tenant.config.productAttributes}
        initial={{
          id: p.id, slug: p.slug, name: L(p.name), description: L(p.description), status: p.status as any, price: p.price, compareAt: p.compareAt, cost: p.cost,
          categoryId: p.categoryId, trackStock: p.trackStock, stock: p.stock, images: p.images, attributes: (p.attributes as any) ?? {},
          freeShipping: !!(p.extra as any)?.freeShipping,
          offers: (((p.extra as any)?.offers ?? []) as any[]).map((o) => ({ qty: o.qty, price: o.price, label: L(o.label) })),
          options: ((p.options as any[]) ?? []).map((o) => ({ name: L(o.name), values: o.values })),
          variants: p.variants.map((v) => ({ id: v.id, optionValues: v.optionValues as Record<string, string>, sku: v.sku, price: v.price, stock: v.stock })),
        }}
      />
    </>
  );
}
