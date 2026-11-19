'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsCard } from '@/components/ui/settings-card';
import { FormField, FormError } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SaveBar, type SaveState } from '@/components/ui/save-bar';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  CURRENCY_LABEL,
  DESCRIPTION_MAX,
  MAX_VARIANTS,
  NAME_MAX,
  PRODUCT_TYPES,
  STUDIO_CURRENCIES,
  TYPE_LABEL,
  VARIANT_NAME_MAX,
  minorToInput,
  parseMoneyInput,
  type StudioCurrency,
  type StudioProductType,
} from '@/lib/commerce/product-studio/rules';

export type EditorOption = { id: string; name: string; sku: string | null; price: number; isActive: boolean };

export type EditorProduct = {
  id: string | null;
  name: string;
  description: string;
  type: StudioProductType;
  currency: StudioCurrency;
  basePrice: number;
  sku: string | null;
  options: EditorOption[];
};

type Row = { key: string; id?: string; name: string; sku: string; price: string; isActive: boolean };

type FormState = {
  name: string;
  description: string;
  type: StudioProductType;
  currency: StudioCurrency;
  basePrice: string;
  sku: string;
  rows: Row[];
};

function toState(product: EditorProduct): FormState {
  return {
    name: product.name,
    description: product.description,
    type: product.type,
    currency: product.currency,
    basePrice: product.id ? minorToInput(product.basePrice, product.currency) : '',
    sku: product.sku ?? '',
    rows: product.options.map((option) => ({ key: option.id, id: option.id, name: option.name, sku: option.sku ?? '', price: minorToInput(option.price, product.currency), isActive: option.isActive })),
  };
}

let rowSeq = 0;

