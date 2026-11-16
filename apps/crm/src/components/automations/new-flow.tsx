'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs } from '@/components/ui/tabs';
import { AUTOMATION_TEMPLATES, graphCapabilities, generateQuickFlow, missingCapabilities, type AccountView, type QuickKind } from '@/lib/automations/catalog';
import type { Channel } from '../../../generated/prisma/client';

const MODES = [
  { value: 'scratch', label: 'Crear desde cero' },
  { value: 'quick', label: 'Automatización rápida' },
  { value: 'templates', label: 'Plantillas' },
] as const;

const QUICK_KINDS: { value: QuickKind; label: string }[] = [
  { value: 'comment', label: 'Comentario → DM' },
  { value: 'resource', label: 'Keyword → recurso' },
  { value: 'story', label: 'Respuesta Story' },
  { value: 'faq', label: 'FAQ con IA' },
  { value: 'qualify', label: 'Calificación de lead' },
  { value: 'sale', label: 'Vender producto' },
  { value: 'quote', label: 'Cotización de servicios' },
  { value: 'appointment', label: 'Agendar cita' },
  { value: 'postsale', label: 'Postventa (compra aprobada)' },
  { value: 'follow', label: 'Nuevo follower (requiere acceso)' },
];

const AI_KINDS: QuickKind[] = ['faq', 'qualify', 'sale', 'email', 'quote', 'appointment'];
// Estas dos viven en Recuperación (P7): cortan el seguimiento si el contacto responde o compra.
const RECOVERY_TEMPLATES = [
  { id: 'checkout-recovery', name: 'Recuperación de checkout', description: 'Recuerda el pago a quien abrió el checkout y no compró. Se detiene si compra.' },
  { id: 'followup-sequence', name: 'Follow-up 1h / 24h / 72h', description: 'Tres seguimientos escalonados. Se detiene si el contacto responde o compra.' },
];

const CHANNELS: Channel[] = ['INSTAGRAM', 'MESSENGER', 'WHATSAPP', 'TIKTOK'];
const CATEGORIES = ['Todas', 'Captación', 'Ventas', 'Atención', 'Instagram', 'Messenger', 'WhatsApp', 'TikTok', 'IA'];

const templateValues = (t: (typeof AUTOMATION_TEMPLATES)[number]) => ({ text: '¡Gracias por escribirnos!', match: 'CONTAINS', delayMinutes: '60', ...Object.fromEntries(Object.entries(t.config).map(([k, v]) => [k, String(v)])) });

