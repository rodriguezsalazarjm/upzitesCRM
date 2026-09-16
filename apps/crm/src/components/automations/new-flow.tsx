'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AUTOMATION_TEMPLATES, graphCapabilities, generateQuickFlow, missingCapabilities, type AccountView, type QuickKind } from '@/lib/automations/catalog';
import type { Channel } from '../../../generated/prisma/client';
export function NewFlow({ accounts, agents, products }: { accounts: AccountView[]; agents: { id: string; label: string }[]; products: { id: string; name: string }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'scratch' | 'quick' | 'templates'>('scratch');
  const [kind, setKind] = useState<QuickKind>('comment');
  const [templateId, setTemplate] = useState('');
  const [category, setCategory] = useState('Todas');
  const [channel, setChannel] = useState<Channel>('INSTAGRAM');
  const [accountId, setAccount] = useState(accounts.find(a => a.channel === 'INSTAGRAM')?.id ?? '');
  const [name, setName] = useState('Nueva automatización');
  const [values, setValues] = useState<Record<string, string>>({ keyword: 'GUIA', text: '¡Gracias por escribirnos!', match: 'CONTAINS', delayMinutes: '60' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const template = AUTOMATION_TEMPLATES.find(t => t.id === templateId);
  const selectedKind = mode === 'templates' ? template?.config.kind ?? 'resource' : kind;
  const account = accounts.find(a => a.id === accountId);
  const missing = missingCapabilities(account, template && mode === 'templates' ? template.requiredCapabilities : graphCapabilities(generateQuickFlow({ kind: selectedKind })));
  async function create() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/automation-flows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, channel, ...(mode === 'templates' ? { templateId } : {}), ...(mode !== 'scratch' ? { quick: { ...values, kind: selectedKind, accountId, delayMinutes: Number(values.delayMinutes || 60) } } : {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message);
      router.push(`/automatizaciones/${result.data.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear.'); } finally { setBusy(false); }
  }
  const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  const field = (key: string, label: string) => <label className="text-sm" key={key}>{label}<input className={input} value={values[key] ?? ''} onChange={e => setValues({ ...values, [key]: e.target.value })} /></label>;
  return <div className="space-y-6">
    <nav className="flex flex-wrap gap-2">{([['scratch', 'Crear desde cero'], ['quick', 'Automatización rápida'], ['templates', 'Plantillas']] as const).map(([id, label]) => <button key={id} onClick={() => setMode(id)} className={`rounded-lg px-4 py-2 text-sm ${mode === id ? 'bg-indigo-600 text-white' : 'border bg-white'}`}>{label}</button>)}</nav>
    {mode === 'templates' && <><select aria-label="Categoría" className={`${input} max-w-xs`} value={category} onChange={e => setCategory(e.target.value)}>{['Todas', 'Captación', 'Ventas', 'Atención', 'Instagram', 'Messenger', 'WhatsApp', 'TikTok', 'IA'].map(c => <option key={c}>{c}</option>)}</select><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{AUTOMATION_TEMPLATES.filter(t => category === 'Todas' || t.category === category || t.supportedChannels.includes(category.toUpperCase() as Channel) || (category === 'IA' && t.graph.nodes.some(n => n.type === 'AI'))).map(t => <button key={t.id} className={`rounded-xl border bg-white p-5 text-left ${templateId === t.id ? 'ring-2 ring-indigo-500' : ''}`} onClick={() => { setTemplate(t.id); setName(t.name); setValues({ text: '¡Gracias por escribirnos!', match: 'CONTAINS', delayMinutes: '60', ...Object.fromEntries(Object.entries(t.config).map(([k, v]) => [k, String(v)])) }); }}><p className="font-semibold">{t.name}</p><p className="mt-2 text-sm text-slate-500">{t.description}</p><p className="mt-3 text-xs text-indigo-600">{t.supportedChannels.join(' · ')} · v{t.version}</p>{t.id === 'follow' && <p className="mt-2 text-xs text-amber-700">Próximamente / requiere acceso adicional</p>}</button>)}</div></>}
    <div className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
      <label className="text-sm">Nombre<input className={input} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="text-sm">Canal<select aria-label="Canal" className={input} value={channel} onChange={e => { const c = e.target.value as Channel; setChannel(c); setAccount(accounts.find(a => a.channel === c)?.id ?? ''); }}>{(['INSTAGRAM', 'MESSENGER', 'WHATSAPP', 'TIKTOK'] as const).map(c => <option key={c}>{c}</option>)}</select></label>
      {mode !== 'scratch' && <><label className="text-sm">Cuenta<select aria-label="Cuenta" className={input} value={accountId} onChange={e => setAccount(e.target.value)}><option value="">Seleccionar cuenta conectada</option>{accounts.filter(a => a.channel === channel).map(a => <option key={a.id} value={a.id}>{a.displayName ?? a.channel} · {a.status}</option>)}</select></label>
      {mode === 'quick' && <label className="text-sm">Tipo<select aria-label="Tipo" className={input} value={kind} onChange={e => setKind(e.target.value as QuickKind)}>{[['comment', 'Comentario → DM'], ['resource', 'Keyword → recurso'], ['story', 'Respuesta Story'], ['faq', 'FAQ con IA'], ['qualify', 'Calificación de lead'], ['sale', 'Vender producto'], ['follow', 'Nuevo follower (requiere acceso)']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      {['comment', 'resource', 'sale'].includes(selectedKind) && <>{field('keyword', 'Palabra clave (vacía: cualquier mensaje/comentario)')}<label className="text-sm">Coincidencia<select className={input} value={values.match} onChange={e => setValues({ ...values, match: e.target.value })}><option value="CONTAINS">Contiene palabra</option><option value="EXACT">Coincide exactamente</option></select></label></>}
      {selectedKind === 'comment' && <>{field('postId', 'ID post/reel (vacío: cualquiera)')}{field('publicReply', 'Respuesta pública opcional')}</>}
      {field('text', 'Mensaje inicial')}{field('resource', 'Recurso / enlace opcional')}{field('tag', 'Etiqueta opcional')}{field('followup', 'Seguimiento opcional')}{field('delayMinutes', 'Espera del seguimiento (minutos)')}
      {['faq', 'qualify', 'sale', 'email'].includes(selectedKind) && <label className="text-sm">Agente publicado<select aria-label="Agente publicado" className={input} value={values.agentVersionId ?? ''} onChange={e => setValues({ ...values, agentVersionId: e.target.value })}><option value="">Seleccionar</option>{agents.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>}
      {selectedKind === 'sale' && <label className="text-sm">Producto del catálogo<select aria-label="Producto del catálogo" className={input} value={values.productId ?? ''} onChange={e => setValues({ ...values, productId: e.target.value })}><option value="">Seleccionar producto</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}</>}
    </div>
    {mode === 'templates' && template && <div className="text-sm"><p>{template.description}</p><p>Configuración requerida: {template.requiredConfiguration.join(', ')}</p><p>Capabilities: {template.requiredCapabilities.join(', ')}</p></div>}
    {mode !== 'scratch' && missing.length > 0 && <p role="status" className="text-sm text-amber-800">No disponible en esta cuenta. Faltan: {missing.join(', ')}. Requiere conexión o acceso adicional.</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button disabled={busy || !name || (mode !== 'scratch' && missing.length > 0) || (mode === 'templates' && !template)} onClick={create} className="rounded-lg bg-indigo-600 px-5 py-3 text-white disabled:opacity-40">{busy ? 'Creando…' : mode === 'templates' ? 'Usar esta plantilla' : 'Crear borrador y abrir Builder'}</button>
  </div>;
}
