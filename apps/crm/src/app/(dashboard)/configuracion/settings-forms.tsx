'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BusinessType,
  type BusinessType as BusinessTypeValue,
} from '../../../../generated/prisma/browser';
import { FormField, FormSection } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SaveBar, type SaveState } from '@/components/ui/save-bar';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const INDUSTRIES = [
  ['MARKETING_DESIGN_DEVELOPMENT', 'Agencia de marketing, diseño o desarrollo'],
  ['HOME_SERVICES_INSTALLATIONS', 'Servicios para el hogar e instalaciones'],
  ['TECHNOLOGY_STORE', 'Tienda de tecnología'],
  ['FASHION_ACCESSORIES', 'Moda y accesorios'],
  ['BEAUTY_PERSONAL_CARE', 'Belleza y cuidado personal'],
  ['EDUCATION_TRAINING', 'Educación y formación'],
  ['CONSULTING_PROFESSIONAL_SERVICES', 'Consultoría y servicios profesionales'],
  ['FOOD_BEVERAGES', 'Alimentos y bebidas'],
  ['HEALTH_WELLNESS', 'Salud y bienestar'],
  ['REAL_ESTATE', 'Inmobiliaria'],
  ['TOURISM_EXPERIENCES', 'Turismo y experiencias'],
  ['OTHER', 'Otro'],
] as const;

const SALE_MODES = [
  {
    value: BusinessType.SERVICES,
    label: 'Servicios y cotizaciones',
    detail: 'Por ejemplo, una instalación, asesoría o proyecto que se cotiza antes de comenzar.',
  },
  {
    value: BusinessType.ECOMMERCE,
    label: 'Productos físicos / tienda online',
    detail: 'Por ejemplo, productos con inventario, pedidos y despacho.',
  },
  {
    value: BusinessType.INFOPRODUCT,
    label: 'Productos digitales',
    detail: 'Por ejemplo, un curso, guía o archivo que se entrega después del pago.',
  },
] as const;

const DAYS = [
  [1, 'Lun'],
  [2, 'Mar'],
  [3, 'Mié'],
  [4, 'Jue'],
  [5, 'Vie'],
  [6, 'Sáb'],
  [7, 'Dom'],
] as const;

const TIMEZONES = [
  ['America/Santiago', 'Chile continental'],
  ['America/Punta_Arenas', 'Región de Magallanes'],
  ['Pacific/Easter', 'Isla de Pascua'],
  ['America/Bogota', 'Colombia'],
  ['America/Lima', 'Perú'],
  ['America/Mexico_City', 'Ciudad de México'],
  ['America/Argentina/Buenos_Aires', 'Argentina'],
  ['Europe/Madrid', 'España'],
] as const;

type Notice = { kind: 'error' | 'success'; message: string } | null;

type ProfileValues = {
  businessName: string;
  businessType: BusinessTypeValue;
  industry: string | null;
  industryOther: string | null;
  businessStartMinute: number;
  businessEndMinute: number;
  businessDays: number[];
  about: string | null;
  policies: string | null;
  shippingInfo: string | null;
  returnsPolicy: string | null;
};

