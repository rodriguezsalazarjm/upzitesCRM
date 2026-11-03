'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIMEZONES = ['America/Santiago', 'America/Bogota', 'America/Lima', 'America/Mexico_City', 'America/Caracas', 'America/Argentina/Buenos_Aires', 'America/New_York', 'Europe/Madrid', 'UTC'];

const toTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const toMinute = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

export type SendHoursPolicy = {
  timezone: string;
  quietStartMinute: number;
  quietEndMinute: number;
  sendDays: number[];
  outOfHoursBehavior: 'POSTPONE' | 'SKIP';
  maxWhatsappPerDay: number;
  maxConsecutiveNoReply: number;
};

/**
 * Horario permitido del workspace. La politica guarda la ventana de SILENCIO
 * (inicio y fin); aqui se edita como horario de envio, que es como lo piensa
 * el negocio: "de 09:00 a 20:00" = silencio de 20:00 a 09:00.
 */
export function SendHoursCard({ policy, canManage }: { policy: SendHoursPolicy; canManage: boolean }) {
  const router = useRouter();
  const [state, setState] = useState({
    timezone: policy.timezone,
    open: toTime(policy.quietEndMinute),
    close: toTime(policy.quietStartMinute),
    sendDays: policy.sendDays.length ? policy.sendDays : [0, 1, 2, 3, 4, 5, 6],
    outOfHoursBehavior: policy.outOfHoursBehavior,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const timezones = TIMEZONES.includes(policy.timezone) ? TIMEZONES : [policy.timezone, ...TIMEZONES];

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await fetch('/api/messaging-policy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timezone: state.timezone,
        quietStartMinute: toMinute(state.close),
        quietEndMinute: toMinute(state.open),
        sendDays: state.sendDays,
        outOfHoursBehavior: state.outOfHoursBehavior,
      }),
    });
    setSaving(false);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage({ ok: false, text: data.message ?? 'No se pudo guardar el horario.' });
    setMessage({ ok: true, text: 'Horario guardado.' });
    router.refresh();
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow>Horario de envío</Eyebrow>
        <p className="text-[11px] text-soft">
          WhatsApp: hasta {policy.maxWhatsappPerDay} por día · tope de {policy.maxConsecutiveNoReply} seguimientos seguidos sin respuesta
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Zona horaria" htmlFor="sh-tz">
          <Select id="sh-tz" disabled={!canManage} value={state.timezone} onChange={(event) => setState({ ...state, timezone: event.target.value })}>
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Desde" htmlFor="sh-open">
          <Input id="sh-open" type="time" disabled={!canManage} value={state.open} onChange={(event) => setState({ ...state, open: event.target.value })} />
        </FormField>
        <FormField label="Hasta" htmlFor="sh-close">
          <Input id="sh-close" type="time" disabled={!canManage} value={state.close} onChange={(event) => setState({ ...state, close: event.target.value })} />
        </FormField>
        <FormField label="Si vence fuera de horario" htmlFor="sh-behavior">
          <Select id="sh-behavior" disabled={!canManage} value={state.outOfHoursBehavior} onChange={(event) => setState({ ...state, outOfHoursBehavior: event.target.value as 'POSTPONE' | 'SKIP' })}>
            <option value="POSTPONE">Esperar al próximo horario</option>
            <option value="SKIP">Omitir ese paso</option>
          </Select>
        </FormField>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Días permitidos">
        {ORDER.map((day) => {
          const on = state.sendDays.includes(day);
          return (
            <button
              key={day}
              type="button"
              disabled={!canManage}
              aria-pressed={on}
              onClick={() => {
                const next = on ? state.sendDays.filter((value) => value !== day) : [...state.sendDays, day];
                if (next.length) setState({ ...state, sendDays: next });
              }}
              className={`h-8 min-w-11 rounded-lg border px-2 text-xs font-semibold disabled:opacity-60 ${on ? 'border-carbon bg-carbon text-canvas' : 'border-mist text-graphite hover:border-carbon'}`}
            >
              {DAYS[day]}
            </button>
          );
        })}
        <span className="ml-1 text-[11px] text-soft">Cambio de horario (verano/invierno) incluido: se calcula en la zona elegida.</span>
      </div>
      {canManage && (
        <div className="flex items-center justify-end gap-3">
          {message && <span className={`text-xs ${message.ok ? 'text-success-ink' : 'text-danger-ink'}`}>{message.text}</span>}
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar horario'}
          </Button>
        </div>
      )}
    </Card>
  );
}
