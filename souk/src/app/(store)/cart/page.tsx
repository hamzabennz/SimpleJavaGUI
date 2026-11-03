import { requireTenant } from "@/lib/tenant";
import { getDict, getLang } from "@/lib/i18n";
import { checkoutContext } from "@/lib/storefront";
import { CartView } from "./CartView";

export default async function CartPage() {
  const tenant = await requireTenant();
  const lang = await getLang(tenant);
  const t = getDict(lang);
  return (
    <div className="container section">
      <h1>{t.cart}</h1>
      <CartView lang={lang} t={t} checkout={await checkoutContext(tenant)} />
    </div>
  );
}
