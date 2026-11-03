import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { tenant, user, can } = await requireAdmin();
  const nav: [string, string, string][] = [
    ["", "/admin", "📊 Tableau de bord"],
    ["orders", "/admin/orders", "🧾 Commandes"],
    ["orders", "/admin/abandoned", "📵 Paniers abandonnés"],
    ["products", "/admin/products", "📦 Produits"],
    ["customers", "/admin/customers", "👥 Clients"],
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
    ["/admin/staff", "🧑‍💼 Équipe"],
  ];
  return (
    <div className="admin" dir="ltr">
      <aside>
        <Link href="/admin" className="brand">🛍️ {tenant.name}</Link>
        {nav.filter(([p]) => !p || can(p)).map(([, h, l]) => <Link key={h} href={h}>{l}</Link>)}
        {can("design") && <><div className="grp">Boutique</div>{design.map(([h, l]) => <Link key={h} href={h}>{l}</Link>)}</>}
        <div className="grp">Compte</div>
        <a href="/" target="_blank">↗ Voir la boutique</a>
        <form action={logout}><button className="btn ghost sm" style={{ color: "#cbd5e1", borderColor: "#334155", marginTop: 8, width: "100%" }}>Déconnexion ({user.email})</button></form>
      </aside>
      <main>{children}</main>
    </div>
  );
}
