'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, addEdge, useNodesState, useEdgesState, useReactFlow, type Node, type Edge, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { FlowGraph, FlowNode, FlowTrigger } from '@/lib/automations/schema';
import { TRIGGERS, missingCapabilities, type AccountView } from '@/lib/automations/catalog';
import type { Channel } from '../../../generated/prisma/client';

type CanvasNode = Node<{ step: FlowNode }, 'step'>;
const labels: Record<string, string> = { MESSAGE: 'Enviar mensaje', CONDITION: 'Condición', DELAY: 'Espera', AI: 'Paso IA', RANDOM_SPLIT: 'División aleatoria', ACTION: 'Acción CRM', START_AUTOMATION: 'Iniciar automatización', HUMAN_HANDOFF: 'Derivar a persona', END: 'Fin' };
const palette: [string, FlowNode][] = [
  ['Messaging', { id: '', type: 'MESSAGE', text: 'Escribe tu mensaje' }],
  ['Logic', { id: '', type: 'CONDITION', field: 'TAG', operator: 'EXISTS', value: '' }],
  ['Logic', { id: '', type: 'DELAY', minutes: 60, respectQuietHours: true }],
  ['Logic', { id: '', type: 'RANDOM_SPLIT', branches: [{ id: 'a', weight: 50 }, { id: 'b', weight: 50 }] }],
  ['AI', { id: '', type: 'AI', goal: 'Ayudar al cliente', allowedTools: [], exitConditions: [], maxTurns: 6 }],
  ...(['ADD_TAG', 'REMOVE_TAG', 'SET_CUSTOM_FIELD', 'ASSIGN_OPERATOR', 'UPDATE_OPPORTUNITY_STAGE', 'CREATE_CHECKOUT'] as const).map(action => [action === 'CREATE_CHECKOUT' ? 'Sales' : 'CRM', { id: '', type: 'ACTION', action, params: {} }] as [string, FlowNode]),
  ['Flow', { id: '', type: 'START_AUTOMATION', flowKey: '' }], ['Flow', { id: '', type: 'HUMAN_HANDOFF' }], ['Flow', { id: '', type: 'END' }],
];
function StepNode({ data, selected }: NodeProps<CanvasNode>) {
  const step = data.step;
  const branches = step.type === 'CONDITION' ? ['true', 'false'] : step.type === 'RANDOM_SPLIT' ? step.branches.map(b => b.id) : [''];
  return <div className={`w-52 rounded-xl border-2 bg-white p-4 shadow-sm ${selected ? 'border-indigo-500' : 'border-slate-200'}`}>
    <Handle type="target" position={Position.Top} />
    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">{step.type === 'ACTION' ? step.action : labels[step.type]}</p>
    <p className="mt-2 truncate text-sm text-slate-700">{step.type === 'MESSAGE' ? step.text : step.type === 'AI' ? step.goal : step.type === 'DELAY' ? `${step.minutes ?? 0} min` : step.id}</p>
    {!['END', 'HUMAN_HANDOFF'].includes(step.type) && branches.map((branch, i) => <div key={branch}><span className="text-[10px] text-slate-500">{branch} </span><Handle type="source" position={Position.Bottom} id={branch || undefined} style={{ left: `${(i + 1) * 100 / (branches.length + 1)}%` }} /></div>)}
  </div>;
}
const nodeTypes = { step: StepNode };
export type BuilderProps = { flowId: string; name: string; channel: Channel; graph: FlowGraph; version: { id: string; status: string; updatedAt: string; version: number }; accounts: AccountView[]; agents: { id: string; label: string; allowedTools: string[] }[]; products: { id: string; name: string }[]; canManage: boolean };
export function FlowBuilder(props: BuilderProps) { return <ReactFlowProvider><Editor {...props} /></ReactFlowProvider>; }
function Editor(props: BuilderProps) {
  const router = useRouter();
  const flow = useReactFlow<CanvasNode>();
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(props.graph.nodes.map((step, i) => ({ id: step.id, type: 'step', position: step.position ?? { x: 80, y: i * 160 }, data: { step } })));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(props.graph.edges.map(e => ({ id: e.id, source: e.from, target: e.to, sourceHandle: e.branch, label: e.branch })));
  const [trigger, setTrigger] = useState(props.graph.trigger);
  const [name, setName] = useState(props.name);
  const [version, setVersion] = useState(props.version);
  const [selected, setSelected] = useState<string>();
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const readonly = version.status !== 'DRAFT' || !props.canManage;
  const current = nodes.find(n => n.id === selected)?.data.step;
  const account = props.accounts.find(a => a.id === trigger.accountId) ?? (props.channel === 'WHATSAPP' ? props.accounts.find(a => a.channel === 'WHATSAPP') : undefined);
  const graph = (): FlowGraph => ({ trigger, nodes: nodes.map(n => ({ ...n.data.step, position: n.position })), edges: edges.map(e => ({ id: e.id, from: e.source, to: e.target, ...(e.sourceHandle ? { branch: e.sourceHandle } : {}) })) });
  async function action(kind: 'save' | 'publish' | 'draft' | 'validate') {
    setBusy(true); setErrors([]); setNotice('');
    try {
      // Publish always persists and validates the exact graph visible in the editor.
      let revision = version;
      if (kind === 'publish') {
        const saved = await request('save', revision); revision = saved;
        setVersion(revision);
      }
      const result = await request(kind, revision);
      if (kind === 'validate') { setErrors(result); if (!result.length) setNotice('El flujo está listo para publicar.'); }
      else { setVersion(result); setNotice(kind === 'publish' ? 'Versión publicada.' : kind === 'draft' ? 'Nuevo borrador creado.' : 'Borrador guardado.'); router.refresh(); }
    } catch (error) { setErrors(String(error instanceof Error ? error.message : error).split('\n')); }
    finally { setBusy(false); }
  }
  async function request(action: string, revision: typeof version) {
    const response = await fetch(`/api/automation-flows/${props.flowId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, versionId: revision.id, updatedAt: revision.updatedAt, name, graph: graph() }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.message); return result.data;
  }
  function update(patch: Record<string, unknown>) { setNodes(all => all.map(n => n.id === selected ? { ...n, data: { step: { ...n.data.step, ...patch } as FlowNode } } : n)); }
  function append(step: FlowNode, position = { x: 80 + nodes.length % 3 * 240, y: 120 + Math.floor(nodes.length / 3) * 180 }) {
    if (readonly) return;
    const id = crypto.randomUUID(); setNodes(all => [...all, { id, type: 'step', position, data: { step: { ...structuredClone(step), id } } }]); setSelected(id);
  }
  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  // Explicit htmlFor/id: a wrapping <label> would fold the control's live value into its
  // accessible name (per the accname spec's "embedded control" rule), breaking getByLabel
  // and misreporting a moving target to screen readers.
  const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
  const field = (label: string, value: string | number, change: (v: string) => void, multiline = false) => {
    const id = `field-${slug(label)}`;
    return <div className="space-y-1 text-xs text-slate-600">
      <label htmlFor={id} className="block">{label}</label>
      {multiline
        ? <textarea id={id} disabled={readonly} className={inputClass} rows={4} value={value} onChange={e => change(e.target.value)} />
        : <input id={id} disabled={readonly} className={inputClass} value={value} onChange={e => change(e.target.value)} />}
    </div>;
  };
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center gap-3"><input aria-label="Nombre del flujo" className={`${inputClass} max-w-sm font-semibold`} disabled={readonly} value={name} onChange={e => setName(e.target.value)} /><span className="text-xs">v{version.version} · {version.status}</span>
      {props.canManage && <div className="flex flex-wrap gap-2">{readonly ? <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-white" onClick={() => action('draft')}>Crear nuevo Draft</button> : <><button disabled={busy} onClick={() => action('validate')}>Validar</button><button disabled={busy} className="rounded-lg border px-4 py-2" onClick={() => action('save')}>Guardar Draft</button><button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-white" onClick={() => action('publish')}>Publish</button></>}</div>}
    </div>
    {errors.length > 0 && <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{errors.map((e, i) => <p key={i}>{e}</p>)}</div>}{notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3"><label className="text-xs">Cuenta<select aria-label="Cuenta" disabled={readonly} className={inputClass} value={trigger.accountId ?? ''} onChange={e => setTrigger({ ...trigger, accountId: e.target.value || undefined })}><option value="">Selecciona una cuenta</option>{props.accounts.filter(a => a.channel === props.channel).map(a => <option key={a.id} value={a.id}>{a.displayName || a.channel} · {a.status}</option>)}</select></label>
      <label className="text-xs">Cuando ocurra…<select aria-label="Cuando ocurra" disabled={readonly} className={inputClass} value={trigger.type} onChange={e => setTrigger({ type: e.target.value, accountId: trigger.accountId } as FlowTrigger)}><option value="MANUAL">Selecciona un trigger</option>{TRIGGERS.map(t => <option key={t.type} value={t.type} disabled={missingCapabilities(account, [t.capability]).length > 0}>{t.label}{missingCapabilities(account, [t.capability]).length ? ' · no disponible' : ''}</option>)}</select></label>
      {'keywords' in trigger || ['COMMENT', 'MESSAGE_RECEIVED'].includes(trigger.type) ? field('Palabras clave (separadas por coma)', 'keywords' in trigger ? trigger.keywords?.join(', ') ?? '' : '', v => setTrigger({ ...trigger, keywords: v.split(',').map(v => v.trim()).filter(Boolean) } as FlowTrigger)) : null}
      {trigger.type === 'COMMENT' && field('ID del post/reel (vacío: cualquiera)', trigger.postId ?? '', v => setTrigger({ ...trigger, postId: v || undefined }))}
    </div>
    <p className="rounded-lg bg-amber-50 p-3 text-sm lg:hidden">El canvas se puede consultar aquí. Para editar conexiones con precisión, usa una pantalla de escritorio.</p>
    <div className="grid min-h-[620px] gap-3 lg:grid-cols-[170px_minmax(0,1fr)_280px]">
      <aside className="flex flex-wrap gap-2 rounded-xl border bg-white p-3 lg:block lg:space-y-2">{palette.map(([group, step], i) => <button key={i} disabled={readonly} draggable={!readonly} onDragStart={e => e.dataTransfer.setData('application/upzites-node', String(i))} onClick={() => append(step)} className="block w-full rounded-lg border p-2 text-left text-xs hover:border-indigo-400"><span className="block text-[10px] text-slate-400">{group}</span>{step.type === 'ACTION' ? step.action : labels[step.type]}</button>)}</aside>
      <div className="h-[620px] min-w-0 rounded-xl border bg-slate-50" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={e => { e.preventDefault(); const item = palette[Number(e.dataTransfer.getData('application/upzites-node'))]; if (item) append(item[1], flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }}>
        <ReactFlow<CanvasNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={readonly ? undefined : onNodesChange} onEdgesChange={readonly ? undefined : onEdgesChange} nodesDraggable={!readonly} nodesConnectable={!readonly} deleteKeyCode={readonly ? null : ['Backspace', 'Delete']} onNodeClick={(_, n) => setSelected(n.id)} onConnect={c => { if (!readonly) setEdges(es => addEdge({ ...c, label: c.sourceHandle }, es)); }} fitView><Background /><Controls /><MiniMap /></ReactFlow>
      </div>
      <aside className="space-y-3 rounded-xl border bg-white p-4"><h3 className="font-semibold">{current ? labels[current.type] : 'Configuración del nodo'}</h3>{!current && <p className="text-sm text-slate-500">Selecciona un nodo. Arrastra desde la paleta o pulsa para añadir. Une los conectores para definir el recorrido.</p>}
        {current?.type === 'MESSAGE' && <>{field('Texto', current.text, v => update({ text: v }), true)}<label className="text-xs">Canal: heredar {props.channel}<select aria-label="Canal de entrega" className={inputClass} disabled={readonly} value={current.delivery ?? 'DM'} onChange={e => update({ delivery: e.target.value })}><option value="DM">Mensaje directo</option>{!missingCapabilities(account, ['PUBLIC_COMMENT_REPLY']).length && <option value="PUBLIC_REPLY">Respuesta pública a comentario</option>}{!missingCapabilities(account, ['PRIVATE_REPLY_TO_COMMENT']).length && <option value="PRIVATE_REPLY">Respuesta privada a comentario</option>}</select></label><p className="text-xs text-slate-500">Este nodo envía texto. Los adjuntos y botones aún no tienen implementación de envío en Flow.</p></>}
        {current?.type === 'DELAY' && <>{field('Duración en minutos (60 = 1 h; 1440 = 1 día)', current.minutes ?? 60, v => update({ minutes: Number(v) }))}<label className="text-sm"><input type="checkbox" disabled={readonly} checked={current.respectQuietHours} onChange={e => update({ respectQuietHours: e.target.checked })} /> Respetar quiet hours</label></>}
        {current?.type === 'CONDITION' && <><select aria-label="Campo" className={inputClass} disabled={readonly} value={current.field} onChange={e => update({ field: e.target.value })}>{['TAG', 'CUSTOM_FIELD', 'CHANNEL', 'PIPELINE_STAGE', 'LEAD_STATUS', 'PRODUCT_PURCHASED'].map(f => <option key={f}>{f}</option>)}</select><select aria-label="Operador" className={inputClass} disabled={readonly} value={current.operator} onChange={e => update({ operator: e.target.value })}>{['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'EXISTS', 'NOT_EXISTS'].map(f => <option key={f}>{f}</option>)}</select>{current.field === 'CUSTOM_FIELD' && field('Clave del campo', current.fieldKey ?? '', v => update({ fieldKey: v }))}{field('Valor', current.value ?? '', v => update({ value: v }))}<p className="text-xs">Conecta las salidas true y false del nodo.</p></>}
        {current?.type === 'AI' && <><label className="text-xs">Agente / versión publicada<select aria-label="Agente / versión publicada" className={inputClass} disabled={readonly} value={current.agentVersionId ?? ''} onChange={e => update({ agentVersionId: e.target.value, allowedTools: props.agents.find(a => a.id === e.target.value)?.allowedTools ?? [] })}><option value="">Seleccionar</option>{props.agents.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>{field('Objetivo', current.goal, v => update({ goal: v }), true)}{field('Herramientas permitidas (coma)', current.allowedTools.join(', '), v => update({ allowedTools: v.split(',').map(t => t.trim()).filter(Boolean) }))}{field('Condiciones de salida (una por línea)', current.exitConditions.join('\n'), v => update({ exitConditions: v.split('\n').filter(Boolean) }), true)}{field('Máximo de pasos del agente', current.maxTurns, v => update({ maxTurns: Number(v) }))}</>}
        {current?.type === 'ACTION' && (current.action === 'CREATE_CHECKOUT' ? <select aria-label="Producto" className={inputClass} disabled={readonly} value={String(current.params?.productId ?? '')} onChange={e => update({ params: { productId: e.target.value } })}><option value="">Seleccionar producto</option>{props.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : (current.action === 'SET_CUSTOM_FIELD' ? ['field', 'value'] : current.action === 'ASSIGN_OPERATOR' ? ['userId'] : current.action === 'UPDATE_OPPORTUNITY_STAGE' ? ['stageKey'] : ['tag']).map(key => <div key={key}>{field(key, String(current.params?.[key] ?? ''), v => update({ params: { ...current.params, [key]: v } }))}</div>))}
        {current?.type === 'RANDOM_SPLIT' && current.branches.map((b, i) => <div key={b.id}>{field(`Peso rama ${b.id}`, b.weight, v => update({ branches: current.branches.map((x, j) => j === i ? { ...x, weight: Number(v) } : x) }))}</div>)}
        {current?.type === 'START_AUTOMATION' && field('ID de automatización publicada', current.flowKey, v => update({ flowKey: v }))}
        {current && !readonly && <><button className="block text-sm text-indigo-700" onClick={() => setNodes(all => [...all.filter(n => n.id === current.id), ...all.filter(n => n.id !== current.id)])}>Usar como primer nodo</button><button className="text-sm text-red-700" onClick={() => { setNodes(all => all.filter(n => n.id !== selected)); setEdges(all => all.filter(e => e.source !== selected && e.target !== selected)); setSelected(undefined); }}>Eliminar nodo</button></>}
      </aside>
    </div>
  </section>;
}
