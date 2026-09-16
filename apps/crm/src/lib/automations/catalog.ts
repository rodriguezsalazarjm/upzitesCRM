import type { Channel } from '../../../generated/prisma/client';
import { type Capability, effectiveCapability } from '../channels/capabilities';
import { type FlowGraph, type FlowNode, type FlowTrigger } from './schema';

export const TRIGGERS: { type: FlowTrigger['type']; label: string; capability: Capability }[] = [
  { type: 'MESSAGE_RECEIVED', label: 'Mensaje recibido / palabra clave', capability: 'RECEIVE_DM' },
  { type: 'COMMENT', label: 'Comentario en post/reel', capability: 'COMMENT_TRIGGER' },
  { type: 'STORY_REPLY', label: 'Respuesta a historia', capability: 'STORY_REPLY_TRIGGER' },
  { type: 'STORY_MENTION', label: 'Mención en historia', capability: 'STORY_MENTION_TRIGGER' },
  { type: 'LIVE_COMMENT', label: 'Comentario en vivo', capability: 'LIVE_COMMENT_TRIGGER' },
  { type: 'FOLLOW', label: 'Nuevo seguidor', capability: 'FOLLOW_TRIGGER' },
  { type: 'SHARE', label: 'Compartir', capability: 'SHARE_TRIGGER' },
  { type: 'REF_LINK', label: 'Referral', capability: 'REF_URL_TRIGGER' },
  { type: 'AD_CONVERSATION_STARTED', label: 'Conversación desde anuncio', capability: 'AD_TRIGGER' },
];
export type AccountView = { id: string; channel: Channel; displayName: string | null; status: string; capabilities: string[] };
export function missingCapabilities(account: AccountView | undefined, requirements: Capability[]): Capability[] {
  return requirements.filter(cap => !account || effectiveCapability(account.channel, account.status === 'CONNECTED', account.capabilities, cap) !== 'SUPPORTED');
}
export function graphCapabilities(graph: FlowGraph): Capability[] {
  const caps: Capability[] = [];
  const trigger = TRIGGERS.find(t => t.type === graph.trigger.type);
  if (trigger) caps.push(trigger.capability);
  if ('keywords' in graph.trigger && graph.trigger.keywords?.length) caps.push('KEYWORD_TRIGGER');
  for (const node of graph.nodes) {
    if (node.type === 'AI') caps.push('SEND_DM');
    if (node.type === 'MESSAGE') caps.push(node.delivery === 'PUBLIC_REPLY' ? 'PUBLIC_COMMENT_REPLY' : node.delivery === 'PRIVATE_REPLY' ? 'PRIVATE_REPLY_TO_COMMENT' : 'SEND_DM');
  }
  return [...new Set(caps)];
}

export type QuickKind = 'comment' | 'resource' | 'story' | 'faq' | 'qualify' | 'sale' | 'follow' | 'handoff' | 'cold' | 'email';
export type QuickConfig = { kind: QuickKind; accountId?: string; keyword?: string; match?: 'EXACT' | 'CONTAINS'; postId?: string; text?: string; publicReply?: string; resource?: string; tag?: string; followup?: string; delayMinutes?: number; agentVersionId?: string; productId?: string };
export function generateQuickFlow(config: QuickConfig): FlowGraph {
  const nodes: FlowNode[] = [];
  type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
  const add = (node: WithoutId<FlowNode>) => nodes.push({ ...node, id: `step-${nodes.length + 1}`, position: { x: 80, y: nodes.length * 160 } } as FlowNode);
  const message = (text: string, delivery: 'DM' | 'PUBLIC_REPLY' | 'PRIVATE_REPLY' = 'DM') => add({ type: 'MESSAGE', text, delivery } as FlowNode);
  const ai = (goal: string, tools: string[]) => add({ type: 'AI', goal, agentVersionId: config.agentVersionId, productId: config.kind === 'sale' ? config.productId : undefined, allowedTools: tools, exitConditions: ['Objetivo resuelto o derivación humana'], maxTurns: 6 } as FlowNode);
  const trigger: FlowTrigger = config.kind === 'comment' ? { type: 'COMMENT', postId: config.postId || undefined, keywords: config.keyword ? [config.keyword] : [], match: config.match ?? 'CONTAINS' } : config.kind === 'story' ? { type: 'STORY_REPLY' } : config.kind === 'follow' ? { type: 'FOLLOW' } : { type: 'MESSAGE_RECEIVED', keywords: config.keyword ? [config.keyword] : [], match: config.match ?? 'CONTAINS' };
  trigger.accountId = config.accountId;
  if (config.kind === 'comment' && config.publicReply) message(config.publicReply, 'PUBLIC_REPLY');
  if (config.kind === 'faq') ai('Responde usando conocimiento del negocio. Si no hay información, deriva a una persona.', ['getBusinessInfo', 'searchKnowledge', 'getProducts', 'getServices', 'requestHumanHandoff']);
  else if (config.kind === 'qualify') ai('Pregunta una cosa por turno: necesidad y presupuesto. Registra solo las respuestas recibidas con updateLeadQualification. Crea una oportunidad cuando esté calificado; si necesita ayuda, deriva.', ['getBusinessInfo', 'updateLeadQualification', 'create_opportunity', 'requestHumanHandoff']);
  else if (config.kind === 'email') ai('Solicita el email y guárdalo únicamente después de recibirlo. No inventes respuestas.', ['update_contact', 'requestHumanHandoff']);
  else if (config.kind === 'sale') {
    message(config.text || 'Te ayudo a conocer el producto y confirmar tu compra.');
    ai(`Presenta el producto ${config.productId || '[selecciona producto]'}. Consulta su precio al catálogo, detecta intención de compra y solicita confirmación explícita de producto, cantidad y precio. Solo tras recibirla usa createCheckoutLink. Nunca inventes precios.`, ['getProduct', 'getProducts', 'searchKnowledge', 'createCheckoutLink', 'requestHumanHandoff']);
  } else if (config.kind === 'handoff') add({ type: 'HUMAN_HANDOFF' });
  else message([config.text || '¡Hola! Gracias por escribirnos.', config.resource].filter(Boolean).join('\n'), config.kind === 'comment' ? 'PRIVATE_REPLY' : 'DM');
  if (config.tag && config.kind !== 'handoff') add({ type: 'ACTION', action: 'ADD_TAG', params: { tag: config.tag } });
  if (config.followup && config.kind !== 'handoff') {
    add({ type: 'DELAY', minutes: config.delayMinutes ?? 60, respectQuietHours: true } as FlowNode);
    message(config.followup);
  }
  if (config.kind !== 'handoff') add({ type: 'END' });
  return { trigger, nodes, edges: nodes.slice(1).map((node, i) => ({ id: `edge-${i}`, from: nodes[i].id, to: node.id })) };
}

