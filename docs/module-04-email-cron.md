# Module 04 — Email System & Cron Jobs

**Status:** Not started
**Depends on:** Module 01 (cron-auth, logger, errors), Module 03 (review_requests in DB)
**Required by:** Module 05 (review submission — tokens must be in `sent` status)

---

## Overview

This module implements the two cron-driven background jobs that process review requests:

1. **Send review emails** (`/api/cron/send-review-emails`) — Runs every 5 minutes. Finds review requests where `scheduled_at` has passed and sends the review request email via Postmark, then marks them as `sent`.
2. **Expire tokens** (`/api/cron/expire-tokens`) — Runs daily. Finds review requests that were sent but never completed after 30 days, and marks them as `expired`.

It also enhances the `packages/email/` package with HTML email templates and proper error handling.

---

## Architecture Context

**Files modified:**
```
apps/web/app/api/cron/send-review-emails/route.ts   # Email sending cron
apps/web/app/api/cron/expire-tokens/route.ts         # Token expiry cron
packages/email/src/index.ts                          # Enhanced email service
packages/email/src/templates/                        # HTML email templates
```

**Dependencies used:**
```
apps/web/lib/cron-auth.ts      → verifyCronSecret()
apps/web/lib/logger.ts         → createLogger()
apps/web/lib/errors.ts         → unauthorized(), serverError()
packages/db/                   → prisma client (ReviewRequest, Merchant models)
packages/email/                → sendReviewRequestEmail()
```

**Cron flow:**
```
Vercel Cron / External cron
  │
  ├─ Every 5 min ──GET /api/cron/send-review-emails──▶ App
  │   │
  │   ├─ Verify CRON_SECRET
  │   ├─ Query: review_requests WHERE status='scheduled' AND scheduled_at <= NOW() LIMIT 50
  │   ├─ For each: send email via Postmark
  │   ├─ Update: status='sent', sent_at=NOW()
  │   └─ Return summary
  │
  └─ Daily ──GET /api/cron/expire-tokens──▶ App
      │
      ├─ Verify CRON_SECRET
      ├─ Query: review_requests WHERE status='sent' AND created_at < NOW()-30days
      ├─ Update: status='expired'
      └─ Return summary
```

---

## Implementation Steps

### Step 1: Enhance the email package with HTML templates

- [ ] Create `packages/email/src/templates/` directory
- [ ] Create `packages/email/src/templates/review-request.ts`
  - Export `getReviewRequestHtml(params)` — returns an HTML email body
  - The HTML should be a clean, responsive, single-column design that works in all major email clients
  - Content:
    - Greeting: "Hi {customerName},"
    - Message: "Thank you for purchasing {productName}! We'd love to hear about your experience."
    - CTA button: "Leave a Review" → links to `{reviewUrl}`
    - Footer: GDPR notice — "To request deletion of your data, contact {shopUrl}"
  - Support both `en` and `de` locales
  - Keep styles inline (email client compatibility)
- [ ] Update `packages/email/src/index.ts`:
  - Import and use the HTML template alongside the existing text body
  - Add `HtmlBody` to the Postmark `sendEmail` call
  - Add a `From` email using `APP_URL` domain or a configurable sender address (ENV: `EMAIL_FROM` with fallback to `reviews@{APP_URL_hostname}`)

### Step 2: Add error handling and retry awareness to the email service

- [ ] Update `sendReviewRequestEmail` to:
  - Return a result type: `{ success: boolean, messageId?: string, error?: string }`
  - Catch Postmark errors and return them instead of throwing
  - Log all send attempts (success and failure)
- [ ] Add a `validateEmailConfig()` function that checks `POSTMARK_API_TOKEN` is set, callable at startup

### Step 3: Implement `GET /api/cron/send-review-emails`

- [ ] Open `apps/web/app/api/cron/send-review-emails/route.ts`
- [ ] Verify `CRON_SECRET` using `verifyCronSecret(request)` — return 401 if invalid
- [ ] Query due review requests:
  ```typescript
  const dueRequests = await prisma.reviewRequest.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: { lte: new Date() },
    },
    include: {
      merchant: true,
    },
    take: 50,  // Batch size limit
    orderBy: { scheduledAt: 'asc' },  // Oldest first
  });
  ```
- [ ] For each request:
  1. Parse merchant's `settingsJson` to get locale
  2. Construct the review URL: `{APP_URL}/submit-review/{token}`
  3. Send email via `sendReviewRequestEmail()`
  4. If successful: update status to `sent`, set `sentAt = new Date()`
  5. If failed: log the error, skip (will be retried on next cron run)
