import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { MailProviderClient, RemoteMessage } from './types';

/**
 * P38: buzón falso para pruebas y QA local (nunca en producción: solo se usa en
 * modo local de pruebas o desde los tests). Guarda los correos en un JSON para
 * que el servidor visual y los scripts vean el mismo buzón.
 */
type Stored = Omit<RemoteMessage, 'sentAt' | 'attachments'> & { sentAt: string; owner: string; attachments: { id: string; filename: string; mimeType: string; size: number; base64: string }[] };
type Store = { messages: Stored[] };

let storePath = process.env.MAIL_FAKE_STORE ?? join(process.cwd(), '.local-visual', 'fake-mailbox.json');
export const setFakeMailStore = (path: string) => { storePath = path; };
const read = (): Store => (existsSync(storePath) ? (JSON.parse(readFileSync(storePath, 'utf8')) as Store) : { messages: [] });
const write = (store: Store) => { mkdirSync(dirname(storePath), { recursive: true }); writeFileSync(storePath, JSON.stringify(store)); };
const ownerOf = (token: string) => token.replace(/^fake:/, '');

/** Simula que alguien le escribe al buzón `to` (lo usan los scripts de QA). */
export function injectFakeMail(to: string, mail: { from: string; fromName?: string; subject: string; text: string; threadId?: string; internetMessageId?: string; references?: string | null; attachments?: { filename: string; mimeType: string; content: Uint8Array }[]; sentAt?: Date }) {
  const store = read();
  const id = `fake-${randomUUID()}`;
  store.messages.push({
    id, owner: to.toLowerCase(), threadId: mail.threadId ?? `thread-${id}`, internetMessageId: mail.internetMessageId ?? `<${id}@fake.test>`, references: mail.references ?? null,
    from: { address: mail.from.toLowerCase(), name: mail.fromName ?? '' }, to: [to.toLowerCase()], cc: [], subject: mail.subject, bodyText: mail.text,
    sentAt: (mail.sentAt ?? new Date()).toISOString(), unread: true, inInbox: true, outbound: false,
    attachments: (mail.attachments ?? []).map((a, i) => ({ id: `att-${i}`, filename: a.filename, mimeType: a.mimeType, size: a.content.byteLength, base64: Buffer.from(a.content).toString('base64') })),
  });
  write(store);
  return id;
}
export const fakeSentMail = (owner: string) => read().messages.filter((m) => m.owner === owner.toLowerCase() && m.outbound);
export const fakeMessage = (id: string) => read().messages.find((m) => m.id === id);

export const fakeMailProvider: MailProviderClient = {
  authorizeUrl(state, redirectUri) {
    // Consentimiento simulado: vuelve directo al callback con un code de prueba.
    return `${redirectUri}?${new URLSearchParams({ code: 'fake-consent', state })}`;
  },
  async exchangeCode() {
    return { accessToken: 'fake:buzon@correo-prueba.test', refreshToken: 'fake-refresh', expiresAt: new Date(Date.now() + 3600_000), scopes: 'fake', emailAddress: 'buzon@correo-prueba.test' };
  },
  async refresh(refreshToken) {
    return { accessToken: 'fake:buzon@correo-prueba.test', refreshToken, expiresAt: new Date(Date.now() + 3600_000), scopes: 'fake' };
  },
  async listMessages(token, since, limit) {
    return read().messages
      .filter((m) => m.owner === ownerOf(token) && new Date(m.sentAt) >= since)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
      .slice(0, limit)
      .map((m) => ({ ...m, sentAt: new Date(m.sentAt), attachments: m.attachments.map(({ base64: _b, ...meta }) => meta) }));
  },
  async getAttachment(token, messageId, attachmentId) {
    const found = read().messages.find((m) => m.id === messageId && m.owner === ownerOf(token))?.attachments.find((a) => a.id === attachmentId);
    if (!found) throw new Error('Adjunto no encontrado.');
    return new Uint8Array(Buffer.from(found.base64, 'base64'));
  },
  async send(token, mail) {
    const store = read();
    const id = `fake-${randomUUID()}`;
    const threadId = mail.threadId ?? `thread-${id}`;
    store.messages.push({
      id, owner: ownerOf(token), threadId, internetMessageId: `<${id}@fake.test>`, references: mail.references ?? mail.inReplyTo,
      from: { address: mail.from, name: '' }, to: mail.to, cc: mail.cc, subject: mail.subject, bodyText: mail.text, sentAt: new Date().toISOString(),
      unread: false, inInbox: false, outbound: true,
      attachments: mail.attachments.map((a, i) => ({ id: `att-${i}`, filename: a.filename, mimeType: a.mimeType, size: a.content.byteLength, base64: Buffer.from(a.content).toString('base64') })),
    });
    write(store);
    return { id, threadId };
  },
  async modify(token, ids, change) {
    const store = read();
    for (const m of store.messages) {
      if (m.owner !== ownerOf(token) || !ids.includes(m.id)) continue;
      if (change.read !== undefined) m.unread = !change.read;
      if (change.archive !== undefined) m.inInbox = !change.archive;
    }
    write(store);
  },
  async revoke() {},
};
