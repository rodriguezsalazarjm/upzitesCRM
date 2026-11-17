'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, Trash2 } from 'lucide-react';
import { QuotePreview } from '@/components/quote-studio/quote-preview';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { bpToPercent, calculateQuote, percentToBp, type QuoteLineInput } from '@/lib/quote-studio/calc';
import { layoutQuote } from '@/lib/quote-studio/layout';
import { BLOCKS, FONTS, TEXT_BLOCKS, formatQuoteNumber, type Block, type BlockType, type Brand, type QuoteContent } from '@/lib/quote-studio/schema';

type Settings = { brand: Brand; numberPrefix: string; includeYear: boolean; yearlyReset: boolean; numberPadding: number; currency: 'CLP' | 'USD'; taxRateBp: number; pricesIncludeTax: boolean; validityDays: number };
type Template = { id: string; name: string; blocks: Block[] };
type Logo = { dataUrl: string; width: number; height: number } | null;

const SAMPLE_LINES: QuoteLineInput[] = [
  { id: 's1', name: 'Servicio principal', description: 'Descripción breve del trabajo incluido.', quantity: 1, unit: 'servicio', unitPriceMinor: 350000, discountBp: 0, taxRateBp: null },
  { id: 's2', name: 'Material', description: '', quantity: 12.5, unit: 'm²', unitPriceMinor: 8900, discountBp: 1000, taxRateBp: null },
  { id: 's3', name: 'Visita técnica', description: '', quantity: 1, unit: 'visita', unitPriceMinor: 25000, discountBp: 0, taxRateBp: null },
];
const SAMPLE_CUSTOMER = { name: 'María González', company: 'Cliente de ejemplo SpA', email: 'maria@ejemplo.cl', phone: '+56 9 1234 5678', taxId: '76.123.456-7', address: 'Av. Siempre Viva 123, Santiago' };
const OPTIONS: { key: keyof Brand; label: string; values: Record<string, string> }[] = [
  { key: 'headingFont', label: 'Tipografía de títulos', values: FONTS },
  { key: 'bodyFont', label: 'Tipografía del texto', values: FONTS },
  { key: 'textSize', label: 'Tamaño del texto', values: { sm: 'Pequeño', md: 'Normal', lg: 'Grande' } },
  { key: 'spacing', label: 'Espaciado', values: { compact: 'Compacto', normal: 'Normal', airy: 'Amplio' } },
  { key: 'borders', label: 'Bordes', values: { none: 'Sin bordes', thin: 'Finos', thick: 'Gruesos' } },
  { key: 'tableStyle', label: 'Estilo de tabla', values: { striped: 'Filas alternas', lines: 'Líneas', boxed: 'Cuadrícula' } },
  { key: 'headerStyle', label: 'Encabezado', values: { band: 'Banda de color', line: 'Línea', minimal: 'Mínimo' } },
  { key: 'footerStyle', label: 'Footer', values: { line: 'Con línea', none: 'Sin línea' } },
];
const COMPANY: [keyof Brand, string][] = [['companyName', 'Nombre de la empresa'], ['taxId', 'RUT'], ['address', 'Dirección'], ['email', 'Email'], ['phone', 'Teléfono'], ['website', 'Sitio web']];
const isText = (type: BlockType) => (TEXT_BLOCKS as readonly string[]).includes(type);
const uid = () => Math.random().toString(36).slice(2, 10);

