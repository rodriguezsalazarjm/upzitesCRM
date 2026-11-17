import { randomBytes } from 'node:crypto';
import type { OutgoingMail } from './types';

/**
 * P38: arma el mensaje RFC 5322 que se envía (Gmail lo recibe tal cual en
 * base64url; Microsoft en base64). Texto plano UTF-8 y adjuntos en base64.
 */
const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);
/** Encabezado con tildes: =?UTF-8?B?...?= (RFC 2047). Quita saltos de línea (inyección de encabezados). */
export function encodeHeader(value: string) {
  const clean = value.replace(/[\r\n]+/g, ' ').trim();
  return isAscii(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}
const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, '$&\r\n');
const addressList = (list: string[]) => list.map((a) => a.replace(/[\r\n<>,;"]/g, '')).join(', ');

export function buildMime(mail: OutgoingMail, now = new Date()) {
  const boundary = `upz_${randomBytes(12).toString('hex')}`;
  const headers = [
    `From: ${addressList([mail.from])}`,
    `To: ${addressList(mail.to)}`,
    ...(mail.cc.length ? [`Cc: ${addressList(mail.cc)}`] : []),
    `Subject: ${encodeHeader(mail.subject)}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    'MIME-Version: 1.0',
    ...(mail.inReplyTo ? [`In-Reply-To: ${mail.inReplyTo.replace(/[\r\n]/g, '')}`] : []),
    ...(mail.references || mail.inReplyTo ? [`References: ${`${mail.references ?? ''} ${mail.inReplyTo ?? ''}`.replace(/[\r\n]/g, ' ').trim()}`] : []),
  ];
  const textPart = ['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap76(Buffer.from(mail.text, 'utf8').toString('base64'))].join('\r\n');
  if (!mail.attachments.length) return [...headers, textPart].join('\r\n');
  const parts = mail.attachments.map((a) => {
    const name = a.filename.replace(/[\r\n"\\/]/g, '_');
    return [
      `--${boundary}`,
      `Content-Type: ${a.mimeType.replace(/[\r\n;]/g, '')}; name="${isAscii(name) ? name : encodeHeader(name)}"`,
      `Content-Disposition: attachment; filename="${isAscii(name) ? name : encodeHeader(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(Buffer.from(a.content).toString('base64')),
    ].join('\r\n');
  });
  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, textPart, ...parts, `--${boundary}--`, ''].join('\r\n');
}

/** HTML → texto legible (el cuerpo se muestra siempre como texto: nada de HTML ajeno en el CRM). */
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "Ana Pérez <ana@x.cl>" → { name, address } en minúsculas. */
export function parseAddress(raw: string) {
  const match = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const address = (match ? match[2] : raw).trim().toLowerCase();
  return { name: match ? match[1].trim() : '', address };
}
export const parseAddressList = (raw: string | undefined) => (raw ? raw.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((a) => parseAddress(a).address).filter((a) => a.includes('@')) : []);
