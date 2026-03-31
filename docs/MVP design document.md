# Shopware Cloud — LoyaltyApp (Reviews & Social Proof)
Version: 0.2.0
Date: 2026-02-10

---

## 1. Purpose & Summary
**One-line:** Open-source, lightweight reviews & social proof app for Shopware Cloud (6.6+).

**Objective:** Provide merchants an install-and-go reviews system: collect verified product reviews via post-purchase emails, display reviews and star ratings on the storefront (with SEO structured data), and provide moderation with configurable auto-approval in the Shopware admin UI.

**Key constraints:**
- Product-level verified reviews only (via email flow; no organic/anonymous submissions in MVP).
- No review images in MVP.
- Open source (MIT license, no billing/subscription integration).
- Target Shopware 6.6+; primary testing on Shopware 6.7.

---

## 2. User personas & journeys

**Merchant (admin):**
- Install app from Shopware Store → app auto-registers webhooks and injects storefront widget → merchant opens admin module (iframe) → configures settings (trigger event, delay, auto-approve rules) → reviews begin collecting automatically → merchant moderates pending reviews → replies to reviews → approved reviews appear on storefront.

**Customer (end-user):**
- Purchases product → order reaches configured trigger state → after configured delay, receives review request email → clicks tokenized link → lands on standalone review page → submits star rating + text → review is auto-approved or queued for moderation → approved review appears on product page with SEO structured data.

**Developer:**
- Clones repo → runs `pnpm install` → starts local dev server → uses ngrok to expose endpoints → installs app in local Shopware 6.7 instance → tests webhook flow → debugs.

---

## 3. MVP scope

**Must-haves:**
- App install/uninstall lifecycle with Shopware (persist merchant record, register webhooks).
- Webhook handling for configurable order state changes (placed, shipped, completed) and order cancellations/refunds.
- Postgres database storing merchants, reviews, review_requests.
- Review request emails via Postmark: schedule after configurable trigger event + configurable delay (in days).
- Token-based review submission: one-time-use tokens, standalone review page hosted by app.
- Storefront widget: auto-injected on product detail pages via app storefront JS — shows star rating summary + approved reviews list.
- SEO: JSON-LD structured data for product reviews and aggregate ratings.
- Merchant admin UI (iframe in Shopware admin): dashboard, review list with approve/reject, merchant reply to reviews, settings page.
- Configurable auto-approve: merchants set a minimum star rating threshold for auto-approval.
- Localization: English + German (emails, widget, admin UI, review submission page).
- GDPR: data export and deletion endpoints for customer reviews.

**Explicitly out of MVP scope:**
- Review images/photos.
- Organic/anonymous review submissions.
- Shop-level reviews.
- Billing/subscription (app is open source).

---

## 4. High-level architecture

### Single-app approach (Next.js)

Single **Next.js** application (App Router) to minimize deployment complexity. 

| Concern | Implementation |
|---|---|
| Shopware webhooks & install | Next.js API routes (`/api/app/*`, `/api/webhooks/*`) |
| Widget API | Next.js API routes (`/api/widget/*`) |
| Admin API | Next.js API routes (`/api/admin/*`) |
| Admin UI | Next.js pages rendered in Shopware admin iframe |
| Review submission page | Next.js page (`/submit-review/[token]`) |
| Storefront widget | JS bundle in Shopware app `Resources/` (auto-loaded by Shopware) |
| Database | Postgres via Supabase, managed with Prisma ORM |
| Email | Postmark (`postmark` npm package) |
| Email scheduling | Database-driven cron polling `review_requests` table |

### Monorepo structure

