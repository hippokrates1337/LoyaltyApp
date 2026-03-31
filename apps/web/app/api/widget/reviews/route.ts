import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/widget/reviews
 *
 * Public endpoint for the storefront widget.
 * Returns approved reviews for a product.
 *
 * Query params: shopId, productId, page (optional), limit (optional)
 * Returns: { averageRating, totalCount, reviews[] }
 *
 * CORS: restricted to the merchant's shop domain.
 * Rate limited: 60 requests/min per IP.
 */
export async function GET(request: NextRequest) {
  // TODO: Implement widget reviews endpoint
  // 1. Extract shopId and productId from query params
  // 2. Look up merchant by shopId to get shop URL for CORS
  // 3. Query approved reviews for (merchant_id, product_id)
  // 4. Calculate averageRating and totalCount
  // 5. Return JSON with CORS headers

  return NextResponse.json(
    { averageRating: 0, totalCount: 0, reviews: [] },
    { status: 200 },
  );
}
