'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export type ComposeMailbox = { id: string; emailAddress: string };
export type ComposeInitial = {
  to?: string; cc?: string; subject?: string; text?: string;
  replyToMessageId?: string; forwardMessageId?: string;
  quote?: { id: string; number: string };
  /** Adjuntos del original al reenviar (se agregan en el servidor). */
  forwardedAttachments?: string[];
};

const MAX_BYTES = 15 * 1024 * 1024;
const split = (value: string) => value.split(/[,;\s]+/).map((v) => v.trim()).filter(Boolean);

export function Compose({ mailboxes, initial = {}, onDone, compact = false }: { mailboxes: ComposeMailbox[]; initial?: ComposeInitial; onDone?: () => void; compact?: boolean }) {
  const router = useRouter();
  const [mailboxId, setMailboxId] = useState(mailboxes[0]?.id ?? '');
  const [to, setTo] = useState(initial.to ?? '');
  const [cc, setCc] = useState(initial.cc ?? '');
  const [subject, setSubject] = useState(initial.subject ?? '');
  const [text, setText] = useState(initial.text ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = files.reduce((sum, f) => sum + f.size, 0);

  async function send() {
    setError('');
    if (!split(to).length) return setError('Agrega al menos un destinatario.');
    if (total > MAX_BYTES) return setError('Los adjuntos superan 15 MB en total.');
    setBusy(true);
    const form = new FormData();
    form.set('data', JSON.stringify({
      mailboxId, to: split(to), cc: split(cc), subject, text,
      replyToMessageId: initial.replyToMessageId ?? null, forwardMessageId: initial.forwardMessageId ?? null, quoteId: initial.quote?.id ?? null,
    }));
    files.forEach((f) => form.append('files', f));
    const response = await fetch('/api/mail/send', { method: 'POST', body: form }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { data?: { threadId: string | null }; message?: string } | null;
    setBusy(false);
    if (!response?.ok) return setError(json?.message ?? 'No se pudo enviar. Inténtalo de nuevo.');
    onDone?.();
    if (json?.data?.threadId) router.push(`/inbox/email/${json.data.threadId}`);
    router.refresh();
  }

  if (!mailboxes.length) return <p className="text-sm text-soft">Conecta tu correo para enviar desde aquí.</p>;
  return (
    <div className="space-y-2" data-compose>
      {mailboxes.length > 1 && (
        <Select aria-label="Desde" value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}>
          {mailboxes.map((m) => <option key={m.id} value={m.id}>{m.emailAddress}</option>)}
        </Select>
      )}
      {mailboxes.length === 1 && !compact && <p className="text-xs text-soft">Desde {mailboxes[0].emailAddress}</p>}
      <Input aria-label="Para" placeholder="Para (separa con comas)" value={to} onChange={(e) => setTo(e.target.value)} data-compose-to />
      {!compact && <Input aria-label="CC" placeholder="CC (opcional)" value={cc} onChange={(e) => setCc(e.target.value)} />}
      {!initial.replyToMessageId && <Input aria-label="Asunto" placeholder="Asunto" value={subject} onChange={(e) => setSubject(e.target.value)} data-compose-subject />}
      <Textarea aria-label="Mensaje" rows={compact ? 5 : 10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe tu mensaje" data-compose-text />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {initial.quote && <span className="inline-flex items-center gap-1 rounded-full bg-ivory px-2 py-1 text-graphite" data-compose-quote><FileText className="size-3.5" aria-hidden /> {initial.quote.number}.pdf (se adjunta al enviar)</span>}
        {initial.forwardedAttachments?.map((name) => <span key={name} className="inline-flex items-center gap-1 rounded-full bg-ivory px-2 py-1 text-graphite"><Paperclip className="size-3.5" aria-hidden /> {name}</span>)}
        {files.map((f, i) => (
          <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-ivory px-2 py-1 text-graphite">
            <Paperclip className="size-3.5" aria-hidden /> {f.name}
            <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="size-3.5" /></button>
          </span>
        ))}
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line px-2 py-1 text-graphite hover:border-electric">
          <Paperclip className="size-3.5" aria-hidden /> Adjuntar
          <input type="file" multiple className="sr-only" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10)); e.target.value = ''; }} data-compose-files />
        </label>
        {total > 0 && <span className={total > MAX_BYTES ? 'text-danger-ink' : 'text-soft'}>{(total / 1024 / 1024).toFixed(1)} de 15 MB</span>}
      </div>
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={busy} onClick={() => void send()} data-compose-send>{busy ? 'Enviando…' : 'Enviar'}</Button>
        {onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>}
      </div>
    </div>
  );
}
