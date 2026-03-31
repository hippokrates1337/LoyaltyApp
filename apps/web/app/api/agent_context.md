# Agent Context: `apps/web/app/api/`

This folder contains all backend API routes for the LoyaltyApp. Every file is a Next.js App Router [route handler](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) exporting HTTP method functions (`GET`, `POST`). There are no React components here — only server-side request handlers.

---

## Project overview

LoyaltyApp is an open-source reviews & social proof app for Shopware Cloud (6.6+). This API layer handles:

- Shopware app installation lifecycle (register → confirm → uninstall)
- Webhook processing for order events
- Widget data for the storefront
- Customer review submissions via tokenized links
- Merchant admin operations (moderation, settings, GDPR)
- Scheduled jobs (email sending, token expiry)

```
apps/web/app/api/
├── app/                          # Shopware lifecycle ✅ implemented
│   ├── register/route.ts         #   GET  — registration handshake
│   ├── confirm/route.ts          #   POST — credential confirmation
│   └── uninstall/route.ts        #   POST — soft-delete on uninstall
├── webhooks/                     # Order event handlers (stubs)
│   ├── order/route.ts            #   POST — order state changes
│   └── order-cancelled/route.ts  #   POST — cancellation/refund
├── widget/
│   └── reviews/route.ts          # GET  — public reviews for storefront (stub)
├── review-submission/
│   └── [token]/route.ts          # GET + POST — token-authenticated review page (stub)
├── admin/                        # Merchant admin API (stubs)
│   ├── dashboard/route.ts        #   GET  — summary stats
│   ├── reviews/
│   │   ├── route.ts              #   GET  — list reviews with filters
│   │   └── [id]/
│   │       ├── approve/route.ts  #   POST — approve review
│   │       ├── reject/route.ts   #   POST — reject review
│   │       └── reply/route.ts    #   POST — merchant reply
│   ├── settings/route.ts         #   GET + POST — merchant settings
│   └── gdpr/
│       ├── export/route.ts       #   GET  — export customer data
│       └── delete/route.ts       #   POST — delete customer data
├── cron/                         # Scheduled jobs (stubs)
│   ├── send-review-emails/route.ts  # GET — send due review emails
│   └── expire-tokens/route.ts      # GET — expire old tokens
└── health/route.ts               # GET  — health check ✅ implemented
```

**Legend:** "✅ implemented" = production logic in place. "stub" = route file exists with correct signature and JSDoc but returns placeholder data (TODO comments describe the required implementation).

---

## Route groups and their authentication

| Group | Path prefix | Auth mechanism | Utility used |
|---|---|---|---|
| **Shopware lifecycle** | `/api/app/*` | HMAC signature from Shopware | `verifyRegistrationSignature()` (register), `verifyWebhookSignature()` (confirm, uninstall) |
| **Webhooks** | `/api/webhooks/*` | HMAC signature per merchant `shopSecret` | `verifyWebhookSignature()` |
| **Widget** | `/api/widget/*` | None (public), CORS restricted to shop domain | Rate-limited via `rateLimit()` |
| **Review submission** | `/api/review-submission/*` | One-time-use token in URL path | Token lookup in DB |
| **Admin** | `/api/admin/*` | Shopware iframe handshake | `verifyIframeHandshake()` |
| **Cron** | `/api/cron/*` | `CRON_SECRET` header | `verifyCronSecret()` |
| **Health** | `/api/health` | None (public) | — |

---

## Shared dependencies (`apps/web/lib/`)

Every route imports from the shared utility layer. See `apps/web/lib/agent_context.md` for full details.

| Import | From | Used by |
|---|---|---|
| `prisma` | `@loyalty/db` | All routes (database access) |
| `encrypt()`, `decrypt()` | `@/lib/crypto` | `/api/app/*`, any route reading merchant credentials |
| `verifyRegistrationSignature()` | `@/lib/shopware-auth` | `/api/app/register` |
| `verifyWebhookSignature()` | `@/lib/shopware-auth` | `/api/app/confirm`, `/api/app/uninstall`, `/api/webhooks/*` |
| `verifyIframeHandshake()` | `@/lib/shopware-auth` | `/api/admin/*` |
| `generateProof()` | `@/lib/shopware-auth` | `/api/app/register` |
| `verifyCronSecret()` | `@/lib/cron-auth` | `/api/cron/*` |
| `rateLimit()` | `@/lib/rate-limit` | `/api/widget/reviews` |
| `readRawBodyAndJson()` | `@/lib/request-helpers` | `/api/app/confirm`, `/api/app/uninstall`, `/api/webhooks/*` |
| `createLogger()` | `@/lib/logger` | All routes |
| `badRequest()`, `unauthorized()`, `serverError()`, etc. | `@/lib/errors` | All routes |
| `DEFAULT_MERCHANT_SETTINGS`, `MerchantSettingsSchema`, etc. | `@/lib/validation` | `/api/app/register`, `/api/admin/settings` |

