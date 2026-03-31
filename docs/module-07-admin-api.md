# Module 07 — Admin API

**Status:** Not started
**Depends on:** Module 01 (shopware-auth, validation, logger, errors, crypto), Module 02 (merchants in DB), Module 05 (reviews in DB)
**Required by:** Module 08 (admin UI)

---

## Overview

This module implements all the API endpoints that power the merchant admin UI. These endpoints are accessed from within Shopware's admin panel via an iframe, so every request must be authenticated using the Shopware iframe handshake protocol.

The admin API provides:
- **Dashboard** — Aggregate stats (total reviews, pending count, average rating)
- **Reviews management** — List, approve, reject, and reply to reviews
- **Settings** — Read and update merchant configuration
- **GDPR tools** — Export and delete customer review data

---

## Architecture Context

**Files modified:**
```
apps/web/app/api/admin/dashboard/route.ts            # Dashboard stats
apps/web/app/api/admin/reviews/route.ts              # List reviews
apps/web/app/api/admin/reviews/[id]/approve/route.ts # Approve review
apps/web/app/api/admin/reviews/[id]/reject/route.ts  # Reject review
apps/web/app/api/admin/reviews/[id]/reply/route.ts   # Reply to review
apps/web/app/api/admin/settings/route.ts             # Get/update settings
apps/web/app/api/admin/gdpr/export/route.ts          # Export customer data
apps/web/app/api/admin/gdpr/delete/route.ts          # Delete customer data
```

**New files:**
```
apps/web/lib/admin-auth.ts     # Iframe handshake authentication middleware
```

**Dependencies used:**
```
apps/web/lib/shopware-auth.ts  → verifyIframeHandshake()
apps/web/lib/crypto.ts         → decrypt()
apps/web/lib/validation.ts     → MerchantSettingsSchema, GdprEmailSchema
apps/web/lib/logger.ts         → createLogger()
apps/web/lib/errors.ts         → unauthorized(), badRequest(), notFound(), serverError()
packages/db/                   → prisma client (Merchant, Review, ReviewRequest models)
```

**Authentication flow:**
```
Shopware Admin
  │
  └─▶ Opens iframe → /admin?shop-id=X&shop-url=Y&timestamp=Z&sw-version=V&shopware-shop-signature=SIG
       │
       └─ All API calls from iframe include the same query params (passed via JS)
           │
           └─▶ /api/admin/* endpoints
                │
                ├─ Extract shop-id from query params or request headers
                ├─ Look up merchant by shop-id
                ├─ Decrypt shop_secret
                ├─ Verify HMAC signature of query params
                ├─ Check timestamp freshness (< 5 minutes)
                └─ Proceed with authenticated merchant context
```

---

## Shopware Iframe Handshake Protocol

When Shopware loads the admin module in an iframe, it appends authentication query parameters to the URL:

```
/admin?shop-id=abc123&shop-url=https://shop.example.com&timestamp=1707500000&sw-version=6.7.0.0&shopware-shop-signature=HMAC_HEX
```

The signature is computed as:
```
HMAC-SHA256(
  key: shop_secret,
  message: "shop-id=abc123&shop-url=https://shop.example.com&timestamp=1707500000&sw-version=6.7.0.0"
)
```

The admin frontend JS must capture these query params on initial load and pass them along with every API request (as query params or custom headers).

---

## Implementation Steps

### Step 1: Create the admin authentication middleware

- [ ] Create `apps/web/lib/admin-auth.ts`
- [ ] Implement `authenticateAdmin(request: NextRequest): Promise<Merchant | null>`:
  1. Extract query params: `shop-id`, `shop-url`, `timestamp`, `sw-version`, `shopware-shop-signature`
     - Accept these from either URL query params or custom headers (`x-shop-id`, `x-shop-url`, etc.)
     - The admin UI JS will pass them as headers on API calls
  2. Look up merchant by `shop-id`
  3. If not found or not active → return `null`
  4. Decrypt `shopSecret`
  5. Verify the iframe handshake signature using `verifyIframeHandshake()`
  6. If invalid → return `null`
  7. Return the authenticated merchant

- [ ] Create a wrapper: `withAdminAuth(handler: (request: NextRequest, merchant: Merchant) => Promise<NextResponse>): (request: NextRequest) => Promise<NextResponse>`
  - Calls `authenticateAdmin()`, returns 401 if null, otherwise calls the handler with the merchant
  - This reduces boilerplate in every admin route

### Step 2: Implement `GET /api/admin/dashboard`

- [ ] Open `apps/web/app/api/admin/dashboard/route.ts`
- [ ] Authenticate using `authenticateAdmin()` → return 401 if fails
- [ ] Query aggregate stats:
  ```typescript
  const [totalReviews, pendingCount, avgRating] = await Promise.all([
    prisma.review.count({ where: { merchantId: merchant.id } }),
    prisma.review.count({ where: { merchantId: merchant.id, status: 'pending' } }),
    prisma.review.aggregate({
      where: { merchantId: merchant.id, status: 'approved' },
      _avg: { rating: true },
    }),
  ]);
  ```
