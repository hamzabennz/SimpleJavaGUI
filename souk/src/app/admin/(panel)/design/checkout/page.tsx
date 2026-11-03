import { requireAdmin } from "@/lib/auth";
import { FormBuilder } from "./FormBuilder";

export default async function CheckoutBuilder({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { tenant } = await requireAdmin("design");
  const attrs = (await searchParams).t === "attributes";
  const c = tenant.config.checkout;
  return (
    <>
      <div className="tabs">
        <a href="/admin/design/checkout" className={!attrs ? "on" : ""}>Formulaire de commande</a>
        <a href="/admin/design/checkout?t=attributes" className={attrs ? "on" : ""}>Attributs produits</a>
      </div>
      <h1>{attrs ? "Attributs produits personnalisés" : "Formulaire de commande"}</h1>
      {attrs
        ? <FormBuilder key="a" target="productAttributes" initial={tenant.config.productAttributes} />
        : <FormBuilder key="c" target="checkout" initial={c.fields} extra={{ deskEnabled: c.deskEnabled, freeShippingOver: c.freeShippingOver }} />}
    </>
  );
}