---

## Implementation status by module

| Module | Routes | Status | Doc |
|---|---|---|---|
| **Module 01** — Foundation | (lib utilities only) | ✅ Complete | `docs/module-01-foundation.md` |
| **Module 02** — Shopware Lifecycle | `/api/app/register`, `/api/app/confirm`, `/api/app/uninstall` | ✅ Complete | `docs/module-02-shopware-lifecycle.md` |
| **Module 03** — Webhooks | `/api/webhooks/order`, `/api/webhooks/order-cancelled` | Stub | — |
| **Module 04** — Review Submission | `/api/review-submission/[token]` | Stub | — |
| **Module 05** — Widget API | `/api/widget/reviews` | Stub | — |
| **Module 06** — Cron Jobs | `/api/cron/send-review-emails`, `/api/cron/expire-tokens` | Stub | — |
| **Module 07** — Admin API | `/api/admin/*` (all routes) | Stub | — |
| **Health** | `/api/health` | ✅ Complete | — |

---

## Implemented routes — key details

### `GET /api/app/register`

Shopware app registration handshake. Shopware sends `shop-id`, `shop-url`, `timestamp` as query params with an `shopware-app-signature` HMAC header.

- Verifies signature against `APP_SECRET` env var.
- Generates a random 64-byte hex `shopSecret`.
- Upserts merchant record (handles reinstall case).
- Returns `{ proof, secret, confirmation_url }`.
- Env vars: `APP_SECRET`, `APP_URL`, `APP_NAME`, `ENCRYPTION_KEY`.

### `POST /api/app/confirm`

Receives API credentials from Shopware after registration.

