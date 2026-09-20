'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus, Power, Trash2, Zap } from 'lucide-react';
import { AutomationRow, RuleChip } from '@/components/automations/automation-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeading } from '@/components/ui/eyebrow';
import { StatusBadge } from '@/components/ui/status-badge';

export type RuleView = {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  isActive: boolean;
  actionSummary: string[];
  conditionSummary: string[];
  dedupeMinutes: number;
  runCount: number;
  lastRunAt: string | null;
};

export type PresetView = {
  key: string;
  name: string;
  description: string;
  trigger: string;
  alreadyAdded: boolean;
};

const TRIGGER_LABEL: Record<string, string> = {
  LEAD_CREATED: 'Lead nuevo',
  MESSAGE_RECEIVED: 'Mensaje recibido',
  MESSAGE_FAILED: 'Mensaje no entregado',
  NO_ACTIVITY: 'Sin actividad',
  OPPORTUNITY_STAGE_CHANGED: 'Cambio de etapa',
  PAYMENT_CONFIRMED: 'Pago confirmado',
  CONSENT_REVOKED: 'Consentimiento revocado',
  CONVERSATION_ASSIGNED: 'Conversacion asignada',
  CONTACT_SCORE_CHANGED: 'Cambio de score',
  CHECKOUT_STARTED: 'Checkout iniciado',
  QUOTE_CREATED: 'Cotizacion creada',
  QUOTE_ACCEPTED: 'Cotizacion aceptada',
  ORDER_FULFILLED: 'Pedido despachado',
};

export function AutomatizacionesClient({
  rules,
  presets,
  canManage,
}: {
  rules: RuleView[];
  presets: PresetView[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function call(path: string, method: string, body?: unknown, key?: string) {
    setError(null);
    setBusy(key ?? path);

    const response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    setBusy(null);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.message ?? 'No se pudo completar la accion.');
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      {error && (
        <p role="alert" className="rounded-xl bg-tomato/12 px-4 py-3 text-[13px] font-medium text-danger-ink">
          {error}
        </p>
      )}

      <section className="space-y-4">
        <SectionHeading eyebrow="Reglas" title="Cuando pasa algo, el CRM actúa" />

        {rules.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="Sin automatizaciones todavia"
            description="Activa una del catalogo de abajo para empezar."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {rules.map((rule) => (
                <AutomationRow
                  key={rule.id}
                  icon={Zap}
                  title={rule.name}
                  description={rule.description}
                  status={
                    <StatusBadge tone={rule.isActive ? 'success' : 'draft'}>
                      {rule.isActive ? 'Activa' : 'Pausada'}
                    </StatusBadge>
                  }
                  chips={
                    <>
                      <RuleChip kind="trigger">Cuando: {TRIGGER_LABEL[rule.trigger] ?? rule.trigger}</RuleChip>
                      {rule.conditionSummary.map((condition) => (
                        <RuleChip key={condition} kind="condition">
                          Si {condition}
                        </RuleChip>
                      ))}
                      {rule.actionSummary.map((action) => (
                        <RuleChip key={action} kind="action">
                          → {action}
                        </RuleChip>
                      ))}
                    </>
                  }
                  meta={
                    <>
                      <span className="tabular">Ejecuciones: {rule.runCount}</span>
                      <span>
                        Ultima: {rule.lastRunAt ? new Date(rule.lastRunAt).toLocaleString('es-CL') : 'nunca'}
                      </span>
                      {rule.dedupeMinutes > 0 && (
                        <span>No repetir por contacto: {Math.round(rule.dedupeMinutes / 60)} h</span>
                      )}
                    </>
                  }
                  actions={
                    canManage && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          disabled={busy === rule.id}
                          aria-label={`${rule.isActive ? 'Pausar' : 'Activar'} ${rule.name}`}
                          title={rule.isActive ? 'Pausar' : 'Activar'}
                          onClick={() =>
                            call(`/api/automations/rules/${rule.id}`, 'PATCH', { isActive: !rule.isActive }, rule.id)
                          }
                        >
                          <Power strokeWidth={1.75} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 hover:bg-tomato/12 hover:text-danger-ink"
                          disabled={busy === rule.id}
                          aria-label={`Eliminar ${rule.name}`}
                          title="Eliminar"
                          onClick={() => call(`/api/automations/rules/${rule.id}`, 'DELETE', undefined, rule.id)}
                        >
                          <Trash2 strokeWidth={1.75} />
                        </Button>
                      </>
                    )
                  }
                />
              ))}
            </ul>
          </Card>
        )}
      </section>

      {canManage && presets.some((preset) => !preset.alreadyAdded) && (
        <section className="space-y-4">
          <SectionHeading eyebrow="Catalogo de reglas" title="Listas para activar" />
          <div className="grid gap-3 md:grid-cols-2">
            {presets
              .filter((preset) => !preset.alreadyAdded)
              .map((preset) => (
                <div
                  key={preset.key}
                  className="flex items-start justify-between gap-4 rounded-2xl border-[1.5px] border-dashed border-mist p-5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-carbon">{preset.name}</p>
                    <p className="mt-1 text-[13px] text-ash">{preset.description}</p>
                    <p className="mt-2 text-xs text-soft">
                      Cuando: {TRIGGER_LABEL[preset.trigger] ?? preset.trigger}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={busy === preset.key}
                    onClick={() => call('/api/automations/rules', 'POST', { presetKey: preset.key }, preset.key)}
                  >
                    <Plus strokeWidth={2} />
                    Activar
                  </Button>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
