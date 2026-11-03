# Souk SaaS: Multi-tenant E-commerce Platform for Algeria

> Working name: "Souk". It can be renamed later. Status: **v0.2**. The MVP and most of v1 are implemented in `/souk` (see §15).

## 1. Vision

A white-label, multi-tenant e-commerce SaaS for Algerian merchants. Each merchant (a **tenant**) gets:

- a **storefront** on a subdomain (`shop.souk.dz`) or their own custom domain, where customers browse and order
- an **admin dashboard** to manage products, orders, customers, delivery and store appearance

The platform is built around how online selling works in Algeria:

- **Cash on Delivery (COD)** is the default payment method.
- Orders are confirmed by **phone call** before shipping.
- Delivery is priced per **wilaya** (58 wilayas), and the price differs between **home delivery** and **stop desk** (pickup point).
- Shipping goes through local carriers: Yalidine, ZR Express, Maystro, Noest, EcoTrack-based companies, and others.
- The storefront is **Arabic (RTL)** first, plus French. English is optional.
- Customers often order **without an account**, giving only name, phone, wilaya, commune and address.
- Marketing runs mostly on Facebook, Instagram and TikTok, so Meta Pixel, TikTok Pixel and the Conversion API (CAPI) are essential.

## 2. Actors & Roles

| Actor | Description |
|---|---|
| **Platform Owner (Super Admin)** | You. Manage tenants, subscription plans, billing, global templates, feature flags. |
| **Merchant Owner** | Owns a store. Has full access to their tenant. |
| **Merchant Staff** | Has role-based access. Built-in roles are *Manager*, *Order Confirmer* (call center) and *Stock Keeper*, and merchants can define custom roles. |
| **Customer** | Browses and orders. Can check out as a guest or create an optional account. |

## 3. Multi-tenancy Model

- **Shared database, tenant-scoped rows** (`tenant_id` on every business table), with Postgres **Row-Level Security** as a second safety net. This is cheaper and simpler to run than one database per tenant.
- Each request is resolved to a tenant from its **Host header**: a subdomain, or a custom domain looked up in the `domains` table.
- Each tenant has a **settings JSON** that is validated against a versioned schema. It covers theme, layout, checkout fields, features, integrations and locale.
- **Plan limits** are enforced by middleware: number of products, staff, orders per month, custom domain allowed, removal of platform branding.

## 4. Configurability (the core of the SaaS)

Everything a merchant can customize lives in configuration, never in code forks.

### 4.1 Theme tokens
- Colors (primary, secondary, background, surface, text, success/danger), border radius, font family (Arabic and Latin pairs such as Cairo, Tajawal, Inter), button style, dark mode on or off.
- These compile to **CSS variables** at request time, so changing them needs no rebuild.

### 4.2 Layout / page builder (section-based)
- Pages (Home, Product, Collection, custom landing pages) are an **ordered list of sections**. Each section has a `type` and `props`:
  `hero`, `banner_slider`, `product_grid`, `collection_list`, `featured_product`, `testimonials`, `faq`, `rich_text`, `image_with_text`, `countdown`, `trust_badges`, `video`.
- Each section type has a JSON schema, so the admin generates its editing form automatically.
- **Product landing-page mode**: a single-product page with the order form embedded directly on it, with no cart. This is the most common Algerian "dropshipping" pattern.

### 4.3 Dynamic form fields (checkout & product)
- The **checkout form is schema-driven**. Merchants can toggle, reorder, relabel (AR/FR) and mark required any of these fields: full name, phone, second phone, wilaya, commune, address, email, notes, plus **custom fields** (text, number, select, radio, checkbox, date).
- **Product custom attributes** use a per-store attribute schema (e.g. "Material", "Warranty"), and **variants** use option axes such as Size × Color, each variant with its own SKU, price, stock and image.
- One **form renderer** shared by the admin and the storefront renders all of these.

### 4.4 Localization
- Every user-facing string is i18n-keyed. Product, category and page content are stored as `{ ar, fr, en }`.
- Direction (RTL/LTR) switches automatically. Currency is DZD, formatted like `1 500 DA`.

