# Module 05 — Review Submission (API + Page)

**Status:** Not started
**Depends on:** Module 01 (validation, logger, errors), Module 03 (review_requests with tokens), Module 04 (tokens in `sent` status)
**Required by:** Module 06 (widget — reviews must exist), Module 07 (admin — reviews to moderate)

---

## Overview

This module implements the customer-facing review submission flow. After receiving an email with a tokenized link, the customer lands on a standalone page hosted by the app. The page validates the token, displays product information, and presents a review form. On submission, the review is created in the database with the appropriate status (auto-approved or pending moderation) and the token is marked as completed.

This module has two parts:
1. **API endpoints** — Token validation (GET) and review submission (POST) at `/api/review-submission/[token]`
2. **Frontend page** — The standalone review form at `/submit-review/[token]`

---

## Architecture Context

**Files modified:**
```
apps/web/app/api/review-submission/[token]/route.ts  # Token validation + review submission API
apps/web/app/submit-review/[token]/page.tsx          # Customer-facing review form page
```

**New files:**
```
apps/web/lib/shopware-api.ts                         # Shopware API client for fetching product info
apps/web/components/star-rating.tsx                   # Reusable star rating input component
apps/web/components/review-form.tsx                   # Review submission form component
apps/web/i18n/review-submission.ts                    # EN/DE translations for the review page
```

**Dependencies used:**
```
apps/web/lib/crypto.ts         → decrypt()
apps/web/lib/validation.ts     → ReviewSubmissionSchema
apps/web/lib/logger.ts         → createLogger()
apps/web/lib/errors.ts         → badRequest(), notFound(), serverError()
packages/db/                   → prisma client (ReviewRequest, Review, Merchant models)
```

**Submission flow:**
```
Customer clicks email link
  │
  └─▶ GET /submit-review/{token} (Next.js page)
       │
       ├─ Client calls GET /api/review-submission/{token}
       │   ├─ Validate token: exists, status='sent', not expired
       │   ├─ Fetch product info from Shopware API (name, image)
       │   └─ Return { productName, productImageUrl, customerName, shopName }
       │
       └─ Customer fills form and submits
           │
           └─ Client calls POST /api/review-submission/{token}
               ├─ Validate token (again)
               ├─ Validate input (rating, title, body, authorName)
               ├─ Determine status: auto-approve or pending
               ├─ Create review record
               ├─ Update review_request status to 'completed'
               └─ Return { success: true, status }
```

---

## Implementation Steps

### Step 1: Create the Shopware API client

- [ ] Create `apps/web/lib/shopware-api.ts`
- [ ] Implement `fetchProductInfo(merchant: Merchant, productId: string): Promise<ProductInfo | null>`
  - Decrypt merchant's `apiKey` and `secretKey`
  - Authenticate with Shopware's Admin API:
    1. POST to `{shopUrl}/api/oauth/token` with `grant_type: 'client_credentials'`, `client_id: apiKey`, `client_secret: secretKey`
    2. Use the returned `access_token` for subsequent requests
  - Fetch product: GET `{shopUrl}/api/product/{productId}` with `Authorization: Bearer {access_token}`
  - Extract and return: `{ name: string, imageUrl: string | null }`
  - Handle errors gracefully — if product fetch fails, return `null` (form can still work without product image)
  - Cache the OAuth token for the duration of the request (not across requests)

**Type definition:**
```typescript
interface ProductInfo {
  name: string;
  imageUrl: string | null;
}
```

**Important:** The Shopware API uses `client_credentials` OAuth flow. The `apiKey` is the `client_id` and `secretKey` is the `client_secret` provided during the app confirmation handshake.

### Step 2: Implement `GET /api/review-submission/[token]`

- [ ] Open `apps/web/app/api/review-submission/[token]/route.ts`
- [ ] Look up the review request by token:
  ```typescript
  const reviewRequest = await prisma.reviewRequest.findUnique({
    where: { token },
    include: { merchant: true },
  });
  ```
- [ ] Validate the token:
  - If not found → return 404 `{ error: 'Review link not found' }`
  - If `status !== 'sent'` → return appropriate error:
    - `completed` → 410 `{ error: 'This review has already been submitted' }`
    - `expired` → 410 `{ error: 'This review link has expired' }`
    - `cancelled` → 410 `{ error: 'This review request was cancelled' }`
    - `scheduled` → 400 `{ error: 'This review link is not yet active' }`
  - If merchant is not active → return 410 `{ error: 'This store is no longer active' }`
- [ ] Fetch product info from Shopware API (gracefully handle failure)
- [ ] Return:
  ```json
  {
    "productName": "Product Name",
    "productImageUrl": "https://...",
    "customerName": "Jane Doe",
    "shopName": "Example Shop",
    "locale": "en"
  }
  ```

