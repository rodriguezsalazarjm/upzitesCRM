'use client';

import { useEffect, useState } from 'react';

/**
 * Consistencia multi-pestana (P0-FOUNDATION).
 *
 * La cookie de sesion es una sola por navegador: si en otra pestana se cambia
 * de negocio, esta pestana sigue mostrando el anterior. Para que un formulario
 * viejo no escriba en el workspace equivocado:
 *  - cada mutacion a /api lleva `x-upzites-workspace` con el workspace con el
 *    que se renderizo esta pagina; el proxy responde 409 si ya no coincide;
 *  - al cambiar de workspace se avisa por BroadcastChannel y las demas
 *    pestanas muestran el aviso sin esperar a una mutacion.
 * El header es solo una comprobacion: el servidor nunca lo usa para autorizar.
 */

const CHANNEL = 'upzites-workspace';
const HEADER = 'x-upzites-workspace';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

let renderedWorkspaceId: string | null = null;
let patched = false;
let onWorkspaceChanged: (() => void) | null = null;

function patchFetch() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.href);
    const isOwnApi = url.origin === window.location.origin && url.pathname.startsWith('/api/');
    if (!isOwnApi || SAFE_METHODS.has(method) || !renderedWorkspaceId) {
      return original(input, init);
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has(HEADER)) headers.set(HEADER, renderedWorkspaceId);
    const response = await original(input, { ...init, headers });
    if (response.status === 409) {
      const body = await response.clone().json().catch(() => null);
      if (body?.code === 'WORKSPACE_CHANGED') onWorkspaceChanged?.();
    }
    return response;
  };
}

/** Avisa a las demas pestanas que este navegador cambio de workspace. */
export function announceWorkspaceSwitch(workspaceId: string) {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: 'switched', workspaceId });
    channel.close();
  } catch {
    // Navegadores sin BroadcastChannel: queda la proteccion del 409.
  }
}

export function WorkspaceSync({ workspaceId }: { workspaceId: string }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    renderedWorkspaceId = workspaceId;
    onWorkspaceChanged = () => setStale(true);
    patchFetch();

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event: MessageEvent<{ type?: string; workspaceId?: string }>) => {
        if (event.data?.type === 'switched' && event.data.workspaceId !== workspaceId) setStale(true);
      };
    } catch {
      channel = null;
    }
    return () => {
      channel?.close();
      onWorkspaceChanged = null;
    };
  }, [workspaceId]);

  if (!stale) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[60] flex flex-wrap items-center justify-center gap-3 bg-carbon px-4 py-3 text-sm text-canvas"
    >
      <p>Cambiaste de negocio en otra pestaña. Recarga para seguir sin mezclar datos.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-lime px-3 py-1 text-xs font-bold text-carbon"
      >
        Recargar
      </button>
    </div>
  );
}
