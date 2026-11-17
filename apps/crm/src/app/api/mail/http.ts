import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { MailError } from '@/lib/mail/service';

type Ctx = { userId: string; workspaceId: string };

/** P38: cualquier miembro usa SU buzón; los errores esperables vuelven como 422 con un mensaje claro. */
export async function mailHandler(run: (ctx: Ctx) => Promise<unknown>, status = 200) {
  const user = await requireCurrentUser();
  try {
    return NextResponse.json({ data: (await run({ userId: user.id, workspaceId: user.workspace.id })) ?? null }, { status });
  } catch (error) {
    if (error instanceof MailError) return NextResponse.json({ message: error.message }, { status: 422 });
    if (error instanceof ZodError) return NextResponse.json({ message: error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 422 });
    throw error;
  }
}
