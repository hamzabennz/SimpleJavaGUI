import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { getDict, getLang, tr } from "@/lib/i18n";
import { dzd } from "@/lib/money";

export default async function ThankYou({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ p?: string }> }) {
  const tenant = await requireTenant();
  const lang = await getLang(tenant);
  const t = getDict(lang);
  const { number } = await params;
  const { p } = await searchParams;
  const order = await db.order.findUnique({ where: { tenantId_number: { tenantId: tenant.id, number: Number(number) || 0 } }, include: { items: true } });
  if (!order || order.phone !== p) notFound();
  return (
    <div className="container section" style={{ maxWidth: 640 }}>
      <div className="card stack" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <h1 style={{ margin: 0 }}>{t.order_received}</h1>
        <p>{tr(tenant.config.checkout.successMessage, lang)}</p>
        <p>{t.order_number}: <b>#{order.number}</b></p>
        <div className="summary" style={{ textAlign: "start" }}>
          {order.items.map((i) => <div key={i.id} className="line"><span>{i.name}{i.variant ? ` (${i.variant})` : ""} × {i.qty}</span><span>{dzd(i.unitPrice * i.qty, lang)}</span></div>)}
          {order.discount > 0 && <div className="line"><span>{t.discount}</span><span>-{dzd(order.discount, lang)}</span></div>}
          <div className="line"><span>{t.delivery}</span><span>{order.deliveryFee ? dzd(order.deliveryFee, lang) : t.free}</span></div>
          <div className="line total"><span>{t.total}</span><span>{dzd(order.total, lang)}</span></div>
        </div>
        <Link href="/" className="btn">{t.continue_shopping}</Link>
      </div>
    </div>
  );
}
