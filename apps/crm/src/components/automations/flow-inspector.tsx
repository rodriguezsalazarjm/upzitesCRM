'use client';

import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { FormField, FormSection } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { FlowEmptyState } from './flow-empty-state';
import { FlowField } from './flow-field';
import { nodeTitle } from './flow-node-meta';
import { missingCapabilities, type AccountView } from '@/lib/automations/catalog';
import type { FlowNode } from '@/lib/automations/schema';

export type FlowInspectorProps = {
  current: FlowNode | undefined;
  readonly: boolean;
  onUpdate: (patch: Record<string, unknown>) => void;
  channel: string;
  account: AccountView | undefined;
  agents: { id: string; label: string; allowedTools: string[] }[];
  products: { id: string; name: string }[];
  errors: string[];
  onUseAsFirst: () => void;
  onDelete: () => void;
};

/**
 * Panel de configuración del nodo seleccionado. Un solo nivel de card (sin
 * cards anidadas): header con tipo/estado, formulario por tipo, y la acción
 * destructiva al final, separada por un hairline. Recibe `current` y
 * `onUpdate` del padre — no toca `nodes`/`edges` directamente. Se reutiliza
 * tal cual dentro del Drawer del viewer compact/mobile.
 */
export function FlowInspector({
  current,
  readonly,
  onUpdate,
  channel,
  account,
  agents,
  products,
  errors,
  onUseAsFirst,
  onDelete,
}: FlowInspectorProps) {
  return (
    <Card className="space-y-4 p-4">
      <div>
        <Eyebrow>Configuración del nodo</Eyebrow>
        <p className="mt-1 text-sm font-bold text-carbon">{current ? nodeTitle(current) : 'Ningún nodo seleccionado'}</p>
      </div>

      {!current && <FlowEmptyState />}

      {current && errors.length > 0 && (
        <div role="alert" className="space-y-1 rounded-lg bg-tomato/12 p-3 text-xs text-danger-ink">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}

      {current?.type === 'MESSAGE' && (
        <FormSection>
          <FlowField label="Texto" multiline disabled={readonly} value={current.text} onChange={(v) => onUpdate({ text: v })} />
          <FormField label={`Canal: heredar ${channel}`} htmlFor="message-delivery">
            <Select disabled={readonly} value={current.delivery ?? 'DM'} onChange={(e) => onUpdate({ delivery: e.target.value })}>
              <option value="DM">Mensaje directo</option>
              {!missingCapabilities(account, ['PUBLIC_COMMENT_REPLY']).length && <option value="PUBLIC_REPLY">Respuesta pública a comentario</option>}
              {!missingCapabilities(account, ['PRIVATE_REPLY_TO_COMMENT']).length && <option value="PRIVATE_REPLY">Respuesta privada a comentario</option>}
            </Select>
          </FormField>
          <p className="text-xs text-soft">Este nodo envía texto. Los adjuntos y botones aún no tienen implementación de envío en Flow.</p>
        </FormSection>
      )}

      {current?.type === 'DELAY' && (
        <FormSection>
          <FlowField
            label="Duración en minutos (60 = 1 h; 1440 = 1 día)"
            disabled={readonly}
            value={current.minutes ?? 60}
            onChange={(v) => onUpdate({ minutes: Number(v) })}
          />
          <label className="flex items-center gap-2 text-sm text-carbon">
            <input
              type="checkbox"
              disabled={readonly}
              checked={current.respectQuietHours}
              onChange={(e) => onUpdate({ respectQuietHours: e.target.checked })}
            />
            Respetar quiet hours
          </label>
        </FormSection>
      )}

      {current?.type === 'CONDITION' && (
        <FormSection>
          <FormField label="Campo" htmlFor="condition-field">
            <Select disabled={readonly} value={current.field} onChange={(e) => onUpdate({ field: e.target.value })}>
              {['TAG', 'CUSTOM_FIELD', 'CHANNEL', 'PIPELINE_STAGE', 'LEAD_STATUS', 'PRODUCT_PURCHASED'].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Operador" htmlFor="condition-operator">
            <Select disabled={readonly} value={current.operator} onChange={(e) => onUpdate({ operator: e.target.value })}>
              {['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'EXISTS', 'NOT_EXISTS'].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </FormField>
          {current.field === 'CUSTOM_FIELD' && (
            <FlowField label="Clave del campo" disabled={readonly} value={current.fieldKey ?? ''} onChange={(v) => onUpdate({ fieldKey: v })} />
          )}
          <FlowField label="Valor" disabled={readonly} value={current.value ?? ''} onChange={(v) => onUpdate({ value: v })} />
          <p className="text-xs text-soft">Conecta las salidas true y false del nodo.</p>
        </FormSection>
      )}

      {current?.type === 'AI' && (
        <FormSection>
          <FormField label="Agente / versión publicada" htmlFor="ai-agent">
            <Select
              disabled={readonly}
              value={current.agentVersionId ?? ''}
              onChange={(e) => onUpdate({ agentVersionId: e.target.value, allowedTools: agents.find((a) => a.id === e.target.value)?.allowedTools ?? [] })}
            >
              <option value="">Seleccionar</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FlowField label="Objetivo" multiline disabled={readonly} value={current.goal} onChange={(v) => onUpdate({ goal: v })} />
          <FlowField
            label="Herramientas permitidas (coma)"
            disabled={readonly}
            value={current.allowedTools.join(', ')}
            onChange={(v) => onUpdate({ allowedTools: v.split(',').map((t) => t.trim()).filter(Boolean) })}
          />
          <FlowField
            label="Condiciones de salida (una por línea)"
            multiline
            disabled={readonly}
            value={current.exitConditions.join('\n')}
            onChange={(v) => onUpdate({ exitConditions: v.split('\n').filter(Boolean) })}
          />
          <FlowField
            label="Máximo de pasos del agente"
            disabled={readonly}
            value={current.maxTurns}
            onChange={(v) => onUpdate({ maxTurns: Number(v) })}
          />
        </FormSection>
      )}

      {current?.type === 'ACTION' && (
        <FormSection>
          {current.action === 'CREATE_CHECKOUT' ? (
            <FormField label="Producto" htmlFor="action-product">
              <Select disabled={readonly} value={String(current.params?.productId ?? '')} onChange={(e) => onUpdate({ params: { productId: e.target.value } })}>
                <option value="">Seleccionar producto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : (
            (current.action === 'SET_CUSTOM_FIELD'
              ? ['field', 'value']
              : current.action === 'ASSIGN_OPERATOR'
                ? ['userId']
                : current.action === 'UPDATE_OPPORTUNITY_STAGE'
                  ? ['stageKey']
                  : ['tag']
            ).map((key) => (
              <FlowField
                key={key}
                label={key}
                disabled={readonly}
                value={String(current.params?.[key] ?? '')}
                onChange={(v) => onUpdate({ params: { ...current.params, [key]: v } })}
              />
            ))
          )}
        </FormSection>
      )}

      {current?.type === 'RANDOM_SPLIT' && (
        <FormSection>
          {current.branches.map((b, i) => (
            <FlowField
              key={b.id}
              label={`Peso rama ${b.id}`}
              disabled={readonly}
              value={b.weight}
              onChange={(v) => onUpdate({ branches: current.branches.map((x, j) => (j === i ? { ...x, weight: Number(v) } : x)) })}
            />
          ))}
        </FormSection>
      )}

      {current?.type === 'START_AUTOMATION' && (
        <FormSection>
          <FlowField label="ID de automatización publicada" disabled={readonly} value={current.flowKey} onChange={(v) => onUpdate({ flowKey: v })} />
        </FormSection>
      )}

      {current && !readonly && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button size="sm" variant="outline" onClick={onUseAsFirst}>
            Usar como primer nodo
          </Button>
          <Button size="sm" variant="ghost" className="text-danger-ink hover:bg-tomato/10" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Eliminar nodo
          </Button>
        </div>
      )}
    </Card>
  );
}
