import { NextResponse, type NextRequest } from "next/server";

/** Dev/preview helpers: ?store=<slug> and ?lang=ar|fr are persisted as cookies. */
export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const store = url.searchParams.get("store");
  const lang = url.searchParams.get("lang");
  const alang = url.searchParams.get("alang");
  if (!store && !lang && !alang) return NextResponse.next();
  url.searchParams.delete("alang");
  url.searchParams.delete("store");
  url.searchParams.delete("lang");
  const res = NextResponse.redirect(url);
  const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
  if (store) res.cookies.set("store", store, opts);
  if (lang === "ar" || lang === "fr") res.cookies.set("lang", lang, opts);
  if (alang === "ar" || alang === "fr") res.cookies.set("admin_lang", alang, opts);
  return res;
}

export const config = { matcher: ["/((?!_next|api|favicon.ico).*)"] };
