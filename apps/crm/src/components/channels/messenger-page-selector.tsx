'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type PendingPage = { id: string; name: string; connectedElsewhere: boolean };

/**
 * Pantalla "Selecciona la Página que quieres conectar" (spec Fase D1,
 * seccion 14) — se muestra despues del callback de Facebook Login cuando
 * quedaron Pages pendientes de elegir. Nunca elige la primera en silencio.
 */
export function MessengerPageSelector() {
  const router = useRouter();
  const [pages, setPages] = useState<PendingPage[] | null>(null);
  const [busy, setBusy] = useState<string | null>('load');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/integrations/messenger/pending-pages', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data: { pages: PendingPage[] }) => setPages(data.pages))
      .catch(() => setError('No se pudieron cargar las Páginas.'))
      .finally(() => setBusy(null));
  }, []);

  async function select(pageId: string) {
    setBusy(pageId);
    setError(null);
    try {
      const response = await fetch('/api/integrations/messenger/select-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) throw new Error(data.message ?? 'No se pudo conectar la Página.');
      router.push('/integraciones?messenger=conectado');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo conectar la Página.');
      setBusy(null);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Selecciona la Página que quieres conectar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {busy === 'load' && <p className="text-xs text-slate-500">Cargando Páginas…</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {pages?.length === 0 && <p className="text-xs text-slate-500">La selección expiró. Vuelve a conectar Messenger.</p>}
        {pages?.map((page) => (
          <div key={page.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{page.name}</p>
              <p className="text-xs text-slate-500">Page ID {page.id}{page.connectedElsewhere ? ' · ya conectada a otro workspace' : ''}</p>
            </div>
            <Button size="sm" disabled={busy !== null || page.connectedElsewhere} onClick={() => select(page.id)}>
              {busy === page.id ? 'Conectando…' : 'Conectar esta Página'}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
