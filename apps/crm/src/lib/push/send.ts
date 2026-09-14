import webpush from 'web-push';
import { z } from 'zod';
import { prisma } from '../prisma';

const notificationSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(160),
  url: z.string().regex(/^\/(inbox(?:\/[^/]+)?|cotizaciones|ops)$/),
  tag: z.string().min(1).max(240),
});

export function getPushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  const configured = Boolean(
    publicKey &&
    privateKey &&
    subject &&
    (subject.startsWith('mailto:') || subject.startsWith('https://')),
  );
  return { configured, publicKey: configured ? publicKey! : null, privateKey, subject };
}

export async function sendPushJob(payload: Record<string, unknown>, workspaceId: string | null) {
  const parsed = z
    .object({ subscriptionId: z.string().min(1), notification: notificationSchema })
    .safeParse(payload);
  if (!parsed.success || !workspaceId) throw new Error('SEND_PUSH recibió un payload inválido.');

  const subscription = await prisma.pushSubscription.findFirst({
    where: { id: parsed.data.subscriptionId, workspaceId },
  });
  if (!subscription || !subscription.enabled || subscription.disabledAt) {
    return { skipped: true, reason: 'suscripción inactiva' };
  }
  if (subscription.expiresAt && subscription.expiresAt <= new Date()) {
    await prisma.pushSubscription.delete({ where: { id: subscription.id } });
    return { skipped: true, reason: 'suscripción vencida' };
  }

  const config = getPushConfiguration();
  if (!config.configured || !config.publicKey || !config.privateKey || !config.subject) {
    throw new Error('Web Push no está configurado en el servidor.');
  }
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expiresAt?.getTime() ?? null,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(parsed.data.notification),
      { TTL: 120, urgency: 'normal' },
    );
    await prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: { failureCount: 0, lastSuccessAt: new Date() },
    });
    return { sent: true };
  } catch (error) {
    const statusCode =
      typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode)
        : undefined;
    if (statusCode === 404 || statusCode === 410) {
      await prisma.pushSubscription.delete({ where: { id: subscription.id } });
      return { skipped: true, reason: 'suscripción expirada por el navegador' };
    }
    await prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: { failureCount: { increment: 1 } },
    });
    throw new Error(`El servicio Web Push respondió ${statusCode ?? 'con un error de red'}.`);
  }
}
