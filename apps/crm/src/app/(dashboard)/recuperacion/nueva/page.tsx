import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { DEFAULT_DRAFT, StrategyEditor } from '@/components/followups/strategy-editor';
import { requireCurrentUser } from '@/lib/auth';
import { canManageMarketing } from '@/lib/marketing/roles';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function NewStrategyPage() {
  const user = await requireCurrentUser();
  if (!canManageMarketing(user.role)) redirect('/recuperacion');
  const products = await prisma.product.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Nueva estrategia" subtitle="Seguimiento automático a quien no respondió o no compró" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link href="/recuperacion">
              <ArrowLeft strokeWidth={1.75} /> Volver a recuperación
            </Link>
          </Button>
          <StrategyEditor initial={DEFAULT_DRAFT} products={products} workspaceName={user.workspace.name} />
        </div>
      </div>
    </div>
  );
}
