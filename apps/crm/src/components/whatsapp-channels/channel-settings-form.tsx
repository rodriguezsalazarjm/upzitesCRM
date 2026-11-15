'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  AI_SCHEDULE_LABEL,
  NO_PRODUCT_LABEL,
  USAGE_LABEL,
  channelSettingsSchema,
  minuteToTime,
  timeToMinute,
  type ChannelSettingsInput,
} from '@/lib/whatsapp/channel-settings';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIMEZONES = ['America/Santiago', 'America/Bogota', 'America/Lima', 'America/Mexico_City', 'America/Caracas', 'America/Argentina/Buenos_Aires', 'America/New_York', 'Europe/Madrid', 'UTC'];

export type SettingsValues = Required<{ [K in keyof ChannelSettingsInput]-?: NonNullable<ChannelSettingsInput[K]> | null }>;
type Option = { id: string; name: string };

/** Configuracion por numero: identidad, contexto comercial y atencion. */
export function ChannelSettingsForm({
  channelId,
  initial,
  options,
  canManage,
}: {
  channelId: string;
  initial: SettingsValues;
  options: { agents: Option[]; products: Option[]; flows: Option[]; members: Option[] };
  canManage: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<SettingsValues>) => setState((current) => ({ ...current, ...patch }));
  const disabled = !canManage;
  const timezones = TIMEZONES.includes(state.attentionTimezone ?? '') ? TIMEZONES : [state.attentionTimezone ?? 'UTC', ...TIMEZONES];

  async function save() {
    setMessage(null);
    const parsed = channelSettingsSchema.safeParse(state);
    if (!parsed.success) return setMessage({ ok: false, text: parsed.error.issues[0]?.message ?? 'Revisa los datos.' });
    setSaving(true);
    const response = await fetch(`/api/integrations/whatsapp/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    setSaving(false);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage({ ok: false, text: data.message ?? 'No se pudo guardar.' });
    setMessage({ ok: true, text: 'Configuración guardada.' });
    router.refresh();
  }

  // Un default que ya no es elegible (despublicado, archivado) se muestra para
  // que el cliente vea por que no se usa, en vez de desaparecer en silencio.
  const withCurrent = (list: Option[], current: string | null, label: string) =>
    current && !list.some((item) => item.id === current) ? [{ id: current, name: `${label} (no disponible)` }, ...list] : list;

  return (
    <Card className="space-y-6 p-5">
      <section className="space-y-3">
        <Eyebrow>Identidad</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nombre interno" htmlFor="cs-label" description="Cómo lo verá tu equipo en el Inbox.">
            <Input id="cs-label" maxLength={60} disabled={disabled} value={state.label ?? ''} onChange={(event) => set({ label: event.target.value })} />
          </FormField>
          <FormField label="Tipo de uso" htmlFor="cs-usage">
            <Select id="cs-usage" disabled={disabled} value={state.usage ?? 'GENERAL'} onChange={(event) => set({ usage: event.target.value as SettingsValues['usage'] })}>
              {Object.entries(USAGE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormField>
        </div>
      </section>

      <section className="space-y-3">
        <Eyebrow>Contexto comercial</Eyebrow>
        <p className="text-[11px] text-soft">
          Se usa cuando un mensaje llega sin atribución comercial propia. Si la conversación ya tiene un producto, ese manda.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Agente IA" htmlFor="cs-agent" description="Sin elegir: el agente de ventas del workspace.">
            <Select id="cs-agent" disabled={disabled} value={state.defaultAgentId ?? ''} onChange={(event) => set({ defaultAgentId: event.target.value || null })}>
              <option value="">Agente de ventas (por defecto)</option>
              {withCurrent(options.agents, initial.defaultAgentId, 'Agente').map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Producto" htmlFor="cs-product">
            <Select id="cs-product" disabled={disabled} value={state.defaultProductId ?? ''} onChange={(event) => set({ defaultProductId: event.target.value || null })}>
              <option value="">Sin producto</option>
              {withCurrent(options.products, initial.defaultProductId, 'Producto').map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Automatización" htmlFor="cs-flow" description="Solo flujos publicados que se disparan con un mensaje recibido.">
            <Select id="cs-flow" disabled={disabled} value={state.defaultFlowId ?? ''} onChange={(event) => set({ defaultFlowId: event.target.value || null })}>
              <option value="">Ninguna</option>
              {withCurrent(options.flows, initial.defaultFlowId, 'Automatización').map((flow) => (
                <option key={flow.id} value={flow.id}>{flow.name}</option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label="Si la conversación no tiene producto" htmlFor="cs-no-product">
          <Select id="cs-no-product" disabled={disabled} value={state.noProductBehavior ?? 'AI_GENERAL'} onChange={(event) => set({ noProductBehavior: event.target.value as SettingsValues['noProductBehavior'] })}>
            {Object.entries(NO_PRODUCT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FormField>
      </section>

      <section className="space-y-3">
        <Eyebrow>Atención</Eyebrow>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-mist p-3">
          <div>
            <p id="cs-ai-label" className="text-sm font-semibold text-carbon">Atención automática con IA</p>
            <p className="text-[11px] text-soft">
              {state.aiEnabled ? 'Encendida: la IA responde según el horario elegido.' : 'Apagada: los mensajes quedan en el Inbox para tu equipo.'}
            </p>
          </div>
          <Switch aria-labelledby="cs-ai-label" disabled={disabled} checked={Boolean(state.aiEnabled)} onCheckedChange={(checked) => set({ aiEnabled: checked })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="La IA atiende" htmlFor="cs-schedule">
            <Select id="cs-schedule" disabled={disabled || !state.aiEnabled} value={state.aiSchedule ?? 'ALWAYS'} onChange={(event) => set({ aiSchedule: event.target.value as SettingsValues['aiSchedule'] })}>
              {Object.entries(AI_SCHEDULE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Fallback humano" htmlFor="cs-fallback" description="Quién recibe lo que la IA no atiende. Sin elegir: todo el equipo.">
            <Select id="cs-fallback" disabled={disabled} value={state.fallbackUserId ?? ''} onChange={(event) => set({ fallbackUserId: event.target.value || null })}>
              <option value="">Todo el equipo</option>
              {withCurrent(options.members, initial.fallbackUserId, 'Persona').map((member) => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Zona horaria" htmlFor="cs-tz">
            <Select id="cs-tz" disabled={disabled} value={state.attentionTimezone ?? 'America/Santiago'} onChange={(event) => set({ attentionTimezone: event.target.value })}>
              {timezones.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Horario de atención desde" htmlFor="cs-open">
            <Input id="cs-open" type="time" disabled={disabled} value={minuteToTime(state.attentionStartMinute ?? 540)} onChange={(event) => { const value = timeToMinute(event.target.value); if (value !== null) set({ attentionStartMinute: value }); }} />
          </FormField>
          <FormField label="Hasta" htmlFor="cs-close">
            <Input id="cs-close" type="time" disabled={disabled} value={minuteToTime(state.attentionEndMinute ?? 1140)} onChange={(event) => { const value = timeToMinute(event.target.value); if (value !== null) set({ attentionEndMinute: value }); }} />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Días de atención">
          {ORDER.map((day) => {
            const days = state.attentionDays ?? [];
            const on = days.includes(day);
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => set({ attentionDays: on ? days.filter((value) => value !== day) : [...days, day] })}
                className={`h-8 min-w-11 rounded-lg border px-2 text-xs font-semibold disabled:opacity-60 ${on ? 'border-carbon bg-carbon text-canvas' : 'border-mist text-graphite hover:border-carbon'}`}
              >
                {DAYS[day]}
              </button>
            );
          })}
          <span className="ml-1 text-[11px] text-soft">Se calcula en la zona elegida, con cambio de hora incluido.</span>
        </div>
      </section>

      {canManage && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {message && <span className={`text-xs ${message.ok ? 'text-success-ink' : 'text-danger-ink'}`} role={message.ok ? undefined : 'alert'}>{message.text}</span>}
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar configuración'}</Button>
        </div>
      )}
    </Card>
  );
}
