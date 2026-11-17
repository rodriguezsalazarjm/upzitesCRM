'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Bot, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  ACTION_LABEL,
  DELAY_PRESETS,
  FOLLOW_UP_ACTIONS,
  FOLLOW_UP_TRIGGERS,
  MAX_STEPS,
  MESSAGE_VARIABLES,
  TRIGGER_HELP,
  TRIGGER_LABEL,
  TRIGGERS_WITHOUT_PRODUCT,
  renderMessage,
  stepScheduleLabel,
  strategyInputSchema,
  type FollowUpAction,
  type FollowUpTrigger,
} from '@/lib/followups/rules';

type StepDraft = {
  key: string;
  label: string;
  action: FollowUpAction;
  delayHours: number;
  messageMode: 'FIXED' | 'AI';
  body: string;
  aiGoal: string;
  whatsappTemplateId: string | null;
};

/** P26: plantilla elegible para los pasos de WhatsApp. `problem` = por que hoy no saldria. */
export type TemplateOption = { id: string; label: string; statusLabel: string; problem: string | null; usesProduct: boolean };

export type StrategyDraft = {
  name: string;
  description: string;
  trigger: FollowUpTrigger;
  productId: string | null;
  maxMessages: number;
  minGapHours: number;
  simulate: boolean;
  steps: Omit<StepDraft, 'key'>[];
};

let counter = 0;
const nextKey = () => `step-${(counter += 1)}`;

const BLANK_STEP: Omit<StepDraft, 'key'> = {
  label: 'Seguimiento',
  action: 'SEND_WHATSAPP',
  delayHours: 24,
  messageMode: 'FIXED',
  body: '',
  aiGoal: '',
  whatsappTemplateId: null,
};

export const DEFAULT_DRAFT: StrategyDraft = {
  name: '',
  description: '',
  trigger: 'INQUIRY_NO_PURCHASE',
  productId: null,
  maxMessages: 3,
  minGapHours: 12,
  simulate: true,
  steps: [
    { ...BLANK_STEP, label: 'Recordatorio', delayHours: 1, body: 'Hola {{nombre}}, ¿pudiste revisar lo que conversamos? Si te quedó alguna duda, la vemos por aquí.' },
    { ...BLANK_STEP, label: 'Resolver dudas', delayHours: 24, body: '¿Te ayudo con algo para decidir? Cuéntame y lo revisamos.' },
    { ...BLANK_STEP, label: 'Último contacto', delayHours: 72, body: 'Te escribo por última vez sobre esto. Si más adelante lo necesitas, aquí estamos.' },
  ],
};

/**
 * Configurador de una estrategia de seguimiento. Valida con el mismo esquema
 * que el servidor (que vuelve a validar): lo que se ve aqui es lo que se guarda.
 */
