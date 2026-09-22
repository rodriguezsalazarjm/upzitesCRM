'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flow-canvas.css';
import {
  Bot,
  Clock,
  Flag,
  GitBranch,
  Loader2,
  MessageSquare,
  PlayCircle,
  Shuffle,
  Trash2,
  UserRound,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { FormField, FormSection } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { FlowGraph, FlowNode, FlowNodeType, FlowTrigger } from '@/lib/automations/schema';
import { TRIGGERS, missingCapabilities, type AccountView } from '@/lib/automations/catalog';
import type { Channel } from '../../../generated/prisma/client';

type CanvasNode = Node<{ step: FlowNode }, 'step'>;

const labels: Record<string, string> = {
  MESSAGE: 'Enviar mensaje',
  CONDITION: 'Condición',
  DELAY: 'Espera',
  AI: 'Paso IA',
  RANDOM_SPLIT: 'División aleatoria',
  ACTION: 'Acción CRM',
  START_AUTOMATION: 'Iniciar automatización',
  HUMAN_HANDOFF: 'Derivar a persona',
  END: 'Fin',
};

const ACTION_LABEL: Record<string, string> = {
  ADD_TAG: 'Agregar etiqueta',
  REMOVE_TAG: 'Quitar etiqueta',
  SET_CUSTOM_FIELD: 'Campo personalizado',
  ASSIGN_OPERATOR: 'Asignar operador',
  UPDATE_OPPORTUNITY_STAGE: 'Etapa de oportunidad',
  CREATE_CHECKOUT: 'Crear checkout',
};

// Gramática visual: el color es una señal puntual (icono), nunca el fondo del
// nodo entero. Electric = acción, Lime = IA, Solar = espera, Ink = estructura/sistema.
type NodeTone = 'electric' | 'lime' | 'solar' | 'ink';
const TONE_CLASS: Record<NodeTone, string> = {
  electric: 'bg-electric/10 text-electric',
  lime: 'bg-lime/35 text-success-ink',
  solar: 'bg-solar/30 text-warning-ink',
  ink: 'bg-ink/10 text-ink',
};
const NODE_META: Record<FlowNodeType, { icon: LucideIcon; tone: NodeTone; category: string }> = {
  MESSAGE: { icon: MessageSquare, tone: 'electric', category: 'Mensajería' },
  CONDITION: { icon: GitBranch, tone: 'ink', category: 'Lógica' },
  ACTION: { icon: Zap, tone: 'electric', category: 'CRM' },
  DELAY: { icon: Clock, tone: 'solar', category: 'Tiempo' },
  AI: { icon: Bot, tone: 'lime', category: 'IA' },
  RANDOM_SPLIT: { icon: Shuffle, tone: 'ink', category: 'Lógica' },
  START_AUTOMATION: { icon: PlayCircle, tone: 'ink', category: 'Sistema' },
  HUMAN_HANDOFF: { icon: UserRound, tone: 'ink', category: 'Sistema' },
  END: { icon: Flag, tone: 'ink', category: 'Sistema' },
};

// El grupo solo es texto de categoría en la paleta; no participa en la lógica
// de creación/drag del nodo (ver `append`/`onDrop`, que usan el índice del array).
const palette: [string, FlowNode][] = [
  ['Mensajería', { id: '', type: 'MESSAGE', text: 'Escribe tu mensaje' }],
  ['Lógica', { id: '', type: 'CONDITION', field: 'TAG', operator: 'EXISTS', value: '' }],
  ['Tiempo', { id: '', type: 'DELAY', minutes: 60, respectQuietHours: true }],
  ['Lógica', { id: '', type: 'RANDOM_SPLIT', branches: [{ id: 'a', weight: 50 }, { id: 'b', weight: 50 }] }],
  ['IA', { id: '', type: 'AI', goal: 'Ayudar al cliente', allowedTools: [], exitConditions: [], maxTurns: 6 }],
  ...(['ADD_TAG', 'REMOVE_TAG', 'SET_CUSTOM_FIELD', 'ASSIGN_OPERATOR', 'UPDATE_OPPORTUNITY_STAGE', 'CREATE_CHECKOUT'] as const).map(
    (action) => [action === 'CREATE_CHECKOUT' ? 'Ventas' : 'CRM', { id: '', type: 'ACTION', action, params: {} }] as [string, FlowNode],
  ),
  ['Sistema', { id: '', type: 'START_AUTOMATION', flowKey: '' }],
  ['Sistema', { id: '', type: 'HUMAN_HANDOFF' }],
  ['Sistema', { id: '', type: 'END' }],
];

function nodeTitle(step: FlowNode) {
  return step.type === 'ACTION' ? (ACTION_LABEL[step.action] ?? step.action) : labels[step.type];
}
function nodeSubtitle(step: FlowNode) {
  return step.type === 'MESSAGE'
    ? step.text
    : step.type === 'AI'
      ? step.goal
      : step.type === 'DELAY'
        ? `${step.minutes ?? 0} min`
        : step.id;
}

function StepNode({ data, selected }: NodeProps<CanvasNode>) {
  const step = data.step;
  const meta = NODE_META[step.type];
  const Icon = meta.icon;
  const branches =
    step.type === 'CONDITION' ? ['true', 'false'] : step.type === 'RANDOM_SPLIT' ? step.branches.map((b) => b.id) : [''];
  const terminal = ['END', 'HUMAN_HANDOFF'].includes(step.type);

  return (
    <div
      className={cn(
        'w-56 rounded-2xl border bg-paper p-3.5 transition-colors',
        selected ? 'border-electric ring-2 ring-electric/15' : 'border-line',
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-2 !border-paper !bg-mist" />

      <div className="flex items-center gap-2">
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', TONE_CLASS[meta.tone])}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        </span>
        <Eyebrow className="truncate">{nodeTitle(step)}</Eyebrow>
      </div>

      <p className="mt-2 truncate text-sm font-medium text-carbon">{nodeSubtitle(step)}</p>

      {!terminal && (
        <div className="mt-3 flex justify-around">
          {branches.map((branch) => (
            <div key={branch} className="relative text-center">
              {branch && <span className="text-[10px] text-soft">{branch}</span>}
              <Handle
                type="source"
                position={Position.Bottom}
                id={branch || undefined}
                className="!static !h-2 !w-2 !translate-x-0 !border-2 !border-paper !bg-mist"
                style={branches.length > 1 ? undefined : { left: '50%' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
const nodeTypes = { step: StepNode };

export type BuilderProps = {
  flowId: string;
  name: string;
  channel: Channel;
  graph: FlowGraph;
  version: { id: string; status: string; updatedAt: string; version: number };
  accounts: AccountView[];
  agents: { id: string; label: string; allowedTools: string[] }[];
  products: { id: string; name: string }[];
  canManage: boolean;
};

export function FlowBuilder(props: BuilderProps) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

function Editor(props: BuilderProps) {
  const router = useRouter();
  const flow = useReactFlow<CanvasNode>();
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(
    props.graph.nodes.map((step, i) => ({
      id: step.id,
      type: 'step',
      position: step.position ?? { x: 80, y: i * 160 },
      data: { step },
    })),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    props.graph.edges.map((e) => ({ id: e.id, source: e.from, target: e.to, sourceHandle: e.branch, label: e.branch })),
  );
  const [trigger, setTrigger] = useState(props.graph.trigger);
  const [name, setName] = useState(props.name);
  const [version, setVersion] = useState(props.version);
  const [selected, setSelected] = useState<string>();
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const readonly = version.status !== 'DRAFT' || !props.canManage;
  const current = nodes.find((n) => n.id === selected)?.data.step;
  const account =
    props.accounts.find((a) => a.id === trigger.accountId) ??
    (props.channel === 'WHATSAPP' ? props.accounts.find((a) => a.channel === 'WHATSAPP') : undefined);
  const triggerMeta = TRIGGERS.find((t) => t.type === trigger.type);
  const triggerConfigured = Boolean(trigger.accountId && trigger.type !== 'MANUAL');

  const graph = (): FlowGraph => ({
    trigger,
    nodes: nodes.map((n) => ({ ...n.data.step, position: n.position })),
    edges: edges.map((e) => ({ id: e.id, from: e.source, to: e.target, ...(e.sourceHandle ? { branch: e.sourceHandle } : {}) })),
  });

  async function action(kind: 'save' | 'publish' | 'draft' | 'validate') {
    setBusy(true);
    setErrors([]);
    setNotice('');
    try {
      // Publish always persists and validates the exact graph visible in the editor.
      let revision = version;
      if (kind === 'publish') {
        const saved = await request('save', revision);
        revision = saved;
        setVersion(revision);
      }
      const result = await request(kind, revision);
      if (kind === 'validate') {
        setErrors(result);
        if (!result.length) setNotice('El flujo está listo para publicar.');
      } else {
        setVersion(result);
        setNotice(kind === 'publish' ? 'Versión publicada.' : kind === 'draft' ? 'Nuevo borrador creado.' : 'Borrador guardado.');
        router.refresh();
      }
    } catch (error) {
      setErrors(String(error instanceof Error ? error.message : error).split('\n'));
    } finally {
      setBusy(false);
    }
  }

  async function request(action: string, revision: typeof version) {
    const response = await fetch(`/api/automation-flows/${props.flowId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, versionId: revision.id, updatedAt: revision.updatedAt, name, graph: graph() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    return result.data;
  }

  function update(patch: Record<string, unknown>) {
    setNodes((all) => all.map((n) => (n.id === selected ? { ...n, data: { step: { ...n.data.step, ...patch } as FlowNode } } : n)));
  }
  function append(step: FlowNode, position = { x: 80 + (nodes.length % 3) * 240, y: 120 + Math.floor(nodes.length / 3) * 180 }) {
    if (readonly) return;
    const id = crypto.randomUUID();
    setNodes((all) => [...all, { id, type: 'step', position, data: { step: { ...structuredClone(step), id } } }]);
    setSelected(id);
  }

  // Explicit htmlFor/id: a wrapping <label> would fold the control's live value into its
  // accessible name (per the accname spec's "embedded control" rule), breaking getByLabel
  // and misreporting a moving target to screen readers.
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+|-+$)/g, '');
  const field = (label: string, value: string | number, change: (v: string) => void, multiline = false) => {
    const id = `field-${slug(label)}`;
    return (
      <FormField label={label} htmlFor={id}>
        {multiline ? (
          <Textarea disabled={readonly} rows={4} value={value} onChange={(e) => change(e.target.value)} />
        ) : (
          <Input disabled={readonly} value={value} onChange={(e) => change(e.target.value)} />
        )}
      </FormField>
    );
  };

  return (
    <section className="space-y-4">
      {/* Toolbar: nombre + estado + acciones. Publish es la única acción primaria (Electric). */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Nombre del flujo"
          className="max-w-sm font-semibold"
          disabled={readonly}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <StatusBadge tone={version.status === 'PUBLISHED' ? 'success' : 'draft'}>
          v{version.version} · {version.status === 'PUBLISHED' ? 'Publicado' : version.status === 'DRAFT' ? 'Borrador' : version.status}
        </StatusBadge>
        {props.canManage && (
          <div className="flex flex-wrap gap-2">
            {readonly ? (
              <Button size="sm" disabled={busy} onClick={() => action('draft')}>
                Crear nuevo Draft
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => action('validate')}>
                  Validar
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => action('save')}>
                  Guardar Draft
                </Button>
                <Button size="sm" disabled={busy} onClick={() => action('publish')}>
                  {busy && <Loader2 className="animate-spin" aria-hidden />}
                  Publish
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div role="alert" className="rounded-lg bg-tomato/12 p-4 text-sm text-danger-ink">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-success-ink">
          {notice}
        </p>
      )}

      {/* Disparador: no es un nodo del canvas, es la condición de entrada del flow. */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-electric/10 text-electric">
            <Zap className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </span>
          <Eyebrow>Disparador</Eyebrow>
          <StatusBadge tone={triggerConfigured ? 'success' : 'neutral'} variant="dot" className="ml-auto">
            {triggerConfigured ? 'Configurado' : 'Pendiente'}
          </StatusBadge>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Cuenta" htmlFor="trigger-account">
            <Select
              disabled={readonly}
              value={trigger.accountId ?? ''}
              onChange={(e) => setTrigger({ ...trigger, accountId: e.target.value || undefined })}
            >
              <option value="">Selecciona una cuenta</option>
              {props.accounts
                .filter((a) => a.channel === props.channel)
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
              onChange={(e) => setTrigger({ type: e.target.value, accountId: trigger.accountId } as FlowTrigger)}
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
          {'keywords' in trigger || ['COMMENT', 'MESSAGE_RECEIVED'].includes(trigger.type)
            ? field(
                'Palabras clave (separadas por coma)',
                'keywords' in trigger ? (trigger.keywords?.join(', ') ?? '') : '',
                (v) => setTrigger({ ...trigger, keywords: v.split(',').map((v) => v.trim()).filter(Boolean) } as FlowTrigger),
              )
            : null}
          {trigger.type === 'COMMENT' &&
            field('ID del post/reel (vacío: cualquiera)', trigger.postId ?? '', (v) => setTrigger({ ...trigger, postId: v || undefined }))}
        </div>
        {triggerMeta && (
          <p className="mt-3 text-xs text-soft">
            {triggerMeta.label}
            {account ? ` · ${account.displayName || account.channel}` : ''}
          </p>
        )}
      </Card>

      <p className="rounded-lg bg-solar/20 p-3 text-sm text-warning-ink lg:hidden">
        El canvas se puede consultar aquí. Para editar conexiones con precisión, usa una pantalla de escritorio.
      </p>

      <div className="grid min-h-[620px] gap-3 lg:grid-cols-[200px_minmax(0,1fr)_300px]">
        {/* Paleta: categorías reales del catálogo de nodos, cards compactas. */}
        <Card className="flex flex-wrap gap-2 p-3 lg:block lg:space-y-1.5">
          {palette.map(([group, step], i) => {
            const Icon = NODE_META[step.type].icon;
            const title = step.type === 'ACTION' ? (ACTION_LABEL[step.action] ?? step.action) : labels[step.type];
            return (
              <button
                key={i}
                disabled={readonly}
                draggable={!readonly}
                onDragStart={(e) => e.dataTransfer.setData('application/upzites-node', String(i))}
                onClick={() => append(step)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-line p-2 text-left transition-colors hover:border-electric hover:bg-electric/[0.04] disabled:pointer-events-none disabled:opacity-50"
              >
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', TONE_CLASS[NODE_META[step.type].tone])}>
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-soft">{group}</span>
                  <span className="block truncate text-xs font-medium text-carbon">{title}</span>
                </span>
              </button>
            );
          })}
        </Card>

        {/* Canvas: Off-white con grid de puntos sutil, controles y minimapa reestilizados (ver flow-canvas.css). */}
        <div
          className={cn(
            'upz-flow-canvas h-[620px] min-w-0 overflow-hidden rounded-2xl border border-line bg-canvas',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            e.preventDefault();
            const item = palette[Number(e.dataTransfer.getData('application/upzites-node'))];
            if (item) append(item[1], flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
          }}
        >
          <ReactFlow<CanvasNode>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={readonly ? undefined : onNodesChange}
            onEdgesChange={readonly ? undefined : onEdgesChange}
            nodesDraggable={!readonly}
            nodesConnectable={!readonly}
            deleteKeyCode={readonly ? null : ['Backspace', 'Delete']}
            onNodeClick={(_, n) => setSelected(n.id)}
            onConnect={(c) => {
              if (!readonly) setEdges((es) => addEdge({ ...c, label: c.sourceHandle }, es));
            }}
            defaultEdgeOptions={{ style: { strokeWidth: 1.5 } }}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--color-mist)" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor="var(--color-mist)" maskColor="rgba(17,17,17,0.04)" />
          </ReactFlow>
        </div>

        {/* Inspector: mismo sistema de formularios que el resto del producto. */}
        <Card className="space-y-4 p-4">
          <div>
            <Eyebrow>Configuración del nodo</Eyebrow>
            <p className="mt-1 text-sm font-bold text-carbon">{current ? nodeTitle(current) : 'Ningún nodo seleccionado'}</p>
          </div>
          {!current && (
            <p className="text-sm text-soft">
              Selecciona un nodo. Arrastra desde la paleta o pulsa para añadir. Une los conectores para definir el recorrido.
            </p>
          )}

          {current?.type === 'MESSAGE' && (
            <FormSection>
              {field('Texto', current.text, (v) => update({ text: v }), true)}
              <FormField label={`Canal: heredar ${props.channel}`} htmlFor="message-delivery">
                <Select disabled={readonly} value={current.delivery ?? 'DM'} onChange={(e) => update({ delivery: e.target.value })}>
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
              {field('Duración en minutos (60 = 1 h; 1440 = 1 día)', current.minutes ?? 60, (v) => update({ minutes: Number(v) }))}
              <label className="flex items-center gap-2 text-sm text-carbon">
                <input
                  type="checkbox"
                  disabled={readonly}
                  checked={current.respectQuietHours}
                  onChange={(e) => update({ respectQuietHours: e.target.checked })}
                />
                Respetar quiet hours
              </label>
            </FormSection>
          )}

          {current?.type === 'CONDITION' && (
            <FormSection>
              <FormField label="Campo" htmlFor="condition-field">
                <Select disabled={readonly} value={current.field} onChange={(e) => update({ field: e.target.value })}>
                  {['TAG', 'CUSTOM_FIELD', 'CHANNEL', 'PIPELINE_STAGE', 'LEAD_STATUS', 'PRODUCT_PURCHASED'].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Operador" htmlFor="condition-operator">
                <Select disabled={readonly} value={current.operator} onChange={(e) => update({ operator: e.target.value })}>
                  {['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'EXISTS', 'NOT_EXISTS'].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </FormField>
              {current.field === 'CUSTOM_FIELD' && field('Clave del campo', current.fieldKey ?? '', (v) => update({ fieldKey: v }))}
              {field('Valor', current.value ?? '', (v) => update({ value: v }))}
              <p className="text-xs text-soft">Conecta las salidas true y false del nodo.</p>
            </FormSection>
          )}

          {current?.type === 'AI' && (
            <FormSection>
              <FormField label="Agente / versión publicada" htmlFor="ai-agent">
                <Select
                  disabled={readonly}
                  value={current.agentVersionId ?? ''}
                  onChange={(e) => update({ agentVersionId: e.target.value, allowedTools: props.agents.find((a) => a.id === e.target.value)?.allowedTools ?? [] })}
                >
                  <option value="">Seleccionar</option>
                  {props.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              {field('Objetivo', current.goal, (v) => update({ goal: v }), true)}
              {field('Herramientas permitidas (coma)', current.allowedTools.join(', '), (v) => update({ allowedTools: v.split(',').map((t) => t.trim()).filter(Boolean) }))}
              {field('Condiciones de salida (una por línea)', current.exitConditions.join('\n'), (v) => update({ exitConditions: v.split('\n').filter(Boolean) }), true)}
              {field('Máximo de pasos del agente', current.maxTurns, (v) => update({ maxTurns: Number(v) }))}
            </FormSection>
          )}

          {current?.type === 'ACTION' && (
            <FormSection>
              {current.action === 'CREATE_CHECKOUT' ? (
                <FormField label="Producto" htmlFor="action-product">
                  <Select disabled={readonly} value={String(current.params?.productId ?? '')} onChange={(e) => update({ params: { productId: e.target.value } })}>
                    <option value="">Seleccionar producto</option>
                    {props.products.map((p) => (
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
                ).map((key) => <div key={key}>{field(key, String(current.params?.[key] ?? ''), (v) => update({ params: { ...current.params, [key]: v } }))}</div>)
              )}
            </FormSection>
          )}

          {current?.type === 'RANDOM_SPLIT' && (
            <FormSection>
              {current.branches.map((b, i) => (
                <div key={b.id}>{field(`Peso rama ${b.id}`, b.weight, (v) => update({ branches: current.branches.map((x, j) => (j === i ? { ...x, weight: Number(v) } : x)) }))}</div>
              ))}
            </FormSection>
          )}

          {current?.type === 'START_AUTOMATION' && <FormSection>{field('ID de automatización publicada', current.flowKey, (v) => update({ flowKey: v }))}</FormSection>}

          {current && !readonly && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNodes((all) => [...all.filter((n) => n.id === current.id), ...all.filter((n) => n.id !== current.id)])}
              >
                Usar como primer nodo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger-ink hover:bg-tomato/10"
                onClick={() => {
                  setNodes((all) => all.filter((n) => n.id !== selected));
                  setEdges((all) => all.filter((e) => e.source !== selected && e.target !== selected));
                  setSelected(undefined);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Eliminar nodo
              </Button>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
