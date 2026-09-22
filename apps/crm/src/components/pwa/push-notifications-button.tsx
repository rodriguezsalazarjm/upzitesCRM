'use client';

import { Bell, BellOff, Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type Preferences = {
  notifyHumanAttention: boolean;
  notifyAssigned: boolean;
  notifyQuoteApproval: boolean;
  notifyOperationalIssue: boolean;
  notifyIncomingMessage: boolean;
};

const DEFAULT_PREFERENCES: Preferences = {
  notifyHumanAttention: true,
  notifyAssigned: true,
  notifyQuoteApproval: true,
  notifyOperationalIssue: true,
  notifyIncomingMessage: true,
};

const LABELS: Array<[keyof Preferences, string]> = [
  ['notifyHumanAttention', 'Solicitudes de atención humana'],
  ['notifyAssigned', 'Conversaciones que me asignan'],
  ['notifyQuoteApproval', 'Cotizaciones por aprobar'],
  ['notifyOperationalIssue', 'Problemas que requieren intervención'],
  ['notifyIncomingMessage', 'Mensajes de conversaciones asignadas'],
];

function applicationServerKey(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  const binary = window.atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function PushNotificationsButton() {
  const [configured, setConfigured] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const available =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!available) return;

    const load = async () => {
      const response = await fetch('/api/push/subscriptions');
      if (!response.ok) return;
      const body = await response.json();
      setConfigured(Boolean(body.data?.configured));
      setPublicKey(body.data?.publicKey ?? null);
      const registration = await navigator.serviceWorker.getRegistration();
      const browserSubscription = (await registration?.pushManager.getSubscription()) ?? null;
      const saved = body.data?.subscriptions?.find(
        (item: { endpoint: string }) => item.endpoint === browserSubscription?.endpoint,
      );
      if (browserSubscription && !saved) {
        await browserSubscription.unsubscribe();
        setSubscription(null);
        return;
      }
      setSubscription(browserSubscription);
      if (saved) {
        setPreferences({
          notifyHumanAttention: saved.notifyHumanAttention,
          notifyAssigned: saved.notifyAssigned,
          notifyQuoteApproval: saved.notifyQuoteApproval,
          notifyOperationalIssue: saved.notifyOperationalIssue,
          notifyIncomingMessage: saved.notifyIncomingMessage,
        });
      }
    };
    void load().catch(() => setMessage('No pudimos consultar las notificaciones.'));
  }, []);

  async function enable() {
    setMessage(null);
    if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) {
      setOpen(true);
      setMessage('Este navegador no admite notificaciones push.');
      return;
    }
    if (!configured || !publicKey) {
      setOpen(true);
      setMessage('Las notificaciones todavía no están disponibles en tu cuenta.');
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage('El navegador no autorizó las notificaciones.');
        setOpen(true);
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const saved =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(publicKey),
        }));
      const json = saved.toJSON();
      const response = await fetch('/api/push/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: saved.endpoint,
          expirationTime: saved.expirationTime,
          keys: json.keys,
          deviceLabel: navigator.platform || 'Este dispositivo',
          preferences,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? 'No pudimos activar las notificaciones.');
      setSubscription(saved);
      setMessage('Notificaciones activadas en este dispositivo.');
      setOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos activar las notificaciones.');
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function savePreferences() {
    if (!subscription) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/push/subscriptions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint, preferences }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? 'No pudimos guardar las preferencias.');
      }
      setMessage('Preferencias guardadas.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos guardar las preferencias.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!subscription) return;
    setBusy(true);
    setMessage(null);
    try {
      await fetch('/api/push/subscriptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
      setSubscription(null);
      setMessage('Notificaciones desactivadas en este dispositivo.');
    } finally {
      setBusy(false);
    }
  }

  const active = Boolean(subscription);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={active ? 'Configurar notificaciones' : 'Activar notificaciones'}
        disabled={busy}
        onClick={() => (active ? setOpen((value) => !value) : void enable())}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-mist bg-paper text-carbon outline-none transition-colors hover:border-carbon focus-visible:ring-2 focus-visible:ring-electric disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        {active && (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-lime ring-2 ring-paper" />
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-[70] ml-auto w-auto max-w-sm rounded-xl border border-line bg-paper p-4 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-80">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-carbon">Notificaciones</p>
              <p className="mt-1 text-xs leading-5 text-ash">
                Elige qué avisos quieres recibir en este dispositivo.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </div>

          {active && (
            <div className="mt-3 space-y-2">
              {LABELS.map(([key, label]) => (
                <label key={key} className="flex items-start gap-2 text-xs text-graphite">
                  <input
                    type="checkbox"
                    checked={preferences[key]}
                    onChange={(event) =>
                      setPreferences((current) => ({ ...current, [key]: event.target.checked }))
                    }
                    className="mt-0.5 accent-electric"
                  />
                  {label}
                </label>
              ))}
              <div className="flex gap-2 pt-2">
                <Button type="button" size="sm" disabled={busy} onClick={() => void savePreferences()}>
                  <Check /> Guardar
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void disable()}>
                  <BellOff /> Desactivar
                </Button>
              </div>
            </div>
          )}

          {message && (
            <p
              role="status"
              className="mt-3 rounded-lg bg-ivory px-3 py-2 text-xs text-graphite"
            >
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
