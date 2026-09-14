'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function NewProductForm({
  preferredType,
  canEdit,
  initiallyOpen = false,
}: {
  preferredType: 'PHYSICAL' | 'DIGITAL';
  canEdit: boolean;
  initiallyOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [type, setType] = useState(preferredType);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [sku, setSku] = useState('');
  const [inventory, setInventory] = useState('1');
  const [deliveryUrl, setDeliveryUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!name.trim()) return setNotice({ kind: 'error', text: 'Escribe el nombre del producto.' });
    if (!Number.isInteger(Number(price)) || Number(price) < 0)
      return setNotice({ kind: 'error', text: 'Ingresa un precio válido.' });
    if (type === 'PHYSICAL' && (!Number.isInteger(Number(inventory)) || Number(inventory) < 1))
      return setNotice({ kind: 'error', text: 'Ingresa el stock disponible.' });
    if (type === 'DIGITAL') {
      try {
        new URL(deliveryUrl);
      } catch {
        return setNotice({ kind: 'error', text: 'Ingresa un enlace de entrega válido.' });
      }
    }
    setBusy(true);
    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          priceClp: Number(price),
          sku: sku.trim() || undefined,
          status: 'ACTIVE',
          ...(type === 'PHYSICAL'
            ? { inventory: Number(inventory) }
            : { asset: { kind: 'LINK', name: `Entrega de ${name.trim()}`, target: deliveryUrl } }),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'No pudimos guardar el producto.');
      setName('');
      setDescription('');
      setPrice('');
      setSku('');
      setInventory('1');
      setDeliveryUrl('');
      setOpen(false);
      setNotice({
        kind: 'success',
        text: 'El producto quedó guardado y disponible en el catálogo.',
      });
      router.refresh();
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No pudimos guardar el producto.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit)
    return (
      <p className="text-sm text-slate-500">
        Puedes revisar el catálogo. Una persona administradora puede agregar productos.
      </p>
    );
  return (
    <div className="space-y-3">
      {!open && (
        <Button
          type="button"
          onClick={() => {
            setOpen(true);
            setNotice(null);
          }}
        >
          <Plus />
          Agregar mi primer producto
        </Button>
      )}
      {open && (
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4 sm:p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-800">
              Tipo de producto
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="mt-1 flex h-10 w-full rounded-md border border-slate-200 bg-white px-3"
              >
                <option value="PHYSICAL">Producto físico</option>
                <option value="DIGITAL">Producto digital</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-800">
              Nombre
              <Input
                className="mt-1"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-slate-800">
              Precio en pesos
              <Input
                className="mt-1"
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-slate-800">
              Código o SKU (opcional)
              <Input
                className="mt-1"
                value={sku}
                maxLength={80}
                onChange={(e) => setSku(e.target.value)}
              />
            </label>
            {type === 'PHYSICAL' ? (
              <label className="text-sm font-medium text-slate-800">
                Stock disponible
                <Input
                  className="mt-1"
                  type="number"
                  min="1"
                  step="1"
                  value={inventory}
                  onChange={(e) => setInventory(e.target.value)}
                />
              </label>
            ) : (
              <label className="text-sm font-medium text-slate-800">
                Enlace de entrega
                <Input
                  className="mt-1"
                  type="url"
                  value={deliveryUrl}
                  placeholder="https://..."
                  onChange={(e) => setDeliveryUrl(e.target.value)}
                />
              </label>
            )}
          </div>
          <label className="block text-sm font-medium text-slate-800">
            Descripción (opcional)
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-slate-200 bg-white p-3 text-sm"
              value={description}
              maxLength={1000}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? 'Guardando…' : 'Guardar producto'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${notice.kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
        >
          {notice.kind === 'success' && <CheckCircle2 />}
          {notice.text}
        </p>
      )}
    </div>
  );
}
