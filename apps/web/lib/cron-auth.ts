import type { NextRequest } from 'next/server';

/**
 * Verify that a cron request carries the correct secret.
 *
 * Accepts the secret in the `Authorization: Bearer <secret>` header
 * or the `x-cron-secret` header as a fallback (Vercel Cron uses Authorization).
 */
export function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme === 'Bearer' && token === cronSecret) return true;
  }

  const fallbackHeader = request.headers.get('x-cron-secret');
  if (fallbackHeader === cronSecret) return true;

  return false;
}