### 4.5 Feature flags per tenant / plan
- Cart vs. direct order, customer accounts, reviews, coupons, upsells, abandoned-order capture, blacklist, multi-staff, API access.

## 5. Storefront (Client side)

1. **Home**: built from the configured sections.
2. **Catalog**: categories, search, filters (price, attributes, in stock), sorting, pagination.
3. **Product page**: gallery, variants, price with a compare-at price, stock badge, description, reviews, related products, quantity selector, and either *Order now* (inline form) or *Add to cart*.
4. **Cart**: optional, depending on the tenant's mode.
5. **Checkout**:
   - dynamic form (§4.3)
   - wilaya → commune cascade (static dataset of the 58 wilayas and 1,541 communes)
   - choice of home delivery or stop desk, with the delivery fee computed per wilaya and type
   - coupon code
   - order summary
   - **COD**, plus optional online payment (§9)
6. **Order confirmation / thank-you page**: fires pixel `Purchase` events and can show a WhatsApp contact button.
7. **Order tracking**: by phone number plus order number, with a status timeline.
8. **Optional customer account**: order history and saved addresses. Login by phone OTP or email.
9. **Static pages**: About, Contact, Return policy, FAQ.
10. **SEO**: SSR pages, meta and OG tags per product, sitemap.xml, structured data.
11. **Performance**: mobile-first, image CDN with resizing, and Lighthouse ≥ 90 on 4G.

## 6. Admin Dashboard (Merchant side)

### 6.1 Dashboard
- KPIs for today, 7 days and 30 days: orders, revenue, **confirmation rate**, **delivery rate**, **return rate**, average order value, top products and top wilayas.

### 6.2 Products
- CRUD, variants, images (drag-to-reorder), categories/collections, tags, SEO fields, AR/FR content.
- Stock tracking, low-stock alert, cost price (used for profit reporting).
- Bulk import/export (CSV/Excel), duplicate product, draft or published status.

### 6.3 Orders (most important for Algerian merchants)
- **Status pipeline** (configurable labels):
  `new → confirmed → (no_answer_1/2/3, postponed, cancelled) → ready → shipped → delivered | returned`
- Call-center view: one-click phone call and WhatsApp, quick status buttons, notes, call attempts log.
- Assign orders to confirmers. Detect duplicate orders (same phone within N hours).
- **Blacklist** phones or IPs that keep refusing deliveries. Show a per-phone delivery success score.
- Edit an order (items, quantities, delivery fee), create a manual order (phone/WhatsApp orders).
- Bulk actions: confirm, export, print invoices and labels, **push to carrier**.
- Abandoned orders: forms that were partly filled with a phone number, so they can be called back.

### 6.4 Delivery
- Pricing table per wilaya × (home / stop desk), with free-shipping rules (above an amount, or per product).
- Carrier integrations (pluggable adapter interface): create a parcel, get a tracking number, sync status by webhook or polling, print the label.

### 6.5 Customers
- List with order history, total spent, delivery success rate, tags, blacklist toggle.

### 6.6 Marketing
- Coupons (percentage or fixed, minimum amount, usage limits, dates)
- Upsell and cross-sell offers on the order form, quantity offers ("2 pieces at 3 500 DA")
- Meta Pixel and CAPI, TikTok Pixel and Events API, Google Analytics / Google Tag Manager, Google Sheets order sync

### 6.7 Store design
- Theme editor (§4.1) with a **live preview**
- Section/page builder (§4.2)
- Checkout form builder (§4.3)
- Navigation menus, logo, favicon, social links

### 6.8 Settings
- Store info, languages, domains, staff and roles, notifications (email, Telegram bot, SMS), legal pages, API keys

### 6.9 Reports
- Sales, profit (revenue − cost − delivery), per product, per wilaya, per confirmer performance, CSV export

## 7. Platform Super-Admin

- Manage tenants (create, suspend, impersonate), plans and limits, subscription invoices
- Payments by BaridiMob or CCP receipt upload, or Chargily (CIB/Edahabia)
- Global section templates and theme presets, a feature-flag console, usage metrics, audit log

