import "./globals.css";
import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant";
import { getLang } from "@/lib/i18n";
import { themeToCss, googleFontsHref } from "@/lib/theme";
import { SettingsSchema } from "@/lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTenant();
  return { title: t?.name ?? "Souk", description: (t?.config.store.tagline as any)?.fr };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();
  const theme = tenant?.config.theme ?? SettingsSchema.parse({}).theme;
  const lang = tenant ? await getLang(tenant) : "fr";
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={googleFontsHref(theme)} />
        <style dangerouslySetInnerHTML={{ __html: themeToCss(theme) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
