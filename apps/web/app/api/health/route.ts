import { NextResponse } from 'next/server';
import { prisma } from '@loyalty/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('health');

/**
 * GET /api/health
 *
 * Health check endpoint. Returns 200 if the app is running
 * and can reach the database.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    log.info('Health check passed');
    return NextResponse.json({ status: 'ok', db: 'connected' });
  } catch (error) {
    log.error({ error }, 'Health check failed — database unreachable');
    return NextResponse.json(
      { status: 'error', db: 'disconnected' },
      { status: 503 },
    );
  }
}