export function NewFlow({ accounts, agents, products, recommended = [], initialTemplateId }: { accounts: AccountView[]; agents: { id: string; label: string }[]; products: { id: string; name: string }[]; recommended?: string[]; initialTemplateId?: string }) {
  const router = useRouter();
  const initial = AUTOMATION_TEMPLATES.find((t) => t.id === initialTemplateId);
  // P14: las plantillas del rubro van primero.
  const rank = (id: string) => (recommended.includes(id) ? recommended.indexOf(id) : recommended.length);
  const templates = [...AUTOMATION_TEMPLATES].sort((a, b) => rank(a.id) - rank(b.id));
  const [mode, setMode] = useState<'scratch' | 'quick' | 'templates'>(initial || recommended.length ? 'templates' : 'scratch');
  const [kind, setKind] = useState<QuickKind>('comment');
  const [templateId, setTemplate] = useState(initial?.id ?? '');
  const [category, setCategory] = useState('Todas');
  const [channel, setChannel] = useState<Channel>('INSTAGRAM');
  const [accountId, setAccount] = useState(accounts.find((a) => a.channel === 'INSTAGRAM')?.id ?? '');
  const [name, setName] = useState(initial?.name ?? 'Nueva automatización');
  const [values, setValues] = useState<Record<string, string>>(initial ? templateValues(initial) : { keyword: 'GUIA', text: '¡Gracias por escribirnos!', match: 'CONTAINS', delayMinutes: '60' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draftId, setDraftId] = useState('');
  const template = AUTOMATION_TEMPLATES.find((t) => t.id === templateId);
  const selectedKind = mode === 'templates' ? (template?.config.kind ?? 'resource') : kind;
  const account = accounts.find((a) => a.id === accountId);
  const missing = missingCapabilities(account, template && mode === 'templates' ? template.requiredCapabilities : graphCapabilities(generateQuickFlow({ kind: selectedKind })));

  async function create(publish = false) {
    setBusy(true);
    setError('');
    setDraftId('');
    try {
      const response = await fetch('/api/automation-flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          channel,
          publish,
          ...(mode === 'templates' ? { templateId } : {}),
          ...(mode !== 'scratch' ? { quick: { ...values, kind: selectedKind, accountId, delayMinutes: Number(values.delayMinutes || 60) } } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      if (result.data.publishError) {
        setDraftId(result.data.id);
        throw new Error(`Quedó guardada como borrador, pero aún no se puede publicar: ${result.data.publishError}`);
      }
      router.push(`/automatizaciones/${result.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear.');
    } finally {
      setBusy(false);
    }
  }

  function field(key: string, label: string) {
    return (
      <FormField key={key} label={label} htmlFor={`new-flow-${key}`}>
        <Input value={values[key] ?? ''} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
      </FormField>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Tabs semantics="tabs" ariaLabel="Modo de creación" items={MODES.map((m) => ({ ...m }))} value={mode} onValueChange={(v) => setMode(v as typeof mode)} />

      {mode === 'templates' && (
        <div className="space-y-4">
          <Select className="max-w-xs" aria-label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templates.filter(
              (t) =>
                category === 'Todas' ||
                t.category === category ||
                t.supportedChannels.includes(category.toUpperCase() as Channel) ||
                (category === 'IA' && t.graph.nodes.some((n) => n.type === 'AI')),
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTemplate(t.id);
                  setName(t.name);
                  setValues(templateValues(t));
                }}
                className={`rounded-2xl border bg-paper p-5 text-left transition-colors ${templateId === t.id ? 'border-electric ring-2 ring-electric/15' : 'border-line hover:border-stone'}`}
              >
                <p className="text-sm font-bold text-carbon">{t.name}</p>
                {recommended.includes(t.id) && (
                  <StatusBadge tone="success" className="mt-2">
                    Recomendada para tu negocio
                  </StatusBadge>
                )}
                <p className="mt-2 text-sm text-soft">{t.description}</p>
                <p className="mt-3 text-xs font-medium text-electric">
                  {t.supportedChannels.join(' · ')} · v{t.version}
                </p>
                {t.id === 'follow' && (
                  <StatusBadge tone="warning" className="mt-2">
                    Próximamente / requiere acceso adicional
                  </StatusBadge>
                )}
              </button>
            ))}
            {(category === 'Todas' || category === 'Ventas') &&
              RECOVERY_TEMPLATES.map((t) => (
                <Link key={t.id} href="/recuperacion/nueva" className="rounded-2xl border border-line bg-paper p-5 text-left transition-colors hover:border-stone">
                  <p className="text-sm font-bold text-carbon">{t.name}</p>
                  <p className="mt-2 text-sm text-soft">{t.description}</p>
                  <p className="mt-3 text-xs font-medium text-electric">Se configura en Recuperación →</p>
                </Link>
              ))}
          </div>
        </div>
      )}

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <FormField label="Nombre" htmlFor="new-flow-name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Canal" htmlFor="new-flow-channel">
          <Select
            value={channel}
            onChange={(e) => {
              const c = e.target.value as Channel;
              setChannel(c);
              setAccount(accounts.find((a) => a.channel === c)?.id ?? '');
            }}
          >
            {CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </FormField>

        {mode !== 'scratch' && (
          <>
            <FormField label="Cuenta" htmlFor="new-flow-account">
              <Select value={accountId} onChange={(e) => setAccount(e.target.value)}>
                <option value="">Seleccionar cuenta conectada</option>
                {accounts
                  .filter((a) => a.channel === channel)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName ?? a.channel} · {a.status}
                    </option>
                  ))}
              </Select>
            </FormField>
            {mode === 'quick' && (
              <FormField label="Tipo" htmlFor="new-flow-kind">
                <Select value={kind} onChange={(e) => setKind(e.target.value as QuickKind)}>
                  {QUICK_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </>
        )}

        {mode !== 'scratch' && (
          <>
            {['comment', 'resource', 'sale'].includes(selectedKind) && (
              <>
                {field('keyword', 'Palabra clave (vacía: cualquier mensaje/comentario)')}
                <FormField label="Coincidencia" htmlFor="new-flow-match">
                  <Select value={values.match} onChange={(e) => setValues({ ...values, match: e.target.value })}>
                    <option value="CONTAINS">Contiene palabra</option>
                    <option value="EXACT">Coincide exactamente</option>
                  </Select>
                </FormField>
              </>
            )}
            {selectedKind === 'comment' && (
              <>
                {field('postId', 'ID post/reel (vacío: cualquiera)')}
                {field('publicReply', 'Respuesta pública opcional')}
              </>
            )}
            {(!AI_KINDS.includes(selectedKind) || selectedKind === 'sale') && selectedKind !== 'handoff' && field('text', selectedKind === 'postsale' ? 'Mensaje de agradecimiento' : 'Mensaje inicial')}
            {['comment', 'resource', 'story', 'cold'].includes(selectedKind) && field('resource', 'Recurso / enlace opcional')}
            {field('tag', 'Etiqueta opcional')}
            {field('followup', 'Seguimiento opcional')}
            {field('delayMinutes', 'Espera del seguimiento (minutos)')}
            {AI_KINDS.includes(selectedKind) && (
              <FormField label="Agente publicado" htmlFor="new-flow-agent">
                <Select value={values.agentVersionId ?? ''} onChange={(e) => setValues({ ...values, agentVersionId: e.target.value })}>
                  <option value="">Seleccionar</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            {selectedKind === 'sale' && (
              <FormField label="Producto del catálogo" htmlFor="new-flow-product">
                <Select value={values.productId ?? ''} onChange={(e) => setValues({ ...values, productId: e.target.value })}>
                  <option value="">Seleccionar producto</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </>
        )}
      </Card>

      {mode === 'templates' && template && (
        <p className="text-sm text-soft">
          {template.description}
          <br />
          Configuración requerida: {template.requiredConfiguration.join(', ')}
          <br />
          Capacidades: {template.requiredCapabilities.join(', ')}
        </p>
      )}

      {mode !== 'scratch' && missing.length > 0 && (
        <p role="status" className="rounded-xl bg-solar/20 p-4 text-sm text-warning-ink">
          No disponible en esta cuenta. Faltan: {missing.join(', ')}. Requiere conexión o acceso adicional.
        </p>
      )}

      {error && (
        <FormError role="alert">
          {error}
          {draftId && (
            <>
              {' '}
              <Link className="underline" href={`/automatizaciones/${draftId}`}>
                Abrir en el Builder
              </Link>
            </>
          )}
        </FormError>
      )}

      <div className="flex flex-wrap gap-2">
        {mode !== 'scratch' && (
          <Button disabled={busy || !name || missing.length > 0 || (mode === 'templates' && !template)} onClick={() => create(true)}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Rocket aria-hidden />}
            {busy ? 'Publicando…' : 'Crear y publicar'}
          </Button>
        )}
        <Button
          variant={mode === 'scratch' ? undefined : 'outline'}
          disabled={busy || !name || (mode !== 'scratch' && missing.length > 0) || (mode === 'templates' && !template)}
          onClick={() => create(false)}
        >
          {mode === 'scratch' && (busy ? <Loader2 className="animate-spin" aria-hidden /> : <Rocket aria-hidden />)}
          Crear borrador y abrir Builder
        </Button>
      </div>
    </div>
  );
}
