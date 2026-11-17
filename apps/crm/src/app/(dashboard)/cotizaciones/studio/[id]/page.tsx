import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { blocksSchema, contentSchema, customerSchema, parseBrand } from '@/lib/quote-studio/schema';
import { getStudioSettings, listTemplates, logoForClient, publicQuoteUrl, publicToken } from '@/lib/quote-studio/service';
import { userMailboxes } from '@/lib/mail/service';
import { QuoteEditor } from './quote-editor';

export const dynamic = 'force-dynamic';

export default async function QuoteEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;
  const { id } = await params;
  const quote = await prisma.salesQuote.findFirst({ where: { id, workspaceId }, include: { versions: { orderBy: { version: 'desc' }, select: { version: true, channel: true, recipient: true, createdAt: true } } } });
  if (!quote) notFound();
  const [settings, templates, catalog, contacts, members, mailboxes] = await Promise.all([
    getStudioSettings(workspaceId),
    listTemplates(workspaceId),
    prisma.quoteCatalogItem.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { name: 'asc' }, take: 500 }),
    // shortcut: los 300 contactos más recientes; cambiar a un buscador si el negocio tiene muchos más.
    prisma.contact.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, take: 300, select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: { select: { name: true } } } }),
    prisma.workspaceMembership.findMany({ where: { workspaceId, status: 'ACTIVE' }, select: { user: { select: { id: true, name: true } } } }),
    userMailboxes(workspaceId, user.id),
  ]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title={`Cotización ${quote.number}`} subtitle={quote.title || 'Arma la cotización; la vista previa es el PDF que recibirá el cliente'} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <QuoteEditor
          quote={{
            id: quote.id, number: quote.number, version: quote.version, status: quote.status, templateId: quote.templateId, title: quote.title, currency: quote.currency as 'CLP' | 'USD',
            pricesIncludeTax: quote.pricesIncludeTax, customer: customerSchema.parse(quote.customer), contactId: quote.contactId, opportunityId: quote.opportunityId, ownerId: quote.ownerId,
            content: contentSchema.parse(quote.content), lines: quote.lines as never, globalDiscountBp: quote.globalDiscountBp, charges: quote.charges as never,
            issuedAt: quote.issuedAt.toISOString(), validUntil: quote.validUntil?.toISOString() ?? null, responseComment: quote.responseComment,
            publicUrl: quote.publicTokenHash ? publicQuoteUrl(publicToken(quote.id)) : null,
            versions: quote.versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
          }}
          brand={parseBrand(settings.brand)}
          logo={logoForClient(settings)}
          taxRateBp={settings.taxRateBp}
          templates={templates.map((t) => ({ id: t.id, name: t.name, blocks: blocksSchema.parse(t.blocks) }))}
          catalog={catalog.map((c) => ({ id: c.id, name: c.name, description: c.description, unit: c.unit, unitPriceMinor: c.unitPriceMinor, taxRateBp: c.taxRateBp }))}
          contacts={contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), email: c.email ?? '', phone: c.phone ?? '', company: c.company?.name ?? '' }))}
          members={members.map((m) => m.user)}
          hasMailbox={mailboxes.some((m) => m.status === 'CONNECTED')}
        />
      </div>
    </div>
  );
}
