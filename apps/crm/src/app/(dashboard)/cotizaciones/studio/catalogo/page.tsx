import { Header } from '@/components/layout/header';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canApproveQuotes } from '@/lib/quotes/roles';
import { getStudioSettings } from '@/lib/quote-studio/service';
import { CatalogClient } from './catalog-client';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;
  const [settings, items] = await Promise.all([
    getStudioSettings(workspaceId),
    prisma.quoteCatalogItem.findMany({ where: { workspaceId, archivedAt: null }, orderBy: [{ category: 'asc' }, { name: 'asc' }], take: 500 }),
  ]);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Catálogo de cotizaciones" subtitle="Productos y servicios que agregas a una cotización con un clic" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <CatalogClient
          canManage={canApproveQuotes(user.role)}
          currency={settings.currency as 'CLP' | 'USD'}
          items={items.map((i) => ({ id: i.id, name: i.name, description: i.description, unit: i.unit, unitPriceMinor: i.unitPriceMinor, taxRateBp: i.taxRateBp, category: i.category ?? '' }))}
        />
      </div>
    </div>
  );
}
