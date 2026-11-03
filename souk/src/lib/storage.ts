import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * File storage adapter. "local" writes to UPLOAD_DIR and serves files via /uploads/*.
 * For production, add an S3/R2 driver implementing the same `put` signature and
 * select it with STORAGE_DRIVER=s3.
 */
export interface Storage {
  put(tenantId: string, data: Buffer, ext: string, contentType: string): Promise<string>;
}

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

const local: Storage = {
  async put(tenantId, data, ext) {
    const name = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
    const dir = path.join(UPLOAD_DIR, tenantId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), data);
    return `/uploads/${tenantId}/${name}`;
  },
};

export const storage: Storage = local;

export async function readLocal(parts: string[]) {
  const safe = parts.filter((p) => /^[a-zA-Z0-9._-]+$/.test(p) && p !== "..");
  if (safe.length !== parts.length) return null;
  try { return await fs.readFile(path.join(UPLOAD_DIR, ...safe)); } catch { return null; }
}
