'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SaveBar, type SaveState } from '@/components/ui/save-bar';
import { SettingsCard } from '@/components/ui/settings-card';
import { Textarea } from '@/components/ui/textarea';
import { BRAIN_ITEM_MAX, BRAIN_LIST_MAX, BRAIN_SPECIAL_MAX, BRAIN_TEXT_MAX, type ProductSalesBrainDraft, type TrainingStatus } from '@/lib/product-sales-brain/rules';

type Faq = { question: string; answer: string };
type Objection = { objection: string; response: string };
type Form = ProductSalesBrainDraft & { faqs: Faq[]; objections: Objection[] };
type ChatItem = { role: 'lead' | 'agent'; text: string; escalated?: boolean };

const groups: Array<{ title: string; description: string; fields: Array<[keyof Form, string, string]> }> = [
  { title: 'Producto', description: 'Hechos que la IA puede usar para explicar el producto.', fields: [['productWhat', 'Qué es el producto', 'Describe el producto con precisión.'], ['idealFor', 'Para quién es', 'Quién obtiene valor de esta oferta.'], ['problems', 'Problemas que resuelve', 'Necesidades y dolores concretos.'], ['benefits', 'Beneficios', 'Resultados o mejoras permitidas, sin promesas inventadas.'], ['differentiators', 'Diferenciadores', 'Por qué elegirlo frente a alternativas.']] },
  { title: 'Cliente ideal', description: 'Contexto del lead al que se dirige esta oferta.', fields: [['targetAudience', 'Público objetivo', 'Segmento y contexto principal.'], ['buyerPersona', 'Buyer persona', 'Perfil, motivaciones y criterios de compra.']] },
  { title: 'Argumentos de venta', description: 'Evidencia y condiciones comerciales configuradas.', fields: [['socialProof', 'Prueba social', 'Casos, testimonios o evidencia comprobable.'], ['guarantee', 'Garantía', 'Déjalo vacío si no existe.'], ['policies', 'Políticas', 'Cambios, devoluciones, plazos u otras políticas reales.']] },
  { title: 'Comportamiento del agente', description: 'Reglas que gobiernan la conversación y el momento de actuar.', fields: [['salesTone', 'Tono de venta', 'Ej. consultivo, claro y cercano.'], ['prohibitedClaims', 'Qué NO debe decir', 'Promesas, descuentos o afirmaciones prohibidas.'], ['askWhen', 'Cuándo hacer preguntas', 'Qué señales requieren descubrir más contexto.'], ['offerWhen', 'Cuándo presentar la oferta', 'Condición para pasar de descubrir a ofrecer.'], ['checkoutWhen', 'Cuándo enviar checkout', 'Regla inequívoca; el servidor siempre fija producto y precio.'], ['insistWhen', 'Cuándo insistir', 'Solo dentro de la conversación actual.'], ['stopWhen', 'Cuándo dejar de insistir', 'Señales de rechazo o límites del lead.'], ['handoffWhen', 'Cuándo pasar a humano', 'Situaciones que requieren escalamiento.'], ['specialInstructions', 'Instrucciones especiales', 'Cualquier regla adicional específica del producto.']] },
];

const statusText: Record<TrainingStatus, string> = { EMPTY: 'Sin entrenamiento', PARTIAL: 'Entrenamiento parcial', READY: 'Listo para probar' };

