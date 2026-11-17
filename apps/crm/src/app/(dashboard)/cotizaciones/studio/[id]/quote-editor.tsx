'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Download, Mail, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { QuotePreview } from '@/components/quote-studio/quote-preview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { exponentOf, formatMinor } from '@/lib/commerce/money';
import { bpToPercent, calculateQuote, fromMinor, percentLabel, percentToBp, toMinor, type QuoteChargeInput, type QuoteLineInput } from '@/lib/quote-studio/calc';
import { layoutQuote } from '@/lib/quote-studio/layout';
import { QUOTE_STATUS } from '@/lib/quote-studio/status';
import { BLOCKS, TEXT_BLOCKS, type Block, type Brand, type Customer, type QuoteContent } from '@/lib/quote-studio/schema';


type Template = { id: string; name: string; blocks: Block[] };
type CatalogItem = { id: string; name: string; description: string; unit: string; unitPriceMinor: number; taxRateBp: number | null };
type ContactOption = { id: string; name: string; email: string; phone: string; company: string };
type QuoteData = {
  id: string; number: string; version: number; status: string; templateId: string | null; title: string; currency: 'CLP' | 'USD'; pricesIncludeTax: boolean;
  customer: Customer; contactId: string | null; opportunityId: string | null; ownerId: string | null; content: QuoteContent;
  lines: QuoteLineInput[]; globalDiscountBp: number; charges: QuoteChargeInput[]; issuedAt: string; validUntil: string | null; responseComment: string | null;
  publicUrl: string | null; versions: { version: number; channel: string; recipient: string | null; createdAt: string }[];
};
type LineDraft = { id: string; catalogItemId: string | null; name: string; description: string; qty: string; unit: string; price: string; discount: string; tax: string };
type ChargeDraft = { id: string; label: string; amount: string; taxable: boolean };