- [ ] Return:
  ```json
  {
    "totalReviews": 150,
    "pendingCount": 5,
    "approvedCount": 130,
    "rejectedCount": 15,
    "averageRating": 4.3
  }
  ```

### Step 3: Implement `GET /api/admin/reviews`

- [ ] Open `apps/web/app/api/admin/reviews/route.ts`
- [ ] Authenticate → 401
- [ ] Parse query parameters:
  - `status` (optional): filter by `pending`, `approved`, `rejected`
  - `productId` (optional): filter by product
  - `page` (optional, default 1)
  - `limit` (optional, default 20, max 100)
  - `search` (optional): search in title, body, authorName
- [ ] Query reviews:
  ```typescript
  const where = {
    merchantId: merchant.id,
    ...(status && { status }),
    ...(productId && { productId }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
        { authorName: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);
  ```
- [ ] Return:
  ```json
  {
    "reviews": [...],
    "total": 150,
    "page": 1,
    "totalPages": 8,
    "limit": 20
  }
  ```

### Step 4: Implement `POST /api/admin/reviews/[id]/approve`

- [ ] Open `apps/web/app/api/admin/reviews/[id]/approve/route.ts`
- [ ] Authenticate → 401
- [ ] Look up the review by `id` where `merchantId` matches the authenticated merchant
  - If not found → 404
- [ ] Update:
  ```typescript
  await prisma.review.update({
    where: { id },
    data: {
      status: 'approved',
      moderatedAt: new Date(),
    },
  });
  ```
- [ ] Return `{ success: true, reviewId: id, status: 'approved' }`
- [ ] Log at `info` level

### Step 5: Implement `POST /api/admin/reviews/[id]/reject`

- [ ] Open `apps/web/app/api/admin/reviews/[id]/reject/route.ts`
- [ ] Same pattern as approve, but set `status: 'rejected'`
- [ ] Return `{ success: true, reviewId: id, status: 'rejected' }`

### Step 6: Implement `POST /api/admin/reviews/[id]/reply`

- [ ] Open `apps/web/app/api/admin/reviews/[id]/reply/route.ts`
- [ ] Authenticate → 401
- [ ] Parse body: `{ reply: string }`
  - Validate: reply must be a non-empty string, max 2000 characters
  - To remove a reply, accept `{ reply: null }` or `{ reply: "" }`
- [ ] Look up review by ID + merchantId → 404 if not found
- [ ] Update:
  ```typescript
  await prisma.review.update({
    where: { id },
    data: {
      merchantReply: reply || null,
      merchantReplyAt: reply ? new Date() : null,
    },
  });
  ```
- [ ] Return `{ success: true, reviewId: id }`
- [ ] Log at `info` level

### Step 7: Implement `GET /api/admin/settings`

- [ ] Open `apps/web/app/api/admin/settings/route.ts`
- [ ] Authenticate → 401
- [ ] Return the merchant's `settingsJson`:
  ```typescript
  const settings = MerchantSettingsSchema.parse(merchant.settingsJson);
  return NextResponse.json(settings);
  ```
- [ ] If parsing fails (corrupt data), return `DEFAULT_MERCHANT_SETTINGS`

### Step 8: Implement `POST /api/admin/settings`

- [ ] Same file, POST handler
- [ ] Authenticate → 401
- [ ] Parse and validate body against `MerchantSettingsSchema.partial()` (partial update):
  ```typescript
  const body = await request.json();
  const currentSettings = MerchantSettingsSchema.parse(merchant.settingsJson);
  const merged = { ...currentSettings, ...body };
  const validated = MerchantSettingsSchema.parse(merged);
  ```
- [ ] If validation fails → return 400 with error details
- [ ] Update:
  ```typescript
  await prisma.merchant.update({
    where: { id: merchant.id },
    data: { settingsJson: validated },
  });
  ```
- [ ] Return `{ success: true, settings: validated }`
- [ ] Log at `info` level

### Step 9: Implement `GET /api/admin/gdpr/export`

- [ ] Open `apps/web/app/api/admin/gdpr/export/route.ts`
- [ ] Authenticate → 401
- [ ] Extract `email` from query params → validate with `GdprEmailSchema`
- [ ] Query all reviews and review requests for this email + merchant:
  ```typescript
  const [reviews, reviewRequests] = await Promise.all([
    prisma.review.findMany({
      where: { merchantId: merchant.id, authorEmail: email },
    }),
    prisma.reviewRequest.findMany({
      where: { merchantId: merchant.id, customerEmail: email },
    }),
  ]);
  ```
