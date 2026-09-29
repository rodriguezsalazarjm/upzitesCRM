'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { currencyExponent } from '@/lib/billing/money';
import { cn } from '@/lib/utils';

/**
 * Formulario declarativo de Platform Admin. Envia JSON a una ruta de
 * `/api/platform/*` y:
 *  - agrega `idempotencyKey` (uno por formulario; se renueva tras un exito),
 *    asi un doble submit es UNA operacion en el servidor;
 *  - convierte montos en unidades mayores (49.990 / 49.99) a unidades menores;
 *  - si la respuesta trae `invitationUrl`, lo muestra UNA vez con "Copiar".
 */

export type Field = {
  name: string;
  label: string;
  type: 'text' | 'email' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'money';
  /** Ruta en el cuerpo JSON (p. ej. `payment.amountMinor`). Por defecto, `name`. */
  path?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | number | boolean;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  /** `money`: campo que tiene la moneda (por defecto `currency`). */
  currencyField?: string;
  /** Mostrar solo si otro campo vale alguno de estos valores. */
  showIf?: { field: string; in: string[] };
};

type Props = {
  endpoint: string;
  fields: Field[];
  submitLabel: string;
  /** Campos fijos del cuerpo (p. ej. `{ action: 'suspend' }`). */
  body?: Record<string, unknown>;
  idempotent?: boolean;
  confirm?: string;
  /** Tras el exito: ruta a abrir; `:workspaceId` se reemplaza con el de la respuesta. */
  redirectTo?: string;
  variant?: 'default' | 'outline' | 'destructive' | 'dark';
  compact?: boolean;
};

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] = (cursor[part] as Record<string, unknown>) ?? {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function ActionForm({ endpoint, fields, submitLabel, body, idempotent, confirm, redirectTo, variant = 'default', compact }: Props) {
  const router = useRouter();
  const initial = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === 'checkbox' ? false : '')])) as Record<string, string | boolean>,
    [fields],
  );
  const [values, setValues] = useState(initial);
  const [key, setKey] = useState(newKey);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const visible = (field: Field) => !field.showIf || field.showIf.in.includes(String(values[field.showIf.field] ?? ''));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    setPending(true);
    setError(null);
    setOk(null);
    const payload: Record<string, unknown> = { ...(body ?? {}) };
    if (idempotent) payload.idempotencyKey = key;
    for (const field of fields) {
      if (!visible(field)) continue;
      const raw = values[field.name];
      const path = field.path ?? field.name;
      if (field.type === 'checkbox') setPath(payload, path, Boolean(raw));
      else if (raw === '' || raw === undefined) continue;
      else if (field.type === 'number') setPath(payload, path, Number(raw));
      else if (field.type === 'money') {
        const currency = String(values[field.currencyField ?? 'currency'] ?? body?.currency ?? 'CLP');
        const exponent = currencyExponent(currency);
        // CLP (sin decimales): "49.990" = 49990. USD: "49.99" = 4999 centavos.
        const normalized = exponent === 0 ? String(raw).replace(/[.,\s]/g, '') : String(raw).replace(/,/g, '');
        const minor = Math.round(Number(normalized) * 10 ** exponent);
        setPath(payload, path, minor);
      } else if (field.type === 'date') setPath(payload, path, new Date(`${raw}T12:00:00`).toISOString());
      else setPath(payload, path, raw);
    }
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const json = (await response.json().catch(() => ({}))) as { message?: string; data?: Record<string, unknown>; code?: string };
    setPending(false);
    if (!response.ok) {
      setError(json.message ?? `No se pudo completar (${response.status}).`);
      return;
    }
    const data = json.data ?? {};
    if (typeof data.invitationUrl === 'string') {
      setLink(data.invitationUrl);
      setCopied(false);
    }
    setOk(data.alreadyProcessed ? 'Ya estaba registrado: no se duplico.' : data.emailSent ? 'Listo. Invitacion enviada por email.' : 'Listo.');
    setKey(newKey());
    setValues(initial);
    if (redirectTo && typeof data.workspaceId === 'string' && !data.invitationUrl) {
      router.push(redirectTo.replace(':workspaceId', data.workspaceId));
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className={cn('space-y-3', compact && 'space-y-2')}>
      <div className={cn('grid gap-3', !compact && 'sm:grid-cols-2')}>
        {fields.filter(visible).map((field) => (
          <label key={field.name} className={cn('block text-xs font-semibold text-graphite', (field.type === 'textarea' || field.type === 'checkbox') && 'sm:col-span-2')}>
            {field.type === 'checkbox' ? (
              <span className="flex items-center gap-2 font-medium text-carbon">
                <input
                  type="checkbox"
                  checked={Boolean(values[field.name])}
                  onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.checked }))}
                  className="h-4 w-4 accent-electric"
                />
                {field.label}
              </span>
            ) : (
              <>
                <span className="mb-1 block">{field.label}</span>
                {field.type === 'select' ? (
                  <select
                    value={String(values[field.name] ?? '')}
                    required={field.required}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-mist bg-paper px-3 text-sm text-carbon focus-visible:outline-2 focus-visible:outline-electric"
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    value={String(values[field.name] ?? '')}
                    required={field.required}
                    placeholder={field.placeholder}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    className="min-h-[72px] w-full rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-carbon focus-visible:outline-2 focus-visible:outline-electric"
                  />
                ) : (
                  <input
                    type={field.type === 'money' ? 'text' : field.type}
                    inputMode={field.type === 'money' || field.type === 'number' ? 'decimal' : undefined}
                    value={String(values[field.name] ?? '')}
                    required={field.required}
                    placeholder={field.placeholder}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-mist bg-paper px-3 text-sm text-carbon focus-visible:outline-2 focus-visible:outline-electric"
                  />
                )}
              </>
            )}
            {field.hint && <span className="mt-1 block font-normal text-soft">{field.hint}</span>}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size={compact ? 'sm' : 'default'} variant={variant} disabled={pending}>
          {pending ? 'Procesando…' : submitLabel}
        </Button>
        {error && (
          <span role="alert" className="text-xs font-medium text-danger-ink">
            {error}
          </span>
        )}
        {ok && !error && (
          <span role="status" className="text-xs font-medium text-success-ink">
            {ok}
          </span>
        )}
      </div>
      {link && (
        <div className="rounded-lg border border-line bg-ivory p-3 text-xs">
          <p className="mb-2 font-semibold text-carbon">Enlace de invitación (se muestra una sola vez; reenviar genera uno nuevo)</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-paper px-2 py-1.5 text-graphite">{link}</code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? 'Copiado' : 'Copiar enlace de invitación'}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
