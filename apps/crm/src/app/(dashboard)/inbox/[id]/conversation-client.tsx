'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  AlertCircle,
  Ban,
  Bot,
  Check,
  CheckCheck,
  Clock,
  FileText,
  MessageSquare,
  Paperclip,
  RotateCw,
  Send,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { MODE_LABEL, MODE_TONE } from '@/components/inbox/conversation-meta';
import { cn } from '@/lib/utils';

export type ThreadMedia = {
  id: string;
  status:
    | 'PENDING'
    | 'DOWNLOADING'
    | 'STORED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'BLOCKED'
    | 'FAILED'
    | 'PURGED';
  kind: string;
  mimeType: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  /** Se puede mostrar dentro de la pagina; lo decidio el servidor, no el tipo declarado. */
  inline: boolean;
};

export type ThreadMessage = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  senderType: 'CONTACT' | 'USER' | 'AI' | 'SYSTEM';
  senderName: string | null;
  text: string | null;
  type: string;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'CANCELLED';
  errorMessage: string | null;
  media: ThreadMedia | null;
  createdAt: string;
};

function formatSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Que dice la bandeja cuando el archivo todavia no esta, o ya no va a estar. */
const MEDIA_NOTICE: Record<ThreadMedia['status'], string | null> = {
  PENDING: 'Descargando archivo…',
  DOWNLOADING: 'Descargando archivo…',
  STORED: null,
  REJECTED: 'Archivo no admitido por politica de seguridad.',
  EXPIRED: 'WhatsApp ya no conserva este archivo.',
  BLOCKED: 'Falta configurar el almacenamiento de archivos.',
  FAILED: 'No se pudo descargar el archivo.',
  PURGED: 'Archivo eliminado por politica de retencion.',
};

const LABELS: Record<string, string> = {
  IMAGE: 'Imagen',
  AUDIO: 'Audio',
  VIDEO: 'Video',
  DOCUMENT: 'Documento',
};

/**
 * El adjunto dentro de la burbuja.
 *
 * Un archivo que no llego nunca se muestra como una burbuja vacia: siempre dice
 * en que estado quedo. Y solo se incrusta lo que el servidor marco como seguro
 * de mostrar; el resto se ofrece para descargar.
 * `dark` = la burbuja que lo contiene es Carbon (mensaje humano saliente).
 */
