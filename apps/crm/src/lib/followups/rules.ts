import { z } from 'zod';

/**
 * Punto 7 — Seguimiento comercial configurable. Reglas puras: que se puede
 * configurar, como se valida y como se compone un mensaje fijo.
 *
 * Una "estrategia de seguimiento" ES un journey del motor existente
 * (lib/marketing/journeys.ts): este modulo solo define la forma que la
 * interfaz puede darle. Nada de aqui habla con la base.
 */

// --- Disparadores --------------------------------------------------------------

/** Disparadores que se pueden elegir desde el configurador. */
export const FOLLOW_UP_TRIGGERS = [
  'NO_REPLY',
  'INQUIRY_NO_PURCHASE',
  'CHECKOUT_ABANDONED',
  'QUOTE_PENDING',
  'OPPORTUNITY_STALLED',
] as const;
export type FollowUpTrigger = (typeof FOLLOW_UP_TRIGGERS)[number];

/**
 * Disparadores comerciales: un contacto esta en una sola secuencia de este tipo
 * a la vez. Los de postventa (ORDER_PAID) y los manuales quedan fuera.
 */
export const COMMERCIAL_TRIGGERS = [...FOLLOW_UP_TRIGGERS, 'NO_ACTIVITY'] as const;

export const TRIGGER_LABEL: Record<string, string> = {
  NO_REPLY: 'No respondió',
  INQUIRY_NO_PURCHASE: 'Consultó y no compró',
  CHECKOUT_ABANDONED: 'Recibió el enlace de pago y no pagó',
  QUOTE_PENDING: 'Tiene una cotización sin respuesta',
  OPPORTUNITY_STALLED: 'Oportunidad sin movimiento',
  NO_ACTIVITY: 'Lead sin actividad',
  ORDER_PAID: 'Compra pagada',
  MANUAL: 'Manual',
};

/** El evento desde el que se cuenta la espera del primer paso. */
export const TRIGGER_EVENT: Record<string, string> = {
  NO_REPLY: 'tu último mensaje sin respuesta',
  INQUIRY_NO_PURCHASE: 'su última consulta',
  CHECKOUT_ABANDONED: 'la creación del pedido sin pagar',
  QUOTE_PENDING: 'la inscripción',
  OPPORTUNITY_STALLED: 'el último movimiento de la oportunidad',
  NO_ACTIVITY: 'la inscripción',
  ORDER_PAID: 'la inscripción',
  MANUAL: 'la inscripción',
};

export const TRIGGER_HELP: Record<FollowUpTrigger, string> = {
  NO_REPLY: 'Le escribiste y no contestó. Se detiene en cuanto responda.',
  INQUIRY_NO_PURCHASE: 'Escribió consultando y no completó la compra.',
  CHECKOUT_ABANDONED: 'Se creó un pedido con su enlace de pago y quedó sin pagar.',
  QUOTE_PENDING: 'Tiene una cotización enviada que no aprobó.',
  OPPORTUNITY_STALLED: 'Su oportunidad abierta no tiene movimiento.',
};

/** Disparadores que no se pueden acotar a un producto (no guardan producto). */
export const TRIGGERS_WITHOUT_PRODUCT: readonly string[] = ['OPPORTUNITY_STALLED', 'QUOTE_PENDING'];

// --- Pasos ---------------------------------------------------------------------

export const FOLLOW_UP_ACTIONS = ['SEND_WHATSAPP', 'SEND_INSTAGRAM', 'CREATE_TASK'] as const;
export type FollowUpAction = (typeof FOLLOW_UP_ACTIONS)[number];
export const MESSAGE_ACTIONS: readonly string[] = ['SEND_WHATSAPP', 'SEND_INSTAGRAM', 'SEND_EMAIL'];

export const ACTION_LABEL: Record<string, string> = {
  SEND_WHATSAPP: 'WhatsApp',
  SEND_INSTAGRAM: 'Instagram',
  SEND_EMAIL: 'Email',
  CREATE_TASK: 'Tarea para el equipo',
  SET_TEMPERATURE: 'Cambiar temperatura',
  EXIT: 'Terminar',
};

export const MAX_STEPS = 8;
export const MAX_DELAY_HOURS = 30 * 24;
export const LABEL_MAX = 80;
export const BODY_MAX = 1000;
export const AI_GOAL_MAX = 500;
export const DELAY_PRESETS = [
  { hours: 1, label: '1 hora' },
  { hours: 24, label: '24 horas' },
  { hours: 72, label: '72 horas' },
] as const;

