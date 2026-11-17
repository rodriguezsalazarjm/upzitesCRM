import { Header } from '@/components/layout/header';
import { requireCurrentUser } from '@/lib/auth';
import { canApproveQuotes } from '@/lib/quotes/roles';
import { blocksSchema, parseBrand } from '@/lib/quote-studio/schema';
import { getStudioSettings, listTemplates, logoForClient } from '@/lib/quote-studio/service';
import { TemplateStudio } from './template-studio';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;
  const [settings, templates] = await Promise.all([getStudioSettings(workspaceId), listTemplates(workspaceId)]);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Plantillas y marca" subtitle="Diseña cómo se ven tus cotizaciones: bloques, colores, tipografía y numeración" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <TemplateStudio
          canManage={canApproveQuotes(user.role)}
          settings={{
            brand: parseBrand(settings.brand), numberPrefix: settings.numberPrefix, includeYear: settings.includeYear, yearlyReset: settings.yearlyReset, numberPadding: settings.numberPadding,
            currency: settings.currency as 'CLP' | 'USD', taxRateBp: settings.taxRateBp, pricesIncludeTax: settings.pricesIncludeTax, validityDays: settings.validityDays,
          }}
          logo={logoForClient(settings)}
          templates={templates.map((t) => ({ id: t.id, name: t.name, blocks: blocksSchema.parse(t.blocks) }))}
        />
      </div>
    </div>
  );
}
