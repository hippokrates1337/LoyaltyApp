import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/reviews
 *
 * Lists reviews for the authenticated merchant.
 * Supports filtering by status and productId, with pagination.
 *
 * Query params: status, productId, page, limit
 */
export async function GET(request: NextRequest) {
  // TODO: Implement review listing
  // 1. Verify Shopware iframe handshake
  // 2. Parse query params for filters and pagination
  // 3. Query reviews for merchant with filters
  // 4. Return paginated results

  return NextResponse.json({ reviews: [], total: 0, page: 1, limit: 20 });
}
