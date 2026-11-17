/**
 * P38: contrato común de los buzones (Gmail, Microsoft 365 y el falso local).
 * Cada proveedor traduce su API a esto; el resto del CRM no sabe de cuál viene.
 */
export type MailAttachmentMeta = { id: string; filename: string; mimeType: string; size: number };

export type RemoteMessage = {
  id: string;
  threadId: string;
  internetMessageId: string | null;
  references: string | null;
  from: { address: string; name: string };
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  sentAt: Date;
  unread: boolean;
  inInbox: boolean;
  /** Está en Enviados (lo mandó el dueño del buzón). */
  outbound: boolean;
  attachments: MailAttachmentMeta[];
};

export type OutgoingAttachment = { filename: string; mimeType: string; content: Uint8Array };
export type OutgoingMail = {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  attachments: OutgoingAttachment[];
  inReplyTo: string | null;
  references: string | null;
  /** Hilo del proveedor al responder (Gmail lo usa; Microsoft hila por encabezados). */
  threadId: string | null;
};

export type MailTokens = { accessToken: string; refreshToken: string | null; expiresAt: Date | null; scopes: string };

export interface MailProviderClient {
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<MailTokens & { emailAddress: string }>;
  refresh(refreshToken: string): Promise<MailTokens>;
  /** Lo reciente de Recibidos y Enviados desde `since`, del más nuevo al más viejo. */
  listMessages(accessToken: string, since: Date, limit: number): Promise<RemoteMessage[]>;
  getAttachment(accessToken: string, messageId: string, attachmentId: string): Promise<Uint8Array>;
  /** id null: el proveedor no lo devuelve (Microsoft); aparece en la próxima sincronización. */
  send(accessToken: string, mail: OutgoingMail): Promise<{ id: string; threadId: string } | null>;
  modify(accessToken: string, messageIds: string[], change: { read?: boolean; archive?: boolean }): Promise<void>;
  revoke(accessToken: string): Promise<void>;
}

export class MailProviderError extends Error {
  constructor(message: string, readonly status = 0, readonly authProblem = false) {
    super(message);
  }
}
