"use client";
import { createContext, useContext } from "react";
import { makeT, type AdminLang } from "@/lib/admin-i18n";

const Ctx = createContext<AdminLang>("fr");
export function AdminLangProvider({ lang, children }: { lang: AdminLang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}
export function useAdminT() {
  return makeT(useContext(Ctx));
}