export type Template = { id: string; name: string; description: string; category: string; supportedChannels: Channel[]; requiredCapabilities: Capability[]; requiredConfiguration: string[]; version: number; config: QuickConfig; graph: FlowGraph };
const all: Channel[] = ['INSTAGRAM', 'MESSENGER', 'WHATSAPP', 'TIKTOK'];
const definitions: [string, string, string, string, Channel[], QuickConfig, string[]][] = [
  ['comment-guide', 'Comentario GUIA → DM', 'Responde al comentario y entrega la guía por privado.', 'Captación', ['INSTAGRAM'], { kind: 'comment', keyword: 'GUIA', publicReply: 'Te envié la guía por privado.', text: 'Aquí tienes tu guía.', tag: 'guia' }, ['accountId', 'resource']],
  ['lead-magnet', 'Entrega lead magnet', 'Entrega un recurso a quien lo solicita.', 'Captación', all, { kind: 'resource', keyword: 'GUIA' }, ['accountId', 'resource']],
  ['keyword', 'Keyword → recurso', 'Una palabra clave inicia la entrega.', 'Captación', all, { kind: 'resource', keyword: 'RECURSO' }, ['accountId', 'resource']],
  ['faq', 'FAQ IA', 'Responde consultas desde el conocimiento del workspace.', 'Atención', all, { kind: 'faq' }, ['accountId', 'agentVersionId']],
  ['qualification', 'Calificación de lead', 'El agente pregunta, registra respuestas y deriva.', 'Ventas', all, { kind: 'qualify' }, ['accountId', 'agentVersionId']],
  ['sale', 'Venta de producto', 'Consulta catálogo, pide confirmación y crea checkout.', 'Ventas', all, { kind: 'sale' }, ['accountId', 'agentVersionId', 'productId']],
  ['story', 'Story Reply → conversación', 'Da continuidad a una respuesta de historia.', 'Instagram', ['INSTAGRAM'], { kind: 'story' }, ['accountId', 'text']],
  ['handoff', 'Human Handoff', 'Entrega la conversación a una persona.', 'Atención', all, { kind: 'handoff' }, ['accountId']],
  ['cold', 'Follow-up lead frío', 'Responde y espera antes del seguimiento.', 'Ventas', all, { kind: 'cold', followup: '¿Te puedo ayudar con alguna duda?', delayMinutes: 60 }, ['accountId', 'text']],
  ['messenger-comment', 'Messenger comment → private message', 'Responde en privado a un comentario de Página.', 'Messenger', ['MESSENGER'], { kind: 'comment', keyword: 'INFO' }, ['accountId', 'text']],
  ['tiktok-ai', 'TikTok DM → IA', 'Atención con IA sujeta a acceso Business Messaging.', 'TikTok', ['TIKTOK'], { kind: 'faq' }, ['accountId', 'agentVersionId']],
  ['email', 'Captura de email', 'Solicita y registra el correo proporcionado.', 'Captación', all, { kind: 'email' }, ['accountId', 'agentVersionId']],
  ['follow', 'Bienvenida nuevo follower', 'Requiere acceso adicional a FOLLOW_TRIGGER.', 'Instagram', ['INSTAGRAM'], { kind: 'follow' }, ['accountId', 'text']],
];
export const AUTOMATION_TEMPLATES: Template[] = definitions.map(([id, name, description, category, supportedChannels, config, requiredConfiguration]) => {
  const graph = generateQuickFlow(config);
  return { id, name, description, category, supportedChannels, requiredCapabilities: graphCapabilities(graph), requiredConfiguration, version: 1, config, graph };
});
