import { NextResponse } from "next/server";
import { communes } from "@/lib/algeria";

export function GET(req: Request) {
  const w = new URL(req.url).searchParams.get("w") ?? "";
  return NextResponse.json(communes[String(Number(w))] ?? [], { headers: { "cache-control": "public, max-age=86400" } });
}
