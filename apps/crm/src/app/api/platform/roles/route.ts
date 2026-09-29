import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PlatformRole } from '../../../../../generated/prisma/enums';
import { parseBody } from '@/lib/http';
import { platformGuard } from '@/lib/platform/access';
import { handlePlatform } from '@/lib/platform/http';
import { searchUsers, setPlatformRole } from '@/lib/platform/roles';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const guard = await platformGuard(PlatformRole.SUPER_ADMIN);
  if (!guard.ok) return guard.response;
  const q = new URL(request.url).searchParams.get('q') ?? '';
  return NextResponse.json({ data: await searchUsers(q) });
}

const schema = z.object({
  userId: z.string().optional(),
  email: z.string().trim().email().optional(),
  role: z.nativeEnum(PlatformRole),
  reason: z.string().trim().min(3).max(500),
});

/** Solo SUPER_ADMIN. Nunca deja la plataforma sin SUPER_ADMIN. */
export async function POST(request: Request) {
  const guard = await platformGuard(PlatformRole.SUPER_ADMIN);
  if (!guard.ok) return guard.response;
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  return handlePlatform(async () =>
    NextResponse.json({
      data: await setPlatformRole({
        actor: guard.actor,
        target: { userId: input.userId, email: input.email },
        role: input.role,
        reason: input.reason,
      }),
    }),
  );
}