/** Variables permitidas en un mensaje fijo. Nada fuera de esta lista se reemplaza. */
export const MESSAGE_VARIABLES = {
  nombre: 'Nombre del contacto',
  producto: 'Nombre del producto de la estrategia',
  negocio: 'Nombre de tu negocio',
} as const;
export type MessageVariable = keyof typeof MESSAGE_VARIABLES;

const VARIABLE_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Variables usadas que no existen. Un `{{precio}}` que no se reemplaza llegaria literal al cliente. */
export function unknownVariables(body: string) {
  const unknown = new Set<string>();
  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    if (!(match[1] in MESSAGE_VARIABLES)) unknown.add(match[1] || '(vacía)');
  }
  return [...unknown];
}

export function usesVariable(body: string, name: MessageVariable) {
  return [...body.matchAll(VARIABLE_PATTERN)].some((match) => match[1] === name);
}

/**
 * Compone el mensaje fijo. Los valores son texto plano: no se interpretan como
 * variables de nuevo (un nombre "{{negocio}}" no se expande).
 */
export function renderMessage(body: string, values: Partial<Record<MessageVariable, string | null | undefined>>) {
  const rendered = body.replace(VARIABLE_PATTERN, (_whole, name: string) => {
    const value = (values as Record<string, string | null | undefined>)[name];
    return typeof value === 'string' ? value.trim() : '';
  });
  // "Hola {{nombre}}," sin nombre deja "Hola ,": se limpia el espacio colgado.
  return rendered.replace(/[ \t]+([,.!?;:])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}

// --- Esquemas ------------------------------------------------------------------

const label = z.string().trim().min(1, 'Ponle un nombre al paso.').max(LABEL_MAX, `Hasta ${LABEL_MAX} caracteres.`);
const optionalText = (max: number, message: string) =>
  z.string().max(max, message).optional().default('').transform((value) => value.trim());

export const stepInputSchema = z
  .object({
    label,
    action: z.enum(FOLLOW_UP_ACTIONS, { errorMap: () => ({ message: 'Elige un canal o acción.' }) }),
    delayHours: z
      .number({ invalid_type_error: 'Indica la espera en horas.' })
      .min(0, 'La espera no puede ser negativa.')
      .max(MAX_DELAY_HOURS, 'La espera máxima es de 30 días.'),
    messageMode: z.enum(['FIXED', 'AI']).default('FIXED'),
    body: optionalText(BODY_MAX, `El mensaje admite hasta ${BODY_MAX} caracteres.`),
    aiGoal: optionalText(AI_GOAL_MAX, `El objetivo admite hasta ${AI_GOAL_MAX} caracteres.`),
  })
  .strict();
export type StepInput = z.infer<typeof stepInputSchema>;

export const strategyInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Ponle un nombre a la estrategia.').max(80, 'Hasta 80 caracteres.'),
    description: optionalText(300, 'Hasta 300 caracteres.'),
    trigger: z.enum(FOLLOW_UP_TRIGGERS, { errorMap: () => ({ message: 'Elige cuándo empieza el seguimiento.' }) }),
    productId: z.string().regex(/^[a-z0-9]{10,40}$/i, 'Producto inválido.').nullable().default(null),
    maxMessages: z.number().int('Usa un número entero.').min(1, 'Mínimo 1 mensaje.').max(10, 'Máximo 10 mensajes.'),
    minGapHours: z.number().min(0, 'No puede ser negativo.').max(720, 'Máximo 30 días.'),
    simulate: z.boolean().default(false),
    steps: z.array(stepInputSchema).min(1, 'Agrega al menos un paso.').max(MAX_STEPS, `Máximo ${MAX_STEPS} pasos.`),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.productId && TRIGGERS_WITHOUT_PRODUCT.includes(value.trigger)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['productId'], message: 'Este disparador no se puede acotar a un producto.' });
    }
    let messages = 0;
    value.steps.forEach((step, index) => {
      if (step.action === 'CREATE_TASK') {
        if (step.messageMode === 'AI') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'messageMode'], message: 'Una tarea no usa IA.' });
        }
        return;
      }
      messages += 1;
      if (step.messageMode === 'FIXED' && !step.body) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'body'], message: 'Escribe el mensaje.' });
      }
      if (step.messageMode === 'AI' && !step.aiGoal) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'aiGoal'], message: 'Dile a la IA qué debe lograr este mensaje.' });
      }
      const unknown = step.body ? unknownVariables(step.body) : [];
      if (unknown.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'body'], message: `Variable desconocida: ${unknown.map((name) => `{{${name}}}`).join(', ')}.` });
      }
      if (step.body && usesVariable(step.body, 'producto') && !value.productId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'body'], message: '{{producto}} necesita que la estrategia tenga un producto.' });
      }
    });
    if (messages === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['steps'], message: 'Agrega al menos un paso que envíe un mensaje.' });
    }
    if (value.steps[0] && value.steps[0].delayHours < 0.25) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', 0, 'delayHours'], message: 'El primer paso espera al menos 15 minutos.' });
    }
  });
