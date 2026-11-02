import { isIP, type LookupFunction } from 'node:net';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';

type Lookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

export const SNAPSHOT_LIMITS = { bytes: 1_000_000, timeoutMs: 8_000, redirects: 3 } as const;

function blockedIpv4(address: string) {
  const p = address.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19));
}

export function isBlockedAddress(address: string) {
  const value = address.toLowerCase().split('%')[0];
  const family = isIP(value);
  // Fail-closed: lo que no es una IP válida no se considera seguro.
  if (family === 0) return true;
  if (family === 4) return blockedIpv4(value);
  if (value.startsWith('::ffff:')) return blockedIpv4(value.slice(7));
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value);
}

const systemLookup: Lookup = async (hostname) => lookup(hostname, { all: true, verbatim: true });

/** Validación previa (forma de la URL + destino). La conexión vuelve a validar. */
export async function assertSafeKnowledgeUrl(raw: string, resolver: Lookup = systemLookup) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('URL inválida.'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Solo se admiten URLs HTTP o HTTPS.');
  if (url.username || url.password) throw new Error('La URL no puede incluir credenciales.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || ['localhost', 'localhost.localdomain'].includes(host.toLowerCase()) || host.toLowerCase().endsWith('.localhost')) {
    throw new Error('El destino de la URL no está permitido.');
  }
  const direct = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolver(host);
  if (!direct.length || direct.some((item) => isBlockedAddress(item.address))) throw new Error('El destino de la URL no está permitido.');
  return url;
}

/**
 * `lookup` del socket: la IP que se valida es la misma a la que se conecta, así
 * un DNS que cambia entre la validación y la conexión (rebinding) no pasa.
 */
export function pinnedLookup(resolver: Lookup = systemLookup): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname).then((addresses) => {
      if (!addresses.length || addresses.some((item) => isBlockedAddress(item.address))) {
        callback(Object.assign(new Error('El destino de la URL no está permitido.'), { code: 'EBLOCKED' }), '', 0);
        return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    }, (error: NodeJS.ErrnoException) => callback(error, '', 0));
  };
}

export type SnapshotResponse = {
  status: number;
  header: (name: string) => string | null;
  body: AsyncIterable<Uint8Array>;
  cancel: () => void;
};
export type SnapshotRequester = (url: URL, timeoutMs: number) => Promise<SnapshotResponse>;

const nodeRequester: SnapshotRequester = (url, timeoutMs) => new Promise((resolve, reject) => {
  const client = url.protocol === 'https:' ? https : http;
  const request = client.request(url, {
    method: 'GET',
    lookup: pinnedLookup(),
    timeout: timeoutMs,
    headers: { 'User-Agent': 'UPZITES-Knowledge-Snapshot/1.0', Accept: 'text/html,text/plain,text/markdown' },
  }, (response) => {
    resolve({
      status: response.statusCode ?? 0,
      header: (name) => {
        const value = response.headers[name.toLowerCase()];
        return Array.isArray(value) ? value[0] ?? null : value ?? null;
      },
      body: response,
      cancel: () => response.destroy(),
    });
  });
  request.on('timeout', () => request.destroy(new Error('La URL tardó demasiado en responder.')));
  request.on('error', (error) => reject((error as NodeJS.ErrnoException).code === 'EBLOCKED' ? error : new Error('No se pudo descargar la URL.')));
  request.end();
});

export async function fetchKnowledgeSnapshot(raw: string, requester: SnapshotRequester = nodeRequester, resolver: Lookup = systemLookup) {
  let current = raw;
  for (let redirect = 0; redirect <= SNAPSHOT_LIMITS.redirects; redirect += 1) {
    const safe = await assertSafeKnowledgeUrl(current, resolver);
    const response = await requester(safe, SNAPSHOT_LIMITS.timeoutMs);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      response.cancel();
      const location = response.header('location');
      if (!location) throw new Error('La redirección no incluye destino.');
      current = new URL(location, safe).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) { response.cancel(); throw new Error(`La URL respondió HTTP ${response.status}.`); }
    const type = (response.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!['text/html', 'text/plain', 'text/markdown'].includes(type)) { response.cancel(); throw new Error('La URL no entrega HTML o texto compatible.'); }
    const declared = Number(response.header('content-length') ?? 0);
    if (declared > SNAPSHOT_LIMITS.bytes) { response.cancel(); throw new Error('La respuesta supera el límite de 1 MB.'); }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const value of response.body) {
      size += value.byteLength;
      if (size > SNAPSHOT_LIMITS.bytes) { response.cancel(); throw new Error('La respuesta supera el límite de 1 MB.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let decoded: string;
    try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('La página no está codificada en UTF-8.'); }
    return { finalUrl: safe.toString(), contentType: type, text: type === 'text/html' ? htmlToText(decoded) : decoded };
  }
  throw new Error('La URL excede el máximo de 3 redirecciones.');
}

export function htmlToText(html: string) {
  const withoutActive = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|template|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  return withoutActive.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;/g, "'").replace(/&quot;/gi, '"').replace(/&amp;/gi, '&');
}
