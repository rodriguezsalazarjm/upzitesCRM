import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado de secretos de integracion (tokens de WhatsApp, Shopify, email).
 *
 * AES-256-GCM con clave fuera de la base de datos: quien lea la base sin tener
 * INTEGRATION_ENCRYPTION_KEY no obtiene los tokens. El formato lleva version
 * para poder rotar el algoritmo o la clave mas adelante sin romper lo guardado.
 *
 * Formato: v1:<iv base64url>:<authTag base64url>:<ciphertext base64url>
 */
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class EncryptionKeyMissingError extends Error {
  constructor() {
    super(
      'INTEGRATION_ENCRYPTION_KEY no esta configurada. Es obligatoria para guardar tokens de integracion. ' +
        `Genera una con: node -e "console.log(require(\'crypto\').randomBytes(${KEY_BYTES}).toString(\'base64\'))"`,
    );
    this.name = 'EncryptionKeyMissingError';
  }
}

function getKey() {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!raw) throw new EncryptionKeyMissingError();

  // Se acepta base64 o hex; lo que importa es que sean 32 bytes.
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `INTEGRATION_ENCRYPTION_KEY debe decodificar a ${KEY_BYTES} bytes (recibidos ${key.length}).`,
    );
  }

  return key;
}

/** True si el CRM puede cifrar secretos. Sirve para mostrar una integracion como inactiva. */
export function isEncryptionConfigured() {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSecret(payload: string) {
  const [version, ivPart, tagPart, dataPart] = payload.split(':');

  if (version !== VERSION || !ivPart || !tagPart || !dataPart) {
    throw new Error('Secreto cifrado con un formato desconocido.');
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Ultimos 4 caracteres, para mostrar en la UI sin exponer el token. */
export function maskSecret(plaintext: string) {
  if (plaintext.length <= 4) return '••••';
  return `••••${plaintext.slice(-4)}`;
}
