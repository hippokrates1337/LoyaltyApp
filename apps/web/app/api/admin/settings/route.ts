import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/settings
 *
 * Returns the current merchant settings.
 */
export async function GET(request: NextRequest) {
  // TODO: Implement settings retrieval
  // 1. Verify Shopware iframe handshake
  // 2. Return merchant's settings_json

  return NextResponse.json({
    review_trigger: 'order.completed',
    review_delay_days: 2,
    auto_approve_enabled: false,
    auto_approve_min_rating: 5,
    locale: 'en',
  });
}

/**
 * POST /api/admin/settings
 *
 * Updates the merchant settings.
 * Body: partial settings object
 */
export async function POST(request: NextRequest) {
  // TODO: Implement settings update
  // 1. Verify Shopware iframe handshake
  // 2. Validate body against settings schema
  // 3. Merge with existing settings and persist

  return NextResponse.json({ success: true });
}
