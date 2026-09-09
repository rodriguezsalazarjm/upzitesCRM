import { z } from 'zod';
import {
  ActivityType,
  BuyingIntent,
  ConsentChannel,
  ConversationMode,
  OpportunityStage,
  OpportunityStatus,
  ScheduledActionType,
  SuppressionReason,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../domain/audit';
import { cancelForContact, revokeConsent, scheduleAction } from '../domain';
import { createOrder, listCatalog, OrderError } from '../commerce/orders';
import { CheckoutError, createOrderCheckout } from '../commerce/checkout';
import { createShopifyClient } from '../shopify/client';
import { createShopifyCheckout, ShopifyOrderError } from '../shopify/orders';
import { fetchLiveVariant, getShopifyConnection } from '../shopify/sync';
import { createQuote, listQuotableServices, QuoteError, requestReview } from '../quotes/service';
import type { ToolSpec } from './provider';

/**
 * Herramientas del agente.
 *
 * Reglas que cumplen TODAS (spec, seccion 8):
 *   - El contexto de workspace lo pone el servidor. El modelo no puede elegir
 *     sobre que tenant opera: `workspaceId` no es un argumento.
 *   - Input y output validados con Zod.
 *   - Autorizacion y reglas de negocio aplicadas antes del efecto.
 *   - Cada llamada deja AuditLog.
 *   - El resultado es corto, estructurado y sin secretos.
 */
export type ToolContext = {
  workspaceId: string;
  conversationId: string | null;
  contactId: string | null;
  agentRunId: string;
};

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export type AgentTool = {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  /** Efectos materiales exigen idempotencia y quedan mas vigilados. */
  hasSideEffects: boolean;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
};

/** Convierte un schema de Zod al JSON Schema que espera el proveedor. */
function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const shape = schema instanceof z.ZodObject ? schema.shape : {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape as Record<string, z.ZodTypeAny>)) {
    const unwrapped = value instanceof z.ZodOptional ? value.unwrap() : value;
    const description = value.description ?? undefined;

    if (unwrapped instanceof z.ZodString) properties[key] = { type: 'string', description };
    else if (unwrapped instanceof z.ZodNumber) properties[key] = { type: 'number', description };
    else if (unwrapped instanceof z.ZodBoolean) properties[key] = { type: 'boolean', description };
    else if (unwrapped instanceof z.ZodEnum) {
      properties[key] = { type: 'string', enum: unwrapped.options, description };
    } else if (unwrapped instanceof z.ZodArray) {
      properties[key] = { type: 'array', items: { type: 'string' }, description };
    } else {
      properties[key] = { type: 'string', description };
    }

    if (!(value instanceof z.ZodOptional)) required.push(key);
  }

  return { type: 'object', properties, required, additionalProperties: false };
}

async function audit(context: ToolContext, tool: string, metadata: Record<string, unknown>) {
  await recordAudit({
    workspaceId: context.workspaceId,
    action: `agent.tool.${tool}`,
    entity: 'AgentRun',
    entityId: context.agentRunId,
    metadata: metadata as never,
  });
}

