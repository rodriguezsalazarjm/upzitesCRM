import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { getPushConfiguration } from '@/lib/push/send';
import { Prisma } from '../../../../../generated/prisma/client';

export const dynamic = 'force-dynamic';

const endpoint = z
  .string()
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://'));
const preferences = z
  .object({
    notifyHumanAttention: z.boolean(),
    notifyAssigned: z.boolean(),
    notifyQuoteApproval: z.boolean(),
    notifyOperationalIssue: z.boolean(),
    notifyIncomingMessage: z.boolean(),
  })
  .strict();
const subscriptionSchema = z
  .object({
    endpoint,
    expirationTime: z.number().int().positive().nullable().optional(),
    keys: z.object({ p256dh: z.string().min(20).max(512), auth: z.string().min(8).max(256) }),
    deviceLabel: z.string().trim().min(1).max(120).optional(),
    preferences: preferences.optional(),
  })
  .strict();
const endpointSchema = z.object({ endpoint }).strict();
const updateSchema = z.object({ endpoint, preferences }).strict();

const preferenceSelect = {
  notifyHumanAttention: true,
  notifyAssigned: true,
  notifyQuoteApproval: true,
  notifyOperationalIssue: true,
  notifyIncomingMessage: true,
} as const;

export async function GET() {
  const user = await requireCurrentUser();
  const config = getPushConfiguration();
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { workspaceId: user.workspace.id, userId: user.id, enabled: true },
    select: { endpoint: true, deviceLabel: true, ...preferenceSelect },
  });
  return NextResponse.json({
    data: { configured: config.configured, publicKey: config.publicKey, subscriptions },
  });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const config = getPushConfiguration();
  if (!config.configured) {
    return NextResponse.json(
      { message: 'Las notificaciones aún no están configuradas en el servidor.' },
      { status: 503 },
    );
  }
  const parsed = await parseBody(request, subscriptionSchema);
  if (!parsed.ok) return parsed.response;

  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint: parsed.data.endpoint },
    select: { id: true, workspaceId: true, userId: true },
  });
  if (existing && (existing.workspaceId !== user.workspace.id || existing.userId !== user.id)) {
    return NextResponse.json(
      {
        message: 'Esta suscripción pertenece a otra sesión. Cierra sesión allí antes de continuar.',
      },
      { status: 409 },
    );
  }

  const saved = await prisma.pushSubscription.upsert({
    // El chequeo anterior puede quedar obsoleto durante una alta concurrente.
    // El update tambien debe exigir propietario; una colision al crear es 409.
    where: { endpoint: parsed.data.endpoint, workspaceId: user.workspace.id, userId: user.id },
    create: {
      workspaceId: user.workspace.id,
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      expiresAt: parsed.data.expirationTime ? new Date(parsed.data.expirationTime) : null,
      deviceLabel: parsed.data.deviceLabel,
      userAgent: request.headers.get('user-agent')?.slice(0, 500),
      ...(parsed.data.preferences ?? {}),
    },
    update: {
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      expiresAt: parsed.data.expirationTime ? new Date(parsed.data.expirationTime) : null,
      deviceLabel: parsed.data.deviceLabel,
      userAgent: request.headers.get('user-agent')?.slice(0, 500),
      enabled: true,
      disabledAt: null,
      failureCount: 0,
      ...(parsed.data.preferences ?? {}),
    },
    select: { id: true, ...preferenceSelect },
  }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
    throw error;
  });
  if (!saved) {
    return NextResponse.json(
      { message: 'Esta suscripción pertenece a otra sesión. Cierra sesión allí antes de continuar.' },
      { status: 409 },
    );
  }
  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'push.subscription_saved',
    entity: 'PushSubscription',
    entityId: saved.id,
  });
  return NextResponse.json({ data: saved }, { status: existing ? 200 : 201 });
}

export async function PUT(request: Request) {
  const user = await requireCurrentUser();
  const parsed = await parseBody(request, updateSchema);
  if (!parsed.ok) return parsed.response;
  const updated = await prisma.pushSubscription.updateMany({
    where: {
      endpoint: parsed.data.endpoint,
      workspaceId: user.workspace.id,
      userId: user.id,
      enabled: true,
    },
    data: parsed.data.preferences,
  });
  if (updated.count === 0) {
    return NextResponse.json({ message: 'Suscripción no encontrada.' }, { status: 404 });
  }
  return NextResponse.json({ data: { saved: true } });
}

export async function DELETE(request: Request) {
  const user = await requireCurrentUser();
  const parsed = await parseBody(request, endpointSchema);
  if (!parsed.ok) return parsed.response;
  const selected = await prisma.pushSubscription.findFirst({
    where: { endpoint: parsed.data.endpoint, workspaceId: user.workspace.id, userId: user.id },
    select: { id: true },
  });
  if (selected) {
    await prisma.pushSubscription.delete({ where: { id: selected.id } });
    await recordAudit({
      workspaceId: user.workspace.id,
      actorId: user.id,
      action: 'push.subscription_removed',
      entity: 'PushSubscription',
      entityId: selected.id,
    });
  }
  return NextResponse.json({ data: { removed: Boolean(selected) } });
}