export function SalesBrainEditor({ productId, initial, initialStatus, canEdit }: { productId: string; initial: Form; initialStatus: TrainingStatus; canEdit: boolean }) {
  const [form, setForm] = useState<Form>(initial);
  const [savedForm, setSavedForm] = useState<Form>(initial);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [testing, setTesting] = useState(false);
  const [contextId, setContextId] = useState<string | null>(null);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      setSaveState(JSON.stringify(next) === JSON.stringify(savedForm) ? 'idle' : 'dirty');
      return next;
    });
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setSaveState('saving'); setError(null);
    const response = await fetch(`/api/products/${encodeURIComponent(productId)}/sales-brain`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const body = await response.json().catch(() => ({})) as { message?: string; data?: { status: TrainingStatus } };
    if (!response.ok || !body.data) { setError(body.message ?? 'No pudimos guardar el entrenamiento.'); setSaveState('error'); return; }
    setSavedForm(form); setStatus(body.data.status); setSaveState('saved');
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim(); if (!text || testing) return;
    setChat((items) => [...items, { role: 'lead', text }]); setMessage(''); setTesting(true);
    const response = await fetch(`/api/products/${encodeURIComponent(productId)}/sales-brain/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
    const body = await response.json().catch(() => ({})) as { message?: string; data?: { reply: string | null; escalated: boolean; note: string | null; context: { productContextId: string | null } | null } };
    if (!response.ok || !body.data) setChat((items) => [...items, { role: 'agent', text: body.message ?? 'No pudimos ejecutar la prueba.' }]);
    else {
      const data = body.data;
      setContextId(data.context?.productContextId ?? null);
      setChat((items) => [...items, { role: 'agent', text: data.reply ?? (data.escalated ? 'Señal de handoff activada: una persona debe continuar.' : data.note ?? 'El agente no generó respuesta.'), escalated: data.escalated }]);
    }
    setTesting(false);
  }

  async function resetChat() {
    await fetch(`/api/products/${encodeURIComponent(productId)}/sales-brain/test`, { method: 'DELETE' });
    setChat([]); setContextId(null);
  }

  function renderText(text: string) {
    const url = text.match(/https?:\/\/[^\s]+/)?.[0];
    return <>{text}{url && <Link className="mt-2 block font-semibold text-electric underline" href={url}>Abrir checkout</Link>}</>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
      <form onSubmit={save} className="min-w-0 space-y-4" noValidate>
        <p role="status" className="rounded-xl bg-ivory px-4 py-3 text-sm font-semibold text-carbon">Estado: {statusText[status]}</p>
        {!canEdit && <p className="rounded-xl bg-ivory px-4 py-3 text-sm text-graphite">Solo el owner o un admin puede modificar este entrenamiento.</p>}
        <fieldset disabled={!canEdit || saveState === 'saving'} className="min-w-0 space-y-4">
          {groups.slice(0, 2).map((group) => <BrainGroup key={group.title} group={group} form={form} update={update} />)}
          <SettingsCard title="Preguntas frecuentes" description="Respuestas concretas que el agente puede recuperar sin inventar.">
            <Repeater kind="faq" items={form.faqs} onChange={(items) => update('faqs', items)} />
          </SettingsCard>
          <SettingsCard title="Objeciones" description="Objeción del lead y respuesta sugerida para este producto.">
            <Repeater kind="objection" items={form.objections} onChange={(items) => update('objections', items)} />
          </SettingsCard>
          {groups.slice(2).map((group) => <BrainGroup key={group.title} group={group} form={form} update={update} />)}
        </fieldset>
        {canEdit && saveState !== 'idle' && <div className="sticky bottom-0 z-10 rounded-t-xl bg-canvas/95 pb-2 backdrop-blur"><SaveBar state={saveState} saveLabel="Guardar entrenamiento" errorMessage={error} onCancel={() => { setForm(savedForm); setSaveState('idle'); setError(null); }} /></div>}
      </form>

      <SettingsCard title="Probar agente" description="Usa el runtime y las tools reales. El checkout crea solo un pedido borrador; no realiza cobros." className="xl:sticky xl:top-4">
        <div className="space-y-3">
          <div className="min-h-48 space-y-2 rounded-xl bg-ivory p-3" aria-live="polite" aria-label="Conversación de prueba">
            {chat.length === 0 && <p className="text-sm text-soft">Pregunta una FAQ, plantea una objeción o expresa intención de compra.</p>}
            {chat.map((item, index) => <div key={index} className={`max-w-[92%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${item.role === 'lead' ? 'ml-auto bg-carbon text-white' : item.escalated ? 'bg-solar/30 text-warning-ink' : 'bg-paper text-carbon'}`}><strong className="sr-only">{item.role === 'lead' ? 'Lead' : 'Agente'}:</strong>{renderText(item.text)}</div>)}
          </div>
          {contextId && <p className="text-xs text-soft">Contexto de producto verificado: {contextId}</p>}
          <form onSubmit={send} className="space-y-2">
            <FormField label="Mensaje del lead" htmlFor="sales-brain-test-message"><Textarea value={message} maxLength={2000} rows={3} onChange={(event) => setMessage(event.target.value)} /></FormField>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={testing || !message.trim()}><Send aria-hidden />{testing ? 'Pensando…' : 'Enviar'}</Button><Button type="button" variant="outline" onClick={resetChat}><RotateCcw aria-hidden />Reiniciar</Button></div>
          </form>
        </div>
      </SettingsCard>
    </div>
  );
}

function BrainGroup({ group, form, update }: { group: typeof groups[number]; form: Form; update: <K extends keyof Form>(key: K, value: Form[K]) => void }) {
  return <SettingsCard title={group.title} description={group.description}><div className="grid gap-4 md:grid-cols-2">{group.fields.map(([key, label, description]) => <FormField key={key} label={label} htmlFor={`brain-${key}`} description={description} className={key === 'specialInstructions' ? 'md:col-span-2' : ''}><Textarea rows={key === 'specialInstructions' ? 6 : 4} maxLength={key === 'specialInstructions' ? BRAIN_SPECIAL_MAX : BRAIN_TEXT_MAX} value={(form[key] as string) ?? ''} onChange={(event) => update(key, event.target.value as Form[typeof key])} /></FormField>)}</div></SettingsCard>;
}

function Repeater({ kind, items, onChange }: { kind: 'faq'; items: Faq[]; onChange: (items: Faq[]) => void } | { kind: 'objection'; items: Objection[]; onChange: (items: Objection[]) => void }) {
  const isFaq = kind === 'faq';
  return <div>{items.length === 0 && <p className="mb-3 text-sm text-soft">Aún no agregaste {isFaq ? 'preguntas frecuentes' : 'objeciones'}.</p>}<ul className="space-y-3">{items.map((item, index) => <li key={index} className="rounded-xl border border-line p-3"><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">{isFaq ? <><FormField label={`Pregunta ${index + 1}`} htmlFor={`faq-${index}-question`}><Input maxLength={BRAIN_ITEM_MAX} value={(item as Faq).question} onChange={(event) => onChange((items as Faq[]).map((row, i) => i === index ? { ...row, question: event.target.value } : row) as never)} /></FormField><FormField label="Respuesta" htmlFor={`faq-${index}-answer`}><Textarea rows={3} maxLength={BRAIN_ITEM_MAX} value={(item as Faq).answer} onChange={(event) => onChange((items as Faq[]).map((row, i) => i === index ? { ...row, answer: event.target.value } : row) as never)} /></FormField></> : <><FormField label={`Objeción ${index + 1}`} htmlFor={`objection-${index}-text`}><Input maxLength={BRAIN_ITEM_MAX} value={(item as Objection).objection} onChange={(event) => onChange((items as Objection[]).map((row, i) => i === index ? { ...row, objection: event.target.value } : row) as never)} /></FormField><FormField label="Respuesta sugerida" htmlFor={`objection-${index}-response`}><Textarea rows={3} maxLength={BRAIN_ITEM_MAX} value={(item as Objection).response} onChange={(event) => onChange((items as Objection[]).map((row, i) => i === index ? { ...row, response: event.target.value } : row) as never)} /></FormField></>}<Button type="button" variant="ghost" size="sm" className="self-end" onClick={() => onChange(items.filter((_, i) => i !== index) as never)} aria-label={`Eliminar ${isFaq ? 'pregunta frecuente' : 'objeción'} ${index + 1}`}><Trash2 aria-hidden /><span className="sm:sr-only">Eliminar</span></Button></div></li>)}</ul><Button type="button" variant="outline" size="sm" className="mt-3" disabled={items.length >= BRAIN_LIST_MAX} onClick={() => onChange([...items, isFaq ? { question: '', answer: '' } : { objection: '', response: '' }] as never)}><Plus aria-hidden />Agregar {isFaq ? 'pregunta' : 'objeción'}</Button></div>;
}