```
loyalty/
├── apps/
│   ├── web/                            # Next.js application
│   │   ├── app/                        # App Router
│   │   │   ├── api/
│   │   │   │   ├── app/               # Shopware install/uninstall/confirm
│   │   │   │   ├── webhooks/          # Shopware webhook handlers
│   │   │   │   ├── widget/            # Public widget API (reviews GET)
│   │   │   │   ├── admin/             # Admin API (iframe-authenticated)
│   │   │   │   ├── review-submission/ # Token-based review submission API
│   │   │   │   └── cron/              # Cron endpoint for email scheduling
│   │   │   ├── admin/                 # Admin UI pages (iframe)
│   │   │   └── submit-review/
│   │   │       └── [token]/           # Standalone review submission page
│   │   └── public/
│   │       └── widget/                # (Optional) fallback widget assets
│   └── shopware/
│       └── LoyaltyApp/                # Shopware app manifest & resources
│           ├── manifest.xml
│           └── Resources/
│               └── app/
│                   └── storefront/
│                       └── dist/
│                           └── storefront/
│                               └── js/
│                                   └── loyalty-app/
│                                       └── loyalty-app.js  # Auto-injected widget
├── packages/
│   ├── db/                            # Prisma schema, client, migrations
│   └── email/                         # Postmark service & email templates
├── pnpm-workspace.yaml
└── package.json
```

### Component diagram

```
Shopware ──(webhooks)──▶ Next.js API routes ──▶ Postgres (Supabase)
                                │
                                ├──▶ Postmark ──▶ Customer email
                                │
Shopware Admin ──(iframe)──▶ Next.js admin pages
                                │
Customer email link ──▶ Next.js review submission page
                                │
Storefront ──(auto-loaded JS)──▶ Next.js widget API ──▶ renders reviews + JSON-LD
```

### Email scheduling strategy

Rather than introducing Redis/BullMQ for the MVP, email scheduling uses a **database-driven cron** approach:

1. When a qualifying webhook fires, a row is inserted into `review_requests` with `scheduled_at = NOW() + delay_days`.
2. A cron endpoint (`/api/cron/send-review-emails`) runs every 5 minutes (triggered by Vercel Cron or an external cron service).
3. The cron handler queries for rows where `scheduled_at <= NOW()` and `status = 'scheduled'`, sends each email via Postmark, and updates status to `sent`.
4. Batch size is capped (e.g., 50 per run) to stay within execution time limits.
5. The cron endpoint is protected by a `CRON_SECRET` header.

---

## 5. Data model

### `merchants`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| shop_id | VARCHAR | Shopware shop ID (unique) |
| shop_url | VARCHAR | Shop base URL |
| api_key | VARCHAR (encrypted) | From Shopware app registration handshake |
| secret_key | VARCHAR (encrypted) | From Shopware app registration handshake |
| shop_secret | VARCHAR (encrypted) | Shared secret for webhook signature verification |
| settings_json | JSONB | Merchant configuration (see schema below) |
| active | BOOLEAN | `false` after uninstall (soft-delete) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `settings_json` schema