## 8. Notifications
- To the merchant: a new order arrives (email, Telegram, web push)
- To the customer: SMS or WhatsApp at confirmation and shipping (optional, through a provider adapter)

## 9. Payments
- **COD** is the default
- Online payment through the **Chargily Pay** adapter (CIB/Edahabia), which is optional per tenant
- Manual **BaridiMob/CCP** transfer with a receipt upload
- The payment layer is pluggable: `PaymentProvider` interface

## 10. Proposed Tech Stack (pending your answer)

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm + Turborepo | Shared packages (UI, form engine, types) |
| Storefront | **Next.js (App Router, SSR)** | SEO, speed, multi-tenant middleware by host |
| Admin | Next.js (same app under `/admin`, or separate) | Shared components |
| API | Next.js route handlers / tRPC **or** NestJS | Type-safe end to end |
| DB | **PostgreSQL + Prisma** | Relational orders, JSONB for configs, RLS |
| Cache/Queue | Redis + BullMQ | Carrier sync, notifications, pixel CAPI |
| Storage | S3-compatible (Cloudflare R2) + image resizing | Cheap |
| Auth | Session/JWT, phone OTP optional | |
| UI | Tailwind + shadcn/ui, CSS-variable theming | Easy theming and RTL |
| Validation | Zod schemas shared by client and server | Same schemas drive the dynamic forms |
| Deploy | Docker; VPS or Vercel + Neon | |

*Alternative*: a Java/Spring Boot backend (the current repo is Java) with a React frontend. See question Q1.

## 11. Core Data Model (simplified)

```
Tenant(id, slug, name, plan_id, status, settings JSONB, created_at)
Domain(id, tenant_id, host, verified)
User(id, email, phone, password_hash)            -- platform-level identity
Membership(user_id, tenant_id, role_id)
Role(id, tenant_id, name, permissions[])
Category(id, tenant_id, parent_id, name{ar,fr}, slug, image)
Product(id, tenant_id, name{}, slug, description{}, status, price, compare_at, cost,
        attributes JSONB, seo JSONB, track_stock, images[])
ProductOption(id, product_id, name{}, values[])
Variant(id, product_id, sku, option_values JSONB, price, stock, image)
Customer(id, tenant_id, name, phone, email, blacklisted, stats JSONB)
Order(id, tenant_id, number, customer_id, status, wilaya_code, commune, address,
      delivery_type, delivery_fee, subtotal, discount, total, custom_fields JSONB,
      source, ip, assigned_to, carrier, tracking_number, created_at)
OrderItem(id, order_id, product_id, variant_id, name_snapshot, unit_price, qty)
OrderEvent(id, order_id, type, from_status, to_status, note, user_id, at)  -- audit/calls
DeliveryRate(id, tenant_id, wilaya_code, home_price, desk_price, enabled)
Coupon(id, tenant_id, code, type, value, min_total, max_uses, used, starts, ends)
Page(id, tenant_id, slug, title{}, sections JSONB, is_home)
FormSchema(id, tenant_id, kind['checkout'|'product_attrs'], fields JSONB, version)
Integration(id, tenant_id, type, config JSONB(encrypted))
Plan(id, name, price_dzd, limits JSONB, features JSONB)
Wilaya(code, name_ar, name_fr) / Commune(id, wilaya_code, name_ar, name_fr)
```

## 12. Non-functional Requirements
- **Security**: tenant isolation tests, rate limiting on checkout (fake-order spam is common), honeypot fields and optional captcha, encrypted secrets, audit log.
- **Performance**: product pages cached at the edge per tenant, with cache invalidation when the merchant saves.
- **Reliability**: no order is lost even if the carrier or pixel APIs fail. Those calls go through retries in a queue.
- **Compliance**: Algerian Law 18-05 (e-commerce) and Law 18-07 (personal data), so there are legal-page templates and an export/delete option for customer data.
- **Extensibility**: adapter interfaces for carriers, payments, notifications and pixels, so a new provider is one file.

## 13. Roadmap

