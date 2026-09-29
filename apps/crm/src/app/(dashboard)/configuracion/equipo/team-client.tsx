'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Copy, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';

type Role = 'OWNER' | 'ADMIN' | 'MEMBER';
type Member = { userId: string; name: string; email: string; role: Role; status: 'ACTIVE' | 'SUSPENDED'; planLimited: boolean; isSelf: boolean; canManage: boolean; isLastOwner: boolean };
type Invitation = { id: string; email: string; role: Role; expiresAt: string; expired: boolean; seatBlocked: boolean; canManage: boolean };
type View = {
  seats: { active: number; reserved: number; limit: number; remaining: number };
  active: Member[];
  suspended: Member[];
  invitations: Invitation[];
  capabilities: { invite: boolean; inviteRoles: Role[]; changeRoles: boolean; readOnly: boolean };
};

const ROLE_LABEL: Record<Role, string> = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Miembro' };

async function call(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await response.json().catch(() => ({}))) as { message?: string; data?: { url?: string; emailSent?: boolean } };
  if (!response.ok) throw new Error(json.message ?? 'No pudimos completar la acción.');
  return json.data;
}

export function TeamClient({ view, requiredPlanName }: { view: View; requiredPlanName: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const { seats, capabilities } = view;
  const full = seats.remaining <= 0;
  const used = seats.active + seats.reserved;

  async function run(key: string, action: () => Promise<{ url?: string; emailSent?: boolean } | undefined>, success: string) {
    setBusy(key);
    setNotice(null);
    setLink(null);
    try {
      const data = await action();
      if (data?.url && data.emailSent === false) setLink(data.url);
      setNotice({ kind: 'success', text: data?.emailSent === false ? `${success} Copia el enlace y compártelo.` : success });
      router.refresh();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Error' });
    } finally {
      setBusy(null);
    }
  }

  function memberActions(member: Member) {
    if (!member.canManage) return null;
    const actions: React.ReactNode[] = [];
    const act = (label: string, body: unknown, success: string) => (
      <Button
        key={label}
        type="button"
        variant="outline"
        size="sm"
        disabled={busy !== null}
        onClick={() => void run(`${member.userId}:${label}`, () => call(`/api/team/members/${member.userId}`, body), success)}
      >
        {label}
      </Button>
    );
    if (member.status === 'SUSPENDED') return [act('Reactivar', { action: 'reactivate' }, 'Miembro reactivado.')];
    if (capabilities.changeRoles) {
      if (member.role === 'MEMBER') actions.push(act('Hacer admin', { action: 'change_role', role: 'ADMIN' }, 'Ahora es admin.'));
      if (member.role === 'ADMIN') actions.push(act('Hacer miembro', { action: 'change_role', role: 'MEMBER' }, 'Ahora es miembro.'));
      if (member.role !== 'OWNER') actions.push(act('Promover a owner', { action: 'change_role', role: 'OWNER' }, 'Ahora también es owner.'));
      if (member.role === 'OWNER' && !member.isLastOwner) actions.push(act('Quitar owner', { action: 'change_role', role: 'ADMIN' }, 'Ahora es admin.'));
    }
    if (!member.isLastOwner) actions.push(act('Suspender', { action: 'suspend' }, 'Miembro suspendido: ya no entra a este negocio.'));
    if (member.isLastOwner) actions.push(<span key="last" className="text-xs text-soft">Único owner: promueve a otra persona antes de cambiar su acceso.</span>);
    return actions;
  }

  function memberRow(member: Member) {
    return (
      <li key={member.userId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" data-member={member.email}>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-carbon">
            {member.name} {member.isSelf && <span className="text-xs font-normal text-soft">(tú)</span>}
          </p>
          <p className="truncate text-xs text-soft">{member.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={member.role === 'OWNER' ? 'ink' : 'info'}>{ROLE_LABEL[member.role]}</StatusBadge>
          {member.status === 'SUSPENDED' ? (
            <StatusBadge tone="danger">Suspendido por un administrador</StatusBadge>
          ) : member.planLimited ? (
            <StatusBadge tone="warning">Limitado por tu plan</StatusBadge>
          ) : null}
          {memberActions(member)}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <Eyebrow>Equipo</Eyebrow>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-carbon" data-seats>
          {used} de {seats.limit} usuarios
        </h2>
        <p className="mt-1 text-sm text-soft">
          {seats.active} {seats.active === 1 ? 'activo' : 'activos'} · {seats.reserved}{' '}
          {seats.reserved === 1 ? 'invitación pendiente' : 'invitaciones pendientes'}. Las invitaciones pendientes reservan un lugar hasta que
          vencen o las revocas.
        </p>

        {capabilities.readOnly ? (
          <p className="mt-4 rounded-lg bg-ivory px-3 py-2 text-sm text-graphite">Puedes ver el equipo. Solo un owner o admin puede invitar o cambiar accesos.</p>
        ) : (
          <form
            className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void run('invite', () => call('/api/team/invitations', { email, role }), 'Invitación creada.').then(() => setEmail(''));
            }}
          >
            <FormField label="Email" htmlFor="team-email">
              <Input id="team-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={full || busy !== null} placeholder="persona@empresa.cl" />
            </FormField>
            <FormField label="Rol" htmlFor="team-role">
              <Select id="team-role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={full || busy !== null}>
                {capabilities.inviteRoles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button type="submit" disabled={full || busy !== null}>
              Invitar miembro
            </Button>
          </form>
        )}
        {!capabilities.readOnly && full && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-warning-ink" role="status">
            <Lock className="h-4 w-4" aria-hidden />
            Has alcanzado el límite de usuarios de tu plan.
            {requiredPlanName && ` Disponible con más usuarios en ${requiredPlanName}.`}
          </p>
        )}
        {notice && (
          <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'mt-3 text-sm font-medium text-danger-ink' : 'mt-3 text-sm text-soft'}>
            {notice.text}
          </p>
        )}
        {link && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-ivory p-3">
            <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(link)}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar enlace
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-base font-bold text-carbon">Miembros activos ({view.active.length})</h3>
        <ul className="mt-2 divide-y divide-line">{view.active.map(memberRow)}</ul>
      </Card>

      <Card className="p-6">
        <h3 className="text-base font-bold text-carbon">Invitaciones pendientes ({view.invitations.length})</h3>
        {view.invitations.length === 0 ? (
          <p className="mt-2 text-sm text-soft">No hay invitaciones pendientes.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {view.invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" data-invitation={invitation.email}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-carbon">{invitation.email}</p>
                  <p className="text-xs text-soft">
                    {ROLE_LABEL[invitation.role]} ·{' '}
                    {invitation.expired ? 'Vencida: ya no reserva lugar' : `Vence el ${new Date(invitation.expiresAt).toLocaleDateString('es-CL')}`}
                  </p>
                  {invitation.seatBlocked && <p className="text-xs font-medium text-warning-ink">Esta invitación requiere un cupo disponible.</p>}
                </div>
                {invitation.canManage && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(`${invitation.id}:resend`, () => call(`/api/team/invitations/${invitation.id}`, { action: 'resend' }), 'Invitación reenviada.')}>
                      Reenviar
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(`${invitation.id}:revoke`, () => call(`/api/team/invitations/${invitation.id}`, { action: 'revoke' }), 'Invitación revocada.')}>
                      Revocar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {view.suspended.length > 0 && (
        <Card className="p-6">
          <h3 className="text-base font-bold text-carbon">Miembros suspendidos ({view.suspended.length})</h3>
          <p className="mt-1 text-xs text-soft">No entran a este negocio ni ocupan lugar. Su historial se conserva.</p>
          <ul className="mt-2 divide-y divide-line">{view.suspended.map(memberRow)}</ul>
        </Card>
      )}
    </div>
  );
}
