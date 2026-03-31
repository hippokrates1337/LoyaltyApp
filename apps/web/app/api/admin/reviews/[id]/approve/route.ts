import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/admin/reviews/[id]/approve
 *
 * Approves a pending review.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // TODO: Implement review approval
  // 1. Verify Shopware iframe handshake
  // 2. Update review status to 'approved', set moderated_at
  // 3. Ensure review belongs to the authenticated merchant

  return NextResponse.json({ success: true, reviewId: id });
}
