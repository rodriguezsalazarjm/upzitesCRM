import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/auth';
import { DEV_DEMO_USER, isDatabaseUnavailable, isDemoCredential, isDevDemoEnabled } from '@/lib/dev-demo';
import { verifyPassword } from '@/lib/password';
import { prisma } from '@/lib/prisma';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const input = loginSchema.parse(await request.json());
  let user;

  try {
    user = await prisma.user.findFirst({
      where: {
        email: input.email.toLowerCase(),
      },
      include: {
        workspace: true,
      },
    });
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error) && isDemoCredential(input.email, input.password)) {
      await setSessionCookie({
        userId: DEV_DEMO_USER.id,
        workspaceId: DEV_DEMO_USER.workspace.id,
        role: DEV_DEMO_USER.role,
      });

      return NextResponse.json({ data: DEV_DEMO_USER, mode: 'local-demo' });
    }

    throw error;
  }

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    return NextResponse.json({ message: 'Credenciales invalidas' }, { status: 401 });
  }

  await setSessionCookie({
    userId: user.id,
    workspaceId: user.workspaceId,
    role: user.role,
  });

  return NextResponse.json({
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      workspace: {
        id: user.workspace.id,
        name: user.workspace.name,
        slug: user.workspace.slug,
      },
    },
  });
}

