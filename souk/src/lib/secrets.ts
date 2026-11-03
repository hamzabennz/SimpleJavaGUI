import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for tenant integration secrets (carrier keys, tokens).
 * Values are stored as "enc:v1:<iv>:<tag>:<ciphertext>" (base64url). Key: SECRETS_KEY (32+ chars).
 * Without SECRETS_KEY (dev), values are stored as-is.
 */
const PREFIX = "enc:v1:";
function key() {
  const k = process.env.SECRETS_KEY;
  return k ? crypto.createHash("sha256").update(k).digest() : null;
}
export function encryptSecret(plain: string | undefined): string | undefined {
  if (!plain || plain.startsWith(PREFIX)) return plain;
  const k = key();
  if (!k) return plain;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(":");
}
export function decryptSecret(v: string | undefined): string | undefined {
  if (!v || !v.startsWith(PREFIX)) return v;
  const k = key();
  if (!k) return undefined;
  try {
    const [iv, tag, enc] = v.slice(PREFIX.length).split(":").map((x) => Buffer.from(x, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}
export const MASK = "••••••••";
/** For admin forms: never send secrets back to the browser. */
export const mask = (v?: string) => (v ? MASK : "");
/** Keep the stored value when the form sends back the mask. */
export const keepOrEncrypt = (incoming: string | undefined, stored: string | undefined) =>
  incoming === MASK ? stored : incoming ? encryptSecret(incoming) : undefined;
