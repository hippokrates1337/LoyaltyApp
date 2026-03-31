import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/cron/expire-tokens
 *
 * Cron endpoint: expires review request tokens older than 30 days.
 * Runs daily. Protected by CRON_SECRET header.
 */
export async function GET(request: NextRequest) {
  // TODO: Implement token expiry cron
  // 1. Verify CRON_SECRET header
  // 2. Update review_requests where status = 'sent' AND created_at < NOW() - 30 days
  //    → set status = 'expired'
  // 3. Return { expired: number }

  return NextResponse.json({ expired: 0 });
}
