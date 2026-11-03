"use client";
import type { FieldDef } from "@/lib/forms";

type Props = {
  field: FieldDef;
  lang: "ar" | "fr";
  value?: string;
  error?: string;
  onChange?: (v: string) => void;
  /** options for wilaya/commune or overrides */
  options?: { value: string; label: string }[];
  chooseLabel?: string;
};

/** Renders any FieldDef. Used by checkout, product attributes and admin section editors. */
export function FieldInput({ field, lang, value, error, onChange, options, chooseLabel = "..." }: Props) {
  const label = field.label[lang] || field.label.ar || field.label.fr;
  const ph = field.placeholder?.[lang];
  const common = {
    name: field.key, id: `f_${field.key}`, required: field.required,
    ...(onChange ? { value: value ?? "", onChange: (e: any) => onChange(e.target.value) } : { defaultValue: value }),
  };
  const opts = options ?? (field.options ?? []).map((o) => ({ value: o.value, label: o.label[lang] || o.label.fr }));
  let input: React.ReactNode;
  switch (field.type) {
    case "textarea":
      input = <textarea rows={3} placeholder={ph} {...common} />;
      break;
    case "select": case "wilaya": case "commune":
      input = (
        <select {...common}>
          <option value="">{chooseLabel}</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    case "radio":
      input = (
        <div className="opts">
          {opts.map((o) => (
            <label key={o.value} className="row" style={{ fontWeight: 500 }}>
              <input type="radio" name={field.key} value={o.value} style={{ width: "auto" }}
                {...(onChange ? { checked: value === o.value, onChange: () => onChange(o.value) } : { defaultChecked: value === o.value })} /> {o.label}
            </label>
          ))}
        </div>
      );
      break;
    case "checkbox":
      return (
        <div className={`field ${field.width}`}>
          <label className="row" style={{ fontWeight: 500 }}>
            <input type="checkbox" name={field.key} style={{ width: "auto" }}
              {...(onChange ? { checked: value === "true", onChange: (e) => onChange(String(e.target.checked)) } : { defaultChecked: value === "true" })} />
            {label}
          </label>
          {error && <span className="err">{error}</span>}
        </div>
      );
    default:
      input = (
        <input
          type={field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "date" ? "date" : "text"}
          inputMode={field.type === "phone" ? "tel" : undefined}
          dir={field.type === "phone" ? "ltr" : undefined}
          placeholder={ph} min={field.min} max={field.max} {...common}
        />
      );
  }
  return (
    <div className={`field ${field.width}`}>
      <label htmlFor={`f_${field.key}`}>{label}{field.required && <span style={{ color: "var(--c-danger)" }}> *</span>}</label>
      {input}
      {error && <span className="err">{error}</span>}
    </div>
  );
}
