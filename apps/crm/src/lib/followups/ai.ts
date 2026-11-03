import { MessageDirection } from '../../../generated/prisma/client';
import { buildInstructions } from '../agents/guardrails';
import { LocalKnowledgeProvider } from '../agents/local-provider';
import { defaultModel, ModelProviderError, OpenAIProvider, type ModelMessage, type ModelProvider } from '../agents/provider';
import { formatMinor } from '../commerce/money';
import { checkAiCredits, recordAiCredits } from '../entitlements/ai-credits';
import { prisma } from '../prisma';
import { loadProductSalesLayer } from '../product-sales-brain/context';
import { isLocalDemo } from '../testing/local-mode';
import { loadWorkspaceKnowledgeLayer } from '../workspace-knowledge/context';
import { aiMessageViolation, cleanAiText } from './rules';

/**
 * Mensaje de seguimiento generado por IA (Punto 7, modo B).
 *
 * Reutiliza las mismas capas que el agente de ventas (Puntos 4 y 5): reglas de
 * plataforma, conocimiento del workspace, Product Sales Brain y, como nivel 3,
 * las instrucciones del paso. La IA no decide NADA del envio: cuando se llega
 * aqui el motor ya comprobo respuesta, compra, toma humana, limites, horario y
 * canal. Solo redacta, y lo que redacta pasa por una guarda en codigo.
 */

let providerOverride: ModelProvider | null = null;

/** Solo para pruebas: fija el proveedor (guionado) que usa la generacion. */
export function setFollowUpProviderForTests(provider: ModelProvider | null) {
  providerOverride = provider;
}

/**
 * Proveedor determinista del modo local: arma el mensaje con el contexto que
 * recibe, sin red. Sirve para la QA visual; nunca se usa con LOCAL_VISUAL_TEST
 * apagado.
 */
