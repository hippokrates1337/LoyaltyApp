# LoyaltyApp — Implementation Plan

**Source:** [MVP Design Document](./MVP%20design%20document.md)
**Created:** 2026-02-15

---

## Module Overview

The MVP is broken into 8 modules that can be developed and verified sequentially. Each module builds on the previous ones, but has a clear scope boundary, its own test suite, and well-defined acceptance criteria.

| # | Module | Description | Key Files | Depends On |
|---|--------|-------------|-----------|------------|
| 01 | [Foundation & Shared Utilities](./module-01-foundation.md) | Encryption, HMAC verification, logging, validation, rate limiting, health check | `apps/web/lib/*` | — |
| 02 | [Shopware App Lifecycle](./module-02-shopware-lifecycle.md) | Register, confirm, uninstall handshake with Shopware | `apps/web/app/api/app/*` | 01 |
| 03 | [Webhook Handling](./module-03-webhooks.md) | Order webhooks, review request scheduling, cancellation | `apps/web/app/api/webhooks/*` | 01, 02 |
| 04 | [Email System & Cron Jobs](./module-04-email-cron.md) | Review email sending (cron), token expiry (cron), HTML templates | `apps/web/app/api/cron/*`, `packages/email/*` | 01, 03 |
| 05 | [Review Submission](./module-05-review-submission.md) | Token validation, review form API + page, Shopware API client | `apps/web/app/api/review-submission/*`, `apps/web/app/submit-review/*` | 01, 03, 04 |
| 06 | [Widget API & Storefront JS](./module-06-widget.md) | Public reviews API, storefront widget, JSON-LD SEO | `apps/web/app/api/widget/*`, `apps/shopware/.../loyalty-app.js` | 01, 05 |
| 07 | [Admin API](./module-07-admin-api.md) | Dashboard, reviews CRUD, settings, GDPR endpoints | `apps/web/app/api/admin/*` | 01, 02, 05 |
| 08 | [Admin UI](./module-08-admin-ui.md) | Merchant admin interface in Shopware iframe | `apps/web/app/admin/*`, `apps/web/components/admin/*` | 07 |

---

## Dependency Graph

```
Module 01: Foundation
    │
    ├──▶ Module 02: Shopware Lifecycle
    │        │
    │        ├──▶ Module 03: Webhooks
    │        │        │
    │        │        ├──▶ Module 04: Email & Cron
    │        │        │        │
    │        │        │        └──▶ Module 05: Review Submission
    │        │        │                 │
    │        │        │                 ├──▶ Module 06: Widget (parallel with 07)
    │        │        │                 │
    │        │        │                 └──▶ Module 07: Admin API
    │        │        │                          │
    │        │        │                          └──▶ Module 08: Admin UI
    │        │        │
    │        │        └──▶ Module 07: Admin API (also depends on 02)
    │        │
    │        └──▶ Module 07: Admin API
    │
    └──▶ Module 06: Widget (also depends on 05)
```

**Parallelization opportunities:**
- Module 06 (Widget) and Module 07 (Admin API) can be developed in parallel after Module 05 is complete
- Module 08 (Admin UI) can begin as soon as Module 07 is complete

---

## Development Workflow

### For each module:

1. **Read** the module's implementation plan document
2. **Implement** each step, checking off items as you go
3. **Write tests** as specified in the testing section
4. **Run tests** to verify: `pnpm vitest run <test-path>`
5. **Run type check**: `pnpm type-check` (in `apps/web`)
6. **Run linter**: `pnpm lint` (in `apps/web`)
7. **Verify acceptance criteria** — all checkboxes should be checked
8. **Commit** the module with a descriptive message

### Prerequisites before starting

1. Ensure PostgreSQL is running and `DATABASE_URL` is set in `.env`
2. Run `pnpm install` at the repo root
3. Run `pnpm db:generate` to generate the Prisma client
4. Run `pnpm db:migrate:dev` to create database tables
5. Ensure `.env` has all required variables (see `.env.example`)

### Test database setup

For integration tests, use a separate test database or use Prisma's transaction-based test isolation:

```bash
# Option 1: Separate test database
DATABASE_URL=postgresql://postgres:password@localhost:5432/loyalty_test pnpm vitest run

# Option 2: Use the same database with cleanup in test setup
```

---

## Files Created by Each Module

### Module 01 — Foundation
```
NEW  apps/web/lib/logger.ts
NEW  apps/web/lib/crypto.ts
NEW  apps/web/lib/shopware-auth.ts
NEW  apps/web/lib/errors.ts
NEW  apps/web/lib/cron-auth.ts
NEW  apps/web/lib/validation.ts
NEW  apps/web/lib/rate-limit.ts
EDIT apps/web/app/api/health/route.ts
NEW  apps/web/lib/__tests__/crypto.test.ts
NEW  apps/web/lib/__tests__/shopware-auth.test.ts
NEW  apps/web/lib/__tests__/validation.test.ts
NEW  apps/web/lib/__tests__/cron-auth.test.ts
NEW  apps/web/lib/__tests__/rate-limit.test.ts
```

### Module 02 — Shopware Lifecycle
```
EDIT apps/web/app/api/app/register/route.ts
EDIT apps/web/app/api/app/confirm/route.ts
EDIT apps/web/app/api/app/uninstall/route.ts
NEW  apps/web/lib/request-helpers.ts
NEW  apps/web/app/api/app/__tests__/register.test.ts
NEW  apps/web/app/api/app/__tests__/confirm.test.ts
NEW  apps/web/app/api/app/__tests__/uninstall.test.ts
```

