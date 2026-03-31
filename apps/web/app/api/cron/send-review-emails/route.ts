import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/cron/send-review-emails
 *
 * Cron endpoint: sends review request emails that are due.
 * Runs every 5 minutes. Protected by CRON_SECRET header.
 *
 * Queries review_requests where status = 'scheduled' and scheduled_at <= now,
 * sends each email via Postmark, and updates status to 'sent'.
 */
export async function GET(request: NextRequest) {
  // TODO: Implement email sending cron
  // 1. Verify CRON_SECRET header
  // 2. Query: SELECT * FROM review_requests WHERE status = 'scheduled' AND scheduled_at <= NOW() LIMIT 50
  // 3. For each: send email via Postmark, update status to 'sent', set sent_at
  // 4. Return summary { sent: number, errors: number }

  return NextResponse.json({ sent: 0, errors: 0 });
}
