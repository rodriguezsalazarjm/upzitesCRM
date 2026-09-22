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
import { Blocks, PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { FlowEmptyState } from './flow-empty-state';
import { FlowInspector } from './flow-inspector';
import { FlowNodeCard } from './flow-node-card';
import { FlowToolbar, type FlowAction } from './flow-toolbar';
import { FlowTriggerCard } from './flow-trigger-card';
import { MobileFlowViewer } from './mobile-flow-viewer';
import { NodePalette } from './node-palette';
import { buildFlowOutline } from './flow-outline';
import { NODE_PALETTE, errorsForNode, isNodeIncomplete } from './flow-node-meta';
import { useMediaQuery } from '@/lib/use-media-query';
import type { FlowGraph, FlowNode } from '@/lib/automations/schema';
import type { AccountView } from '@/lib/automations/catalog';
import type { Channel } from '../../../generated/prisma/client';

type CanvasNode = Node<{ step: FlowNode; errors?: string[] }, 'step'>;

/** Registrado en `nodeTypes`: sólo este componente conoce los `Handle` reales que usa el engine. */
function StepNode({ data, selected }: NodeProps<CanvasNode>) {
  const step = data.step;
  const branches =
    step.type === 'CONDITION' ? ['true', 'false'] : step.type === 'RANDOM_SPLIT' ? step.branches.map((b) => b.id) : [''];
  const terminal = ['END', 'HUMAN_HANDOFF'].includes(step.type);

  return (
    <div>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-2 !border-paper !bg-mist" />

      <FlowNodeCard
        step={step}
        selected={Boolean(selected)}
        hasError={(data.errors?.length ?? 0) > 0}
        incomplete={isNodeIncomplete(step)}
      />

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
  const [busyAction, setBusyAction] = useState<FlowAction | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const readonly = version.status !== 'DRAFT' || !props.canManage;
  const current = nodes.find((n) => n.id === selected)?.data.step;
  const account =
    props.accounts.find((a) => a.id === trigger.accountId) ??
    (props.channel === 'WHATSAPP' ? props.accounts.find((a) => a.channel === 'WHATSAPP') : undefined);

  // >=1280: paleta/inspector fijos. 768-1279: mismo canvas, paleta/inspector en drawer.
  // <768: sin React Flow — viewer topológico (mobile-flow-viewer.tsx). Ver reporte de P2.
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const isCanvasCapable = useMediaQuery('(min-width: 768px)');

  // Derivado por render, solo para pintar: no toca la posición/selección que administra useNodesState.
  const canvasNodes = nodes.map((n) => ({ ...n, data: { ...n.data, errors: errorsForNode(errors, n.id) } }));

  const graph = (): FlowGraph => ({
    trigger,
    nodes: nodes.map((n) => ({ ...n.data.step, position: n.position })),
    edges: edges.map((e) => ({ id: e.id, from: e.source, to: e.target, ...(e.sourceHandle ? { branch: e.sourceHandle } : {}) })),
  });

  async function action(kind: FlowAction) {
    setBusyAction(kind);
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
      setBusyAction(null);
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
  function select(id: string | undefined) {
    setSelected(id);
    if (id && !isDesktop) setInspectorOpen(true);
  }
  function useAsFirst() {
    setNodes((all) => [...all.filter((n) => n.id === selected), ...all.filter((n) => n.id !== selected)]);
  }
  function remove() {
    setNodes((all) => all.filter((n) => n.id !== selected));
    setEdges((all) => all.filter((e) => e.source !== selected && e.target !== selected));
    setSelected(undefined);
    setInspectorOpen(false);
  }

  const inspectorProps = {
    current,
    readonly,
    onUpdate: update,
    channel: props.channel,
    account,
    agents: props.agents,
    products: props.products,
    errors: selected ? errorsForNode(errors, selected) : [],
    onUseAsFirst: useAsFirst,
    onDelete: remove,
  };

  return (
    <section className="space-y-4">
      <FlowToolbar
        name={name}
        onNameChange={setName}
        readonly={readonly}
        canManage={props.canManage}
        busyAction={busyAction}
        version={version}
        compact={!isDesktop}
        onValidate={() => action('validate')}
        onSaveDraft={() => action('save')}
        onPublish={() => action('publish')}
        onNewDraft={() => action('draft')}
      />

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

      <FlowTriggerCard
        trigger={trigger}
        onChange={setTrigger}
        readonly={readonly}
        channel={props.channel}
        accounts={props.accounts}
        account={account}
      />

      {isCanvasCapable ? (
        <>
          {!isDesktop && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)}>
                <Blocks aria-hidden />
                Agregar nodo
              </Button>
              {current && (
                <Button variant="outline" size="sm" onClick={() => setInspectorOpen(true)}>
                  <PanelRight aria-hidden />
                  Configuración
                </Button>
              )}
            </div>
          )}

          <div className="grid min-h-[620px] gap-3 xl:grid-cols-[200px_minmax(0,1fr)_300px]">
            {isDesktop && <NodePalette readonly={readonly} onAppend={append} />}

            {/* Canvas: Off-white con grid de puntos sutil, controles y minimapa reestilizados (ver flow-canvas.css). */}
            <div
              className="upz-flow-canvas relative h-[620px] min-w-0 overflow-hidden rounded-2xl border border-line bg-canvas"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const item = NODE_PALETTE[Number(e.dataTransfer.getData('application/upzites-node'))];
                if (item) append(item[1], flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
              }}
            >
              {nodes.length === 0 && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
                  <FlowEmptyState />
                </div>
              )}
              <ReactFlow<CanvasNode>
                nodes={canvasNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={readonly ? undefined : onNodesChange}
                onEdgesChange={readonly ? undefined : onEdgesChange}
                nodesDraggable={!readonly}
                nodesConnectable={!readonly}
                deleteKeyCode={readonly ? null : ['Backspace', 'Delete']}
                onNodeClick={(_, n) => select(n.id)}
                onConnect={(c) => {
                  if (!readonly) setEdges((es) => addEdge({ ...c, label: c.sourceHandle }, es));
                }}
                defaultEdgeOptions={{ style: { strokeWidth: 1.5 } }}
                connectionRadius={28}
                fitView
              >
                <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--color-mist)" />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable nodeColor="var(--color-mist)" maskColor="rgba(17,17,17,0.04)" />
              </ReactFlow>
            </div>

            {isDesktop && <FlowInspector {...inspectorProps} />}
          </div>

          {!isDesktop && (
            <>
              <Drawer open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Agregar nodo" side="left" id="flow-palette-drawer">
                <NodePalette
                  readonly={readonly}
                  onAppend={(step) => {
                    append(step);
                    setPaletteOpen(false);
                  }}
                />
              </Drawer>
              <Drawer open={inspectorOpen} onClose={() => setInspectorOpen(false)} title="Configuración del nodo" side="right" id="flow-inspector-drawer">
                <FlowInspector {...inspectorProps} />
              </Drawer>
            </>
          )}
        </>
      ) : (
        <MobileFlowViewer
          {...buildFlowOutline(
            nodes.map((n) => ({ id: n.id, step: n.data.step })),
            edges.map((e) => ({ source: e.source, target: e.target, branch: e.sourceHandle ?? undefined })),
            nodes[0]?.id,
          )}
          selected={selected}
          onSelect={select}
          errors={errors}
          inspector={inspectorProps}
        />
      )}
    </section>
  );
}