export function TemplateStudio({ settings: initialSettings, logo: initialLogo, templates, canManage }: { settings: Settings; logo: Logo; templates: Template[]; canManage: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<'blocks' | 'brand' | 'numbering'>('blocks');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const current = templates.find((t) => t.id === templateId) ?? templates[0];
  const [name, setName] = useState(current?.name ?? '');
  const [blocks, setBlocks] = useState<Block[]>(current?.blocks ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [logo, setLogo] = useState<Logo>(initialLogo);
  const [taxText, setTaxText] = useState(bpToPercent(initialSettings.taxRateBp));
  const [dirty, setDirty] = useState<{ template: boolean; settings: boolean }>({ template: false, settings: false });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const editBlocks = (next: Block[]) => { setBlocks(next); setDirty((d) => ({ ...d, template: true })); };
  const editBrand = (patch: Partial<Brand>) => { setSettings((s) => ({ ...s, brand: { ...s.brand, ...patch } })); setDirty((d) => ({ ...d, settings: true })); };
  const editSettings = (patch: Partial<Settings>) => { setSettings((s) => ({ ...s, ...patch })); setDirty((d) => ({ ...d, settings: true })); };

  function pickTemplate(id: string) {
    if (dirty.template && !confirm('Hay cambios sin guardar en esta plantilla. ¿Descartarlos?')) return;
    const t = templates.find((x) => x.id === id);
    setTemplateId(id); setName(t?.name ?? ''); setBlocks(t?.blocks ?? []); setSelected(null); setDirty((d) => ({ ...d, template: false }));
  }

  const year = new Date().getFullYear();
  const pages = useMemo(() => {
    const content = Object.fromEntries(TEXT_BLOCKS.map((k) => [k, blocks.find((b) => b.type === k)?.text ?? ''])) as QuoteContent;
    const calc = calculateQuote({ lines: SAMPLE_LINES, charges: [{ id: 'c1', label: 'Despacho', amountMinor: 15000, taxable: true }], globalDiscountBp: 500, defaultTaxRateBp: settings.taxRateBp, pricesIncludeTax: settings.pricesIncludeTax });
    return layoutQuote({
      brand: settings.brand, logo: logo ? { width: logo.width, height: logo.height } : null, blocks, number: formatQuoteNumber(settings, year, 1), version: 1,
      title: 'Propuesta de ejemplo', issuedAt: new Date().toISOString(), validUntil: new Date(Date.now() + settings.validityDays * 86_400_000).toISOString(), ownerName: 'Ejecutivo comercial',
      customer: SAMPLE_CUSTOMER, content, currency: settings.currency, pricesIncludeTax: settings.pricesIncludeTax, globalDiscountBp: 500, lines: SAMPLE_LINES,
      charges: [{ id: 'c1', label: 'Despacho', amountMinor: 15000, taxable: true }], calc, timeZone: 'America/Santiago',
    });
  }, [blocks, settings, logo, year]);

  async function call(url: string, method: string, body?: BodyInit, json = true) {
    setBusy(true); setError(''); setNotice('');
    const response = await fetch(url, { method, headers: json ? { 'Content-Type': 'application/json' } : undefined, body }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { data?: Record<string, unknown>; message?: string } | null;
    setBusy(false);
    if (!response?.ok) { setError(data?.message ?? 'No se pudo guardar.'); return null; }
    return data?.data ?? {};
  }

  async function saveAll() {
    if (dirty.settings) {
      const taxRateBp = percentToBp(taxText);
      if (taxRateBp === null) return setError('Impuesto por defecto inválido (0 a 100).');
      if (!(await call('/api/quote-studio/settings', 'PUT', JSON.stringify({ ...settings, taxRateBp })))) return;
    }
    if (dirty.template && current && !(await call(`/api/quote-studio/templates/${current.id}`, 'PATCH', JSON.stringify({ name, blocks })))) return;
    setDirty({ template: false, settings: false });
    setNotice('Guardado. Las cotizaciones ya enviadas no cambian: conservan su versión.');
    router.refresh();
  }

  async function templateAction(kind: 'new' | 'duplicate' | 'archive') {
    if (dirty.template && !confirm('Hay cambios sin guardar en esta plantilla. ¿Descartarlos?')) return;
    if (kind === 'archive') {
      if (!confirm(`¿Archivar “${current?.name}”? Las cotizaciones que la usan conservan su diseño.`)) return;
      if (await call(`/api/quote-studio/templates/${current?.id}`, 'DELETE')) { const next = templates.find((t) => t.id !== current?.id); if (next) pickTemplate(next.id); router.refresh(); }
      return;
    }
    const body = kind === 'duplicate' ? { duplicateOf: current?.id } : { name: 'Nueva plantilla', blocks: current?.blocks ?? [] };
    const created = (await call('/api/quote-studio/templates', 'POST', JSON.stringify(body))) as { id?: string; name?: string; blocks?: Block[] } | null;
    if (created?.id) { setTemplateId(created.id); setName(created.name ?? ''); setBlocks(created.blocks ?? []); setDirty((d) => ({ ...d, template: false })); router.refresh(); }
  }

  async function uploadLogo(file: File) {
    if (file.size > 500 * 1024) return setError('El logo pesa más de 500 KB.');
    const result = (await call('/api/quote-studio/settings/logo', 'PUT', file, false)) as Logo;
    if (result) { setLogo(result); setNotice('Logo actualizado.'); router.refresh(); }
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= blocks.length || from === to) return;
    const next = [...blocks]; const [item] = next.splice(from, 1); next.splice(to, 0, item); editBlocks(next);
  };
  const block = blocks.find((b) => b.id === selected) ?? null;
  const setBlock = (patch: Partial<Block>) => editBlocks(blocks.map((b) => (b.id === selected ? { ...b, ...patch } : b)));
  const used = new Set(blocks.map((b) => b.type));
  const anyDirty = dirty.template || dirty.settings;

  return (
    <div className="space-y-4" data-template-studio>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={templateId} onChange={(e) => pickTemplate(e.target.value)} wrapperClassName="w-auto min-w-48" aria-label="Plantilla" data-template-picker>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        {canManage && <>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void templateAction('new')}>Nueva</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void templateAction('duplicate')} data-template-duplicate>Duplicar</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy || templates.length <= 1} onClick={() => void templateAction('archive')}>Archivar</Button>
          <Button type="button" size="sm" className="ml-auto" disabled={busy || !anyDirty} onClick={() => void saveAll()} data-template-save>Guardar cambios</Button>
        </>}
        <Link href="/cotizaciones" className={`text-sm font-semibold text-electric hover:underline ${canManage ? '' : 'ml-auto'}`}>Volver</Link>
      </div>
      {!canManage && <p className="rounded-lg bg-ivory p-3 text-sm text-graphite">Solo el owner o un admin puede cambiar plantillas y marca. Puedes revisar cómo se ven.</p>}
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      {notice && <p role="status" className="text-sm text-graphite">{notice}</p>}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <fieldset disabled={!canManage} className="min-w-0 space-y-3">
          <Tabs ariaLabel="Secciones del editor" value={tab} onValueChange={(v) => setTab(v as typeof tab)} items={[{ value: 'blocks', label: 'Bloques' }, { value: 'brand', label: 'Marca' }, { value: 'numbering', label: 'Numeración' }]} />
          {tab === 'blocks' && (
            <Card className="space-y-3 p-3">
              <Input aria-label="Nombre de la plantilla" value={name} onChange={(e) => { setName(e.target.value); setDirty((d) => ({ ...d, template: true })); }} data-template-name />
              <ol className="space-y-1" data-block-list>
                {blocks.map((b, i) => (
                  <li key={b.id} draggable={canManage} onDragStart={() => setDragIndex(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); }}
                    className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs ${selected === b.id ? 'border-electric bg-electric/5' : 'border-line'} ${b.visible ? '' : 'opacity-50'}`} data-block={b.type}>
                    <GripVertical aria-hidden className="size-3.5 shrink-0 cursor-grab text-soft" />
                    <button type="button" className="min-w-0 flex-1 truncate text-left text-carbon" onClick={() => setSelected(b.id)}>{b.label || BLOCKS[b.type]}</button>
                    <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, i - 1)} className="p-0.5 disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                    <button type="button" aria-label="Bajar" disabled={i === blocks.length - 1} onClick={() => move(i, i + 1)} className="p-0.5 disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                    <button type="button" aria-label={b.visible ? 'Ocultar' : 'Mostrar'} onClick={() => editBlocks(blocks.map((x) => (x.id === b.id ? { ...x, visible: !x.visible } : x)))} className="p-0.5" data-block-toggle>{b.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}</button>
                    {isText(b.type) && <button type="button" aria-label="Duplicar bloque" onClick={() => { const next = [...blocks]; next.splice(i + 1, 0, { ...b, id: uid() }); editBlocks(next); }} className="p-0.5"><Copy className="size-3.5" /></button>}
                    <button type="button" aria-label="Quitar bloque" disabled={blocks.length <= 1} onClick={() => { editBlocks(blocks.filter((x) => x.id !== b.id)); if (selected === b.id) setSelected(null); }} className="p-0.5 disabled:opacity-30"><Trash2 className="size-3.5" /></button>
                  </li>
                ))}
              </ol>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-soft">Agregar bloque</p>
                <div className="flex flex-wrap gap-1" data-block-palette>
                  {(Object.keys(BLOCKS) as BlockType[]).filter((t) => isText(t) || !used.has(t)).map((t) => (
                    <button key={t} type="button" disabled={blocks.length >= 40} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-graphite hover:border-electric" onClick={() => { const id = used.has(t) ? uid() : t; editBlocks([...blocks, { id, type: t, visible: true, label: '', text: '', align: 'left' }]); setSelected(id); }} data-add-block={t}>+ {BLOCKS[t]}</button>
                  ))}
                </div>
              </div>
            </Card>
          )}
          {tab === 'brand' && (
            <Card className="space-y-3 p-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-carbon">Logo (PNG o JPG, máx. 500 KB)</p>
                {logo && <img src={logo.dataUrl} alt="Logo actual" className="max-h-12 max-w-full" />}
                <input type="file" accept="image/png,image/jpeg" aria-label="Subir logo" className="block w-full text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ''; }} data-logo-input />
                {logo && <Button type="button" size="sm" variant="ghost" onClick={async () => { if (await call('/api/quote-studio/settings/logo', 'DELETE')) { setLogo(null); router.refresh(); } }}>Quitar logo</Button>}
                <label className="block text-xs text-soft">Alto del logo: {settings.brand.logoHeight}px
                  <input type="range" min={24} max={96} value={settings.brand.logoHeight} onChange={(e) => editBrand({ logoHeight: Number(e.target.value) })} className="w-full" /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['primary', 'accent'] as const).map((key) => (
                  <label key={key} className="space-y-1 text-xs"><span className="font-semibold text-carbon">{key === 'primary' ? 'Color principal' : 'Color de acento'}</span>
                    <input type="color" value={settings.brand[key]} onChange={(e) => editBrand({ [key]: e.target.value })} className="h-8 w-full cursor-pointer rounded border border-line" data-brand-color={key} /></label>
                ))}
              </div>
              {OPTIONS.map((o) => (
                <label key={o.key} className="block space-y-1 text-xs"><span className="font-semibold text-carbon">{o.label}</span>
                  <Select density="sm" value={String(settings.brand[o.key])} onChange={(e) => editBrand({ [o.key]: e.target.value } as Partial<Brand>)} data-brand-option={o.key}>
                    {Object.entries(o.values).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select></label>
              ))}
              <p className="pt-1 text-xs font-semibold text-carbon">Datos de la empresa</p>
              {COMPANY.map(([key, label]) => <Input key={key} aria-label={label} placeholder={label} value={String(settings.brand[key])} onChange={(e) => editBrand({ [key]: e.target.value })} data-brand-field={key} />)}
            </Card>
          )}
          {tab === 'numbering' && (
            <Card className="space-y-3 p-3 text-sm">
              <label className="block space-y-1"><span className="font-semibold text-carbon">Prefijo</span>
                <Input value={settings.numberPrefix} maxLength={8} onChange={(e) => editSettings({ numberPrefix: e.target.value.toUpperCase() })} /></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.includeYear} onChange={(e) => editSettings({ includeYear: e.target.checked })} /> Incluir el año</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.yearlyReset} onChange={(e) => editSettings({ yearlyReset: e.target.checked })} /> Reiniciar el correlativo cada año</label>
              <label className="block space-y-1"><span className="font-semibold text-carbon">Dígitos del correlativo</span>
                <Select value={String(settings.numberPadding)} onChange={(e) => editSettings({ numberPadding: Number(e.target.value) })}>{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</Select></label>
              <p className="text-xs text-soft">Así se verá la próxima: <strong>{formatQuoteNumber(settings, year, 1)}</strong>. Los números ya usados nunca se repiten.</p>
              <label className="block space-y-1"><span className="font-semibold text-carbon">Moneda por defecto</span>
                <Select value={settings.currency} onChange={(e) => editSettings({ currency: e.target.value as 'CLP' | 'USD' })}><option value="CLP">CLP</option><option value="USD">USD</option></Select></label>
              <label className="block space-y-1"><span className="font-semibold text-carbon">Impuesto por defecto %</span>
                <Input inputMode="decimal" value={taxText} onChange={(e) => { setTaxText(e.target.value); setDirty((d) => ({ ...d, settings: true })); }} data-default-tax /></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.pricesIncludeTax} onChange={(e) => editSettings({ pricesIncludeTax: e.target.checked })} /> Los precios ya incluyen impuesto</label>
              <label className="block space-y-1"><span className="font-semibold text-carbon">Validez (días)</span>
                <Input type="number" min={1} max={365} value={settings.validityDays} onChange={(e) => editSettings({ validityDays: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} /></label>
            </Card>
          )}
        </fieldset>

        <div className="min-w-0">
          <p className="mb-2 text-xs text-soft">Vista previa con datos de ejemplo. Es el mismo diseño del PDF.</p>
          <QuotePreview pages={pages} logoUrl={logo?.dataUrl ?? null} />
        </div>

        <fieldset disabled={!canManage} className="min-w-0">
          <Card className="space-y-3 p-3 lg:sticky lg:top-0" data-block-properties>
            <Eyebrow>Propiedades del bloque</Eyebrow>
            {!block ? <p className="text-xs text-soft">Elige un bloque de la lista para cambiar su título, texto o alineación.</p> : <>
              <p className="text-sm font-semibold text-carbon">{BLOCKS[block.type]}</p>
              <label className="block space-y-1 text-xs"><span className="font-semibold text-carbon">Título visible</span>
                <Input value={block.label} maxLength={60} placeholder={BLOCKS[block.type]} onChange={(e) => setBlock({ label: e.target.value })} data-block-label /></label>
              {isText(block.type) && (
                <label className="block space-y-1 text-xs"><span className="font-semibold text-carbon">Texto por defecto</span>
                  <Textarea rows={5} maxLength={2000} value={block.text} onChange={(e) => setBlock({ text: e.target.value })} data-block-text />
                  <span className="text-soft">Cada cotización parte con este texto y se puede ajustar.</span></label>
              )}
              {isText(block.type) && (
                <label className="block space-y-1 text-xs"><span className="font-semibold text-carbon">Alineación</span>
                  <Select density="sm" value={block.align} onChange={(e) => setBlock({ align: e.target.value as Block['align'] })}><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></Select></label>
              )}
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={block.visible} onChange={(e) => setBlock({ visible: e.target.checked })} /> Visible</label>
            </>}
          </Card>
        </fieldset>
      </div>
    </div>
  );
}
