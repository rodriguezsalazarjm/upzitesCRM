'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, PowerOff, Send, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SaveBar, type SaveState } from '@/components/ui/save-bar';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { ToggleRow } from '@/components/ui/toggle-row';

const REFERENCE_NOTICE = 'Precio referencial sujeto a revisión y confirmación final.';

export type ServiceRuleSetView = {
  id: string;
  serviceKey: string;
  name: string;
  description: string | null;
  currency: string;
  intakeSchema: unknown;
  rules: unknown;
  disclaimer: string | null;
  validityDays: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  hasPublished?: boolean;
};

type EditorState = {
  id?: string;
  serviceKey?: string;
  name: string;
  description: string;
  pricingMode: 'FIXED' | 'PER_UNIT';
  basePrice: string;
  unitPrice: string;
  unitName: string;
  minimum: string;
  additional: string;
  rounding: string;
  reference: boolean;
  validityDays: string;
  advanced?: boolean;
  preservedIntake?: unknown;
  preservedRules?: unknown;
};

const emptyEditor: EditorState = {
  name: '',
  description: '',
  pricingMode: 'FIXED',
  basePrice: '',
  unitPrice: '',
  unitName: '',
  minimum: '',
  additional: '',
  rounding: '',
  reference: false,
  validityDays: '15',
};

function amount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function readSimpleService(service: ServiceRuleSetView): EditorState | null {
  const intake = service.intakeSchema as { fields?: Array<Record<string, unknown>> };
  const rules = service.rules as {
    components?: Array<Record<string, unknown>>;
    minimumClp?: number;
    roundToClp?: number;
  };
  if (!Array.isArray(intake?.fields) || !Array.isArray(rules?.components)) return null;

  const fixed = rules.components.find((item) => item.type === 'FIXED' && !item.when);
  const perUnit = rules.components.find(
    (item) => item.type === 'PER_UNIT' && item.quantityFrom === 'cantidad' && !item.when,
  );
  const surcharge = rules.components.find(
    (item) => item.type === 'SURCHARGE' && typeof item.amountClp === 'number' && !item.when,
  );
  const supported = rules.components.every(
    (item) => item === fixed || item === perUnit || item === surcharge,
  );
  if (!supported || (!fixed && !perUnit)) return null;

  const quantity = intake.fields.find((field) => field.key === 'cantidad');
  return {
    id: service.id,
    serviceKey: service.serviceKey,
    name: service.name,
    description: service.description ?? '',
    pricingMode: perUnit ? 'PER_UNIT' : 'FIXED',
    basePrice: fixed ? String(fixed.amountClp ?? '') : '',
    unitPrice: perUnit ? String(perUnit.unitPriceClp ?? '') : '',
    unitName: typeof quantity?.unit === 'string' ? quantity.unit : '',
    minimum: rules.minimumClp ? String(rules.minimumClp) : '',
    additional: surcharge ? String(surcharge.amountClp ?? '') : '',
    rounding: rules.roundToClp ? String(rules.roundToClp) : '',
    reference: Boolean(service.disclaimer),
    validityDays: String(service.validityDays),
  };
}

function readAdvancedService(service: ServiceRuleSetView): EditorState {
  return {
    ...emptyEditor,
    id: service.id,
    serviceKey: service.serviceKey,
    name: service.name,
    description: service.description ?? '',
    reference: Boolean(service.disclaimer),
    validityDays: String(service.validityDays),
    advanced: true,
    preservedIntake: service.intakeSchema,
    preservedRules: service.rules,
  };
}

function priceSummary(service: ServiceRuleSetView) {
  const rules = service.rules as {
    components?: Array<Record<string, unknown>>;
    minimumClp?: number;
  };
  const parts: string[] = [];
  for (const item of rules?.components ?? []) {
    if (item.type === 'FIXED' && typeof item.amountClp === 'number')
      parts.push(`Base $${item.amountClp.toLocaleString('es-CL')}`);
    if (item.type === 'PER_UNIT' && typeof item.unitPriceClp === 'number')
      parts.push(`$${item.unitPriceClp.toLocaleString('es-CL')} por unidad`);
    if (item.type === 'PER_AREA' && typeof item.unitPriceClp === 'number')
      parts.push(`$${item.unitPriceClp.toLocaleString('es-CL')} por área`);
    if (item.type === 'TIERED') parts.push('Precio por tramos');
    if (item.type === 'SURCHARGE') parts.push('Con adicionales');
    if (item.type === 'DISCOUNT') parts.push('Con descuento autorizado');
  }
  if (rules?.minimumClp) parts.push(`Mínimo $${rules.minimumClp.toLocaleString('es-CL')}`);
  return parts.join(' · ') || 'Revisa la configuración de precio';
}

