"use client";
import { useActionState } from "react";
import { importProducts } from "../../actions";
import { useAdminT } from "@/components/AdminLang";

const TEMPLATE = "name_fr,name_ar,price,compare_at,cost,stock,category,image_urls,description_fr,description_ar\nT-shirt coton,قميص قطني,2500,3000,1200,20,Homme,https://exemple.com/a.jpg|https://exemple.com/b.jpg,Coton 100%,قطن 100%\n";

export function ImportCsv() {
  const t = useAdminT();
  const [state, action, pending] = useActionState(importProducts, null);
  return (
    <form action={action} className="card row wrap">
      <b>{t("Importer des produits (CSV)")}</b>
      <input type="file" name="file" accept=".csv,text/csv" required style={{ maxWidth: 280 }} />
      <button className="btn sm" disabled={pending}>{pending ? "..." : t("Importer")}</button>
      <a className="muted" style={{ fontSize: ".85rem" }} download="modele-produits.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}>{t("Télécharger le modèle")}</a>
      {state && "error" in state && state.error && <div className="alert">{state.error}</div>}
      {state && "message" in state && <div className="alert ok">{state.message}</div>}
    </form>
  );
}
