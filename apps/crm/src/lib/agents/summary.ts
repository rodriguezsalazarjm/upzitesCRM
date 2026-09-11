import { MessageDirection, QuoteStatus } from '../../../generated/prisma/client';
import { prisma } from '../prisma';

/**
 * Resumen de una conversacion larga.
 *
 * El runner manda al modelo el resumen mas los ultimos 12 mensajes. Hasta ahora
 * leia `conversation.summary` y **nadie lo escribia**: pasados esos 12 mensajes,
 * todo lo anterior desaparecia. El cliente contaba su caso, y treinta mensajes
 * despues el agente no sabia de que hablaban.
 *
 * **El resumen se construye con hechos, no se le pide al modelo.** Un resumen
 * en prosa generado por el modelo seria mas natural de leer, pero puede inventar
 * —y este texto vuelve a entrar como contexto en la siguiente ejecucion, asi
 * que una invencion se vuelve permanente y se refuerza sola. Los hechos que
 * importan (que se cotizo, que se compro, si escalo) ya estan en la base y no
 * hace falta adivinarlos.
 *
 * Cuesta unas consultas y cero tokens.
 */

/** Bajo este numero de mensajes, el modelo ya los ve todos: no hace falta. */
export const SUMMARY_THRESHOLD = 12;

export async function buildConversationSummary(conversationId: string): Promise<string | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      workspaceId: true,
      contactId: true,
      createdAt: true,
      contact: {
        select: {
          firstName: true,
          lastName: true,
          lifecycleStatus: true,
          temperature: true,
          buyingIntent: true,
        },
      },
      _count: { select: { messages: true } },
    },
  });

  if (!conversation || conversation._count.messages < SUMMARY_THRESHOLD) return null;

  const partes: string[] = [];

  const contacto = conversation.contact;
  if (contacto) {
    partes.push(
      `${contacto.firstName} ${contacto.lastName}`.trim() +
        ` (${contacto.lifecycleStatus.toLowerCase()}, interes ${contacto.buyingIntent.toLowerCase()}).`,
    );
  }

  const dias = Math.max(
    1,
    Math.round((Date.now() - conversation.createdAt.getTime()) / 86_400_000),
  );
  partes.push(`Conversacion de ${conversation._count.messages} mensajes a lo largo de ${dias} dia(s).`);

  // --- Primer mensaje: casi siempre es el motivo de la consulta ---
  const primero = await prisma.message.findFirst({
    where: { conversationId, direction: MessageDirection.INBOUND },
    orderBy: { createdAt: 'asc' },
    select: { text: true },
  });

  if (primero?.text) {
    partes.push(`Empezo preguntando: "${primero.text.slice(0, 160)}".`);
  }

  // --- Que hizo el agente: las herramientas dicen los hechos ---
  const runs = await prisma.agentRun.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: { toolCalls: true, escalated: true },
  });

  const herramientas = new Map<string, number>();
  let escalada = false;

  for (const run of runs) {
    if (run.escalated) escalada = true;
    const calls = Array.isArray(run.toolCalls) ? run.toolCalls : [];
    for (const call of calls) {
      const name = (call as { name?: unknown }).name;
      if (typeof name === 'string') herramientas.set(name, (herramientas.get(name) ?? 0) + 1);
    }
  }

  if (herramientas.size > 0) {
    const lista = [...herramientas.entries()]
      .map(([name, veces]) => (veces > 1 ? `${name} (${veces})` : name))
      .join(', ');
    partes.push(`Herramientas usadas: ${lista}.`);
  }

  // --- Estado comercial: lo que de verdad importa retener ---
  if (conversation.contactId) {
    const cotizaciones = await prisma.quote.findMany({
      where: { workspaceId: conversation.workspaceId, contactId: conversation.contactId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { number: true, total: true, currency: true, status: true },
    });

    for (const cotizacion of cotizaciones) {
      const etiqueta =
        cotizacion.status === QuoteStatus.SENT
          ? 'enviada, esperando respuesta'
          : cotizacion.status === QuoteStatus.ACCEPTED
            ? 'aceptada'
            : cotizacion.status.toLowerCase();
      partes.push(
        `Cotizacion ${cotizacion.number} por ${cotizacion.total} ${cotizacion.currency}: ${etiqueta}.`,
      );
    }

    const pedidos = await prisma.customerOrder.findMany({
      where: { workspaceId: conversation.workspaceId, contactId: conversation.contactId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { total: true, currency: true, status: true },
    });

    for (const pedido of pedidos) {
      partes.push(`Pedido por ${pedido.total} ${pedido.currency}: ${pedido.status.toLowerCase()}.`);
    }
  }

  if (escalada) {
    partes.push('En algun momento se escalo a una persona.');
  }

  return partes.join(' ');
}

/**
 * Recalcula y guarda el resumen si la conversacion ya supera la ventana de
 * contexto. Se llama al final de cada ejecucion del agente.
 *
 * No lanza: un resumen que no se pudo actualizar es peor contexto, no un fallo
 * de la respuesta que ya se envio.
 */
export async function refreshConversationSummary(conversationId: string) {
  try {
    const summary = await buildConversationSummary(conversationId);
    if (!summary) return null;

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { summary },
    });

    return summary;
  } catch (error) {
    console.error('conversation_summary_failed', { conversationId, error });
    return null;
  }
}