async function request(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    data?: { id?: string };
  };
  if (!response.ok) throw new Error(body.message ?? 'No pudimos guardar el servicio.');
  return body;
}

export function ServicesPricing({
  services,
  canEdit,
  canPublish,
}: {
  services: ServiceRuleSetView[];
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  function change<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setEditor((current) => (current ? { ...current, [key]: value } : current));
    setNotice(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setNotice(null);
    if (!editor.name.trim())
      return setNotice({ kind: 'error', text: 'Escribe el nombre del servicio.' });
    if (!editor.advanced && editor.pricingMode === 'FIXED' && amount(editor.basePrice) <= 0)
      return setNotice({ kind: 'error', text: 'Ingresa un precio base mayor que cero.' });
    if (
      !editor.advanced &&
      editor.pricingMode === 'PER_UNIT' &&
      (!editor.unitName.trim() || amount(editor.unitPrice) <= 0)
    )
      return setNotice({
        kind: 'error',
        text: 'Indica la unidad y un precio por unidad mayor que cero.',
      });

    const components: Array<Record<string, unknown>> = [];
    if (amount(editor.basePrice) > 0)
      components.push({
        type: 'FIXED',
        key: 'base',
        label: 'Precio base',
        amountClp: amount(editor.basePrice),
      });
    if (editor.pricingMode === 'PER_UNIT')
      components.push({
        type: 'PER_UNIT',
        key: 'por-unidad',
        label: `Precio por ${editor.unitName.trim()}`,
        unitPriceClp: amount(editor.unitPrice),
        quantityFrom: 'cantidad',
      });
    if (amount(editor.additional) > 0)
      components.push({
        type: 'SURCHARGE',
        key: 'adicional',
        label: 'Adicional autorizado',
        amountClp: amount(editor.additional),
      });

    const fields: Array<Record<string, unknown>> = [
      {
        key: 'detalle',
        label: '¿Qué necesita el cliente?',
        type: 'text',
        required: true,
        help: 'Breve descripción del trabajo solicitado.',
      },
    ];
    if (editor.pricingMode === 'PER_UNIT')
      fields.push({
        key: 'cantidad',
        label: 'Cantidad',
        type: 'number',
        required: true,
        unit: editor.unitName.trim(),
        min: 0.01,
        help: `Cantidad de ${editor.unitName.trim()} que se cotizará.`,
      });

    setBusy(true);
    try {
      await request('/api/pricing-rule-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceKey: editor.serviceKey ?? slugify(editor.name),
          name: editor.name.trim(),
          description: editor.description.trim() || undefined,
          currency: 'CLP',
          intakeSchema: editor.advanced ? editor.preservedIntake : { fields },
          rules: editor.advanced
            ? editor.preservedRules
            : {
                components,
                ...(amount(editor.minimum) > 0 ? { minimumClp: amount(editor.minimum) } : {}),
                ...(amount(editor.rounding) > 0 ? { roundToClp: amount(editor.rounding) } : {}),
              },
          disclaimer: editor.reference ? REFERENCE_NOTICE : undefined,
          validityDays: Number(editor.validityDays),
        }),
      });
      setNotice({
        kind: 'success',
        text: canPublish
          ? 'Guardamos el borrador. Revísalo y publícalo para usar estos cambios al cotizar.'
          : 'Guardamos el borrador. La persona propietaria debe publicarlo para comenzar a cotizar.',
      });
      setEditor(null);
      router.refresh();
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No pudimos guardar el servicio.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function publish(service: ServiceRuleSetView) {
    setBusy(true);
    setNotice(null);
    try {
      await request(`/api/pricing-rule-sets/${service.id}/publish`, { method: 'POST' });
      setNotice({
        kind: 'success',
        text: 'El servicio quedó publicado y disponible para cotizar.',
      });
      router.refresh();
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No pudimos publicar el servicio.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function archive(service: ServiceRuleSetView) {
    setBusy(true);
    setNotice(null);
    try {
      await request(`/api/pricing-rule-sets/${service.id}/archive`, { method: 'POST' });
      setNotice({
        kind: 'success',
        text: 'El servicio se desactivó y ya no estará disponible para nuevas cotizaciones.',
      });
      if (editor?.serviceKey === service.serviceKey) setEditor(null);
      router.refresh();
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : 'No pudimos desactivar el servicio.',
      });
    } finally {
      setBusy(false);
    }
  }

  const editorSaveState: SaveState = busy ? 'saving' : notice?.kind === 'error' ? 'error' : 'dirty';

  return (
    <div id="servicios-precios" className="scroll-mt-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-carbon">Servicios y precios</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-soft">
            El cotizador calcula con estas reglas guardadas. La IA puede recopilar datos, pero no
            decide el precio ni envía una cotización sin aprobación humana.
          </p>
        </div>
        {canEdit && services.length > 0 && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditor({ ...emptyEditor });
              setNotice(null);
            }}
          >
            <Plus aria-hidden />
            Agregar servicio
          </Button>
        )}
      </div>

      {services.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Todavía no hay servicios disponibles para cotizar"
          description="Agrega un servicio, define cómo se calcula su precio y publícalo. Un borrador no completa la puesta en marcha."
          action={
            canEdit ? (
              <Button type="button" variant="outline" className="mt-2" onClick={() => setEditor({ ...emptyEditor })}>
                Agregar mi primer servicio
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {services.map((service) => {
            const simpleEditor = readSimpleService(service);
            const available = service.status === 'PUBLISHED' || service.hasPublished;
            return (
              <article key={service.serviceKey} className="rounded-xl border border-line bg-paper p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-carbon">{service.name}</h4>
                    <p className="mt-1 text-xs text-soft">{priceSummary(service)}</p>
                  </div>
                  <StatusBadge tone={available ? 'success' : 'warning'} className="shrink-0">
                    {available
                      ? service.status === 'DRAFT'
                        ? 'Disponible · cambios en borrador'
                        : 'Disponible'
                      : 'Borrador'}
                  </StatusBadge>
                </div>
                {service.description && <p className="mt-3 text-xs leading-5 text-soft">{service.description}</p>}
                {service.disclaimer && (
                  <p className="mt-2 text-xs font-medium text-info-ink">Precio identificado como referencial</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {canEdit && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setEditor(simpleEditor ?? readAdvancedService(service));
                        setNotice(null);
                      }}
                    >
                      <Pencil aria-hidden />
                      Editar
                    </Button>
                  )}
                  {canPublish && service.status === 'DRAFT' && (
                    <Button type="button" size="sm" disabled={busy} onClick={() => publish(service)}>
                      <Send aria-hidden />
                      Publicar cambios
                    </Button>
                  )}
                  {canPublish && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-danger-ink hover:bg-tomato/12"
                      disabled={busy}
                      onClick={() => archive(service)}
                    >
                      <PowerOff aria-hidden />
                      Desactivar
                    </Button>
                  )}
                </div>
                {canEdit && !simpleEditor && (
                  <p className="mt-3 text-xs text-warning-ink">
                    Este servicio usa reglas avanzadas. Aquí puedes editar su nombre, descripción,
                    vigencia y aviso referencial sin alterar el cálculo.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {editor && (
        <form onSubmit={save} className="space-y-5 rounded-xl border border-electric/25 bg-electric/[0.03] p-4 sm:p-5">
          <div>
            <h4 className="text-sm font-semibold text-carbon">{editor.id ? 'Editar servicio' : 'Nuevo servicio'}</h4>
            <p className="mt-1 text-xs text-soft">
              Al editar se crea una nueva versión; la publicada sigue vigente hasta guardar y publicar.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nombre del servicio" htmlFor="service-name">
              <Input value={editor.name} maxLength={120} onChange={(e) => change('name', e.target.value)} disabled={busy} />
            </FormField>
            <FormField label="Descripción breve" htmlFor="service-description">
              <Input value={editor.description} maxLength={1000} onChange={(e) => change('description', e.target.value)} disabled={busy} />
            </FormField>
          </div>
          {editor.advanced ? (
            <p className="rounded-lg bg-solar/20 p-3 text-xs leading-5 text-warning-ink">
              La regla de cálculo es avanzada y se conservará exactamente como está. Este formulario
              no añade ni elimina condiciones, tramos o descuentos.
            </p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-carbon">¿Cómo se calcula?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ['FIXED', 'Precio fijo'],
                    ['PER_UNIT', 'Precio por unidad'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={`cursor-pointer rounded-lg border p-3 text-sm ${editor.pricingMode === value ? 'border-electric bg-paper text-electric' : 'border-mist bg-paper text-graphite'}`}
                  >
                    <input className="mr-2" type="radio" checked={editor.pricingMode === value} onChange={() => change('pricingMode', value)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {!editor.advanced && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                label={editor.pricingMode === 'FIXED' ? 'Precio base' : 'Base inicial (opcional)'}
                htmlFor="service-base-price"
                description="Monto en pesos chilenos."
              >
                <Input type="number" min="0" step="1" value={editor.basePrice} onChange={(e) => change('basePrice', e.target.value)} disabled={busy} />
              </FormField>
              {editor.pricingMode === 'PER_UNIT' && (
                <>
                  <FormField label="Nombre de la unidad" htmlFor="service-unit-name" description="Ejemplo: hora, metro o persona.">
                    <Input value={editor.unitName} maxLength={40} onChange={(e) => change('unitName', e.target.value)} disabled={busy} />
                  </FormField>
                  <FormField label="Precio por unidad" htmlFor="service-unit-price">
                    <Input type="number" min="1" step="1" value={editor.unitPrice} onChange={(e) => change('unitPrice', e.target.value)} disabled={busy} />
                  </FormField>
                </>
              )}
              <FormField label="Cobro mínimo (opcional)" htmlFor="service-minimum" description="El total nunca quedará bajo este monto.">
                <Input type="number" min="0" step="1" value={editor.minimum} onChange={(e) => change('minimum', e.target.value)} disabled={busy} />
              </FormField>
              <FormField label="Adicional fijo (opcional)" htmlFor="service-additional" description="Se suma siempre al cálculo.">
                <Input type="number" min="0" step="1" value={editor.additional} onChange={(e) => change('additional', e.target.value)} disabled={busy} />
              </FormField>
              <FormField label="Redondear total" htmlFor="service-rounding">
                <Select value={editor.rounding} onChange={(e) => change('rounding', e.target.value)} disabled={busy}>
                  <option value="">Sin redondeo</option>
                  <option value="100">A $100</option>
                  <option value="1000">A $1.000</option>
                </Select>
              </FormField>
              <FormField label="Vigencia de la cotización" htmlFor="service-validity">
                <Select value={editor.validityDays} onChange={(e) => change('validityDays', e.target.value)} disabled={busy}>
                  <option value="7">7 días</option>
                  <option value="15">15 días</option>
                  <option value="30">30 días</option>
                  <option value="60">60 días</option>
                </Select>
              </FormField>
            </div>
          )}
          {editor.advanced && (
            <FormField label="Vigencia de la cotización" htmlFor="service-validity-advanced" className="max-w-xs">
              <Select value={editor.validityDays} onChange={(e) => change('validityDays', e.target.value)} disabled={busy}>
                <option value="7">7 días</option>
                <option value="15">15 días</option>
                <option value="30">30 días</option>
                <option value="60">60 días</option>
              </Select>
            </FormField>
          )}
          <ToggleRow
            id="service-reference"
            label="Mostrar este precio como referencial en la cotización"
            checked={editor.reference}
            onCheckedChange={(value) => change('reference', value)}
            disabled={busy}
          />
          <SaveBar
            state={editorSaveState}
            saveLabel="Guardar borrador"
            errorMessage={notice?.kind === 'error' ? notice.text : null}
            onCancel={() => setEditor(null)}
          />
        </form>
      )}

      {notice && !editor && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${notice.kind === 'error' ? 'bg-tomato/12 text-danger-ink' : 'bg-lime/25 text-success-ink'}`}
        >
          {notice.text}
        </p>
      )}
      <p className="flex items-start gap-2 rounded-lg bg-ivory p-3 text-xs leading-5 text-soft">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-graphite" aria-hidden />
        Cada cotización calculada queda esperando revisión. Solo una persona autorizada puede
        aprobarla y recién entonces puede enviarse al cliente.
      </p>
    </div>
  );
}