```json
{
  "review_trigger": "order.completed",
  "review_delay_days": 2,
  "auto_approve_enabled": false,
  "auto_approve_min_rating": 5,
  "locale": "en"
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `review_trigger` | enum | `"order.completed"` | `"order.placed"`, `"order.shipped"`, or `"order.completed"` |
| `review_delay_days` | integer | `2` | Days to wait after trigger before sending email (>= 0) |
| `auto_approve_enabled` | boolean | `false` | Whether to auto-approve reviews meeting the rating threshold |
| `auto_approve_min_rating` | integer | `5` | Minimum star rating (1–5) for auto-approval |
| `locale` | enum | `"en"` | `"en"` or `"de"` |

### `reviews`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| merchant_id | UUID (FK → merchants) | |
| product_id | VARCHAR | Shopware product ID |
| review_request_id | UUID (FK → review_requests) | Links to the originating request |
| rating | SMALLINT | 1–5 |
| title | VARCHAR(255) | |
| body | TEXT | |
| author_name | VARCHAR(255) | |
| author_email | VARCHAR(255) | From the review request |
| verified_purchase | BOOLEAN | Always `true` in MVP (email flow only) |
| status | VARCHAR(20) | `pending`, `approved`, `rejected` |
| merchant_reply | TEXT (nullable) | Merchant's public response to the review |
| merchant_reply_at | TIMESTAMPTZ (nullable) | When the merchant replied |
| created_at | TIMESTAMPTZ | |
| moderated_at | TIMESTAMPTZ (nullable) | When status was changed from `pending` |

### `review_requests`

| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| merchant_id | UUID (FK → merchants) | |
| order_id | VARCHAR | Shopware order ID |
| product_id | VARCHAR | Shopware product ID |
| customer_email | VARCHAR | |
| customer_name | VARCHAR | |
| token | VARCHAR (unique) | One-time-use token for review submission link |
| scheduled_at | TIMESTAMPTZ | When the email should be sent |
| sent_at | TIMESTAMPTZ (nullable) | When the email was actually sent |
| status | VARCHAR(20) | `scheduled`, `sent`, `completed`, `expired`, `cancelled` |
| created_at | TIMESTAMPTZ | |

### Indexes

- `reviews`: composite on `(merchant_id, product_id, status)` for widget queries.
- `review_requests`: on `(status, scheduled_at)` for cron polling; unique on `token`.
- `review_requests`: unique on `(order_id, product_id)` to prevent duplicate requests.

---

## 6. API surface

### Shopware lifecycle

| Method | Path | Description |
|---|---|---|
| GET | `/api/app/register` | Shopware app registration handshake — receives & stores credentials |
| POST | `/api/app/confirm` | Shopware app registration confirmation |
| POST | `/api/app/uninstall` | Soft-delete: set merchant `active = false`, cancel pending review_requests |

### Webhooks (Shopware → App)

| Method | Path | Description |
|---|---|---|
| POST | `/api/webhooks/order` | Handles order state changes; creates review_requests if trigger matches |
| POST | `/api/webhooks/order-cancelled` | Cancels pending (`scheduled`) review_requests for the order |

All webhook endpoints verify the Shopware HMAC signature before processing.

### Widget (public, CORS-restricted to shop domain)

| Method | Path | Description |
|---|---|---|
| GET | `/api/widget/reviews` | Query: `shopId`, `productId`. Returns `{ averageRating, totalCount, reviews[] }` |

No public `POST` endpoint — reviews are submitted exclusively via the tokenized review page.

### Review submission (public, token-authenticated)

| Method | Path | Description |
|---|---|---|
| GET | `/api/review-submission/[token]` | Validates token, returns product info for the review form |
| POST | `/api/review-submission/[token]` | Submits the review; invalidates token |

### Admin (authenticated via Shopware iframe handshake)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/dashboard` | Summary stats: total reviews, pending count, average rating |
| GET | `/api/admin/reviews` | List reviews with filters (`status`, `productId`) + pagination |
| POST | `/api/admin/reviews/[id]/approve` | Approve a review |
| POST | `/api/admin/reviews/[id]/reject` | Reject a review |
| POST | `/api/admin/reviews/[id]/reply` | Add or update merchant reply |
| GET | `/api/admin/settings` | Get current merchant settings |
| POST | `/api/admin/settings` | Update merchant settings |
| GET | `/api/admin/gdpr/export?email=` | Export all reviews for a customer email |
| POST | `/api/admin/gdpr/delete` | Delete all reviews + review_requests for a customer email |

### Cron (internal)

| Method | Path | Description |
|---|---|---|
| GET | `/api/cron/send-review-emails` | Sends due review request emails (protected by `CRON_SECRET`) |
| GET | `/api/cron/expire-tokens` | Expires tokens older than 30 days (runs daily) |

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Returns 200 if app is running and DB is reachable |

---

## 7. Event flows

### 7.1 App installation

1. Merchant clicks "Install" in Shopware Store.
2. Shopware sends `POST /api/app/register` with shop URL, shop ID, and a one-time proof.
3. App generates a key pair, persists the merchant record with default settings, returns confirmation URL and keys.
4. Shopware sends `POST /api/app/confirm` with API credentials (`api_key`, `secret_key`).
5. App encrypts and stores credentials; sets merchant `active = true`.
6. Shopware auto-loads the app's storefront JS on the merchant's shop.

### 7.2 Review request scheduling

