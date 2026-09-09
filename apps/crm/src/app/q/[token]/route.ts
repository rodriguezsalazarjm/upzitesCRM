import { QuoteStatus } from '../../../../generated/prisma/client';
import { renderQuotePdf } from '@/lib/quotes/pdf';
import { parseIntakeSchema } from '@/lib/quotes/schema';
import { resolveQuoteByToken } from '@/lib/quotes/service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * PDF publico de una cotizacion aprobada.
 *
 * Se genera al vuelo desde los datos guardados, no se almacena: asi el archivo
 * SIEMPRE corresponde a lo aprobado, sin riesgo de que un PDF viejo quede
 * circulando con numeros que ya no son.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await resolveQuoteByToken(token);

  if (!quote) {
    return new Response('Cotizacion no encontrada.', { status: 404 });
  }

  // Un borrador o una rechazada no tienen PDF publico aunque alguien conserve
  // el enlace de una version anterior.
  const visible: QuoteStatus[] = [
    QuoteStatus.APPROVED,
    QuoteStatus.SENT,
    QuoteStatus.ACCEPTED,
    QuoteStatus.EXPIRED,
  ];

  if (!visible.includes(quote.status)) {
    return new Response('Esta cotizacion ya no esta disponible.', { status: 410 });
  }

  const ruleSet = await prisma.pricingRuleSet.findUnique({
    where: { id: quote.ruleSetId },
    select: { name: true, intakeSchema: true },
  });

  // Se muestran las etiquetas del schema, no las claves tecnicas.
  const intake = parseIntakeSchema(ruleSet?.intakeSchema);
  const inputs = quote.inputs as Record<string, unknown>;
  const labelled = (intake?.fields ?? [])
    .filter((field) => inputs[field.key] !== undefined)
    .map((field) => ({
      label: field.label,
      value: `${inputs[field.key]}${field.unit ? ` ${field.unit}` : ''}`,
    }));

  const pdf = renderQuotePdf({
    workspaceName: quote.workspace.name,
    number: quote.number,
    version: quote.version,
    serviceName: ruleSet?.name ?? quote.serviceKey,
    customerName: quote.contact
      ? `${quote.contact.firstName} ${quote.contact.lastName}`.trim()
      : 'Cliente',
    issuedAt: quote.reviewedAt ?? quote.createdAt,
    validUntil: quote.validUntil,
    currency: quote.currency,
    lines: quote.lines.map((line) => ({
      label: line.label,
      detail: line.detail,
      amount: line.amount,
    })),
    subtotal: quote.subtotal,
    surcharges: quote.surcharges,
    discounts: quote.discounts,
    total: quote.total,
    inputs: labelled,
    disclaimer: quote.disclaimer,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${quote.number}-v${quote.version}.pdf"`,
      // No se cachea: una cotizacion puede quedar sin efecto y el enlace no
      // debe seguir sirviendo una copia guardada por el navegador.
      'Cache-Control': 'no-store',
    },
  });
}
