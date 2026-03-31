# Module 06 — Widget API & Storefront JavaScript

**Status:** Not started
**Depends on:** Module 01 (rate-limit, logger, errors), Module 05 (approved reviews in DB)
**Required by:** Nothing (end-user facing; can be developed in parallel with Module 07/08)

---

## Overview

This module implements the public-facing storefront widget that displays product reviews and star ratings on Shopware product detail pages. It has two parts:

1. **Widget API** (`/api/widget/reviews`) — A public, CORS-restricted, rate-limited endpoint that returns approved reviews and aggregate rating data for a given product.
2. **Storefront JavaScript** (`loyalty-app.js`) — A self-contained vanilla JS bundle that Shopware auto-loads on every storefront page. It detects product detail pages, fetches reviews from the API, renders the review widget, and injects JSON-LD structured data for SEO.

---

## Architecture Context

**Files modified:**
```
apps/web/app/api/widget/reviews/route.ts                          # Widget API endpoint
apps/shopware/LoyaltyApp/Resources/app/storefront/dist/
  storefront/js/loyalty-app/loyalty-app.js                        # Storefront widget bundle
```

**Dependencies used:**
```
apps/web/lib/rate-limit.ts     → rateLimit()
apps/web/lib/logger.ts         → createLogger()
apps/web/lib/errors.ts         → badRequest(), serverError()
packages/db/                   → prisma client (Merchant, Review models)
```

**Widget flow:**
```
Shopware storefront page load
  │
  └─▶ loyalty-app.js (auto-loaded by Shopware)
       │
       ├─ Detect: is this a product detail page?
       │   └─ No → exit early
       │
       ├─ Yes → extract productId from Shopware page context
       │
       ├─ GET {APP_URL}/api/widget/reviews?shopId={shopId}&productId={productId}
       │   │
       │   ├─ Server: verify shopId, check CORS, rate limit
       │   ├─ Query approved reviews for (merchant, product)
       │   ├─ Calculate aggregate rating
       │   └─ Return { averageRating, totalCount, reviews[] }
       │
       ├─ Render widget DOM:
       │   ├─ Star rating summary (average + count)
       │   ├─ Reviews list (rating, title, body, author, date, merchant reply)
       │   └─ Pagination (if > 10 reviews)
       │
       └─ Inject JSON-LD structured data into <head>
```

---

## Implementation Steps

### Step 1: Implement `GET /api/widget/reviews`

