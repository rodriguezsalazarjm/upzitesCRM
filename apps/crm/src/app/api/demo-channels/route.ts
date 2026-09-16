import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isLocalDemo } from '@/lib/testing/local-mode';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { persistChannelEvent } from '@/lib/channels/ingest';
import { processChannelEvent } from '@/lib/channels/process';
import { metaAuthRequirements } from '@/lib/meta/auth-strategy';
const schema = z.object({ action: z.enum(['connect', 'event', 'disconnect']), channel: z.enum(['INSTAGRAM', 'MESSENGER', 'TIKTOK']), type: z.enum(['DM_RECEIVED', 'COMMENT', 'STORY_REPLY']).default('DM_RECEIVED'), text: z.string().max(2000).default('GUIA'), postId: z.string().optional(), externalUserId: z.string().min(1).max(100).default('cliente-demo') });
export async function POST(request: Request) {
  if (!isLocalDemo()) return new Response(null, { status: 404 });
  const user = await requireCurrentUser(); if (!canManageChannels(user.role)) return NextResponse.json({ message: 'Sin permiso.' }, { status: 403 });
  const parsed = await parseBody(request, schema); if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const externalAccountId = `demo:${user.workspace.id}:${input.channel}`;
  if (input.action === 'connect') {
    const auth = input.channel === 'TIKTOK' ? null : metaAuthRequirements(input.channel);
    const account = await prisma.channelAccount.upsert({ where: { channel_externalAccountId: { channel: input.channel, externalAccountId } }, create: { workspaceId: user.workspace.id, channel: input.channel, externalAccountId, displayName: `${input.channel === 'MESSENGER' ? 'Página' : 'Cuenta'} ${input.channel} demo`, status: 'CONNECTED', connectedAt: new Date(), metadata: { fake: true, authorization: auth ? { mechanism: auth.mechanism, tokenType: auth.tokenType, ...(auth.pageRequired ? { pageId: externalAccountId } : { instagramAccountId: externalAccountId }) } : null } }, update: { status: 'CONNECTED' } });
    return NextResponse.json({ data: { id: account.id, simulated: true } });
  }
  const account = await prisma.channelAccount.findFirst({ where: { workspaceId: user.workspace.id, channel: input.channel, externalAccountId } });
  if (!account) return NextResponse.json({ message: 'Conecta primero la cuenta demo.' }, { status: 422 });
  if (input.action === 'disconnect') { await prisma.channelAccount.update({ where: { id: account.id }, data: { status: 'DISCONNECTED' } }); return NextResponse.json({ data: { disconnected: true } }); }
  if (account.status !== 'CONNECTED') return NextResponse.json({ message: 'Cuenta demo desconectada.' }, { status: 422 });
  const { eventId } = await persistChannelEvent({ workspaceId: user.workspace.id, channel: input.channel, channelAccountId: account.id, type: input.type, externalUserId: input.externalUserId, content: { text: input.text, postId: input.postId ?? 'demo-post', commentId: `demo-comment-${randomUUID()}`, displayName: 'Cliente demo' }, idempotencyKey: `demo:${randomUUID()}` });
  const result = await processChannelEvent(eventId);
  return NextResponse.json({ data: { ...result, eventId, simulated: true } });
}
