import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SettingsSchema } from "../src/lib/settings";

const db = new PrismaClient();
const img = (id: string) => `https://images.unsplash.com/${id}?w=800&q=70&auto=format&fit=crop`;

/** Rough delivery prices by zone: north/centre cheaper, south more expensive. */
function rate(code: number) {
  const centre = [16, 9, 35, 42, 10, 15, 2, 44, 26];
  const south = [1, 8, 11, 30, 32, 33, 37, 39, 47, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58];
  if (code === 16) return { home: 400, desk: 250 };
  if (centre.includes(code)) return { home: 600, desk: 400 };
  if (south.includes(code)) return { home: 1100, desk: 800 };
  return { home: 750, desk: 500 };
}

async function makeTenant(opts: { slug: string; name: string; settings: Record<string, unknown>; email: string; planId: string }) {
  await db.tenant.deleteMany({ where: { slug: opts.slug } });
  const tenant = await db.tenant.create({
    data: { slug: opts.slug, name: opts.name, planId: opts.planId, settings: SettingsSchema.parse(opts.settings) as any },
  });
  const user = await db.user.upsert({
    where: { email: opts.email },
    create: { email: opts.email, name: "Owner", passwordHash: await bcrypt.hash("admin123", 10) },
    update: {},
  });
  await db.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: "owner" } });
  await db.deliveryRate.createMany({
    data: Array.from({ length: 58 }, (_, i) => { const r = rate(i + 1); return { tenantId: tenant.id, wilayaCode: i + 1, homePrice: r.home, deskPrice: r.desk }; }),
  });
  return tenant;
}

