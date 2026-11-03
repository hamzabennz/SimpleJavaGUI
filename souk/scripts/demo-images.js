// Generates soft, product-styled placeholder images locally for demo stores
// (useful when external photo CDNs are unavailable). Usage: node scripts/demo-images.js
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
const palettes = [["#f6e7d8","#e8c9a8","#8a5a3b"],["#e3ecf5","#bcd1e8","#2f4f6f"],["#eef3e8","#cfe0c3","#3f5f2f"],["#f5e6ec","#e6c1d0","#7a3350"],["#ece9f6","#cdc6ec","#463a7a"],["#f3efe6","#ddd2bb","#5e5139"],["#e6f2f1","#bfe0dd","#245a55"],["#f7ede2","#f0d3b5","#8b4c1c"]];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
function svg(title, sub, i, w = 800, h = 800) {
  const [a, b, c] = palettes[i % palettes.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w*0.72}" cy="${h*0.3}" r="${Math.min(w,h)*0.22}" fill="${c}" opacity=".10"/><circle cx="${w*0.25}" cy="${h*0.75}" r="${Math.min(w,h)*0.3}" fill="#fff" opacity=".25"/>
  ${title ? `<rect x="${w*0.3}" y="${h*0.24}" width="${w*0.4}" height="${h*0.4}" rx="${w*0.04}" fill="#fff" opacity=".55"/>
  <text x="50%" y="${h*0.8}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${Math.round(w/18)}" font-weight="700" fill="${c}">${esc(title)}</text>
  <text x="50%" y="${h*0.87}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${Math.round(w/30)}" fill="${c}" opacity=".7">${esc(sub)}</text>` : ""}</svg>`;
}
(async () => {
  const dir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  for (const t of await db.tenant.findMany({ include: { products: true, pages: true } })) {
    fs.mkdirSync(path.join(dir, t.id), { recursive: true });
    let i = 0;
    for (const p of t.products) {
      const imgs = [];
      for (const k of [0, 1]) {
        const f = `demo-${p.slug}-${k}.webp`;
        await sharp(Buffer.from(svg(p.name.fr || p.slug, t.name, i + k * 3))).webp({ quality: 82 }).toFile(path.join(dir, t.id, f));
        imgs.push(`/uploads/${t.id}/${f}`);
      }
      await db.product.update({ where: { id: p.id }, data: { images: imgs } });
      i++;
    }
    const hero = "demo-hero.webp";
    await sharp(Buffer.from(svg("", "", t.slug === "tech" ? 4 : 0, 1600, 700))).webp({ quality: 80 }).toFile(path.join(dir, t.id, hero));
    for (const pg of t.pages) {
      const sections = pg.sections.map((s) => (s.type === "hero" ? { ...s, props: { ...s.props, image: `/uploads/${t.id}/${hero}` } } : s));
      await db.page.update({ where: { id: pg.id }, data: { sections } });
    }
    console.log(`${t.slug}: ${t.products.length} products imaged`);
  }
  await db.$disconnect();
})();
