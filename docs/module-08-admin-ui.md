# Module 08 — Admin UI (Frontend)

**Status:** Not started
**Depends on:** Module 07 (admin API endpoints)
**Required by:** Nothing (this is the final module)

---

## Overview

This module builds the merchant-facing admin UI that runs inside a Shopware admin iframe. It provides four sections: a dashboard with summary stats, a review moderation interface with approve/reject/reply actions, a settings page for configuring review triggers and auto-approval, and GDPR tools for data export and deletion.

The UI is a single-page application within the `/admin` route using client-side tab navigation. It communicates with the admin API endpoints built in Module 07.

---

## Architecture Context

**Files modified:**
```
apps/web/app/admin/page.tsx          # Main admin page (refactored into sections)
apps/web/app/admin/layout.tsx        # Admin layout with iframe-specific styles
```

**New files:**
```
apps/web/components/admin/
├── admin-shell.tsx                  # Tab navigation shell
├── dashboard-section.tsx            # Dashboard stats cards
├── reviews-section.tsx              # Reviews list with moderation actions
├── review-card.tsx                  # Individual review card component
├── review-reply-modal.tsx           # Modal for writing merchant replies
├── settings-section.tsx             # Settings form
├── gdpr-section.tsx                 # GDPR export/delete tools
└── star-display.tsx                 # Read-only star rating display (reusable)

apps/web/hooks/
├── use-admin-auth.ts               # Hook: captures iframe query params, provides auth headers
├── use-admin-api.ts                 # Hook: wraps fetch with admin auth headers

apps/web/i18n/admin.ts              # EN/DE translations for admin UI
```

**Dependencies used:**
```
apps/web/lib/validation.ts     → MerchantSettingsSchema (for client-side validation)
API endpoints from Module 07   → all /api/admin/* routes
```

**Iframe context:**
```
Shopware Admin Panel
  │
  └─▶ <iframe src="/admin?shop-id=X&shop-url=Y&timestamp=Z&sw-version=V&shopware-shop-signature=SIG">
       │
       └─ Admin UI (React SPA)
           │
           ├─ Captures query params on mount
           ├─ Passes them as headers on every API call
           └─ Renders: Dashboard | Reviews | Settings | GDPR
```

---

## Implementation Steps

### Step 1: Create the admin auth hook

- [ ] Create `apps/web/hooks/use-admin-auth.ts`
- [ ] On mount, capture the iframe query parameters from `window.location.search`:
  - `shop-id`, `shop-url`, `timestamp`, `sw-version`, `shopware-shop-signature`
- [ ] Store them in React state
- [ ] Export a function `getAuthHeaders()` that returns these as custom headers for API calls:
  ```typescript
  {
    'x-shop-id': shopId,
    'x-shop-url': shopUrl,
    'x-timestamp': timestamp,
    'x-sw-version': swVersion,
    'x-shopware-shop-signature': signature,
  }
  ```
- [ ] Also expose the `shopId` for display purposes
- [ ] Handle the case where params are missing (show an error state)

### Step 2: Create the admin API hook

- [ ] Create `apps/web/hooks/use-admin-api.ts`
- [ ] Wraps `fetch()` with admin auth headers from `useAdminAuth()`
- [ ] Export convenience methods:
  ```typescript
  export function useAdminApi() {
    const { getAuthHeaders } = useAdminAuth();

    async function get<T>(path: string, params?: Record<string, string>): Promise<T> { ... }
    async function post<T>(path: string, body?: any): Promise<T> { ... }

    return { get, post };
  }
  ```
- [ ] Handle errors: if response is 401, show "Session expired" message
- [ ] Handle network errors gracefully

### Step 3: Create admin translations

- [ ] Create `apps/web/i18n/admin.ts`
- [ ] Define translations for `en` and `de`:
  - Tab labels: Dashboard, Reviews, Settings, GDPR
  - Dashboard: "Total Reviews", "Pending", "Average Rating", "Approved", "Rejected"
  - Reviews section: "All Reviews", "Pending", "Approved", "Rejected", filter labels, pagination
  - Review actions: "Approve", "Reject", "Reply", "Delete Reply"
  - Settings: all field labels and descriptions, "Save Settings", "Settings saved successfully"
  - GDPR: "Export Customer Data", "Delete Customer Data", "Email address", "Export", "Delete", confirmation dialogs
  - Common: "Loading...", "Error", "No results", "Save", "Cancel", "Confirm"