- [ ] Open `apps/web/app/api/widget/reviews/route.ts`
- [ ] Extract query parameters: `shopId` (required), `productId` (required), `page` (optional, default 1), `limit` (optional, default 10, max 50)
- [ ] Validate required params — return 400 if missing
- [ ] Look up merchant by `shopId`:
  - If not found or not active → return 404 (don't reveal existence)
- [ ] Apply rate limiting: 60 requests/min per IP
  - Extract IP from `x-forwarded-for` header or `request.ip`
  - If over limit → return 429 `{ error: 'Rate limit exceeded' }` with `Retry-After` header
- [ ] Query approved reviews:
  ```typescript
  const [reviews, totalCount, aggregation] = await Promise.all([
    prisma.review.findMany({
      where: {
        merchantId: merchant.id,
        productId,
        status: 'approved',
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        authorName: true,
        createdAt: true,
        merchantReply: true,
        merchantReplyAt: true,
      },
    }),
    prisma.review.count({
      where: {
        merchantId: merchant.id,
        productId,
        status: 'approved',
      },
    }),
    prisma.review.aggregate({
      where: {
        merchantId: merchant.id,
        productId,
        status: 'approved',
      },
      _avg: { rating: true },
    }),
  ]);
  ```
- [ ] Build the response:
  ```json
  {
    "averageRating": 4.5,
    "totalCount": 42,
    "page": 1,
    "totalPages": 5,
    "reviews": [
      {
        "id": "...",
        "rating": 5,
        "title": "Love it",
        "body": "Great product!",
        "authorName": "Jane Doe",
        "createdAt": "2026-01-15T10:00:00Z",
        "merchantReply": "Thank you!",
        "merchantReplyAt": "2026-01-16T10:00:00Z"
      }
    ]
  }
  ```
- [ ] Set CORS headers:
  - `Access-Control-Allow-Origin`: set to the merchant's `shopUrl` (not `*`)
  - `Access-Control-Allow-Methods`: `GET, OPTIONS`
  - `Access-Control-Allow-Headers`: `Content-Type`
  - Also handle OPTIONS preflight requests
- [ ] Set cache headers: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (1-minute cache, 5-minute stale)
- [ ] Log requests at `debug` level (not `info` — this is a high-traffic endpoint)

### Step 2: Implement the storefront widget JavaScript

- [ ] Open `apps/shopware/LoyaltyApp/Resources/app/storefront/dist/storefront/js/loyalty-app/loyalty-app.js`
- [ ] This is a self-contained IIFE (no build step, no framework, vanilla JS)
- [ ] The widget must work without any external dependencies

**Widget structure:**

```javascript
(function() {
  'use strict';

  // Configuration
  const API_BASE = '__LOYALTY_APP_URL__'; // Replaced at build/deploy time, or read from data attribute
  
  // 1. Detect product detail page
  // 2. Extract product ID and shop ID
  // 3. Fetch reviews from API
  // 4. Render widget
  // 5. Inject JSON-LD
})();
```

#### Step 2a: Product page detection

- [ ] Detect product detail pages using Shopware's data attributes:
  ```javascript
  const productMeta = document.querySelector('[itemscope][itemtype*="schema.org/Product"]');
  // Alternative: check for Shopware's product detail page body class
  const isProductPage = document.body.classList.contains('is-ctl-product') || 
                        document.body.classList.contains('is-act-detail');
  ```
- [ ] Extract product ID from:
  - Shopware page context: `window.salesChannelContext` or page meta
  - A `<meta>` tag or `data-product-id` attribute on the product detail element
  - Fallback: look for Shopware's `product-detail` component `data-product-id`
- [ ] Extract shop ID from the page or a known data attribute
- [ ] **Configuration approach:** The `APP_URL` and `shopId` should be injected as `data-*` attributes on a script tag, or read from a known global variable set during app installation. For MVP, use a configurable constant that is set during deployment.

#### Step 2b: Fetch reviews

- [ ] Call `GET {API_BASE}/api/widget/reviews?shopId={shopId}&productId={productId}`
- [ ] Handle errors gracefully (network failure, 404, 429) — silently fail, don't break the page
- [ ] Support pagination: load additional pages on "Load more" click

#### Step 2c: Render the widget DOM

- [ ] Find the insertion point on the product detail page:
  - Insert after the product description section
  - Use Shopware's well-known selectors (e.g., `.product-detail-description-reviews` or `.product-detail-tabs`)
  - Fallback: append to the main product detail container
- [ ] Render the widget with scoped CSS (`.la-widget-*` class prefix):

**Widget HTML structure:**
```html
<div class="la-widget-container">
  <div class="la-widget-summary">
    <div class="la-widget-stars">★★★★☆</div>
    <span class="la-widget-rating-text">4.5 out of 5</span>
    <span class="la-widget-count">(42 reviews)</span>
  </div>
  
  <div class="la-widget-reviews">
    <div class="la-widget-review">
      <div class="la-widget-review-header">
        <span class="la-widget-review-stars">★★★★★</span>
        <span class="la-widget-review-title">Love it</span>
      </div>
      <p class="la-widget-review-body">Great product!</p>
      <div class="la-widget-review-meta">
        <span class="la-widget-review-author">Jane Doe</span>
        <span class="la-widget-review-date">Jan 15, 2026</span>
        <span class="la-widget-review-verified">✓ Verified Purchase</span>
      </div>
      <div class="la-widget-review-reply">
        <strong>Shop reply:</strong> Thank you!
      </div>
    </div>
  </div>
  
  <button class="la-widget-load-more">Load more reviews</button>
</div>
```

- [ ] Style rules:
  - All class names prefixed with `la-widget-` to avoid conflicts
  - Use neutral, minimal styling that blends with most themes
  - Star colors: `#f59e0b` (amber) for filled, `#d1d5db` (gray-300) for empty
  - Typography: inherit from parent (don't set font-family)
  - Responsive: stack elements vertically on mobile
  - All styles injected via a `<style>` tag with scoped selectors (not inline styles)

#### Step 2d: Inject JSON-LD structured data

- [ ] Build JSON-LD from the API response:
  ```javascript
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": productName, // Read from page
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": data.averageRating.toFixed(1),
      "reviewCount": data.totalCount.toString()
    },
    "review": data.reviews.slice(0, 10).map(r => ({
      "@type": "Review",
      "author": { "@type": "Person", "name": r.authorName },
      "datePublished": r.createdAt.split('T')[0],
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": r.rating.toString()
      },
      "reviewBody": r.body,
      "name": r.title
    }))
  };
  ```
- [ ] Inject into `<head>`:
  ```javascript
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(jsonLd);
  document.head.appendChild(script);
  ```
- [ ] Only include up to 10 reviews in the JSON-LD (per design doc)
- [ ] Only inject JSON-LD if there are reviews (averageRating > 0)

### Step 3: Add widget CSS as an embedded stylesheet

- [ ] Include all widget styles as a string constant inside `loyalty-app.js`
- [ ] Inject via `document.head.appendChild(styleElement)` on load
- [ ] Keep styles minimal and specificity low (single class selectors)

### Step 4: Handle the APP_URL configuration for the widget

- [ ] The storefront JS needs to know the app's URL to call the API
- [ ] **Approach for MVP:** During the app installation, Shopware makes the app's base URL available. The widget should read this from a Shopware cookie or a known data attribute
- [ ] **Practical fallback:** Embed the `APP_URL` as a configurable constant at the top of `loyalty-app.js`, documented as something the developer must set during deployment
- [ ] Add a `shopId` extraction method: read from Shopware's `window.shopId` or a `<meta name="loyalty-shop-id">` tag (injected by the app's configuration)

---

## Testing

### Unit tests for the widget API

Create `apps/web/app/api/widget/__tests__/` with:

- [ ] `reviews.test.ts`
  - Returns reviews for valid shopId + productId
  - Returns empty results for product with no reviews
  - Only returns approved reviews (not pending or rejected)
  - Calculates averageRating correctly
  - Pagination works: correct page/totalPages values
  - Returns 400 for missing shopId
  - Returns 400 for missing productId
  - Returns 404 for unknown shopId
  - Returns 404 for inactive merchant
  - Returns 429 when rate limit exceeded
  - CORS: `Access-Control-Allow-Origin` matches merchant's shopUrl
  - CORS: responds to OPTIONS preflight
  - Response includes merchantReply when present
  - Reviews are ordered by createdAt descending (newest first)
  - Limit param is capped at 50

### Widget JavaScript tests

Since the widget is vanilla JS, test it separately:

- [ ] Create `apps/shopware/__tests__/loyalty-app.test.ts`
  - **Note:** These tests may require a DOM environment (`jsdom`)
  - JSON-LD is correctly structured per schema.org spec
  - JSON-LD includes at most 10 reviews
  - JSON-LD is not injected when there are 0 reviews
  - Widget renders correct number of stars for different ratings
  - Widget gracefully handles API errors (no DOM exceptions)
  - Widget does nothing on non-product pages
  - All CSS classes use the `la-widget-` prefix

### Manual testing checklist

- [ ] Install the app in a local Shopware 6.7 instance
- [ ] Create test reviews in the database (approved status)
- [ ] Visit a product detail page in the storefront
- [ ] Verify widget renders with correct star ratings and reviews
- [ ] View page source: confirm JSON-LD is present and valid
- [ ] Test with Google's Rich Results Test tool
- [ ] Test pagination (create > 10 reviews)
- [ ] Test on mobile viewport
- [ ] Verify widget CSS doesn't conflict with the Shopware theme

### Running tests

```bash
cd apps/web
pnpm vitest run app/api/widget/__tests__/
```

---

## Acceptance Criteria

- [ ] Widget API returns approved reviews with correct aggregate data
- [ ] Widget API is CORS-restricted to the merchant's shop domain
- [ ] Widget API is rate-limited to 60 req/min per IP
- [ ] Widget API supports pagination
- [ ] Storefront JS auto-detects product detail pages and renders the widget
- [ ] Widget displays: star rating summary, review list (rating, title, body, author, date), merchant replies
- [ ] Widget has "Load more" pagination for > 10 reviews
- [ ] JSON-LD structured data is injected correctly (up to 10 reviews)
- [ ] JSON-LD validates against schema.org/Product with AggregateRating and Review
- [ ] Widget uses scoped CSS (`.la-widget-*` prefix) and doesn't break storefront themes
- [ ] Widget fails gracefully on API errors (no console errors, no broken page)
- [ ] Widget does nothing on non-product pages
- [ ] All unit tests pass
- [ ] No TypeScript errors (`pnpm type-check`)
- [ ] No lint errors (`pnpm lint`)
