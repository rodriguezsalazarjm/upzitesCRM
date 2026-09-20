import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { StatusBadge } from '@/components/ui/status-badge';
import { ChannelLabel } from '@/components/channels/channel-badge';
import {
  INTENT_LABEL,
  LIFECYCLE_LABEL,
  LIFECYCLE_TONE,
  TEMPERATURE_LABEL,
} from '@/components/inbox/conversation-meta';
import { formatCurrency } from '@/lib/mock-data';
import { getInitials } from '@/lib/utils';
import type { Channel } from '../../../generated/prisma/client';

export type ContextOpportunity = {
  title: string;
  stageName: string;
  value: number;
  probability: number;
} | null;

export type ContextContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lifecycleStatus: string;
  temperature: string;
  buyingIntent: string;
  leadScore: number;
  value: number;
  source: string | null;
  tags: string[];
  lastActivityAt: string | null;
  createdAt: string;
  customFields: Record<string, string>;
};

const MAX_TAGS = 8;
const MAX_FIELDS = 4;

function day(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin registro';
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 text-xs text-ash">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] font-medium text-carbon">{children}</dd>
    </div>
  );
}

/**
 * Panel de contexto: solo lo que ayuda a responder. Contacto, canal, estado,
 * oportunidad, etiquetas y actividad; el resto vive en la ficha completa.
 */
export function ContactContext({
  contact,
  channel,
  channelIdentity,
  assigneeName,
  opportunity,
}: {
  contact: ContextContact;
  channel: Channel;
  channelIdentity: string;
  assigneeName: string | null;
  opportunity: ContextOpportunity;
}) {
  const tags = contact.tags.slice(0, MAX_TAGS);
  const hiddenTags = contact.tags.length - tags.length;
  const fields = Object.entries(contact.customFields).slice(0, MAX_FIELDS);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-carbon text-sm font-bold text-canvas">{getInitials(contact.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-bold leading-tight text-carbon">{contact.name}</p>
            <p className="truncate text-xs text-ash">{contact.email ?? contact.phone ?? 'Sin datos de contacto'}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={LIFECYCLE_TONE[contact.lifecycleStatus] ?? 'neutral'}>
            {LIFECYCLE_LABEL[contact.lifecycleStatus] ?? contact.lifecycleStatus}
          </StatusBadge>
          <span className="text-xs text-ash">
            {TEMPERATURE_LABEL[contact.temperature] ?? contact.temperature} · score {contact.leadScore}
          </span>
        </div>

        <dl className="divide-y divide-line border-y border-line">
          <Row label="Canal">
            <ChannelLabel channel={channel} />
          </Row>
          <Row label="Identidad">{channelIdentity}</Row>
          <Row label="Intención">{INTENT_LABEL[contact.buyingIntent] ?? contact.buyingIntent}</Row>
          <Row label="Asignada a">{assigneeName ?? 'Sin asignar'}</Row>
          <Row label="Fuente">{contact.source ?? 'Sin fuente'}</Row>
          <Row label="Última actividad">{day(contact.lastActivityAt)}</Row>
        </dl>

        <div>
          <Eyebrow className="mb-2">Oportunidad</Eyebrow>
          {opportunity ? (
            <div className="rounded-xl bg-ivory p-4">
              <p className="text-[13px] font-bold leading-snug text-carbon">{opportunity.title}</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="type-display tabular text-[28px] text-carbon">{formatCurrency(opportunity.value)}</p>
                <p className="pb-1 text-xs text-ash">{opportunity.probability}% prob.</p>
              </div>
              <StatusBadge className="mt-2" variant="dot" tone="ink">
                {opportunity.stageName}
              </StatusBadge>
            </div>
          ) : (
            <p className="text-[13px] text-ash">Sin oportunidad asociada.</p>
          )}
        </div>

        {tags.length > 0 && (
          <div>
            <Eyebrow className="mb-2">Etiquetas</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="neutral">
                  {tag}
                </Badge>
              ))}
              {hiddenTags > 0 && <Badge variant="outline">+{hiddenTags}</Badge>}
            </div>
          </div>
        )}

        {fields.length > 0 && (
          <div>
            <Eyebrow className="mb-1">Datos</Eyebrow>
            <dl className="divide-y divide-line">
              {fields.map(([key, value]) => (
                <Row key={key} label={key}>
                  {value}
                </Row>
              ))}
            </dl>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-4">
        <Button variant="outline" className="w-full" asChild>
          <Link href={`/contactos/${contact.id}`}>
            Ver ficha completa <ArrowUpRight strokeWidth={2} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
