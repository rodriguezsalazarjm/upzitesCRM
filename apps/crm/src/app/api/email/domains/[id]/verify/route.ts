import { NextResponse } from 'next/server';
import { EmailDomainStatus } from '../../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';
import { defaultProvider } from '@/lib/email/send';
import { canManageMarketing } from '@/lib/marketing/roles';

export const dynamic = 'force-dynamic';

/**
 * Vuelve a preguntarle al proveedor si el dominio ya quedo verificado.
 *
 * Quien decide es el proveedor, no el CRM: marcar VERIFIED aqui sin que el DNS
 * este publicado solo lograria que los envios rebotaran mas tarde.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();

  if (!canManageMarketing(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede verificar el dominio.' },
      { status: 403 },
    );
  }

  const domain = await prisma.emailDomain.findFirst({
    where: { id, workspaceId: user.workspace.id },
  });

  if (!domain) return NextResponse.json({ message: 'Dominio no encontrado' }, { status: 404 });

  const provider = defaultProvider();
  const verification = await provider.verifyDomain(domain.domain);

  const status =
    verification.status === 'VERIFIED'
      ? EmailDomainStatus.VERIFIED
      : verification.status === 'FAILED'
        ? EmailDomainStatus.FAILED
        : EmailDomainStatus.PENDING;

  const updated = await prisma.emailDomain.update({
    where: { id: domain.id },
    data: {
      status,
      dnsRecords: verification.dnsRecords ?? undefined,
      providerDomainId: verification.providerDomainId ?? domain.providerDomainId,
      verifiedAt: status === EmailDomainStatus.VERIFIED ? (domain.verifiedAt ?? new Date()) : null,
      lastCheckedAt: new Date(),
      lastError: verification.error ?? null,
    },
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'email.domain_verified',
    entity: 'EmailDomain',
    entityId: domain.id,
    metadata: { domain: domain.domain, status },
  });

  return NextResponse.json({ data: updated });
}
