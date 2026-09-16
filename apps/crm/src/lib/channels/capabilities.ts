import type { Channel } from '../../../generated/prisma/client';

/**
 * Matriz de capacidades por canal.
 *
 * Basada en documentacion oficial vigente a esta fecha (Meta for Developers:
 * Instagram Messaging API / Messenger Platform / m.me links; TikTok for
 * Business: Business Messaging API). Los proveedores cambian sus políticas de
 * acceso con frecuencia: esta matriz debe revalidarse contra la documentación
 * oficial antes de anunciarle una capacidad nueva a un cliente real, no
 * asumirse vigente indefinidamente.
 *
 * Tres niveles, nunca dos, porque "la API existe" y "esta app la puede usar
 * hoy" son preguntas distintas:
 *
 *  - SUPPORTED: documentado, estable, y alcanzable con la revisión de app
 *    estándar (la misma que ya exige WhatsApp Business).
 *  - PREPARED_BUT_EXTERNAL_APPROVAL: la API lo ofrece, pero exige algo mas
 *    alla de la revision estandar — acceso beta, partner program, cuenta de
 *    negocio verificada, restriccion geografica. El motor y el proveedor fake
 *    lo soportan; la UI no lo ofrece como activo hasta que la conexion real lo
 *    confirme (ver `ChannelAccount.capabilities`).
 *  - NOT_SUPPORTED: el proveedor no tiene ese concepto. No se construye nada
 *    para esto salvo el tipo en el enum, para no fingir disponibilidad.
 */
export type CapabilityAvailability = 'SUPPORTED' | 'PREPARED_BUT_EXTERNAL_APPROVAL' | 'NOT_SUPPORTED';

export type Capability =
  | 'RECEIVE_DM'
  | 'SEND_DM'
  | 'KEYWORD_TRIGGER'
  | 'COMMENT_TRIGGER'
  | 'PRIVATE_REPLY_TO_COMMENT'
  | 'PUBLIC_COMMENT_REPLY'
  | 'STORY_REPLY_TRIGGER'
  | 'STORY_MENTION_TRIGGER'
  | 'LIVE_COMMENT_TRIGGER'
  | 'FOLLOW_TRIGGER'
  | 'SHARE_TRIGGER'
  | 'REF_URL_TRIGGER'
  | 'QR_TRIGGER'
  | 'AD_TRIGGER'
  | 'MEDIA_MESSAGES'
  | 'BUTTONS'
  | 'QUICK_REPLIES';

export const ALL_CAPABILITIES: Capability[] = [
  'RECEIVE_DM',
  'SEND_DM',
  'KEYWORD_TRIGGER',
  'COMMENT_TRIGGER',
  'PRIVATE_REPLY_TO_COMMENT',
  'PUBLIC_COMMENT_REPLY',
  'STORY_REPLY_TRIGGER',
  'STORY_MENTION_TRIGGER',
  'LIVE_COMMENT_TRIGGER',
  'FOLLOW_TRIGGER',
  'SHARE_TRIGGER',
  'REF_URL_TRIGGER',
  'QR_TRIGGER',
  'AD_TRIGGER',
  'MEDIA_MESSAGES',
  'BUTTONS',
  'QUICK_REPLIES',
];

const S: CapabilityAvailability = 'SUPPORTED';
const P: CapabilityAvailability = 'PREPARED_BUT_EXTERNAL_APPROVAL';
const N: CapabilityAvailability = 'NOT_SUPPORTED';

