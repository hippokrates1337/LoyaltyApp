import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/webhooks/order
 *
 * Handles order state change webhooks from Shopware.
 * Creates review_requests if the event matches the merchant's configured trigger.
 */
export async function POST(request: NextRequest) {
  // TODO: Implement order webhook handler
  // 1. Verify Shopware HMAC signature
  // 2. Parse payload to extract order details and state
  // 3. Look up merchant by shop ID
  // 4. Check if event matches merchant's configured review_trigger
  // 5. For each product in order line items:
  //    - Check for existing review_request (dedup by order_id + product_id)
  //    - Generate token
  //    - Insert review_request with scheduled_at = now + delay_days
  // 6. Return 200

  return NextResponse.json({ success: true });
}
