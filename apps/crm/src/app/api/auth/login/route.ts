import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/auth';
import { DEV_DEMO_USER, isDatabaseUnavailable, isDemoCredential, isDevDemoEnabled } from '@/lib/dev-demo';
import { verifyPassword } from '@/lib/password';
import { parseBody } from '@/lib/http';
import { enforce } from '@/lib/ops/rate-limit';
import { prisma } from '@/lib/prisma';
import { pickWorkspaceForUser } from '@/lib/workspace-switch';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  // Fase 10: freno de fuerza bruta. Se limita por IP antes de tocar la base:
  // el objetivo es que un atacante no pueda probar contrasenas en volumen.
  const limited = await enforce('login', request);
  if (limited) return limited;

  const parsed = await parseBody(request, loginSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  let user;

  try {
    user = await prisma.user.findFirst({
      where: {
        email: input.email.toLowerCase(),
      },
      select: { id: true, name: true, email: true, passwordHash: true },
    });
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error) && isDemoCredential(input.email, input.password)) {
      await setSessionCookie({
        userId: DEV_DEMO_USER.id,
        activeWorkspaceId: DEV_DEMO_USER.workspace.id,
      });

      return NextResponse.json({ data: DEV_DEMO_USER, mode: 'local-demo' });
    }

    throw error;
  }

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    return NextResponse.json({ message: 'Credenciales invalidas' }, { status: 401 });
  }

  // El workspace de entrada sale de las memberships (ultimo usado, si no el
  // OWNER mas antiguo), nunca de `users.workspace_id`.
  const activeWorkspaceId = await pickWorkspaceForUser(user.id);
  const membership = activeWorkspaceId
    ? await prisma.workspaceMembership.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId: activeWorkspaceId } },
        select: { role: true, workspace: { select: { id: true, name: true, slug: true } } },
      })
    : null;

  if (!membership) {
    return NextResponse.json(
      { message: 'Tu cuenta no tiene acceso a ningun workspace activo.' },
      { status: 403 },
    );
  }

  await setSessionCookie({ userId: user.id, activeWorkspaceId: membership.workspace.id });

  return NextResponse.json({
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: membership.role,
      workspace: membership.workspace,
    },
  });
}