### Module 03 — Webhooks
```
EDIT apps/web/app/api/webhooks/order/route.ts
EDIT apps/web/app/api/webhooks/order-cancelled/route.ts
EDIT apps/web/lib/crypto.ts                                  # Add generateToken()
NEW  apps/web/lib/webhook-helpers.ts                         # Pure: event matching + payload extraction
NEW  apps/web/app/api/webhooks/_helpers/authenticate.ts      # DB-accessing webhook auth helper
NEW  apps/web/__tests__/fixtures/webhooks.ts
NEW  apps/web/app/api/webhooks/__tests__/order.test.ts
NEW  apps/web/app/api/webhooks/__tests__/order-cancelled.test.ts
NEW  apps/web/lib/__tests__/webhook-helpers.test.ts
```

### Module 04 — Email & Cron
```
EDIT apps/web/app/api/cron/send-review-emails/route.ts
EDIT apps/web/app/api/cron/expire-tokens/route.ts
EDIT packages/email/src/index.ts
NEW  packages/email/src/templates/review-request.ts
NEW  apps/web/vercel.json
NEW  apps/web/app/api/cron/__tests__/send-review-emails.test.ts
NEW  apps/web/app/api/cron/__tests__/expire-tokens.test.ts
NEW  packages/email/src/__tests__/templates.test.ts
NEW  packages/email/src/__tests__/index.test.ts
```

### Module 05 — Review Submission
```
EDIT apps/web/app/api/review-submission/[token]/route.ts
EDIT apps/web/app/submit-review/[token]/page.tsx
NEW  apps/web/lib/shopware-api.ts
NEW  apps/web/lib/review-tokens.ts
NEW  apps/web/components/star-rating.tsx
NEW  apps/web/components/review-form.tsx
NEW  apps/web/i18n/review-submission.ts
NEW  apps/web/app/api/review-submission/__tests__/token-validation.test.ts
NEW  apps/web/app/api/review-submission/__tests__/review-submission.test.ts
NEW  apps/web/components/__tests__/star-rating.test.tsx
NEW  apps/web/components/__tests__/review-form.test.tsx
NEW  apps/web/lib/__tests__/shopware-api.test.ts
```

### Module 06 — Widget
```
EDIT apps/web/app/api/widget/reviews/route.ts
EDIT apps/shopware/LoyaltyApp/Resources/app/storefront/dist/storefront/js/loyalty-app/loyalty-app.js
NEW  apps/web/app/api/widget/__tests__/reviews.test.ts
NEW  apps/shopware/__tests__/loyalty-app.test.ts
```

### Module 07 — Admin API
```
NEW  apps/web/lib/admin-auth.ts
EDIT apps/web/app/api/admin/dashboard/route.ts
EDIT apps/web/app/api/admin/reviews/route.ts
EDIT apps/web/app/api/admin/reviews/[id]/approve/route.ts
EDIT apps/web/app/api/admin/reviews/[id]/reject/route.ts
EDIT apps/web/app/api/admin/reviews/[id]/reply/route.ts
EDIT apps/web/app/api/admin/settings/route.ts
EDIT apps/web/app/api/admin/gdpr/export/route.ts
EDIT apps/web/app/api/admin/gdpr/delete/route.ts
NEW  apps/web/__tests__/helpers/admin-auth.ts
NEW  apps/web/app/api/admin/__tests__/admin-auth.test.ts
NEW  apps/web/app/api/admin/__tests__/dashboard.test.ts
NEW  apps/web/app/api/admin/__tests__/reviews.test.ts
NEW  apps/web/app/api/admin/__tests__/approve-reject.test.ts
NEW  apps/web/app/api/admin/__tests__/reply.test.ts
NEW  apps/web/app/api/admin/__tests__/settings.test.ts
NEW  apps/web/app/api/admin/__tests__/gdpr.test.ts
```

### Module 08 — Admin UI
```
EDIT apps/web/app/admin/page.tsx
NEW  apps/web/app/admin/layout.tsx
NEW  apps/web/components/admin/admin-shell.tsx
NEW  apps/web/components/admin/dashboard-section.tsx
NEW  apps/web/components/admin/reviews-section.tsx
NEW  apps/web/components/admin/review-card.tsx
NEW  apps/web/components/admin/review-reply-modal.tsx
NEW  apps/web/components/admin/settings-section.tsx
NEW  apps/web/components/admin/gdpr-section.tsx
NEW  apps/web/components/admin/star-display.tsx
NEW  apps/web/hooks/use-admin-auth.ts
NEW  apps/web/hooks/use-admin-api.ts
NEW  apps/web/i18n/admin.ts
NEW  apps/web/components/admin/__tests__/dashboard-section.test.tsx
NEW  apps/web/components/admin/__tests__/reviews-section.test.tsx
NEW  apps/web/components/admin/__tests__/review-card.test.tsx
NEW  apps/web/components/admin/__tests__/review-reply-modal.test.tsx
NEW  apps/web/components/admin/__tests__/settings-section.test.tsx
NEW  apps/web/components/admin/__tests__/gdpr-section.test.tsx
NEW  apps/web/components/admin/__tests__/admin-shell.test.tsx
NEW  apps/web/hooks/__tests__/use-admin-auth.test.ts
```

---

## Progress Tracking

Use the checkboxes in each module document to track progress. When a coding agent implements a module, it should mark each step with `[x]` as it completes it, and each acceptance criterion with `[x]` when verified.

**Module status:**

- [x] Module 01 — Foundation & Shared Utilities
- [x] Module 02 — Shopware App Lifecycle
- [ ] Module 03 — Webhook Handling
- [ ] Module 04 — Email System & Cron Jobs
- [ ] Module 05 — Review Submission
- [ ] Module 06 — Widget API & Storefront JS
- [ ] Module 07 — Admin API
- [ ] Module 08 — Admin UI