1. Customer places order / order ships / order completes (depending on merchant's configured `review_trigger`).
2. Shopware fires webhook → `POST /api/webhooks/order`.
3. App verifies HMAC signature using `shop_secret`.
4. App checks if the order event matches the merchant's configured `review_trigger`.
5. If no match → ignore. If match → for each product in the order line items:
   - Check if a `review_request` already exists for this `(order_id, product_id)` → skip if so.
   - Generate a unique token (cryptographically random, URL-safe).
   - Insert `review_request` with `status = 'scheduled'` and `scheduled_at = NOW() + review_delay_days`.

### 7.3 Email sending (cron)

1. Cron fires every 5 minutes → `GET /api/cron/send-review-emails` (with `CRON_SECRET` header).
2. Query: `SELECT * FROM review_requests WHERE status = 'scheduled' AND scheduled_at <= NOW() LIMIT 50`.
3. For each row: send email via Postmark with the review link `https://{app-domain}/submit-review/{token}`.
4. Update row: `status = 'sent'`, `sent_at = NOW()`.

### 7.4 Review submission

1. Customer clicks link in email → lands on `https://{app-domain}/submit-review/{token}`.
2. App validates token: exists, status is `sent` (not already completed/expired/cancelled).
3. App fetches product info (name, image URL) from Shopware API using stored merchant credentials.
4. Page renders: product info, star rating selector (1–5), title field, body field, name field (pre-filled from `customer_name`).
5. Customer submits review.
6. App creates `review` record:
   - If merchant has `auto_approve_enabled = true` and submitted `rating >= auto_approve_min_rating` → `status = 'approved'`, `moderated_at = NOW()`.
   - Otherwise → `status = 'pending'`.
   - `verified_purchase = true`.
7. App updates `review_request`: `status = 'completed'`.
8. Page shows thank-you confirmation.

**Why a standalone page (not a storefront redirect):** The app controls the entire UX — no dependency on the merchant's storefront theme, works reliably regardless of storefront URL changes, simpler to implement, and the page can be styled with the shop's name and product info fetched from the Shopware API.

### 7.5 Order cancellation / refund

1. Shopware fires order cancellation/refund webhook → `POST /api/webhooks/order-cancelled`.
2. App verifies HMAC signature.
3. App queries `review_requests` for the order with `status = 'scheduled'` (not yet sent).
4. Updates matching rows to `status = 'cancelled'`.
5. Already-sent requests (`status = 'sent'`) are left as-is — the customer may still submit a review. This is an acceptable edge case for MVP.

### 7.6 Merchant moderation

1. Merchant opens admin module (iframe in Shopware admin).
2. Shopware iframe handshake authenticates the merchant (see Section 10).
3. Merchant views pending reviews → approves or rejects each.
4. Merchant can reply to any review (reply is publicly visible on storefront widget).
5. Approved reviews appear on the storefront widget on next page load.

---

## 8. Widget & storefront integration

### Auto-injection

The app includes a storefront JavaScript bundle at:

```
apps/shopware/LoyaltyApp/Resources/app/storefront/dist/storefront/js/loyalty-app/loyalty-app.js
```

Shopware automatically loads this script on every storefront page after the app is installed. No merchant configuration or snippet-copying is needed.

### Widget behavior

1. On page load, the script checks if the current page is a product detail page (by detecting Shopware's product detail page data attributes / `window.salesChannelContext`).
2. If yes, it reads the product ID from the page context.
3. It calls `GET {app-domain}/api/widget/reviews?shopId={shopId}&productId={productId}`.
4. It renders:
   - **Star rating summary:** average rating (visual stars) + total review count.
   - **Reviews list:** approved reviews showing rating, title, body, author name, date, and merchant reply (if any).
   - **Pagination** if more than 10 reviews.
5. It injects **JSON-LD structured data** (see Section 9) into the page `<head>`.

### Styling

The widget uses scoped CSS (namespaced class names, e.g., `.la-widget-*`) to avoid conflicts with the merchant's theme. Styles are neutral and minimal to blend with most Shopware themes.

---

## 9. SEO — Structured data

The storefront widget injects JSON-LD into the page `<head>` to enable Google rich results (star ratings in search):

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Product Name",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "reviewCount": "42"
  },
  "review": [
    {
      "@type": "Review",
      "author": { "@type": "Person", "name": "Jane Doe" },
      "datePublished": "2026-01-15",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": "5"
      },
      "reviewBody": "Great product!",
      "name": "Love it"
    }
  ]
}
```

Only the most recent approved reviews (up to 10) are included in the JSON-LD to keep the payload reasonable.

---

## 10. Security & GDPR

### Authentication & authorization

| Context | Mechanism |
|---|---|
| Webhook endpoints | Shopware HMAC signature verification (`shopware-app-signature` header) against stored `shop_secret` |
| Admin UI & API | Shopware iframe handshake: validate `shop-id`, `shop-url`, `timestamp`, and `sw-version` query params against HMAC signed with `shop_secret` |
| Review submission | One-time-use token in URL; token must be in `sent` status and not expired |
| Cron endpoint | `CRON_SECRET` header (shared secret from ENV) |

### Credential storage

- `api_key`, `secret_key`, and `shop_secret` are encrypted at rest using AES-256-GCM.
- Encryption key stored in ENV: `ENCRYPTION_KEY`.

### Spam & abuse prevention

Since MVP only allows verified reviews (via tokenized email links), the primary protections are:
- **One-time-use tokens:** each token can submit exactly one review.
- **Token expiry:** tokens expire after 30 days (cleaned up by daily cron job).
- **Rate limiting:** widget API (`GET /api/widget/reviews`) rate-limited to 60 requests/min per IP to prevent scraping.
- **Input validation:** all review text fields are sanitized and length-limited (title: 255 chars, body: 5000 chars).

### GDPR compliance

- **Data controller:** the merchant is the data controller; the app is a data processor.
- **Customer data deletion:** merchants use the admin UI (`POST /api/admin/gdpr/delete`) to delete all reviews and review_requests associated with a customer email.
- **Customer data export:** merchants use the admin UI (`GET /api/admin/gdpr/export?email=...`) to export all review data for a customer as JSON.
- **Customer-facing notice:** review request emails include a footer directing customers to contact the merchant for data requests (standard GDPR data-processor approach).
- **Data retention:** reviews are retained until the merchant explicitly deletes them or uninstalls the app. On uninstall, merchant data is soft-deleted (`active = false`) and permanently purged after 30 days.

---

## 11. Email system

### Provider: Postmark

- Transactional email via Postmark API (`postmark` npm package).
- Dedicated `packages/email/` module wraps the Postmark client with app-specific methods.

### Templates

Two email templates, each with English and German variants:

1. **Review request email:**
   - Subject: "How was your experience with {product_name}?" / "Wie war Ihre Erfahrung mit {product_name}?"
   - Body: product name, star rating CTA button, review link (`/submit-review/{token}`).
   - Footer: GDPR notice — "To request deletion of your data, contact {merchant_shop_url}."

2. **Review published notification** *(post-MVP):*
   - Notify customer that their review is now live on the store.

### Configuration

- Single Postmark server per environment (dev/staging/prod).
- Templates managed as code in `packages/email/templates/`.
- ENV variable: `POSTMARK_API_TOKEN`.
- Dev/test: use Postmark sandbox mode (no real emails sent).

---

## 12. Deployment & dev flow

### Development

- Local Next.js dev server (`pnpm dev`).
- ngrok to expose local endpoints for Shopware webhook delivery.
- Supabase free tier for local Postgres.
- Postmark sandbox for email testing.
- Local Shopware 6.7 instance for integration testing.

### Staging / Production

- **App hosting:** Vercel (single Next.js deployment handles API + admin UI + review pages).
- **Database:** Supabase (managed Postgres).
- **Cron:** Vercel Cron hitting `/api/cron/send-review-emails` every 5 minutes and `/api/cron/expire-tokens` daily.
- **Domain:** custom domain for the app (e.g., `loyalty-app.example.com`).

### CI/CD (GitHub Actions)

| Trigger | Steps |
|---|---|
| On PR | Lint (ESLint) → Type check (`tsc --noEmit`) → Unit tests (Vitest) → Prisma schema validation |
| On merge to main | All PR steps + `prisma migrate deploy` on staging DB → Deploy to Vercel |

### Database migrations

- Managed via **Prisma Migrate**.
- Developers create migrations locally with `prisma migrate dev`.
- Migration files are committed to the repo in `packages/db/prisma/migrations/`.
- CI/CD runs `prisma migrate deploy` (applies pending migrations, never generates new ones).

### Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (Supabase) |
| `ENCRYPTION_KEY` | AES-256 key for encrypting Shopware credentials |
| `POSTMARK_API_TOKEN` | Postmark API token |
| `CRON_SECRET` | Shared secret protecting the cron endpoints |
| `APP_URL` | Public URL of the app (e.g., ngrok URL in dev, production domain in prod) |
| `APP_NAME` | `LoyaltyApp` |

---

## 13. Observability

### Error tracking

- **Sentry** integrated in the Next.js app (server-side and client-side).
- All unhandled errors, webhook processing failures, and email send failures are reported.
- Source maps uploaded to Sentry during CI/CD build.

### Logging

- Structured JSON logging via `pino`.
- Key events logged at `info` level: app install/uninstall, webhook received, email sent, review submitted, review moderated.
- Errors and retries logged at `error` / `warn` levels.
- In development: pretty-printed logs to console.

### Health check

- `GET /api/health` returns 200 with `{ status: "ok", db: "connected" }` if the app is running and can reach the database.
- Can be used by uptime monitoring (e.g., UptimeRobot, Vercel's built-in checks).

### Metrics (post-MVP)

- Track: webhook processing latency, email send success/failure rate, review submission rate, widget API response times.

---

## 14. Testing plan

### Unit tests (Vitest)

- Webhook HMAC signature verification logic.
- Auto-approve logic (rating threshold evaluation, edge cases).
- Email scheduling logic (delay calculation, deduplication by order+product).
- Token generation, validation, and expiry.
- Settings validation and defaults.
- GDPR export/delete logic.

### Integration tests

- Simulate Shopware app registration handshake → verify merchant persisted with encrypted credentials.
- Simulate order webhook → verify `review_request` created with correct `scheduled_at`.
- Simulate review submission with valid token → verify review created with correct status and token marked `completed`.
- Simulate review submission with used/expired/invalid token → verify rejection.
- Simulate order cancellation webhook → verify pending `review_requests` cancelled.
- Simulate admin moderation actions → verify status changes.

### Manual end-to-end

- Install app in local Shopware 6.7 instance via ngrok.
- Place a test order → verify review request scheduled.
- Trigger cron → verify email sent (Postmark sandbox).
- Click review link → submit review → verify review appears in admin.
- Approve review → verify review appears on storefront widget.
- Test auto-approve: configure threshold, submit review meeting threshold, verify auto-approval.
- Test order cancellation → verify scheduled review requests are cancelled.

---

## 15. Acceptance criteria

- **Install flow:** App registration handshake completes; merchant record persisted with encrypted credentials; webhooks are active.
- **Settings:** Merchant can configure trigger event, delay, auto-approve rules, and locale from the admin UI.
- **Webhook flow:** Order webhook matching the configured trigger creates `review_request`(s) with correct `scheduled_at`. Non-matching events are ignored.
- **Deduplication:** Duplicate webhooks for the same order+product do not create duplicate review_requests.
- **Email flow:** Cron job sends due review request emails; Postmark reports delivery.
- **Review submission:** Customer submits review via tokenized link; review stored with correct status (auto-approved or pending based on settings). Token cannot be reused.
- **Cancellation:** Cancelling an order cancels any `scheduled` review_requests for that order.
- **Moderation:** Merchant can approve, reject, and reply to reviews from the admin UI.
- **Widget:** Approved reviews appear on the product detail page. Star rating summary is accurate. JSON-LD structured data is present in page source.
- **GDPR:** Merchant can export and delete all data for a given customer email.
- **Localization:** All customer-facing content (email, review page, widget) renders correctly in English and German.

---

## 16. References

- Shopware App system (6.6+): https://developer.shopware.com/docs/guides/plugins/apps/app-base-guide.html
- Shopware manifest reference: https://developer.shopware.com/docs/resources/references/app-reference/manifest-reference.html
- Shopware webhook events: https://developer.shopware.com/docs/guides/plugins/apps/webhook.html
- Prisma documentation: https://www.prisma.io/docs
- Postmark developer docs: https://postmarkapp.com/developer
- Schema.org Review: https://schema.org/Review
- Sentry Next.js SDK: https://docs.sentry.io/platforms/javascript/guides/nextjs/
