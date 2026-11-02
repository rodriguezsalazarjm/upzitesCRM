'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ArrowDown, ArrowUp, Gift, Pencil, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { BumpOfferCard } from '@/app/checkout/[id]/order-bump-form';
import { UpsellOffer } from '@/app/checkout/[id]/upsell-offer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SettingsCard } from '@/components/ui/settings-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleRow } from '@/components/ui/toggle-row';
import { MAX_OFFERS_PER_KIND, OFFER_DESCRIPTION_MAX, OFFER_HEADLINE_MAX, defaultOfferHeadline, formatRate, type OfferKind } from '@/lib/commerce/offers/rules';
import { BUMP_ISSUE_TEXT, formatMinor, minorToInput, parseMoneyInput, type BumpIssue } from '@/lib/commerce/product-studio/rules';

export type ManagerOption = { variantId: string; label: string; price: number; currency: string; published: boolean; imageUrl: string | null };

export type ManagerOffer = {
  id: string;
  kind: OfferKind;
  variantId: string;
  label: string;
  headline: string;
  description: string | null;
  price: number | null;
  variantPrice: number;
  effectivePrice: number;
  currency: string;
  showImage: boolean;
  imageUrl: string | null;
  isActive: boolean;
  issue: BumpIssue | null;
  stats: { shown: number; accepted: number; paid: number; takeRate: number | null };
};

const SECTION: Record<OfferKind, { title: string; description: string; icon: typeof Gift; add: string; empty: string }> = {
  ORDER_BUMP: {
    title: 'Order bump',
    description: 'Casilla opcional en el checkout, antes de pagar. Se suma al mismo pago.',
    icon: ShoppingBag,
    add: 'Agregar order bump',
    empty: 'Ofrece un complemento que el comprador sume con un clic antes de pagar.',
  },
  UPSELL: {
    title: 'Upsell postcompra',
    description: 'Se ofrece con el pago ya confirmado. Si lo acepta, paga aparte con Mercado Pago.',
    icon: Gift,
    add: 'Agregar upsell',
    empty: 'Ofrece algo más justo después de la compra, sin tocar el pago que ya se hizo.',
  },
};

type Draft = { id: string | null; kind: OfferKind; variantId: string; headline: string; description: string; price: string; showImage: boolean; isActive: boolean };

function draftOf(offer: ManagerOffer): Draft {
  return {
    id: offer.id,
    kind: offer.kind,
    variantId: offer.variantId,
    headline: offer.headline,
    description: offer.description ?? '',
    price: offer.price === null ? '' : minorToInput(offer.price, offer.currency),
    showImage: offer.showImage,
    isActive: offer.isActive,
  };
}

function payloadOf(draft: Draft, currency: string) {
  const price = draft.price.trim() ? parseMoneyInput(draft.price, currency) : null;
  return {
    price,
    body: {
      variantId: draft.variantId,
      headline: draft.headline.trim(),
      description: draft.description.trim() || null,
      price,
      showImage: draft.showImage,
      isActive: draft.isActive,
    },
  };
}

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await response.json().catch(() => ({}))) as { message?: string; field?: string };
  return { ok: response.ok, message: json.message ?? null, field: json.field ?? null };
}

