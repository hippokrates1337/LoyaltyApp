# Module 03 — Webhook Handling & Review Request Scheduling

**Status:** Not started
**Depends on:** Module 01 (crypto, shopware-auth, logger, validation), Module 02 (merchants in DB)
**Required by:** Module 04 (email cron), Module 05 (review submission)

---

## Overview

This module implements the Shopware webhook handlers that listen for order state changes and create review requests accordingly. When an order reaches the merchant's configured trigger state (placed, shipped, or completed), the app creates a `review_request` for each product in the order with a unique token and a scheduled send time. When an order is cancelled, any pending (not-yet-sent) review requests are cancelled.

This is the engine that drives the entire review collection flow — without it, no emails are scheduled and no reviews can be collected.

---

## Architecture Context

**Files modified/created:**
```
apps/web/app/api/webhooks/order/route.ts              # Order state change handler
apps/web/app/api/webhooks/order-cancelled/route.ts     # Order cancellation handler
apps/web/app/api/webhooks/_helpers/authenticate.ts     # Shared webhook auth (DB-accessing helper)
apps/web/lib/crypto.ts                                 # Add generateToken() to existing file
apps/web/lib/webhook-helpers.ts                        # Event matching + payload extraction (pure, no DB)
```

**Dependencies used:**
```
apps/web/lib/crypto.ts         → decrypt(), generateToken()
apps/web/lib/shopware-auth.ts  → verifyWebhookSignature()
apps/web/lib/logger.ts         → createLogger()
apps/web/lib/errors.ts         → unauthorized(), serverError()
apps/web/lib/request-helpers.ts → readRawBodyAndJson()
apps/web/lib/validation.ts     → MerchantSettings (type)
packages/db/                   → prisma client (Merchant, ReviewRequest models)
```

**Webhook payload flow:**
```
Shopware order event ──POST /api/webhooks/order──▶ App
  │
  ├─ Verify HMAC signature using merchant's shop_secret
  ├─ Check if event matches merchant's configured review_trigger
  ├─ For each line item product:
  │   ├─ Check dedup: review_request exists for (order_id, product_id)?
  │   ├─ Generate cryptographic token (URL-safe, 48 bytes)
  │   └─ Insert review_request with scheduled_at = now + delay_days
  └─ Return 200

Shopware cancel event ──POST /api/webhooks/order-cancelled──▶ App
  │
  ├─ Verify HMAC signature
  ├─ Find scheduled review_requests for this order
  ├─ Set status = 'cancelled'
  └─ Return 200
```

---

## Shopware Webhook Payload Reference

Understanding the Shopware webhook payload structure is critical. Here are the relevant shapes:

### Order state change webhook (`checkout.order.placed`, `state_enter.order.state.completed`, `state_enter.order_delivery.state.shipped`)

```json
{
  "data": {
    "payload": {
      "order": {
        "id": "order-uuid",
        "orderNumber": "10001",
        "orderCustomer": {
          "email": "customer@example.com",
          "firstName": "Jane",
          "lastName": "Doe"
        },
        "lineItems": [
          {
            "productId": "product-uuid",
            "label": "Product Name",
            "type": "product",
            "quantity": 1
          }
        ]
      }
    },
    "event": "checkout.order.placed"
  },
  "source": {
    "url": "https://shop.example.com",
    "shopId": "shop-id-123",
    "appVersion": "0.0.1"
  },
  "timestamp": 1707500000
}
```

### Order cancellation webhook (`state_enter.order.state.cancelled`)

```json
{
  "data": {
    "payload": {
      "order": {
        "id": "order-uuid"
      }
    },
    "event": "state_enter.order.state.cancelled"
  },
  "source": {
    "url": "https://shop.example.com",
    "shopId": "shop-id-123",
    "appVersion": "0.0.1"
  },
  "timestamp": 1707500000
}
```

**Note:** Shopware webhook payloads vary between versions. The implementation should safely access nested properties and handle missing fields gracefully. The exact payload structure should be verified against a real Shopware 6.7 instance during integration testing.

---

## Event-to-Trigger Mapping

The merchant configures `review_trigger` in their settings. This maps to Shopware events as follows:

