import data from "@/data/algeria.json";

export type Wilaya = { code: number; ar: string; fr: string };
export const wilayas: Wilaya[] = data.wilayas;
export const communes = data.communes as unknown as Record<string, [string, string][]>;

export function wilayaName(code: number, lang: "ar" | "fr" = "fr") {
  const w = wilayas.find((x) => x.code === code);
  return w ? `${String(code).padStart(2, "0")} - ${w[lang]}` : String(code);
}
