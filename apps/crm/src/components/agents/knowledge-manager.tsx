'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
type Source = { id?: string; type: string; title: string; content: string; isActive: boolean };
const empty: Source = { type: 'TEXT', title: '', content: '', isActive: true };
export function KnowledgeManager({ sources, canManage }: { sources: Source[]; canManage: boolean }) {
  const router = useRouter(); const [draft, setDraft] = useState(empty); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function save(remove = false) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/knowledge${remove ? `?id=${draft.id}` : ''}`, { method: remove ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: remove ? undefined : JSON.stringify(draft) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message);
      setDraft(empty); setMessage('Conocimiento actualizado.'); router.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Error al guardar.'); } finally { setBusy(false); }
  }
  const input = 'w-full rounded-lg border p-3 text-sm';
  return <div className="grid gap-5 lg:grid-cols-2"><div className="space-y-3">{sources.map(s => <button key={s.id} onClick={() => setDraft(s)} className="block w-full rounded-xl border bg-white p-4 text-left"><span className="text-xs text-indigo-600">{s.type} · {s.isActive ? 'Activo' : 'Inactivo'}</span><h3 className="font-semibold">{s.title}</h3><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-500">{s.content}</p></button>)}{!sources.length && <p className="text-sm text-slate-500">Añade información del negocio, preguntas frecuentes y políticas para que el agente pueda consultarlas.</p>}</div>
    <form className="space-y-3 rounded-xl border bg-white p-5" onSubmit={e => { e.preventDefault(); save(); }}><h2 className="font-semibold">{draft.id ? 'Editar fuente' : 'Nueva fuente'}</h2><label className="block text-sm">Tipo<select disabled={!canManage} className={input} value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}><option value="TEXT">Información del negocio</option><option value="FAQ">FAQ: pregunta + respuesta</option><option value="POLICY">Política</option></select></label><label className="block text-sm">{draft.type === 'FAQ' ? 'Pregunta' : 'Título'}<input required disabled={!canManage} className={input} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><label className="block text-sm">{draft.type === 'FAQ' ? 'Respuesta' : 'Información estructurada'}<textarea required disabled={!canManage} rows={9} className={input} value={draft.content} onChange={e => setDraft({ ...draft, content: e.target.value })} placeholder="Pagos, entrega, garantía, cambios, horarios y cobertura…" /></label><label className="text-sm"><input type="checkbox" disabled={!canManage} checked={draft.isActive} onChange={e => setDraft({ ...draft, isActive: e.target.checked })} /> Disponible para el agente</label><div className="flex gap-4"><button disabled={busy || !canManage} className="rounded-lg bg-indigo-600 px-4 py-2 text-white">Guardar</button><button type="button" onClick={() => setDraft(empty)}>Nueva</button>{draft.id && canManage && <button type="button" disabled={busy} onClick={() => save(true)} className="text-red-700">Eliminar</button>}</div>{message && <p role="status" className="text-sm">{message}</p>}</form>
  </div>;
}