async function saveProfile(payload: Record<string, unknown>) {
  const response = await fetch('/api/onboarding/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? 'No pudimos guardar los cambios.');
}

/** Traduce (busy, dirty, notice) al estado único que entiende SaveBar. */
function saveState(busy: boolean, dirty: boolean, notice: Notice): SaveState {
  if (busy) return 'saving';
  if (notice?.kind === 'error') return 'error';
  if (notice?.kind === 'success') return 'saved';
  if (dirty) return 'dirty';
  return 'idle';
}

function ReadOnlyMessage() {
  return (
    <p className="text-sm text-soft">
      Puedes revisar esta información. Para editarla, solicita ayuda a una persona administradora del CRM.
    </p>
  );
}

export function BusinessSettingsForm({
  initial,
  canEdit,
}: {
  initial: ProfileValues;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(initial.businessName);
  const [industry, setIndustry] = useState(initial.industry ?? '');
  const [industryOther, setIndustryOther] = useState(initial.industryOther ?? '');
  const [businessType, setBusinessType] = useState<BusinessTypeValue>(initial.businessType);
  const [saved, setSaved] = useState({
    businessName: initial.businessName,
    industry: initial.industry ?? '',
    industryOther: initial.industryOther ?? '',
    businessType: initial.businessType,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const current = { businessName, industry, industryOther, businessType };
  const dirty = JSON.stringify(current) !== JSON.stringify(saved);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!businessName.trim()) return setNotice({ kind: 'error', message: 'Escribe el nombre de tu negocio.' });
    if (!industry) return setNotice({ kind: 'error', message: 'Selecciona el rubro de tu negocio.' });
    if (industry === 'OTHER' && industryOther.trim().length < 2) {
      return setNotice({ kind: 'error', message: 'Escribe el rubro de tu negocio.' });
    }
    if (businessType === BusinessType.UNDEFINED) {
      return setNotice({ kind: 'error', message: 'Selecciona cómo vendes principalmente.' });
    }

    setBusy(true);
    try {
      await saveProfile({
        businessName: businessName.trim(),
        industry,
        industryOther: industry === 'OTHER' ? industryOther.trim() : null,
        businessType,
      });
      const persisted = {
        businessName: businessName.trim(),
        industry,
        industryOther: industry === 'OTHER' ? industryOther.trim() : '',
        businessType,
      };
      setBusinessName(persisted.businessName);
      setIndustryOther(persisted.industryOther);
      setSaved(persisted);
      setNotice({ kind: 'success', message: 'Tus cambios se guardaron' });
      router.refresh();
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'No pudimos guardar los cambios.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <FormField label="Nombre del negocio" htmlFor="business-name">
        <Input
          value={businessName}
          maxLength={120}
          disabled={!canEdit || busy}
          onChange={(event) => {
            setBusinessName(event.target.value);
            setNotice(null);
          }}
        />
      </FormField>

      <FormField
        label="Rubro del negocio"
        htmlFor="industry"
        description="Elige la opción que mejor describe lo que haces. Esto no cambia las funciones del CRM."
      >
        <Select
          value={industry}
          disabled={!canEdit || busy}
          onChange={(event) => {
            setIndustry(event.target.value);
            setNotice(null);
          }}
        >
          <option value="">Selecciona un rubro</option>
          {INDUSTRIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FormField>

      {industry === 'OTHER' && (
        <FormField label="¿Cuál es tu rubro?" htmlFor="industry-other">
          <Input
            value={industryOther}
            maxLength={120}
            disabled={!canEdit || busy}
            onChange={(event) => {
              setIndustryOther(event.target.value);
              setNotice(null);
            }}
          />
        </FormField>
      )}

      <FormSection
        legend="Modalidad de venta"
        description="Elige la forma principal en que vendes. Esta opción define los pasos comerciales de la puesta en marcha."
      >
        <div id="modalidad-venta" className="scroll-mt-24 grid gap-3 lg:grid-cols-3">
          {SALE_MODES.map((mode) => (
            <label
              key={mode.value}
              className={cn(
                'cursor-pointer rounded-xl border p-4 transition-colors',
                businessType === mode.value
                  ? 'border-electric bg-electric/[0.06] ring-1 ring-electric'
                  : 'border-mist bg-paper hover:border-stone',
                !canEdit && 'cursor-not-allowed opacity-70',
              )}
            >
              <input
                type="radio"
                name="businessType"
                value={mode.value}
                checked={businessType === mode.value}
                disabled={!canEdit || busy}
                onChange={() => {
                  setBusinessType(mode.value);
                  setNotice(null);
                }}
                className="sr-only"
              />
              <span className="block text-sm font-semibold text-carbon">{mode.label}</span>
              <span className="mt-1 block text-xs leading-5 text-soft">{mode.detail}</span>
            </label>
          ))}
        </div>
      </FormSection>

      {canEdit ? (
        <SaveBar
          state={saveState(busy, dirty, notice)}
          saveLabel="Guardar mi negocio"
          errorMessage={notice?.kind === 'error' ? notice.message : null}
        />
      ) : (
        <ReadOnlyMessage />
      )}
    </form>
  );
}

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function HoursSettingsForm({ initial, timezone, canEdit }: { initial: ProfileValues; timezone: string; canEdit: boolean }) {
  const router = useRouter();
  const initialState = useMemo(
    () => ({
      days: [...initial.businessDays].sort(),
      start: toTime(initial.businessStartMinute),
      end: toTime(initial.businessEndMinute),
      timezone,
    }),
    [initial.businessDays, initial.businessEndMinute, initial.businessStartMinute, timezone],
  );
  const [days, setDays] = useState(initialState.days);
  const [start, setStart] = useState(initialState.start);
  const [end, setEnd] = useState(initialState.end);
  const [zone, setZone] = useState(initialState.timezone);
  const [saved, setSaved] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const current = { days: [...days].sort(), start, end, timezone: zone };
  const dirty = JSON.stringify(current) !== JSON.stringify(saved);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (days.length === 0) return setNotice({ kind: 'error', message: 'Selecciona al menos un día de atención.' });
    if (toMinutes(start) >= toMinutes(end)) return setNotice({ kind: 'error', message: 'La hora de inicio debe ser anterior a la hora de cierre.' });
    setBusy(true);
    try {
      await saveProfile({ businessDays: [...days].sort(), businessStartMinute: toMinutes(start), businessEndMinute: toMinutes(end), timezone: zone });
      setSaved(current);
      setNotice({ kind: 'success', message: 'Tus cambios se guardaron' });
      router.refresh();
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'No pudimos guardar los horarios.' });
    } finally {
      setBusy(false);
    }
  }

  const zones = TIMEZONES.some(([value]) => value === zone) ? TIMEZONES : [[zone, zone] as const, ...TIMEZONES];
  return (
    <form onSubmit={submit} className="space-y-6">
      <FormSection legend="Días de atención">
        <div className="flex flex-wrap gap-2">
          {DAYS.map(([value, label]) => (
            <label
              key={value}
              className={cn(
                'flex h-10 min-w-12 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors',
                days.includes(value) ? 'border-electric bg-electric/[0.06] text-electric' : 'border-mist bg-paper text-graphite',
                !canEdit && 'cursor-not-allowed opacity-70',
              )}
            >
              <input
                type="checkbox"
                checked={days.includes(value)}
                disabled={!canEdit || busy}
                onChange={() => {
                  setDays((currentDays) => (currentDays.includes(value) ? currentDays.filter((day) => day !== value) : [...currentDays, value]));
                  setNotice(null);
                }}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </FormSection>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Desde" htmlFor="opening-time">
          <Input type="time" value={start} disabled={!canEdit || busy} onChange={(event) => { setStart(event.target.value); setNotice(null); }} />
        </FormField>
        <FormField label="Hasta" htmlFor="closing-time">
          <Input type="time" value={end} disabled={!canEdit || busy} onChange={(event) => { setEnd(event.target.value); setNotice(null); }} />
        </FormField>
      </div>
      <FormField
        label="Zona horaria"
        htmlFor="timezone"
        description="Se usa para interpretar estos horarios y evitar contactos fuera de hora."
      >
        <Select value={zone} disabled={!canEdit || busy} onChange={(event) => { setZone(event.target.value); setNotice(null); }}>
          {zones.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FormField>
      {canEdit ? (
        <SaveBar
          state={saveState(busy, dirty, notice)}
          saveLabel="Guardar horarios"
          errorMessage={notice?.kind === 'error' ? notice.message : null}
        />
      ) : (
        <ReadOnlyMessage />
      )}
    </form>
  );
}

export function InformationSettingsForm({ initial, canEdit }: { initial: ProfileValues; canEdit: boolean }) {
  const router = useRouter();
  const initialState = { about: initial.about ?? '', policies: initial.policies ?? '', shippingInfo: initial.shippingInfo ?? '', returnsPolicy: initial.returnsPolicy ?? '' };
  const [values, setValues] = useState(initialState);
  const [saved, setSaved] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  function field(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setNotice(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      await saveProfile(values);
      setSaved(values);
      setNotice({ kind: 'success', message: 'Tus cambios se guardaron' });
      router.refresh();
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'No pudimos guardar la información.' });
    } finally {
      setBusy(false);
    }
  }
  const fields: { name: keyof typeof values; label: string; help: string; placeholder: string }[] = [
    { name: 'about', label: 'Sobre el negocio', help: 'Describe qué ofreces y a quién ayudas.', placeholder: 'Ejemplo: Instalamos y mantenemos sistemas de seguridad para hogares y empresas.' },
    { name: 'policies', label: 'Condiciones de atención y venta', help: 'Incluye condiciones de pago, garantías o aspectos que tus clientes deben conocer.', placeholder: 'Escribe aquí tus condiciones generales.' },
    { name: 'shippingInfo', label: 'Despachos o entrega', help: 'Completa este campo solo si entregas o despachas productos.', placeholder: 'Zonas, plazos y costos de entrega.' },
    { name: 'returnsPolicy', label: 'Cambios y devoluciones', help: 'Explica en qué casos aceptas cambios o devoluciones.', placeholder: 'Plazos y condiciones para solicitar un cambio.' },
  ];
  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        {fields.map((item) => (
          <FormField key={item.name} label={item.label} htmlFor={item.name} description={item.help}>
            <Textarea
              value={values[item.name]}
              maxLength={4000}
              rows={5}
              placeholder={item.placeholder}
              disabled={!canEdit || busy}
              onChange={(event) => field(item.name, event.target.value)}
            />
          </FormField>
        ))}
      </div>
      {canEdit ? (
        <SaveBar
          state={saveState(busy, dirty, notice)}
          saveLabel="Guardar información"
          errorMessage={notice?.kind === 'error' ? notice.message : null}
        />
      ) : (
        <ReadOnlyMessage />
      )}
    </form>
  );
}

export type { ProfileValues };
