import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2, Calendar, Globe2, Mail, Phone } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { StatusBadge } from '@/components/ui/status-badge';
import { getContactDetail } from '@/lib/crm-data';
import { formatCurrency, getInitials, stageLabels } from '@/lib/mock-data';
import { contactStatusLabel, contactStatusTone, stageTone } from '@/lib/status-tone';

export const dynamic = 'force-dynamic';

const activityLabels = {
  email: 'Email',
  call: 'Llamada',
  meeting: 'Reunion',
  note: 'Nota',
  deal: 'Cierre',
};

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContactDetail(id);

  if (!contact) notFound();

  const info = [
    { icon: Mail, label: 'Email', value: contact.email },
    { icon: Phone, label: 'Telefono', value: contact.phone },
    { icon: Building2, label: 'Empresa', value: contact.company },
    { icon: Globe2, label: 'Fuente', value: contact.source },
    {
      icon: Calendar,
      label: 'Creado',
      value: new Date(contact.createdAt).toLocaleDateString('es-CL'),
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title={contact.name} subtitle="Ficha completa del contacto" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link href="/contactos">
              <ArrowLeft strokeWidth={1.75} />
              Volver a contactos
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="bg-carbon text-base font-bold text-canvas">
                    {getInitials(contact.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold leading-tight text-carbon">
                    {contact.name}
                  </p>
                  <p className="truncate text-[13px] text-ash">{contact.company}</p>
                </div>
              </div>
              <StatusBadge className="mt-4" tone={contactStatusTone[contact.status]}>
                {contactStatusLabel[contact.status]}
              </StatusBadge>
            </Card>

            <Card tone="dark" className="p-6">
              <Eyebrow>Valor del contacto</Eyebrow>
              <p className="type-display tabular mt-2 text-[44px]">
                {formatCurrency(contact.value)}
              </p>
            </Card>

            <Card className="p-6">
              <Eyebrow className="mb-4">Informacion</Eyebrow>
              <dl className="space-y-3.5">
                {info.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-3">
                    <Icon
                      className="h-4 w-4 shrink-0 text-stone"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <dt className="w-16 shrink-0 text-xs text-soft">{label}</dt>
                    <dd className="min-w-0 flex-1 truncate text-[13px] font-medium text-carbon">
                      {value || 'Sin dato'}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <div className="min-w-0 space-y-4">
            <Card className="p-6">
              <Eyebrow>Pipeline</Eyebrow>
              <h2 className="mb-2 mt-1 text-lg font-bold tracking-tight">
                Oportunidades asociadas
              </h2>
              <div className="divide-y divide-line">
                {contact.opportunities.map((opportunity) => (
                  <div
                    key={opportunity.id}
                    className="flex items-center justify-between gap-4 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-carbon">
                        {opportunity.title}
                      </p>
                      <p className="text-xs text-soft">{opportunity.probability}% probabilidad</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <p className="tabular text-sm font-bold text-carbon">
                        {formatCurrency(opportunity.value)}
                      </p>
                      <StatusBadge variant="dot" tone={stageTone[opportunity.stage]}>
                        {stageLabels[opportunity.stage]}
                      </StatusBadge>
                    </div>
                  </div>
                ))}
                {contact.opportunities.length === 0 && (
                  <p className="py-3 text-sm text-soft">Sin oportunidades asociadas.</p>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <Eyebrow>Bitácora</Eyebrow>
              <h2 className="mb-5 mt-1 text-lg font-bold tracking-tight">Timeline</h2>
              {(contact.activities.length > 0 || contact.webEvents.length > 0) && (
                <ol className="relative space-y-5 border-l border-line pl-6">
                  {contact.activities.map((activity) => (
                    <li key={activity.id} className="relative">
                      <span
                        aria-hidden
                        className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-carbon"
                      />
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="neutral">{activityLabels[activity.type]}</Badge>
                        <span className="text-xs text-soft">{activity.time}</span>
                        {activity.dueAt && !activity.completedAt && (
                          <Badge variant="warning">Pendiente</Badge>
                        )}
                      </div>
                      <p className="text-[13px] text-graphite">{activity.description}</p>
                    </li>
                  ))}
                  {contact.webEvents.map((event) => (
                    <li key={event.id} className="relative">
                      <span
                        aria-hidden
                        className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-electric"
                      />
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="info">{event.type}</Badge>
                        <span className="text-xs text-soft">
                          {new Date(event.createdAt).toLocaleDateString('es-CL')}
                        </span>
                      </div>
                      <p className="truncate text-[13px] text-graphite">{event.pageUrl}</p>
                    </li>
                  ))}
                </ol>
              )}
              {contact.activities.length === 0 && contact.webEvents.length === 0 && (
                <p className="-mt-1 text-sm text-soft">Sin eventos en el timeline.</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
