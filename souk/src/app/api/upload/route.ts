import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { storage } from "@/lib/storage";

const ALLOWED: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
const MAX = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const { tenant } = await requireAdmin("products");
  const fd = await req.formData();
  const urls: string[] = [];
  for (const f of fd.getAll("files")) {
    if (!(f instanceof File)) continue;
    const ext = ALLOWED[f.type];
    if (!ext) return NextResponse.json({ error: `Type non supporté: ${f.type}` }, { status: 400 });
    if (f.size > MAX) return NextResponse.json({ error: "Image trop lourde (max 5 Mo)" }, { status: 400 });
    urls.push(await storage.put(tenant.id, Buffer.from(await f.arrayBuffer()), ext, f.type));
  }
  return NextResponse.json({ urls });
}
