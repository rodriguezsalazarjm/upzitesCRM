import { BusinessType } from '../../../generated/prisma/client';
import type { PlanCapability } from '../billing/plans';

/**
 * Que le hace falta de verdad a este negocio para empezar.
 *
 * Antes todo paso con capacidad en el plan era obligatorio. Eso convertia la
 * puesta en marcha en una lista de deberes ajenos: a quien vende servicios se
 * le exigia conectar una pasarela de pago para poder activar, cuando cotiza y
 * cobra por transferencia desde siempre. Pedir algo que no se usa no protege a
 * nadie; solo hace que el cliente abandone o configure de mentira.
 *
 * La exigencia sale de **como vende**, nunca del rubro. Un taller y una
 * consultora venden servicios: piden lo mismo. Una tienda de ropa y una de
 * repuestos venden productos: piden lo mismo. El rubro cambia el texto que
 * escribe el cliente, no los requisitos del sistema.
 *
 * Todo aqui es puro y se prueba sin base de datos.
 */

export type NeedLevel =
  /** Sin esto no se puede activar. */
  | 'REQUIRED'
  /** Sirve, pero el negocio funciona sin ello. */
  | 'OPTIONAL'
  /** El plan contratado no lo incluye. */
  | 'UNAVAILABLE';

export type StepNeed = {
  level: NeedLevel;
  /** Por que se pide, o por que no hace falta. En palabras del cliente. */
  why: string;
};

const NOT_IN_PLAN = 'Tu plan actual no incluye esta funcion.';
const NO_PLAN_YET = 'Depende del plan que elijas. Elige uno primero y esta lista se ajusta sola.';

/**
 * Capacidades del plan contratado, o `null` cuando todavia no hay plan.
 *
 * La diferencia importa para el mensaje: "tu plan no lo incluye" es falso —y
 * desconcertante— cuando el cliente aun no eligio ninguno.
 */
export type PlanCapabilities = readonly PlanCapability[] | null;

function gated(capability: PlanCapability, capabilities: PlanCapabilities, need: StepNeed): StepNeed {
  if (capabilities === null) return { level: 'REQUIRED', why: NO_PLAN_YET };
  return capabilities.includes(capability) ? need : { level: 'UNAVAILABLE', why: NOT_IN_PLAN };
}

/**
 * Cobros.
 *
 * Quien vende productos con precio fijo necesita una forma de cobrar: sin ella
 * el cliente no puede terminar la compra y el pedido queda esperando a una
 * persona. Quien vende servicios, no: el precio sale de una cotizacion y el
 * cobro se acuerda fuera. Ahi conectar pagos es una comodidad, no un requisito.
 */
export function paymentsNeed(
  businessType: BusinessType,
  capabilities: PlanCapabilities,
): StepNeed {
  if (businessType === BusinessType.SERVICES) {
    return gated('PAYMENTS', capabilities, {
      level: 'OPTIONAL',
      why: 'Vendes servicios: el precio sale de una cotizacion y puedes cobrar como acuerdes. Conecta cobros solo si quieres que el cliente pague desde el mismo chat.',
    });
  }

  if (businessType === BusinessType.INFOPRODUCT) {
    return gated('PAYMENTS', capabilities, {
      level: 'REQUIRED',
      why: 'El acceso al producto se entrega solo cuando el pago se confirma. Sin medio de cobro no hay nada que confirmar.',
    });
  }

  if (businessType === BusinessType.ECOMMERCE) {
    return gated('PAYMENTS', capabilities, {
      level: 'REQUIRED',
      why: 'Vendes productos con precio publicado: sin forma de cobrar, el cliente decide comprar y no puede terminar.',
    });
  }

  return gated('PAYMENTS', capabilities, {
    level: 'OPTIONAL',
    why: 'Primero elige como vendes; con eso sabremos si necesitas cobrar dentro del CRM.',
  });
}

/**
 * Dominio de correo.
 *
 * Solo es imprescindible cuando el correo forma parte de la entrega. En un
 * producto digital el enlace de acceso se manda por WhatsApp y por correo: el
 * correo es donde el cliente va a buscarlo dentro de tres meses, cuando la
 * conversacion ya se perdio entre otras. En los demas casos el correo sirve
 * para seguimiento, y el negocio funciona sin el.
 */
export function emailNeed(
  businessType: BusinessType,
  capabilities: PlanCapabilities,
): StepNeed {
  if (businessType === BusinessType.INFOPRODUCT) {
    return gated('EMAIL', capabilities, {
      level: 'REQUIRED',
      why: 'El acceso a lo que vendes se envia tambien por correo, porque es donde el cliente lo va a buscar meses despues. Si el correo no sale, alguien paga y se queda sin su compra.',
    });
  }

  return gated('EMAIL', capabilities, {
    level: 'OPTIONAL',
    why: 'Sirve para hacer seguimiento y recuperar ventas por correo. WhatsApp funciona sin esto.',
  });
}

/**
 * WhatsApp.
 *
 * Es el canal: sin numero conectado no hay conversaciones que atender y todo lo
 * demas del producto queda sin objeto.
 */
export function whatsappNeed(capabilities: PlanCapabilities): StepNeed {
  return gated('WHATSAPP', capabilities, {
    level: 'REQUIRED',
    why: 'Es el canal por donde llegan y se responden las conversaciones.',
  });
}

/**
 * Agente.
 *
 * Probarlo antes de soltarlo es obligatorio porque lo que se activa despues es
 * que hable con clientes reales sin que nadie mire.
 */
export function agentNeed(capabilities: PlanCapabilities): StepNeed {
  return gated('AI_AGENTS', capabilities, {
    level: 'REQUIRED',
    why: 'Al activar, el agente responde solo. Conviene haber visto que contesta antes de que le hable un cliente.',
  });
}

/**
 * Catalogo o reglas de precio.
 *
 * Siempre obligatorio: un agente sin nada que ofrecer, o sin saber a que
 * precio, termina inventando. Lo que se pide cambia segun como vende.
 */
export function catalogNeed(businessType: BusinessType, capabilities: PlanCapabilities): StepNeed {
  if (businessType === BusinessType.SERVICES) {
    // Vender servicios a medida es cotizar. Si el plan no incluye cotizaciones,
    // el paso no se vuelve opcional —el agente seguiria sin poder ofrecer
    // nada— sino que se convierte en una decision de plan, dicha sin rodeos.
    if (capabilities !== null && !capabilities.includes('QUOTES')) {
      return {
        level: 'REQUIRED',
        why: 'Vender servicios a medida significa cotizar, y tu plan actual no incluye cotizaciones. Cambia de plan, o cambia la modalidad si en realidad vendes productos con precio fijo.',
      };
    }

    return {
      level: 'REQUIRED',
      why: 'Sin una regla de precio publicada el agente no puede cotizar, y un agente que no puede cotizar termina improvisando un numero.',
    };
  }

  return {
    level: 'REQUIRED',
    why: 'Es lo que el agente puede ofrecer y a que precio. Sin catalogo no tiene de que hablar.',
  };
}

/**
 * Nombre legible de la modalidad, para no mostrarle al cliente el valor interno.
 */
export function businessTypeLabel(businessType: BusinessType) {
  if (businessType === BusinessType.SERVICES) return 'servicios';
  if (businessType === BusinessType.ECOMMERCE) return 'productos fisicos';
  if (businessType === BusinessType.INFOPRODUCT) return 'productos digitales';
  return 'sin definir';
}
