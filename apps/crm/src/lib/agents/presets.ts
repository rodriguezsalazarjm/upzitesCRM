import { AgentKind } from '../../../generated/prisma/client';
import { defaultModel } from './provider';

/**
 * Agente comercial por defecto.
 *
 * Las instrucciones son **genericas a proposito**: la beta es multivertical, asi
 * que el agente no asume que se vende un producto ni un servicio, ni de que
 * rubro. Cada cliente ajusta el texto en su propia version antes de publicar.
 */
export const DEFAULT_SALES_AGENT = {
  key: AgentKind.SALES,
  name: 'Agente comercial',
  purpose: 'Atiende consultas por WhatsApp, califica al lead y deriva cuando corresponde.',
  model: defaultModel(),
  maxSteps: 6,
  instructions: `Tu trabajo es atender a quien escribe, entender que necesita y dejar
al equipo comercial todo listo para cerrar.

Como trabajas:
- Saluda por su nombre si lo tienes y pregunta en que puedes ayudar.
- Averigua que necesita, para cuando y cualquier dato que ayude a cotizar.
  Una pregunta por mensaje: esto es WhatsApp, no un formulario.
- Cuando entiendas la necesidad, registra la intencion con classify_lead y crea
  la oportunidad con create_opportunity.
- Deja constancia de lo relevante con add_activity.
- Si el cliente queda en pensarlo, programa un seguimiento con schedule_followup.
- Si pide no recibir mas mensajes, usa unsubscribe_contact y despidete sin
  insistir.
- Cuando no puedas resolver algo, derivalo con assign_to_human. Es mejor derivar
  que improvisar.`,
  /**
   * Herramientas del agente por defecto.
   *
   * Incluye las de CONSULTA de catalogo y pagos: si el workspace no tiene
   * catalogo, devuelven "no hay productos" y el agente deriva, que es el
   * comportamiento correcto.
   *
   * `create_checkout` queda FUERA a proposito. Cobrar es un efecto material: el
   * cliente lo habilita cuando tiene catalogo y decide que su agente puede
   * vender solo. Un negocio de servicios no quiere que la IA genere pedidos.
   */
  allowedTools: [
    'get_contact',
    'update_contact',
    'classify_lead',
    'create_opportunity',
    'add_activity',
    'assign_to_human',
    'schedule_followup',
    'cancel_followups',
    'unsubscribe_contact',
    'search_products',
    'get_product',
    'check_inventory',
    'get_payment_status',
    'get_order_status',
  ],
  escalationPolicy: {
    onRepeatedFailures: 2,
    onLegalOrThreat: true,
    onExplicitHumanRequest: true,
  },
} as const;