- Body: `{ apiKey, secretKey, timestamp, shopUrl, shopId }`.
- Signature header: `shopware-shop-signature` (HMAC of body using merchant's `shopSecret`).
- Encrypts `apiKey` and `secretKey` with AES-256-GCM before storing.
- Sets `merchant.active = true`.

### `POST /api/app/uninstall`

Soft-deletes merchant on app uninstall.

- Body: `{ source: { shopId } }` (Shopware webhook format).
- Signature header: `shopware-shop-signature`.
- Runs a Prisma `$transaction`:
  1. Sets `merchant.active = false`.
  2. Cancels all `scheduled` review requests (`status → 'cancelled'`).
- Already-sent requests are left as-is.

### `GET /api/health`

Returns `{ status: "ok", db: "connected" }` (200) or `{ status: "error", db: "disconnected" }` (503).

---

## Stub routes — implementation guidance

All stubs follow the same pattern: correct function signature, JSDoc describing the endpoint, and TODO comments outlining the implementation steps. When implementing a stub:

1. Follow the TODO steps in order.
2. Use the auth utility matching the route group (see table above).
3. Import `prisma` from `@loyalty/db` for all DB access.
4. Use `createLogger('context-name')` and log key events at `info` level.
5. Return errors via `@/lib/errors` helpers (consistent `{ error: string }` shape).
6. Wrap the handler body in try/catch, returning `serverError()` on unexpected failures.

### Webhook stubs (`/api/webhooks/*`)

Both routes need:
- `readRawBodyAndJson()` for body parsing + HMAC verification.
- Merchant lookup by `source.shopId` from the webhook payload.
- `verifyWebhookSignature()` with the merchant's decrypted `shopSecret`.
- Idempotency: deduplicate by `(order_id, product_id)` for review requests.

### Admin stubs (`/api/admin/*`)

All admin routes need:
- `verifyIframeHandshake()` on the request's query params.
- Merchant lookup by the `shop-id` query param.
- Scoping: every query must be filtered by `merchantId` to prevent cross-merchant data access.

### Cron stubs (`/api/cron/*`)

Both routes need:
- `verifyCronSecret()` — returns 401 if the secret doesn't match.
- Batch processing with a cap (e.g., `LIMIT 50` for email sending).

---

## Database models used

Routes interact with three Prisma models (schema in `packages/db/prisma/schema.prisma`):

| Model | Key fields | Used by |
|---|---|---|
| `Merchant` | `shopId` (unique), `shopUrl`, `apiKey`, `secretKey`, `shopSecret` (all encrypted), `settingsJson` (JSONB), `active` | All routes |
| `Review` | `merchantId`, `productId`, `rating`, `title`, `body`, `authorName`, `authorEmail`, `status` (`pending`/`approved`/`rejected`), `merchantReply` | Admin, widget, review-submission |
| `ReviewRequest` | `merchantId`, `orderId`, `productId`, `customerEmail`, `token` (unique), `scheduledAt`, `status` (`scheduled`/`sent`/`completed`/`expired`/`cancelled`) | Webhooks, cron, review-submission, uninstall |

Key indexes:
- `reviews`: composite `(merchantId, productId, status)` — for widget queries.
- `review_requests`: `(status, scheduledAt)` — for cron polling; unique on `token`; unique on `(orderId, productId)` — dedup.

---

## Testing

### Existing tests

Tests live in `__tests__/` directories alongside the routes they cover:

```
apps/web/app/api/app/__tests__/
├── register.test.ts    # 9 tests
├── confirm.test.ts     # 7 tests
└── uninstall.test.ts   # 6 tests
```

Run with:
```bash
cd apps/web && npx vitest run app/api/app/__tests__/
```

### Test conventions

- **Mock `@loyalty/db`** at the module level with `vi.mock()`. Create mock functions inside the factory (not as top-level `const` variables — use inline `vi.fn()` and access via `vi.mocked(prisma.…)`).
- **Mock `@/lib/crypto`** with passthrough fakes: `encrypt` prefixes with `encrypted:`, `decrypt` strips the prefix.
- **Do NOT mock `@/lib/shopware-auth`** in lifecycle tests — real HMAC functions run end-to-end for signature verification coverage.
- Use `vi.resetAllMocks()` in `beforeEach` and re-apply default implementations after reset.
- Build requests with `new NextRequest(url, { method, headers, body })`.
- Compute valid HMAC signatures in tests using `node:crypto` `createHmac`.

### Running all tests

```bash
cd apps/web && npx vitest run          # 83 tests (61 lib + 22 route)
cd apps/web && npx tsc --noEmit        # Type check
```

---

## Environment variables

| Variable | Used by | Description |
|---|---|---|
| `APP_SECRET` | `/api/app/register` | Shopware app secret for registration signature verification + proof generation |
| `APP_URL` | `/api/app/register` | Public app URL (for `confirmation_url` in registration response) |
| `APP_NAME` | `/api/app/register` | App name for proof HMAC (defaults to `LoyaltyApp`) |
| `ENCRYPTION_KEY` | Any route using `encrypt()`/`decrypt()` | AES-256-GCM key (64-char hex) |
| `CRON_SECRET` | `/api/cron/*` | Shared secret protecting cron endpoints |
| `DATABASE_URL` | Prisma (all routes) | Postgres connection string |
| `POSTMARK_API_TOKEN` | `/api/cron/send-review-emails` | Postmark API for transactional email |

---

## Key conventions

- **Path alias:** `@/` maps to `apps/web/` (tsconfig). Import as `@/lib/crypto`, etc.
- **Error shape:** All error responses use `{ error: string }` via `@/lib/errors` helpers.
- **Logging:** Every route creates a logger with `createLogger('route-context')`. Log lifecycle events at `info`, failures at `error`/`warn`.
- **Signature verification:** Always verify BEFORE any DB writes. Return 401 on failure — do not reveal whether the issue is a missing merchant vs. bad signature.
- **Transactions:** Use `prisma.$transaction([...])` when multiple writes must be atomic (e.g., uninstall).
- **Body reading:** For POST routes needing HMAC verification, use `readRawBodyAndJson()` to get both the raw text (for signature) and parsed JSON (for business logic) without double-consuming the stream.
- **TypeScript strict mode** is enabled. All route handlers are fully typed.
