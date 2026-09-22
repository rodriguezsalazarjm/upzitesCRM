'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Panel lateral controlado (mismo mecanismo que ya usa InboxShell para el
 * contexto del contacto en pantallas angostas: backdrop + aside deslizante +
 * foco al abrir/cerrar + Escape). Se extrae aquí porque el Flow Builder
 * necesita dos (paleta e inspector) en modo compact/tablet.
 */
export function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  id,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: 'left' | 'right';
  id: string;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && <div aria-hidden onClick={onClose} className="fixed inset-0 z-40 bg-carbon/40" />}
      <aside
        id={id}
        aria-label={title}
        // `inert` (no solo pointer-events-none) saca todo el contenido del tab
        // order mientras está fuera de pantalla — si no, el foco podía "viajar"
        // a controles invisibles.
        inert={!open}
        className={cn(
          'fixed inset-y-0 z-50 flex w-[min(360px,92vw)] flex-col overflow-y-auto overscroll-contain border-line bg-paper transition-transform duration-200 ease-out',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          open ? 'translate-x-0' : side === 'right' ? 'translate-x-full' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
          <p className="type-eyebrow text-ash">{title}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={`Cerrar ${title.toLowerCase()}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-graphite transition-colors hover:bg-ivory hover:text-carbon"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 p-4">{children}</div>
      </aside>
    </>
  );
}