### Step 3: Implement `POST /api/review-submission/[token]`

- [ ] In the same route file, implement the POST handler
- [ ] Look up and validate token (same logic as GET — extract into a shared helper within the file)
- [ ] Parse and validate the request body using `ReviewSubmissionSchema`:
  ```typescript
  const body = await request.json();
  const parsed = ReviewSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0].message);
  }
  ```
- [ ] Determine the review status:
  ```typescript
  const settings = MerchantSettingsSchema.parse(merchant.settingsJson);
  const status =
    settings.auto_approve_enabled && parsed.data.rating >= settings.auto_approve_min_rating
      ? 'approved'
      : 'pending';
  const moderatedAt = status === 'approved' ? new Date() : null;
  ```
- [ ] Create the review and update the request in a transaction:
  ```typescript
  await prisma.$transaction([
    prisma.review.create({
      data: {
        merchantId: merchant.id,
        productId: reviewRequest.productId,
        reviewRequestId: reviewRequest.id,
        rating: parsed.data.rating,
        title: parsed.data.title,
        body: parsed.data.body,
        authorName: parsed.data.authorName,
        authorEmail: reviewRequest.customerEmail,
        verifiedPurchase: true,
        status,
        moderatedAt,
      },
    }),
    prisma.reviewRequest.update({
      where: { id: reviewRequest.id },
      data: { status: 'completed' },
    }),
  ]);
  ```
- [ ] Return `{ success: true, status }`
- [ ] Log the review submission at `info` level

**Important:** The token is single-use. After submission, the review_request status changes to `completed`, preventing the same token from being used again.

### Step 4: Create translation strings

- [ ] Create `apps/web/i18n/review-submission.ts`
- [ ] Define translations for both `en` and `de`:
  ```typescript
  export const translations = {
    en: {
      pageTitle: 'Leave a Review',
      pageSubtitle: 'Share your experience with {productName}',
      ratingLabel: 'Rating',
      titleLabel: 'Title',
      titlePlaceholder: 'Summarize your experience',
      bodyLabel: 'Review',
      bodyPlaceholder: 'Tell others about your experience',
      nameLabel: 'Your name',
      submitButton: 'Submit Review',
      submitting: 'Submitting...',
      successTitle: 'Thank you!',
      successMessage: 'Your review has been submitted successfully.',
      successAutoApproved: 'Your review is now live on the store.',
      successPending: 'Your review will be published after moderation.',
      errorExpired: 'This review link has expired.',
      errorCompleted: 'This review has already been submitted.',
      errorCancelled: 'This review request was cancelled.',
      errorGeneric: 'Something went wrong. Please try again.',
      ratingRequired: 'Please select a rating',
      // Star labels
      star1: 'Terrible',
      star2: 'Poor',
      star3: 'Average',
      star4: 'Good',
      star5: 'Excellent',
    },
    de: {
      pageTitle: 'Bewertung abgeben',
      pageSubtitle: 'Teilen Sie Ihre Erfahrung mit {productName}',
      ratingLabel: 'Bewertung',
      titleLabel: 'Titel',
      titlePlaceholder: 'Fassen Sie Ihre Erfahrung zusammen',
      bodyLabel: 'Bewertung',
      bodyPlaceholder: 'Erzählen Sie anderen von Ihrer Erfahrung',
      nameLabel: 'Ihr Name',
      submitButton: 'Bewertung absenden',
      submitting: 'Wird gesendet...',
      successTitle: 'Vielen Dank!',
      successMessage: 'Ihre Bewertung wurde erfolgreich übermittelt.',
      successAutoApproved: 'Ihre Bewertung ist jetzt im Shop sichtbar.',
      successPending: 'Ihre Bewertung wird nach Prüfung veröffentlicht.',
      errorExpired: 'Dieser Bewertungslink ist abgelaufen.',
      errorCompleted: 'Diese Bewertung wurde bereits abgegeben.',
      errorCancelled: 'Diese Bewertungsanfrage wurde storniert.',
      errorGeneric: 'Etwas ist schief gelaufen. Bitte versuchen Sie es erneut.',
      ratingRequired: 'Bitte wählen Sie eine Bewertung',
      star1: 'Sehr schlecht',
      star2: 'Schlecht',
      star3: 'Durchschnittlich',
      star4: 'Gut',
      star5: 'Ausgezeichnet',
    },
  };
  ```

### Step 5: Build the star rating component

- [ ] Create `apps/web/components/star-rating.tsx`
- [ ] Interactive star rating input (1–5 stars)
- [ ] Props: `value: number`, `onChange: (rating: number) => void`, `labels?: string[]`
- [ ] Features:
  - Click to select rating
  - Hover preview (stars fill on hover)
  - Keyboard accessible (arrow keys to change, Enter to confirm)
  - `aria-label` for each star
  - Display text label below stars (e.g., "Excellent" for 5 stars)
