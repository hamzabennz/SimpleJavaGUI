# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is
**Souk**: a multi-tenant, white-label e-commerce SaaS for Algerian merchants, to be resold.
The code lives in `souk/`. The product spec, decisions and implementation status are in `docs/SPEC.md` (read §14–15 before planning work).
`src/Start.java` at the root is an unrelated legacy sample; ignore it.

Each tenant (merchant) gets a storefront (customers browse and order) and an admin (products, orders, delivery, design).
The Algerian context drives the design:
- Cash on delivery and phone confirmation of orders
- Delivery priced per wilaya (58) × home / stop-desk
- Arabic (RTL) + French
- Carriers: Yalidine, ZR Express, EcoTrack
- Marketing through Facebook and TikTok pixels

## Owner preferences (keep these)
- Easy, intuitive, **professional UI with no "AI boilerplate"**: no decorative emoji. Use the inline SVG icons in `src/components/Icon.tsx`.
- **Arabic and French everywhere**, on both the storefront and the admin.
- **Responsive and lightweight**: test at 360px width. Pages should stay around 100–120 kB of first-load JS. No heavy UI libraries; plain CSS with variables in `src/app/globals.css`.
- Build for reusability and flexibility: anything a merchant may want different belongs in settings, never in code forks.

## Stack & commands (run inside `souk/`)
Next.js 15 (App Router, server actions) · React 19 · PostgreSQL + Prisma 6 · Zod 3 · sharp · vitest.

```bash
npm run dev            # dev server :3000
npm run build && npm start
npm run typecheck      # tsc --noEmit
npm test               # vitest unit tests (tests/)
npx prisma db push     # apply schema changes (no migrations folder yet)
npm run db:seed        # demo tenants: demo (fashion, AR) and tech (dark, FR, landing flow)
node scripts/demo-images.js   # generate local placeholder product/hero images
```
Local DB on the owner's Mac runs in Docker: `docker start souk-db` (Postgres 16 on **port 5433**; see `.env`).
Demo logins: `admin@demo.dz` / `admin123`, `admin@tech.dz` / `admin123`, super-admin `root@souk.dz` / `admin123` (at `/platform`).
Dev helpers: `?store=<slug>`, `?lang=ar|fr` (storefront), `?alang=ar|fr` (admin). In production `?store=` needs `ALLOW_STORE_OVERRIDE=1`.

## Architecture map (`souk/src`)
- `lib/tenant.ts`: resolves the tenant from the Host header (custom domain → `<slug>.ROOT_DOMAIN` → `DEFAULT_TENANT`).
- `lib/settings.ts`: **SettingsSchema** (Zod). All per-tenant config: theme, checkout form fields, order flow, statuses, tracking, integrations, notifications. Always add new options here with a default.
- `lib/forms.ts`: schema-driven form engine (`FieldDef`, `buildValidator`). It drives the checkout, product attributes and section editors. `components/FieldInput.tsx` renders any field.
- `lib/sections.ts` + `components/store/Sections.tsx`: page-builder section registry and renderers.
- `lib/orders.ts`: order creation. **Prices, stock, offers, upsells, coupons and delivery are computed on the server only.**
- `lib/carriers/*`: `CarrierAdapter` interface; register new carriers in `index.ts`.
- `lib/admin-i18n.ts`: admin translations. Keys are the French source strings; missing keys fall back to French. Storefront strings are in `lib/i18n.ts`.
- `lib/secrets.ts`: AES-256-GCM for integration secrets (`SECRETS_KEY`). Mask secrets in the UI and never send them back to the browser.
- `lib/plans.ts`: plan limits and features (`checkLimit`).
- `app/(store)/*`: storefront. `app/admin/(panel)/*`: merchant admin. `app/admin/actions.ts`: all admin server actions. `app/platform`: SaaS owner console. `app/api/*`: orders, saved carts (`abandoned`), communes, uploads, reviews, carrier webhooks.

## Rules that must hold
- **Tenant isolation**: every query and mutation is scoped by `tenantId`. Never `update` by id alone; verify ownership first or use `updateMany({ where: { id, tenantId } })`. Validate foreign ids from forms (categoryId, upsell productId, staff userId) against the tenant.
- Every admin action calls `requireAdmin(permission)` (roles: owner, manager, confirmer, stock). Platform actions use `requireSuperAdmin` / `requireUser`.
- Sanitize anything merchant-controlled that is injected into CSS or URLs. Theme colors and fonts are regex-validated; section links go through `safeHref`.
- Rate limits are per **phone** first and only loosely per IP, because Algerian mobile carriers use CGNAT.

## Known pitfalls (already hit once)
- Prisma `NOT: { phone: x }` does **not** match `NULL` rows (SQL three-valued logic). Use `OR: [{ phone: null }, { phone: { not: x } }]`.
- Grid children default to `min-width:auto`. `<img width=800>` once widened mobile pages to 816px. Keep `min-width:0` on grid items and use `minmax(min(Npx,100%),1fr)`.
- Don't name a form input `id`: it clobbers `form.id` (and broke Playwright).
- Two forms on one page: give fields unique names (the review form uses `rv_*`).
- Hydration warnings mentioning only `caret-color` come from Playwright's input filling, not the app.
- After changing `prisma/schema.prisma`, restart the dev server: it keeps the old Prisma client loaded.
- Carrier API field names (Yalidine, ZR Express, EcoTrack) come from public docs and are **not verified** against live accounts.

## Open items
See `docs/SPEC.md` §14 "Still open" and §15 "Not yet":
- Chargily payments, SMS/WhatsApp messages to customers
- Redis (queues and shared rate limiting), an S3/R2 storage driver, a migrations folder
- Testing on real Android phones over 4G