export function OffersManager({
  productId,
  currency,
  offers,
  winner,
  options,
  editable,
  readOnlyReason,
}: {
  productId: string;
  currency: string;
  offers: ManagerOffer[];
  winner: Record<OfferKind, string | null>;
  options: ManagerOption[];
  editable: boolean;
  readOnlyReason: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [removing, setRemoving] = useState<ManagerOffer | null>(null);
  const base = `/api/products/${encodeURIComponent(productId)}/offers`;
  const sameCurrency = options.filter((option) => option.currency === currency);

  function open(kind: OfferKind, offer?: ManagerOffer) {
    setErrors({});
    setFormError(null);
    setDraft(offer ? draftOf(offer) : { id: null, kind, variantId: '', headline: '', description: '', price: '', showImage: true, isActive: true });
  }

  function chooseVariant(variantId: string) {
    if (!draft) return;
    const option = sameCurrency.find((item) => item.variantId === variantId);
    const previous = sameCurrency.find((item) => item.variantId === draft.variantId);
    // El titulo se completa solo mientras sea el sugerido (o este vacio): nunca pisa uno escrito.
    const keepHeadline = draft.headline.trim() && (!previous || draft.headline !== defaultOfferHeadline(draft.kind, previous.label));
    setDraft({ ...draft, variantId, headline: keepHeadline || !option ? draft.headline : defaultOfferHeadline(draft.kind, option.label) });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !editable) return;
    const found: Record<string, string> = {};
    const { price, body } = payloadOf(draft, currency);
    if (!draft.variantId) found.variantId = 'Elige el producto que se ofrecerá.';
    if (!body.headline) found.headline = 'Escribe el título de la oferta.';
    if (draft.price.trim() && (price === null || price <= 0)) found.price = currency === 'CLP' ? 'Ingresa un precio en pesos, sin decimales (ej. 2990).' : 'Ingresa un precio válido (ej. 9.99).';
    setErrors(found);
    if (Object.keys(found).length > 0) return setFormError('Revisa los campos marcados.');
    setSaving(true);
    setFormError(null);
    const result = draft.id ? await send(`${base}/${encodeURIComponent(draft.id)}`, 'PATCH', body) : await send(base, 'POST', { kind: draft.kind, ...body });
    setSaving(false);
    if (!result.ok) {
      if (result.field) setErrors({ [result.field]: result.message ?? 'Revisa este campo.' });
      return setFormError(result.message ?? 'No pudimos guardar la oferta.');
    }
    setDraft(null);
    setNotice({ tone: 'ok', text: draft.id ? 'Oferta actualizada.' : 'Oferta creada.' });
    router.refresh();
  }

  async function toggle(offer: ManagerOffer, isActive: boolean) {
    setPending(offer.id);
    const { body } = payloadOf({ ...draftOf(offer), isActive }, currency);
    const result = await send(`${base}/${encodeURIComponent(offer.id)}`, 'PATCH', body);
    setPending(null);
    setNotice(result.ok ? { tone: 'ok', text: isActive ? 'Oferta activada.' : 'Oferta pausada.' } : { tone: 'error', text: result.message ?? 'No pudimos cambiar la oferta.' });
    router.refresh();
  }

  async function move(kind: OfferKind, index: number, delta: -1 | 1) {
    const list = offers.filter((offer) => offer.kind === kind);
    const ids = list.map((offer) => offer.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setPending(list[index].id);
    const result = await send(base, 'PUT', { kind, ids });
    setPending(null);
    setNotice(result.ok ? { tone: 'ok', text: 'Prioridad actualizada.' } : { tone: 'error', text: result.message ?? 'No pudimos cambiar la prioridad.' });
    router.refresh();
  }

  async function remove() {
    if (!removing) return;
    setPending(removing.id);
    const result = await send(`${base}/${encodeURIComponent(removing.id)}`, 'DELETE');
    setPending(null);
    setRemoving(null);
    setNotice(result.ok ? { tone: 'ok', text: removing.stats.shown > 0 ? 'Oferta eliminada. Su medición se conserva.' : 'Oferta eliminada.' } : { tone: 'error', text: result.message ?? 'No pudimos eliminar la oferta.' });
    router.refresh();
  }

  const option = draft ? sameCurrency.find((item) => item.variantId === draft.variantId) ?? null : null;
  const draftPrice = draft && option ? (draft.price.trim() ? parseMoneyInput(draft.price, currency) : null) ?? option.price : 0;
  const previewOffer = draft && option ? { headline: draft.headline.trim() || defaultOfferHeadline(draft.kind, option.label), description: draft.description.trim() || null, imageUrl: draft.showImage ? option.imageUrl : null, unitPrice: draftPrice } : null;

  return (
    <div className="space-y-4">
      {readOnlyReason && (
        <p role="status" className="rounded-xl bg-ivory px-4 py-3 text-sm text-graphite">
          {readOnlyReason}
        </p>
      )}
      {!editable && !readOnlyReason && (
        <p role="status" className="rounded-xl bg-ivory px-4 py-3 text-sm text-graphite">
          Puedes revisar las ofertas. Solo el propietario o un administrador pueden modificarlas.
        </p>
      )}
      {notice && (
        <p role="status" className={notice.tone === 'ok' ? 'rounded-lg bg-lime/25 px-3 py-2 text-sm text-success-ink' : 'rounded-lg bg-tomato/10 px-3 py-2 text-sm text-danger-ink'}>
          {notice.text}
        </p>
      )}

      {(['ORDER_BUMP', 'UPSELL'] as const).map((kind) => {
        const section = SECTION[kind];
        const list = offers.filter((offer) => offer.kind === kind);
        const canAdd = editable && list.length < MAX_OFFERS_PER_KIND;
        return (
          <SettingsCard
            key={kind}
            icon={section.icon}
            title={section.title}
            description={section.description}
          >
            {list.length === 0 ? (
              <EmptyState
                icon={section.icon}
                title="Sin ofertas todavía"
                description={section.empty}
                action={
                  editable ? (
                    <Button type="button" size="sm" onClick={() => open(kind)}>
                      <Plus aria-hidden />
                      {section.add}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ol className="space-y-3" aria-label={`${section.title}: ofertas por prioridad`}>
                {list.map((offer, index) => {
                  const shownNow = winner[kind] === offer.id;
                  const status = !offer.isActive
                    ? { tone: 'draft' as const, text: 'Pausada' }
                    : offer.issue
                      ? { tone: 'warning' as const, text: 'No disponible' }
                      : shownNow
                        ? { tone: 'success' as const, text: 'Se muestra' }
                        : { tone: 'neutral' as const, text: 'Respaldo' };
                  return (
                    <li key={offer.id} className="rounded-xl border border-line p-3 sm:p-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ivory text-xs font-bold text-carbon" aria-label={`Prioridad ${index + 1}`}>
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 break-words text-sm font-semibold text-carbon">{offer.headline}</p>
                            <StatusBadge tone={status.tone}>{status.text}</StatusBadge>
                          </div>
                          <p className="mt-1 break-words text-xs text-soft">
                            {offer.label} · {formatMinor(offer.effectivePrice, offer.currency)}
                            {offer.price !== null && offer.price !== offer.variantPrice ? ` (precio especial; normal ${formatMinor(offer.variantPrice, offer.currency)})` : ''}
                          </p>
                          {offer.isActive && offer.issue && <p className="mt-1 text-xs text-warning-ink">{BUMP_ISSUE_TEXT[offer.issue]}</p>}
                          <p className="tabular mt-2 text-xs text-graphite">
                            Mostrada {offer.stats.shown} · Aceptada {offer.stats.accepted} · Pagada {offer.stats.paid} · Take rate {formatRate(offer.stats.takeRate)}
                          </p>
                        </div>
                        {editable && (
                          <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-end">
                            <div className="flex items-center gap-2 pr-2">
                              <Switch
                                id={`offer-${offer.id}-active`}
                                checked={offer.isActive}
                                disabled={pending === offer.id}
                                onCheckedChange={(checked) => toggle(offer, checked)}
                                aria-label={`${offer.isActive ? 'Pausar' : 'Activar'} ${offer.headline}`}
                              />
                            </div>
                            <Button type="button" variant="ghost" size="sm" disabled={index === 0 || pending !== null} onClick={() => move(kind, index, -1)} aria-label={`Subir prioridad de ${offer.headline}`}>
                              <ArrowUp aria-hidden />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" disabled={index === list.length - 1 || pending !== null} onClick={() => move(kind, index, 1)} aria-label={`Bajar prioridad de ${offer.headline}`}>
                              <ArrowDown aria-hidden />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => open(kind, offer)} aria-label={`Editar ${offer.headline}`}>
                              <Pencil aria-hidden />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setRemoving(offer)} aria-label={`Eliminar ${offer.headline}`}>
                              <Trash2 aria-hidden />
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {list.length > 1 && <p className="mt-3 text-xs leading-5 text-soft">Se muestra una sola: la primera disponible. Las demás quedan de respaldo si esa deja de estar a la venta.</p>}
            {canAdd && list.length > 0 && (
              <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => open(kind)}>
                <Plus aria-hidden />
                {section.add}
              </Button>
            )}
          </SettingsCard>
        );
      })}

      <Drawer id="offer-editor" open={draft !== null} onClose={() => setDraft(null)} title={draft ? `${draft.id ? 'Editar' : 'Nuevo'} ${draft.kind === 'ORDER_BUMP' ? 'order bump' : 'upsell'}` : 'Oferta'}>
        {draft && (
          <form onSubmit={save} noValidate className="space-y-4" aria-label="Editor de oferta">
            <fieldset disabled={saving} className="min-w-0 space-y-4">
              {sameCurrency.length > 0 ? (
                <FormField label="Producto ofrecido" htmlFor="offer-variant" required error={errors.variantId ?? null} description={`Otro producto de tu catálogo en ${currency}.`}>
                  <Select value={draft.variantId} onChange={(event) => chooseVariant(event.target.value)}>
                    <option value="">Elige un producto…</option>
                    {sameCurrency.map((item) => (
                      <option key={item.variantId} value={item.variantId}>
                        {item.label} · {formatMinor(item.price, item.currency)}
                        {item.published ? '' : ' (borrador)'}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : (
                <p className="text-sm text-soft">No tienes otros productos con precio en {currency}. Crea uno para poder ofrecerlo.</p>
              )}
              {option && !option.published && <p className="text-xs leading-5 text-warning-ink">Ese producto aún es borrador: no se mostrará hasta que lo publiques.</p>}
              <FormField label="Título" htmlFor="offer-headline" required error={errors.headline ?? null}>
                <Input value={draft.headline} maxLength={OFFER_HEADLINE_MAX} autoComplete="off" onChange={(event) => setDraft({ ...draft, headline: event.target.value })} />
              </FormField>
              <FormField label="Descripción (opcional)" htmlFor="offer-description" error={errors.description ?? null} description="Por qué conviene sumarlo. Texto simple.">
                <Textarea rows={3} value={draft.description} maxLength={OFFER_DESCRIPTION_MAX} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </FormField>
              <FormField
                label="Precio especial (opcional)"
                htmlFor="offer-price"
                error={errors.price ?? null}
                description={option ? `Vacío = precio normal (${formatMinor(option.price, option.currency)}). Lo cobra el servidor, nunca el navegador.` : 'Vacío = precio normal del producto.'}
              >
                <Input inputMode="decimal" autoComplete="off" value={draft.price} placeholder={option ? minorToInput(option.price, currency) : ''} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
              </FormField>
              <ToggleRow id="offer-image" label="Mostrar imagen" description="Usa la portada del producto ofrecido." checked={draft.showImage} onCheckedChange={(checked) => setDraft({ ...draft, showImage: checked })} />
              <ToggleRow id="offer-active" label="Oferta activa" description="Pausada no se muestra, pero conserva su configuración y su medición." checked={draft.isActive} onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })} />
            </fieldset>

            <section aria-label="Vista previa de la oferta" className="rounded-xl bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-soft">Vista previa · así la verá el comprador</p>
              {previewOffer ? (
                draft.kind === 'ORDER_BUMP' ? (
                  <BumpOfferCard bump={previewOffer} currency={currency} selected={false} />
                ) : (
                  <div className="mt-3">
                    <UpsellOffer orderId="vista-previa" token="" offer={previewOffer} currency={currency} preview />
                  </div>
                )
              ) : (
                <p className="mt-2 text-sm text-soft">Elige un producto para ver la oferta.</p>
              )}
            </section>

            {formError && <FormError>{formError}</FormError>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !editable}>
                {saving ? 'Guardando…' : draft.id ? 'Guardar oferta' : 'Crear oferta'}
              </Button>
            </div>
          </form>
        )}
      </Drawer>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(value) => !value && setRemoving(null)}
        title="Eliminar oferta"
        description={
          removing && removing.stats.shown > 0
            ? `"${removing.headline}" ya se mostró ${removing.stats.shown} ${removing.stats.shown === 1 ? 'vez' : 'veces'}: deja de ofrecerse y su medición se conserva en Resultados.`
            : `"${removing?.headline ?? ''}" deja de ofrecerse.`
        }
        confirmLabel="Eliminar"
        destructive
        busy={pending === removing?.id}
        onConfirm={remove}
      />
    </div>
  );
}
