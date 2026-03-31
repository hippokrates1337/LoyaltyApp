import { NextResponse } from 'next/server';

/**
 * Return a JSON error response with a consistent shape: `{ error: string }`.
 */
export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function unauthorized(): NextResponse {
  return jsonError('Unauthorized', 401);
}

export function forbidden(): NextResponse {
  return jsonError('Forbidden', 403);
}

export function notFound(): NextResponse {
  return jsonError('Not Found', 404);
}

export function badRequest(message: string): NextResponse {
  return jsonError(message, 400);
}

export function serverError(message: string): NextResponse {
  return jsonError(message, 500);
}
