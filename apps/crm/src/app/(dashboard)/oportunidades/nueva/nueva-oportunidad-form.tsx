'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Contact, OpportunityStage } from '@/lib/mock-data';
import type { PipelineStageRecord } from '@/lib/crm-data';

export function NuevaOportunidadForm({
  contacts,
  stages,
}: {
  contacts: Contact[];
  stages: PipelineStageRecord[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    contactId: '',
    stage: (stages[0]?.key ?? 'nuevo') as OpportunityStage,
    value: '0',
    probability: String(stages[0]?.probability ?? 20),
    expectedCloseDate: '',
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const response = await fetch('/api/opportunities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        contactId: form.contactId || undefined,
        stage: form.stage,
        value: Number(form.value || 0),
        probability: Number(form.probability || 0),
        expectedCloseDate: form.expectedCloseDate
          ? new Date(`${form.expectedCloseDate}T12:00:00.000Z`).toISOString()
          : undefined,
      }),
    });

    setLoading(false);

    if (!response.ok) {
      setError('No pudimos crear la oportunidad. Revisa los datos e intenta de nuevo.');
      return;
    }

    router.push('/oportunidades');
    router.refresh();
  }

  function updateStage(stage: OpportunityStage) {
    const selectedStage = stages.find((item) => item.key === stage);
    setForm((current) => ({
      ...current,
      stage,
      probability: String(selectedStage?.probability ?? current.probability),
    }));
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Nueva oportunidad" subtitle="Agrega un negocio al pipeline comercial" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        <Card className="max-w-2xl p-5 sm:p-6">
          <h2 className="mb-5 text-base font-bold text-carbon">Datos de la oportunidad</h2>
          <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
            <FormField label="Título" htmlFor="opp-title" className="md:col-span-2">
              <Input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ej: Sitio web + CRM"
                required
              />
            </FormField>

            <FormField label="Contacto" htmlFor="opp-contact">
              <Select
                value={form.contactId}
                onChange={(event) => setForm((current) => ({ ...current, contactId: event.target.value }))}
              >
                <option value="">Sin contacto</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Etapa" htmlFor="opp-stage">
              <Select value={form.stage} onChange={(event) => updateStage(event.target.value as OpportunityStage)}>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.key}>
                    {stage.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Valor" htmlFor="opp-value">
              <Input
                type="number"
                value={form.value}
                onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                min={0}
              />
            </FormField>

            <FormField label="Probabilidad" htmlFor="opp-probability">
              <Input
                type="number"
                value={form.probability}
                onChange={(event) => setForm((current) => ({ ...current, probability: event.target.value }))}
                min={0}
                max={100}
              />
            </FormField>

            <FormField label="Fecha estimada de cierre" htmlFor="opp-close-date">
              <Input
                type="date"
                value={form.expectedCloseDate}
                onChange={(event) => setForm((current) => ({ ...current, expectedCloseDate: event.target.value }))}
              />
            </FormField>

            {error && <FormError className="md:col-span-2 mt-0">{error}</FormError>}

            <div className="flex gap-2 border-t border-line pt-5 md:col-span-2">
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                Guardar oportunidad
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href="/oportunidades">
                  <ArrowLeft aria-hidden />
                  Volver
                </Link>
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