- [ ] Track results: `{ sent: number, errors: number, total: number }`
- [ ] Return summary JSON
- [ ] Log summary at `info` level

**Important considerations:**
- Process requests sequentially (not `Promise.all`) to avoid overwhelming Postmark's rate limits
- If a single email fails, continue processing the rest — don't abort the batch
- The 50-request batch limit ensures we stay within Vercel's function execution time (default 10s, max 60s)

### Step 4: Implement `GET /api/cron/expire-tokens`

- [ ] Open `apps/web/app/api/cron/expire-tokens/route.ts`
- [ ] Verify `CRON_SECRET` — return 401 if invalid
- [ ] Calculate the expiry cutoff: `new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)`
- [ ] Expire old tokens:
  ```typescript
  const result = await prisma.reviewRequest.updateMany({
    where: {
      status: 'sent',
      createdAt: { lt: expiryCutoff },
    },
    data: { status: 'expired' },
  });
  ```
- [ ] Return `{ expired: result.count }`
- [ ] Log at `info` level

### Step 5: Add Vercel Cron configuration

- [ ] Create `apps/web/vercel.json` (or update if it exists):
  ```json
  {
    "crons": [
      {
        "path": "/api/cron/send-review-emails",
        "schedule": "*/5 * * * *"
      },
      {
        "path": "/api/cron/expire-tokens",
        "schedule": "0 3 * * *"
      }
    ]
  }
  ```
- [ ] Note: Vercel Cron automatically sends the `CRON_SECRET` as an `Authorization: Bearer {CRON_SECRET}` header when configured

---

## Testing

### Unit tests

Create `apps/web/app/api/cron/__tests__/` with:

- [ ] `send-review-emails.test.ts`
  - Returns 401 without valid CRON_SECRET
  - With no due requests → returns `{ sent: 0, errors: 0 }`
  - With due requests → sends emails and updates status to `sent`
  - Sets `sentAt` timestamp on sent requests
  - Only picks up `scheduled` requests (not `sent`, `completed`, etc.)
  - Only picks up requests where `scheduledAt <= now`
  - Processes at most 50 requests per run
  - A failed email send does not block other emails in the batch
  - Failed sends remain in `scheduled` status for retry

- [ ] `expire-tokens.test.ts`
  - Returns 401 without valid CRON_SECRET
  - Expires `sent` requests older than 30 days
  - Does NOT expire `scheduled` requests
  - Does NOT expire `completed` requests
  - Does NOT expire requests younger than 30 days
  - Returns correct count

### Email package tests

Create `packages/email/src/__tests__/` with:

- [ ] `templates.test.ts`
  - HTML template includes customer name, product name, review URL, shop URL
  - HTML template renders correctly for `en` locale
  - HTML template renders correctly for `de` locale
  - Text body matches expected format for both locales

- [ ] `index.test.ts`
  - `sendReviewRequestEmail` calls Postmark with correct parameters
  - Returns `{ success: true, messageId }` on success
  - Returns `{ success: false, error }` on Postmark error
  - Uses HTML and text body in the email

### Mock setup

For cron tests, mock the email package:
```typescript
vi.mock('@loyalty/email', () => ({
  sendReviewRequestEmail: vi.fn().mockResolvedValue({ success: true, messageId: 'test-id' }),
}));
```

### Running tests

```bash
# Cron tests
cd apps/web && pnpm vitest run app/api/cron/__tests__/

# Email package tests
cd packages/email && pnpm vitest run src/__tests__/
```

**Note:** Add `vitest` as a dev dependency to `packages/email` if not already present.

---

## Acceptance Criteria

- [ ] Cron endpoint is protected by `CRON_SECRET` — rejects unauthorized requests
- [ ] Due review requests (status=scheduled, scheduledAt<=now) have emails sent via Postmark
- [ ] Successfully sent requests are updated to status=sent with sentAt timestamp
- [ ] Failed email sends are logged but do not block the batch
- [ ] Batch size is limited to 50 per cron run
- [ ] Token expiry cron expires `sent` requests older than 30 days
- [ ] Email templates support English and German
- [ ] Email includes the correct review URL: `{APP_URL}/submit-review/{token}`
- [ ] Email includes GDPR notice footer
- [ ] Vercel Cron configuration is in place
- [ ] All unit tests pass
- [ ] No TypeScript errors (`pnpm type-check`)
- [ ] No lint errors (`pnpm lint`)