export function ProductEditor({
  product,
  canEdit,
  readOnlyReason,
}: {
  product: EditorProduct;
  canEdit: boolean;
  /** Motivo por el que no se puede editar (archivado, Shopify). */
  readOnlyReason?: string | null;
}) {
  const router = useRouter();
  const creating = product.id === null;
  const initial = useMemo(() => toState(product), [product]);
  const [form, setForm] = useState<FormState>(initial);
  const [saveState, setSaveState] = useState<SaveState>(creating ? 'dirty' : 'idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editable = canEdit && !readOnlyReason;
  const [syncedInitial, setSyncedInitial] = useState(initial);

  // Tras guardar (o cualquier refresh del servidor) el formulario toma los datos
  // guardados —incluidos los ids de variantes nuevas—, salvo que haya cambios
  // sin guardar: esos nunca se pisan.
  if (syncedInitial !== initial) {
    setSyncedInitial(initial);
    if (!creating && saveState !== 'dirty' && saveState !== 'saving') setForm(initial);
  }
  const hasVariants = form.rows.length > 0;

  function update(patch: Partial<FormState>) {
    setForm((current) => {
      const next = { ...current, ...patch };
      setSaveState(creating || JSON.stringify(next) !== JSON.stringify(initial) ? 'dirty' : 'idle');
      return next;
    });
    setNotice(null);
  }

  function updateRow(key: string, patch: Partial<Row>) {
    update({ rows: form.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)) });
  }

  function addRow() {
    rowSeq += 1;
    update({ rows: [...form.rows, { key: `new-${rowSeq}`, name: '', sku: '', price: form.basePrice, isActive: true }] });
  }

  function validate() {
    const found: Record<string, string> = {};
    if (!form.name.trim()) found.name = 'Escribe el nombre del producto.';
    // Con variantes el precio base no se vende (queda oculto): no bloquea el guardado.
    const basePrice = hasVariants ? (parseMoneyInput(form.basePrice, form.currency) ?? 0) : parseMoneyInput(form.basePrice, form.currency);
    if (basePrice === null) found.basePrice = form.currency === 'CLP' ? 'Ingresa un precio en pesos, sin decimales (ej. 19990).' : 'Ingresa un precio válido (ej. 19.99).';
    const rows = form.rows.map((row, index) => {
      const price = parseMoneyInput(row.price, form.currency);
      if (!row.name.trim()) found[`variants.${index}.name`] = 'Escribe el nombre de la variante.';
      if (price === null) found[`variants.${index}.price`] = 'Ingresa un precio válido.';
      return { ...(row.id ? { id: row.id } : {}), name: row.name.trim(), sku: row.sku.trim() || null, price: price ?? 0, isActive: row.isActive };
    });
    return {
      found,
      payload: {
        name: form.name.trim(),
        description: form.description,
        type: form.type,
        currency: form.currency,
        basePrice: basePrice ?? 0,
        sku: form.sku.trim() || null,
        variants: rows,
      },
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editable) return;
    setFormError(null);
    setNotice(null);
    const { found, payload } = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSaveState('error');
      setFormError('Revisa los campos marcados.');
      return;
    }
    setSaveState('saving');
    try {
      const response = await fetch(creating ? '/api/products/studio' : `/api/products/${encodeURIComponent(product.id!)}`, {
        method: creating ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; field?: string; data?: { id: string; deactivatedVariants?: string[] } };
      if (!response.ok || !body.data) {
        if (body.field) setErrors({ [body.field]: body.message ?? 'Revisa este campo.' });
        setFormError(body.message ?? 'No pudimos guardar el producto.');
        setSaveState('error');
        return;
      }
      if (creating) {
        router.push(`/productos/${encodeURIComponent(body.data.id)}?creado=1`);
        return;
      }
      setSaveState('saved');
      if (body.data.deactivatedVariants?.length) {
        setNotice(`${body.data.deactivatedVariants.join(', ')} ya tenía ventas: quedó desactivada en lugar de eliminarse.`);
      }
      router.refresh();
    } catch {
      setFormError('No pudimos conectar con el servidor. Intenta de nuevo.');
      setSaveState('error');
    }
  }

  const err = (key: string) => errors[key] ?? null;

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label={creating ? 'Nuevo producto' : 'Editar producto'}>
      {readOnlyReason && (
        <p role="status" className="rounded-xl bg-ivory px-4 py-3 text-sm text-graphite">
          {readOnlyReason}
        </p>
      )}
      {!canEdit && !readOnlyReason && (
        <p role="status" className="rounded-xl bg-ivory px-4 py-3 text-sm text-graphite">
          Puedes revisar este producto. Solo el propietario o un administrador pueden modificarlo.
        </p>
      )}

      <fieldset disabled={!editable || saveState === 'saving'} className="min-w-0 space-y-4">
        <SettingsCard title="Información" description="Lo que verá el comprador antes de pagar.">
          {/* Flex con wrap, no breakpoint de viewport: la tarjeta vive en una columna angosta del editor. */}
          <div className="flex flex-wrap gap-4 [&>*:first-child]:min-w-0 [&>*:first-child]:flex-[1_1_16rem] [&>*:last-child]:flex-[0_1_200px]">
            <FormField label="Nombre" htmlFor="product-name" required error={err('name')}>
              <Input value={form.name} maxLength={NAME_MAX} autoComplete="off" onChange={(event) => update({ name: event.target.value })} />
            </FormField>
            <FormField label="Tipo" htmlFor="product-type" error={err('type')}>
              <Select value={form.type} onChange={(event) => update({ type: event.target.value as StudioProductType })}>
                {PRODUCT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABEL[type]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField
            className="mt-4"
            label="Descripción"
            htmlFor="product-description"
            description="Texto simple: los saltos de línea se respetan, el HTML no se interpreta."
            error={err('description')}
          >
            <Textarea rows={5} value={form.description} maxLength={DESCRIPTION_MAX} onChange={(event) => update({ description: event.target.value })} />
          </FormField>
        </SettingsCard>

        <SettingsCard title="Precio" description="El precio que cobra el checkout sale siempre de aquí, nunca del navegador del comprador.">
          <div className="flex flex-wrap gap-4 [&>*]:min-w-0 [&>*]:flex-[1_1_8rem]">
            <FormField label="Moneda" htmlFor="product-currency" error={err('currency')}>
              <Select value={form.currency} onChange={(event) => update({ currency: event.target.value as StudioCurrency })}>
                {STUDIO_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {CURRENCY_LABEL[currency]}
                  </option>
                ))}
              </Select>
            </FormField>
            {!hasVariants && (
              <>
                <FormField
                  label="Precio"
                  htmlFor="product-price"
                  required
                  description={form.currency === 'CLP' ? 'En pesos, sin decimales.' : 'Con hasta 2 decimales.'}
                  error={err('basePrice')}
                >
                  <Input inputMode="decimal" autoComplete="off" value={form.basePrice} placeholder={form.currency === 'CLP' ? '19990' : '19.99'} onChange={(event) => update({ basePrice: event.target.value })} />
                </FormField>
                <FormField label="SKU (opcional)" htmlFor="product-sku" description="Código interno, único en tu catálogo." error={err('sku')}>
                  <Input value={form.sku} maxLength={64} autoComplete="off" onChange={(event) => update({ sku: event.target.value })} />
                </FormField>
              </>
            )}
          </div>
          {hasVariants && <p className="mt-3 text-xs leading-5 text-soft">Este producto tiene variantes: cada una define su propio precio y SKU.</p>}
        </SettingsCard>

        <SettingsCard
          title="Variantes"
          description="Opciones que el comprador elige antes de pagar (tallas, planes, formatos). Sin variantes, se vende el producto con su precio."
        >
          {form.rows.length > 0 && (
            <ul className="space-y-3" aria-label="Variantes del producto">
              {form.rows.map((row, index) => {
                const n = index + 1;
                return (
                  <li key={row.key} className="rounded-xl border border-line p-3 sm:p-4">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
                      <FormField label={<>Nombre<span className="sr-only"> de la variante {n}</span></>} htmlFor={`variant-${row.key}-name`} error={err(`variants.${index}.name`)}>
                        <Input value={row.name} maxLength={VARIANT_NAME_MAX} autoComplete="off" placeholder="Ej. Talla M" onChange={(event) => updateRow(row.key, { name: event.target.value })} />
                      </FormField>
                      <FormField label={<>SKU<span className="sr-only"> de la variante {n}</span></>} htmlFor={`variant-${row.key}-sku`} error={err(`variants.${index}.sku`)}>
                        <Input value={row.sku} maxLength={64} autoComplete="off" placeholder="Opcional" onChange={(event) => updateRow(row.key, { sku: event.target.value })} />
                      </FormField>
                      <FormField label={<>Precio<span className="sr-only"> de la variante {n}</span></>} htmlFor={`variant-${row.key}-price`} error={err(`variants.${index}.price`)}>
                        <Input inputMode="decimal" autoComplete="off" value={row.price} onChange={(event) => updateRow(row.key, { price: event.target.value })} />
                      </FormField>
                      <div className="flex items-center justify-between gap-3 sm:pt-7">
                        <div className="flex items-center gap-2">
                          <Switch id={`variant-${row.key}-active`} checked={row.isActive} onCheckedChange={(checked) => updateRow(row.key, { isActive: checked })} aria-label={`Variante ${n} disponible para la venta`} />
                          <span className="text-xs text-soft" aria-hidden>
                            {row.isActive ? 'Disponible' : 'Pausada'}
                          </span>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => update({ rows: form.rows.filter((item) => item.key !== row.key) })} aria-label={`Quitar variante ${n}`}>
                          <Trash2 aria-hidden />
                          <span className="sm:sr-only">Quitar</span>
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {err('variants') && <FormError>{err('variants')}</FormError>}
          <Button type="button" variant="outline" size="sm" className={form.rows.length ? 'mt-3' : ''} onClick={addRow} disabled={form.rows.length >= MAX_VARIANTS}>
            <Plus aria-hidden />
            Agregar variante
          </Button>
        </SettingsCard>

      </fieldset>

      {notice && (
        <p role="status" className="rounded-lg bg-solar/25 px-3 py-2 text-sm text-warning-ink">
          {notice}
        </p>
      )}
      {editable && saveState !== 'idle' && (
        <div className="sticky bottom-0 z-10 -mx-1 rounded-t-xl bg-canvas/95 px-1 pb-2 backdrop-blur">
          <SaveBar
            state={saveState}
            saveLabel={creating ? 'Crear borrador' : 'Guardar cambios'}
            errorMessage={formError}
            onCancel={
              creating
                ? () => router.push('/productos')
                : () => {
                    setForm(initial);
                    setErrors({});
                    setFormError(null);
                    setSaveState('idle');
                  }
            }
          />
        </div>
      )}
    </form>
  );
}
