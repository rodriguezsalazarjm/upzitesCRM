import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const startedAt = Date.now();
  await prisma.workspace.count();

  return NextResponse.json({
    ok: true,
    database: 'ok',
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
  });
}