### Step 4: Create the star display component

- [ ] Create `apps/web/components/admin/star-display.tsx`
- [ ] Read-only star rating display (unlike the interactive component in Module 05)
- [ ] Props: `rating: number` (1–5), `size?: 'sm' | 'md' | 'lg'`
- [ ] Renders filled/empty stars using Unicode or SVG
- [ ] Supports fractional ratings for the average display (e.g., 4.3 → 4 filled + 1 partial + 0 empty)

### Step 5: Build the admin shell with tab navigation

- [ ] Create `apps/web/components/admin/admin-shell.tsx`
- [ ] Client component with four tabs: Dashboard, Reviews, Settings, GDPR
- [ ] Uses URL hash or React state for active tab (e.g., `#reviews`)
- [ ] Renders the active section component
- [ ] Shows the shop name/ID in the header
- [ ] Responsive: tabs become a dropdown on narrow viewports (iframe may be small)

### Step 6: Build the dashboard section

- [ ] Create `apps/web/components/admin/dashboard-section.tsx`
- [ ] On mount, fetch `GET /api/admin/dashboard`
- [ ] Display stat cards:
  - Total Reviews (number)
  - Pending Moderation (number, highlighted if > 0)
  - Average Rating (number + star display)
  - Approved / Rejected counts
- [ ] Loading skeleton while fetching
- [ ] Error state if fetch fails
- [ ] Auto-refresh every 60 seconds (optional: for MVP, manual refresh is fine)

### Step 7: Build the reviews section

- [ ] Create `apps/web/components/admin/reviews-section.tsx`
- [ ] Features:
  - Filter tabs: All / Pending / Approved / Rejected
  - Product ID filter (text input)
  - Search input (searches title, body, author)
  - Paginated list of review cards
  - "Pending" tab is the default (most actionable)
- [ ] Each review displays via a `ReviewCard` component
- [ ] Pagination: Previous / Next buttons with page indicator

### Step 8: Build the review card component

- [ ] Create `apps/web/components/admin/review-card.tsx`
- [ ] Displays:
  - Star rating (StarDisplay)
  - Title (bold)
  - Body text (truncated with "Show more" if > 200 chars)
  - Author name and email
  - Submission date
  - Product ID
  - Status badge (color-coded: yellow=pending, green=approved, red=rejected)
  - "Verified Purchase" badge
  - Merchant reply (if exists)
- [ ] Action buttons (contextual based on status):
  - Pending: "Approve" (green), "Reject" (red), "Reply"
  - Approved: "Reject", "Reply"
  - Rejected: "Approve", "Reply"
- [ ] Approve/Reject: call API, optimistically update UI, show toast/notification on success
- [ ] Reply: opens a modal

### Step 9: Build the reply modal

- [ ] Create `apps/web/components/admin/review-reply-modal.tsx`
- [ ] Modal overlay with:
  - Text area for reply (max 2000 chars, character count)
  - "Save Reply" button
  - "Delete Reply" button (if a reply already exists)
  - "Cancel" button
- [ ] Calls `POST /api/admin/reviews/[id]/reply`
- [ ] Shows loading state during save
- [ ] Closes modal and updates review card on success
- [ ] Accessible: focus trap, Escape to close, aria attributes

### Step 10: Build the settings section

- [ ] Create `apps/web/components/admin/settings-section.tsx`
- [ ] On mount, fetch `GET /api/admin/settings`
- [ ] Form fields:
  - **Review Trigger** — Radio group: "After order placed", "After order shipped", "After order completed"
  - **Delay (days)** — Number input, 0–30
  - **Auto-approve** — Toggle switch
  - **Minimum rating for auto-approve** — Number input or star selector, 1–5 (only visible when auto-approve is enabled)
  - **Language** — Select: English / German
- [ ] Client-side validation using `MerchantSettingsSchema`
- [ ] "Save Settings" button → calls `POST /api/admin/settings`
- [ ] Success notification after save
- [ ] Dirty state tracking: warn if navigating away with unsaved changes

### Step 11: Build the GDPR section

- [ ] Create `apps/web/components/admin/gdpr-section.tsx`
- [ ] Two cards/sections:

**Export:**
- Email input field
- "Export" button → calls `GET /api/admin/gdpr/export?email=...`
- Displays result as formatted JSON or downloadable file
- Shows "No data found" if empty results

