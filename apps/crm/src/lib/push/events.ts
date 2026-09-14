import { JobType, Prisma, UserRole } from '../../../generated/prisma/client';
import { enqueue } from '../jobs/queue';
import { prisma } from '../prisma';
import {
  notificationForEvent,
  recipientStrategy,
  type PushEvent,
  type PushEventKind,
} from './policy';

export { notificationForEvent } from './policy';
export type { PushEvent, PushEventKind } from './policy';

const PREFERENCE: Record<PushEventKind, keyof Prisma.PushSubscriptionWhereInput> = {
  HUMAN_ATTENTION: 'notifyHumanAttention',
  ASSIGNED: 'notifyAssigned',
  QUOTE_APPROVAL: 'notifyQuoteApproval',
  OPERATIONAL_ISSUE: 'notifyOperationalIssue',
  INCOMING_MESSAGE: 'notifyIncomingMessage',
};

/**
 * Elige destinatarios concretos. Conversaciones asignadas notifican solo al
 * responsable; revisiones y fallos se limitan a owner/admin.
 */
export async function queuePushEvent(event: PushEvent) {
  let userIds: string[];
  const strategy = recipientStrategy(event);
  if (strategy === 'EXPLICIT') {
    const user = await prisma.user.findFirst({
      where: { id: event.userId!, workspaceId: event.workspaceId },
      select: { id: true },
    });
    userIds = user ? [user.id] : [];
  } else if (strategy === 'NONE') {
    userIds = [];
  } else {
    const reviewers = await prisma.user.findMany({
      where: { workspaceId: event.workspaceId, role: { in: [UserRole.OWNER, UserRole.ADMIN] } },
      select: { id: true },
    });
    userIds = reviewers.map((user) => user.id);
  }

  if (userIds.length === 0) return { queued: 0 };

  const preference = PREFERENCE[event.kind];
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      workspaceId: event.workspaceId,
      userId: { in: userIds },
      enabled: true,
      disabledAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      [preference]: true,
    },
    select: { id: true },
  });
  const notification = notificationForEvent(event);

  await Promise.all(
    subscriptions.map((subscription) =>
      enqueue({
        type: JobType.SEND_PUSH,
        workspaceId: event.workspaceId,
        payload: { subscriptionId: subscription.id, notification },
        dedupeKey: `push:${event.dedupeKey}:${subscription.id}`,
        priority: 40,
        maxAttempts: 3,
      }),
    ),
  );

  return { queued: subscriptions.length };
}

export async function queuePushSafely(event: PushEvent) {
  try {
    return await queuePushEvent(event);
  } catch (error) {
    console.error('push_enqueue_failed', {
      kind: event.kind,
      workspaceId: event.workspaceId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { queued: 0 };
  }
}
