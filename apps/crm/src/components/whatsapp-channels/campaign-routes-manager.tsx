'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ROUTE_LEVEL_LABEL, campaignRouteSchema, type CampaignRouteInput, type RouteLevel } from '@/lib/whatsapp/campaign-routing';

type Option = { id: string; name: string };
type Route = CampaignRouteInput & { id: string };

const EMPTY: CampaignRouteInput = { name: '', level: 'AD', externalId: '', productId: null, agentId: null, flowId: null, isActive: true };

/** Punto 9: reglas anuncio/conjunto/campaña → producto, agente, automatización. */
export function CampaignRoutesManager({
  routes,
  options,
  canManage,
}: {
  routes: Route[];
  options: { agents: Option[]; products: Option[]; flows: Option[] };
  canManage: boolean;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [state, setState] = useState<CampaignRouteInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<CampaignRouteInput>) => setState((current) => ({ ...current, ...patch }));
  const nameOf = (list: Option[], id: string | null) => (id ? (list.find((item) => item.id === id)?.name ?? 'no disponible') : '—');

  function edit(route: Route) {
    const { id, ...values } = route;
    setEditingId(id);
    setState(values);
    setMessage(null);
  }

  function reset() {
    setEditingId(null);
    setState(EMPTY);
  }

  async function send(method: 'POST' | 'PATCH' | 'DELETE', id?: string, body?: CampaignRouteInput) {
    setBusy(true);
    const response = await fetch(`/api/integrations/whatsapp/campaign-routes${id ? `/${id}` : ''}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ ok: false, text: data.message ?? 'No se pudo guardar.' });
      return false;
    }
    router.refresh();
    return true;
  }

  async function save() {
    setMessage(null);
    const parsed = campaignRouteSchema.safeParse(state);
    if (!parsed.success) return setMessage({ ok: false, text: parsed.error.issues[0]?.message ?? 'Revisa los datos.' });
    if (await send(editingId ? 'PATCH' : 'POST', editingId ?? undefined, parsed.data)) {
      setMessage({ ok: true, text: editingId ? 'Regla actualizada.' : 'Regla creada.' });
      reset();
    }
  }

  async function remove(route: Route) {
    if (!window.confirm(`¿Borrar la regla "${route.name}"? Las conversaciones ya atribuidas no cambian.`)) return;
    if (await send('DELETE', route.id)) {
      setMessage({ ok: true, text: 'Regla borrada.' });
      if (editingId === route.id) reset();
    }
  }

  return (
    <div className="space-y-5">
      {canManage && (
        <Card className="space-y-4 p-5">
          <Eyebrow>{editingId ? 'Editar regla' : 'Nueva regla'}</Eyebrow>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Nombre" htmlFor="cr-name">
              <Input id="cr-name" maxLength={80} value={state.name} onChange={(event) => set({ name: event.target.value })} />
            </FormField>
            <FormField label="Nivel" htmlFor="cr-level">
              <Select id="cr-level" value={state.level} onChange={(event) => set({ level: event.target.value as RouteLevel })}>
                {Object.entries(ROUTE_LEVEL_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="ID de Meta" htmlFor="cr-external" description="Cópialo de Ads Manager.">
              <Input id="cr-external" inputMode="numeric" maxLength={32} value={state.externalId} onChange={(event) => set({ externalId: event.target.value })} />
            </FormField>
            <FormField label="Producto" htmlFor="cr-product">
              <Select id="cr-product" value={state.productId ?? ''} onChange={(event) => set({ productId: event.target.value || null })}>
                <option value="">Sin producto</option>
                {options.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Agente IA" htmlFor="cr-agent">
              <Select id="cr-agent" value={state.agentId ?? ''} onChange={(event) => set({ agentId: event.target.value || null })}>
                <option value="">El del número</option>
                {options.agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Automatización" htmlFor="cr-flow">
              <Select id="cr-flow" value={state.flowId ?? ''} onChange={(event) => set({ flowId: event.target.value || null })}>
                <option value="">La del número</option>
                {options.flows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-xs text-graphite">
            <Switch checked={state.isActive} onCheckedChange={(checked: boolean) => set({ isActive: checked })} aria-label="Regla activa" />
            Activa
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={save}>{editingId ? 'Guardar cambios' : 'Crear regla'}</Button>
            {editingId && <Button size="sm" variant="ghost" disabled={busy} onClick={reset}>Cancelar</Button>}
            {message && <span role="status" className={`text-xs ${message.ok ? 'text-success-ink' : 'text-danger-ink'}`}>{message.text}</span>}
          </div>
        </Card>
      )}

      <section className="space-y-2">
        <Eyebrow>Reglas ({routes.length})</Eyebrow>
        {routes.length === 0 ? (
          <Card className="p-5 text-sm text-graphite">Sin reglas: cada conversación usa la configuración de su número.</Card>
        ) : (
          routes.map((route) => (
            <Card key={route.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-carbon">
                  {route.name} {!route.isActive && <span className="text-soft">(inactiva)</span>}
                </p>
                <p className="text-soft">{ROUTE_LEVEL_LABEL[route.level]} · {route.externalId}</p>
                <p className="text-graphite">
                  Producto: {nameOf(options.products, route.productId)} · Agente: {nameOf(options.agents, route.agentId)} · Automatización: {nameOf(options.flows, route.flowId)}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => edit(route)}>Editar</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(route)}>Borrar</Button>
                </div>
              )}
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
