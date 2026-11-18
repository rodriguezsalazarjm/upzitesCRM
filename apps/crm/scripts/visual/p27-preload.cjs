// P27: la misma guarda de preload.cjs (solo crm_pruebas, todo proveedor externo
// bloqueado) con UNA excepcion: api.mercadopago.com, para hablar con la cuenta
// de PRUEBA en p27-mp-prepare.ts / p27-mp-verify.ts. Nada mas sale a internet.
const net = require('node:net');
const tls = require('node:tls');
const { syncBuiltinESMExports } = require('node:module');

const ALLOWED = 'api.mercadopago.com';
const originalFetch = globalThis.fetch;
const originalConnect = net.Socket.prototype.connect;
const originalTls = tls.connect;

require('./preload.cjs');

const hostOf = (args) => {
  while (Array.isArray(args[0])) args = args[0];
  const first = args[0];
  return typeof first === 'object' && first !== null ? first.servername || first.host || first.hostname : typeof args[1] === 'string' ? args[1] : null;
};
const guardedFetch = globalThis.fetch;
const guardedConnect = net.Socket.prototype.connect;
const guardedTls = tls.connect;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  return url.protocol === 'https:' && url.hostname === ALLOWED ? originalFetch(input, init) : guardedFetch(input, init);
};
net.Socket.prototype.connect = function (...args) { return (hostOf(args) === ALLOWED ? originalConnect : guardedConnect).apply(this, args); };
tls.connect = function (...args) { return (hostOf(args) === ALLOWED ? originalTls : guardedTls).apply(this, args); };
syncBuiltinESMExports();
