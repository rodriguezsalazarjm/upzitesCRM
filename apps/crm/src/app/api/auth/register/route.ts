import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { createCustomerWorkspace } from '@/lib/subscription';
import { enforce } from '@/lib/ops/rate-limit';

const registerSchema = z.object({
  companyName: z.string().min(2),
  ownerName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  // Fase 10: Alta de cuentas: un limite bajo por hora frena el registro masivo.
  const limited = await enforce('register', request);
  if (limited) return limited;

  const parsed = await parseBody(request, registerSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  try {
    const { user, workspace, subscription } = await createCustomerWorkspace(input);

    await setSessionCookie({
      userId: user.id,
      workspaceId: workspace.id,
      role: user.role,
    });

    return NextResponse.json(
      {
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          workspace,
          subscription,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_ALREADY_EXISTS') {
      return NextResponse.json({ message: 'Este correo ya tiene una cuenta CRM.' }, { status: 409 });
    }

    throw error;
  }
}
