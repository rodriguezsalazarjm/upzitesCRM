import { buildMime, htmlToText, parseAddress, parseAddressList } from './mime';
import { MailProviderError, type MailProviderClient, type MailTokens, type RemoteMessage } from './types';

/**
 * P38: Gmail por OAuth + Gmail API (REST). Scopes mínimos para leer, marcar
 * leído/archivar (modify) y enviar. No se pide acceso a contactos ni calendario.
 * Sin probar contra Google real: requiere app OAuth verificada (gmail.modify es restringido).
 */
export const GMAIL_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send'];
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

type Config = { clientId: string; clientSecret: string };
type Part = { mimeType?: string; filename?: string; headers?: { name: string; value: string }[]; body?: { data?: string; size?: number; attachmentId?: string }; parts?: Part[] };
type GmailMessage = { id: string; threadId: string; labelIds?: string[]; internalDate?: string; snippet?: string; payload?: Part };

async function call<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const response = await fetch(url, { ...rest, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(rest.headers ?? {}) } });
  const text = await response.text();
  if (!response.ok) {
    // Nunca se registra el cuerpo completo: puede traer datos del correo.
    throw new MailProviderError(`Gmail respondió ${response.status}.`, response.status, response.status === 401 || response.status === 403 || /invalid_grant/.test(text));
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const decode = (data?: string) => (data ? Buffer.from(data, 'base64url') : Buffer.alloc(0));

function tokens(json: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }): MailTokens {
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? null, expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null, scopes: json.scope ?? GMAIL_SCOPES.join(' ') };
}

export function parseGmailMessage(message: GmailMessage, ownAddress: string): RemoteMessage {
  const headers = new Map((message.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  let plain = '';
  let html = '';
  const attachments: RemoteMessage['attachments'] = [];
  const walk = (part: Part) => {
    if (part.filename && part.body?.attachmentId) attachments.push({ id: part.body.attachmentId, filename: part.filename, mimeType: part.mimeType ?? 'application/octet-stream', size: part.body.size ?? 0 });
    else if (part.mimeType === 'text/plain' && !plain) plain = decode(part.body?.data).toString('utf8');
    else if (part.mimeType === 'text/html' && !html) html = decode(part.body?.data).toString('utf8');
    part.parts?.forEach(walk);
  };
  if (message.payload) walk(message.payload);
  const labels = message.labelIds ?? [];
  const from = parseAddress(headers.get('from') ?? '');
  return {
    id: message.id,
    threadId: message.threadId,
    internetMessageId: headers.get('message-id') ?? null,
    references: headers.get('references') ?? null,
    from,
    to: parseAddressList(headers.get('to')),
    cc: parseAddressList(headers.get('cc')),
    subject: headers.get('subject') ?? '',
    bodyText: (plain || htmlToText(html) || message.snippet || '').slice(0, 100_000),
    sentAt: new Date(Number(message.internalDate ?? Date.now())),
    unread: labels.includes('UNREAD'),
    inInbox: labels.includes('INBOX'),
    outbound: labels.includes('SENT') || from.address === ownAddress.toLowerCase(),
    attachments,
  };
}

export function gmailProvider(config: Config): MailProviderClient {
  return {
    authorizeUrl(state, redirectUri) {
      const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: 'code', scope: GMAIL_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    },
    async exchangeCode(code, redirectUri) {
      const json = await call<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      });
      const profile = await call<{ emailAddress: string }>(`${API}/profile`, { token: json.access_token });
      return { ...tokens(json), emailAddress: profile.emailAddress.toLowerCase() };
    },
    async refresh(refreshToken) {
      const json = await call<{ access_token: string; expires_in?: number; scope?: string }>('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'refresh_token' }),
      });
      return { ...tokens(json), refreshToken };
    },
    async listMessages(token, since, limit) {
      const q = `{in:inbox in:sent} after:${Math.floor(since.getTime() / 1000)}`;
      const list = await call<{ messages?: { id: string }[] }>(`${API}/messages?${new URLSearchParams({ q, maxResults: String(limit) })}`, { token });
      const profile = await call<{ emailAddress: string }>(`${API}/profile`, { token });
      const out: RemoteMessage[] = [];
      for (const { id } of list.messages ?? []) out.push(parseGmailMessage(await call<GmailMessage>(`${API}/messages/${id}?format=full`, { token }), profile.emailAddress));
      return out;
    },
    async getAttachment(token, messageId, attachmentId) {
      const json = await call<{ data?: string }>(`${API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, { token });
      return new Uint8Array(decode(json.data));
    },
    async send(token, mail) {
      const raw = Buffer.from(buildMime(mail), 'utf8').toString('base64url');
      const json = await call<{ id: string; threadId: string }>(`${API}/messages/send`, {
        token, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw, ...(mail.threadId ? { threadId: mail.threadId } : {}) }),
      });
      return { id: json.id, threadId: json.threadId };
    },
    async modify(token, ids, change) {
      if (!ids.length) return;
      const add: string[] = [];
      const remove: string[] = [];
      if (change.read === true) remove.push('UNREAD');
      if (change.read === false) add.push('UNREAD');
      if (change.archive === true) remove.push('INBOX');
      if (change.archive === false) add.push('INBOX');
      await call(`${API}/messages/batchModify`, { token, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, addLabelIds: add, removeLabelIds: remove }) });
    },
    async revoke(token) {
      await call(`https://oauth2.googleapis.com/revoke?${new URLSearchParams({ token })}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    },
  };
}
