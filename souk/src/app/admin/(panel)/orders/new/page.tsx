import { adminT } from "@/lib/admin-lang";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { tr } from "@/lib/i18n";
import { wilayas } from "@/lib/algeria";
import { ManualOrder } from "./ManualOrder";

export default async function NewOrder() {
  const { tenant } = await requireAdmin("orders");
  const { t } = await adminT();
  const [products, rates] = await Promise.all([
    db.product.findMany({ where: { tenantId: tenant.id, status: "active" }, include: { variants: true }, orderBy: { createdAt: "desc" } }),
    db.deliveryRate.findMany({ where: { tenantId: tenant.id, enabled: true } }),
  ]);
  return (
    <>
      <h1>{t("Nouvelle commande manuelle")}</h1>
      <ManualOrder
        products={products.map((p) => ({ id: p.id, name: tr(p.name, "fr"), price: p.price, variants: p.variants.map((v) => ({ id: v.id, label: Object.values(v.optionValues as Record<string, string>).join(" / "), price: v.price })) }))}
        fields={tenant.config.checkout.fields}
        wilayas={wilayas.map((w) => ({ code: w.code, fr: w.fr }))}
        rates={rates.map((r) => ({ w: r.wilayaCode, home: r.homePrice, desk: r.deskPrice }))}
      />
    </>
  );
}
