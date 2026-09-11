import { NextResponse } from 'next/server';
import { z } from 'zod';
import { EmailDomainStatus } from '../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { defaultProvider } from '@/lib/email/send';
import { canManageMarketing } from '@/lib/marketing/roles';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, 'Dominio invalido'),
  fromName: z.string().max(80).optional(),
  fromEmail: z.string().email().optional(),
});

export async function GET() {
  const user = await requireCurrentUser();

  const domains = await prisma.emailDomain.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ data: domains });
}

/**
 * Registra un dominio de envio y devuelve los registros DNS a publicar.
 *
 * El dominio nace PENDING: verificarlo depende de que el cliente publique el
 * DNS, no de que apriete un boton aqui.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede configurar el dominio de envio.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;

  const domain = parsed.data.domain.toLowerCase();

  // La direccion remitente tiene que pertenecer al dominio que se verifica: si
  // no, se estaria enviando desde un dominio ajeno con la firma de este.
  if (parsed.data.fromEmail && !parsed.data.fromEmail.toLowerCase().endsWith(`@${domain}`)) {
    return NextResponse.json(
      { message: `La direccion remitente debe terminar en @${domain}.`, code: 'FROM_MISMATCH' },
      { status: 400 },
    );
  }

  const existing = await prisma.emailDomain.findUnique({
    where: { workspaceId_domain: { workspaceId: user.workspace.id, domain } },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ message: 'Ese dominio ya esta registrado.' }, { status: 409 });
  }

  const provider = defaultProvider();
  const verification = await provider.verifyDomain(domain);

  const record = await prisma.emailDomain.create({
    data: {
      workspaceId: user.workspace.id,
      domain,
      provider: provider.kind,
      status:
        verification.status === 'VERIFIED' ? EmailDomainStatus.VERIFIED : EmailDomainStatus.PENDING,
      dnsRecords: verification.dnsRecords ?? undefined,
      providerDomainId: verification.providerDomainId ?? null,
      fromName: parsed.data.fromName ?? null,
      fromEmail: parsed.data.fromEmail?.toLowerCase() ?? null,
      verifiedAt: verification.status === 'VERIFIED' ? new Date() : null,
      lastCheckedAt: new Date(),
      lastError: verification.error ?? null,
    },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'email.domain_registered',
    entity: 'EmailDomain',
    entityId: record.id,
    metadata: { domain, provider: provider.kind, status: record.status },
  });

  return NextResponse.json({ data: record }, { status: 201 });
}
