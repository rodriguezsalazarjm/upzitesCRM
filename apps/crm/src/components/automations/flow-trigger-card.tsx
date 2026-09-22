'use client';

import { Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { FlowField } from './flow-field';
import { TRIGGERS, missingCapabilities, type AccountView } from '@/lib/automations/catalog';
import type { FlowTrigger } from '@/lib/automations/schema';

/**
 * El disparador no es un nodo del canvas: es la condición de entrada del
 * flow. Puramente presentacional — recibe `trigger`/`onChange` del padre,
 * misma forma de datos que antes.
 */
export function FlowTriggerCard({
  trigger,
  onChange,
  readonly,
  channel,
  accounts,
  account,
}: {
  trigger: FlowTrigger;
  onChange: (trigger: FlowTrigger) => void;
  readonly: boolean;
  channel: string;
  accounts: AccountView[];
  account: AccountView | undefined;
}) {
  const triggerMeta = TRIGGERS.find((t) => t.type === trigger.type);
  const configured = Boolean(trigger.accountId && trigger.type !== 'MANUAL');

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-electric/10 text-electric">
          <Zap className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        </span>
        <Eyebrow>Disparador</Eyebrow>
        <StatusBadge tone={configured ? 'success' : 'neutral'} variant="dot" className="ml-auto">
          {configured ? 'Configurado' : 'Pendiente'}
        </StatusBadge>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Cuenta" htmlFor="trigger-account">
          <Select
            disabled={readonly}
            value={trigger.accountId ?? ''}
            onChange={(e) => onChange({ ...trigger, accountId: e.target.value || undefined })}
          >
            <option value="">Selecciona una cuenta</option>
            {accounts
              .filter((a) => a.channel === channel)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName || a.channel} · {a.status}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField label="Cuando ocurra…" htmlFor="trigger-type">
          <Select
            disabled={readonly}
            value={trigger.type}
            onChange={(e) => onChange({ type: e.target.value, accountId: trigger.accountId } as FlowTrigger)}
          >
            <option value="MANUAL">Selecciona un trigger</option>
            {TRIGGERS.map((t) => (
              <option key={t.type} value={t.type} disabled={missingCapabilities(account, [t.capability]).length > 0}>
                {t.label}
                {missingCapabilities(account, [t.capability]).length ? ' · no disponible' : ''}
              </option>
            ))}
          </Select>
        </FormField>
        {'keywords' in trigger || ['COMMENT', 'MESSAGE_RECEIVED'].includes(trigger.type) ? (
          <FlowField
            label="Palabras clave (separadas por coma)"
            disabled={readonly}
            value={'keywords' in trigger ? (trigger.keywords?.join(', ') ?? '') : ''}
            onChange={(v) => onChange({ ...trigger, keywords: v.split(',').map((k) => k.trim()).filter(Boolean) } as FlowTrigger)}
          />
        ) : null}
        {trigger.type === 'COMMENT' && (
          <FlowField
            label="ID del post/reel (vacío: cualquiera)"
            disabled={readonly}
            value={trigger.postId ?? ''}
            onChange={(v) => onChange({ ...trigger, postId: v || undefined })}
          />
        )}
      </div>
      {triggerMeta && (
        <p className="mt-3 text-xs text-soft">
          {triggerMeta.label}
          {account ? ` · ${account.displayName || account.channel}` : ''}
        </p>
      )}
    </Card>
  );
}