export type StrategyInput = z.infer<typeof strategyInputSchema>;

export const STATUS_ACTIONS = ['publish', 'pause', 'archive'] as const;
export const statusActionSchema = z.object({ action: z.enum(STATUS_ACTIONS) }).strict();

// --- Textos de la interfaz -------------------------------------------------------

export function formatDelay(hours: number) {
  if (hours === 0) return 'enseguida';
  if (hours < 1) return `${Math.round(hours * 60)} minutos`;
  if (hours % 24 === 0) return hours === 24 ? '24 horas' : `${hours / 24} días`;
  return hours === 1 ? '1 hora' : `${Number(hours.toFixed(2))} horas`;
}

/** "1 hora después de su última consulta" / "24 horas después del paso anterior". */
export function stepScheduleLabel(index: number, delayHours: number, trigger: string) {
  const anchor = index === 0 ? TRIGGER_EVENT[trigger] ?? 'la inscripción' : 'el paso anterior';
  // "de el" se contrae: "después del paso anterior".
  const after = anchor.startsWith('el ') ? `del ${anchor.slice(3)}` : `de ${anchor}`;
  return delayHours === 0 ? `Enseguida después ${after}` : `${formatDelay(delayHours)} después ${after}`;
}

// --- Detencion -------------------------------------------------------------------

/**
 * Motivos de salida. Se guardan tal cual en `exitReason`: la medicion los
 * clasifica por igualdad, asi que un texto nuevo debe agregarse aqui.
 */
export const EXIT_REASON = {
  REPLIED: 'el contacto respondio',
  PURCHASED: 'el contacto compro',
  HUMAN: 'un humano tomo la conversacion',
  OPTED_OUT: 'el contacto pidio no recibir mas mensajes',
  MAX_MESSAGES: 'alcanzo el maximo de mensajes',
  OPPORTUNITY_MOVED: 'la oportunidad cambio',
  ORDER_CLOSED: 'el pedido se cerro',
  MANUAL: 'cancelado por una persona',
  ARCHIVED: 'la estrategia se desactivo',
} as const;

export const EXIT_REASON_LABEL: Record<string, string> = {
  [EXIT_REASON.REPLIED]: 'Respondió',
  [EXIT_REASON.PURCHASED]: 'Compró',
  [EXIT_REASON.HUMAN]: 'Lo tomó una persona',
  [EXIT_REASON.OPTED_OUT]: 'Pidió no recibir más mensajes',
  [EXIT_REASON.MAX_MESSAGES]: 'Llegó al máximo de mensajes',
  [EXIT_REASON.OPPORTUNITY_MOVED]: 'La oportunidad cambió',
  [EXIT_REASON.ORDER_CLOSED]: 'El pedido se cerró',
  [EXIT_REASON.MANUAL]: 'Cancelado a mano',
  [EXIT_REASON.ARCHIVED]: 'Estrategia desactivada',
  'ultimo paso ejecutado': 'Terminó todos los pasos',
  'sin mas pasos': 'Terminó todos los pasos',
  'cumplio una condicion de salida': 'Cumplió una condición de salida',
};

/**
 * Señales explicitas de "no me escriban mas". Deliberadamente corta: una frase
 * ambigua no debe dejar a alguien sin respuesta, pero estas si son claras. Ante
 * cualquier respuesta la secuencia se detiene igual; esto decide ademas que no
 * vuelva a entrar a otra.
 */
const OPT_OUT_PATTERNS = [
  /^\s*(stop|baja|basta|unsubscribe)\s*[.!]*\s*$/i,
  /\bno\s+me\s+(escrib\w*|contact\w*|mand\w*|envi\w*)\b/i,
  /\bno\s+(quiero|deseo)\s+(recibir|que\s+me)\b/i,
  /\bdej(a|en|e)\s+de\s+(escribir|mandar|enviar|contactar)/i,
  /\b(dar(me)?\s+de\s+baja|darme\s+de\s+baja|elimin(a|en)\s+mi\s+(numero|número|contacto))\b/i,
  /\bno\s+me\s+interesa\b/i,
];

