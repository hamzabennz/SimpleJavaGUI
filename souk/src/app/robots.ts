import type { MetadataRoute } from "next";
import { headers } from "next/headers";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/platform", "/api", "/thank-you", "/cart"] }], sitemap: `https://${h.get("host")}/sitemap.xml` };
}
