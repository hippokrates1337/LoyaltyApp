# Module 02 — Shopware App Lifecycle

**Status:** Complete
**Depends on:** Module 01 (crypto, shopware-auth, logger, errors, validation)
**Required by:** Module 03 (webhooks), Module 07 (admin API)

---

## Overview

This module implements the Shopware app registration handshake — the three-endpoint flow that allows a merchant to install, confirm, and uninstall the LoyaltyApp from their Shopware store. Without this module, no merchants can exist in the database, so it is the gateway for all subsequent functionality.

The flow follows the Shopware App System protocol:
1. **Register** — Shopware sends shop metadata; app generates a shared secret and returns a proof
2. **Confirm** — Shopware sends API credentials; app encrypts and stores them
3. **Uninstall** — Shopware notifies app; app soft-deletes the merchant and cancels pending requests

---

## Architecture Context

**Files modified:**
```
apps/web/app/api/app/register/route.ts   # Registration handshake (GET)
apps/web/app/api/app/confirm/route.ts    # Confirmation with credentials (POST)
apps/web/app/api/app/uninstall/route.ts  # Uninstall soft-delete (POST)
apps/web/lib/request-helpers.ts          # Raw body + JSON reader helper
```

**Dependencies used:**
```
apps/web/lib/crypto.ts         → encrypt(), decrypt()
apps/web/lib/shopware-auth.ts  → verifyRegistrationSignature(), verifyWebhookSignature(), generateProof()
apps/web/lib/logger.ts         → createLogger()
apps/web/lib/errors.ts         → jsonError(), unauthorized(), badRequest(), serverError()
apps/web/lib/validation.ts     → DEFAULT_MERCHANT_SETTINGS
apps/web/lib/request-helpers.ts → readRawBodyAndJson()
packages/db/                   → prisma client (Merchant, ReviewRequest models)
```

**Environment variables used by this module:**
```
APP_SECRET       → Used by verifyRegistrationSignature() and generateProof()
APP_URL          → Used to build the confirmation_url in the register response
APP_NAME         → Used in proof generation (defaults to "LoyaltyApp")
ENCRYPTION_KEY   → Used by encrypt()/decrypt() for credential storage
```

**Shopware handshake flow:**
```
Shopware ──GET /api/app/register──▶ App (verify sig, create merchant, return proof+secret)
Shopware ──POST /api/app/confirm──▶ App (verify sig, encrypt+store credentials, activate)
Shopware ──POST /api/app/uninstall──▶ App (verify sig, deactivate merchant, cancel requests)
```

---

## Implementation Steps

### Step 1: Implement `GET /api/app/register`

- [x] Open `apps/web/app/api/app/register/route.ts`
- [x] Extract query parameters: `shop-id`, `shop-url`, `timestamp`
- [x] Extract the `shopware-app-signature` header
- [x] Verify the signature using `verifyRegistrationSignature()` from `lib/shopware-auth.ts`
  - The signature is an HMAC-SHA256 of the query string (everything after `?`) using `APP_SECRET`
  - If invalid → return 401
- [x] Generate a random `shopSecret` (64-byte hex string via `crypto.randomBytes(64).toString('hex')`)
- [x] Generate the proof using `generateProof()`:
  - HMAC-SHA256 of `{shopId}{shopUrl}{APP_NAME}` using `APP_SECRET`
- [x] Create or update the merchant record in the database:
  ```typescript
  await prisma.merchant.upsert({
    where: { shopId },
    create: {
      shopId,
      shopUrl,
      shopSecret: encrypt(shopSecret),
      apiKey: '',        // Will be filled during confirm
      secretKey: '',     // Will be filled during confirm
      settingsJson: DEFAULT_MERCHANT_SETTINGS,
      active: false,     // Not yet confirmed
    },
    update: {
      shopUrl,
      shopSecret: encrypt(shopSecret),
      active: false,
    },
  });
  ```
- [x] Return JSON response:
  ```json
  {
    "proof": "<hmac_hex>",
    "secret": "<shopSecret>",
    "confirmation_url": "{APP_URL}/api/app/confirm"
  }
  ```
- [x] Log the registration event at `info` level

**Important:** Uses `upsert` because a merchant may reinstall the app after uninstalling. The existing record is updated, not duplicated.

**Implementation notes:**
- Missing query params return 400 (bad request) with a descriptive message.
- Missing/invalid signature returns 401 (unauthorized).
- Missing `APP_SECRET` or `APP_URL` env vars return 500 (server error) — logged at `error` level.
- All errors are wrapped in a try/catch returning `serverError('Registration failed')`.

### Step 2: Implement `POST /api/app/confirm`

- [x] Open `apps/web/app/api/app/confirm/route.ts`
- [x] Read the raw request body as text (needed for signature verification) via `readRawBodyAndJson()`
- [x] Parse the body as JSON: `{ apiKey, secretKey, timestamp, shopUrl, shopId }`
- [x] Extract the `shopware-shop-signature` header
- [x] Look up the merchant by `shopId`
  - If not found → return 401 (registration must have happened first)
- [x] Decrypt the stored `shopSecret`
- [x] Verify the signature using `verifyWebhookSignature(rawBody, signature, shopSecret)`
  - If invalid → return 401
