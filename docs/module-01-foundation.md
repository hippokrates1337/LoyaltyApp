# Module 01 — Foundation & Shared Utilities

**Status:** Complete
**Depends on:** Nothing (this is the base module)
**Required by:** All other modules

---

## Overview

This module establishes the shared utility layer that every other module depends on. It includes cryptographic functions (encryption/decryption of Shopware credentials, HMAC signature verification), structured logging, input validation helpers, cron endpoint protection, and a working health check with database connectivity.

All utilities are created in `apps/web/lib/` so they can be imported by any API route or page in the Next.js app.

---

## Architecture Context

```
apps/web/lib/
├── crypto.ts          # AES-256-GCM encrypt/decrypt
├── shopware-auth.ts   # Shopware-specific auth helpers (webhook sig, iframe handshake, registration sig, proof generation)
├── validation.ts      # Zod schemas for settings, review input, etc.
├── logger.ts          # Pino logger singleton
├── cron-auth.ts       # CRON_SECRET verification
├── rate-limit.ts      # Simple in-memory sliding-window rate limiter for widget API
└── errors.ts          # Shared error response helpers
```

These utilities are pure functions or thin wrappers with no database access of their own (except the health check route which tests DB connectivity). This makes them independently testable.

---

## Implementation Steps

### Step 1: Create the logger utility

- [x] Create `apps/web/lib/logger.ts`
- [x] Configure `pino` with JSON output in production, pretty-print in development
- [x] Export a singleton logger instance
- [x] Add child logger factory: `createLogger(context: string)` for named sub-loggers (e.g., `createLogger('webhooks')`)

**File:** `apps/web/lib/logger.ts`

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});

