# LoyaltyApp — Reviews & Social Proof for Shopware

Open-source Shopware Cloud app (6.6+) that collects verified product reviews via post-purchase emails and displays them on the storefront with star ratings, merchant replies, and SEO structured data.

## Architecture

Single Next.js application (App Router) in a pnpm monorepo:

- **`apps/web/`** — Next.js app handling API routes (webhooks, admin, widget), admin UI (Shopware iframe), and review submission pages.
- **`apps/shopware/LoyaltyApp/`** — Shopware app manifest and storefront widget JS (auto-injected on product pages).
- **`packages/db/`** — Prisma schema, client, and migrations (Postgres).
- **`packages/email/`** — Postmark email service and templates.

## Getting Started

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate:dev

# Start development server
pnpm dev
```

Copy `.env.example` to `.env` and fill in the required values. Use ngrok to expose the local dev server for Shopware webhook delivery.

## Environment Variables

| Variable | Description |
|---|---|
| `APP_NAME` | App name (must match manifest.xml) |
| `APP_SECRET` | App secret (must match manifest.xml) |
| `APP_URL` | Public URL of the app (ngrok in dev) |
| `DATABASE_URL` | Postgres connection string |
| `ENCRYPTION_KEY` | AES-256 key for encrypting Shopware credentials |
| `POSTMARK_API_TOKEN` | Postmark API token for sending emails |
| `CRON_SECRET` | Shared secret protecting cron endpoints |

## License

MIT
