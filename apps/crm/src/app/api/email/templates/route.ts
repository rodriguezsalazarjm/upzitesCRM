import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SendCategory } from '../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { aiSlotsSchema, placeholdersIn } from '@/lib/email/templates';
import { canManageMarketing } from '@/lib/marketing/roles';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  key: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, 'Usa minusculas y guiones'),
  name: z.string().min(1),
  subject: z.string().min(1).max(200),
  bodyHtml: z.string().min(1),
  bodyText: z.string().min(1),
  category: z.nativeEnum(SendCategory).default(SendCategory.PROMOTIONAL),
  aiSlots: aiSlotsSchema.optional(),
});

export async function GET() {
  const user = await requireCurrentUser();

  const templates = await prisma.emailTemplate.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ data: templates });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede crear plantillas.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const existing = await prisma.emailTemplate.findUnique({
    where: { workspaceId_key: { workspaceId: user.workspace.id, key: input.key } },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ message: 'Ya existe una plantilla con esa clave.' }, { status: 409 });
  }

  // Todo hueco de IA tiene que aparecer en el cuerpo: uno declarado que no se
  // usa gasta una llamada al modelo cuyo resultado no se ve en ninguna parte.
  const used = new Set([
    ...placeholdersIn(input.subject),
    ...placeholdersIn(input.bodyHtml),
    ...placeholdersIn(input.bodyText),
  ]);

  const unusedSlot = (input.aiSlots ?? []).find((slot) => !used.has(slot.key));

  if (unusedSlot) {
    return NextResponse.json(
      { message: `El hueco de IA "${unusedSlot.key}" no aparece en la plantilla.`, code: 'UNUSED_SLOT' },
      { status: 400 },
    );
  }

  const template = await prisma.emailTemplate.create({
    data: {
      workspaceId: user.workspace.id,
      key: input.key,
      name: input.name,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      category: input.category,
      variables: [...used],
      aiSlots: input.aiSlots ?? undefined,
    },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'email.template_created',
    entity: 'EmailTemplate',
    entityId: template.id,
    metadata: { key: template.key, aiSlots: (input.aiSlots ?? []).length },
  });

  return NextResponse.json({ data: template }, { status: 201 });
}
