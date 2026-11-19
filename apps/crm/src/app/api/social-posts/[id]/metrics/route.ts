import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { fetchTikTokMetrics } from '@/lib/social/tiktok-publish';

export const dynamic = 'force-dynamic';

/** P29: métricas en vivo de un video publicado en TikTok (no se guardan). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const post = await prisma.socialPost.findFirst({
    where: { id, workspaceId: user.workspace.id },
    select: { network: true, status: true, channelAccountId: true, externalPostId: true },
  });
  if (!post) return NextResponse.json({ message: 'Publicación no encontrada.' }, { status: 404 });
  if (post.network !== 'TIKTOK' || post.status !== 'PUBLISHED' || !post.externalPostId || !post.channelAccountId) {
    return NextResponse.json({ message: 'Solo hay métricas de videos publicados en TikTok.' }, { status: 422 });
  }
  const result = await fetchTikTokMetrics({ channelAccountId: post.channelAccountId, externalPostId: post.externalPostId });
  return result.ok ? NextResponse.json({ data: result.metrics }) : NextResponse.json({ message: result.error }, { status: 422 });
}