const uid = () => Math.random().toString(36).slice(2, 10);
const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export function QuoteEditor({ quote, brand, logo, taxRateBp, templates, catalog, contacts, members }: {
  quote: QuoteData; brand: Brand; logo: { dataUrl: string; width: number; height: number } | null; taxRateBp: number;
  templates: Template[]; catalog: CatalogItem[]; contacts: ContactOption[]; members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const exp = exponentOf(quote.currency);
  const [form, setForm] = useState(() => ({
    templateId: quote.templateId ?? templates[0]?.id ?? '', title: quote.title, currency: quote.currency, pricesIncludeTax: quote.pricesIncludeTax,
    customer: quote.customer, contactId: quote.contactId, ownerId: quote.ownerId, content: quote.content, globalDiscount: bpToPercent(quote.globalDiscountBp), validUntil: dateInput(quote.validUntil),
  }));
  const [lines, setLines] = useState<LineDraft[]>(() => quote.lines.map((l) => ({ id: l.id, catalogItemId: l.catalogItemId ?? null, name: l.name, description: l.description, qty: String(l.quantity).replace('.', ','), unit: l.unit, price: fromMinor(l.unitPriceMinor, exponentOf(quote.currency)), discount: bpToPercent(l.discountBp), tax: l.taxRateBp === null ? '' : bpToPercent(l.taxRateBp) })));
  const [charges, setCharges] = useState<ChargeDraft[]>(() => quote.charges.map((c) => ({ id: c.id, label: c.label, amount: fromMinor(c.amountMinor, exponentOf(quote.currency)), taxable: c.taxable })));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState(quote.publicUrl);
  const locked = quote.status === 'ACCEPTED' || quote.status === 'CANCELLED';
  const sentBefore = ['SENT', 'VIEWED', 'REJECTED', 'EXPIRED'].includes(quote.status);

  const touch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };
  const update = touch((patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch })));
  const setLine = touch((next: LineDraft[]) => setLines(next));
  const setCharge = touch((next: ChargeDraft[]) => setCharges(next));

  // Lo que se guarda: números ya convertidos. Los inválidos se marcan y no se envían.
  const parsed = useMemo(() => {
    const problems: string[] = [];
    const out: QuoteLineInput[] = lines.map((l, i) => {
      const quantity = Number(l.qty.replace(',', '.'));
      const unitPriceMinor = toMinor(l.price, exp);
      const discountBp = percentToBp(l.discount);
      const taxRate = l.tax.trim() === '' ? null : percentToBp(l.tax);
      if (!l.name.trim()) problems.push(`Línea ${i + 1}: falta el nombre.`);
      if (!(quantity > 0)) problems.push(`Línea ${i + 1}: cantidad inválida.`);
      if (unitPriceMinor === null) problems.push(`Línea ${i + 1}: precio inválido.`);
      if (discountBp === null || (l.tax.trim() !== '' && taxRate === null)) problems.push(`Línea ${i + 1}: porcentaje inválido.`);
      return { id: l.id, catalogItemId: l.catalogItemId, name: l.name.trim(), description: l.description, quantity: quantity > 0 ? Math.round(quantity * 1000) / 1000 : 0, unit: l.unit || 'unidad', unitPriceMinor: unitPriceMinor ?? 0, discountBp: discountBp ?? 0, taxRateBp: taxRate };
    });
    const ch: QuoteChargeInput[] = charges.map((c) => ({ id: c.id, label: c.label.trim() || 'Cargo', amountMinor: toMinor(c.amount, exp) ?? 0, taxable: c.taxable }));
    const globalDiscountBp = percentToBp(form.globalDiscount);
    if (globalDiscountBp === null) problems.push('Descuento global inválido.');
    return { lines: out, charges: ch, globalDiscountBp: globalDiscountBp ?? 0, problems };
  }, [lines, charges, form.globalDiscount, exp]);

  const template = templates.find((t) => t.id === form.templateId) ?? templates[0];
  const calc = calculateQuote({ lines: parsed.lines, charges: parsed.charges, globalDiscountBp: parsed.globalDiscountBp, defaultTaxRateBp: taxRateBp, pricesIncludeTax: form.pricesIncludeTax });
  const pages = useMemo(() => layoutQuote({
    brand, logo: logo ? { width: logo.width, height: logo.height } : null, blocks: template?.blocks ?? [], number: quote.number, version: dirty && sentBefore ? quote.version + 1 : quote.version,
    title: form.title, issuedAt: quote.issuedAt, validUntil: form.validUntil ? new Date(`${form.validUntil}T12:00:00`).toISOString() : null,
    ownerName: members.find((m) => m.id === form.ownerId)?.name ?? '', customer: form.customer, content: form.content, currency: form.currency, pricesIncludeTax: form.pricesIncludeTax,
    globalDiscountBp: parsed.globalDiscountBp, lines: parsed.lines, charges: parsed.charges, calc, timeZone: 'America/Santiago',
  }), [brand, logo, template, quote, form, members, parsed, calc, dirty, sentBefore]);

  async function request(url: string, method: string, body?: unknown) {
    setError('');
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { data?: Record<string, unknown>; message?: string } | null;
    if (!response?.ok) { setError(json?.message ?? 'No se pudo completar. Inténtalo de nuevo.'); return null; }
    return json?.data ?? {};
  }

  async function save() {
    if (parsed.problems.length) { setError(parsed.problems[0]); return false; }
    setBusy(true);
    const result = await request(`/api/quote-studio/quotes/${quote.id}`, 'PATCH', {
      templateId: form.templateId || null, title: form.title, currency: form.currency, pricesIncludeTax: form.pricesIncludeTax, customer: form.customer,
      contactId: form.contactId, opportunityId: quote.opportunityId, ownerId: form.ownerId, content: form.content, lines: parsed.lines,
      globalDiscountBp: parsed.globalDiscountBp, charges: parsed.charges, validUntil: form.validUntil ? new Date(`${form.validUntil}T23:59:00`).toISOString() : null,
    });
    setBusy(false);
    if (!result) return false;
    setDirty(false);
    setNotice(sentBefore ? `Guardada como versión ${quote.version + 1}. El cliente sigue viendo la versión enviada hasta que la envíes de nuevo.` : 'Guardada.');
    router.refresh();
    return true;
  }

  /** Las acciones trabajan sobre lo guardado: si hay cambios, se guarda antes. */
  async function act(body: Record<string, string>) {
    if (dirty && !(await save())) return null;
    setBusy(true);
    const result = await request(`/api/quote-studio/quotes/${quote.id}`, 'POST', body);
    setBusy(false);
    if (result) router.refresh();
    return result;
  }

  async function send(channel: 'email' | 'whatsapp' | 'link') {
    // WhatsApp se abre antes de esperar al servidor: los navegadores bloquean ventanas abiertas después.
    const popup = channel === 'whatsapp' ? window.open('', '_blank') : null;
    const result = (await act({ action: 'send', channel })) as { url?: string; whatsappUrl?: string; recipient?: string } | null;
    if (!result?.url) { popup?.close(); return; }
    setLink(result.url);
    if (channel === 'whatsapp') { if (popup) popup.location.href = result.whatsappUrl!; setNotice('Se abrió WhatsApp con el mensaje y el enlace.'); }
    if (channel === 'email') setNotice(`Enviada por email a ${result.recipient}.`);
    if (channel === 'link') { await navigator.clipboard?.writeText(result.url).catch(() => undefined); setNotice('Enlace copiado.'); }
  }

  const addFromCatalog = (id: string) => {
    const item = catalog.find((c) => c.id === id);
    if (item) setLine([...lines, { id: uid(), catalogItemId: item.id, name: item.name, description: item.description, qty: '1', unit: item.unit, price: fromMinor(item.unitPriceMinor, exp), discount: '0', tax: item.taxRateBp === null ? '' : bpToPercent(item.taxRateBp) }]);
  };
  const moveLine = (i: number, d: number) => { const next = [...lines]; [next[i], next[i + d]] = [next[i + d], next[i]]; setLine(next); };
  const money = (n: number) => formatMinor(n, form.currency);
  const textBlocks = (template?.blocks ?? []).filter((b) => b.visible && (TEXT_BLOCKS as readonly string[]).includes(b.type));

  return (
    <div className="space-y-4" data-quote-editor aria-busy={busy}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={QUOTE_STATUS[quote.status]?.variant ?? 'outline'} data-quote-status={quote.status}>{QUOTE_STATUS[quote.status]?.label ?? quote.status}</Badge>
        <span className="text-sm text-graphite">Versión {quote.version}{dirty ? ' · cambios sin guardar' : ''}</span>
        <Link href="/cotizaciones" className="ml-auto text-sm font-semibold text-electric hover:underline">Volver a cotizaciones</Link>
      </div>
      {quote.responseComment && <p className="rounded-lg bg-ivory p-3 text-sm text-graphite">Comentario del cliente: “{quote.responseComment}”</p>}
      {!sentBefore && !locked && quote.versions[0] && quote.versions[0].version < quote.version && <p className="rounded-lg bg-ivory p-3 text-xs text-graphite" data-unsent-version>El cliente sigue viendo la versión {quote.versions[0].version}. Esta versión {quote.version} se le muestra cuando la envíes.</p>}
      {sentBefore && !locked && <p className="rounded-lg bg-solar/20 p-3 text-xs text-warning-ink">Ya se envió la versión {quote.versions[0]?.version ?? quote.version}. Si la editas, se guarda como versión {quote.version + 1} y el cliente sigue viendo la anterior hasta que la envíes.</p>}

      <div className="flex flex-wrap gap-2" data-quote-actions>
        {!locked && <Button type="button" disabled={busy || !dirty} onClick={() => void save()}>Guardar</Button>}
        <Button type="button" variant="outline" disabled={busy} onClick={async () => { if (!dirty || (await save())) window.open(`/api/quote-studio/quotes/${quote.id}/pdf`, '_blank'); }}><Download aria-hidden /> PDF</Button>
        {!locked && <>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void send('email')} data-send="email"><Mail aria-hidden /> Enviar por email</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void send('whatsapp')} data-send="whatsapp"><MessageCircle aria-hidden /> WhatsApp</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void send('link')} data-send="link"><Copy aria-hidden /> Copiar enlace</Button>
        </>}
        <Button type="button" variant="outline" disabled={busy} data-duplicate onClick={async () => { const copy = (await act({ action: 'duplicate' })) as { id?: string } | null; if (copy?.id) router.push(`/cotizaciones/studio/${copy.id}`); }}>Duplicar</Button>
        {quote.status === 'DRAFT' && <Button type="button" variant="ghost" disabled={busy} onClick={() => void act({ action: 'ready' })}>Marcar lista</Button>}
        {['SENT', 'VIEWED', 'EXPIRED'].includes(quote.status) && <>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void act({ action: 'accept' })}>Marcar aceptada</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void act({ action: 'reject' })}>Marcar rechazada</Button>
        </>}
        {!locked && <Button type="button" variant="ghost" disabled={busy} onClick={() => { if (confirm('¿Cancelar esta cotización? El enlace dejará de funcionar.')) void act({ action: 'cancel' }); }}>Cancelar</Button>}
      </div>
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      {notice && <p role="status" className="text-sm text-graphite" data-quote-notice>{notice}</p>}
      {link && <p className="break-all text-xs text-soft">Enlace del cliente: <a href={link} target="_blank" rel="noreferrer" className="text-electric hover:underline" data-public-link>{link}</a></p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <fieldset disabled={locked} className="min-w-0 space-y-4">
          <Card className="space-y-3 p-4">
            <Eyebrow>Cliente</Eyebrow>
            <Select value={form.contactId ?? ''} onChange={(e) => {
              const c = contacts.find((x) => x.id === e.target.value);
              update({ contactId: c?.id ?? null, customer: c ? { ...form.customer, name: c.name, email: c.email, phone: c.phone, company: c.company || form.customer.company } : form.customer });
            }} aria-label="Contacto">
              <option value="">Cliente rápido (sin contacto)</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}
            </Select>
            <div className="grid gap-2 sm:grid-cols-2">
              {([['name', 'Nombre'], ['company', 'Empresa'], ['email', 'Email'], ['phone', 'Teléfono'], ['taxId', 'RUT'], ['address', 'Dirección']] as const).map(([key, label]) => (
                <Input key={key} aria-label={label} placeholder={label} value={form.customer[key]} onChange={(e) => update({ customer: { ...form.customer, [key]: e.target.value } })} data-customer={key} />
              ))}
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-sm sm:col-span-2"><span className="font-semibold text-carbon">Título</span>
                <Input value={form.title} onChange={(e) => update({ title: e.target.value })} placeholder="Ej.: Instalación de mallas de seguridad" data-quote-title /></label>
              <label className="space-y-1 text-sm"><span className="font-semibold text-carbon">Plantilla</span>
                <Select value={form.templateId} onChange={(e) => update({ templateId: e.target.value })}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
              <label className="space-y-1 text-sm"><span className="font-semibold text-carbon">Ejecutivo</span>
                <Select value={form.ownerId ?? ''} onChange={(e) => update({ ownerId: e.target.value || null })}><option value="">Sin ejecutivo</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></label>
              <label className="space-y-1 text-sm"><span className="font-semibold text-carbon">Moneda</span>
                <Select value={form.currency} onChange={(e) => update({ currency: e.target.value as 'CLP' | 'USD' })} disabled={lines.length > 0} title={lines.length ? 'Cambia la moneda antes de agregar líneas' : undefined}><option value="CLP">CLP</option><option value="USD">USD</option></Select></label>
              <label className="space-y-1 text-sm"><span className="font-semibold text-carbon">Válida hasta</span>
                <Input type="date" value={form.validUntil} onChange={(e) => update({ validUntil: e.target.value })} /></label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.pricesIncludeTax} onChange={(e) => update({ pricesIncludeTax: e.target.checked })} /> Los precios ya incluyen impuesto</label>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Eyebrow>Líneas</Eyebrow>
              {catalog.length > 0 && (
                <Select density="sm" wrapperClassName="ml-auto w-auto" value="" onChange={(e) => addFromCatalog(e.target.value)} aria-label="Agregar desde el catálogo" data-catalog-picker>
                  <option value="">+ Desde el catálogo</option>
                  {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} · {formatMinor(c.unitPriceMinor, form.currency)}</option>)}
                </Select>
              )}
              <Button type="button" size="sm" variant="outline" className={catalog.length ? '' : 'ml-auto'} onClick={() => setLine([...lines, { id: uid(), catalogItemId: null, name: '', description: '', qty: '1', unit: 'unidad', price: '0', discount: '0', tax: '' }])} data-add-line><Plus aria-hidden /> Línea</Button>
            </div>
            {lines.length === 0 && <p className="text-sm text-soft">Agrega productos o servicios. Los del catálogo se copian y puedes cambiarlos aquí sin tocar el catálogo.</p>}
            {lines.map((l, i) => {
              const r = calc.lines[i];
              const set = (patch: Partial<LineDraft>) => setLine(lines.map((x) => (x.id === l.id ? { ...x, ...patch } : x)));
              return (
                <div key={l.id} className="space-y-2 rounded-lg border border-line p-3" data-line={i}>
                  <div className="flex gap-2">
                    <Input aria-label="Producto o servicio" placeholder="Producto o servicio" value={l.name} onChange={(e) => set({ name: e.target.value })} data-field="name" />
                    <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => moveLine(i, -1)} aria-label="Subir"><ArrowUp aria-hidden /></Button>
                    <Button type="button" size="sm" variant="ghost" disabled={i === lines.length - 1} onClick={() => moveLine(i, 1)} aria-label="Bajar"><ArrowDown aria-hidden /></Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setLine(lines.filter((x) => x.id !== l.id))} aria-label="Quitar línea"><Trash2 aria-hidden /></Button>
                  </div>
                  <Textarea rows={1} aria-label="Descripción" placeholder="Descripción (opcional)" value={l.description} onChange={(e) => set({ description: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <label className="space-y-1 text-xs"><span className="text-soft">Cantidad</span><Input inputMode="decimal" value={l.qty} onChange={(e) => set({ qty: e.target.value })} data-field="qty" /></label>
                    <label className="space-y-1 text-xs"><span className="text-soft">Unidad</span><Input value={l.unit} onChange={(e) => set({ unit: e.target.value })} /></label>
                    <label className="space-y-1 text-xs"><span className="text-soft">Precio unit.</span><Input inputMode="decimal" value={l.price} onChange={(e) => set({ price: e.target.value })} data-field="price" /></label>
                    <label className="space-y-1 text-xs"><span className="text-soft">Desc. %</span><Input inputMode="decimal" value={l.discount} onChange={(e) => set({ discount: e.target.value })} data-field="discount" /></label>
                    <label className="space-y-1 text-xs"><span className="text-soft">Impuesto %</span><Input inputMode="decimal" placeholder={bpToPercent(taxRateBp)} value={l.tax} onChange={(e) => set({ tax: e.target.value })} data-field="tax" /></label>
                  </div>
                  {r && <p className="text-right text-xs text-graphite">Neto {money(r.netMinor)} · con impuesto {money(r.totalMinor)}</p>}
                </div>
              );
            })}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-sm"><span className="font-semibold text-carbon">Descuento global %</span><Input inputMode="decimal" value={form.globalDiscount} onChange={(e) => update({ globalDiscount: e.target.value })} data-global-discount /></label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2"><span className="text-sm font-semibold text-carbon">Costos adicionales</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCharge([...charges, { id: uid(), label: '', amount: '0', taxable: true }])}><Plus aria-hidden /> Costo</Button></div>
              {charges.map((c) => {
                const set = (patch: Partial<ChargeDraft>) => setCharge(charges.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-2">
                    <Input aria-label="Concepto" placeholder="Despacho, instalación…" value={c.label} onChange={(e) => set({ label: e.target.value })} className="min-w-0 flex-1" />
                    <Input aria-label="Monto" inputMode="decimal" value={c.amount} onChange={(e) => set({ amount: e.target.value })} className="w-28" />
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={c.taxable} onChange={(e) => set({ taxable: e.target.checked })} /> Con impuesto</label>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setCharge(charges.filter((x) => x.id !== c.id))} aria-label="Quitar costo"><Trash2 aria-hidden /></Button>
                  </div>
                );
              })}
            </div>
            <dl className="ml-auto max-w-xs space-y-1 text-sm" data-totals>
              <div className="flex justify-between"><dt className="text-soft">Subtotal</dt><dd>{money(calc.subtotalMinor)}</dd></div>
              {calc.globalDiscountMinor > 0 && <div className="flex justify-between"><dt className="text-soft">Descuento</dt><dd>-{money(calc.globalDiscountMinor)}</dd></div>}
              {calc.taxes.filter((t) => t.taxMinor).map((t) => <div key={t.rateBp} className="flex justify-between"><dt className="text-soft">Impuesto {percentLabel(t.rateBp)}</dt><dd>{money(t.taxMinor)}</dd></div>)}
              {calc.chargesMinor > 0 && <div className="flex justify-between"><dt className="text-soft">Costos adicionales</dt><dd>{money(calc.chargesMinor)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-1 font-bold"><dt>Total</dt><dd data-total={calc.totalMinor}>{money(calc.totalMinor)}</dd></div>
            </dl>
          </Card>

          {textBlocks.length > 0 && (
            <Card className="space-y-3 p-4">
              <Eyebrow>Textos</Eyebrow>
              {textBlocks.map((b) => (
                <label key={b.id} className="block space-y-1 text-sm"><span className="font-semibold text-carbon">{b.label || BLOCKS[b.type]}</span>
                  <Textarea rows={2} value={form.content[b.type as keyof QuoteContent]} placeholder={b.text || 'Vacío: no aparece en el PDF'} onChange={(e) => update({ content: { ...form.content, [b.type]: e.target.value } })} /></label>
              ))}
            </Card>
          )}

          {quote.versions.length > 0 && (
            <Card className="space-y-2 p-4">
              <Eyebrow>Envíos</Eyebrow>
              <ul className="space-y-1 text-xs text-graphite">
                {quote.versions.map((v) => <li key={v.version}>Versión {v.version} · {v.channel === 'email' ? 'Email' : v.channel === 'whatsapp' ? 'WhatsApp' : 'Enlace'}{v.recipient ? ` · ${v.recipient}` : ''} · {new Date(v.createdAt).toLocaleString('es-CL')}</li>)}
              </ul>
            </Card>
          )}
        </fieldset>

        <div className="min-w-0 xl:sticky xl:top-0 xl:self-start">
          <p className="mb-2 text-xs text-soft">Vista previa: es el mismo diseño del PDF.</p>
          <QuotePreview pages={pages} logoUrl={logo?.dataUrl ?? null} />
        </div>
      </div>
    </div>
  );
}