class LocalFollowUpProvider extends LocalKnowledgeProvider {
  override async complete(input: Parameters<ModelProvider['complete']>[0]) {
    const product = input.instructions.match(/\[PRODUCT FACTS\]\nNombre: ([^\n]+)/)?.[1];
    const contact = input.instructions.match(/Hablas con ([^.\n]+)\./)?.[1];
    const greeting = contact ? `Hola ${contact.split(' ')[0]}` : 'Hola';
    const topic = product ? `sobre ${product}` : 'sobre lo que conversamos';
    return {
      text: `${greeting}, te escribo ${topic}. Si te quedó alguna duda, la vemos por aquí cuando quieras.`,
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

function provider(): ModelProvider {
  if (providerOverride) return providerOverride;
  return isLocalDemo() ? new LocalFollowUpProvider() : new OpenAIProvider();
}

export type AiComposeInput = {
  workspaceId: string;
  journey: { id: string; name: string; productId: string | null; trigger: string };
  step: { position: number; label: string; aiGoal: string | null };
  enrollment: { id: string; contactId: string; conversationId: string | null };
  conversationId: string | null;
  now: Date;
};

export type AiComposeResult =
  | { ok: true; text: string }
  | { ok: false; reason: string; retryable: boolean };

const FOLLOW_UP_RULES = `Estas escribiendo UN mensaje de seguimiento comercial automatico, no respondiendo una pregunta.
- Un solo mensaje breve (maximo tres frases), natural, sin vinetas ni formato.
- El contacto no ha comprado. No presiones ni inventes urgencia.
- No ofrezcas descuentos, regalos, cupones, garantias, plazos de entrega ni condiciones que no esten escritas arriba.
- Si mencionas un precio, usa exactamente uno de los precios del producto; si no lo sabes, no lo menciones.
- No repitas un mensaje anterior de este seguimiento.
- Si el contacto pidio no ser contactado, no escribas nada: responde solo NO_ENVIAR.
- Responde solo con el texto del mensaje.`;

/**
 * Genera el texto. Nunca lanza: un fallo vuelve como `{ ok: false }` para que el
 * motor use el texto de respaldo o registre el paso como fallido.
 */
export async function composeAiFollowUp(input: AiComposeInput): Promise<AiComposeResult> {
  const credits = await checkAiCredits(input.workspaceId, { now: input.now });
  if (!credits.allowed) {
    return { ok: false, reason: credits.reason === 'NO_AI_IN_PLAN' ? 'el plan no incluye IA' : 'sin créditos de IA disponibles', retryable: false };
  }

  const [workspace, contact, product, history] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { name: true } }),
    prisma.contact.findFirst({ where: { id: input.enrollment.contactId, workspaceId: input.workspaceId }, select: { firstName: true, lastName: true } }),
    input.journey.productId
      ? prisma.product.findFirst({
          where: { id: input.journey.productId, workspaceId: input.workspaceId },
          select: { name: true, currency: true, variants: { where: { isActive: true }, select: { priceMinor: true } }, salesBrain: { select: { guarantee: true } } },
        })
      : null,
    prisma.journeyStepRun.findMany({
      where: { enrollmentId: input.enrollment.id, workspaceId: input.workspaceId, text: { not: null }, status: { in: ['SENT', 'SIMULATED'] } },
      orderBy: { position: 'asc' },
      select: { text: true },
    }),
  ]);

  const query = [product?.name, input.step.aiGoal].filter(Boolean).join(' ');
  const [knowledge, productLayer, messages] = await Promise.all([
    loadWorkspaceKnowledgeLayer(input.workspaceId, query || input.journey.name),
    loadProductSalesLayer(input.workspaceId, input.journey.productId),
    input.conversationId
      ? prisma.message.findMany({
          where: { conversationId: input.conversationId, workspaceId: input.workspaceId, text: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { direction: true, text: true },
        })
      : [],
  ]);

  const contactName = contact ? `${contact.firstName} ${contact.lastName}`.trim() : null;
  const instructions = buildInstructions({
    workspaceName: workspace?.name ?? 'el negocio',
    contactName,
    workspaceKnowledge: knowledge.content,
    productKnowledge: productLayer?.content ?? (product ? `[PRODUCT FACTS]\nNombre: ${product.name}` : undefined),
    agentInstructions: [
      FOLLOW_UP_RULES,
      `Objetivo de este mensaje (paso ${input.step.position}, "${input.step.label}"): ${input.step.aiGoal ?? ''}`,
      history.length
        ? `Mensajes de seguimiento ya enviados en esta secuencia:\n${history.map((run, index) => `${index + 1}. ${run.text}`).join('\n')}`
        : 'Es el primer mensaje de esta secuencia.',
    ].join('\n\n'),
  });

  const conversation: ModelMessage[] = messages
    .reverse()
    .map((message) => ({ role: message.direction === MessageDirection.INBOUND ? 'user' : 'assistant', content: message.text ?? '' }) as ModelMessage);
  conversation.push({ role: 'user', content: '[TAREA DEL SISTEMA] Redacta ahora el mensaje de seguimiento.' });

  const model = defaultModel();
  const driver = provider();
  let text: string | null;
  try {
    const response = await driver.complete({ model, instructions, messages: conversation, tools: [], maxOutputTokens: 300 });
    text = cleanAiText(response.text);
    await recordAiCredits({
      workspaceId: input.workspaceId,
      provider: driver.name,
      model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      referenceType: 'JourneyEnrollment',
      referenceId: input.enrollment.id,
      occurredAt: input.now,
    });
  } catch (error) {
    const retryable = error instanceof ModelProviderError ? error.retryable : true;
    return { ok: false, reason: `la IA no respondió (${error instanceof Error ? error.message : String(error)})`, retryable };
  }

  if (!text || /^NO_ENVIAR\b/i.test(text)) return { ok: false, reason: 'la IA no propuso un mensaje', retryable: false };

  const violation = aiMessageViolation(text, {
    allowedPrices: product ? product.variants.map((variant) => formatMinor(variant.priceMinor, product.currency)) : [],
    guaranteeConfigured: Boolean(product?.salesBrain?.guarantee?.trim()),
  });
  if (violation) return { ok: false, reason: `mensaje de IA descartado: ${violation}`, retryable: false };

  return { ok: true, text };
}
