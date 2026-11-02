'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Building2, MessageCircleQuestion, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SaveBar, type SaveState } from '@/components/ui/save-bar';
import { SettingsCard } from '@/components/ui/settings-card';
import { Textarea } from '@/components/ui/textarea';
import { KNOWLEDGE_LIMITS } from '@/lib/workspace-knowledge/limits';
import type { WorkspaceKnowledgeProfileInput } from '@/lib/workspace-knowledge/rules';

type Faq = { question: string; answer: string };
type Field = Exclude<keyof WorkspaceKnowledgeProfileInput, 'globalFaqs'>;

const FIELDS: Array<{ key: Field; label: string; description: string; rows?: number; wide?: boolean }> = [
  { key: 'tradeName', label: 'Nombre comercial', description: 'Cómo se presenta el negocio ante sus clientes.', rows: 1 },
  { key: 'location', label: 'Ubicación', description: 'Dirección, comuna o "100% online".', rows: 1 },
  { key: 'paymentMethods', label: 'Medios de pago', description: 'Transferencia, tarjetas, cuotas, efectivo…' },
  { key: 'serviceChannels', label: 'Formas de atención', description: 'WhatsApp, local físico, videollamada, a domicilio…' },
  { key: 'contactInfo', label: 'Datos de contacto', description: 'Teléfono, correo o redes que el agente puede compartir.' },
  { key: 'brandTone', label: 'Tono de marca', description: 'Ej. cercano, profesional, sin tecnicismos.' },
  { key: 'escalationRules', label: 'Cuándo derivar a una persona', description: 'Reclamos, negociaciones, casos especiales…', wide: true },
  { key: 'generalInstructions', label: 'Instrucciones generales', description: 'Reglas que aplican a todas las conversaciones del negocio.', rows: 5, wide: true },
];

export function KnowledgeProfileForm({ initial, canEdit }: { initial: WorkspaceKnowledgeProfileInput; canEdit: boolean }) {
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  function update(next: WorkspaceKnowledgeProfileInput) {
    setForm(next);
    setState(JSON.stringify(next) === JSON.stringify(saved) ? 'idle' : 'dirty');
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    // Una FAQ a medio escribir no se envía: el servidor exige pregunta y respuesta.
    const payload = { ...form, globalFaqs: form.globalFaqs.filter((faq) => faq.question.trim() && faq.answer.trim()) };
    setState('saving');
    const response = await fetch('/api/knowledge/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({})) as { message?: string };
    if (!response.ok) { setError(body.message ?? 'No pudimos guardar el perfil.'); setState('error'); return; }
    setForm(payload); setSaved(payload); setState('saved');
  }

  const setFaqs = (faqs: Faq[]) => update({ ...form, globalFaqs: faqs });

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      {!canEdit && <p className="rounded-xl bg-ivory px-4 py-3 text-sm text-graphite">Solo el owner o un admin puede modificar el conocimiento del negocio.</p>}
      <fieldset disabled={!canEdit || state === 'saving'} className="min-w-0 space-y-4">
        <SettingsCard
          icon={Building2}
          title="Perfil del negocio"
          description={<>Datos que aplican a todo el negocio, en cualquier conversación. El horario, la descripción y las políticas se editan en <Link href="/configuracion" className="font-semibold text-electric hover:text-electric-strong">Configuración</Link>.</>}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {FIELDS.map((field) => (
              <FormField key={field.key} label={field.label} htmlFor={`knowledge-${field.key}`} description={field.description} className={field.wide ? 'md:col-span-2' : ''}>
                {field.rows === 1
                  ? <Input maxLength={KNOWLEDGE_LIMITS.profileText} value={form[field.key]} onChange={(event) => update({ ...form, [field.key]: event.target.value })} />
                  : <Textarea rows={field.rows ?? 3} maxLength={KNOWLEDGE_LIMITS.profileText} value={form[field.key]} onChange={(event) => update({ ...form, [field.key]: event.target.value })} />}
              </FormField>
            ))}
          </div>
        </SettingsCard>

        <SettingsCard icon={MessageCircleQuestion} title="Preguntas frecuentes del negocio" description="Respuestas generales (no de un producto). Las de cada producto van en su entrenamiento comercial.">
          {form.globalFaqs.length === 0 && <p className="mb-3 text-sm text-soft">Aún no agregaste preguntas frecuentes.</p>}
          <ul className="space-y-3">
            {form.globalFaqs.map((faq, index) => (
              <li key={index} className="rounded-xl border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <FormField label={`Pregunta ${index + 1}`} htmlFor={`global-faq-${index}-question`}>
                    <Input maxLength={KNOWLEDGE_LIMITS.faqItem} value={faq.question} onChange={(event) => setFaqs(form.globalFaqs.map((row, i) => i === index ? { ...row, question: event.target.value } : row))} />
                  </FormField>
                  <FormField label="Respuesta" htmlFor={`global-faq-${index}-answer`}>
                    <Textarea rows={3} maxLength={KNOWLEDGE_LIMITS.faqItem} value={faq.answer} onChange={(event) => setFaqs(form.globalFaqs.map((row, i) => i === index ? { ...row, answer: event.target.value } : row))} />
                  </FormField>
                  <Button type="button" variant="ghost" size="sm" className="relative self-end" onClick={() => setFaqs(form.globalFaqs.filter((_, i) => i !== index))} aria-label={`Eliminar pregunta frecuente ${index + 1}`}>
                    <Trash2 aria-hidden /><span className="sm:sr-only">Eliminar</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" className="mt-3" disabled={form.globalFaqs.length >= KNOWLEDGE_LIMITS.faqCount} onClick={() => setFaqs([...form.globalFaqs, { question: '', answer: '' }])}>
            <Plus aria-hidden />Agregar pregunta
          </Button>
        </SettingsCard>
      </fieldset>
      {canEdit && state !== 'idle' && (
        <div className="sticky bottom-0 z-10 rounded-t-xl bg-canvas/95 pb-2 backdrop-blur">
          <SaveBar state={state} saveLabel="Guardar perfil" errorMessage={error} onCancel={() => { setForm(saved); setState('idle'); setError(null); }} />
        </div>
      )}
    </form>
  );
}
