export function dzd(n: number, locale: "ar" | "fr" = "fr") {
  const s = new Intl.NumberFormat("fr-DZ").format(n).replace(/ | /g, " ");
  return locale === "ar" ? `${s} د.ج` : `${s} DA`;
}
