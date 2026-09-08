'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus, Power, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <section className="space-y-3">
        {rules.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700">Sin automatizaciones todavia</p>
              <p className="mt-1 text-xs text-slate-500">
                Activa una del catalogo de abajo para empezar.
              </p>
            </CardContent>
          </Card>
        )}

        {rules.map((rule) => (
          <Card key={rule.id} className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-sm">{rule.name}</CardTitle>
                  {rule.description && (
                    <p className="mt-0.5 text-xs text-slate-500">{rule.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={rule.isActive ? 'success' : 'outline'}>
                    {rule.isActive ? 'Activa' : 'Pausada'}
                  </Badge>
                  {canManage && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        disabled={busy === rule.id}
                        onClick={() =>
                          call(`/api/automations/rules/${rule.id}`, 'PATCH', { isActive: !rule.isActive }, rule.id)
                        }
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-red-600"
                        disabled={busy === rule.id}
                        onClick={() => call(`/api/automations/rules/${rule.id}`, 'DELETE', undefined, rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  Cuando: {TRIGGER_LABEL[rule.trigger] ?? rule.trigger}
                </span>
                {rule.conditionSummary.map((condition) => (
                  <span key={condition} className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-800">
                    Si {condition}
                  </span>
                ))}
                {rule.actionSummary.map((action) => (
                  <span key={action} className="rounded-md bg-blue-50 px-2 py-0.5 text-blue-800">
                    {action}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 text-[11px] text-slate-400">
                <span>Ejecuciones: {rule.runCount}</span>
                <span>
                  Ultima: {rule.lastRunAt ? new Date(rule.lastRunAt).toLocaleString('es-CL') : 'nunca'}
                </span>
                {rule.dedupeMinutes > 0 && (
                  <span>No repetir por contacto: {Math.round(rule.dedupeMinutes / 60)} h</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {canManage && presets.some((preset) => !preset.alreadyAdded) && (
        <section>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Catalogo de reglas
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {presets
              .filter((preset) => !preset.alreadyAdded)
              .map((preset) => (
                <Card key={preset.key} className="border border-dashed border-slate-200 shadow-none">
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800">{preset.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{preset.description}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        Cuando: {TRIGGER_LABEL[preset.trigger] ?? preset.trigger}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 text-xs"
                      disabled={busy === preset.key}
                      onClick={() => call('/api/automations/rules', 'POST', { presetKey: preset.key }, preset.key)}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Activar
                    </Button>
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
