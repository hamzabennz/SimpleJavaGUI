import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getLang, getDict, tr } from "@/lib/i18n";
import { CartProvider, CartCount } from "@/components/store/CartProvider";
import { Pixels } from "@/components/store/Pixels";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const lang = await getLang(tenant);
  const t = getDict(lang);
  const s = tenant.config.store;
  const other = tenant.config.locale.enabled.find((l) => l !== lang);
  return (
    <CartProvider storeKey={tenant.slug}>
      <Pixels meta={tenant.config.tracking.metaPixelId} tiktok={tenant.config.tracking.tiktokPixelId} />
      {s.announcement && tr(s.announcement, lang) && <div className="announce">{tr(s.announcement, lang)}</div>}
      <header className="site-header">
        <div className="container">
          <Link href="/" className="logo">{s.logo ? <img src={s.logo} alt={tenant.name} /> : null}{tenant.name}</Link>
          <nav className="nav">
            <Link href="/products">{t.products}</Link>
            <Link href="/track">{t.track_order}</Link>
            {other && <a href={`?lang=${other}`}>{other.toUpperCase()}</a>}
            {tenant.config.orderFlow !== "landing" && (
              <Link href="/cart" className="cart-pill" aria-label={t.cart}>🛒<CartCount /></Link>
            )}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="container row between wrap">
          <div>
            <b>{tenant.name}</b>
            <div className="muted">{tr(s.tagline, lang)}</div>
          </div>
          <div className="row wrap muted">
            {s.phone && <a href={`tel:${s.phone}`} dir="ltr">📞 {s.phone}</a>}
            {s.whatsapp && <a href={`https://wa.me/${s.whatsapp.replace(/^0/, "213")}`}>WhatsApp</a>}
            {s.facebook && <a href={s.facebook}>Facebook</a>}
            {s.instagram && <a href={s.instagram}>Instagram</a>}
            {s.tiktok && <a href={s.tiktok}>TikTok</a>}
          </div>
        </div>
        <div className="container muted" style={{ marginTop: 12, fontSize: ".8rem" }}>{tr(tenant.config.footer.text, lang) || `© ${new Date().getFullYear()} ${tenant.name}`}</div>
      </footer>
    </CartProvider>
  );
}
