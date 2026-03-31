# Agent Context: `apps/web/lib/`

This folder contains the shared utility layer for the LoyaltyApp Next.js application. Every API route and page in `apps/web/` imports from here. These modules have **no database access** of their own — they are pure functions and thin wrappers, which makes them independently testable.

---

## Project overview

LoyaltyApp is an open-source reviews and social proof app for Shopware Cloud (6.6+). It is a **single Next.js application** (App Router) hosted as a pnpm monorepo:

```
loyalty/
├── apps/web/              ← Next.js app (API routes, admin UI, review pages)
│   ├── app/api/           ← All backend API routes
│   ├── app/admin/         ← Merchant admin UI (rendered in Shopware admin iframe)
│   ├── app/submit-review/ ← Customer review submission page (standalone)
│   └── lib/               ← THIS FOLDER — shared utilities
├── packages/db/           ← Prisma schema, client, migrations (@loyalty/db)
└── packages/email/        ← Postmark email service (@loyalty/email)
```

## Files in this folder

| File | Purpose | Exports |
|---|---|---|
| `logger.ts` | Pino structured logger | `logger` (singleton), `createLogger(context)` |
| `crypto.ts` | AES-256-GCM encryption for Shopware credentials | `encrypt(plaintext)`, `decrypt(encrypted)` |
| `shopware-auth.ts` | Shopware HMAC signature verification | `verifyRegistrationSignature()`, `verifyWebhookSignature()`, `verifyIframeHandshake()`, `generateProof()` |
| `errors.ts` | Consistent JSON error responses | `jsonError()`, `unauthorized()`, `forbidden()`, `notFound()`, `badRequest()`, `serverError()` |
| `cron-auth.ts` | Cron endpoint protection | `verifyCronSecret(request)` |
| `validation.ts` | Zod schemas and defaults | `MerchantSettingsSchema`, `ReviewSubmissionSchema`, `GdprEmailSchema`, `DEFAULT_MERCHANT_SETTINGS`, types |
| `rate-limit.ts` | In-memory sliding-window rate limiter | `rateLimit(key, limit, windowMs)`, `resetRateLimitStore()` |
| `request-helpers.ts` | Read raw body + parse JSON from NextRequest | `readRawBodyAndJson(request)` |

## How each utility is consumed

### `crypto.ts`
- **Used by:** `/api/app/register` (encrypt `shopSecret`), `/api/app/confirm` (encrypt `apiKey` + `secretKey`), any route that reads merchant credentials (decrypt).
- **Env:** Requires `ENCRYPTION_KEY` (64-char hex string = 32 bytes). Reads from env on every call — not cached at module level.
- **Format:** Encrypted strings are stored in the DB as `{iv_hex}:{authTag_hex}:{ciphertext_hex}`.

### `shopware-auth.ts`
- **`verifyRegistrationSignature`** — Used by `GET /api/app/register`. Signs the query string with `APP_SECRET` env var. Shopware sends the signature in the `shopware-app-signature` header.
- **`verifyWebhookSignature`** — Used by `POST /api/app/confirm`, `POST /api/app/uninstall`, and all webhook routes (`/api/webhooks/*`). Signs the raw request body with the merchant's decrypted `shop_secret`. Shopware sends the signature in the `shopware-shop-signature` header.
- **`verifyIframeHandshake`** — Used by admin API routes (`/api/admin/*`). Verifies query params signed with the merchant's `shop_secret`. Rejects timestamps older than 5 minutes.
- **`generateProof`** — Used by `GET /api/app/register` to return the proof in the registration handshake response.
- **Security:** All comparisons use `crypto.timingSafeEqual`. The internal `safeCompare` gracefully handles malformed (non-hex) input.

### `errors.ts`
- **Used by:** Every API route. All error helpers return `NextResponse.json({ error: string }, { status })`.

### `cron-auth.ts`
- **Used by:** `/api/cron/send-review-emails`, `/api/cron/expire-tokens`.
- **Accepts:** `Authorization: Bearer {secret}` or `x-cron-secret: {secret}` header.
- **Env:** Requires `CRON_SECRET`. Returns `false` if not set.

### `validation.ts`
- **`MerchantSettingsSchema`** — Validates merchant settings JSON (`review_trigger`, `review_delay_days`, `auto_approve_enabled`, `auto_approve_min_rating`, `locale`).
- **`ReviewSubmissionSchema`** — Validates review form submissions (`rating` 1-5, `title` max 255, `body` max 5000, `authorName` max 255).
- **`GdprEmailSchema`** — Validates email parameter for GDPR export/delete.
- **`DEFAULT_MERCHANT_SETTINGS`** — Used when creating new merchant records during app registration.

### `request-helpers.ts`
- **Used by:** `POST /api/app/confirm`, `POST /api/app/uninstall`, and all webhook routes (`/api/webhooks/*`).
- **`readRawBodyAndJson(request)`** — Reads the request body as raw text (for HMAC signature verification) and then parses it as JSON, returning both. This avoids consuming the body stream twice.

### `rate-limit.ts`
- **Used by:** `GET /api/widget/reviews` (60 requests/min per IP).
- **Limitation:** In-memory only — does not persist across restarts or work across multiple server instances. Acceptable for MVP.

### `logger.ts`
- **Used by:** All API routes via `createLogger('context-name')`.
- **Behavior:** JSON output in production, pretty-printed in development. Level controlled by `LOG_LEVEL` env var (defaults to `info` in prod, `debug` in dev).

## Environment variables these utilities depend on

| Variable | Used by | Description |
|---|---|---|
| `ENCRYPTION_KEY` | `crypto.ts` | 64-char hex string (32 bytes) for AES-256-GCM |
| `APP_SECRET` | `shopware-auth.ts` | Shared secret for Shopware app registration signatures |
| `CRON_SECRET` | `cron-auth.ts` | Shared secret protecting cron endpoints |
| `APP_URL` | `request-helpers.ts` (via register route) | Public URL of the app (used to build `confirmation_url`) |
| `APP_NAME` | register route | App name for Shopware proof generation (defaults to `LoyaltyApp`) |
| `LOG_LEVEL` | `logger.ts` | Optional. Overrides default log level |
| `NODE_ENV` | `logger.ts` | Controls pretty-print vs JSON output |

## Testing

Tests live in `apps/web/lib/__tests__/`. Run with:

```bash
cd apps/web && npx vitest run lib/__tests__/
```

61 tests across 5 files: `crypto.test.ts`, `shopware-auth.test.ts`, `validation.test.ts`, `cron-auth.test.ts`, `rate-limit.test.ts`.

Route-level tests live in `apps/web/app/api/app/__tests__/`. Run with:

```bash
cd apps/web && npx vitest run app/api/app/__tests__/
```

22 tests across 3 files: `register.test.ts`, `confirm.test.ts`, `uninstall.test.ts`.

## Key conventions

- **No database access** in this folder. DB queries belong in API route handlers, which import `prisma` from `@loyalty/db`.
- **Env vars are read at call time**, not cached at module level (except `logger.ts` which configures once at import).
- **Error responses** always use the `{ error: string }` shape via `errors.ts` helpers.
- **Path alias:** `@/` maps to `apps/web/` (configured in `tsconfig.json`). Import as `@/lib/crypto`, `@/lib/errors`, etc.
- **TypeScript strict mode** is enabled. All exports are fully typed.
