'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Confirmacion de una accion con impacto (despublicar, archivar). Radix Dialog
 * aporta el manejo de foco: lo atrapa dentro, cierra con Escape y lo devuelve
 * al boton que abrio el dialogo.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  busy,
  destructive,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  // Dialogo controlado (sin Dialog.Trigger): se recuerda quien tenia el foco al
  // abrir para devolverselo al cerrar, si sigue en la pagina.
  const returnTo = React.useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-carbon/40" />
        <Dialog.Content
          onOpenAutoFocus={() => {
            returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            if (returnTo.current?.isConnected) {
              event.preventDefault();
              returnTo.current.focus();
            }
          }}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-paper p-6 text-carbon focus:outline-none">
          <Dialog.Title className="text-base font-bold">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-soft">{description}</Dialog.Description>
          {children}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" disabled={busy}>
                Cancelar
              </Button>
            </Dialog.Close>
            <Button type="button" variant={destructive ? 'destructive' : 'default'} disabled={busy} onClick={onConfirm}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
