import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dzd } from "@/lib/money";
import { tr } from "@/lib/i18n";
import { saveCategory } from "../../actions";

export default async function Products({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { tenant } = await requireAdmin("products");
  const q = (await searchParams).q?.trim();
  const [products, cats] = await Promise.all([
    db.product.findMany({ where: { tenantId: tenant.id, ...(q ? { slug: { contains: q, mode: "insensitive" } } : {}) }, include: { variants: true, category: true, _count: { select: { orderItems: true } } }, orderBy: { createdAt: "desc" } }),
    db.category.findMany({ where: { tenantId: tenant.id }, orderBy: { position: "asc" } }),
  ]);
  const statusColor: Record<string, string> = { active: "#16a34a", draft: "#64748b", archived: "#a3a3a3" };
  return (
    <>
      <div className="row between wrap">
        <h1>Produits</h1>
        <Link href="/admin/products/new" className="btn">+ Nouveau produit</Link>
      </div>
      <form className="row" style={{ marginBottom: 12 }}><input name="q" defaultValue={q} placeholder="Rechercher (slug)" style={{ maxWidth: 300 }} /><button className="btn sm">OK</button></form>
      <div className="card table-wrap" style={{ padding: 0 }}>
        <table className="tbl">
          <thead><tr><th></th><th>Produit</th><th>Catégorie</th><th>Prix</th><th>Stock</th><th>Ventes</th><th>Statut</th></tr></thead>
          <tbody>{products.map((p) => {
            const stock = p.trackStock ? (p.variants.length ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock) : null;
            return (
              <tr key={p.id}>
                <td>{p.images[0] && <img src={p.images[0]} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6 }} />}</td>
                <td><Link href={`/admin/products/${p.id}`}><b>{tr(p.name, "fr")}</b></Link><div className="muted" style={{ fontSize: ".8rem" }}>{tr(p.name, "ar")}</div></td>
                <td>{p.category ? tr(p.category.name, "fr") : "—"}</td>
                <td>{dzd(p.price)}</td>
                <td>{stock === null ? "∞" : <b style={{ color: stock < 5 ? "var(--c-danger)" : undefined }}>{stock}</b>}</td>
                <td>{p._count.orderItems}</td>
                <td><span className="badge" style={{ background: statusColor[p.status] }}>{p.status}</span></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <h3>Catégories</h3>
      <div className="row wrap" style={{ marginBottom: 12 }}>{cats.map((c) => <span key={c.id} className="btn ghost sm">{tr(c.name, "fr")} · {tr(c.name, "ar")}</span>)}</div>
      <form action={saveCategory} className="row wrap card">
        <input name="fr" placeholder="Nom (FR)" style={{ maxWidth: 200 }} />
        <input name="ar" placeholder="الاسم (AR)" dir="rtl" style={{ maxWidth: 200 }} />
        <button className="btn sm">+ Ajouter une catégorie</button>
      </form>
    </>
  );
}
