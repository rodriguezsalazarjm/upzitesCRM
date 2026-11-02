import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { PlanLockedNotice } from '@/components/billing/plan-locked-notice';
import { KnowledgeProfileForm } from '@/components/knowledge/knowledge-profile-form';
import { KnowledgeSources } from '@/components/knowledge/knowledge-sources';
import { requireCurrentUser } from '@/lib/auth';
import { knowledgeStorageStatus } from '@/lib/storage';
import { canManageWorkspaceSettings } from '@/lib/workspace-roles';
import { globalFaqSchema } from '@/lib/workspace-knowledge/rules';
import { getWorkspaceKnowledgeProfile, listKnowledgeSources } from '@/lib/workspace-knowledge/service';

export default async function Page() {
  const user = await requireCurrentUser();
  const [profile, sources] = await Promise.all([
    getWorkspaceKnowledgeProfile(user.workspace.id),
    listKnowledgeSources(user.workspace.id),
  ]);
  const storage = knowledgeStorageStatus();
  const faqs = Array.isArray(profile?.globalFaqs)
    ? profile.globalFaqs.flatMap((item) => { const parsed = globalFaqSchema.safeParse(item); return parsed.success ? [parsed.data] : []; })
    : [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="IA · Conocimiento" subtitle="Lo que el agente sabe de este negocio" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        <div className="mb-4 space-y-3 empty:hidden">
          <PlanLockedNotice workspaceId={user.workspace.id} feature="ai" />
        </div>
        <p className="mb-1 text-sm text-soft">
          Precios y servicios se consultan siempre desde sus catálogos; lo específico de cada producto va en su entrenamiento comercial.
        </p>
        <nav className="mb-5 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/productos" className="text-electric hover:text-electric-strong">Productos</Link>
          <Link href="/cotizaciones" className="text-electric hover:text-electric-strong">Servicios</Link>
          <Link href="/ia/agente" className="text-electric hover:text-electric-strong">Configurar agente</Link>
        </nav>
        <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          <KnowledgeProfileForm
            canEdit={canManageWorkspaceSettings(user.role)}
            initial={{
              tradeName: profile?.tradeName ?? '',
              location: profile?.location ?? '',
              paymentMethods: profile?.paymentMethods ?? '',
              serviceChannels: profile?.serviceChannels ?? '',
              globalFaqs: faqs,
              brandTone: profile?.brandTone ?? '',
              escalationRules: profile?.escalationRules ?? '',
              contactInfo: profile?.contactInfo ?? '',
              generalInstructions: profile?.generalInstructions ?? '',
            }}
          />
          <KnowledgeSources
            canManage={canManageWorkspaceSettings(user.role)}
            fileUploadReason={storage.configured ? null : storage.reason ?? 'almacenamiento no configurado.'}
            sources={sources.map((source) => ({
              ...source,
              ingestedAt: source.ingestedAt?.toISOString() ?? null,
              updatedAt: undefined,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
