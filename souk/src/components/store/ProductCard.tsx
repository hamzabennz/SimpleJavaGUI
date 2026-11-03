import Link from "next/link";
import { dzd } from "@/lib/money";
import { tr, type Lang } from "@/lib/i18n";

type P = { slug: string; name: unknown; price: number; compareAt: number | null; images: string[] };

export function ProductCard({ p, lang, style }: { p: P; lang: Lang; style: string }) {
  const off = p.compareAt && p.compareAt > p.price ? Math.round(100 - (p.price / p.compareAt) * 100) : 0;
  return (
    <Link href={`/products/${p.slug}`} className={`pcard ${style}`} style={{ position: "relative" }}>
      {p.images[0] ? <img className="img" src={p.images[0]} alt={tr(p.name, lang)} width={400} height={400} loading="lazy" decoding="async" /> : <div className="img" />}
      {off > 0 && <span className="sale-tag">-{off}%</span>}
      <div className="body">
        <div className="name">{tr(p.name, lang)}</div>
        <div className="row" style={{ gap: 8 }}>
          <span className="price">{dzd(p.price, lang)}</span>
          {off > 0 && <span className="compare">{dzd(p.compareAt!, lang)}</span>}
        </div>
      </div>
    </Link>
  );
}
