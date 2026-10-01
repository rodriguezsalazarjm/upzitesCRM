'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Archive, Copy, Eye, Loader2, MoreHorizontal, Pencil, RotateCcw, Rocket, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { StatusAction, StudioProductStatus } from '@/lib/commerce/product-studio/rules';

type Pending = StatusAction | 'duplicate' | null;
type Message = { kind: 'error' | 'success'; text: string } | null;

/**
 * Estado y llamadas de las acciones de publicacion. Lo comparten la barra del
 * editor y el menu de cada fila del listado.
 */
function useProductActions(productId: string) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [confirm, setConfirm] = useState<'unpublish' | 'archive' | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function run(action: StatusAction) {
    setPending(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; data?: { detachedFrom?: string[] } };
      if (!response.ok) {
        setMessage({ kind: 'error', text: body.message ?? 'No pudimos cambiar el estado.' });
        return;
      }
      const detached = body.data?.detachedFrom ?? [];
      setMessage({
        kind: 'success',
        text:
          action === 'publish'
            ? 'Producto publicado. Su enlace de compra ya está activo.'
            : action === 'unpublish'
              ? 'Producto despublicado: ya no acepta compras.'
              : action === 'archive'
                ? `Producto archivado.${detached.length ? ` Se quitó como adicional de: ${detached.join(', ')}.` : ''}`
                : 'Producto restaurado como borrador.',
      });
      setConfirm(null);
      router.refresh();
    } catch {
      setMessage({ kind: 'error', text: 'No pudimos conectar con el servidor.' });
    } finally {
      setPending(null);
    }
  }

  async function duplicate() {
    setPending('duplicate');
    setMessage(null);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/duplicate`, { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as { message?: string; data?: { id: string } };
      if (!response.ok || !body.data) {
        setMessage({ kind: 'error', text: body.message ?? 'No pudimos duplicar el producto.' });
        return;
      }
      router.push(`/productos/${encodeURIComponent(body.data.id)}?duplicado=1`);
    } catch {
      setMessage({ kind: 'error', text: 'No pudimos conectar con el servidor.' });
    } finally {
      setPending(null);
    }
  }

  return { pending, confirm, setConfirm, message, run, duplicate };
}

function Dialogs({ productName, usedAsBumpBy, actions }: { productName: string; usedAsBumpBy: string[]; actions: ReturnType<typeof useProductActions> }) {
  const { confirm, setConfirm, pending, run } = actions;
  return (
    <>
      <ConfirmDialog
        open={confirm === 'unpublish'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`¿Despublicar "${productName}"?`}
        description="Su enlace de compra deja de aceptar pedidos de inmediato y los checkouts sin pagar ya no podrán pagarse. Las ventas anteriores no cambian. Puedes volver a publicarlo cuando quieras."
        confirmLabel="Despublicar"
        busy={pending === 'unpublish'}
        onConfirm={() => run('unpublish')}
      />
      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`¿Archivar "${productName}"?`}
        description="Deja de venderse y sale del catálogo activo. No se borra: sus pedidos, pagos y métricas se conservan, y puedes restaurarlo como borrador."
        confirmLabel="Archivar"
        destructive
        busy={pending === 'archive'}
        onConfirm={() => run('archive')}
      >
        {usedAsBumpBy.length > 0 && (
          <p className="mt-3 rounded-lg bg-solar/25 px-3 py-2 text-sm text-warning-ink">
            Es el producto adicional de: {usedAsBumpBy.join(', ')}. Al archivarlo se quitará de esos checkouts.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

function Feedback({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${message.kind === 'error' ? 'bg-tomato/12 text-danger-ink' : 'bg-lime/25 text-success-ink'}`}>
      {message.text}
    </p>
  );
}

