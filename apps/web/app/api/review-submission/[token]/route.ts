import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/review-submission/[token]
 *
 * Validates a review submission token and returns product info
 * for the review form.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // TODO: Implement token validation and product info fetch
  // 1. Look up review_request by token
  // 2. Validate: exists, status = 'sent', not expired
  // 3. Fetch product info from Shopware API (name, image)
  // 4. Return { productName, productImage, customerName }

  return NextResponse.json(
    { error: 'Not implemented' },
    { status: 501 },
  );
}

/**
 * POST /api/review-submission/[token]
 *
 * Submits a review for the given token.
 * Body: { rating, title, body, authorName }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // TODO: Implement review submission
  // 1. Validate token (same as GET)
  // 2. Parse and validate body: rating (1-5), title, body, authorName
  // 3. Determine status: auto-approve if enabled and rating >= threshold, else pending
  // 4. Create review record
  // 5. Update review_request status to 'completed'
  // 6. Return { success: true, status }

  return NextResponse.json(
    { error: 'Not implemented' },
    { status: 501 },
  );
}