- [ ] Return the full data as JSON:
  ```json
  {
    "email": "customer@example.com",
    "reviews": [...],
    "reviewRequests": [...],
    "exportedAt": "2026-02-15T10:00:00Z"
  }
  ```

### Step 10: Implement `POST /api/admin/gdpr/delete`

- [ ] Open `apps/web/app/api/admin/gdpr/delete/route.ts`
- [ ] Authenticate → 401
- [ ] Parse body: `{ email: string }` → validate with `GdprEmailSchema`
- [ ] Delete all data in a transaction:
  ```typescript
  const [deletedReviews, deletedRequests] = await prisma.$transaction([
    prisma.review.deleteMany({
      where: { merchantId: merchant.id, authorEmail: email },
    }),
    prisma.reviewRequest.deleteMany({
      where: { merchantId: merchant.id, customerEmail: email },
    }),
  ]);
  ```
- [ ] Return `{ success: true, deletedReviews: deletedReviews.count, deletedRequests: deletedRequests.count }`
- [ ] Log at `info` level (include email hash, not full email, for audit trail)

---

## Testing

### Unit tests

Create `apps/web/app/api/admin/__tests__/` with:

- [ ] `admin-auth.test.ts`
  - Valid iframe params + signature → returns merchant
  - Invalid signature → returns null
  - Expired timestamp (> 5 minutes) → returns null
  - Unknown shop-id → returns null
  - Inactive merchant → returns null

- [ ] `dashboard.test.ts`
  - Returns correct counts (total, pending, approved, rejected)
  - Returns correct averageRating
  - Returns zeros when no reviews exist
  - Returns 401 without valid auth

- [ ] `reviews.test.ts`
  - Lists all reviews for the merchant (paginated)
  - Filters by status
  - Filters by productId
  - Search by title/body/authorName
  - Pagination: correct page, totalPages, limit
  - Does NOT return reviews belonging to other merchants
  - Returns 401 without valid auth

- [ ] `approve-reject.test.ts`
  - Approve: sets status to 'approved', sets moderatedAt
  - Reject: sets status to 'rejected', sets moderatedAt
  - Returns 404 for unknown review ID
  - Returns 404 for review belonging to another merchant
  - Returns 401 without valid auth

- [ ] `reply.test.ts`
  - Adds merchant reply and sets merchantReplyAt
  - Updates existing reply
  - Removes reply when empty string or null is sent
  - Returns 404 for unknown review or wrong merchant
  - Validates reply length (max 2000 chars)
  - Returns 401 without valid auth

- [ ] `settings.test.ts`
  - GET returns current settings
  - POST with partial update merges correctly
  - POST validates: rejects invalid trigger
  - POST validates: rejects delay_days > 30 or < 0
  - POST validates: rejects rating outside 1–5
  - POST validates: rejects invalid locale
  - Returns 401 without valid auth

- [ ] `gdpr.test.ts`
  - Export: returns all reviews + requests for the given email
  - Export: does not return data from other merchants
  - Export: returns empty arrays if no data exists
  - Export: validates email format
  - Delete: removes all reviews + requests for the email
  - Delete: does not affect data from other merchants
  - Delete: returns correct deletion counts
  - Delete: validates email format
  - Both endpoints return 401 without valid auth

### Test helper for admin auth

Create a test utility that generates valid iframe handshake parameters:

```typescript
// apps/web/__tests__/helpers/admin-auth.ts
export function createAdminAuthParams(shopId: string, shopSecret: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = new URLSearchParams({
    'shop-id': shopId,
    'shop-url': 'https://test-shop.example.com',
    'timestamp': timestamp,
    'sw-version': '6.7.0.0',
  });
  const signature = createHmac('sha256', shopSecret)
    .update(params.toString())
    .digest('hex');
  params.set('shopware-shop-signature', signature);
  return params;
}
```

### Running tests

```bash
cd apps/web
pnpm vitest run app/api/admin/__tests__/
```

---

## Acceptance Criteria

- [ ] All admin endpoints verify Shopware iframe handshake and return 401 for invalid auth
- [ ] Dashboard returns accurate aggregate stats
- [ ] Reviews list supports filtering by status, productId, and search, with correct pagination
- [ ] Approve/reject updates the review status and sets moderatedAt
- [ ] Reply adds/updates/removes the merchant reply
- [ ] Settings GET returns current settings; POST validates and merges partial updates
- [ ] GDPR export returns all customer data for the given email
- [ ] GDPR delete removes all customer data and returns deletion counts
- [ ] No endpoint leaks data from other merchants (tenant isolation)
- [ ] All actions are logged at appropriate levels
- [ ] All unit tests pass
- [ ] No TypeScript errors (`pnpm type-check`)
- [ ] No lint errors (`pnpm lint`)