function MediaBubble({
  media,
  dark,
  onRetry,
}: {
  media: ThreadMedia;
  dark: boolean;
  onRetry: (mediaId: string) => void;
}) {
  const href = `/api/media/${media.id}`;
  const label = LABELS[media.kind] ?? 'Adjunto';
  const size = formatSize(media.sizeBytes);
  const notice = MEDIA_NOTICE[media.status];
  const retryable = media.status === 'FAILED' || media.status === 'BLOCKED';
  const chip = dark ? 'bg-white/10 text-canvas' : 'bg-ivory text-carbon';
  const tile = dark ? 'bg-white/10' : 'bg-paper';

  if (media.status === 'STORED' && media.inline) {
    if (media.mimeType?.startsWith('image/')) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="block overflow-hidden rounded-xl border border-line outline-none focus-visible:outline-2 focus-visible:outline-electric"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={media.fileName ?? label}
            loading="lazy"
            className="max-h-72 w-full object-cover"
          />
        </a>
      );
    }

    if (media.mimeType?.startsWith('audio/')) {
      return <audio controls preload="none" src={href} className="w-full max-w-[16rem]" />;
    }

    if (media.mimeType?.startsWith('video/')) {
      return <video controls preload="none" src={href} className="max-h-72 w-full rounded-xl" />;
    }
  }

  if (media.status === 'STORED') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={cn(
          'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs outline-none focus-visible:outline-2 focus-visible:outline-electric',
          chip,
        )}
      >
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tile)}>
          <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{media.fileName ?? label}</span>
          {size && <span className="block opacity-70">{size}</span>}
        </span>
        <span className="sr-only">Abrir archivo</span>
      </a>
    );
  }

  return (
    <div className={cn('rounded-xl px-2.5 py-2 text-xs', chip)}>
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tile)}>
          <Paperclip className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">{media.fileName ?? label}</span>
      </div>
      {notice && <p className="mt-1.5 opacity-80">{notice}</p>}
      {retryable && (
        <button
          type="button"
          className="mt-1.5 inline-flex items-center gap-1 rounded font-semibold underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-electric"
          onClick={() => onRetry(media.id)}
        >
          <RotateCw className="h-3 w-3" aria-hidden />
          Reintentar descarga
        </button>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<ThreadMessage['status'], string> = {
  QUEUED: 'En cola',
  SENDING: 'Enviando',
  SENT: 'Enviado',
  DELIVERED: 'Entregado',
  READ: 'Leído',
  FAILED: 'No enviado',
  CANCELLED: 'Cancelado',
};

/**
 * Estado de envío: icono discreto + nombre accesible. En cola/enviando además
 * se dice con palabras, porque es el estado que el operador espera ver cambiar.
 */
function StatusIcon({ status }: { status: ThreadMessage['status'] }) {
  const label = STATUS_TEXT[status];
  const icon =
    status === 'QUEUED' || status === 'SENDING' ? (
      <Clock className="h-3 w-3 text-stone" aria-hidden />
    ) : status === 'CANCELLED' ? (
      <Ban className="h-3 w-3 text-warning-ink" aria-hidden />
    ) : status === 'SENT' ? (
      <Check className="h-3 w-3 text-stone" aria-hidden />
    ) : status === 'DELIVERED' ? (
      <CheckCheck className="h-3 w-3 text-stone" aria-hidden />
    ) : status === 'READ' ? (
      <CheckCheck className="h-3 w-3 text-electric" aria-hidden />
    ) : (
      <AlertCircle className="h-3 w-3 text-danger-ink" aria-hidden />
    );

  return (
    <span className="inline-flex items-center gap-1">
      {icon}
      {status === 'QUEUED' || status === 'SENDING' ? (
        <span>{label}…</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL');
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  return date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function ConversationClient({
  conversationId,
  mode,
  withinServiceWindow,
  messages,
}: {
  conversationId: string;
  mode: string;
  withinServiceWindow: boolean;
  messages: ThreadMessage[];
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const draftKey = `crm:conversation-draft:${conversationId}`;

  useEffect(() => {
    queueMicrotask(() => setText(window.localStorage.getItem(draftKey) ?? ''));
    const updateOnline = () => setOnline(window.navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, [draftKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  function updateDraft(value: string) {
    setText(value);
    if (value) window.localStorage.setItem(draftKey, value);
    else window.localStorage.removeItem(draftKey);
  }

  async function post(path: string, body?: unknown) {
    setError(null);
    setNotice(null);
    if (!window.navigator.onLine) {
      setError(
        'No tienes conexión. Conservamos el texto para que lo envíes cuando vuelvas a estar en línea.',
      );
      return false;
    }

    let response: Response;
    try {
      response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      setError('No pudimos conectar con el CRM. Conservamos el texto y no se envió nada.');
      return false;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.message ?? 'No se pudo completar la accion.');
      return false;
    }

    const data = await response.json().catch(() => ({}));
    if (typeof data.data?.cancelledAutomaticMessages === 'number') {
      const cancelled = data.data.cancelledAutomaticMessages;
      const inFlight = data.data.automaticMessagesAlreadySending ?? 0;
      setNotice(
        inFlight > 0
          ? `Tomaste la conversación. ${cancelled} respuesta(s) automática(s) se cancelaron y ${inFlight} ya estaba(n) enviándose.`
          : cancelled > 0
            ? `Tomaste la conversación. Se cancelaron ${cancelled} respuesta(s) automática(s) pendiente(s).`
            : 'Tomaste la conversación. Las nuevas respuestas automáticas quedaron pausadas.',
      );
    }
    startTransition(() => router.refresh());
    return true;
  }

  async function retryMedia(mediaId: string) {
    const ok = await post(`/api/media/${mediaId}/retry`);
    if (ok) setNotice('La descarga del archivo se volvio a encolar.');
  }

  async function send() {
    const value = text.trim();
    if (!value) return;
    const ok = await post(`/api/conversations/${conversationId}/messages`, { text: value });
    if (ok) updateDraft('');
  }

  const isHuman = mode === 'HUMAN_ACTIVE';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-canvas px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <StatusBadge tone={MODE_TONE[mode] ?? 'neutral'}>{MODE_LABEL[mode] ?? mode}</StatusBadge>
          {isHuman && (
            <p className="hidden text-xs text-ash sm:block">La IA está pausada en esta conversación.</p>
          )}
          {pending && (
            <span aria-live="polite" className="text-xs text-ash">
              Actualizando…
            </span>
          )}
        </div>
        {isHuman ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => post(`/api/conversations/${conversationId}/release-to-ai`)}
          >
            <Bot strokeWidth={1.75} />
            Devolver a IA
          </Button>
        ) : (
          <Button
            size="sm"
            variant="dark"
            onClick={() => post(`/api/conversations/${conversationId}/takeover`)}
          >
            <User strokeWidth={1.75} />
            Tomar conversacion
          </Button>
        )}
      </div>

      <div
        role="log"
        aria-label="Mensajes de la conversación"
        aria-live="polite"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas px-3 py-5 sm:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory text-ash">
                <MessageSquare className="h-5 w-5" strokeWidth={1.5} aria-hidden />
              </span>
              <p className="text-sm font-bold text-carbon">Sin mensajes en esta conversacion.</p>
              <p className="max-w-xs text-[13px] text-ash">Cuando haya actividad, el hilo aparecerá aquí.</p>
            </div>
          )}

          {messages.map((message, index) => {
            const outbound = message.direction === 'OUTBOUND';
            const human = outbound && message.senderType === 'USER';
            const automated = outbound && !human;
            const previous = messages[index - 1];
            const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
            const newGroup =
              newDay ||
              previous.direction !== message.direction ||
              previous.senderType !== message.senderType;
            const failed = message.status === 'FAILED';
            const cancelled = message.status === 'CANCELLED';

            return (
              <div key={message.id} className="flex flex-col">
                {newDay && (
                  <div className="my-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ash first:mt-0">
                    <span className="h-px flex-1 bg-line" />
                    {dayLabel(message.createdAt)}
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}

                <div
                  className={cn(
                    'flex flex-col',
                    outbound ? 'items-end' : 'items-start',
                    newGroup ? 'mt-3 first:mt-0' : 'mt-1',
                  )}
                >
                  {newGroup && outbound && (
                    <p className="type-eyebrow mb-1 inline-flex items-center gap-1.5 text-ash">
                      {automated && (
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full bg-lime ring-1 ring-ink/40"
                        />
                      )}
                      {message.senderType === 'AI'
                        ? 'IA'
                        : message.senderType === 'SYSTEM'
                          ? 'Automático'
                          : (message.senderName ?? 'Equipo')}
                    </p>
                  )}

                  <div
                    className={cn(
                      'max-w-[88%] rounded-2xl px-3.5 py-2.5 sm:max-w-[78%]',
                      !outbound && 'rounded-bl-md border border-line bg-paper text-carbon',
                      human && 'rounded-br-md bg-carbon text-canvas',
                      automated && 'rounded-br-md border border-line bg-ivory text-carbon',
                      failed && 'border border-tomato',
                      cancelled && 'border border-dashed border-mist opacity-70',
                    )}
                  >
                    {message.media && (
                      <div className={cn(message.text && 'mb-2')}>
                        <MediaBubble media={message.media} dark={human} onRetry={retryMedia} />
                      </div>
                    )}

                    {message.text ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
                    ) : message.media ? null : (
                      // Un mensaje sin texto y sin adjunto sigue siendo posible
                      // (una ubicacion, un contacto compartido): se nombra en vez
                      // de dejar la burbuja vacia.
                      <p className="text-sm italic opacity-70">
                        {LABELS[message.type] ?? '(sin texto)'}
                      </p>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ash">
                    <time dateTime={message.createdAt}>
                      {new Date(message.createdAt).toLocaleTimeString('es-CL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    {outbound && <StatusIcon status={message.status} />}
                  </div>

                  {failed && (
                    <div className="mt-1.5 flex max-w-[88%] items-center gap-3 rounded-xl bg-tomato/10 px-3 py-2 sm:max-w-[78%]">
                      <span className="flex-1 text-xs text-danger-ink">
                        {message.errorMessage ?? 'No se pudo enviar.'}
                      </span>
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center gap-1 rounded text-xs font-semibold text-danger-ink underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-electric"
                        onClick={() =>
                          post(`/api/conversations/${conversationId}/messages/${message.id}/retry`)
                        }
                      >
                        <RotateCw className="h-3 w-3" aria-hidden />
                        Reintentar
                      </button>
                    </div>
                  )}
                  {cancelled && (
                    <p className="mt-1.5 max-w-[88%] rounded-xl bg-solar/25 px-3 py-2 text-xs text-warning-ink sm:max-w-[78%]">
                      {message.errorMessage ??
                        'Respuesta automática cancelada al tomar la conversación.'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-paper px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-4">
        <div className="mx-auto max-w-3xl">
          {!withinServiceWindow && (
            <p className="mb-2 rounded-xl bg-solar/25 px-3 py-2 text-xs text-warning-ink">
              Pasaron mas de 24 horas desde el ultimo mensaje del cliente. WhatsApp solo permite
              responder con una plantilla aprobada.
            </p>
          )}

          {error && (
            <p role="alert" className="mb-2 rounded-xl bg-tomato/12 px-3 py-2 text-xs text-danger-ink">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mb-2 rounded-xl bg-ivory px-3 py-2 text-xs text-graphite">
              {notice}
            </p>
          )}
          {!online && (
            <p className="mb-2 rounded-xl bg-solar/25 px-3 py-2 text-xs text-warning-ink">
              Sin conexión. Tu borrador queda guardado en este dispositivo y no se enviará solo.
            </p>
          )}

          <div className="rounded-2xl border border-mist bg-canvas transition-colors focus-within:border-electric focus-within:outline-2 focus-within:outline-electric/30">
            <textarea
              value={text}
              onChange={(event) => updateDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={1}
              aria-label="Escribe un mensaje"
              placeholder="Escribe un mensaje…  (Enter envia, Shift+Enter salta linea)"
              className="max-h-40 min-h-11 w-full resize-none bg-transparent px-4 pb-1 pt-3 text-base text-carbon outline-none [field-sizing:content] placeholder:text-stone sm:text-sm"
            />
            <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-1">
              <p className="hidden text-[11px] text-ash sm:block">Enter envía · Shift+Enter salta línea</p>
              <Button
                aria-label="Enviar mensaje"
                onClick={() => void send()}
                disabled={!text.trim() || !online || pending}
                size="sm"
                className="ml-auto"
              >
                <Send strokeWidth={1.75} />
                <span className="hidden sm:inline">Enviar</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