| `review_trigger` setting | Shopware event(s) that match |
|---|---|
| `order.placed` | `checkout.order.placed` |
| `order.shipped` | `state_enter.order_delivery.state.shipped` |
| `order.completed` | `state_enter.order.state.completed` |

The webhook handler receives ALL order events (because all three are registered in `manifest.xml`) and must filter by the merchant's configured trigger.

---

## Implementation Steps

### Step 1: Create token generation utility

- [ ] Add to `apps/web/lib/crypto.ts` (which already imports `randomBytes` from `node:crypto`):
  ```typescript
  export function generateToken(): string {
    return randomBytes(48).toString('base64url');
  }
  ```
- [ ] Tokens must be URL-safe (base64url encoding), 48 bytes → 64 characters
- [ ] Add a unit test in `apps/web/lib/__tests__/crypto.test.ts` confirming tokens are unique across many generations and are URL-safe

### Step 2: Create webhook event mapping helper

- [ ] Create `apps/web/lib/webhook-helpers.ts`
- [ ] Implement `matchesTrigger(eventName: string, triggerSetting: string): boolean`:
  ```typescript
  const EVENT_TO_TRIGGER: Record<string, string> = {
    'checkout.order.placed': 'order.placed',
    'state_enter.order_delivery.state.shipped': 'order.shipped',
    'state_enter.order.state.completed': 'order.completed',
  };

  export function matchesTrigger(eventName: string, triggerSetting: string): boolean {
    return EVENT_TO_TRIGGER[eventName] === triggerSetting;
  }
  ```
- [ ] Implement `extractOrderData(payload: any)` to safely extract order ID, customer info, and line items from the webhook payload
  - Return a typed object or `null` if the payload is malformed
  - Filter line items to only include `type === 'product'` (exclude promotions, discounts, etc.)

### Step 3: Implement `POST /api/webhooks/order`

- [ ] Open `apps/web/app/api/webhooks/order/route.ts`
- [ ] Read raw body and parse JSON using the request helper
- [ ] Extract `source.shopId` from the payload
- [ ] Look up merchant by `shopId` — if not found or not active, return 401
- [ ] Decrypt `shopSecret` and verify webhook signature — if invalid, return 401
- [ ] Extract the event name from `data.event`
- [ ] Parse merchant's `settingsJson` and check if event matches `review_trigger`
  - If no match → return `200 { acknowledged: true, action: 'ignored' }` (always return 200 to Shopware)
- [ ] Extract order data: order ID, customer email, customer name, product line items
- [ ] For each product line item:
  - Attempt to create a review request using `createMany` or individual creates with conflict handling:
    ```typescript
    await prisma.reviewRequest.create({
      data: {
        merchantId: merchant.id,
        orderId: order.id,
        productId: lineItem.productId,
        customerEmail: customer.email,
        customerName: `${customer.firstName} ${customer.lastName}`,
        token: generateToken(),
        scheduledAt: new Date(Date.now() + settings.review_delay_days * 24 * 60 * 60 * 1000),
        status: 'scheduled',
      },
    });
    ```
  - Handle unique constraint violation on `(orderId, productId)` gracefully — skip the duplicate (idempotency)
- [ ] Return `200 { acknowledged: true, action: 'scheduled', count: N }`
- [ ] Log: event received, trigger match/mismatch, number of review requests created

**Idempotency note:** Shopware may send the same webhook multiple times. The unique constraint on `(order_id, product_id)` ensures deduplication. Catch Prisma's `P2002` (unique constraint violation) error and skip silently.

### Step 4: Implement `POST /api/webhooks/order-cancelled`

- [ ] Open `apps/web/app/api/webhooks/order-cancelled/route.ts`
- [ ] Read raw body and parse JSON
- [ ] Extract `source.shopId` and verify merchant + signature (same as order webhook)
- [ ] Extract order ID from `data.payload.order.id`
- [ ] Cancel all scheduled (not yet sent) review requests for this order:
  ```typescript
  const result = await prisma.reviewRequest.updateMany({
    where: {
      merchantId: merchant.id,
      orderId,
      status: 'scheduled',
    },
    data: { status: 'cancelled' },
  });
  ```
  Uses `merchantId: merchant.id` (consistent with the Module 02 uninstall handler pattern — look up merchant first, then use its ID).
