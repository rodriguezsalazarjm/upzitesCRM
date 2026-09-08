import { MessageStatus, MessageType } from '../../../generated/prisma/client';

/**
 * Normalizacion del payload de WhatsApp Cloud API.
 *
 * El formato de Meta es anidado y heterogeneo. Aqui se aplana a dos tipos de
 * evento que el resto del sistema entiende, sin que nada mas conozca la forma
 * del proveedor: cambiar de proveedor deberia tocar solo este archivo.
 */
export type NormalizedInboundMessage = {
  kind: 'message';
  phoneNumberId: string;
  displayPhoneNumber?: string;
  externalMessageId: string;
  from: string;
  profileName?: string;
  type: MessageType;
  text?: string;
  timestamp: Date;
  payload: Record<string, unknown>;
};

export type NormalizedStatusUpdate = {
  kind: 'status';
  phoneNumberId: string;
  externalMessageId: string;
  status: MessageStatus;
  timestamp: Date;
  errorCode?: string;
  errorMessage?: string;
};

export type NormalizedEvent = NormalizedInboundMessage | NormalizedStatusUpdate;

const MESSAGE_TYPE_MAP: Record<string, MessageType> = {
  text: MessageType.TEXT,
  image: MessageType.IMAGE,
  audio: MessageType.AUDIO,
  video: MessageType.VIDEO,
  document: MessageType.DOCUMENT,
  location: MessageType.LOCATION,
  contacts: MessageType.CONTACT,
  interactive: MessageType.INTERACTIVE,
  button: MessageType.INTERACTIVE,
  sticker: MessageType.IMAGE,
  system: MessageType.SYSTEM,
};

const STATUS_MAP: Record<string, MessageStatus> = {
  sent: MessageStatus.SENT,
  delivered: MessageStatus.DELIVERED,
  read: MessageStatus.READ,
  failed: MessageStatus.FAILED,
};

function toDate(timestamp: unknown) {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
}

type Json = Record<string, unknown>;

/** Lee una ruta anidada sin asumir la forma del payload. */
function at(source: unknown, ...path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Json)[key];
  }
  return current;
}

function str(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Extrae el texto legible de cualquier tipo de mensaje, para mostrarlo en la bandeja. */
function extractText(message: Json): string | undefined {
  const candidates = [
    at(message, 'text', 'body'),
    at(message, 'button', 'text'),
    at(message, 'interactive', 'button_reply', 'title'),
    at(message, 'interactive', 'list_reply', 'title'),
    at(message, 'image', 'caption'),
    at(message, 'video', 'caption'),
    at(message, 'document', 'caption'),
    at(message, 'document', 'filename'),
  ];

  for (const candidate of candidates) {
    const text = str(candidate);
    if (text) return text;
  }

  const location = at(message, 'location');
  if (location) {
    const name = str(at(location, 'name'));
    if (name) return name;
    return 'Ubicacion: ' + str(at(location, 'latitude')) + ', ' + str(at(location, 'longitude'));
  }

  return undefined;
}

/**
 * Convierte un payload de Meta en eventos normalizados.
 *
 * Tolerante por diseno: un payload con una forma inesperada devuelve una lista
 * vacia en vez de lanzar. El webhook debe responder 200 rapido, no romperse por
 * un tipo de evento que todavia no manejamos.
 */
export function normalizeWebhookPayload(body: unknown): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  const root = body as Json | null;

  if (!root || root.object !== 'whatsapp_business_account') return events;

  for (const entry of asArray(root.entry)) {
    for (const change of asArray(at(entry, 'changes'))) {
      const value = (at(change, 'value') ?? {}) as Json;
      const phoneNumberId = str(at(value, 'metadata', 'phone_number_id'));
      if (!phoneNumberId) continue;

      const displayPhoneNumber = str(at(value, 'metadata', 'display_phone_number'));
      const profileByWaId = new Map<string, string>();
      for (const contact of asArray(value.contacts)) {
        const waId = str(at(contact, 'wa_id'));
        const name = str(at(contact, 'profile', 'name'));
        if (waId && name) profileByWaId.set(waId, name);
      }

      for (const raw of asArray(value.messages)) {
        const message = raw as Json;
        const id = str(message.id);
        const from = str(message.from);
        if (!id || !from) continue;

        events.push({
          kind: 'message',
          phoneNumberId,
          displayPhoneNumber,
          externalMessageId: id,
          from,
          profileName: profileByWaId.get(from),
          type: MESSAGE_TYPE_MAP[String(message.type)] ?? MessageType.TEXT,
          text: extractText(message),
          timestamp: toDate(message.timestamp),
          payload: message,
        });
      }

      for (const raw of asArray(value.statuses)) {
        const status = raw as Json;
        const id = str(status.id);
        const mapped = STATUS_MAP[String(status.status)];
        if (!id || !mapped) continue;

        const error = asArray(status.errors)[0];
        events.push({
          kind: 'status',
          phoneNumberId,
          externalMessageId: id,
          status: mapped,
          timestamp: toDate(status.timestamp),
          errorCode: str(at(error, 'code')),
          errorMessage: str(at(error, 'title')) ?? str(at(error, 'message')),
        });
      }
    }
  }

  return events;
}

/**
 * Clave de deduplicacion del evento completo.
 *
 * Se usa el id externo cuando existe; si no, un hash del payload. Meta reintenta
 * las entregas, y sin esto una reentrega crearia mensajes duplicados.
 */
export function dedupeKeyFor(events: NormalizedEvent[], rawBody: string) {
  if (events.length > 0) {
    const parts = events.map((event) =>
      event.kind === 'message'
        ? `m:${event.externalMessageId}`
        : `s:${event.externalMessageId}:${event.status}`,
    );
    return parts.sort().join('|').slice(0, 500);
  }

  // Sin eventos reconocibles (por ejemplo, un cambio de calidad del numero):
  // se deduplica por el contenido crudo.
  return `raw:${hashString(rawBody)}`;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `${hash}:${value.length}`;
}

/** E.164 sin espacios ni signos, con `+` al inicio. Meta entrega el wa_id sin `+`. */
export function toE164(waId: string) {
  const digits = waId.replace(/\D/g, '');
  return digits ? `+${digits}` : waId;
}
