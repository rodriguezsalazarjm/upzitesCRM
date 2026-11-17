'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { exponentOf, formatMinor } from '@/lib/commerce/money';
import { bpToPercent, fromMinor, percentToBp, toMinor } from '@/lib/quote-studio/calc';

type Item = { id: string; name: string; description: string; unit: string; unitPriceMinor: number; taxRateBp: number | null; category: string };
type Draft = { id: string | null; name: string; description: string; unit: string; price: string; tax: string; category: string };

export function CatalogClient({ items, currency, canManage }: { items: Item[]; currency: 'CLP' | 'USD'; canManage: boolean }) {
  const router = useRouter();
  const exp = exponentOf(currency);
  const empty: Draft = { id: null, name: '', description: '', unit: 'unidad', price: '', tax: '', category: '' };
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError('');
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    if (!response?.ok) { setError(json?.message ?? 'No se pudo guardar.'); return false; }
    router.refresh();
    return true;
  }

  async function save() {
    const unitPriceMinor = toMinor(draft.price, exp);
    const taxRateBp = draft.tax.trim() === '' ? null : percentToBp(draft.tax);
    if (!draft.name.trim()) return setError('Ponle un nombre.');
    if (unitPriceMinor === null) return setError('Precio inválido.');
    if (draft.tax.trim() !== '' && taxRateBp === null) return setError('Impuesto inválido (0 a 100).');
    const body = { name: draft.name, description: draft.description, unit: draft.unit || 'unidad', unitPriceMinor, taxRateBp, category: draft.category || null };
    if (await call(draft.id ? `/api/quote-studio/catalog/${draft.id}` : '/api/quote-studio/catalog', draft.id ? 'PATCH' : 'POST', body)) setDraft(empty);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/cotizaciones" className="text-sm font-semibold text-electric hover:underline">Volver a cotizaciones</Link>
      {canManage && (
        <Card className="space-y-2 p-4" data-catalog-form>
          <p className="text-sm font-semibold text-carbon">{draft.id ? 'Editar ítem' : 'Nuevo ítem'}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input aria-label="Nombre" placeholder="Nombre" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-field="name" />
            <Input aria-label="Categoría" placeholder="Categoría (opcional)" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            <Input aria-label="Descripción" placeholder="Descripción" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="sm:col-span-2" />
            <Input aria-label="Unidad" placeholder="Unidad (m², hora…)" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label={`Precio (${currency})`} placeholder={`Precio ${currency}`} inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} data-field="price" />
              <Input aria-label="Impuesto %" placeholder="Imp. % (defecto)" inputMode="decimal" value={draft.tax} onChange={(e) => setDraft({ ...draft, tax: e.target.value })} />
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void save()} data-catalog-save>{draft.id ? 'Guardar cambios' : 'Agregar al catálogo'}</Button>
            {draft.id && <Button type="button" variant="ghost" onClick={() => setDraft(empty)}>Cancelar</Button>}
          </div>
        </Card>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-soft">El catálogo está vacío. Lo que agregues aquí aparece en “Desde el catálogo” al cotizar.</p>
      ) : (
        <Card className="divide-y divide-line">
          {items.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm" data-catalog-item={i.name}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-carbon">{i.name}{i.category ? <span className="font-normal text-soft"> · {i.category}</span> : null}</p>
                {i.description && <p className="truncate text-xs text-soft">{i.description}</p>}
              </div>
              <span className="tabular">{formatMinor(i.unitPriceMinor, currency)} / {i.unit}</span>
              {canManage && <>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ id: i.id, name: i.name, description: i.description, unit: i.unit, price: fromMinor(i.unitPriceMinor, exp), tax: i.taxRateBp === null ? '' : bpToPercent(i.taxRateBp), category: i.category })}>Editar</Button>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm(`¿Quitar “${i.name}” del catálogo? Las cotizaciones que ya lo usan no cambian.`)) void call(`/api/quote-studio/catalog/${i.id}`, 'DELETE'); }}>Quitar</Button>
              </>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