export function StrategyEditor({
  strategyId,
  initial,
  products,
  workspaceName,
  templates = [],
}: {
  strategyId?: string;
  initial: StrategyDraft;
  products: { id: string; name: string }[];
  workspaceName: string;
  templates?: TemplateOption[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => ({ ...initial, steps: initial.steps.map((step) => ({ ...step, key: nextKey() })) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const payload = useMemo(
    () => ({
      ...draft,
      steps: draft.steps.map((step) => ({ label: step.label, action: step.action, delayHours: step.delayHours, messageMode: step.messageMode, body: step.body, aiGoal: step.aiGoal, whatsappTemplateId: step.action === 'SEND_WHATSAPP' ? step.whatsappTemplateId : null })),
    }),
    [draft],
  );
  const parsed = useMemo(() => strategyInputSchema.safeParse(payload), [payload]);
  const issues = useMemo(() => {
    const map = new Map<string, string>();
    if (!parsed.success) for (const issue of parsed.error.issues) map.set(issue.path.join('.'), map.get(issue.path.join('.')) ?? issue.message);
    return map;
  }, [parsed]);
  const issue = (path: string) => (touched ? issues.get(path) ?? null : null);

  const productName = products.find((product) => product.id === draft.productId)?.name ?? null;
  const productAllowed = !TRIGGERS_WITHOUT_PRODUCT.includes(draft.trigger);

  function patch(update: Partial<Omit<StrategyDraft, 'steps'>>) {
    setDraft((current) => ({ ...current, ...update }));
  }
  function patchStep(key: string, update: Partial<StepDraft>) {
    setDraft((current) => ({ ...current, steps: current.steps.map((step) => (step.key === key ? { ...step, ...update } : step)) }));
  }
  function moveStep(index: number, offset: number) {
    setDraft((current) => {
      const steps = [...current.steps];
      const [item] = steps.splice(index, 1);
      steps.splice(index + offset, 0, item);
      return { ...current, steps };
    });
  }

  async function save() {
    setTouched(true);
    setError(null);
    if (!parsed.success) {
      setError('Revisa los campos marcados antes de guardar.');
      return;
    }
    setSaving(true);
    const response = await fetch(strategyId ? `/api/followups/${strategyId}` : '/api/followups', {
      method: strategyId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.message ?? 'No se pudo guardar la estrategia.');
      return;
    }
    router.push(`/recuperacion/${data.data.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <Eyebrow>Estrategia</Eyebrow>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Nombre" htmlFor="fu-name" required error={issue('name')}>
            <Input id="fu-name" value={draft.name} maxLength={80} onChange={(event) => patch({ name: event.target.value })} placeholder="Ej.: Consultó y no compró" />
          </FormField>
          <FormField label="Descripción" htmlFor="fu-description" error={issue('description')}>
            <Input id="fu-description" value={draft.description} maxLength={300} onChange={(event) => patch({ description: event.target.value })} placeholder="Para qué sirve (opcional)" />
          </FormField>
          <FormField label="¿Cuándo empieza?" htmlFor="fu-trigger" description={TRIGGER_HELP[draft.trigger]}>
            <Select
              id="fu-trigger"
              value={draft.trigger}
              onChange={(event) => {
                const trigger = event.target.value as FollowUpTrigger;
                patch({ trigger, productId: TRIGGERS_WITHOUT_PRODUCT.includes(trigger) ? null : draft.productId });
              }}
            >
              {FOLLOW_UP_TRIGGERS.map((trigger) => (
                <option key={trigger} value={trigger}>
                  {TRIGGER_LABEL[trigger]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Producto"
            htmlFor="fu-product"
            error={issue('productId')}
            description={productAllowed ? 'Solo aplica a conversaciones o pedidos de este producto. Su compra detiene la secuencia.' : 'Este disparador no se acota a un producto.'}
          >
            <Select id="fu-product" value={draft.productId ?? ''} disabled={!productAllowed} onChange={(event) => patch({ productId: event.target.value || null })}>
              <option value="">Cualquier producto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {draft.trigger === 'CHECKOUT_ABANDONED' && !draft.productId && (
          <p className="rounded-lg bg-ivory px-3 py-2 text-xs text-graphite">Sin producto, este disparador usa el segmento general de checkout abandonado.</p>
        )}
      </Card>

      <Card className="space-y-4 p-5">
        <Eyebrow>Límites</Eyebrow>
        <div className="grid gap-4 md:grid-cols-3">
          <FormField label="Máximo de mensajes" htmlFor="fu-max" error={issue('maxMessages')} description="Por contacto, en toda la secuencia.">
            <Input id="fu-max" type="number" min={1} max={10} value={draft.maxMessages} onChange={(event) => patch({ maxMessages: Number(event.target.value) })} />
          </FormField>
          <FormField label="Separación mínima (horas)" htmlFor="fu-gap" error={issue('minGapHours')} description="Entre dos mensajes al mismo contacto.">
            <Input id="fu-gap" type="number" min={0} max={720} step={0.5} value={draft.minGapHours} onChange={(event) => patch({ minGapHours: Number(event.target.value) })} />
          </FormField>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-carbon">Modo prueba</p>
            <div className="flex items-center gap-3">
              <Switch checked={draft.simulate} onCheckedChange={(simulate) => patch({ simulate })} aria-label="Modo prueba" />
              <span className="text-xs text-graphite">{draft.simulate ? 'No sale ningún mensaje: todo queda simulado.' : 'Envía mensajes reales al activarla.'}</span>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-soft">
          Siempre se detiene si el contacto responde, compra (pago confirmado, no pendiente), lo toma una persona o pide no recibir más mensajes. Respeta el horario de envío del workspace.
        </p>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Eyebrow>Pasos ({draft.steps.length})</Eyebrow>
          {issue('steps') && <p className="text-xs text-danger-ink">{issue('steps')}</p>}
        </div>

        {draft.steps.map((step, index) => {
          const isTask = step.action === 'CREATE_TASK';
          const preview = !isTask && step.messageMode === 'FIXED' && step.body ? renderMessage(step.body, { nombre: 'María', producto: productName ?? 'tu producto', negocio: workspaceName }) : null;
          return (
            <Card key={step.key} className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-carbon text-[11px] font-bold text-canvas">{index + 1}</span>
                <p className="min-w-0 flex-1 text-xs text-graphite">{stepScheduleLabel(index, step.delayHours, draft.trigger)}</p>
                <Button type="button" variant="ghost" size="icon" aria-label="Subir paso" disabled={index === 0} onClick={() => moveStep(index, -1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Bajar paso" disabled={index === draft.steps.length - 1} onClick={() => moveStep(index, 1)}>
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar paso"
                  disabled={draft.steps.length === 1}
                  onClick={() => setDraft((current) => ({ ...current, steps: current.steps.filter((row) => row.key !== step.key) }))}
                >
                  <Trash2 />
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField label="Nombre del paso" htmlFor={`${step.key}-label`} error={issue(`steps.${index}.label`)}>
                  <Input id={`${step.key}-label`} value={step.label} maxLength={80} onChange={(event) => patchStep(step.key, { label: event.target.value })} />
                </FormField>
                <FormField label="Canal o acción" htmlFor={`${step.key}-action`}>
                  <Select
                    id={`${step.key}-action`}
                    value={step.action}
                    onChange={(event) => {
                      const action = event.target.value as FollowUpAction;
                      patchStep(step.key, { action, messageMode: action === 'CREATE_TASK' ? 'FIXED' : step.messageMode });
                    }}
                  >
                    {FOLLOW_UP_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {ACTION_LABEL[action]}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Espera (horas)" htmlFor={`${step.key}-delay`} error={issue(`steps.${index}.delayHours`)} description={index === 0 ? 'Desde el hecho que la dispara.' : 'Desde el paso anterior.'}>
                  <div className="space-y-2">
                    <Input id={`${step.key}-delay`} type="number" min={0} max={720} step={0.25} value={step.delayHours} onChange={(event) => patchStep(step.key, { delayHours: Number(event.target.value) })} />
                    <div className="flex flex-wrap gap-1.5">
                      {DELAY_PRESETS.map((preset) => (
                        <button
                          key={preset.hours}
                          type="button"
                          onClick={() => patchStep(step.key, { delayHours: preset.hours })}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${step.delayHours === preset.hours ? 'border-electric bg-electric/10 text-info-ink' : 'border-mist text-graphite hover:border-carbon'}`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </FormField>
              </div>

              {!isTask && (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de mensaje">
                  {(['FIXED', 'AI'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={step.messageMode === mode}
                      onClick={() => patchStep(step.key, { messageMode: mode })}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${step.messageMode === mode ? 'border-carbon bg-carbon text-canvas' : 'border-mist text-graphite hover:border-carbon'}`}
                    >
                      {mode === 'AI' && <Bot className="h-3.5 w-3.5" />}
                      {mode === 'FIXED' ? 'Mensaje fijo' : 'Generado por IA'}
                    </button>
                  ))}
                </div>
              )}

              {!isTask && step.messageMode === 'AI' && (
                <FormField
                  label="Objetivo para la IA"
                  htmlFor={`${step.key}-goal`}
                  error={issue(`steps.${index}.aiGoal`)}
                  description="La IA solo usa lo configurado del negocio, el producto y la conversación. No inventa descuentos, garantías ni plazos."
                >
                  <Textarea id={`${step.key}-goal`} rows={2} maxLength={500} value={step.aiGoal} onChange={(event) => patchStep(step.key, { aiGoal: event.target.value })} placeholder="Ej.: recordar el beneficio principal y ofrecer resolver dudas" />
                </FormField>
              )}

              <FormField
                label={isTask ? 'Detalle de la tarea' : step.messageMode === 'AI' ? 'Texto de respaldo (si la IA no puede generar uno seguro)' : 'Mensaje'}
                htmlFor={`${step.key}-body`}
                error={issue(`steps.${index}.body`)}
              >
                <Textarea id={`${step.key}-body`} rows={3} maxLength={1000} value={step.body} onChange={(event) => patchStep(step.key, { body: event.target.value })} />
              </FormField>

              {!isTask && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-soft">
                  Variables:
                  {Object.entries(MESSAGE_VARIABLES).map(([name, help]) => (
                    <button key={name} type="button" title={help} onClick={() => patchStep(step.key, { body: `${step.body}{{${name}}}` })} className="rounded border border-mist px-1.5 py-0.5 font-mono text-graphite hover:border-carbon">
                      {`{{${name}}}`}
                    </button>
                  ))}
                </div>
              )}

              {preview && (
                <div className="rounded-xl bg-ivory p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-soft">Vista previa</p>
                  <p className="whitespace-pre-wrap text-sm text-carbon">{preview}</p>
                </div>
              )}
              {!isTask && step.action === 'SEND_WHATSAPP' && (() => {
                const chosen = templates.find((t) => t.id === step.whatsappTemplateId);
                const warning = chosen ? (chosen.problem ?? (chosen.usesProduct && !draft.productId ? 'usa {{producto}}: elige un producto para la estrategia' : null)) : null;
                return (
                  <FormField
                    label="Si la ventana de 24 h ya cerró"
                    htmlFor={`${step.key}-template`}
                    description="Dentro de las 24 h desde el último mensaje del contacto se envía el texto de arriba. Fuera de ellas WhatsApp solo admite una plantilla aprobada; sin ella el paso queda bloqueado."
                  >
                    <div className="space-y-1.5" data-template-picker>
                      <Select id={`${step.key}-template`} value={step.whatsappTemplateId ?? ''} onChange={(event) => patchStep(step.key, { whatsappTemplateId: event.target.value || null })}>
                        <option value="">Sin plantilla: bloquear el paso</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label} · {t.statusLabel}
                          </option>
                        ))}
                      </Select>
                      {warning && <p className="text-[11px] text-warning-ink" data-template-warning>Hoy no saldría: {warning}.</p>}
                      {templates.length === 0 && (
                        <p className="text-[11px] text-soft">
                          No hay plantillas. <a href="/canales/whatsapp/plantillas" className="font-semibold underline">Crea o sincroniza plantillas</a>.
                        </p>
                      )}
                    </div>
                  </FormField>
                );
              })()}
            </Card>
          );
        })}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={draft.steps.length >= MAX_STEPS}
          onClick={() => setDraft((current) => ({ ...current, steps: [...current.steps, { ...BLANK_STEP, key: nextKey() }] }))}
        >
          <Plus /> Agregar paso
        </Button>
      </div>

      {error && <p className="rounded-lg bg-tomato/12 px-3 py-2 text-xs text-danger-ink">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {draft.simulate ? <Badge variant="ai">Modo prueba</Badge> : <Badge variant="warning">Envíos reales</Badge>}
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : strategyId ? 'Guardar cambios' : 'Crear estrategia'}
        </Button>
      </div>
    </div>
  );
}
