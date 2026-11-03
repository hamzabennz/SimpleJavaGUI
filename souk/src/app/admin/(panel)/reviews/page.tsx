import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { adminT } from "@/lib/admin-lang";
import { tr } from "@/lib/i18n";
import { moderateReview } from "../../actions";

export default async function Reviews({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { tenant } = await requireAdmin("products");
  const { t, lang } = await adminT();
  const all = !!(await searchParams).all;
  const reviews = await db.review.findMany({ where: { tenantId: tenant.id, ...(all ? {} : { approved: false }) }, include: { product: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <h1>{t("Avis clients")}</h1>
      <div className="tabs"><a href="?" className={!all ? "on" : ""}>{t("En attente")}</a><a href="?all=1" className={all ? "on" : ""}>{t("Tous")}</a></div>
      <div className="stack">
        {reviews.map((r) => (
          <div key={r.id} className="card row wrap" style={{ alignItems: "start" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div><b>{r.name}</b> <span style={{ color: "#f59e0b" }}>{"★".repeat(r.rating)}</span> {r.verified && <span className="badge" style={{ background: "#16a34a" }}>✓</span>} {r.approved && <span className="badge" style={{ background: "#0ea5e9" }}>{t("Publié")}</span>}</div>
              <div className="muted" style={{ fontSize: ".85rem" }}>{tr(r.product.name, lang)} · {r.createdAt.toLocaleDateString("fr-DZ")} {r.phone && <span dir="ltr">· {r.phone}</span>}</div>
              <p style={{ margin: "6px 0 0" }}>{r.body}</p>
            </div>
            <div className="row">
              {!r.approved && <form action={moderateReview.bind(null, r.id, "approve")}><button className="btn sm">{t("Publier")}</button></form>}
              {r.approved && <form action={moderateReview.bind(null, r.id, "hide")}><button className="btn sm ghost">{t("Masquer")}</button></form>}
              <form action={moderateReview.bind(null, r.id, "delete")}><button className="btn sm ghost">🗑</button></form>
            </div>
          </div>
        ))}
        {!reviews.length && <div className="card muted" style={{ textAlign: "center" }}>{t("Rien pour l'instant 🎉")}</div>}
      </div>
    </>
  );
}