- [x] Encrypt and store the API credentials:
  ```typescript
  await prisma.merchant.update({
    where: { shopId },
    data: {
      apiKey: encrypt(apiKey),
      secretKey: encrypt(secretKey),
      active: true,
    },
  });
  ```
- [x] Return `200 OK` with `{ success: true }`
- [x] Log the confirmation event at `info` level

**Implementation notes:**
- Missing `shopId`, `apiKey`, or `secretKey` in the body returns 401 (unauthorized) — we don't reveal whether the issue is missing fields vs unknown shop.
- Uses `readRawBodyAndJson()` from `lib/request-helpers.ts` to avoid consuming the body stream twice.

### Step 3: Implement `POST /api/app/uninstall`

- [x] Open `apps/web/app/api/app/uninstall/route.ts`
- [x] Read the raw request body as text via `readRawBodyAndJson()`
- [x] Parse the body as JSON to extract `source.shopId`
- [x] Extract the `shopware-shop-signature` header
- [x] Look up the merchant by `shopId`
  - If not found → return 401
- [x] Decrypt `shopSecret` and verify webhook signature
  - If invalid → return 401
- [x] Soft-delete the merchant and cancel pending review requests in a transaction:
  ```typescript
  await prisma.$transaction([
    prisma.merchant.update({
      where: { shopId },
      data: { active: false },
    }),
    prisma.reviewRequest.updateMany({
      where: {
        merchantId: merchant.id,
        status: 'scheduled',
      },
      data: { status: 'cancelled' },
    }),
  ]);
  ```
- [x] Return `200 OK` with `{ success: true }`
- [x] Log the uninstall event at `info` level with the shopId

**Implementation notes:**
- Only `scheduled` review requests are cancelled. Already-sent requests (`status = 'sent'`) are left as-is — the customer may still submit a review.
- Uses `readRawBodyAndJson()` from `lib/request-helpers.ts`.
- The Shopware uninstall webhook payload wraps `shopId` in `source.shopId`.

### Step 4: Create a helper for reading raw body + parsed JSON

- [x] Create `apps/web/lib/request-helpers.ts`
- [x] Implement `readRawBodyAndJson(request: NextRequest): Promise<{ rawBody: string, json: Record<string, unknown> }>`
  - Reads body as text first (for signature verification), then parses as JSON
  - This avoids the issue of consuming the body stream twice
- [x] This helper is reused by the confirm route, uninstall route, and will be reused by webhook handlers in Module 03

---

## Testing

### Unit tests

Created `apps/web/app/api/app/__tests__/` with:

- [x] `register.test.ts` (9 tests)
  - Valid registration: correct signature → returns 200 with proof, secret, confirmation_url
  - Invalid signature → returns 401
  - Missing signature header → returns 401
  - Missing query params (shop-id, shop-url, timestamp) → returns 400
  - Re-registration (merchant already exists) → upserts, returns new secret each time
  - Proof is a valid HMAC of `shopId + shopUrl + appName`
  - Upsert is called with encrypted shopSecret and default settings

- [x] `confirm.test.ts` (7 tests)
  - Valid confirmation: correct signature → stores encrypted credentials, sets active=true, returns 200
  - Credentials are actually encrypted in DB (encrypt() called with raw values)
  - Invalid signature → returns 401
  - Missing signature header → returns 401
  - Unknown shopId → returns 401
  - Missing shopId in body → returns 401
  - Missing apiKey in body → returns 401

- [x] `uninstall.test.ts` (6 tests)
  - Valid uninstall: correct signature → calls $transaction, returns 200
  - Transaction receives 2 operations (merchant deactivate + review request cancel)
  - Invalid signature → returns 401
  - Missing signature header → returns 401
  - Unknown shopId → returns 401
  - Missing source.shopId → returns 401
  - Missing source object → returns 401

### Mocking strategy

Tests mock `@loyalty/db` (prisma client) and `@/lib/crypto` (encrypt/decrypt) at the module level using `vi.mock()`. Shopware auth functions are **not mocked** in the register test — the real HMAC logic runs end-to-end. Confirm and uninstall tests use real `verifyWebhookSignature` via the crypto mock's decrypt returning the expected secret.

`vi.resetAllMocks()` is used in `beforeEach` to ensure clean mock state between tests.

### Running tests

```bash
# Module 02 tests only
cd apps/web && npx vitest run app/api/app/__tests__/

# All tests (lib + routes)
cd apps/web && npx vitest run
```

**Test results:** 83 total tests passing (61 lib + 22 route).

---

## Acceptance Criteria

- [x] Full registration handshake works: register → confirm → merchant is active in DB with encrypted credentials
- [x] Re-registration (reinstall) works: existing merchant is updated, not duplicated
- [x] Uninstall soft-deletes merchant (active=false) and cancels all `scheduled` review_requests
- [x] All Shopware signatures are correctly verified using the appropriate secret
- [x] API credentials (`apiKey`, `secretKey`) and `shopSecret` are encrypted at rest (not stored as plaintext)
- [x] Invalid/missing signatures return 401
- [x] All lifecycle events are logged at `info` level
- [x] All unit/integration tests pass
- [x] No TypeScript errors (`pnpm type-check`)
- [x] No lint errors (`pnpm lint`)
