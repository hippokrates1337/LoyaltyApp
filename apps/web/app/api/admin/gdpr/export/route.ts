import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/gdpr/export?email=...
 *
 * Exports all review data for a customer email as JSON.
 * Authenticated via Shopware iframe handshake.
 */
export async function GET(request: NextRequest) {
  // TODO: Implement GDPR data export
  // 1. Verify Shopware iframe handshake
  // 2. Extract email from query params
  // 3. Query all reviews and review_requests for this email + merchant
  // 4. Return as JSON

  return NextResponse.json({ reviews: [], reviewRequests: [] });
}
