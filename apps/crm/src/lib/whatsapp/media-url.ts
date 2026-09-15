/**
 * Que direcciones puede pedir el descargador de medios.
 *
 * La URL de descarga no la elegimos: viene dentro de la respuesta de Meta, o
 * sea de fuera del sistema. Y la peticion lleva el token de WhatsApp en la
 * cabecera. Sin esta lista, quien lograra influir en esa respuesta podria
 * dirigir una peticion autenticada a donde quisiera, incluida la red interna
 * del proveedor de hosting, que es la forma clasica de un SSRF.
 *
 * Vive aparte del descargador para poder probarse sin base de datos.
 */

const ALLOWED_HOSTS = ['lookaside.fbsbx.com', 'graph.facebook.com'];
const ALLOWED_HOST_SUFFIXES = ['.fbcdn.net', '.facebook.com', '.fbsbx.com'];

export function isAllowedMediaHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (ALLOWED_HOSTS.includes(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Valida una direccion de descarga. Devuelve la URL o lanza: no existe un
 * tercer camino en el que se intente igual "por si acaso".
 */
export function assertMetaMediaUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('El proveedor devolvio una direccion de descarga invalida.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('La descarga de medios solo se hace por HTTPS.');
  }
  // Un usuario embebido en la URL puede usarse para confundir a un lector
  // humano sobre cual es el host real.
  if (url.username || url.password) {
    throw new Error('La direccion de descarga no puede llevar credenciales.');
  }
  if (!isAllowedMediaHost(url.hostname)) {
    throw new Error('La direccion de descarga no pertenece a WhatsApp.');
  }

  return url;
}
