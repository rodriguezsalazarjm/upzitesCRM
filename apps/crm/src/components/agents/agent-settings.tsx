'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SettingsCard } from '@/components/ui/settings-card';
import { Textarea } from '@/components/ui/textarea';
import { ToggleRow } from '@/components/ui/toggle-row';

type Version = {
  id: string;
  version: number;
  status: string;
  instructions: string;
  allowedTools: string[];
  options: unknown;
  maxSteps: number;
};

const defaultProfile: Record<string, string> = {
  role: 'Asistente del negocio',
  business: '',
  tone: 'Cercano y claro',
  language: 'Español',
  objective: 'Ayudar con información verificada del negocio',
  sales: 'Consultar catálogo. Confirmar producto y precio antes de crear checkout.',
  escalation: 'Derivar cuando el cliente lo pida o falte información.',
  forbidden: 'No inventar precios, políticas ni información de otros negocios.',
};

const labels: Record<string, string> = {
  role: 'Rol',
  business: 'Descripción del negocio',
  tone: 'Tono',
  language: 'Idioma',
  objective: 'Objetivo principal',
  sales: 'Instrucciones de venta',
  escalation: 'Escalamiento',
  forbidden: 'Comportamientos prohibidos',
};

export function AgentSettings({
  agent,
  tools,
  canManage,
  canPublish,
  demo,
}: {
  agent: { id: string; name: string; isActive: boolean; versions: Version[] } | null;
  tools: string[];
  canManage: boolean;
  canPublish: boolean;
  demo: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(agent?.name ?? 'Agente del negocio');
  const [active, setActive] = useState(agent?.isActive ?? true);
  const [profile, setProfile] = useState({
    ...defaultProfile,
    ...(agent?.versions[0]?.options as { profile?: Record<string, string> } | null)?.profile,
  });
  const [allowedTools, setTools] = useState(agent?.versions[0]?.allowedTools ?? tools);
  const [selected, setSelected] = useState(agent?.versions[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [question, setQuestion] = useState('¿Qué productos y servicios ofrecen?');
  const [reply, setReply] = useState('');
  const [calls, setCalls] = useState<unknown>([]);
  const [busy, setBusy] = useState(false);

  async function send(action: 'save' | 'test' | 'publish') {
    setBusy(true);
    setMessage('');
    try {
      const url = action === 'save' ? '/api/agent-settings' : `/api/agents/${agent?.id}/${action}`;
      const payload =
        action === 'save'
          ? { name, active, profile, allowedTools, maxSteps: 8 }
          : { versionId: selected, ...(action === 'test' ? { message: question } : {}) };
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      if (action === 'test') {
        setReply(result.data.reply ?? result.data.note ?? result.data.status);
        setCalls(result.data.toolCalls);
      } else {
        if (action === 'save') setSelected(result.data.versionId);
        setMessage(action === 'save' ? 'Nuevo borrador guardado. Selecciónalo para probar.' : 'Agente publicado.');
        router.refresh();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsCard title="Configuración del agente" description="Rol, tono y límites de lo que puede hacer.">
          <div className="space-y-5">
            <FormField label="Nombre" htmlFor="agent-name">
              <Input disabled={!canManage} value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <ToggleRow id="agent-active" label="Activo" checked={active} onCheckedChange={setActive} disabled={!canManage} />
            {Object.keys(defaultProfile).map((key) => (
              <FormField key={key} label={labels[key]} htmlFor={`agent-${key}`}>
                <Textarea
                  disabled={!canManage}
                  rows={key === 'sales' || key === 'forbidden' ? 3 : 2}
                  value={profile[key]}
                  onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                />
              </FormField>
            ))}
            <details className="group">
              <summary className="cursor-pointer list-none text-sm font-semibold text-carbon outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric">
                Herramientas autorizadas
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {tools.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-xs text-graphite">
                    <input
                      disabled={!canManage}
                      type="checkbox"
                      checked={allowedTools.includes(t)}
                      onChange={(e) => setTools(e.target.checked ? [...allowedTools, t] : allowedTools.filter((v) => v !== t))}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </details>
            <Button disabled={busy || !canManage} onClick={() => send('save')}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Guardar nuevo Draft
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard title="Probar agente" description="Verifica una versión antes de publicarla.">
          <div className="space-y-5">
            <p className="text-sm text-soft">
              {demo ? 'Proveedor fake local. Consulta datos reales del workspace de pruebas.' : 'Sandbox del agente.'}{' '}
              No envía mensajes sociales. Las herramientas con efectos se simulan.
            </p>
            <FormField label="Versión a probar" htmlFor="agent-version">
              <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Seleccionar</option>
                {agent?.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version} · {v.status}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Mensaje de prueba" htmlFor="agent-question">
              <Textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
            </FormField>
            <Button variant="outline" disabled={busy || !selected || !canManage} onClick={() => send('test')}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Probar versión seleccionada
            </Button>
            {reply && (
              <div role="status" className="whitespace-pre-wrap break-words rounded-xl bg-ivory p-4 text-sm text-carbon">
                {reply}
              </div>
            )}
            <details>
              <summary className="cursor-pointer list-none text-sm font-semibold text-carbon outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric">
                Panel técnico · tool calls
              </summary>
              <pre className="mt-2 overflow-auto rounded-lg bg-ivory p-3 text-xs text-graphite">
                {JSON.stringify(calls, null, 2)}
              </pre>
            </details>
            <div>
              <Button variant="dark" disabled={busy || !selected || !canPublish} onClick={() => send('publish')}>
                Publicar versión seleccionada
              </Button>
              <p className="mt-2 text-xs text-soft">Publicar requiere rol owner. Las versiones publicadas no se editan.</p>
            </div>
          </div>
        </SettingsCard>
      </div>
      {message && (
        <p role="status" className="rounded-lg bg-ivory px-3 py-2 text-sm text-carbon">
          {message}
        </p>
      )}
    </div>
  );
}
