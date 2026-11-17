import { Header } from '@/components/layout/header';
import { requireCurrentUser } from '@/lib/auth';
import { listTemplates } from '@/lib/quote-studio/service';
import { NewQuoteForm } from './new-quote-form';

export const dynamic = 'force-dynamic';

/** Elegir plantilla y crear. La creación es un POST (abrir esta página no crea nada). */
export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ oportunidad?: string; contacto?: string }> }) {
  const user = await requireCurrentUser();
  const { oportunidad, contacto } = await searchParams;
  const templates = await listTemplates(user.workspace.id);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Nueva cotización" subtitle="Elige la plantilla; los datos del cliente y la oportunidad se copian solos" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <NewQuoteForm templates={templates.map((t) => ({ id: t.id, name: t.name }))} opportunityId={oportunidad ?? null} contactId={contacto ?? null} />
      </div>
    </div>
  );
}