| Phase | Scope |
|---|---|
| **MVP (today's session)** | Monorepo skeleton, tenant resolution, theme tokens → CSS variables, product CRUD, storefront catalog and product page, schema-driven COD checkout with wilaya/commune and delivery pricing, order list with status pipeline, seed demo tenant |
| v1 | Variants, coupons, staff roles, page builder UI, pixels, CSV export, one carrier (Yalidine) |
| v2 | More carriers, Chargily, abandoned orders, reports, super-admin billing |
| v3 | Custom domains with automatic SSL, app/plugin marketplace, public API, mobile admin app |

## 14. Decisions taken
| Question | Decision |
|---|---|
| Stack | Next.js + PostgreSQL (Prisma) |
| Order flow | Both flows, toggled per tenant (`landing`, `cart`, `both`) |
| Code location | `/souk` subfolder of this repo |
| v1 integrations | Yalidine and ZR Express carriers, Meta and TikTok pixels (browser + server-side). Google Sheets sync dropped, since merchants manage orders in the admin. |

### Still open
- Final brand name and root domain (`ROOT_DOMAIN`)
- Online payment (Chargily) timing, which is v2 for now
- Hosting target in Algeria (local DC vs. EU cloud): affects latency and Law 18-07
- Subscription billing flow (BaridiMob receipt upload vs. Chargily recurring)

## 15. Implementation status

| Area | Done | Notes |
|---|---|---|
| Multi-tenancy | ✅ | Host → custom domain → subdomain → `DEFAULT_TENANT`; `?store=` dev override |
| Theme tokens → CSS vars | ✅ | Presets, colors, radius, fonts AR/Latin, button/card style, grid columns; sanitized |
| Section page builder | ✅ | hero, product grid, categories, rich text, trust badges, FAQ, testimonials, countdown, image+text, video; home + custom pages |
| Schema-driven checkout form | ✅ | Toggle, reorder, relabel AR/FR, required, width, custom fields; server-side Zod validation |
| Product custom attributes | ✅ | Same form engine |
| Storefront | ✅ | Home, catalog (filter/search/sort), product page, cart, thank-you, tracking, custom pages, sitemap/robots/JSON-LD, sticky mobile CTA |
| COD checkout | ✅ | Wilaya → commune cascade (58 / 1,541), home/desk pricing, free-shipping rules, coupons, quantity offers, rate limiting |
| Abandoned checkouts | ✅ | Captured once phone is valid; recovery list |
| Orders admin | ✅ | Pipeline, configurable statuses, duplicate flag, blacklist, call/note log, edit order, manual orders, bulk actions, CSV, print slips |
| Carriers | ✅ adapters | Yalidine, ZR Express, EcoTrack, Manual; status webhooks. **Field names must be verified against each carrier's live API.** |
| Pixels | ✅ | Meta + TikTok browser events, server-side CAPI/Events API with event_id dedup |
| Notifications | ✅ | Telegram on new order |
| Reviews | ✅ | Moderated, verified-purchase badge, aggregate rating in JSON-LD |
| Upsell / offers | ✅ | Quantity offers and per-product upsell, both priced on the server |
| Call center | ✅ | Order assignment, round-robin auto-assign, confirmer queues |
| Secrets | ✅ | AES-256-GCM at rest, masked in UI |
| Fake-order protection | ✅ | Duplicate flag, blacklist, risk badge from return history, auto-block after N returns, CGNAT-aware rate limits, honeypots |
| Merchant productivity | ✅ | CSV product import (Excel-friendly), duplicate product, customer CSV export, WhatsApp confirmation template, onboarding checklist, low-stock alert |
| Media | ✅ | Reusable image field with upload (logo, sections, products) |
| Staff & roles | ✅ | owner / manager / confirmer / stock |
| Reports | ✅ | Revenue, COGS, return cost, profit, per product, per wilaya delivery rate |
| Admin i18n | ✅ | French + Arabic (RTL) |
| SaaS | ✅ | Self-serve signup, plan limits & features, platform console (tenants, plans, MRR), custom domains with DNS check |
| Uploads | ✅ local | Storage adapter; S3/R2 driver to add |
| Not yet | ⏳ | Chargily payments, SMS/WhatsApp to customers, product reviews, Redis queue/rate limiting, automatic SSL for custom domains, carrier polling, audit log UI |