export function isOptOutText(text: string | null | undefined) {
  if (!text) return false;
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(text));
}

// --- Guardas del mensaje generado por IA ---------------------------------------

/**
 * Lo que un seguimiento automatico no puede afirmar por su cuenta. Se aplica en
 * codigo despues de generar: el prompt pide lo mismo, pero un prompt no es un
 * control. Un precio solo pasa si es exactamente uno de los configurados.
 */
const AI_FORBIDDEN = [
  { pattern: /\b\d{1,3}\s*%\s*(de\s+)?(descuento|dcto|off)\b/i, reason: 'menciona un descuento' },
  { pattern: /\b(descuento|rebaja|cup[oó]n|c[oó]digo promocional|precio especial|2x1|gratis)\b/i, reason: 'ofrece un beneficio no configurado' },
  { pattern: /\b(te lo despacho|llega (el|en)|entrega en \d+|en \d+\s*(d[ií]as|horas) (h[aá]biles )?(te )?(llega|lo tienes))/i, reason: 'promete un plazo' },
  { pattern: /\b(solo por hoy|[uú]ltim[ao]s? (unidades|cupos)|quedan \d+)\b/i, reason: 'inventa urgencia o stock' },
  { pattern: /\b(tu pago (fue|est[aá]) (confirmado|aprobado|recibido))\b/i, reason: 'afirma un estado de pago' },
] as const;

export function aiMessageViolation(text: string, input: { allowedPrices: string[]; guaranteeConfigured: boolean }) {
  for (const rule of AI_FORBIDDEN) {
    if (rule.pattern.test(text)) return rule.reason;
  }
  if (!input.guaranteeConfigured && /\bgarant[ií]a\b/i.test(text)) return 'menciona una garantía que no está configurada';
  const amounts = text.match(/(?:US)?\$\s?\d[\d.,]*/g) ?? [];
  const allowed = new Set(input.allowedPrices.map((price) => price.replace(/\s/g, '')));
  const foreign = amounts.find((amount) => !allowed.has(amount.replace(/\s/g, '').replace(/[.,]$/, '')));
  if (foreign) return `menciona un monto que no es un precio configurado (${foreign})`;
  return null;
}

export const AI_MESSAGE_MAX = 600;

/** Limpia la salida del modelo: una sola pieza de texto breve, sin comillas envolventes. */
export function cleanAiText(text: string | null | undefined) {
  const value = (text ?? '').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (!value) return null;
  return value.length > AI_MESSAGE_MAX ? `${value.slice(0, AI_MESSAGE_MAX - 1).trimEnd()}…` : value;
}

// --- Medicion --------------------------------------------------------------------

export type EnrollmentStatRow = {
  status: string;
  exitReason: string | null;
  simulated: boolean;
  messagesSent: number;
  purchaseOrderId: string | null;
  nextRunAt: Date | null;
};
export type RunStatRow = { status: string; simulated: boolean };

export function summarizeFollowUps(enrollments: EnrollmentStatRow[], runs: RunStatRow[]) {
  const real = enrollments.filter((row) => !row.simulated);
  const by = (reason: string) => real.filter((row) => row.exitReason === reason).length;
  const realRuns = runs.filter((row) => !row.simulated);
  return {
    started: real.length,
    active: real.filter((row) => row.status === 'ACTIVE').length,
    scheduled: real.filter((row) => row.status === 'ACTIVE' && row.nextRunAt).length,
    completed: real.filter((row) => row.status === 'COMPLETED').length,
    canceled: real.filter((row) => row.status === 'CANCELED' || row.status === 'EXITED').length,
    replied: by(EXIT_REASON.REPLIED) + by(EXIT_REASON.OPTED_OUT),
    optedOut: by(EXIT_REASON.OPTED_OUT),
    human: by(EXIT_REASON.HUMAN),
    sent: realRuns.filter((row) => row.status === 'SENT').length,
    errors: realRuns.filter((row) => row.status === 'FAILED' || row.status === 'BLOCKED').length,
    /**
     * Compras demostrables: la compra detuvo una inscripcion real que ya habia
     * enviado al menos un mensaje. Una compra sin seguimiento previo no se le
     * atribuye a la estrategia.
     */
    purchases: real.filter((row) => row.purchaseOrderId && row.messagesSent > 0).length,
    simulatedStarted: enrollments.length - real.length,
    simulatedMessages: runs.filter((row) => row.simulated && row.status === 'SIMULATED').length,
  };
}
export type FollowUpStats = ReturnType<typeof summarizeFollowUps>;
