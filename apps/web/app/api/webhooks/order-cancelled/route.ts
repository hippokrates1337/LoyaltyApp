import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/webhooks/order-cancelled
 *
 * Handles order cancellation/refund webhooks from Shopware.
 * Cancels any pending (scheduled) review_requests for the order.
 */
export async function POST(request: NextRequest) {
  // TODO: Implement order cancellation handler
  // 1. Verify Shopware HMAC signature
  // 2. Extract order ID from payload
  // 3. Update review_requests where order_id matches and status = 'scheduled'
  //    → set status = 'cancelled'

  return NextResponse.json({ success: true });
}
