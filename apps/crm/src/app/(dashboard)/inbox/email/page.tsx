import Link from 'next/link';
import { Paperclip } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { requireCurrentUser } from '@/lib/auth';
import { mailProvider, MAIL_PROVIDERS } from '@/lib/mail/providers';
import { listThreads, syncUserMailboxes, userMailboxes, type Folder } from '@/lib/mail/service';
import { cn } from '@/lib/utils';
import type { MailProvider } from '../../../../../generated/prisma/client';
import { MailboxBar } from './mailbox-bar';

export const dynamic = 'force-dynamic';

const FOLDERS: { value: Folder; label: string }[] = [{ value: 'inbox', label: 'Recibidos' }, { value: 'sent', label: 'Enviados' }, { value: 'archived', label: 'Archivados' }];
const NOTICES: Record<string, string> = {
  conectado: 'Correo conectado. Ya trajimos lo de las últimas dos semanas.',
  cancelado: 'Se canceló la conexión.',
  proveedor: 'El proveedor no aceptó la conexión. Inténtalo de nuevo.',
  sin_email: 'El proveedor no informó la dirección de correo.',
};

function when(date: Date) {
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

export default async function EmailInboxPage({ searchParams }: { searchParams: Promise<{ carpeta?: string; q?: string; noleidos?: string; conectado?: string; error?: string }> }) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const folder = (FOLDERS.find((f) => f.value === params.carpeta)?.value ?? 'inbox') as Folder;
  // Al abrir: trae lo nuevo si pasaron más de 2 minutos (el cron lo hace cada 5).
  const syncErrors = await syncUserMailboxes(user.workspace.id, user.id, { onlyIfOlderThanMs: 2 * 60_000 });
  const [mailboxes, threads] = await Promise.all([
    userMailboxes(user.workspace.id, user.id),
    listThreads(user.workspace.id, user.id, { folder, q: params.q, unread: params.noleidos === '1' }),
  ]);
  const providers = (Object.keys(MAIL_PROVIDERS) as MailProvider[]).map((p) => ({ provider: p, label: MAIL_PROVIDERS[p].label, slug: MAIL_PROVIDERS[p].slug, available: Boolean(mailProvider(p)), missing: MAIL_PROVIDERS[p].env.join(' y ') }));
  const query = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ carpeta: folder, q: params.q, noleidos: params.noleidos, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/inbox/email?${next}`;
  };
  const notice = params.conectado ? NOTICES.conectado : params.error ? NOTICES[params.error] ?? 'No se pudo conectar.' : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="space-y-3 pb-3 pl-16 pr-4 pt-5 md:pl-5 md:pr-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/inbox" className="text-xs font-semibold text-electric hover:underline">← Inbox de mensajes</Link>
            <h1 className="type-display text-[36px] text-carbon">Email</h1>
          </div>
          {mailboxes.length > 0 && <Link href="/inbox/email/redactar" className={buttonVariants({ size: 'sm' })} data-compose-new>Redactar</Link>}
        </div>
        {notice && <p role="status" className="rounded-lg bg-ivory p-3 text-sm text-graphite">{notice}</p>}
        {syncErrors.map((e) => <p key={e} role="alert" className="rounded-lg bg-tomato/10 p-3 text-sm text-danger-ink">{e}</p>)}
        <MailboxBar mailboxes={mailboxes.map((m) => ({ ...m, lastSyncedAt: m.lastSyncedAt?.toISOString() ?? null, label: MAIL_PROVIDERS[m.provider].label, slug: MAIL_PROVIDERS[m.provider].slug }))} providers={providers} />
      </div>

      {mailboxes.length > 0 && (
        <div className="space-y-3 px-4 pb-6 md:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs semantics="filter" ariaLabel="Carpeta" value={folder} items={FOLDERS.map((f) => ({ value: f.value, label: f.label, href: query({ carpeta: f.value }) }))} />
            <form action="/inbox/email" className="flex min-w-0 flex-1 gap-2" role="search">
              <input type="hidden" name="carpeta" value={folder} />
              <input name="q" defaultValue={params.q ?? ''} placeholder="Buscar por persona o asunto" aria-label="Buscar" className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm" data-mail-search />
            </form>
            <Link href={query({ noleidos: params.noleidos === '1' ? undefined : '1' })} className={cn('text-xs font-semibold', params.noleidos === '1' ? 'text-electric' : 'text-graphite')} aria-pressed={params.noleidos === '1'}>Solo no leídos</Link>
          </div>
          {threads.length === 0 ? (
            <p className="py-8 text-center text-sm text-soft">{params.q ? 'Nada coincide con la búsqueda.' : 'No hay correos en esta carpeta.'}</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-paper" data-thread-list>
              {threads.map((t) => {
                const last = t.messages[0];
                const who = t.contact ? `${t.contact.firstName} ${t.contact.lastName}`.trim() : last?.outbound ? `Para: ${last.to[0] ?? ''}` : last?.fromName || last?.fromAddress || t.participants[0] || '';
                return (
                  <li key={t.id}>
                    <Link href={`/inbox/email/${t.id}`} className="flex gap-3 px-3 py-2.5 hover:bg-ivory" data-thread={t.id} data-unread={t.unread}>
                      <span aria-hidden className={cn('mt-2 size-2 shrink-0 rounded-full', t.unread ? 'bg-electric' : 'bg-transparent')} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className={cn('truncate text-sm', t.unread ? 'font-bold text-carbon' : 'text-graphite')}>{who}</span>
                          {t.contact && <span className="shrink-0 rounded-full bg-lime/35 px-1.5 text-[10px] font-semibold text-success-ink">Contacto</span>}
                          <span className="ml-auto shrink-0 text-xs text-soft">{when(t.lastMessageAt)}</span>
                        </span>
                        <span className={cn('flex items-center gap-1 truncate text-sm', t.unread ? 'font-semibold text-carbon' : 'text-carbon')}>
                          {t.hasAttachments && <Paperclip className="size-3.5 shrink-0 text-soft" aria-label="Con adjuntos" />}
                          <span className="truncate">{t.subject || '(sin asunto)'}</span>
                        </span>
                        <span className="block truncate text-xs text-soft">{t.snippet}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
