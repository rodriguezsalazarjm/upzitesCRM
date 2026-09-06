'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="max-w-2xl border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Datos de la oportunidad</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium text-slate-700 md:col-span-2">
                Titulo
                <Input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Ej: Sitio web + CRM"
                  required
                />
              </label>

              <label className="space-y-1.5 text-xs font-medium text-slate-700">
                Contacto
                <select
                  value={form.contactId}
                  onChange={(event) => setForm((current) => ({ ...current, contactId: event.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">Sin contacto</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5 text-xs font-medium text-slate-700">
                Etapa
                <select
                  value={form.stage}
                  onChange={(event) => updateStage(event.target.value as OpportunityStage)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.key}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5 text-xs font-medium text-slate-700">
                Valor
                <Input
                  type="number"
                  value={form.value}
                  onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                  min={0}
                />
              </label>

              <label className="space-y-1.5 text-xs font-medium text-slate-700">
                Probabilidad
                <Input
                  type="number"
                  value={form.probability}
                  onChange={(event) => setForm((current) => ({ ...current, probability: event.target.value }))}
                  min={0}
                  max={100}
                />
              </label>

              <label className="space-y-1.5 text-xs font-medium text-slate-700">
                Fecha estimada de cierre
                <Input
                  type="date"
                  value={form.expectedCloseDate}
                  onChange={(event) => setForm((current) => ({ ...current, expectedCloseDate: event.target.value }))}
                />
              </label>

              {error && <p className="md:col-span-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" size="sm" disabled={loading}>
                  <Save className="h-4 w-4" />
                  Guardar oportunidad
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href="/oportunidades">
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                  </Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
