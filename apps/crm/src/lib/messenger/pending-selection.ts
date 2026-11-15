import { decryptSecret, encryptSecret } from '../crypto';
import type { ManagedPage } from './oauth';

export const MESSENGER_PENDING_COOKIE = 'upzites_messenger_pending';
const PENDING_TTL_MS = 10 * 60_000;

export type MessengerPendingSelection = {
  workspaceId: string;
  userId: string;
  exp: number;
  pages: ManagedPage[];
};

/**
 * Las Pages elegibles (con su Page Access Token, un secreto) viajan cifradas
 * dentro de una cookie httpOnly de corta duracion entre el callback de OAuth
 * y la pantalla "Selecciona la Pagina" — nunca llegan al cliente en claro, y
 * nunca se persisten hasta que el usuario elige (spec Fase D1, seccion 14:
 * "no elegir silenciosamente la primera").
 */
export function encodeMessengerPendingSelection(input: { workspaceId: string; userId: string; pages: ManagedPage[] }): string {
  const payload: MessengerPendingSelection = { ...input, exp: Date.now() + PENDING_TTL_MS };
  return encryptSecret(JSON.stringify(payload));
}

export function decodeMessengerPendingSelection(cookieValue: string): MessengerPendingSelection | null {
  try {
    const payload = JSON.parse(decryptSecret(cookieValue)) as MessengerPendingSelection;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
