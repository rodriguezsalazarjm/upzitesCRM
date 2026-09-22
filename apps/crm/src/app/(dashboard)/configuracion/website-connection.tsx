'use client';

import { useState } from 'react';
import { Check, ChevronDown, Clipboard, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

export function WebsiteConnection({ snippet, formEmbed, hasForm }: { snippet: string; formEmbed: string; hasForm: boolean }) {
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
    </div>
  );
}
