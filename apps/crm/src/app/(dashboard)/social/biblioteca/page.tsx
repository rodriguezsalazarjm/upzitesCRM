import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { requireCurrentUser } from '@/lib/auth';
import { canManageMarketing } from '@/lib/marketing/roles';
import { prisma } from '@/lib/prisma';
import { getSessionSecret } from '@/lib/session-token';
import { assetFilePath } from '@/lib/social/library';
import { ContentLibrary, type LibraryAsset } from './content-library';

export const dynamic = 'force-dynamic';

export default async function BibliotecaPage() {
  const user = await requireCurrentUser();
  const secret = getSessionSecret();
  const assets = await prisma.contentAsset.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: { createdAt: 'desc' },
    // shortcut: las 500 más recientes; paginar si una marca acumula muchas más.
    take: 500,
    include: { posts: { select: { id: true, status: true, caption: true, scheduledAt: true, publishedAt: true }, orderBy: { createdAt: 'desc' } } },
  });

  const rows: LibraryAsset[] = assets.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    url: assetFilePath(asset.id, secret),
    sizeBytes: asset.sizeBytes,
    collection: asset.collection,
    tags: asset.tags,
    caption: asset.caption,
    hashtags: asset.hashtags,
    createdAt: asset.createdAt.toISOString(),
    posts: asset.posts.map((post) => ({ id: post.id, status: post.status, caption: post.caption, at: (post.publishedAt ?? post.scheduledAt)?.toISOString() ?? null })),
  }));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Biblioteca" subtitle="Sube cada imagen o video una vez y reutilízalo en todas tus publicaciones" />
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/social"><ArrowLeft aria-hidden /> Volver a Social</Link>
        </Button>
        <ContentLibrary assets={rows} canManage={canManageMarketing(user.role)} />
      </div>
    </div>
  );
}
