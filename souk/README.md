# Souk: multi-tenant e-commerce SaaS for Algeria

The full specification is in [`../docs/SPEC.md`](../docs/SPEC.md).

## Stack
Next.js 15 (App Router, SSR) · PostgreSQL + Prisma · Zod · plain CSS driven by CSS variables (the theme comes from tenant settings).

## Quick start
```bash
cp .env.example .env              # set DATABASE_URL
npm install
npx prisma db push                # create tables
npm run db:seed                   # 2 demo stores
npm run dev
```
- Storefront: http://localhost:3000 (`?store=tech` switches tenant in dev, `?lang=fr` switches language)
- Admin: http://localhost:3000/admin, logging in with `admin@demo.dz` / `admin123` (or `admin@tech.dz`). `?alang=ar` switches the admin to Arabic.
- Platform console (SaaS owner): http://localhost:3000/platform, logging in with `root@souk.dz` / `admin123`
- Self-serve signup: http://localhost:3000/signup
- Tests: `npm test` (unit), `npm run typecheck`
- Docker: `docker compose up --build`
- In production each store is served at `<slug>.ROOT_DOMAIN` or at a custom domain (`Domain` table).

## How the SaaS configurability works
| Concern | Where | Merchant edits it in |
|---|---|---|
| Colors, radius, fonts, button and card styles, grid | `Tenant.settings.theme` → `src/lib/theme.ts` compiles it to CSS vars | Admin → Thème & couleurs (live preview) |
| Home page layout | `Page.sections` (ordered `{type, props}`); renderers in `components/store/Sections.tsx`, editable schemas in `lib/sections.ts` | Admin → Page d'accueil |
| Checkout form fields | `settings.checkout.fields` (`FieldDef[]`), validated server-side by `lib/forms.ts#buildValidator` | Admin → Formulaire de commande |
| Product custom attributes | `settings.productAttributes` (`FieldDef[]`) → `Product.attributes` | Admin → Formulaire → Attributs produits |
| Order flow | `settings.orderFlow`: `landing` (form on the product page), `cart`, or `both` | Thème page |
| Order statuses (labels/colors) | `settings.orderStatuses` | Paramètres |
| Languages, pixels, contact info | `settings.locale / tracking / store` | Paramètres |

All settings are parsed through `SettingsSchema` (`src/lib/settings.ts`). Missing keys fall back to defaults, so new options never break existing tenants.

A single `FieldInput` renderer is shared by the checkout, the product attribute editor and the page-builder section editors.

## Algeria-specific features
- All 58 wilayas and 1,541 communes (`src/data/algeria.json`), with a cascading select
- Delivery price per wilaya × home or stop desk, free-shipping threshold, and per-product free shipping
- Cash on delivery. Prices, stock and coupons are recomputed on the server.
- Phone validation (`05/06/07…`, `+213`), duplicate-order flag, phone blacklist, per-customer delivery success rate
- Call-center order page: one-tap call and WhatsApp, call/note log, status pipeline, carrier and tracking number
- Meta and TikTok pixels (PageView, AddToCart, Purchase)
- Arabic RTL and French UI, translatable content `{ar, fr}`

## Layout
```
prisma/schema.prisma      data model (tenant-scoped)
prisma/seed.ts            demo data
src/lib/                  tenant resolution, settings schema, form engine, orders service, auth
src/app/(store)/          storefront (home, catalog, product, cart, thank-you, tracking)
src/app/admin/            merchant back-office
src/app/api/              order + communes endpoints
```

## Extension points
| Add a… | Do this |
|---|---|
| Delivery company | Implement `CarrierAdapter` in `src/lib/carriers/<name>.ts`, register it in `src/lib/carriers/index.ts` |
| Section type | Add the schema in `src/lib/sections.ts` and the renderer case in `components/store/Sections.tsx` |
| Setting | Add it to `SettingsSchema` with a default. Existing tenants pick it up automatically. |
| Admin language | Add a map in `src/lib/admin-i18n.ts` (keys are the French strings) |
| Storefront language | Add a dict in `src/lib/i18n.ts` and extend `locale.enabled` |
| Storage backend | Implement `Storage` in `src/lib/storage.ts` |

## Environment variables
| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection |
| `SESSION_SECRET` | HMAC key for admin sessions (**required in production**) |
| `ROOT_DOMAIN` | e.g. `souk.dz`; stores live at `<slug>.souk.dz`, and the session cookie is shared across subdomains |
| `DEFAULT_TENANT` | Store served when no host matches |
| `CNAME_TARGET` / `SERVER_IP` | DNS targets shown to merchants for custom domains |
| `UPLOAD_DIR` | Local upload directory |
| `ALLOW_STORE_OVERRIDE=1` | Enables `?store=` in production (previews) |

## Production notes
- Put a wildcard TLS certificate for `*.ROOT_DOMAIN` in front of the app (Caddy can issue on-demand certificates for custom domains).
- The in-memory rate limiters (orders, login, signup) are per-process. Use Redis when running several instances.
- Carrier API field names come from public docs and must be verified with each carrier's sandbox before going live.
- Integration secrets are stored in tenant settings JSON. Encrypt them at rest before production.
