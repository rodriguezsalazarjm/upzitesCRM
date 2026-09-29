'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Choice<T extends string> = { value: T; label: string; detail?: string };

const BUSINESS: Choice<'SERVICES' | 'ECOMMERCE' | 'APPOINTMENTS' | 'GENERAL'>[] = [
  { value: 'SERVICES', label: 'Servicios', detail: 'Cotizas, asesoras o haces proyectos.' },
  { value: 'ECOMMERCE', label: 'Ecommerce', detail: 'Vendes productos físicos o digitales.' },
  { value: 'APPOINTMENTS', label: 'Citas', detail: 'Atiendes con hora o reserva.' },
  { value: 'GENERAL', label: 'Otro', detail: 'Algo distinto o un poco de todo.' },
];
const SUBTYPES: Choice<'PHYSICAL_PRODUCTS' | 'INFOPRODUCT' | 'MIXED'>[] = [
  { value: 'PHYSICAL_PRODUCTS', label: 'Productos físicos' },
  { value: 'INFOPRODUCT', label: 'Productos digitales / infoproductos' },
  { value: 'MIXED', label: 'Ambos' },
];
const GOALS: Choice<'LEADS' | 'SALES' | 'CONVERSATIONS' | 'AUTOMATION' | 'RECOVERY' | 'OPERATIONS'>[] = [
  { value: 'LEADS', label: 'Conseguir clientes' },
  { value: 'SALES', label: 'Vender más' },
  { value: 'CONVERSATIONS', label: 'Centralizar conversaciones' },
  { value: 'AUTOMATION', label: 'Automatizar' },
  { value: 'RECOVERY', label: 'Recuperar ventas' },
  { value: 'OPERATIONS', label: 'Organizar la operación' },
];
const CHANNELS: Choice<'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'WEB' | 'ONLINE_STORE'>[] = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'MESSENGER', label: 'Facebook' },
  { value: 'WEB', label: 'Web' },
  { value: 'ONLINE_STORE', label: 'Tienda online' },
];
const TEAM: Choice<'SOLO' | 'SMALL' | 'MEDIUM' | 'LARGE'>[] = [
  { value: 'SOLO', label: 'Solo' },
  { value: 'SMALL', label: '2–5' },
  { value: 'MEDIUM', label: '6–20' },
  { value: 'LARGE', label: '20+' },
];

type Initial = {
  businessType: string | null;
  commerceSubtype: string | null;
  primaryGoal: string | null;
  preferredChannels: string[];
  teamSize: string | null;
};

function Options<T extends string>({
  name,
  legend,
  choices,
  selected,
  onToggle,
  multiple = false,
}: {
  name: string;
  legend: string;
  choices: Choice<T>[];
  selected: string[];
  onToggle: (value: T) => void;
  multiple?: boolean;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-base font-bold text-carbon">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {choices.map((choice) => {
          const checked = selected.includes(choice.value);
          return (
            <label
              key={choice.value}
              className={cn(
                'cursor-pointer rounded-xl border p-3 text-sm transition-colors',
                checked ? 'border-electric bg-electric/[0.06] ring-1 ring-electric' : 'border-mist bg-paper hover:border-stone',
              )}
            >
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={name}
                value={choice.value}
                checked={checked}
                onChange={() => onToggle(choice.value)}
                className="sr-only"
              />
              <span className="block font-semibold text-carbon">{choice.label}</span>
              {choice.detail && <span className="mt-0.5 block text-xs text-soft">{choice.detail}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Cinco preguntas; al guardar se aplica el preset recomendado. */
export function SetupForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [businessType, setBusinessType] = useState(initial.businessType);
  const [commerceSubtype, setCommerceSubtype] = useState(
    initial.commerceSubtype === 'GENERAL_COMMERCE' ? null : initial.commerceSubtype,
  );
  const [primaryGoal, setPrimaryGoal] = useState(initial.primaryGoal);
  const [channels, setChannels] = useState<string[]>(initial.preferredChannels);
  const [teamSize, setTeamSize] = useState(initial.teamSize);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isEcommerce = businessType === 'ECOMMERCE';
  const ready = Boolean(businessType && (!isEcommerce || commerceSubtype) && primaryGoal && teamSize);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) {
      setError('Responde las preguntas para continuar.');
      return;
    }
    setError(null);
    setPending(true);
    const response = await fetch('/api/workspace/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessType,
        commerceSubtype: isEcommerce ? commerceSubtype : null,
        primaryGoal,
        preferredChannels: channels,
        teamSize,
      }),
    });
    const json = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setPending(false);
      setError(json.message ?? 'No pudimos guardar. Intenta de nuevo.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <Options
        name="businessType"
        legend="1. ¿Qué tipo de negocio tienes?"
        choices={BUSINESS}
        selected={businessType ? [businessType] : []}
        onToggle={setBusinessType}
      />
      {isEcommerce && (
        <Options
          name="commerceSubtype"
          legend="2. ¿Qué vendes?"
          choices={SUBTYPES}
          selected={commerceSubtype ? [commerceSubtype] : []}
          onToggle={setCommerceSubtype}
        />
      )}
      <Options
        name="primaryGoal"
        legend={`${isEcommerce ? 3 : 2}. ¿Cuál es tu objetivo principal?`}
        choices={GOALS}
        selected={primaryGoal ? [primaryGoal] : []}
        onToggle={setPrimaryGoal}
      />
      <Options
        name="preferredChannels"
        legend={`${isEcommerce ? 4 : 3}. ¿Dónde hablas con tus clientes?`}
        choices={CHANNELS}
        selected={channels}
        multiple
        onToggle={(value) => setChannels((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))}
      />
      <Options
        name="teamSize"
        legend={`${isEcommerce ? 5 : 4}. ¿Trabajas solo o con equipo?`}
        choices={TEAM}
        selected={teamSize ? [teamSize] : []}
        onToggle={setTeamSize}
      />
      {error && (
        <p role="alert" className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar y adaptar mi CRM'}
      </Button>
    </form>
  );
}
