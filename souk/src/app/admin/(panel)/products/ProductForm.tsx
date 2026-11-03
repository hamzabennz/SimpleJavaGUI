"use client";
import { useAdminT } from "@/components/AdminLang";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProduct, type ProductInputT } from "../../actions";
import type { FieldDef } from "@/lib/forms";
import { FieldInput } from "@/components/FieldInput";

type Props = { initial: ProductInputT; categories: { id: string; name: string }[]; attributeFields: FieldDef[]; allProducts?: { id: string; name: string; price: number }[] };

const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Cartesian product of option values → variant combinations */
function combos(options: ProductInputT["options"]): Record<string, string>[] {
  const opts = options.filter((o) => o.values.length && (o.name.fr || o.name.ar));
  return opts.reduce<Record<string, string>[]>((acc, o) => acc.flatMap((a) => o.values.map((v) => ({ ...a, [o.name.fr || o.name.ar]: v }))), opts.length ? [{}] : []);
}

export function ProductForm({ initial, categories, attributeFields, allProducts = [] }: Props) {
  const t = useAdminT();
  const router = useRouter();
  const [p, setP] = useState<ProductInputT>(initial);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof ProductInputT>(k: K, v: ProductInputT[K]) => { setP((s) => ({ ...s, [k]: v })); setOk(false); };

  function regenerateVariants(options: ProductInputT["options"]) {
    const next = combos(options).map((ov) => {
      const existing = p.variants.find((v) => JSON.stringify(v.optionValues) === JSON.stringify(ov));
      return existing ?? { optionValues: ov, sku: null, price: null, stock: 0 };
    });
    setP((s) => ({ ...s, options, variants: next }));
  }

  function submit() {
    setErr("");
    start(async () => {
      const r = await saveProduct(p);
      if ("error" in r && r.error) return setErr(r.error);
      setOk(true);
      if (!p.id && "id" in r) router.replace(`/admin/products/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(260px,1fr)", gap: 16 }}>
      <div className="stack">
        <div className="card stack">
          <div className="form-grid">
            <div className="field half"><label>{t("Nom (FR)")}</label><input value={p.name.fr} onChange={(e) => { set("name", { ...p.name, fr: e.target.value }); if (!initial.id) set("slug", slugify(e.target.value)); }} /></div>
            <div className="field half"><label>{t("الاسم (AR)")}</label><input dir="rtl" value={p.name.ar} onChange={(e) => set("name", { ...p.name, ar: e.target.value })} /></div>
            <div className="field half"><label>{t("Description (FR)")}</label><textarea rows={5} value={p.description.fr} onChange={(e) => set("description", { ...p.description, fr: e.target.value })} /></div>
            <div className="field half"><label>{t("الوصف (AR)")}</label><textarea dir="rtl" rows={5} value={p.description.ar} onChange={(e) => set("description", { ...p.description, ar: e.target.value })} /></div>
          </div>
        </div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>{t("Images")}</h3>
          <div className="row wrap">
            {p.images.map((src, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={src} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8 }} />
                <div className="row" style={{ gap: 2, position: "absolute", top: 2, insetInlineEnd: 2 }}>
                  {i > 0 && <button type="button" className="btn sm ghost" style={{ padding: "0 6px", background: "#fff" }} onClick={() => { const a = [...p.images]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set("images", a); }}>←</button>}
                  <button type="button" className="btn sm danger" style={{ padding: "0 6px" }} onClick={() => set("images", p.images.filter((_, j) => j !== i))}>✕</button>
                </div>
              </div>
            ))}
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); const u = new FormData(e.currentTarget).get("url") as string; if (u) { set("images", [...p.images, u]); e.currentTarget.reset(); } }}>
            <input name="url" type="url" placeholder="https://... (URL de l'image)" />
            <button className="btn sm ghost">{t("Ajouter")}</button>
          </form>
          <label className="btn sm outline" style={{ alignSelf: "start" }}>
            {uploading ? "Envoi..." : "⬆ Téléverser des images"}
            <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              if (!files.length) return;
              setUploading(true); setErr("");
              const fd = new FormData(); files.forEach((f) => fd.append("files", f));
              const r = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json()).catch(() => ({ error: "Erreur réseau" }));
              setUploading(false); e.target.value = "";
              if (r.error) setErr(r.error); else set("images", [...p.images, ...r.urls]);
            }} />
          </label>
        </div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>{t("Options & variantes")}</h3>
          <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>Ex : Taille = S, M, L · Couleur = Noir, Blanc. Les variantes sont générées automatiquement.</p>
          {p.options.map((o, i) => (
            <div key={i} className="row wrap">
              <input placeholder={t("Nom (FR)")} value={o.name.fr} style={{ maxWidth: 140 }} onChange={(e) => regenerateVariants(p.options.map((x, j) => (j === i ? { ...x, name: { ...x.name, fr: e.target.value } } : x)))} />
              <input placeholder="الاسم" dir="rtl" value={o.name.ar} style={{ maxWidth: 140 }} onChange={(e) => set("options", p.options.map((x, j) => (j === i ? { ...x, name: { ...x.name, ar: e.target.value } } : x)))} />
              <input placeholder={t("Valeurs séparées par des virgules")} defaultValue={o.values.join(", ")} style={{ flex: 1, minWidth: 200 }}
                onBlur={(e) => regenerateVariants(p.options.map((x, j) => (j === i ? { ...x, values: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) } : x)))} />
              <button type="button" className="btn sm ghost" onClick={() => regenerateVariants(p.options.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="btn sm ghost" style={{ alignSelf: "start" }} onClick={() => set("options", [...p.options, { name: { fr: "", ar: "" }, values: [] }])}>{t("+ Ajouter une option")}</button>
          {p.variants.length > 0 && (
            <table className="tbl">
              <thead><tr><th>{t("Variante")}</th><th>{t("SKU")}</th><th>Prix (vide = prix de base)</th><th>{t("Stock")}</th></tr></thead>
              <tbody>{p.variants.map((v, i) => {
                const upd = (patch: Partial<typeof v>) => set("variants", p.variants.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <tr key={i}>
                    <td><b>{Object.values(v.optionValues).join(" / ")}</b></td>
                    <td><input value={v.sku ?? ""} onChange={(e) => upd({ sku: e.target.value || null })} /></td>
                    <td><input type="number" value={v.price ?? ""} onChange={(e) => upd({ price: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                    <td><input type="number" value={v.stock} onChange={(e) => upd({ stock: Number(e.target.value) })} style={{ maxWidth: 90 }} /></td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
        </div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>{t("Offres de quantité")}</h3>
          <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>{t("Ex : 2 pièces à 7 000 DA au lieu de 7 800 DA. Affiché comme choix sur la page produit.")}</p>
          {p.offers.map((o, i) => {
            const upd = (patch: Partial<typeof o>) => set("offers", p.offers.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className="row wrap">
                <input type="number" min={2} value={o.qty} onChange={(e) => upd({ qty: Number(e.target.value) })} style={{ width: 80 }} title={t("Quantité")} />
                <span>{t("pièces pour")}</span>
                <input type="number" value={o.price} onChange={(e) => upd({ price: Number(e.target.value) })} style={{ width: 120 }} />
                <span>{t("DA")}</span>
                <input placeholder={t("Libellé FR (ex: Pack duo)")} value={o.label.fr} onChange={(e) => upd({ label: { ...o.label, fr: e.target.value } })} style={{ maxWidth: 170 }} />
                <input placeholder={t("التسمية AR")} dir="rtl" value={o.label.ar} onChange={(e) => upd({ label: { ...o.label, ar: e.target.value } })} style={{ maxWidth: 170 }} />
                <button type="button" className="btn sm ghost" onClick={() => set("offers", p.offers.filter((_, j) => j !== i))}>✕</button>
              </div>
            );
          })}
          <button type="button" className="btn sm ghost" style={{ alignSelf: "start" }} onClick={() => set("offers", [...p.offers, { qty: (p.offers.at(-1)?.qty ?? 1) + 1, price: p.price * ((p.offers.at(-1)?.qty ?? 1) + 1), label: { fr: "", ar: "" } }])}>{t("+ Ajouter une offre")}</button>
        </div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Upsell</h3>
          <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>{t("Proposez un 2e produit à prix spécial dans le formulaire de commande.")}</p>
          <div className="row wrap">
            <select value={p.upsell?.productId ?? ""} style={{ maxWidth: 260 }} onChange={(e) => {
              const o = allProducts.find((x) => x.id === e.target.value);
              set("upsell", o ? { productId: o.id, price: p.upsell?.price ?? Math.round(o.price * 0.7), label: p.upsell?.label ?? { fr: "", ar: "" } } : null);
            }}>
              <option value="">—</option>
              {allProducts.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            {p.upsell && <>
              <input type="number" value={p.upsell.price} onChange={(e) => set("upsell", { ...p.upsell!, price: Number(e.target.value) })} style={{ width: 120 }} />
              <span>DA</span>
              <input placeholder="Texte FR (ex: Ajoutez la housse à -30%)" value={p.upsell.label.fr} onChange={(e) => set("upsell", { ...p.upsell!, label: { ...p.upsell!.label, fr: e.target.value } })} style={{ maxWidth: 240 }} />
              <input placeholder="النص AR" dir="rtl" value={p.upsell.label.ar} onChange={(e) => set("upsell", { ...p.upsell!, label: { ...p.upsell!.label, ar: e.target.value } })} style={{ maxWidth: 200 }} />
            </>}
          </div>
        </div>
        {attributeFields.length > 0 && (
          <div className="card stack">
            <h3 style={{ margin: 0 }}>{t("Attributs personnalisés")}</h3>
            <div className="form-grid">
              {attributeFields.filter((f) => f.enabled).map((f) => (
                <FieldInput key={f.key} field={{ ...f, required: false }} lang="fr" value={String(p.attributes[f.key] ?? "")} onChange={(v) => set("attributes", { ...p.attributes, [f.key]: v })} chooseLabel="—" />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="stack">
        <div className="card stack">
          <div className="field"><label>{t("Statut")}</label>
            <select value={p.status} onChange={(e) => set("status", e.target.value as any)}><option value="active">{t("Actif (visible)")}</option><option value="draft">{t("Brouillon")}</option><option value="archived">{t("Archivé")}</option></select>
          </div>
          <div className="field"><label>{t("Prix (DA)")}</label><input type="number" value={p.price} onChange={(e) => set("price", Number(e.target.value))} /></div>
          <div className="field"><label>{t("Prix barré (DA)")}</label><input type="number" value={p.compareAt ?? ""} onChange={(e) => set("compareAt", e.target.value === "" ? null : Number(e.target.value))} /></div>
          <div className="field"><label>{t("Coût d'achat (DA)")}</label><input type="number" value={p.cost ?? ""} onChange={(e) => set("cost", e.target.value === "" ? null : Number(e.target.value))} /></div>
          <div className="field"><label>{t("Catégorie")}</label>
            <select value={p.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value || null)}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </div>
          <div className="field"><label>{t("Slug (URL)")}</label><input value={p.slug} onChange={(e) => set("slug", slugify(e.target.value))} dir="ltr" /></div>
          <label className="row" style={{ fontWeight: 500 }}><input type="checkbox" style={{ width: "auto" }} checked={p.trackStock} onChange={(e) => set("trackStock", e.target.checked)} /> {t("Suivre le stock")}</label>
          {p.trackStock && !p.variants.length && <div className="field"><label>{t("Stock")}</label><input type="number" value={p.stock} onChange={(e) => set("stock", Number(e.target.value))} /></div>}
          <label className="row" style={{ fontWeight: 500 }}><input type="checkbox" style={{ width: "auto" }} checked={p.freeShipping} onChange={(e) => set("freeShipping", e.target.checked)} /> {t("Livraison gratuite")}</label>
        </div>
        {err && <div className="alert">{err}</div>}
        {ok && <div className="alert ok">{t("Enregistré ✓")}</div>}
        <button className="btn lg" onClick={submit} disabled={pending}>{pending ? "..." : t("Enregistrer")}</button>
        {p.id && <a href={`/products/${p.slug}`} target="_blank" className="btn ghost">{t("Voir dans la boutique ↗")}</a>}
      </div>
    </div>
  );
}
