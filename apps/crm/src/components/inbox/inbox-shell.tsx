'use client';

import { useEffect, useRef, useState } from 'react';
import { PanelRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Estructura del detalle de Inbox. Solo layout y estado de presentación:
 *  - ≥1024px: lista | conversación
 *  - ≥1400px: lista | conversación | contexto (fijo)
 *  - <1400px: el contexto abre como panel lateral (sheet) desde la cabecera
 *  - <1024px: solo la conversación; la lista es la ruta /inbox (flecha atrás)
 * Las tres zonas llegan ya renderizadas desde el servidor.
 */
export function InboxShell({
  list,
  header,
  context,
  children,
}: {
  list: React.ReactNode;
  header: React.ReactNode;
  context: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
      wasOpen.current = true;
    } else if (wasOpen.current) {
      toggleRef.current?.focus();
      wasOpen.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="hidden w-[320px] shrink-0 border-r border-line lg:block xl:w-[340px]">{list}</div>

      <section aria-label="Conversación" className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-[68px] shrink-0 items-center gap-3 border-b border-line bg-paper py-2 pl-16 pr-3 sm:pr-5 md:pl-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">{header}</div>
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls="contact-context"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-mist bg-paper px-3 text-[13px] font-semibold text-carbon transition-colors hover:border-carbon min-[1400px]:hidden"
          >
            <PanelRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">Contacto</span>
            <span className="sr-only sm:hidden">Ver contacto</span>
          </button>
        </div>
        {children}
      </section>

      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-carbon/40 min-[1400px]:hidden"
        />
      )}
      <aside
        id="contact-context"
        aria-label="Contexto del contacto"
        className={cn(
          'flex-col overflow-y-auto overscroll-contain border-l border-line bg-paper',
          open
            ? 'fixed inset-y-0 right-0 z-50 flex w-[min(360px,92vw)] min-[1400px]:static min-[1400px]:z-auto min-[1400px]:w-[300px] min-[1400px]:shrink-0'
            : 'hidden min-[1400px]:flex min-[1400px]:w-[300px] min-[1400px]:shrink-0',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5 min-[1400px]:hidden">
          <p className="type-eyebrow text-ash">Contacto</p>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar contexto del contacto"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-graphite transition-colors hover:bg-ivory hover:text-carbon"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        {context}
      </aside>
    </div>
  );
}
