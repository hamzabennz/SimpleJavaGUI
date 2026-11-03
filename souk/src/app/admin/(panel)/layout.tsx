import { Icon } from "@/components/Icon";
import { AdminLangProvider } from "@/components/AdminLang";
import { adminT } from "@/lib/admin-lang";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { tenant, user, can } = await requireAdmin();
  const { t, lang } = await adminT();
  const nav: [string, string, string, string][] = [
    ["", "/admin", "Tableau de bord", "dashboard"],
    ["orders", "/admin/orders", "Commandes", "orders"],
    ["orders", "/admin/abandoned", "Paniers abandonnés", "cart"],
    ["products", "/admin/products", "Produits", "box"],
    ["customers", "/admin/customers", "Clients", "users"],
    ["products", "/admin/reviews", "Avis clients", "star"],
    ["orders", "/admin/coupons", "Coupons", "tag"],
    ["delivery", "/admin/delivery", "Livraison", "truck"],
    ["reports", "/admin/reports", "Rapports", "chart"],
  ];
  const design: [string, string, string][] = [
    ["/admin/design/theme", "Thème & couleurs", "palette"],
    ["/admin/design/home", "Page d'accueil", "layout"],
    ["/admin/design/checkout", "Formulaire de commande", "form"],
    ["/admin/settings", "Paramètres", "settings"],
    ["/admin/settings/integrations", "Intégrations", "plug"],
    ["/admin/settings/domains", "Domaines", "globe"],
    ["/admin/staff", "Équipe", "team"],
  ];
  return (
    <AdminLangProvider lang={lang}>
    <div className="admin" dir={lang === "ar" ? "rtl" : "ltr"}>
      <aside>
        <Link href="/admin" className="brand"><span className="brand-mark">{tenant.name.slice(0, 1)}</span>{tenant.name}</Link>
        {nav.filter(([p]) => !p || can(p)).map(([, h, l, i]) => <Link key={h} href={h}><Icon name={i} />{t(l)}</Link>)}
        {can("design") && <><div className="grp">{t("Boutique")}</div>{design.map(([h, l, i]) => <Link key={h} href={h}><Icon name={i} />{t(l)}</Link>)}</>}
        <div className="grp">{t("Compte")}</div>
        <a href={`?alang=${lang === "ar" ? "fr" : "ar"}`}><Icon name="language" />{lang === "ar" ? "Français" : "العربية"}</a>
        <a href="/" target="_blank"><Icon name="external" />{t("Voir la boutique")}</a>
        <form action={logout}><button className="btn ghost sm" style={{ color: "#cbd5e1", borderColor: "#334155", marginTop: 8, width: "100%" }}>{t("Déconnexion")} ({user.email})</button></form>
      </aside>
      <main>{children}</main>
    </div>
    </AdminLangProvider>
  );
}
