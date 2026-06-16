import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2, Calendar, Globe2, Mail, Phone } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getContactDetail } from '@/lib/crm-data';
import { formatCurrency, getInitials, stageBadgeColors, stageLabels, statusColors } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title={contact.name} subtitle="Ficha completa del contacto" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/contactos">
              <ArrowLeft className="h-4 w-4" />
              Volver a contactos
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-blue-100 text-sm font-bold text-blue-700">
                      {getInitials(contact.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{contact.name}</p>
                    <p className="truncate text-xs text-slate-500">{contact.company}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <span className={cn('rounded-md px-2 py-1 text-[10px] font-semibold', statusColors[contact.status])}>
                    {contact.status}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Informacion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {[
                  { icon: Mail, label: 'Email', value: contact.email },
                  { icon: Phone, label: 'Telefono', value: contact.phone },
                  { icon: Building2, label: 'Empresa', value: contact.company },
                  { icon: Globe2, label: 'Fuente', value: contact.source },
                  {
                    icon: Calendar,
                    label: 'Creado',
                    value: new Date(contact.createdAt).toLocaleDateString('es-CL'),
                  },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-slate-400" />
                    <span className="w-16 shrink-0 text-slate-400">{label}</span>
                    <span className="truncate font-medium text-slate-700">{value || 'Sin dato'}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Oportunidades asociadas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {contact.opportunities.map((opportunity) => (
                    <div key={opportunity.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">{opportunity.title}</p>
                        <p className="text-[10px] text-slate-400">{opportunity.probability}% probabilidad</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-slate-900">{formatCurrency(opportunity.value)}</p>
                        <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-semibold', stageBadgeColors[opportunity.stage])}>
                          {stageLabels[opportunity.stage]}
                        </span>
                      </div>
                    </div>
                  ))}
                  {contact.opportunities.length === 0 && (
                    <p className="py-3 text-xs text-slate-400">Sin oportunidades asociadas.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {contact.activities.map((activity) => (
                    <div key={activity.id} className="rounded-lg border p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {activityLabels[activity.type]}
                        </Badge>
                        <span className="text-[10px] text-slate-400">{activity.time}</span>
                        {activity.dueAt && !activity.completedAt && (
                          <Badge variant="warning" className="text-[10px]">
                            Pendiente
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-700">{activity.description}</p>
                    </div>
                  ))}
                  {contact.webEvents.map((event) => (
                    <div key={event.id} className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="info" className="text-[10px]">
                          {event.type}
                        </Badge>
                        <span className="text-[10px] text-slate-400">
                          {new Date(event.createdAt).toLocaleDateString('es-CL')}
                        </span>
                      </div>
                      <p className="truncate text-xs text-slate-700">{event.pageUrl}</p>
                    </div>
                  ))}
                  {contact.activities.length === 0 && contact.webEvents.length === 0 && (
                    <p className="text-xs text-slate-400">Sin eventos en el timeline.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
