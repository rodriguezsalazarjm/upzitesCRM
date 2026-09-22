'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SaveBar } from '@/components/ui/save-bar';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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
    return <p className="text-sm text-soft">Puedes revisar el catálogo. Una persona administradora puede agregar productos.</p>;

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
          <Plus aria-hidden />
          Agregar mi primer producto
        </Button>
      )}
      {open && (
        <Card tone="sunken" className="p-4 sm:p-5">
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Tipo de producto" htmlFor="product-type">
                <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  <option value="PHYSICAL">Producto físico</option>
                  <option value="DIGITAL">Producto digital</option>
                </Select>
              </FormField>
              <FormField label="Nombre" htmlFor="product-name">
                <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label="Precio en pesos" htmlFor="product-price">
                <Input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} />
              </FormField>
              <FormField label="Código o SKU (opcional)" htmlFor="product-sku">
                <Input value={sku} maxLength={80} onChange={(e) => setSku(e.target.value)} />
              </FormField>
              {type === 'PHYSICAL' ? (
                <FormField label="Stock disponible" htmlFor="product-inventory">
                  <Input type="number" min="1" step="1" value={inventory} onChange={(e) => setInventory(e.target.value)} />
                </FormField>
              ) : (
                <FormField label="Enlace de entrega" htmlFor="product-delivery-url">
                  <Input type="url" value={deliveryUrl} placeholder="https://..." onChange={(e) => setDeliveryUrl(e.target.value)} />
                </FormField>
              )}
            </div>
            <FormField label="Descripción (opcional)" htmlFor="product-description">
              <Textarea rows={4} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
            </FormField>
            <SaveBar
              state={busy ? 'saving' : notice?.kind === 'error' ? 'error' : 'dirty'}
              saveLabel="Guardar producto"
              errorMessage={notice?.kind === 'error' ? notice.text : null}
              onCancel={() => setOpen(false)}
            />
          </form>
        </Card>
      )}
      {notice && !open && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${notice.kind === 'error' ? 'bg-tomato/12 text-danger-ink' : 'bg-lime/25 text-success-ink'}`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
