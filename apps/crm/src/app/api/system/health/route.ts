import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.workspace.count();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        database: 'error',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    database: 'ok',
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
  });
}
