import { notFound } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth';
import { formatMinor } from '@/lib/commerce/money';
import { prisma } from '@/lib/prisma';
import { getThread, MailError, setThreadState, userMailboxes } from '@/lib/mail/service';
import { QUOTE_STATUS } from '@/lib/quote-studio/status';
import type { MailAttachmentMeta } from '@/lib/mail/types';
import { ThreadView } from './thread-view';

export const dynamic = 'force-dynamic';

export default async function EmailThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;
  const { threadId } = await params;
  const loaded = await getThread(workspaceId, user.id, threadId).catch((error) => { if (error instanceof MailError) return null; throw error; });
  if (!loaded) notFound();
  const { thread, messages } = loaded;
  // Abrir = leído (en el proveedor también). Si el proveedor falla, se muestra igual.
  let readError: string | null = null;
  if (thread.unread) await setThreadState(workspaceId, user.id, thread.id, { read: true }).catch((error) => { readError = error instanceof MailError ? error.message : 'No se pudo marcar como leído.'; });

  const [mailboxes, contact, company, opportunity, contacts, companies, opportunities] = await Promise.all([
    userMailboxes(workspaceId, user.id),
    thread.contactId ? prisma.contact.findFirst({ where: { id: thread.contactId, workspaceId }, select: { id: true, firstName: true, lastName: true, email: true, phone: true, lastActivityAt: true } }) : null,
    thread.companyId ? prisma.company.findFirst({ where: { id: thread.companyId, workspaceId }, select: { id: true, name: true } }) : null,
    thread.opportunityId ? prisma.opportunity.findFirst({ where: { id: thread.opportunityId, workspaceId }, select: { id: true, title: true, value: true, status: true } }) : null,
    // shortcut: los 300 más recientes en los selectores; cambiar a buscador si el negocio tiene muchos más.
    prisma.contact.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, take: 300, select: { id: true, firstName: true, lastName: true, email: true } }),
    prisma.company.findMany({ where: { workspaceId }, orderBy: { name: 'asc' }, take: 300, select: { id: true, name: true } }),
    prisma.opportunity.findMany({ where: { workspaceId, status: 'OPEN' }, orderBy: { updatedAt: 'desc' }, take: 300, select: { id: true, title: true } }),
  ]);
  const [activities, quotes, orders] = contact ? await Promise.all([
    prisma.activity.findMany({ where: { workspaceId, contactId: contact.id }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, type: true, createdAt: true } }),
    prisma.salesQuote.findMany({ where: { workspaceId, contactId: contact.id }, orderBy: { updatedAt: 'desc' }, take: 5, select: { id: true, number: true, status: true, totalMinor: true, currency: true } }),
    prisma.customerOrder.findMany({ where: { workspaceId, contactId: contact.id }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, status: true, total: true, currency: true, createdAt: true } }),
  ]) : [[], [], []];

  return (
    <ThreadView
      readError={readError}
      thread={{ id: thread.id, subject: thread.subject, inInbox: thread.inInbox, unread: false, contactId: thread.contactId, companyId: thread.companyId, opportunityId: thread.opportunityId, mailbox: thread.mailbox.emailAddress }}
      messages={messages.map((m) => ({
        id: m.id, outbound: m.outbound, fromAddress: m.fromAddress, fromName: m.fromName, to: m.to, cc: m.cc, subject: m.subject, bodyText: m.bodyText,
        sentAt: m.sentAt.toISOString(), attachments: m.attachments as MailAttachmentMeta[], salesQuoteId: m.salesQuoteId,
      }))}
      mailboxes={mailboxes.filter((m) => m.status === 'CONNECTED' && m.emailAddress === thread.mailbox.emailAddress).map((m) => ({ id: m.id, emailAddress: m.emailAddress }))}
      options={{
        contacts: contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() + (c.email ? ` · ${c.email}` : '') })),
        companies: companies.map((c) => ({ id: c.id, label: c.name })),
        opportunities: opportunities.map((o) => ({ id: o.id, label: o.title })),
      }}
      context={{
        contact: contact ? { id: contact.id, name: `${contact.firstName} ${contact.lastName}`.trim(), email: contact.email ?? '', phone: contact.phone ?? '' } : null,
        company: company ? { id: company.id, name: company.name } : null,
        opportunity: opportunity ? { id: opportunity.id, title: opportunity.title, value: Number(opportunity.value ?? 0), status: opportunity.status } : null,
        activities: activities.map((a) => ({ id: a.id, title: a.title, at: a.createdAt.toISOString() })),
        quotes: quotes.map((q) => ({ id: q.id, number: q.number, status: QUOTE_STATUS[q.status]?.label ?? q.status, total: formatMinor(q.totalMinor, q.currency) })),
        orders: orders.map((o) => ({ id: o.id, status: o.status, total: formatMinor(o.total, o.currency), at: o.createdAt.toISOString() })),
      }}
    />
  );
}