- [ ] Styling: use Tailwind, golden/yellow star colors

### Step 6: Build the review form component

- [ ] Create `apps/web/components/review-form.tsx`
- [ ] Client component (`'use client'`)
- [ ] Props: `productName: string`, `productImageUrl: string | null`, `customerName: string`, `token: string`, `locale: 'en' | 'de'`
- [ ] Features:
  - Shows product name and image (if available)
  - Star rating selector (using StarRating component)
  - Title input (max 255 chars, required)
  - Body textarea (max 5000 chars, required)
  - Author name input (pre-filled with `customerName`, editable)
  - Client-side validation before submission
  - Submits to `POST /api/review-submission/{token}`
  - Shows loading state during submission
  - Shows success message after submission (with auto-approved vs pending info)
  - Shows error messages for validation failures or server errors
  - All labels in the correct locale

### Step 7: Update the review submission page

- [ ] Rewrite `apps/web/app/submit-review/[token]/page.tsx`
- [ ] This is a server component that:
  1. Calls `GET /api/review-submission/{token}` server-side (or directly queries the DB)
  2. If token is invalid: renders an error state with appropriate message
  3. If token is valid: renders the `ReviewForm` component with product info
- [ ] The page should be mobile-friendly, centered, clean layout
- [ ] Include the shop name in the page title
- [ ] Use the locale from the review request data

**Alternative approach (recommended):** Since this is a Next.js app, the page can directly access the database instead of calling the API endpoint. Extract the token validation logic into a shared function `validateToken(token: string)` in `apps/web/lib/review-tokens.ts` and use it from both the API route and the page component.

---

## Testing

### Unit tests

Create `apps/web/app/api/review-submission/__tests__/` with:

- [ ] `token-validation.test.ts`
  - Valid token (status=sent) → returns product info
  - Token not found → returns 404
  - Token already completed → returns 410
  - Token expired → returns 410
  - Token cancelled → returns 410
  - Token still scheduled → returns 400
  - Inactive merchant → returns 410

- [ ] `review-submission.test.ts`
  - Valid submission → creates review with correct data, marks token completed
  - Auto-approve enabled + rating >= threshold → review status is 'approved', moderatedAt is set
  - Auto-approve enabled + rating < threshold → review status is 'pending'
  - Auto-approve disabled → review status is 'pending' regardless of rating
  - Invalid rating (0, 6, non-integer) → returns 400
  - Empty title → returns 400
  - Title too long (>255 chars) → returns 400
  - Body too long (>5000 chars) → returns 400
  - Double submission (same token) → second attempt returns error (token is now 'completed')
  - `verifiedPurchase` is always true
  - `authorEmail` is taken from the review_request, not from user input

### Component tests

Create `apps/web/components/__tests__/` with:

- [ ] `star-rating.test.tsx`
  - Renders 5 stars
  - Clicking a star calls onChange with correct value
  - Displays correct label text
  - Keyboard navigation works (arrow keys)
  - Has proper aria attributes

- [ ] `review-form.test.tsx`
  - Renders product info when provided
  - Pre-fills author name
  - Validates required fields before submission
  - Shows loading state during submit
  - Shows success state after successful submit
  - Shows error state for server errors
  - Renders in correct locale

### Shopware API client tests

- [ ] `shopware-api.test.ts`
  - Successfully fetches product info (mock HTTP)
  - Returns null on API error (graceful degradation)
  - Correctly authenticates with client_credentials flow
  - Decrypts merchant credentials before use

### Running tests

```bash
cd apps/web
pnpm vitest run app/api/review-submission/__tests__/
pnpm vitest run components/__tests__/
pnpm vitest run lib/__tests__/shopware-api.test.ts
```

---

## Acceptance Criteria

- [ ] Valid token shows the review form with product info
- [ ] Invalid/expired/completed tokens show appropriate error messages
- [ ] Review submission creates a review with correct status (auto-approved or pending)
- [ ] Token is single-use: second submission attempt is rejected
- [ ] `verifiedPurchase` is always `true`
- [ ] `authorEmail` comes from the review_request, not user input
- [ ] Input validation enforces rating 1–5, title max 255 chars, body max 5000 chars
- [ ] Client-side validation matches server-side validation
- [ ] Star rating component is keyboard accessible
- [ ] Page works on mobile devices
- [ ] Page renders correctly in English and German
- [ ] Product info is fetched from Shopware API (with graceful fallback if unavailable)
- [ ] All unit and component tests pass
- [ ] No TypeScript errors (`pnpm type-check`)
- [ ] No lint errors (`pnpm lint`)