/** Barra de acciones del editor. Despublicar y archivar piden confirmacion. */
export function ProductActions({
  productId,
  productName,
  status,
  canEdit,
  publishBlockers,
  usedAsBumpBy,
}: {
  productId: string;
  productName: string;
  status: StudioProductStatus;
  canEdit: boolean;
  publishBlockers: string[];
  usedAsBumpBy: string[];
}) {
  const actions = useProductActions(productId);
  const { pending, run, duplicate, setConfirm, message } = actions;
  const busy = pending !== null;
  const spin = (action: Pending) => (pending === action ? <Loader2 className="animate-spin" aria-hidden /> : null);
  const blockersId = `publish-blockers-${productId}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/productos/${encodeURIComponent(productId)}/vista-previa`}>
            <Eye aria-hidden />
            Vista previa
          </Link>
        </Button>
        {canEdit && (
          <>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={duplicate}>
              {spin('duplicate') ?? <Copy aria-hidden />}
              Duplicar
            </Button>
            {status === 'DRAFT' && (
              <Button type="button" size="sm" disabled={busy || publishBlockers.length > 0} onClick={() => run('publish')} aria-describedby={publishBlockers.length ? blockersId : undefined}>
                {spin('publish') ?? <Rocket aria-hidden />}
                Publicar
              </Button>
            )}
            {status === 'ACTIVE' && (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setConfirm('unpublish')}>
                <Undo2 aria-hidden />
                Despublicar
              </Button>
            )}
            {status !== 'ARCHIVED' ? (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm('archive')}>
                <Archive aria-hidden />
                Archivar
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => run('restore')}>
                {spin('restore') ?? <RotateCcw aria-hidden />}
                Restaurar
              </Button>
            )}
          </>
        )}
      </div>
      {canEdit && status === 'DRAFT' && publishBlockers.length > 0 && (
        <div id={blockersId} className="text-xs leading-5 text-warning-ink">
          <p className="font-semibold">Para publicar falta:</p>
          <ul className="list-inside list-disc">
            {publishBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      )}
      <Feedback message={message} />
      <Dialogs productName={productName} usedAsBumpBy={usedAsBumpBy} actions={actions} />
    </div>
  );
}

const itemClass =
  'flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm text-carbon outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-ivory [&_svg]:size-4 [&_svg]:text-graphite';

/** Menu "Más acciones" de una fila del listado. */
export function ProductRowMenu({
  productId,
  productName,
  status,
  canPublish,
}: {
  productId: string;
  productName: string;
  status: StudioProductStatus;
  canPublish: boolean;
}) {
  const actions = useProductActions(productId);
  const { pending, run, duplicate, setConfirm, message } = actions;
  const busy = pending !== null;

  return (
    <div className="flex flex-col items-end gap-1">
      <Menu.Root>
        <Menu.Trigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={`Más acciones para ${productName}`} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
          </Button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="end" sideOffset={4} className="z-50 min-w-48 rounded-xl border border-line bg-paper p-1 shadow-[0_8px_24px_rgba(17,17,17,0.12)]">
            <Menu.Item asChild className={itemClass}>
              <Link href={`/productos/${encodeURIComponent(productId)}`}>
                <Pencil aria-hidden />
                Editar
              </Link>
            </Menu.Item>
            <Menu.Item asChild className={itemClass}>
              <Link href={`/productos/${encodeURIComponent(productId)}/vista-previa`}>
                <Eye aria-hidden />
                Vista previa
              </Link>
            </Menu.Item>
            <Menu.Item className={itemClass} onSelect={() => void duplicate()}>
              <Copy aria-hidden />
              Duplicar
            </Menu.Item>
            {status === 'DRAFT' && (
              <Menu.Item className={itemClass} disabled={!canPublish} onSelect={() => void run('publish')}>
                <Rocket aria-hidden />
                {canPublish ? 'Publicar' : 'Publicar (faltan datos)'}
              </Menu.Item>
            )}
            {status === 'ACTIVE' && (
              <Menu.Item className={itemClass} onSelect={() => setConfirm('unpublish')}>
                <Undo2 aria-hidden />
                Despublicar
              </Menu.Item>
            )}
            {status !== 'ARCHIVED' ? (
              <Menu.Item className={itemClass} onSelect={() => setConfirm('archive')}>
                <Archive aria-hidden />
                Archivar
              </Menu.Item>
            ) : (
              <Menu.Item className={itemClass} onSelect={() => void run('restore')}>
                <RotateCcw aria-hidden />
                Restaurar
              </Menu.Item>
            )}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <Feedback message={message} />
      <Dialogs productName={productName} usedAsBumpBy={[]} actions={actions} />
    </div>
  );
}
