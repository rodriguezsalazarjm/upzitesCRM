import { buildMime, htmlToText } from './mime';
import { MailProviderError, type MailProviderClient, type MailTokens, type RemoteMessage } from './types';

/**
 * P38: Microsoft 365 / Outlook por OAuth (cuenta personal o de trabajo) + Graph.
 * Scopes mínimos: leer/marcar/mover correo y enviar. Sin probar contra Microsoft real.
 */
export const MICROSOFT_SCOPES = ['offline_access', 'User.Read', 'Mail.ReadWrite', 'Mail.Send'];
const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const API = 'https://graph.microsoft.com/v1.0/me';

type Config = { clientId: string; clientSecret: string };
type Recipient = { emailAddress?: { address?: string; name?: string } };
type GraphMessage = {
  id: string; conversationId: string; internetMessageId?: string; subject?: string; receivedDateTime: string; isRead?: boolean; parentFolderId?: string;
  from?: Recipient; toRecipients?: Recipient[]; ccRecipients?: Recipient[]; body?: { contentType?: string; content?: string }; hasAttachments?: boolean;
  internetMessageHeaders?: { name: string; value: string }[];
};

async function call<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const response = await fetch(url, { ...rest, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(rest.headers ?? {}) } });
  const text = await response.text();
  if (!response.ok) throw new MailProviderError(`Microsoft respondió ${response.status}.`, response.status, response.status === 401 || /invalid_grant/.test(text));
  return (text ? JSON.parse(text) : {}) as T;
}

const address = (r?: Recipient) => (r?.emailAddress?.address ?? '').toLowerCase();
function tokens(json: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }): MailTokens {
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? null, expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null, scopes: json.scope ?? MICROSOFT_SCOPES.join(' ') };
}

export function microsoftProvider(config: Config): MailProviderClient {
  const tokenRequest = (body: Record<string, string>) => call<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>(`${AUTH}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, scope: MICROSOFT_SCOPES.join(' '), ...body }),
  });
  return {
    authorizeUrl(state, redirectUri) {
      return `${AUTH}/authorize?${new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: 'code', response_mode: 'query', scope: MICROSOFT_SCOPES.join(' '), state, prompt: 'select_account' })}`;
    },
    async exchangeCode(code, redirectUri) {
      const json = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
      const me = await call<{ mail?: string; userPrincipalName?: string }>(API, { token: json.access_token });
      return { ...tokens(json), emailAddress: (me.mail ?? me.userPrincipalName ?? '').toLowerCase() };
    },
    async refresh(refreshToken) {
      const json = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
      return { ...tokens(json), refreshToken: json.refresh_token ?? refreshToken };
    },
    async listMessages(token, since, limit) {
      const [inbox, sent] = await Promise.all([call<{ id: string }>(`${API}/mailFolders/inbox`, { token }), call<{ id: string }>(`${API}/mailFolders/sentitems`, { token })]);
      const params = new URLSearchParams({
        $filter: `receivedDateTime ge ${since.toISOString()}`, $orderby: 'receivedDateTime desc', $top: String(limit),
        $select: 'id,conversationId,internetMessageId,subject,receivedDateTime,isRead,parentFolderId,from,toRecipients,ccRecipients,body,hasAttachments,internetMessageHeaders',
      });
      const list = await call<{ value: GraphMessage[] }>(`${API}/messages?${params}`, { token, headers: { Prefer: 'outlook.body-content-type="text"' } });
      const out: RemoteMessage[] = [];
      for (const m of list.value.filter((x) => x.parentFolderId === inbox.id || x.parentFolderId === sent.id)) {
        const attachments = m.hasAttachments
          ? (await call<{ value: { id: string; name: string; contentType: string; size: number }[] }>(`${API}/messages/${m.id}/attachments?$select=id,name,contentType,size`, { token })).value
            .map((a) => ({ id: a.id, filename: a.name, mimeType: a.contentType, size: a.size }))
          : [];
        out.push({
          id: m.id, threadId: m.conversationId, internetMessageId: m.internetMessageId ?? null,
          references: m.internetMessageHeaders?.find((h) => h.name.toLowerCase() === 'references')?.value ?? null,
          from: { address: address(m.from), name: m.from?.emailAddress?.name ?? '' },
          to: (m.toRecipients ?? []).map(address).filter(Boolean), cc: (m.ccRecipients ?? []).map(address).filter(Boolean),
          subject: m.subject ?? '', bodyText: (m.body?.contentType === 'html' ? htmlToText(m.body.content ?? '') : m.body?.content ?? '').slice(0, 100_000),
          sentAt: new Date(m.receivedDateTime), unread: m.isRead === false, inInbox: m.parentFolderId === inbox.id, outbound: m.parentFolderId === sent.id, attachments,
        });
      }
      return out;
    },
    async getAttachment(token, messageId, attachmentId) {
      const json = await call<{ contentBytes?: string }>(`${API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, { token });
      return new Uint8Array(Buffer.from(json.contentBytes ?? '', 'base64'));
    },
    async send(token, mail) {
      // Graph acepta el MIME en base64; hila la respuesta por In-Reply-To/References. No devuelve id.
      await call(`${API}/sendMail`, { token, method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: Buffer.from(buildMime(mail), 'utf8').toString('base64') });
      return null;
    },
    async modify(token, ids, change) {
      for (const id of ids) {
        if (change.read !== undefined) await call(`${API}/messages/${encodeURIComponent(id)}`, { token, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isRead: change.read }) });
        if (change.archive !== undefined) await call(`${API}/messages/${encodeURIComponent(id)}/move`, { token, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinationId: change.archive ? 'archive' : 'inbox' }) });
      }
    },
    async revoke() {
      // shortcut: Microsoft no ofrece revocar un token suelto; se borra aquí y el usuario puede quitar la app en su cuenta.
    },
  };
}
