'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Clipboard, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

function InstallationCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function copy() {
    setError(false);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(true);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-carbon p-4 text-xs leading-5 text-canvas">
        <code>{code}</code>
      </pre>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Clipboard aria-hidden />}
          {copied ? 'Código copiado' : 'Copiar código'}
        </Button>
        {copied && (
          <span role="status" aria-live="polite" className="text-xs text-success-ink">
            Ya puedes pegarlo en tu sitio web.
          </span>
        )}
        {error && (
          <span role="alert" className="text-xs text-danger-ink">
            No pudimos copiarlo. Selecciona el código y cópialo manualmente.
          </span>
        )}
      </div>
    </div>
  );
}

function ConnectionOption({
  title,
  description,
  code,
  available = true,
}: {
  title: string;
  description: string;
  code: string;
  available?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4 sm:p-5">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ivory text-carbon">
          <Code2 className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-carbon">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-soft">{description}</p>
        </div>
      </div>
      {available ? (
        <details className="group mt-4">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded text-sm font-semibold text-electric outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric">
            Ver código de instalación
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <InstallationCode code={code} />
        </details>
      ) : (
        <p className="mt-4 text-sm text-soft">Primero crea y activa un formulario para obtener su código de instalación.</p>
      )}
    </div>
  );
}

/** P32: qué hace el CRM con cada consulta del formulario, y su id para conectarlo desde un servidor. */
function FormLeadSettings({ form, canEdit }: { form: { publicId: string; createsOpportunity: boolean }; canEdit: boolean }) {
  const router = useRouter();
  const labelId = useId();
  const [checked, setChecked] = useState(form.createsOpportunity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    setChecked(next);
    try {
      const response = await fetch('/api/forms/main', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ createsOpportunity: next }) });
      if (!response.ok) {
        setChecked(!next);
        setError(((await response.json().catch(() => ({}))) as { message?: string }).message ?? 'No pudimos guardar el cambio.');
        return;
      }
      router.refresh();
    } catch {
      setChecked(!next);
      setError('No pudimos conectar con el servidor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-paper p-4 sm:p-5 lg:col-span-2" data-form-lead-settings>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={labelId} className="text-sm font-semibold text-carbon">Abrir una oportunidad por cada consulta</h3>
          <p className="mt-1 text-sm leading-6 text-soft">Cada lead nuevo del formulario entra a la primera etapa del pipeline. Si ya tiene una oportunidad abierta, no se duplica.</p>
        </div>
        <Switch checked={checked} onCheckedChange={toggle} disabled={!canEdit || busy} aria-labelledby={labelId} />
      </div>
      {error && <p role="alert" className="text-xs text-danger-ink">{error}</p>}
      <p className="text-xs text-soft">
        Id del formulario (para conectar una web propia desde su servidor): <code className="break-all rounded bg-ivory px-1.5 py-0.5 text-carbon">{form.publicId}</code>
      </p>
    </div>
  );
}

export function WebsiteConnection({ snippet, formEmbed, hasForm, form, canEdit }: { snippet: string; formEmbed: string; hasForm: boolean; form: { publicId: string; createsOpportunity: boolean } | null; canEdit: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ConnectionOption
        title="Registrar visitas y consultas de mi web"
        description="Permite que el CRM reconozca visitas, clics de contacto y consultas que llegan desde tu sitio."
        code={snippet}
      />
      <ConnectionOption
        title="Agregar un formulario a mi web"
        description="Inserta tu formulario de contacto para que cada respuesta llegue directamente al CRM."
        code={formEmbed}
        available={hasForm}
      />
      {form && <FormLeadSettings form={form} canEdit={canEdit} />}
    </div>
  );
}
