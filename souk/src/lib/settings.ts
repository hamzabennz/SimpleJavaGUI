/**
 * Tenant settings: everything a merchant can customise without code.
 * Stored in Tenant.settings (JSON) and always parsed through this schema,
 * so missing keys fall back to defaults and old tenants keep working.
 */
import { z } from "zod";
import { FieldDefSchema, LocalizedSchema, type FieldDef } from "./forms";

const color = (d: string) => z.string().regex(/^#[0-9a-fA-F]{3,8}$/).catch(d).default(d);
const font = (d: string) => z.string().regex(/^[A-Za-z0-9 ]{2,40}$/).catch(d).default(d);

export const ThemeSchema = z.object({
  preset: z.string().default("classic"),
  colors: z.object({
    primary: color("#0f766e"),
    primaryText: color("#ffffff"),
    accent: color("#f59e0b"),
    background: color("#f8fafc"),
    surface: color("#ffffff"),
    text: color("#0f172a"),
    muted: color("#64748b"),
    border: color("#e2e8f0"),
    danger: color("#dc2626"),
    success: color("#16a34a"),
  }).default({}),
  radius: z.number().min(0).max(32).default(12),
  fontAr: font("Cairo"),
  fontLatin: font("Inter"),
  buttonStyle: z.enum(["solid", "outline", "pill"]).default("solid"),
  productCard: z.enum(["simple", "bordered", "overlay"]).default("bordered"),
  gridColumns: z.number().int().min(2).max(5).default(4),
}).default({});

export const SectionSchema = z.object({
  id: z.string(),
  type: z.string(),
  enabled: z.boolean().default(true),
  props: z.record(z.any()).default({}),
});
export type Section = z.infer<typeof SectionSchema>;

export const defaultCheckoutFields: FieldDef[] = [
  { key: "name", type: "text", label: { ar: "الاسم الكامل", fr: "Nom complet" }, required: true, enabled: true, width: "full" },
  { key: "phone", type: "phone", label: { ar: "رقم الهاتف", fr: "Téléphone" }, placeholder: { ar: "05xxxxxxxx", fr: "05xxxxxxxx" }, required: true, enabled: true, width: "full" },
  { key: "wilaya", type: "wilaya", label: { ar: "الولاية", fr: "Wilaya" }, required: true, enabled: true, width: "half" },
  { key: "commune", type: "commune", label: { ar: "البلدية", fr: "Commune" }, required: true, enabled: true, width: "half" },
  { key: "address", type: "text", label: { ar: "العنوان", fr: "Adresse" }, required: false, enabled: true, width: "full" },
  { key: "delivery_type", type: "delivery_type", label: { ar: "نوع التوصيل", fr: "Type de livraison" }, required: true, enabled: true, width: "full" },
  { key: "notes", type: "textarea", label: { ar: "ملاحظات", fr: "Remarques" }, required: false, enabled: false, width: "full" },
];

export const SettingsSchema = z.object({
  store: z.object({
    tagline: LocalizedSchema.default({ ar: "", fr: "" }),
    logo: z.string().optional(),
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    email: z.string().optional(),
    facebook: z.string().optional(),
    instagram: z.string().optional(),
    tiktok: z.string().optional(),
    announcement: LocalizedSchema.optional(),
  }).default({}),
  locale: z.object({
    default: z.enum(["ar", "fr"]).default("ar"),
    enabled: z.array(z.enum(["ar", "fr"])).default(["ar", "fr"]),
  }).default({}),
  theme: ThemeSchema,
  /** Order flow: landing = order form on product page (no cart), cart = classic, both = form + add-to-cart */
  orderFlow: z.enum(["landing", "cart", "both"]).default("both"),
  checkout: z.object({
    fields: z.array(FieldDefSchema).default(defaultCheckoutFields),
    deskEnabled: z.boolean().default(true),
    freeShippingOver: z.number().int().nullable().default(null),
    successMessage: LocalizedSchema.default({ ar: "شكراً! سنتصل بك قريباً لتأكيد طلبك.", fr: "Merci ! Nous vous appellerons bientôt pour confirmer votre commande." }),
    duplicateWindowHours: z.number().default(24),
  }).default({}),
  /** Merchant-defined extra product attributes (e.g. Material, Warranty) */
  productAttributes: z.array(FieldDefSchema).default([]),
  orderStatuses: z.array(z.object({ key: z.string(), label: LocalizedSchema, color: z.string() })).default([
    { key: "new", label: { ar: "جديد", fr: "Nouvelle" }, color: "#2563eb" },
    { key: "no_answer", label: { ar: "لا يرد", fr: "Pas de réponse" }, color: "#f59e0b" },
    { key: "postponed", label: { ar: "مؤجل", fr: "Reportée" }, color: "#a855f7" },
    { key: "confirmed", label: { ar: "مؤكد", fr: "Confirmée" }, color: "#0d9488" },
    { key: "cancelled", label: { ar: "ملغى", fr: "Annulée" }, color: "#6b7280" },
    { key: "shipped", label: { ar: "تم الشحن", fr: "Expédiée" }, color: "#0ea5e9" },
    { key: "delivered", label: { ar: "تم التسليم", fr: "Livrée" }, color: "#16a34a" },
    { key: "returned", label: { ar: "مرتجع", fr: "Retournée" }, color: "#dc2626" },
  ]),
  tracking: z.object({
    metaPixelId: z.string().optional(),
    tiktokPixelId: z.string().optional(),
    gaId: z.string().optional(),
    /** Server-side events (Meta Conversions API / TikTok Events API) */
    metaAccessToken: z.string().optional(),
    tiktokAccessToken: z.string().optional(),
  }).default({}),
  /** Carrier credentials keyed by adapter id. TODO: encrypt at rest (KMS) before production. */
  integrations: z.object({
    defaultCarrier: z.string().default("manual"),
    carriers: z.record(z.record(z.string())).default({}),
  }).default({}),
  footer: z.object({ text: LocalizedSchema.optional() }).default({}),
  notifications: z.object({
    telegram: z.object({ botToken: z.string().optional(), chatId: z.string().optional() }).default({}),
  }).default({}),
});
export type Settings = z.infer<typeof SettingsSchema>;

export function parseSettings(raw: unknown): Settings {
  const r = SettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : SettingsSchema.parse({});
}

/** Deep-merge a partial patch into settings and re-validate. */
export function mergeSettings(current: Settings, patch: Record<string, unknown>): Settings {
  const merge = (a: any, b: any): any => {
    if (Array.isArray(b) || typeof b !== "object" || b === null) return b;
    const out = { ...(a ?? {}) };
    for (const k of Object.keys(b)) out[k] = merge(out[k], b[k]);
    return out;
  };
  return SettingsSchema.parse(merge(current, patch));
}
