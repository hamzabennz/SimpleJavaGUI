/**
 * Schema-driven form engine shared by the storefront and the admin.
 * A form is an ordered list of FieldDef. Merchants edit these from the admin
 * (toggle, reorder, relabel, required, add custom fields).
 */
import { z } from "zod";

export const fieldTypes = [
  "text", "textarea", "phone", "email", "number", "select", "radio", "checkbox", "date",
  // built-in specialised widgets
  "wilaya", "commune", "delivery_type",
  // admin-only: URL + upload button
  "image",
] as const;
export type FieldType = (typeof fieldTypes)[number];

export const LocalizedSchema = z.object({ ar: z.string().default(""), fr: z.string().default(""), en: z.string().optional() });
export type Localized = z.infer<typeof LocalizedSchema>;

export const FieldDefSchema = z.object({
  /** Stable key. Built-in keys map to Order columns, anything else goes to order.customFields */
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  type: z.enum(fieldTypes),
  label: LocalizedSchema,
  placeholder: LocalizedSchema.partial().optional(),
  required: z.boolean().default(false),
  enabled: z.boolean().default(true),
  /** grid width on desktop: full or half row */
  width: z.enum(["full", "half"]).default("full"),
  options: z.array(z.object({ value: z.string(), label: LocalizedSchema })).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
});
export type FieldDef = z.infer<typeof FieldDefSchema>;

export const BUILTIN_ORDER_KEYS = ["name", "phone", "wilaya", "commune", "address", "delivery_type"] as const;

/** Algerian mobile/landline: 05/06/07 + 8 digits, or 0 + 8 digits; +213 accepted */
export const DZ_PHONE = /^(?:\+213|00213|0)(?:[567]\d{8}|[2-4]\d{7})$/;
export function normalizePhone(p: string) {
  const s = p.replace(/[\s.-]/g, "");
  if (s.startsWith("+213")) return "0" + s.slice(4);
  if (s.startsWith("00213")) return "0" + s.slice(5);
  return s;
}

/** Build a zod validator from a list of field defs (server-side source of truth). */
export function buildValidator(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (!f.enabled) continue;
    let s: z.ZodTypeAny;
    switch (f.type) {
      case "phone":
        s = z.string().transform(normalizePhone).refine((v) => DZ_PHONE.test(v), "invalid_phone");
        break;
      case "email":
        s = z.string().email("invalid_email");
        break;
      case "image":
        s = z.string().refine((v) => /^(https?:\/\/|\/uploads\/)/.test(v), "invalid_format");
        break;
      case "number":
      case "wilaya": {
        let n = z.coerce.number();
        if (f.type === "wilaya") n = n.int().min(1).max(58);
        if (f.min !== undefined) n = n.min(f.min);
        if (f.max !== undefined) n = n.max(f.max);
        s = n;
        break;
      }
      case "checkbox":
        s = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
        if (f.required) s = s.refine((v) => v === true, "required");
        break;
      case "delivery_type":
        s = z.enum(["home", "desk"]);
        break;
      case "select":
      case "radio": {
        const values = (f.options ?? []).map((o) => o.value);
        s = z.string().refine((v) => values.includes(v), "invalid_option");
        break;
      }
      default: {
        let t = z.string().trim();
        if (f.pattern) t = t.regex(new RegExp(f.pattern), "invalid_format");
        if (f.max !== undefined) t = t.max(f.max);
        s = t;
      }
    }
    if (f.type !== "checkbox") {
      if (f.required) {
        s = z.preprocess((v) => (v === "" || v === null ? undefined : v), s);
      } else {
        s = z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());
      }
    }
    shape[f.key] = s;
  }
  return z.object(shape);
}
