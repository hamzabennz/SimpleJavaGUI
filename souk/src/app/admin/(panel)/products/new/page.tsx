import { adminT } from "@/lib/admin-lang";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { tr } from "@/lib/i18n";
import { ProductForm } from "../ProductForm";

export default async function NewProduct() {
  const { tenant } = await requireAdmin("products");
  const { t } = await adminT();
  const cats = await db.category.findMany({ where: { tenantId: tenant.id } });
  const allProducts = (await db.product.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true, price: true } })).map((x) => ({ id: x.id, name: tr(x.name, "fr"), price: x.price }));
  return (
    <>
      <h1>{t("Nouveau produit")}</h1>
      <ProductForm
        categories={cats.map((c) => ({ id: c.id, name: tr(c.name, "fr") }))}
        attributeFields={tenant.config.productAttributes}
        allProducts={allProducts}
        initial={{ slug: "", name: { ar: "", fr: "" }, description: { ar: "", fr: "" }, status: "active", price: 0, compareAt: null, cost: null, categoryId: null, trackStock: false, stock: 0, images: [], attributes: {}, freeShipping: false, upsell: null, offers: [], options: [], variants: [] }}
      />
    </>
  );
}
