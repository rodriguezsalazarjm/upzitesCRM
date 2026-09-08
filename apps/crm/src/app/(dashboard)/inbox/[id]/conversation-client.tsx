'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertCircle, Bot, Check, CheckCheck, Clock, RotateCw, Send, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ThreadMessage = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  senderType: 'CONTACT' | 'USER' | 'AI' | 'SYSTEM';
  senderName: string | null;
  text: string | null;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  errorMessage: string | null;
  createdAt: string;
};

/** Un icono por estado, para que el operador vea de un vistazo si llego. */
function StatusIcon({ status }: { status: ThreadMessage['status'] }) {
  if (status === 'QUEUED') return <Clock className="h-3 w-3 text-slate-400" />;
  if (status === 'SENT') return <Check className="h-3 w-3 text-slate-400" />;
  if (status === 'DELIVERED') return <CheckCheck className="h-3 w-3 text-slate-400" />;
  if (status === 'READ') return <CheckCheck className="h-3 w-3 text-blue-500" />;
  return <AlertCircle className="h-3 w-3 text-red-500" />;
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
  const [pending, startTransition] = useTransition();

  async function post(path: string, body?: unknown) {
    setError(null);
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.message ?? 'No se pudo completar la accion.');
      return false;
    }

    startTransition(() => router.refresh());
    return true;
  }

  async function send() {
    const value = text.trim();
    if (!value) return;
    const ok = await post(`/api/conversations/${conversationId}/messages`, { text: value });
    if (ok) setText('');
  }

  const isHuman = mode === 'HUMAN_ACTIVE';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-white px-6 py-3">
        {isHuman ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => post(`/api/conversations/${conversationId}/release-to-ai`)}
          >
            <Bot className="mr-1.5 h-3.5 w-3.5" />
            Devolver a IA
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => post(`/api/conversations/${conversationId}/takeover`)}
          >
            <User className="mr-1.5 h-3.5 w-3.5" />
            Tomar conversacion
          </Button>
        )}
        {pending && <span className="text-[11px] text-slate-400">Actualizando…</span>}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-6">
        {messages.length === 0 && (
          <p className="text-center text-xs text-slate-400">Sin mensajes en esta conversacion.</p>
        )}

        {messages.map((message) => {
          const outbound = message.direction === 'OUTBOUND';
          return (
            <div key={message.id} className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm',
                  outbound ? 'bg-blue-600 text-white' : 'bg-white text-slate-800',
                  message.status === 'FAILED' && 'ring-1 ring-red-400',
                )}
              >
                {outbound && message.senderType === 'AI' && (
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200">
                    IA
                  </p>
                )}
                {outbound && message.senderName && message.senderType === 'USER' && (
                  <p className="mb-0.5 text-[10px] font-semibold text-blue-200">{message.senderName}</p>
                )}

                <p className="whitespace-pre-wrap text-sm">{message.text ?? '(sin texto)'}</p>

                <div
                  className={cn(
                    'mt-1 flex items-center justify-end gap-1.5 text-[10px]',
                    outbound ? 'text-blue-200' : 'text-slate-400',
                  )}
                >
                  <span>
                    {new Date(message.createdAt).toLocaleTimeString('es-CL', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {outbound && <StatusIcon status={message.status} />}
                </div>

                {message.status === 'FAILED' && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-2 py-1.5">
                    <span className="flex-1 text-[10px] text-red-700">
                      {message.errorMessage ?? 'No se pudo enviar.'}
                    </span>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[10px] font-semibold text-red-700 hover:underline"
                      onClick={() => post(`/api/conversations/${conversationId}/messages/${message.id}/retry`)}
                    >
                      <RotateCw className="h-3 w-3" />
                      Reintentar
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t bg-white p-4">
        {!withinServiceWindow && (
          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            Pasaron mas de 24 horas desde el ultimo mensaje del cliente. WhatsApp solo permite
            responder con una plantilla aprobada.
          </p>
        )}

        {error && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</p>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Escribe un mensaje…  (Enter envia, Shift+Enter salta linea)"
            className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
          <Button onClick={() => void send()} disabled={!text.trim()} className="h-10">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
