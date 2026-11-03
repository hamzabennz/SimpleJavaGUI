import { requireAdmin } from "@/lib/auth";
import { adminT } from "@/lib/admin-lang";
import { SettingsForm } from "./SettingsForm";
import { saveWhatsappTemplate } from "../../actions";

export default async function SettingsPage() {
  const { tenant } = await requireAdmin("design");
  const { t } = await adminT();
  return (
    <>
      <h1>{t("Paramètres")}</h1>
      <SettingsForm initial={tenant.config} />
      <form action={saveWhatsappTemplate} className="card stack" style={{ maxWidth: 860, marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>💬 {t("Message de confirmation WhatsApp")}</h3>
        <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>{"{name} {number} {products} {total} {wilaya} {store}"}</p>
        <textarea name="tpl" rows={7} defaultValue={tenant.config.checkout.whatsappTemplate} dir="auto" />
        <button className="btn sm" style={{ alignSelf: "start" }}>{t("Enregistrer")}</button>
      </form>
    </>
  );
}
