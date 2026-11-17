'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MESSAGE_VARIABLES } from '@/lib/followups/rules';

export type TemplateView = {
  id: string; name: string; language: string; category: string; categoryLabel: string; status: string; statusLabel: string;
  body: string; variables: string[]; placeholders: number; problem: string | null; rejectedReason: string | null; channelLabel: string; lastSyncedAt: string | null;
};
type ChannelView = { id: string; label: string };

const TONE: Record<string, string> = { APPROVED: 'text-success-ink', PENDING: 'text-warning-ink', REJECTED: 'text-danger-ink', PAUSED: 'text-warning-ink', DISABLED: 'text-danger-ink' };
const VARS = Object.keys(MESSAGE_VARIABLES);
const usedVars = (text: string) => [...new Set([...text.matchAll(/\{\{\s*([a-z]+)\s*\}\}/g)].map((m) => m[1]).filter((n) => VARS.includes(n)))];

/** P26: plantillas de WhatsApp por número: sincronizar con Meta, registrar nuevas y asignar sus variables. */
export function TemplatesManager({ templates, channels, canManage }: { templates: TemplateView[]; channels: ChannelView[]; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ channelId: channels[0]?.id ?? '', name: '', language: 'es', category: 'MARKETING', text: '' });
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [mapping, setMapping] = useState<Record<string, string[]>>({});

  async function call(key: string, url: string, method: string, body?: unknown, done?: string) {
    setBusy(key);
    setMessage(null);
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { message?: string; data?: { synced?: number } } | null;
    setBusy(null);
    if (!response?.ok) return setMessage({ ok: false, text: json?.message ?? 'No se pudo completar.' });
    setMessage({ ok: true, text: json?.data?.synced !== undefined ? `Sincronizadas ${json.data.synced} plantilla(s).` : (done ?? 'Listo.') });
    if (key === 'create') { setForm({ ...form, name: '', text: '' }); setExamples({}); }
    setMapping(({ [key]: _saved, ...rest }) => rest);
    router.refresh();
  }

  const vars = usedVars(form.text);

  return (
    <div className="space-y-5" data-templates-manager>
      {canManage && channels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {channels.map((c) => (
            <Button key={c.id} type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void call(`sync-${c.id}`, `/api/integrations/whatsapp/channels/${c.id}/templates/sync`, 'POST')} data-sync={c.id}>
              {busy === `sync-${c.id}` ? 'Sincronizando…' : `Sincronizar con Meta · ${c.label}`}
            </Button>
          ))}
        </div>
      )}
      {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-success-ink' : 'text-danger-ink'}`}>{message.text}</p>}

      <section className="space-y-2">
        <Eyebrow>Plantillas ({templates.length})</Eyebrow>
        {templates.length === 0 && <Card className="p-4 text-sm text-graphite">Sin plantillas. Sincroniza las que ya tienes en WhatsApp Manager o registra una nueva abajo.</Card>}
        {templates.map((t) => {
          const current = mapping[t.id] ?? (t.variables.length === t.placeholders ? t.variables : Array.from({ length: t.placeholders }, (_, i) => t.variables[i] ?? ''));
          const needsMapping = t.placeholders > 0 && t.variables.length !== t.placeholders;
          return (
            <Card key={t.id} className="space-y-2 p-4" data-template={t.name} data-status={t.status}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="break-all font-mono text-sm font-semibold text-carbon">{t.name}</span>
                <span className={`text-xs font-semibold ${TONE[t.status] ?? ''}`}>{t.statusLabel}</span>
                <span className="text-xs text-soft">{t.language} · {t.categoryLabel} · {t.channelLabel}</span>
              </div>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-ivory p-2 text-sm text-carbon">{t.body || '(sin cuerpo de texto)'}</p>
              {t.rejectedReason && <p className="text-xs text-danger-ink">Motivo de Meta: {t.rejectedReason}</p>}
              {t.problem && <p className="text-xs text-warning-ink" data-template-problem>No se usará en envíos: {t.problem}.</p>}
              {t.placeholders > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {current.map((value, i) => (
                    <label key={i} className="flex items-center gap-1">
                      <span className="font-mono">{`{{${i + 1}}}`}</span>
                      <Select
                        aria-label={`Dato para {{${i + 1}}}`}
                        value={value}
                        disabled={!canManage}
                        onChange={(e) => setMapping({ ...mapping, [t.id]: current.map((v, j) => (j === i ? e.target.value : v)) })}
                      >
                        <option value="">Elegir dato…</option>
                        {VARS.map((v) => <option key={v} value={v}>{v}</option>)}
                      </Select>
                    </label>
                  ))}
                  {canManage && (needsMapping || mapping[t.id]) && (
                    <Button type="button" size="sm" variant="outline" disabled={busy !== null || current.some((v) => !v)} onClick={() => void call(t.id, `/api/integrations/whatsapp/templates/${t.id}`, 'PATCH', { variables: current }, 'Variables guardadas.')} data-save-variables>
                      Guardar variables
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </section>

      {canManage && channels.length > 0 && (
        <Card className="space-y-3 p-4">
          <Eyebrow>Registrar plantilla nueva</Eyebrow>
          <p className="text-xs text-graphite">Se envía a Meta para revisión (suele tardar minutos, a veces horas). Solo se usa cuando Meta la aprueba.</p>
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={(e) => { e.preventDefault(); void call('create', '/api/integrations/whatsapp/templates', 'POST', { ...form, examples }, 'Plantilla enviada a revisión.'); }}
          >
            <FormField label="Número" htmlFor="tpl-channel">
              <Select id="tpl-channel" value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })}>
                {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </FormField>
            <FormField label="Nombre" htmlFor="tpl-name" description="Minúsculas, números y guion bajo.">
              <Input id="tpl-name" value={form.name} maxLength={512} placeholder="recordatorio_compra" onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </FormField>
            <FormField label="Idioma" htmlFor="tpl-lang">
              <Select id="tpl-lang" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                {['es', 'es_CL', 'es_MX', 'es_AR', 'en_US', 'pt_BR'].map((l) => <option key={l} value={l}>{l}</option>)}
              </Select>
            </FormField>
            <FormField label="Categoría" htmlFor="tpl-cat" description="Recordatorios de compra y ofertas son Marketing; avisos de un pedido son Utilidad.">
              <Select id="tpl-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utilidad</option>
              </Select>
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Texto" htmlFor="tpl-text" description="Meta no acepta una variable al inicio ni al final.">
                <Textarea id="tpl-text" rows={3} maxLength={1024} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} required />
              </FormField>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-soft">
                Variables:
                {VARS.map((v) => (
                  <button key={v} type="button" onClick={() => setForm({ ...form, text: `${form.text}{{${v}}}` })} className="rounded border border-mist px-1.5 py-0.5 font-mono text-graphite hover:border-carbon">{`{{${v}}}`}</button>
                ))}
              </div>
            </div>
            {vars.map((v) => (
              <FormField key={v} label={`Ejemplo de {{${v}}} para la revisión de Meta`} htmlFor={`tpl-ex-${v}`}>
                <Input id={`tpl-ex-${v}`} value={examples[v] ?? ''} maxLength={60} onChange={(e) => setExamples({ ...examples, [v]: e.target.value })} required />
              </FormField>
            ))}
            <div className="md:col-span-2">
              <Button type="submit" size="sm" disabled={busy !== null} data-submit-template>{busy === 'create' ? 'Enviando…' : 'Enviar a revisión'}</Button>
            </div>
          </form>
        </Card>
      )}
      {!canManage && <p className="text-xs text-soft">Solo el owner o un admin puede administrar plantillas.</p>}
    </div>
  );
}
