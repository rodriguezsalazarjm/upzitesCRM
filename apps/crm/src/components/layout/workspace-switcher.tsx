'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { announceWorkspaceSwitch } from './workspace-sync';

export type SwitchableWorkspace = { id: string; name: string; role: string };

/**
 * Selector de negocio. El servidor valida la membership en cada cambio
 * (POST /api/workspaces/switch); esta lista es solo lo que se ofrece.
 */
export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: { id: string; name: string };
  workspaces: SwitchableWorkspace[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function choose(workspaceId: string) {
    if (workspaceId === current.id) {
      setOpen(false);
      return;
    }
    setPending(workspaceId);
    setError(null);
    const response = await fetch('/api/workspaces/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    });
    if (!response.ok) {
      setPending(null);
      setError('No se pudo cambiar de negocio.');
      return;
    }
    announceWorkspaceSwitch(workspaceId);
    window.location.assign('/dashboard');
  }

  return (
    <div ref={rootRef} className="relative px-3 pb-2">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Negocio actual: ${current.name}. Cambiar de negocio`}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-left text-sm font-semibold text-canvas outline-none hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-electric"
      >
        <span className="min-w-0 flex-1 truncate">{current.name}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-fog" aria-hidden />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Cambiar de negocio"
          className="absolute inset-x-3 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-paper p-1 text-carbon shadow-lg"
        >
          {workspaces.map((workspace) => {
            const selected = workspace.id === current.id;
            return (
              <li key={workspace.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={workspace.name}
                  disabled={pending !== null}
                  onClick={() => choose(workspace.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-canvas disabled:opacity-60',
                    selected && 'font-semibold',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  {pending === workspace.id ? (
                    <span className="text-[11px] text-fog">Cambiando…</span>
                  ) : selected ? (
                    <Check className="h-4 w-4 text-electric" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-1 text-[11px] text-canvas">
          {error}
        </p>
      )}
    </div>
  );
}
