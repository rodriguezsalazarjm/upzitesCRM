'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Archive, Forward, Inbox, MailOpen, Paperclip, Reply } from 'lucide-react';
import { Compose, type ComposeInitial } from '@/components/mail/compose';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';

type Attachment = { id: string; filename: string; mimeType: string; size: number };
type Message = { id: string; outbound: boolean; fromAddress: string; fromName: string; to: string[]; cc: string[]; subject: string; bodyText: string; sentAt: string; attachments: Attachment[]; salesQuoteId: string | null };
type Option = { id: string; label: string };
type Context = {
  contact: { id: string; name: string; email: string; phone: string } | null;
  company: { id: string; name: string } | null;
  opportunity: { id: string; title: string; value: number; status: string } | null;
  activities: { id: string; title: string; at: string }[];
  quotes: { id: string; number: string; status: string; total: string }[];
  orders: { id: string; status: string; total: string; at: string }[];
};

const date = (iso: string) => new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const size = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const quoteText = (m: Message) => `\n\nEl ${date(m.sentAt)}, ${m.fromName || m.fromAddress} escribió:\n${m.bodyText.split('\n').map((l) => `> ${l}`).join('\n')}`;

export function ThreadView({ thread, messages, mailboxes, options, context, readError }: {
  thread: { id: string; subject: string; inInbox: boolean; unread: boolean; contactId: string | null; companyId: string | null; opportunityId: string | null; mailbox: string };
  messages: Message[]; mailboxes: { id: string; emailAddress: string }[]; options: { contacts: Option[]; companies: Option[]; opportunities: Option[] }; context: Context; readError: string | null;
}) {
  const router = useRouter();
  const [compose, setCompose] = useState<ComposeInitial | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(readError ?? '');
  const last = messages[messages.length - 1];
  const lastInbound = [...messages].reverse().find((m) => !m.outbound) ?? last;

  async function patch(body: Record<string, unknown>, after?: () => void) {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/mail/threads/${thread.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!response?.ok) return setError(json?.message ?? 'No se pudo completar.');
    after?.();
    router.refresh();
  }
  const reply = () => {
    if (!lastInbound) return;
    const to = lastInbound.outbound ? lastInbound.to.join(', ') : lastInbound.fromAddress;
    setCompose({ to, replyToMessageId: lastInbound.id, text: quoteText(lastInbound) });
  };
  const forward = () => last && setCompose({ subject: last.subject, forwardMessageId: last.id, forwardedAttachments: last.attachments.map((a) => a.filename) });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="space-y-3 pb-3 pl-16 pr-4 pt-5 md:pl-5 md:pr-5">
        <Link href={thread.inInbox ? '/inbox/email' : '/inbox/email?carpeta=archived'} className="text-xs font-semibold text-electric hover:underline">← Email</Link>
        <h1 className="text-xl font-bold text-carbon" data-thread-subject>{thread.subject || '(sin asunto)'}</h1>
        <div className="flex flex-wrap gap-2" data-thread-actions>
          <Button type="button" size="sm" disabled={!mailboxes.length} onClick={reply} data-reply><Reply aria-hidden /> Responder</Button>
          <Button type="button" size="sm" variant="outline" disabled={!mailboxes.length} onClick={forward} data-forward><Forward aria-hidden /> Reenviar</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void patch({ read: false }, () => router.push('/inbox/email'))} data-mark-unread><MailOpen aria-hidden /> Marcar no leído</Button>
          {thread.inInbox
            ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void patch({ archive: true }, () => router.push('/inbox/email'))} data-archive><Archive aria-hidden /> Archivar</Button>
            : <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void patch({ archive: false })} data-unarchive><Inbox aria-hidden /> Mover a recibidos</Button>}
        </div>
        {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      </div>

      <div className="grid gap-4 px-4 pb-6 md:px-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          {messages.map((m) => (
            <Card key={m.id} className="space-y-2 p-4" data-message={m.id}>
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold text-carbon">{m.outbound ? 'Tú' : m.fromName || m.fromAddress}</span>
                {!m.outbound && m.fromName && <span className="text-xs text-soft">{m.fromAddress}</span>}
                <span className="ml-auto text-xs text-soft">{date(m.sentAt)}</span>
              </div>
              <p className="break-words text-xs text-soft">Para: {m.to.join(', ')}{m.cc.length ? ` · CC: ${m.cc.join(', ')}` : ''}</p>
              {/* Siempre texto: el HTML del remitente nunca se interpreta en el CRM. */}
              <div className="whitespace-pre-wrap break-words text-sm text-carbon">{m.bodyText || '(sin texto)'}</div>
              {m.attachments.length > 0 && (
                <ul className="flex flex-wrap gap-2 pt-1" data-attachments>
                  {m.attachments.map((a) => (
                    <li key={a.id}>
                      {a.id.startsWith('local-')
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-ivory px-2 py-1 text-xs text-graphite"><Paperclip className="size-3.5" aria-hidden /> {a.filename} · {size(a.size)}</span>
                        : <a href={`/api/mail/messages/${m.id}/attachments/${encodeURIComponent(a.id)}`} className="inline-flex items-center gap-1 rounded-full bg-ivory px-2 py-1 text-xs text-graphite hover:text-electric" data-attachment={a.filename}><Paperclip className="size-3.5" aria-hidden /> {a.filename} · {size(a.size)}</a>}
                    </li>
                  ))}
                </ul>
              )}
              {m.salesQuoteId && <Link href={`/cotizaciones/studio/${m.salesQuoteId}`} className="text-xs font-semibold text-electric hover:underline">Ver cotización enviada</Link>}
            </Card>
          ))}
          {compose && (
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold text-carbon">{compose.forwardMessageId ? 'Reenviar' : 'Responder'}</p>
              <Compose key={JSON.stringify(compose)} mailboxes={mailboxes} initial={compose} compact={Boolean(compose.replyToMessageId)} onDone={() => setCompose(null)} />
            </Card>
          )}
          {!mailboxes.length && <p className="text-sm text-soft">Para responder, reconecta {thread.mailbox}.</p>}
        </div>

        <aside className="min-w-0 space-y-3" data-crm-context>
          <Card className="space-y-2 p-4">
            <Eyebrow>Relacionado en el CRM</Eyebrow>
            {([
              ['contactId', 'Contacto', options.contacts, thread.contactId],
              ['companyId', 'Empresa', options.companies, thread.companyId],
              ['opportunityId', 'Oportunidad', options.opportunities, thread.opportunityId],
            ] as const).map(([key, label, list, value]) => (
              <label key={key} className="block space-y-1 text-xs"><span className="font-semibold text-carbon">{label}</span>
                <Select density="sm" value={value ?? ''} disabled={busy} onChange={(e) => void patch({ link: { [key]: e.target.value || null } })} data-link={key}>
                  <option value="">Sin {label.toLowerCase()}</option>
                  {/* El vinculado puede no estar entre los 300 recientes: se agrega para no perderlo. */}
                  {value && !list.some((o) => o.id === value) && <option value={value}>{key === 'contactId' ? context.contact?.name : key === 'companyId' ? context.company?.name : context.opportunity?.title}</option>}
                  {list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select></label>
            ))}
          </Card>
          {context.contact && (
            <Card className="space-y-3 p-4 text-sm">
              <div>
                <Link href={`/contactos/${context.contact.id}`} className="font-semibold text-carbon hover:underline">{context.contact.name}</Link>
                <p className="text-xs text-soft">{[context.contact.email, context.contact.phone].filter(Boolean).join(' · ')}</p>
                {context.company && <p className="text-xs text-graphite">{context.company.name}</p>}
              </div>
              {context.opportunity && <p className="text-xs"><span className="font-semibold">Oportunidad:</span> {context.opportunity.title} · {formatCurrency(context.opportunity.value)}</p>}
              <Section title="Últimas actividades" empty="Sin actividades.">{context.activities.map((a) => <li key={a.id}>{a.title} <span className="text-soft">· {date(a.at)}</span></li>)}</Section>
              <Section title="Cotizaciones" empty="Sin cotizaciones.">{context.quotes.map((q) => <li key={q.id}><Link href={`/cotizaciones/studio/${q.id}`} className="hover:underline">{q.number}</Link> · {q.status} · {q.total}</li>)}</Section>
              <Section title="Pedidos" empty="Sin pedidos.">{context.orders.map((o) => <li key={o.id}><Link href={`/pedidos/${o.id}`} className="hover:underline">{date(o.at)}</Link> · {o.status} · {o.total}</li>)}</Section>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-carbon">{title}</p>
      {children.length ? <ul className="space-y-0.5 text-xs text-graphite">{children}</ul> : <p className="text-xs text-soft">{empty}</p>}
    </div>
  );
}
