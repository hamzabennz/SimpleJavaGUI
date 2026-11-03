import { AdminLangProvider } from "@/components/AdminLang";
import { adminT } from "@/lib/admin-lang";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { tenant, user, can } = await requireAdmin();
  const { t, lang } = await adminT();
  const nav: [string, string, string][] = [
    ["", "/admin", "📊 Tableau de bord"],
    ["orders", "/admin/orders", "🧾 Commandes"],
    ["orders", "/admin/abandoned", "📵 Paniers abandonnés"],
    ["products", "/admin/products", "📦 Produits"],
    ["customers", "/admin/customers", "👥 Clients"],
    ["products", "/admin/reviews", "⭐ Avis clients"],
    ["orders", "/admin/coupons", "🏷️ Coupons"],
    ["delivery", "/admin/delivery", "🚚 Livraison"],
    ["reports", "/admin/reports", "📈 Rapports"],
  ];
  const design: [string, string][] = [
    ["/admin/design/theme", "🎨 Thème & couleurs"],
    ["/admin/design/home", "🧱 Page d'accueil"],
    ["/admin/design/checkout", "📝 Formulaire de commande"],
    ["/admin/settings", "⚙️ Paramètres"],
    ["/admin/settings/integrations", "🔌 Intégrations"],
    ["/admin/settings/domains", "🌐 Domaines"],
    ["/admin/staff", "🧑‍💼 Équipe"],
  ];
  return (
    <AdminLangProvider lang={lang}>
    <div className="admin" dir={lang === "ar" ? "rtl" : "ltr"}>
      <aside>
        <Link href="/admin" className="brand">🛍️ {tenant.name}</Link>
        {nav.filter(([p]) => !p || can(p)).map(([, h, l]) => <Link key={h} href={h}>{t(l)}</Link>)}
        {can("design") && <><div className="grp">{t("Boutique")}</div>{design.map(([h, l]) => <Link key={h} href={h}>{t(l)}</Link>)}</>}
        <div className="grp">{t("Compte")}</div>
        <a href={`?alang=${lang === "ar" ? "fr" : "ar"}`}>🌐 {lang === "ar" ? "Français" : "العربية"}</a>
        <a href="/" target="_blank">{t("↗ Voir la boutique")}</a>
        <form action={logout}><button className="btn ghost sm" style={{ color: "#cbd5e1", borderColor: "#334155", marginTop: 8, width: "100%" }}>{t("Déconnexion")} ({user.email})</button></form>
      </aside>
      <main>{children}</main>
    </div>
    </AdminLangProvider>
  );
}
