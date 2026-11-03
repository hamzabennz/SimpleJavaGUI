import { cookies } from "next/headers";
import { makeT, type AdminLang } from "./admin-i18n";

export async function getAdminLang(): Promise<AdminLang> {
  return (await cookies()).get("admin_lang")?.value === "ar" ? "ar" : "fr";
}
export async function adminT() {
  const lang = await getAdminLang();
  return { lang, t: makeT(lang) };
}