/** El contacto de la conversacion, siempre acotado al workspace del contexto. */
async function requireContact(context: ToolContext) {
  if (!context.contactId) return null;
  return prisma.contact.findFirst({
    where: { id: context.contactId, workspaceId: context.workspaceId },
  });
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'get_contact',
    description: 'Devuelve los datos del contacto de esta conversacion.',
    schema: z.object({}),
    hasSideEffects: false,
    execute: async (_args, context) => {
      const contact = await requireContact(context);
      if (!contact) return { ok: false, error: 'No hay contacto asociado a esta conversacion.' };

      return {
        ok: true,
        data: {
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          lifecycleStatus: contact.lifecycleStatus,
          temperature: contact.temperature,
          buyingIntent: contact.buyingIntent,
          leadScore: contact.leadScore,
          tags: contact.tags,
        },
      };
    },
  },

  {
    name: 'update_contact',
    description: 'Actualiza datos basicos del contacto: nombre, apellido o email.',
    schema: z.object({
      firstName: z.string().min(1).optional().describe('Nombre de pila'),
      lastName: z.string().min(1).optional().describe('Apellido'),
      email: z.string().email().optional().describe('Correo electronico'),
    }),
    hasSideEffects: true,
    execute: async (args, context) => {
      const contact = await requireContact(context);
      if (!contact) return { ok: false, error: 'No hay contacto asociado.' };

      const parsed = z
        .object({
          firstName: z.string().min(1).optional(),
          lastName: z.string().min(1).optional(),
          email: z.string().email().optional(),
        })
        .safeParse(args);

      if (!parsed.success) return { ok: false, error: 'Datos invalidos.' };
      if (Object.keys(parsed.data).length === 0) return { ok: false, error: 'No hay nada que actualizar.' };

      await prisma.contact.update({ where: { id: contact.id }, data: parsed.data });
      await audit(context, 'update_contact', { fields: Object.keys(parsed.data) });

      return { ok: true, data: { updated: Object.keys(parsed.data) } };
    },
  },

  {
    name: 'classify_lead',
    description:
      'Registra la intencion de compra detectada. No cambia el estado comercial del contacto.',
    schema: z.object({
      intent: z
        .enum(['UNKNOWN', 'INTERESTED', 'QUOTE_REQUESTED', 'CHECKOUT_STARTED', 'NO_INTENT'])
        .describe('Intencion detectada en la conversacion'),
      reason: z.string().min(1).describe('Por que se clasifico asi'),
    }),
    hasSideEffects: true,
    execute: async (args, context) => {
      const contact = await requireContact(context);
      if (!contact) return { ok: false, error: 'No hay contacto asociado.' };

      const parsed = z
        .object({
          intent: z.enum(['UNKNOWN', 'INTERESTED', 'QUOTE_REQUESTED', 'CHECKOUT_STARTED', 'NO_INTENT']),
          reason: z.string().min(1),
        })
        .safeParse(args);

      if (!parsed.success) return { ok: false, error: 'Intencion invalida.' };

      await prisma.contact.update({
        where: { id: contact.id },
        data: { buyingIntent: parsed.data.intent as BuyingIntent },
      });
      await audit(context, 'classify_lead', parsed.data);

      return { ok: true, data: { intent: parsed.data.intent } };
    },
  },

  {
    name: 'create_opportunity',
    description: 'Crea una oportunidad comercial en la primera etapa del pipeline.',
    schema: z.object({
      title: z.string().min(1).describe('Que quiere el cliente'),
      value: z.number().int().min(0).optional().describe('Monto estimado en pesos, si se sabe'),
    }),
    hasSideEffects: true,
    execute: async (args, context) => {
      const contact = await requireContact(context);
      if (!contact) return { ok: false, error: 'No hay contacto asociado.' };

      const parsed = z
        .object({ title: z.string().min(1), value: z.number().int().min(0).optional() })
        .safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Datos invalidos.' };

      const stage = await prisma.pipelineStage.findFirst({
        where: { workspaceId: context.workspaceId, key: OpportunityStage.NEW },
      });
      if (!stage) return { ok: false, error: 'El workspace no tiene pipeline configurado.' };

      // Idempotencia: una oportunidad abierta por contacto es suficiente. Si el
      // agente insiste, se le devuelve la que ya existe.
      const existing = await prisma.opportunity.findFirst({
        where: { workspaceId: context.workspaceId, contactId: contact.id, status: OpportunityStatus.OPEN },
      });
      if (existing) return { ok: true, data: { opportunityId: existing.id, alreadyExisted: true } };

      const opportunity = await prisma.opportunity.create({
        data: {
          workspaceId: context.workspaceId,
          contactId: contact.id,
          stageId: stage.id,
          title: parsed.data.title,
          value: parsed.data.value ?? 0,
          probability: stage.probability,
        },
      });
      await audit(context, 'create_opportunity', { opportunityId: opportunity.id });

      return { ok: true, data: { opportunityId: opportunity.id } };
    },
  },

  {
    name: 'add_activity',
    description: 'Deja una nota en el historial del contacto.',
    schema: z.object({
      title: z.string().min(1).describe('Titulo breve'),
      description: z.string().optional().describe('Detalle'),
    }),
    hasSideEffects: true,
    execute: async (args, context) => {
      const parsed = z
        .object({ title: z.string().min(1), description: z.string().optional() })
        .safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Datos invalidos.' };

      const activity = await prisma.activity.create({
        data: {
          workspaceId: context.workspaceId,
          contactId: context.contactId,
          type: ActivityType.NOTE,
          title: parsed.data.title,
          description: parsed.data.description,
        },
      });
      await audit(context, 'add_activity', { activityId: activity.id });

      return { ok: true, data: { activityId: activity.id } };
    },
  },

  {
    name: 'assign_to_human',
    description:
      'Pasa la conversacion a una persona. Usar ante amenazas, temas legales, pedidos explicitos de hablar con alguien, o cuando no se puede resolver.',
    schema: z.object({
      reason: z.string().min(1).describe('Por que se escala'),
    }),
    hasSideEffects: true,
    execute: async (args, context) => {
      if (!context.conversationId) return { ok: false, error: 'No hay conversacion activa.' };

      const parsed = z.object({ reason: z.string().min(1) }).safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Falta el motivo.' };

      await prisma.conversation.updateMany({
        where: { id: context.conversationId, workspaceId: context.workspaceId },
        data: { mode: ConversationMode.HUMAN_ACTIVE },
      });

      await prisma.activity.create({
        data: {
          workspaceId: context.workspaceId,
          contactId: context.contactId,
          type: ActivityType.NOTE,
          title: 'Conversacion escalada por la IA',
          description: parsed.data.reason,
        },
      });

      await audit(context, 'assign_to_human', { reason: parsed.data.reason });

      return { ok: true, data: { escalated: true } };
    },
  },

  {
    name: 'schedule_followup',
    description: 'Programa un seguimiento futuro con el contacto.',
    schema: z.object({
      delayHours: z.number().min(1).max(24 * 30).describe('En cuantas horas'),
      note: z.string().optional().describe('Que recordar'),
    }),
    hasSideEffects: true,
    execute: async (args, context) => {
      if (!context.contactId) return { ok: false, error: 'No hay contacto asociado.' };

      const parsed = z
        .object({ delayHours: z.number().min(1).max(24 * 30), note: z.string().optional() })
        .safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Plazo invalido.' };

      const action = await scheduleAction({
        workspaceId: context.workspaceId,
        contactId: context.contactId,
        type: ScheduledActionType.FOLLOW_UP,
        runAt: new Date(Date.now() + parsed.data.delayHours * 3_600_000),
        cancelKey: `agent-followup:${context.contactId}`,
        payload: { note: parsed.data.note ?? null, agentRunId: context.agentRunId },
      });
      await audit(context, 'schedule_followup', { actionId: action.id, delayHours: parsed.data.delayHours });

      return { ok: true, data: { scheduledFor: action.runAt.toISOString() } };
    },
  },

  {
    name: 'cancel_followups',
    description: 'Cancela los seguimientos pendientes del contacto.',
    schema: z.object({ reason: z.string().min(1).describe('Por que se cancelan') }),
    hasSideEffects: true,
    execute: async (args, context) => {
      if (!context.contactId) return { ok: false, error: 'No hay contacto asociado.' };

      const parsed = z.object({ reason: z.string().min(1) }).safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Falta el motivo.' };

      const count = await cancelForContact({
        workspaceId: context.workspaceId,
        contactId: context.contactId,
        reason: parsed.data.reason,
      });
      await audit(context, 'cancel_followups', { count });

      return { ok: true, data: { canceled: count } };
    },
  },

  {
    name: 'unsubscribe_contact',
    description:
      'Da de baja al contacto de un canal cuando pide no ser contactado. Es irreversible desde el agente.',
    schema: z.object({
      channel: z.enum(['WHATSAPP', 'EMAIL']).describe('Canal del que se da de baja'),
    }),
    hasSideEffects: true,
    execute: async (args, context) => {
      if (!context.contactId) return { ok: false, error: 'No hay contacto asociado.' };

      const parsed = z.object({ channel: z.enum(['WHATSAPP', 'EMAIL']) }).safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Canal invalido.' };

      const result = await revokeConsent({
        workspaceId: context.workspaceId,
        contactId: context.contactId,
        channel: parsed.data.channel as ConsentChannel,
        reason: SuppressionReason.USER_REQUEST,
        source: 'agente-ia',
      });
      await audit(context, 'unsubscribe_contact', { channel: parsed.data.channel });

      return { ok: true, data: { unsubscribed: result.revoked, canceledActions: result.canceledActions } };
    },
  },
  // --- Fase 5: comercio -------------------------------------------------------
  // El precio SIEMPRE lo pone el servidor. El agente no lo propone ni lo
  // confirma: consulta el catalogo, arma el pedido con ids y el backend calcula.

  {
    name: 'search_products',
    description:
      'Busca productos del catalogo. Devuelve nombre, descripcion y precio real. Usala antes de hablar de precios.',
    schema: z.object({
      query: z.string().optional().describe('Texto a buscar. Omitir para ver todo el catalogo.'),
    }),
    hasSideEffects: false,
    execute: async (args, context) => {
      const parsed = z.object({ query: z.string().optional() }).safeParse(args);
      const products = await listCatalog(context.workspaceId, parsed.success ? parsed.data.query : undefined);

      if (products.length === 0) {
        return { ok: false, error: 'No hay productos en el catalogo.' };
      }

      return {
        ok: true,
        data: products.map((product) => ({
          productId: product.id,
          name: product.name,
          description: product.description,
          type: product.type,
          variants: product.variants.map((variant) => ({
            variantId: variant.id,
            name: variant.name,
            priceClp: variant.priceClp,
            available: variant.inventory === null || variant.inventory > 0,
          })),
        })),
      };
    },
  },

  {
    name: 'get_product',
    description: 'Detalle de un producto por su id.',
    schema: z.object({ productId: z.string().min(1).describe('Id devuelto por search_products') }),
    hasSideEffects: false,
    execute: async (args, context) => {
      const parsed = z.object({ productId: z.string().min(1) }).safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Falta el productId.' };

      const product = await prisma.product.findFirst({
        where: { id: parsed.data.productId, workspaceId: context.workspaceId, status: 'ACTIVE' },
        include: { variants: { where: { isActive: true } } },
      });

      if (!product) return { ok: false, error: 'Ese producto no existe o no esta disponible.' };

      return {
        ok: true,
        data: {
          name: product.name,
          description: product.description,
          type: product.type,
          variants: product.variants.map((v) => ({
            variantId: v.id,
            name: v.name,
            priceClp: v.priceClp,
            available: v.inventory === null || v.inventory > 0,
          })),
        },
      };
    },
  },

  {
    name: 'check_inventory',
    description: 'Consulta si una variante tiene stock disponible.',
    schema: z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).default(1) }),
    hasSideEffects: false,
    execute: async (args, context) => {
      const parsed = z
        .object({ variantId: z.string().min(1), quantity: z.number().int().min(1).default(1) })
        .safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Datos invalidos.' };

      const variant = await prisma.productVariant.findFirst({
        where: {
          id: parsed.data.variantId,
          isActive: true,
          product: { workspaceId: context.workspaceId, status: 'ACTIVE' },
        },
        select: {
          inventory: true,
          priceClp: true,
          externalId: true,
          product: { select: { connectionId: true } },
        },
      });

      if (!variant) return { ok: false, error: 'Esa variante no existe o no esta disponible.' };

      // Para Shopify se consulta en vivo: la copia local puede tener horas.
      if (variant.product.connectionId && variant.externalId) {
        const connection = await getShopifyConnection(context.workspaceId);

        if (connection?.status === 'CONNECTED') {
          try {
            const live = await fetchLiveVariant(createShopifyClient(connection), variant.externalId);
            if (!live) return { ok: false, error: 'Ese producto ya no esta en la tienda.' };

            return {
              ok: true,
              data: {
                available:
                  live.availableForSale &&
                  (live.inventory === null || live.inventory >= parsed.data.quantity),
                unlimited: live.inventory === null,
                priceClp: live.priceClp,
                source: 'shopify',
              },
            };
          } catch {
            // Si la tienda no responde, se dice que no se pudo confirmar en vez
            // de afirmar disponibilidad con datos viejos.
            return { ok: false, error: 'No pude confirmar el stock con la tienda en este momento.' };
          }
        }
      }

      const unlimited = variant.inventory === null;
      return {
        ok: true,
        data: {
          available: unlimited || variant.inventory! >= parsed.data.quantity,
          unlimited,
          priceClp: variant.priceClp,
          source: 'internal',
        },
      };
    },
  },

  {
    name: 'create_checkout',
    description:
      'Crea el pedido y devuelve el enlace de pago. Confirma con el cliente producto, cantidad y precio ANTES de usarla.',
    schema: z.object({
      variantId: z.string().min(1).describe('Id de la variante a comprar'),
      quantity: z.number().int().min(1).max(20).default(1),
      email: z.string().email().optional().describe('Email para enviar el acceso'),
    }),
    hasSideEffects: true,
    execute: async (args, context) => {
      if (!context.contactId) return { ok: false, error: 'No hay contacto asociado.' };

      const parsed = z
        .object({
          variantId: z.string().min(1),
          quantity: z.number().int().min(1).max(20).default(1),
          email: z.string().email().optional(),
        })
        .safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Datos invalidos para el checkout.' };

      // El producto puede venir del catalogo interno o de Shopify. La variante
      // dice de cual, y cada origen cobra distinto.
      const variant = await prisma.productVariant.findFirst({
        where: { id: parsed.data.variantId, product: { workspaceId: context.workspaceId } },
        include: { product: { select: { connectionId: true } } },
      });

      if (!variant) return { ok: false, error: 'Esa variante no existe.' };

      try {
        // --- Shopify: la tienda es la fuente de verdad ---
        if (variant.product.connectionId && variant.externalId) {
          const connection = await getShopifyConnection(context.workspaceId);

          if (!connection || connection.status !== 'CONNECTED') {
            return { ok: false, error: 'La tienda no esta conectada en este momento.' };
          }

          const checkout = await createShopifyCheckout({
            workspaceId: context.workspaceId,
            connectionId: connection.id,
            fetcher: createShopifyClient(connection),
            externalVariantId: variant.externalId,
            quantity: parsed.data.quantity,
            contactId: context.contactId,
            conversationId: context.conversationId,
            email: parsed.data.email,
            // Precio de la copia local: si la tienda dice otro, se aborta en
            // vez de cobrar distinto de lo que se converso.
            quotedPriceClp: variant.priceClp,
          });

          await audit(context, 'create_checkout', {
            orderId: checkout.orderId,
            total: checkout.totalClp,
            provider: 'SHOPIFY',
          });

          return {
            ok: true,
            data: {
              checkoutUrl: checkout.checkoutUrl,
              totalClp: checkout.totalClp,
              orderId: checkout.orderId,
            },
          };
        }

        // --- Catalogo interno: Mercado Pago ---
        const order = await createOrder({
          workspaceId: context.workspaceId,
          contactId: context.contactId,
          conversationId: context.conversationId,
          customerEmail: parsed.data.email,
          items: [{ variantId: parsed.data.variantId, quantity: parsed.data.quantity }],
        });

        const checkout = await createOrderCheckout({
          workspaceId: context.workspaceId,
          orderId: order.id,
        });

        await audit(context, 'create_checkout', {
          orderId: order.id,
          total: order.total,
          provider: 'INTERNAL',
        });

        // Se devuelve el total calculado por el servidor: el agente lo repite,
        // no lo inventa.
        return {
          ok: true,
          data: { checkoutUrl: checkout.checkoutUrl, totalClp: order.total, orderId: order.id },
        };
      } catch (error) {
        if (error instanceof OrderError) return { ok: false, error: error.message };
        // El cambio de precio se le dice al agente tal cual, para que lo
        // reconfirme con el cliente en vez de cobrar de mas.
        if (error instanceof ShopifyOrderError) return { ok: false, error: error.message };
        if (error instanceof CheckoutError) {
          return { ok: false, error: 'No pude generar el enlace de pago en este momento.' };
        }
        throw error;
      }
    },
  },

  {
    name: 'get_payment_status',
    description:
      'Estado real del pago de un pedido. Usala cuando el cliente diga que ya pago: nunca aceptes su palabra ni una captura.',
    schema: z.object({ orderId: z.string().min(1) }),
    hasSideEffects: false,
    execute: async (args, context) => {
      const parsed = z.object({ orderId: z.string().min(1) }).safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Falta el orderId.' };

      const order = await prisma.customerOrder.findFirst({
        where: { id: parsed.data.orderId, workspaceId: context.workspaceId },
        include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });

      if (!order) return { ok: false, error: 'Ese pedido no existe.' };

      const payment = order.payments[0];
      return {
        ok: true,
        data: {
          orderStatus: order.status,
          paymentStatus: payment?.status ?? 'SIN_PAGO',
          paid: order.status === 'CONFIRMED' || order.status === 'FULFILLED',
        },
      };
    },
  },

  {
    name: 'get_order_status',
    description: 'Estado de un pedido y si su entrega ya se realizo.',
    schema: z.object({ orderId: z.string().min(1) }),
    hasSideEffects: false,
    execute: async (args, context) => {
      const parsed = z.object({ orderId: z.string().min(1) }).safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Falta el orderId.' };

      const order = await prisma.customerOrder.findFirst({
        where: { id: parsed.data.orderId, workspaceId: context.workspaceId },
        include: { lines: true, fulfillments: true, deliveries: true },
      });

      if (!order) return { ok: false, error: 'Ese pedido no existe.' };

      return {
        ok: true,
        data: {
          status: order.status,
          totalClp: order.total,
          items: order.lines.map((line) => ({ name: line.name, quantity: line.quantity })),
          delivered: order.deliveries.length > 0,
          // El enlace de entrega NUNCA se devuelve al agente: si el cliente lo
          // perdio, lo reenvia una persona desde el CRM.
        },
      };
    },
  },
  // --- Fase 7: cotizacion -----------------------------------------------------
  // El agente recolecta datos y pide el calculo. La aritmetica la hace el motor
  // determinista del servidor: el modelo nunca produce el total.

  {
    name: 'collect_quote_inputs',
    description:
      'Lista los servicios cotizables y que datos hay que pedirle al cliente para cada uno. Usala ANTES de intentar cotizar.',
    schema: z.object({}),
    hasSideEffects: false,
    execute: async (_args, context) => {
      const services = await listQuotableServices(context.workspaceId);

      if (services.length === 0) {
        return { ok: false, error: 'Este negocio no tiene servicios cotizables configurados.' };
      }

      return {
        ok: true,
        data: services.map((service) => ({
          serviceKey: service.serviceKey,
          name: service.name,
          description: service.description,
          camposRequeridos: service.fields
            .filter((field) => field.required)
            .map((field) => ({
              key: field.key,
              pregunta: field.label,
              tipo: field.type,
              unidad: field.unit,
              opciones: field.options,
              ayuda: field.help,
            })),
        })),
      };
    },
  },

  {
    name: 'calculate_quote',
    description:
      'Calcula la cotizacion con los datos recolectados. Si faltan datos devuelve cuales: preguntalos y vuelve a intentar. El total lo calcula el sistema, no lo inventes.',
    schema: z.object({
      serviceKey: z.string().min(1).describe('Servicio, segun collect_quote_inputs'),
      inputs: z.string().min(2).describe('JSON con los datos: {"metros": 12, "altura": 2.5}'),
    }),
    hasSideEffects: true,
    execute: async (args, context) => {
      if (!context.contactId) return { ok: false, error: 'No hay contacto asociado.' };

      const parsed = z
        .object({ serviceKey: z.string().min(1), inputs: z.string().min(2) })
        .safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Datos invalidos.' };

      let inputs: Record<string, unknown>;
      try {
        inputs = JSON.parse(parsed.data.inputs);
      } catch {
        return { ok: false, error: 'El campo `inputs` debe ser un JSON valido.' };
      }

      try {
        const quote = await createQuote({
          workspaceId: context.workspaceId,
          serviceKey: parsed.data.serviceKey,
          inputs,
          contactId: context.contactId,
          conversationId: context.conversationId,
        });

        await audit(context, 'calculate_quote', {
          quoteId: quote.id,
          total: quote.total,
          serviceKey: parsed.data.serviceKey,
        });

        return {
          ok: true,
          data: {
            quoteId: quote.id,
            numero: quote.number,
            // El total viene del motor. El agente lo repite tal cual.
            totalClp: quote.total,
            desglose: quote.lines.map((line) => ({ concepto: line.label, monto: line.amount })),
            disclaimer: quote.disclaimer,
            estado: 'Pendiente de revision humana antes de enviarse.',
          },
        };
      } catch (error) {
        if (error instanceof QuoteError) {
          // Los datos faltantes vuelven con su etiqueta, para que el agente
          // pregunte en lenguaje natural en vez de pedir la clave tecnica.
          if (error.code === 'MISSING_DATA') {
            const details = error.details as { fields?: { label: string; unit?: string }[] };
            return {
              ok: false,
              error: 'Faltan datos para cotizar.',
              faltan: (details?.fields ?? []).map((field) =>
                field.unit ? `${field.label} (${field.unit})` : field.label,
              ),
            } as never;
          }
          return { ok: false, error: error.message };
        }
        throw error;
      }
    },
  },

  {
    name: 'request_quote_review',
    description: 'Deja la cotizacion en la cola de revision humana con una nota.',
    schema: z.object({
      quoteId: z.string().min(1),
      note: z.string().optional().describe('Contexto util para quien revisa'),
    }),
    hasSideEffects: true,
    execute: async (args, context) => {
      const parsed = z.object({ quoteId: z.string().min(1), note: z.string().optional() }).safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Falta el quoteId.' };

      const quote = await prisma.quote.findFirst({
        where: { id: parsed.data.quoteId, workspaceId: context.workspaceId },
        select: { id: true },
      });
      if (!quote) return { ok: false, error: 'Esa cotizacion no existe.' };

      await requestReview({
        workspaceId: context.workspaceId,
        quoteId: quote.id,
        note: parsed.data.note,
      });
      await audit(context, 'request_quote_review', { quoteId: quote.id });

      return { ok: true, data: { enRevision: true } };
    },
  },

  {
    name: 'get_quote_status',
    description: 'Estado de una cotizacion: si ya fue revisada, enviada o aceptada.',
    schema: z.object({ quoteId: z.string().min(1) }),
    hasSideEffects: false,
    execute: async (args, context) => {
      const parsed = z.object({ quoteId: z.string().min(1) }).safeParse(args);
      if (!parsed.success) return { ok: false, error: 'Falta el quoteId.' };

      const quote = await prisma.quote.findFirst({
        where: { id: parsed.data.quoteId, workspaceId: context.workspaceId },
        select: {
          number: true,
          version: true,
          status: true,
          total: true,
          currency: true,
          validUntil: true,
        },
      });

      if (!quote) return { ok: false, error: 'Esa cotizacion no existe.' };

      // El enlace del PDF NUNCA se le entrega al agente: lo envia una persona
      // desde el CRM tras aprobar.
      return { ok: true, data: quote };
    },
  },
];

