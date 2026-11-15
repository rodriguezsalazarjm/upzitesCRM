'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Recipient = { conversationId: string; name: string; phone: string | null; windowEndsAt: string | null };

/**
 * Envio de prueba autorizado: solo a quien escribio a este numero en las
 * ultimas 24 h (lo unico que WhatsApp permite sin plantilla). Se confirma
 * antes, porque es un mensaje real a una persona real.
 */
export function TestSend({ channelId, recipients }: { channelId: string; recipients: Recipient[] }) {
  const [conversationId, setConversationId] = useState(recipients[0]?.conversationId ?? '');
  const [text, setText] = useState('Mensaje de prueba de conexión de Upzites Flow.');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (recipients.length === 0) {
    return (
      <p className="text-xs text-graphite">
        Para probar un envío, escribe primero a este número desde un teléfono de prueba tuyo: WhatsApp solo permite responder
        libremente dentro de las 24 h siguientes a un mensaje del contacto.
      </p>
    );
  }

  async function send() {
    setBusy(true);
    setResult(null);
    const response = await fetch(`/api/integrations/whatsapp/channels/${channelId}/test-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, text }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    setConfirm(false);
    setResult(
      response.ok
        ? { ok: true, text: 'En cola de envío. El estado (enviado, entregado, leído) llega desde Meta y se ve en el Inbox.' }
        : { ok: false, text: data.message ?? 'No se pudo encolar el envío.' },
    );
  }

  const recipient = recipients.find((item) => item.conversationId === conversationId);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Destinatario (ventana abierta)" htmlFor="ts-to">
          <Select id="ts-to" value={conversationId} onChange={(event) => setConversationId(event.target.value)}>
            {recipients.map((item) => (
              <option key={item.conversationId} value={item.conversationId}>
                {item.name}{item.phone ? ` · ${item.phone}` : ''}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Mensaje" htmlFor="ts-text">
          <Textarea id="ts-text" rows={2} maxLength={1000} value={text} onChange={(event) => setText(event.target.value)} />
        </FormField>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {result && <span className={`text-xs ${result.ok ? 'text-success-ink' : 'text-danger-ink'}`} role={result.ok ? undefined : 'alert'}>{result.text}</span>}
        <Button size="sm" variant="outline" disabled={!text.trim() || busy} onClick={() => setConfirm(true)}>Enviar prueba</Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="¿Enviar un mensaje real?"
        description={`Sale por WhatsApp a ${recipient?.name ?? 'este contacto'}${recipient?.phone ? ` (${recipient.phone})` : ''}. Úsalo solo con un teléfono de prueba tuyo.`}
        confirmLabel="Enviar"
        busy={busy}
        onConfirm={send}
      />
    </div>
  );
}
