import { describe, it, expect } from "vitest";
import { buildValidator, normalizePhone, DZ_PHONE } from "../src/lib/forms";
import { SettingsSchema, mergeSettings, defaultCheckoutFields } from "../src/lib/settings";
import { offerUnitPrice } from "../src/lib/orders";
import { themeToCss } from "../src/lib/theme";

describe("phone", () => {
  it("normalizes +213 and spaces", () => {
    expect(normalizePhone("+213 661 22 33 44")).toBe("0661223344");
    expect(normalizePhone("00213-551.22.33.44")).toBe("0551223344");
  });
  it("validates algerian numbers", () => {
    for (const ok of ["0551223344", "0661223344", "0771223344", "021223344"]) expect(DZ_PHONE.test(ok)).toBe(true);
    for (const bad of ["0451223344", "055122334", "123", "08812233445"]) expect(DZ_PHONE.test(bad)).toBe(false);
  });
});

describe("schema-driven checkout validator", () => {
  const v = buildValidator(defaultCheckoutFields);
  it("accepts a complete form and normalizes phone", () => {
    const r = v.safeParse({ name: "Amine", phone: "+213661223344", wilaya: "16", commune: "Alger Centre", delivery_type: "desk" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.phone).toBe("0661223344");
    expect(r.success && r.data.wilaya).toBe(16);
  });
  it("reports required + invalid fields", () => {
    const r = v.safeParse({ name: "", phone: "12", wilaya: "99", delivery_type: "home" });
    expect(r.success).toBe(false);
    const keys = !r.success ? r.error.issues.map((i) => i.path[0]) : [];
    expect(keys).toEqual(expect.arrayContaining(["name", "phone", "wilaya", "commune"]));
  });
  it("ignores disabled fields and validates custom select options", () => {
    const v2 = buildValidator([
      { key: "phone", type: "phone", label: { ar: "", fr: "" }, required: true, enabled: true, width: "full" },
      { key: "notes", type: "textarea", label: { ar: "", fr: "" }, required: true, enabled: false, width: "full" },
      { key: "size", type: "select", label: { ar: "", fr: "" }, required: true, enabled: true, width: "full", options: [{ value: "42", label: { ar: "42", fr: "42" } }] },
    ]);
    expect(v2.safeParse({ phone: "0551223344", size: "42" }).success).toBe(true);
    expect(v2.safeParse({ phone: "0551223344", size: "43" }).success).toBe(false);
  });
});

describe("settings", () => {
  it("fills defaults for an empty tenant", () => {
    const s = SettingsSchema.parse({});
    expect(s.theme.colors.primary).toMatch(/^#/);
    expect(s.checkout.fields.length).toBeGreaterThan(3);
    expect(s.orderFlow).toBe("both");
  });
  it("deep merges patches without losing other keys", () => {
    const s = mergeSettings(SettingsSchema.parse({}), { theme: { colors: { primary: "#ff0000" } } });
    expect(s.theme.colors.primary).toBe("#ff0000");
    expect(s.theme.colors.accent).toBeDefined();
  });
  it("compiles theme to css variables", () => {
    expect(themeToCss(SettingsSchema.parse({}).theme)).toContain("--c-primary:");
  });
});

describe("quantity offers", () => {
  const extra = { offers: [{ qty: 2, price: 7000 }, { qty: 3, price: 9900 }] };
  it("applies only on exact qty", () => {
    expect(offerUnitPrice(extra, 2)).toBe(3500);
    expect(offerUnitPrice(extra, 3)).toBe(3300);
    expect(offerUnitPrice(extra, 4)).toBeNull();
    expect(offerUnitPrice({}, 2)).toBeNull();
  });
});

describe("theme sanitization", () => {
  it("rejects CSS/HTML injection in colors and fonts", () => {
    const s = SettingsSchema.parse({ theme: { colors: { primary: "red}</style><script>alert(1)</script>" }, fontAr: "x\"></style>" } });
    expect(s.theme.colors.primary).toBe("#0f766e");
    expect(s.theme.fontAr).toBe("Cairo");
    expect(themeToCss(s.theme)).not.toContain("<");
  });
});

describe("secrets", () => {
  it("round-trips with AES-GCM and masks", async () => {
    process.env.SECRETS_KEY = "test-key-0123456789-abcdefghijklmnop";
    const { encryptSecret, decryptSecret, keepOrEncrypt, MASK } = await import("../src/lib/secrets");
    const e = encryptSecret("tok_123")!;
    expect(e.startsWith("enc:v1:")).toBe(true);
    expect(e).not.toContain("tok_123");
    expect(decryptSecret(e)).toBe("tok_123");
    expect(keepOrEncrypt(MASK, e)).toBe(e);
    expect(keepOrEncrypt("", e)).toBeUndefined();
  });
});