/** Lo que la API del canal ofrece EN GENERAL, sin importar la conexión concreta. */
export const CHANNEL_CAPABILITY_MATRIX: Record<Channel, Record<Capability, CapabilityAvailability>> = {
  WHATSAPP: {
    RECEIVE_DM: S,
    SEND_DM: S,
    KEYWORD_TRIGGER: S,
    COMMENT_TRIGGER: N,
    PRIVATE_REPLY_TO_COMMENT: N,
    PUBLIC_COMMENT_REPLY: N,
    STORY_REPLY_TRIGGER: N,
    STORY_MENTION_TRIGGER: N,
    LIVE_COMMENT_TRIGGER: N,
    FOLLOW_TRIGGER: N,
    SHARE_TRIGGER: N,
    REF_URL_TRIGGER: N,
    QR_TRIGGER: N,
    AD_TRIGGER: N,
    MEDIA_MESSAGES: S,
    BUTTONS: S,
    QUICK_REPLIES: S,
  },
  // Instagram Messaging API + comentarios: instagram_manage_messages /
  // instagram_manage_comments son revision estandar de Meta (como WhatsApp).
  // Follow-to-DM y Share-to-DM son mecanismos nuevos/beta segun Meta mismo
  // los describe — nunca se asumen disponibles sin que la conexion lo confirme.
  INSTAGRAM: {
    RECEIVE_DM: S,
    SEND_DM: S,
    KEYWORD_TRIGGER: S,
    COMMENT_TRIGGER: S,
    PRIVATE_REPLY_TO_COMMENT: S,
    PUBLIC_COMMENT_REPLY: S,
    STORY_REPLY_TRIGGER: S,
    STORY_MENTION_TRIGGER: S,
    LIVE_COMMENT_TRIGGER: P,
    FOLLOW_TRIGGER: P,
    SHARE_TRIGGER: P,
    REF_URL_TRIGGER: N,
    QR_TRIGGER: N,
    AD_TRIGGER: P,
    MEDIA_MESSAGES: S,
    BUTTONS: S,
    QUICK_REPLIES: S,
  },
  // Messenger Platform: m.me + `messaging_referrals` es un webhook estandar,
  // documentado desde hace años — no es beta, a diferencia del follow/share
  // de Instagram.
  MESSENGER: {
    RECEIVE_DM: S,
    SEND_DM: S,
    KEYWORD_TRIGGER: S,
    COMMENT_TRIGGER: S,
    PRIVATE_REPLY_TO_COMMENT: S,
    PUBLIC_COMMENT_REPLY: S,
    STORY_REPLY_TRIGGER: N,
    STORY_MENTION_TRIGGER: N,
    LIVE_COMMENT_TRIGGER: N,
    FOLLOW_TRIGGER: N,
    SHARE_TRIGGER: N,
    REF_URL_TRIGGER: S,
    QR_TRIGGER: P,
    AD_TRIGGER: S,
    MEDIA_MESSAGES: S,
    BUTTONS: S,
    QUICK_REPLIES: S,
  },
  // TikTok Business Messaging API completa exige Advanced Access o cuenta de
  // negocio verificada, tiene restriccion geografica (no UE/Reino Unido/
  // Suiza/India) y cola de moderacion — nada de esto es revision estandar.
  TIKTOK: {
    RECEIVE_DM: P,
    SEND_DM: P,
    KEYWORD_TRIGGER: P,
    COMMENT_TRIGGER: N,
    PRIVATE_REPLY_TO_COMMENT: N,
    PUBLIC_COMMENT_REPLY: N,
    STORY_REPLY_TRIGGER: N,
    STORY_MENTION_TRIGGER: N,
    LIVE_COMMENT_TRIGGER: N,
    FOLLOW_TRIGGER: N,
    SHARE_TRIGGER: N,
    REF_URL_TRIGGER: P,
    QR_TRIGGER: P,
    AD_TRIGGER: N,
    MEDIA_MESSAGES: N,
    BUTTONS: N,
    QUICK_REPLIES: N,
  },
};

/**
 * La capacidad EFECTIVA de una conexión concreta.
 *
 * SUPPORTED en la matriz general no basta por si solo para las capacidades
 * marcadas PREPARED_BUT_EXTERNAL_APPROVAL: esas solo se activan si la propia
 * conexión (`ChannelAccount.capabilities`) confirmó que Meta/TikTok se la
 * concedió a esa cuenta puntual. Las SUPPORTED por API general SI dependen
 * de que la conexión este realmente CONNECTED — una cuenta desconectada no
 * puede hacer nada, sin importar lo que la API permita en general.
 */
export function effectiveCapability(
  channel: Channel,
  connected: boolean,
  grantedCapabilities: string[],
  capability: Capability,
): CapabilityAvailability {
  const general = CHANNEL_CAPABILITY_MATRIX[channel][capability];
  if (general === 'NOT_SUPPORTED') return 'NOT_SUPPORTED';
  if (!connected) return general === 'SUPPORTED' ? 'PREPARED_BUT_EXTERNAL_APPROVAL' : general;
  if (general === 'PREPARED_BUT_EXTERNAL_APPROVAL') {
    return grantedCapabilities.includes(capability) ? 'SUPPORTED' : 'PREPARED_BUT_EXTERNAL_APPROVAL';
  }
  return 'SUPPORTED';
}

/** true solo cuando la capacidad esta realmente lista para usarse ahora. */
export function isCapabilityActive(
  channel: Channel,
  connected: boolean,
  grantedCapabilities: string[],
  capability: Capability,
): boolean {
  return effectiveCapability(channel, connected, grantedCapabilities, capability) === 'SUPPORTED';
}