async function main() {
  const plan = await db.plan.upsert({
    where: { name: "Starter" },
    create: { name: "Starter", priceDzd: 2900, limits: { products: 100, staff: 2, ordersPerMonth: 1000 }, features: { customDomain: false, pixels: true } },
    update: {},
  });
  await db.plan.upsert({
    where: { name: "Pro" },
    create: { name: "Pro", priceDzd: 6900, limits: { products: 5000, staff: 10, ordersPerMonth: 20000 }, features: { customDomain: true, pixels: true, removeBranding: true } },
    update: {},
  });

  // ---------- Tenant 1: fashion store, cart + landing ----------
  const demo = await makeTenant({
    slug: "demo", name: "Nour Boutique", email: "admin@demo.dz", planId: plan.id,
    settings: {
      store: { tagline: { ar: "أزياء عصرية بأسعار جزائرية", fr: "La mode à prix algérien" }, phone: "0550 12 34 56", whatsapp: "0550123456", facebook: "https://facebook.com", instagram: "https://instagram.com", announcement: { ar: "🚚 التوصيل إلى 58 ولاية · الدفع عند الاستلام", fr: "🚚 Livraison 58 wilayas · Paiement à la livraison" } },
      orderFlow: "both",
      checkout: { freeShippingOver: 15000 },
      productAttributes: [
        { key: "material", type: "text", label: { ar: "الخامة", fr: "Matière" }, required: false, enabled: true, width: "half" },
        { key: "origin", type: "select", label: { ar: "بلد الصنع", fr: "Origine" }, required: false, enabled: true, width: "half", options: [{ value: "DZ", label: { ar: "الجزائر", fr: "Algérie" } }, { value: "TR", label: { ar: "تركيا", fr: "Turquie" } }, { value: "CN", label: { ar: "الصين", fr: "Chine" } }] },
      ],
    },
  });
  const [femme, homme, acc] = await Promise.all([
    db.category.create({ data: { tenantId: demo.id, slug: "femme", name: { ar: "نساء", fr: "Femme" }, position: 1 } }),
    db.category.create({ data: { tenantId: demo.id, slug: "homme", name: { ar: "رجال", fr: "Homme" }, position: 2 } }),
    db.category.create({ data: { tenantId: demo.id, slug: "accessoires", name: { ar: "إكسسوارات", fr: "Accessoires" }, position: 3 } }),
  ]);
  const products = [
    { slug: "robe-kabyle-moderne", cat: femme.id, name: { ar: "فستان قبائلي عصري", fr: "Robe kabyle moderne" }, price: 6500, compareAt: 8500, images: [img("photo-1595777457583-95e059d581b8"), img("photo-1572804013309-59a88b7e92f1")], sizes: true, attributes: { material: "Coton", origin: "DZ" } },
    { slug: "veste-en-jean", cat: homme.id, name: { ar: "سترة جينز", fr: "Veste en jean" }, price: 4800, compareAt: null, images: [img("photo-1551537482-f2075a1d41f2")], sizes: true, attributes: { material: "Denim", origin: "TR" } },
    { slug: "sneakers-blanches", cat: homme.id, name: { ar: "حذاء رياضي أبيض", fr: "Sneakers blanches" }, price: 5900, compareAt: 7200, images: [img("photo-1549298916-b41d501d3772")], sizes: false },
    { slug: "sac-a-main-cuir", cat: acc.id, name: { ar: "حقيبة يد جلدية", fr: "Sac à main en cuir" }, price: 7900, compareAt: null, images: [img("photo-1584917865442-de89df76afd3")], sizes: false, freeShipping: true },
    { slug: "montre-classique", cat: acc.id, name: { ar: "ساعة كلاسيكية", fr: "Montre classique" }, price: 3500, compareAt: 4900, images: [img("photo-1524592094714-0f0654e20314")], sizes: false },
    { slug: "hijab-soie", cat: femme.id, name: { ar: "حجاب حريري", fr: "Hijab en soie" }, price: 1500, compareAt: 2000, images: [img("photo-1583846717393-dc2412c95ed7")], sizes: false },
    { slug: "lunettes-soleil", cat: acc.id, name: { ar: "نظارات شمسية", fr: "Lunettes de soleil" }, price: 2200, compareAt: null, images: [img("photo-1511499767150-a48a237f0083")], sizes: false },
    { slug: "chemise-lin", cat: homme.id, name: { ar: "قميص كتان", fr: "Chemise en lin" }, price: 3900, compareAt: 4500, images: [img("photo-1596755094514-f87e34085b2c")], sizes: true },
  ];
  for (const p of products) {
    await db.product.create({
      data: {
        tenantId: demo.id, slug: p.slug, categoryId: p.cat, name: p.name, price: p.price, compareAt: p.compareAt, cost: Math.round(p.price * 0.55),
        status: "active", images: p.images, attributes: (p as any).attributes ?? {}, extra: { freeShipping: !!(p as any).freeShipping },
        description: { ar: "منتج عالي الجودة. التوصيل لجميع الولايات والدفع عند الاستلام.", fr: "Produit de haute qualité. Livraison dans toutes les wilayas, paiement à la livraison." },
        options: p.sizes ? [{ name: { ar: "المقاس", fr: "Taille" }, values: ["S", "M", "L", "XL"] }] : [],
        trackStock: p.sizes, stock: 0,
        variants: p.sizes ? { create: ["S", "M", "L", "XL"].map((s) => ({ optionValues: { Taille: s }, stock: s === "XL" ? 0 : 10, sku: `${p.slug}-${s}`.toUpperCase() })) } : undefined,
      },
    });
  }
  await db.page.create({
    data: {
      tenantId: demo.id, slug: "home", isHome: true, title: { ar: "الرئيسية", fr: "Accueil" },
      sections: [
        { id: "s1", type: "hero", enabled: true, props: { title_ar: "تشكيلة الخريف وصلت 🍂", title_fr: "La collection automne est là 🍂", subtitle_ar: "توصيل سريع لجميع الولايات والدفع عند الاستلام", subtitle_fr: "Livraison rapide partout en Algérie, paiement à la livraison", cta_ar: "تسوق الآن", cta_fr: "Acheter maintenant", cta_link: "/products", image: img("photo-1441986300917-64674bd600d8"), align: "center" } },
        { id: "s2", type: "trust_badges", enabled: true, props: {} },
        { id: "s3", type: "categories", enabled: true, props: { title_ar: "تسوق حسب القسم", title_fr: "Acheter par catégorie" } },
        { id: "s4", type: "product_grid", enabled: true, props: { title_ar: "وصل حديثاً", title_fr: "Nouveautés", limit: 8 } },
        { id: "s6", type: "countdown", enabled: true, props: { title_ar: "⏰ العرض ينتهي قريباً", title_fr: "⏰ Offre limitée", hours: 24 } },
        { id: "s7", type: "testimonials", enabled: true, props: { title_ar: "آراء زبائننا", title_fr: "Ils nous font confiance", items: "Amina|Alger|Produit conforme et livraison rapide 👍\nYacine|Oran|Très bonne qualité, je recommande\nSara|Constantine|Service client au top" } },
        { id: "s5", type: "faq", enabled: true, props: { title_ar: "أسئلة شائعة", title_fr: "Questions fréquentes", items_ar: "كم يستغرق التوصيل؟|من 24 إلى 72 ساعة حسب الولاية.\nهل يمكنني الاستبدال؟|نعم خلال 7 أيام.", items_fr: "Quel est le délai de livraison ?|24 à 72h selon la wilaya.\nPuis-je échanger ?|Oui, sous 7 jours." } },
      ],
    },
  });
  await db.coupon.create({ data: { tenantId: demo.id, code: "BIENVENUE10", type: "percent", value: 10 } });

  // some demo orders for the dashboard
  const all = await db.product.findMany({ where: { tenantId: demo.id }, include: { variants: true } });
  const names = ["Amine B.", "Sara K.", "Yacine M.", "Lina H.", "Karim D.", "Meriem A.", "Walid T.", "Nesrine Z."];
  const statuses = ["new", "new", "new", "confirmed", "no_answer", "shipped", "delivered", "delivered", "returned", "cancelled"];
  for (let i = 0; i < 24; i++) {
    const p = all[i % all.length];
    const w = [16, 31, 25, 9, 19, 6, 13, 15][i % 8];
    const r = rate(w);
    const qty = (i % 3) + 1;
    const phone = `05${String(50000000 + i * 7919).slice(0, 8)}`;
    const cust = await db.customer.upsert({ where: { tenantId_phone: { tenantId: demo.id, phone } }, create: { tenantId: demo.id, phone, name: names[i % names.length] }, update: {} });
    const status = statuses[i % statuses.length];
    await db.order.create({
      data: {
        tenantId: demo.id, number: 1001 + i, customerId: cust.id, status, name: cust.name, phone, wilayaCode: w, commune: null, address: "Cité 100 logements",
        deliveryType: i % 3 === 0 ? "desk" : "home", deliveryFee: i % 3 === 0 ? r.desk : r.home, subtotal: p.price * qty, total: p.price * qty + (i % 3 === 0 ? r.desk : r.home),
        createdAt: new Date(Date.now() - i * 5 * 3600_000),
        items: { create: [{ productId: p.id, variantId: p.variants[1]?.id, name: (p.name as any).fr, variant: p.variants[1] ? "M" : null, unitPrice: p.price, qty }] },
        events: { create: [{ type: "status", toStatus: "new", note: "created" }, ...(status !== "new" ? [{ type: "status", fromStatus: "new", toStatus: status }] : [])] },
      },
    });
  }

  // ---------- Tenant 2: electronics, landing-page flow, dark theme, French-first ----------
  const tech = await makeTenant({
    slug: "tech", name: "TechDZ", email: "admin@tech.dz", planId: plan.id,
    settings: {
      locale: { default: "fr", enabled: ["fr", "ar"] },
      orderFlow: "landing",
      theme: { preset: "midnight", colors: { primary: "#6366f1", accent: "#f472b6", background: "#0b1020", surface: "#141a2e", text: "#e5e7eb", muted: "#94a3b8", border: "#25304d" }, radius: 6, buttonStyle: "pill", productCard: "overlay", gridColumns: 3, fontLatin: "Poppins", fontAr: "Tajawal" },
      checkout: {
        deskEnabled: false,
        fields: [
          { key: "name", type: "text", label: { ar: "الاسم", fr: "Nom et prénom" }, required: true, enabled: true, width: "half" },
          { key: "phone", type: "phone", label: { ar: "الهاتف", fr: "Téléphone" }, required: true, enabled: true, width: "half" },
          { key: "wilaya", type: "wilaya", label: { ar: "الولاية", fr: "Wilaya" }, required: true, enabled: true, width: "half" },
          { key: "commune", type: "commune", label: { ar: "البلدية", fr: "Commune" }, required: false, enabled: true, width: "half" },
          { key: "warranty", type: "radio", label: { ar: "الضمان", fr: "Garantie" }, required: true, enabled: true, width: "full", options: [{ value: "6m", label: { ar: "6 أشهر", fr: "6 mois" } }, { value: "12m", label: { ar: "12 شهراً", fr: "12 mois (+1000 DA)" } }] },
        ],
      },
    },
  });
  for (const p of [
    { slug: "ecouteurs-sans-fil", name: { ar: "سماعات لاسلكية", fr: "Écouteurs sans fil" }, price: 3900, compareAt: 5900, image: img("photo-1590658268037-6bf12165a8df"), extra: { offers: [{ qty: 2, price: 7000, label: { fr: "Pack duo", ar: "عرض قطعتين" } }, { qty: 3, price: 9900, label: { fr: "Pack famille", ar: "عرض 3 قطع" } }] } },
    { slug: "montre-connectee", name: { ar: "ساعة ذكية", fr: "Montre connectée" }, price: 6900, compareAt: 9900, image: img("photo-1523275335684-37898b6baf30") },
    { slug: "enceinte-bluetooth", name: { ar: "مكبر صوت بلوتوث", fr: "Enceinte Bluetooth" }, price: 4500, compareAt: null, image: img("photo-1608043152269-423dbba4e7e1") },
  ]) {
    await db.product.create({ data: { tenantId: tech.id, slug: p.slug, name: p.name, price: p.price, compareAt: p.compareAt, images: [p.image], status: "active", extra: (p as any).extra ?? {}, description: { fr: "Garantie incluse. Livraison 58 wilayas.", ar: "ضمان مشمول. توصيل 58 ولاية." } } });
  }
  await db.page.create({
    data: {
      tenantId: tech.id, slug: "home", isHome: true, title: { fr: "Accueil", ar: "الرئيسية" },
      sections: [
        { id: "a", type: "hero", enabled: true, props: { title_fr: "Le high-tech livré chez vous", title_ar: "التكنولوجيا حتى باب منزلك", subtitle_fr: "Paiement à la livraison · Garantie", cta_fr: "Voir les offres", cta_ar: "شاهد العروض", cta_link: "/products", image: img("photo-1518770660439-4636190af475"), align: "start" } },
        { id: "b", type: "product_grid", enabled: true, props: { title_fr: "Meilleures ventes", title_ar: "الأكثر مبيعاً", limit: 6 } },
      ],
    },
  });

  // platform super admin
  await db.user.upsert({ where: { email: "root@souk.dz" }, create: { email: "root@souk.dz", name: "Platform", isSuperAdmin: true, passwordHash: await bcrypt.hash("admin123", 10) }, update: {} });
  console.log("Seeded: demo (admin@demo.dz / admin123), tech (admin@tech.dz / admin123)");
}

main().finally(() => db.$disconnect());
