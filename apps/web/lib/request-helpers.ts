import { NextRequest } from 'next/server';

/**
 * Read the request body as raw text and parse it as JSON.
 *
 * This avoids consuming the body stream twice — the raw text is needed
 * for Shopware HMAC signature verification, and the parsed JSON is
 * needed for business logic.
 *
 * Reused by: /api/app/confirm, /api/app/uninstall, /api/webhooks/*
 */
export async function readRawBodyAndJson(
  request: NextRequest,
): Promise<{ rawBody: string; json: Record<string, unknown> }> {
  const rawBody = await request.text();
  const json = JSON.parse(rawBody) as Record<string, unknown>;
  return { rawBody, json };
}