/**
 * Herramientas de la spec que aun no existen.
 *
 * Vacia desde la Fase 7: todas las capacidades planificadas estan implementadas.
 * Se conserva la lista porque el prompt la usa para que el agente reconozca sus
 * limites, y volvera a llenarse si aparece una capacidad nueva.
 */
export const PENDING_TOOLS: readonly string[] = [];

/**
 * Herramientas de la spec que NO se implementaran como herramienta del agente.
 *
 * `create_digital_delivery`: la entrega la dispara el webhook de pago
 * verificado. Darle al agente la capacidad de conceder accesos seria darle la
 * capacidad de regalarlos si alguien lo convence. Reenviar un acceso perdido es
 * una accion humana (`POST /api/orders/[id]/resend`).
 */
export const OMITTED_BY_DESIGN = ['create_digital_delivery'] as const;

const BY_NAME = new Map(AGENT_TOOLS.map((tool) => [tool.name, tool]));

export function toolByName(name: string) {
  return BY_NAME.get(name) ?? null;
}

/** Especificaciones para el proveedor, filtradas por la lista blanca de la version. */
export function toolSpecsFor(allowedTools: string[]): ToolSpec[] {
  return AGENT_TOOLS.filter((tool) => allowedTools.includes(tool.name)).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toJsonSchema(tool.schema),
  }));
}

export const ALL_TOOL_NAMES = AGENT_TOOLS.map((tool) => tool.name);