**Delete:**
- Email input field
- "Delete" button → shows confirmation dialog first
  - "Are you sure? This will permanently delete all reviews and review requests for this email."
- Calls `POST /api/admin/gdpr/delete` after confirmation
- Shows result: "Deleted X reviews and Y review requests"
- This action is irreversible — make the UI clearly indicate this (red button, warning icon)

### Step 12: Update the main admin page

- [ ] Rewrite `apps/web/app/admin/page.tsx`
- [ ] Import and render the `AdminShell` component
- [ ] The page should be a thin wrapper — all logic lives in the section components

### Step 13: Create admin layout

- [ ] Create `apps/web/app/admin/layout.tsx`
- [ ] Iframe-specific considerations:
  - Remove any default margins/padding that might look odd in an iframe
  - Set appropriate viewport meta tag
  - Optionally load a neutral font (or inherit from Shopware admin's font)
  - Set `background: white` (Shopware admin iframes expect a white background)

---

## Testing

### Component tests

Create `apps/web/components/admin/__tests__/` with:

- [ ] `dashboard-section.test.tsx`
  - Renders loading skeleton initially
  - Shows correct stat values after data loads
  - Shows error state on fetch failure
  - Highlights pending count when > 0

- [ ] `reviews-section.test.tsx`
  - Renders review list
  - Filter tabs change the displayed reviews
  - Pagination works (prev/next)
  - Search input filters results
  - Empty state when no reviews match

- [ ] `review-card.test.tsx`
  - Displays all review fields correctly
  - Shows correct action buttons based on status
  - Approve button calls API and updates status
  - Reject button calls API and updates status
  - Reply button opens modal
  - Shows merchant reply when present
  - Truncates long body text with "Show more"

- [ ] `review-reply-modal.test.tsx`
  - Opens with focus in textarea
  - Pre-fills existing reply
  - Character count updates as user types
  - Save button is disabled when empty
  - Delete button is shown when existing reply
  - Closes on Escape key
  - Calls API on save

- [ ] `settings-section.test.tsx`
  - Loads and displays current settings
  - All form fields are interactive
  - Client-side validation prevents invalid submissions
  - Save button calls API with merged settings
  - Shows success notification on save
  - Auto-approve min rating field is hidden when auto-approve is disabled

- [ ] `gdpr-section.test.tsx`
  - Export: calls API with email, displays results
  - Export: shows "no data" for empty results
  - Export: validates email format
  - Delete: shows confirmation dialog before deleting
  - Delete: calls API after confirmation
  - Delete: shows deletion summary
  - Delete: does NOT call API if user cancels

- [ ] `admin-shell.test.tsx`
  - Renders all four tabs
  - Clicking a tab shows the correct section
  - Default tab is "Dashboard"
  - Shows shop identifier in header

### Hook tests

- [ ] `use-admin-auth.test.ts`
  - Captures query params from window.location
  - Returns correct auth headers
  - Shows error state when params are missing

### Running tests

```bash
cd apps/web
pnpm vitest run components/admin/__tests__/
pnpm vitest run hooks/__tests__/
```

**Note:** Add `@testing-library/react` and `@testing-library/jest-dom` as dev dependencies if not already installed:
```bash
pnpm add -D @testing-library/react @testing-library/jest-dom --filter @loyalty/web
```

---

## Acceptance Criteria

- [ ] Admin UI loads correctly inside a Shopware admin iframe
- [ ] All four sections are accessible via tab navigation: Dashboard, Reviews, Settings, GDPR
- [ ] Dashboard shows accurate summary stats with visual star ratings
- [ ] Reviews section lists reviews with filtering (status, productId, search) and pagination
- [ ] Pending reviews can be approved or rejected with immediate UI feedback
- [ ] Merchant can write, edit, and delete replies to reviews
- [ ] Reply modal is accessible (focus trap, Escape to close, aria attributes)
- [ ] Settings form validates input and saves changes via API
- [ ] Auto-approve min rating field is conditionally shown
- [ ] GDPR export downloads/displays all customer data for a given email
- [ ] GDPR delete shows confirmation dialog and reports deletion results
- [ ] All text is localized in English and German
- [ ] UI is responsive and usable in narrow iframe widths
- [ ] UI uses a clean, neutral design that fits within the Shopware admin aesthetic
- [ ] All component and hook tests pass
- [ ] No TypeScript errors (`pnpm type-check`)
- [ ] No lint errors (`pnpm lint`)