export function createLogger(context: string) {
  return logger.child({ context });
}
```

### Step 2: Create the encryption utility

- [x] Create `apps/web/lib/crypto.ts`
- [x] Implement `encrypt(plaintext: string): string` — AES-256-GCM, returns `iv:authTag:ciphertext` as a hex-encoded string
- [x] Implement `decrypt(encrypted: string): string` — reverses the above
- [x] Read `ENCRYPTION_KEY` from `process.env` (32-byte hex string → 256-bit key)
- [x] Throw a clear error if `ENCRYPTION_KEY` is missing or invalid length
- [x] Do NOT store the key in module-level state; read from env on each call (or lazy-init)

**Key design decisions:**
- Format: `{iv_hex}:{authTag_hex}:{ciphertext_hex}` — all components in a single string for easy DB storage
- IV: 12 bytes, randomly generated per encryption call
- Auth tag: 16 bytes (GCM default)

### Step 3: Create the Shopware auth helpers

- [x] Create `apps/web/lib/shopware-auth.ts`
- [x] Implement `verifyRegistrationSignature(queryString: string, signature: string): boolean`
  - HMAC-SHA256 of the query string using `APP_SECRET` env var
  - Compare against the `shopware-app-signature` header
- [x] Implement `verifyWebhookSignature(body: string, signature: string, shopSecret: string): boolean`
  - HMAC-SHA256 of the raw request body using the merchant's decrypted `shop_secret`
  - Compare against the `shopware-shop-signature` header
- [x] Implement `verifyIframeHandshake(queryParams: URLSearchParams, shopSecret: string): boolean`
  - Extract `shop-id`, `shop-url`, `timestamp`, `sw-version` from query params
  - Verify HMAC against the `shopware-shop-signature` param using the merchant's `shop_secret`
  - Also check that `timestamp` is not older than 5 minutes (to prevent replay attacks)
- [x] Implement `generateProof(shopId: string, shopUrl: string, appName: string, appSecret: string): string`
  - HMAC-SHA256 of `shopId + shopUrl + appName` using `appSecret`
  - Used during the registration handshake response
- [x] All comparisons use `crypto.timingSafeEqual` to prevent timing attacks
- [x] `safeCompare` handles malformed (non-hex) signature input gracefully (returns `false` instead of throwing)

### Step 4: Create shared error helpers

- [x] Create `apps/web/lib/errors.ts`
- [x] Define helper functions:
  - `jsonError(message: string, status: number): NextResponse`
  - `unauthorized(): NextResponse` (401)
  - `forbidden(): NextResponse` (403)
  - `notFound(): NextResponse` (404)
  - `badRequest(message: string): NextResponse` (400)
  - `serverError(message: string): NextResponse` (500)
- [x] These wrap `NextResponse.json(...)` with consistent error shape: `{ error: string }`

### Step 5: Create the cron auth utility

- [x] Create `apps/web/lib/cron-auth.ts`
- [x] Implement `verifyCronSecret(request: NextRequest): boolean`
  - Check `Authorization` header for `Bearer {CRON_SECRET}` value
  - Also accept `x-cron-secret` header as fallback (Vercel Cron uses `Authorization`)
- [x] Return `false` if `CRON_SECRET` env var is not set

### Step 6: Create validation schemas

- [x] Create `apps/web/lib/validation.ts`
- [x] Install `zod` as a dependency: `pnpm add zod --filter @loyalty/web`
- [x] Define Zod schemas:
  - `MerchantSettingsSchema` — validates the `settings_json` structure:
    ```typescript
    {
      review_trigger: z.enum(['order.placed', 'order.shipped', 'order.completed']),
      review_delay_days: z.number().int().min(0).max(30),
      auto_approve_enabled: z.boolean(),
      auto_approve_min_rating: z.number().int().min(1).max(5),
      locale: z.enum(['en', 'de']),
    }
    ```
  - `ReviewSubmissionSchema` — validates review form data:
    ```typescript
    {
      rating: z.number().int().min(1).max(5),
      title: z.string().min(1).max(255),
      body: z.string().min(1).max(5000),
      authorName: z.string().min(1).max(255),
    }
    ```
  - `GdprEmailSchema` — validates email param: `{ email: z.string().email() }`
- [x] Export TypeScript types inferred from schemas: `MerchantSettings`, `ReviewSubmission`, `GdprEmail`
- [x] Export default values for merchant settings:
  ```typescript
  export const DEFAULT_MERCHANT_SETTINGS: MerchantSettings = {
    review_trigger: 'order.completed',
    review_delay_days: 2,
    auto_approve_enabled: false,
    auto_approve_min_rating: 5,
    locale: 'en',
  };
  ```

### Step 7: Create rate limiter

- [x] Create `apps/web/lib/rate-limit.ts`
- [x] Implement a simple in-memory sliding-window rate limiter
- [x] Interface: `rateLimit(key: string, limit: number, windowMs: number): { success: boolean, remaining: number }`
- [x] Export `resetRateLimitStore()` helper for testing
- [x] Used by the widget API (60 req/min per IP)
- [x] Note: in-memory is acceptable for MVP; will not survive server restarts or work across multiple instances

### Step 8: Wire up the health check

- [x] Update `apps/web/app/api/health/route.ts`:
  - Import `prisma` from `@loyalty/db`
  - Run `SELECT 1` raw query to verify DB connectivity
  - Return `{ status: 'ok', db: 'connected' }` on success
  - Return `{ status: 'error', db: 'disconnected' }` with 503 on failure
  - Log health check results using the logger

### Step 9: Install dependencies and configure tooling

- [x] Add `pino-pretty` as a dev dependency: `pnpm add -D pino-pretty --filter @loyalty/web`
- [x] Add `zod` as a dependency: `pnpm add zod --filter @loyalty/web`
- [x] Create `apps/web/vitest.config.ts` with path alias support (`@` → project root)

---

## Testing

### Unit tests (Vitest)

Create `apps/web/lib/__tests__/` directory with the following test files:

- [x] `crypto.test.ts` (9 tests)
  - Encrypt then decrypt returns original plaintext
  - Different plaintexts produce different ciphertexts
  - Encrypting the same plaintext twice produces different ciphertexts (random IV)
  - Decrypt with wrong key throws
  - Decrypt tampered ciphertext throws (GCM auth failure)
  - Missing ENCRYPTION_KEY throws descriptive error
  - Invalid ENCRYPTION_KEY length throws descriptive error
  - Handles empty string plaintext
  - Handles unicode plaintext

- [x] `shopware-auth.test.ts` (15 tests)
  - `verifyRegistrationSignature` returns true for valid signature
  - `verifyRegistrationSignature` returns false for invalid signature
  - `verifyRegistrationSignature` returns false for non-hex signature without throwing
  - `verifyRegistrationSignature` returns false for tampered query string
  - `verifyRegistrationSignature` throws when APP_SECRET is missing
  - `verifyWebhookSignature` returns true for valid HMAC
  - `verifyWebhookSignature` returns false for tampered body
  - `verifyWebhookSignature` returns false for wrong secret
  - `verifyIframeHandshake` returns true for valid params
  - `verifyIframeHandshake` returns false for expired timestamp
  - `verifyIframeHandshake` returns false when signature is missing
  - `verifyIframeHandshake` returns false when timestamp is missing
  - `verifyIframeHandshake` returns false for wrong shop secret
  - `generateProof` produces expected HMAC
  - `generateProof` different inputs produce different proofs

- [x] `validation.test.ts` (24 tests)
  - `MerchantSettingsSchema` accepts valid settings
  - `MerchantSettingsSchema` accepts all valid trigger values
  - `MerchantSettingsSchema` rejects invalid trigger values
  - `MerchantSettingsSchema` rejects out-of-range delay_days (negative, too high, non-integer)
  - `MerchantSettingsSchema` rejects invalid auto_approve_min_rating (below 1, above 5)
  - `MerchantSettingsSchema` rejects invalid locale
  - `MerchantSettingsSchema` accepts German locale
  - `MerchantSettingsSchema` validates DEFAULT_MERCHANT_SETTINGS
  - `ReviewSubmissionSchema` accepts valid submission
  - `ReviewSubmissionSchema` rejects rating outside 1–5, non-integer rating
  - `ReviewSubmissionSchema` rejects empty/too-long title, body, authorName
  - `GdprEmailSchema` accepts valid email, rejects invalid/empty email

- [x] `cron-auth.test.ts` (7 tests)
  - Returns true when Authorization header matches CRON_SECRET
  - Returns true when x-cron-secret header matches
  - Returns false when header is missing
  - Returns false when header has wrong value
  - Returns false when Authorization header uses wrong scheme
  - Returns false when CRON_SECRET env is not set
  - Prefers Authorization header over x-cron-secret

- [x] `rate-limit.test.ts` (6 tests)
  - Allows requests under the limit
  - Tracks remaining count correctly
  - Blocks requests over the limit
  - Resets after the time window passes
  - Different keys are independent
  - Sliding window evicts old entries

### Running tests

```bash
cd apps/web
pnpm vitest run lib/__tests__/
```

**Result:** 61 tests passing across 5 test files.

---

## Acceptance Criteria

- [x] `encrypt()` / `decrypt()` round-trip works correctly
- [x] All three Shopware signature verification functions work with known test vectors
- [x] Validation schemas correctly accept/reject inputs per the defined rules
- [x] Health check returns 200 with `{ status: 'ok', db: 'connected' }` when DB is reachable
- [x] Health check returns 503 when DB is unreachable
- [x] Logger outputs structured JSON in production mode
- [x] All unit tests pass (`pnpm vitest run lib/__tests__/`)
- [x] No TypeScript errors (`pnpm type-check`)
- [x] No lint errors (`pnpm lint`)
