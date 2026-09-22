'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
const CHANNEL_COPY: Record<string, { name: string; description: string }> = {
  INSTAGRAM: { name: 'Instagram', description: 'Responde mensajes y comentarios de tu cuenta profesional. No necesitas una Página de Facebook.' },
  MESSENGER: { name: 'Messenger', description: 'Responde los mensajes que llegan a tu Página de Facebook.' },
  TIKTOK: { name: 'TikTok', description: 'La mensajería de TikTok está pendiente de aprobación.' },
};
const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  CONNECTED: { label: 'Conectado', tone: 'success' },
  DISCONNECTED: { label: 'No conectado', tone: 'neutral' },
  NEEDS_ATTENTION: { label: 'Requiere atención', tone: 'warning' },
  REAUTH_REQUIRED: { label: 'Requiere reconexión', tone: 'warning' },
};
/** Estado visible del canal: nunca el enum crudo. TikTok sin cuenta espera aprobación del proveedor. */
function channelStatus(channel: string, status: string | undefined) {
  if (!status) return channel === 'TIKTOK' ? { label: 'Requiere aprobación', tone: 'draft' as const } : STATUS.DISCONNECTED;
  return STATUS[status] ?? { label: 'Requiere atención', tone: 'warning' as const };
}
type Account = { id: string; channel: string; displayName: string | null; externalAccountId: string; status: string; metadata: unknown };
export function IntegrationCards({ accounts, demo, canManage }: { accounts: Account[]; demo: boolean; canManage: boolean }) {
  const router = useRouter(); const [message, setMessage] = useState(''); const [text, setText] = useState('GUIA'); const [type, setType] = useState('COMMENT'); const [postId, setPost] = useState('demo-post'); const [busy, setBusy] = useState(false); const [conversationId, setConversation] = useState('');
  async function action(channel: string, action: string) {
    setBusy(true); setMessage('');
    try { const response = await fetch('/api/demo-channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, action, text, type, postId }) }); const result = await response.json(); if (!response.ok) throw new Error(result.message); setMessage(action === 'event' ? `Evento simulado procesado: ${result.data.eventId}` : 'Conexión demo actualizada.'); setConversation(result.data.conversationId ?? ''); router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Error.'); } finally { setBusy(false); }
  }
  return <><div className="space-y-1 lg:col-span-2"><Eyebrow>Mensajería</Eyebrow><h2 className="text-lg font-bold tracking-tight">Canales sociales</h2><p className="text-sm text-ash">{demo ? 'Modo demo local · no usa APIs reales ni acredita App Review.' : 'Estamos habilitando estos canales para tu cuenta.'}</p>{message && <p role="status" className="break-words text-sm">{message} {conversationId && <Link className="font-semibold text-electric underline underline-offset-4" href={`/inbox/${conversationId}`}>Abrir Inbox →</Link>}</p>}</div>
    {['INSTAGRAM', 'MESSENGER', 'TIKTOK'].map(channel => { const account = accounts.find(a => a.channel === channel); const status = channelStatus(channel, account?.status); return <section key={channel} className="space-y-3 rounded-2xl border border-line bg-paper p-6"><div className="flex justify-between"><h3 className="text-base font-bold">{CHANNEL_COPY[channel].name}</h3><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div><p className="text-sm text-ash">{CHANNEL_COPY[channel].description}</p>{account && <p className="break-all text-xs">{account.displayName} · {account.externalAccountId}</p>}
      {demo && canManage ? <div className="flex flex-wrap gap-3"><button disabled={busy} className={buttonVariants({ variant: 'outline', size: 'sm' })} onClick={() => action(channel, account?.status === 'CONNECTED' ? 'disconnect' : 'connect')}>{account?.status === 'CONNECTED' ? 'Desconectar demo' : 'Fake Connect'}</button>{account?.status === 'CONNECTED' && channel !== 'TIKTOK' && <button disabled={busy} className={buttonVariants({ size: 'sm' })} onClick={() => action(channel, 'event')}>Disparar evento fake</button>}</div> : <p className="text-xs text-ash">{channel === 'TIKTOK' ? 'Te avisaremos cuando TikTok apruebe el acceso.' : 'Muy pronto podrás conectarlo desde aquí.'}</p>}
    </section>; })}
    {demo && canManage && <section className="grid gap-3 rounded-2xl border border-transparent bg-ivory p-6 lg:col-span-2 sm:grid-cols-3"><label className="text-sm">Evento<Select aria-label="Evento" wrapperClassName="mt-1" value={type} onChange={e => setType(e.target.value)}><option value="COMMENT">Comentario</option><option value="DM_RECEIVED">DM recibido</option><option value="STORY_REPLY">Respuesta Story</option></Select></label><label className="text-sm">Texto<Input className="mt-1" value={text} onChange={e => setText(e.target.value)} /></label><label className="text-sm">ID post/reel<Input className="mt-1" value={postId} onChange={e => setPost(e.target.value)} /></label></section>}
  </>;
}
