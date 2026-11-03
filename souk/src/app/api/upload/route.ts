import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import sharp from "sharp";
import { storage } from "@/lib/storage";

const ALLOWED: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
const MAX = 15 * 1024 * 1024; // raw upload; stored file is compressed

export async function POST(req: Request) {
  const { tenant } = await requireAdmin("products");
  const fd = await req.formData();
  const urls: string[] = [];
  for (const f of fd.getAll("files")) {
    if (!(f instanceof File)) continue;
    const ext = ALLOWED[f.type];
    if (!ext) return NextResponse.json({ error: `Type non supporté: ${f.type}` }, { status: 400 });
    if (f.size > MAX) return NextResponse.json({ error: "Image trop lourde (max 15 Mo)" }, { status: 400 });
    const raw = Buffer.from(await f.arrayBuffer());
    if (ext === "gif") { urls.push(await storage.put(tenant.id, raw, ext, f.type)); continue; }
    // Phone photos are often 3-8 MB: auto-rotate, cap at 1600px, convert to WebP (~10x lighter on 4G)
    try {
      const webp = await sharp(raw).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      urls.push(await storage.put(tenant.id, webp, "webp", "image/webp"));
    } catch {
      return NextResponse.json({ error: "Image illisible" }, { status: 400 });
    }
  }
  return NextResponse.json({ urls });
}