- [ ] Return `200 { acknowledged: true, cancelled: result.count }`
- [ ] Log: order cancellation processed, number of requests cancelled

**Important:** Only cancel `status = 'scheduled'` requests. Requests with `status = 'sent'` (email already delivered) are left as-is per the design document.

### Step 5: Extract shared webhook authentication into a helper

- [ ] Create `apps/web/app/api/webhooks/_helpers/authenticate.ts`
  - This file lives **with the routes, not in `lib/`**, because it performs database access (`prisma.merchant.findUnique`). The `lib/` folder convention (established in Module 01) is pure functions with no DB access.
- [ ] Implement `authenticateWebhook(request: NextRequest): Promise<{ merchant: Merchant, rawBody: string, json: Record<string, unknown> } | NextResponse>`
  - Uses `readRawBodyAndJson()` from `@/lib/request-helpers`
  - Extracts `source.shopId` from the parsed JSON
  - Looks up merchant by `shopId` — returns `unauthorized()` if not found or `active === false`
  - Decrypts `shopSecret` via `decrypt()` from `@/lib/crypto`
  - Verifies `shopware-shop-signature` header via `verifyWebhookSignature()` from `@/lib/shopware-auth`
  - Returns the authenticated merchant + parsed body, or a NextResponse error
  - This deduplicates the auth logic across both webhook routes (and follows the same pattern used in Module 02's confirm/uninstall routes)
- [ ] The underscore prefix (`_helpers/`) signals to Next.js that this is not a route segment

---

## Testing

### Unit tests

Create `apps/web/app/api/webhooks/__tests__/` with:

- [ ] `order.test.ts`
  - Valid webhook with matching trigger → creates review_request(s) with correct `scheduled_at`
  - Valid webhook with non-matching trigger → returns 200 but creates nothing
  - Multiple line items → creates one review_request per product
  - Non-product line items (type !== 'product') are skipped
  - Duplicate webhook (same order+product) → does not create duplicate (idempotent)
  - Invalid signature → returns 401
  - Unknown shopId → returns 401
  - Inactive merchant → returns 401
  - `scheduled_at` is correctly calculated: `now + review_delay_days * 86400000`
  - Generated tokens are unique and URL-safe

- [ ] `order-cancelled.test.ts`
  - Cancels all `scheduled` review_requests for the order
  - Does NOT cancel `sent` review_requests
  - Returns correct count of cancelled requests
  - No matching requests → returns 200 with cancelled: 0
  - Invalid signature → returns 401

Create `apps/web/lib/__tests__/webhook-helpers.test.ts` (in the lib test directory, consistent with Module 01 convention for lib utilities):

- [ ] `matchesTrigger` returns true for matching event/setting pairs
- [ ] `matchesTrigger` returns false for non-matching pairs
- [ ] `matchesTrigger` returns false for unknown events
- [ ] `extractOrderData` correctly parses a valid payload
- [ ] `extractOrderData` returns null for malformed payloads

### Test fixtures

Create `apps/web/__tests__/fixtures/webhooks.ts` with factory functions for generating test webhook payloads:

```typescript
export function createOrderWebhookPayload(overrides?: Partial<...>) { ... }
export function createCancelWebhookPayload(overrides?: Partial<...>) { ... }
export function signPayload(body: string, secret: string): string { ... }
```

### Running tests

```bash
cd apps/web
pnpm vitest run app/api/webhooks/__tests__/
```

---

## Acceptance Criteria

- [ ] Order webhook matching configured trigger creates review_request(s) with correct `scheduled_at`
- [ ] Each review_request has a unique, URL-safe token
- [ ] Non-matching events are acknowledged (200) but ignored
- [ ] Duplicate webhooks for the same order+product do not create duplicate requests
- [ ] Non-product line items are excluded
- [ ] Order cancellation cancels only `scheduled` requests (not `sent`)
- [ ] All webhook endpoints verify HMAC signatures and reject invalid ones
- [ ] Inactive merchants are rejected
- [ ] All operations are logged at appropriate levels
- [ ] All unit/integration tests pass
- [ ] No TypeScript errors (`pnpm type-check`)
- [ ] No lint errors (`pnpm lint`)
