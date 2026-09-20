'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Building2,
  Calendar,
  ChevronRight,
  Download,
  Mail,
  Phone,
  Search,
  Users,
  X,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow } from '@/components/ui/eyebrow';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { FilterBar, ToolbarSearch, ToolbarSpacer } from '@/components/ui/toolbar';
import type { Contact } from '@/lib/mock-data';
import { contactStatusLabel, contactStatusTone } from '@/lib/status-tone';
import { cn, getInitials } from '@/lib/utils';

const statusFilter: Array<{ value: string; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'lead', label: 'Leads' },
  { value: 'activo', label: 'Activos' },
  { value: 'cliente', label: 'Clientes' },
  { value: 'inactivo', label: 'Inactivos' },
];

function formatCurrencyLocal(amount: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    notation: 'compact',
  }).format(amount);
}

function ContactDetail({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const info = [
    { label: 'Email', value: contact.email, icon: Mail },
    { label: 'Teléfono', value: contact.phone, icon: Phone },
    { label: 'Empresa', value: contact.company, icon: Building2 },
    { label: 'Fuente', value: contact.source, icon: ArrowUpRight },
    {
      label: 'Creado',
      value: new Date(contact.createdAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }),
      icon: Calendar,
    },
  ];

  return (
    <aside
      aria-label={`Detalle de ${contact.name}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-line bg-paper max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-16 max-lg:z-40 max-lg:rounded-b-none lg:sticky lg:top-0"
    >
      <div className="flex items-start gap-3 border-b border-line p-5">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="bg-carbon text-sm font-bold text-canvas">{getInitials(contact.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold leading-tight text-carbon">{contact.name}</p>
          <p className="truncate text-[13px] text-ash">{contact.company}</p>
          <StatusBadge className="mt-2" tone={contactStatusTone[contact.status]}>
            {contactStatusLabel[contact.status]}
          </StatusBadge>
        </div>
        <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-9 w-9" onClick={onClose} aria-label="Cerrar detalle">
          <X strokeWidth={1.75} />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="grid grid-cols-3 gap-2">
          <Button variant="dark" size="sm">
            <Mail /> Email
          </Button>
          <Button variant="outline" size="sm">
            <Phone /> Llamar
          </Button>
          <Button variant="outline" size="sm">
            <Calendar /> Agendar
          </Button>
        </div>

        <Card tone="dark" className="p-5">
          <Eyebrow>Valor del contacto</Eyebrow>
          <p className="type-display tabular mt-2 text-[44px]">{formatCurrencyLocal(contact.value)}</p>
        </Card>

        <div>
          <Eyebrow className="mb-3">Información</Eyebrow>
          <dl className="space-y-3">
            {info.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-stone" strokeWidth={1.75} aria-hidden />
                <dt className="w-16 shrink-0 text-xs text-soft">{label}</dt>
                <dd className="min-w-0 flex-1 truncate text-[13px] font-medium text-carbon">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {contact.tags.length > 0 && (
          <div>
            <Eyebrow className="mb-2.5">Etiquetas</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-line p-4">
        <Button variant="outline" className="w-full" asChild>
          <Link href={`/contactos/${contact.id}`}>
            Ver ficha completa <ArrowUpRight strokeWidth={2} />
          </Link>
        </Button>
      </div>
    </aside>
  );
}

export function ContactosClient({ contacts }: { contacts: Contact[] }) {
  const [search, setSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState('todos');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  useEffect(() => {
    if (!selectedContact) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedContact(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedContact]);

  const filtered = contacts.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = activeStatus === 'todos' || c.status === activeStatus;
    return matchSearch && matchStatus;
  });

  const tabs = statusFilter.map((item) => ({
    ...item,
    count: item.value === 'todos' ? contacts.length : contacts.filter((c) => c.status === item.value).length,
  }));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Contactos"
        subtitle={`${contacts.length} contactos en total`}
        action={{ label: 'Nuevo contacto', href: '/contactos/nuevo' }}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        {contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Aún no hay contactos"
            description="Cuando alguien escriba o llegue desde tus fuentes, aparecerá aquí."
            action={
              <Button asChild className="mt-2">
                <Link href="/contactos/nuevo">Nuevo contacto</Link>
              </Button>
            }
          />
        ) : (
          <div
            className={cn(
              'grid items-start gap-4',
              selectedContact ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : 'grid-cols-1',
            )}
          >
            <Card className="min-w-0 overflow-hidden">
              <FilterBar>
                <ToolbarSearch
                  className="sm:w-80"
                  label="Buscar contactos"
                  placeholder="Buscar por nombre, empresa o email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Tabs
                  semantics="filter"
                  ariaLabel="Filtrar por estado"
                  items={tabs}
                  value={activeStatus}
                  onValueChange={setActiveStatus}
                />
                <ToolbarSpacer />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.location.href = '/api/contacts/export';
                  }}
                >
                  <Download strokeWidth={1.75} /> Exportar
                </Button>
              </FilterBar>

              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Contacto</TableHead>
                    <TableHead className="hidden sm:table-cell">Empresa</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden lg:table-cell">Fuente</TableHead>
                    <TableHead align="right">Valor</TableHead>
                    <TableHead className="hidden xl:table-cell">Última act.</TableHead>
                    <TableHead>
                      <span className="sr-only">Abrir detalle</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((contact) => {
                    const selected = selectedContact?.id === contact.id;
                    return (
                      <TableRow
                        key={contact.id}
                        interactive
                        selected={selected}
                        onClick={() => setSelectedContact(selected ? null : contact)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-ivory text-[11px] font-bold text-graphite">
                                {getInitials(contact.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-carbon">{contact.name}</p>
                              <p className="truncate text-xs text-soft">{contact.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-graphite sm:table-cell">{contact.company}</TableCell>
                        <TableCell>
                          <StatusBadge tone={contactStatusTone[contact.status]}>
                            {contactStatusLabel[contact.status]}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="hidden text-graphite lg:table-cell">{contact.source}</TableCell>
                        <TableCell numeric>{formatCurrencyLocal(contact.value)}</TableCell>
                        <TableCell muted className="hidden xl:table-cell">
                          {new Date(contact.lastActivity).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                        </TableCell>
                        <TableCell className="w-10">
                          <ChevronRight
                            aria-hidden
                            className={cn(
                              'h-4 w-4 text-mist transition-transform',
                              selected && 'rotate-90 text-electric',
                            )}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableEmpty colSpan={7} icon={Search} title="Sin resultados" description="Prueba con otros filtros." />
                  )}
                </TableBody>
              </Table>

              <div className="border-t border-line px-5 py-3 text-xs text-soft" aria-live="polite">
                {filtered.length} de {contacts.length} contactos
              </div>
            </Card>

            {selectedContact && <ContactDetail contact={selectedContact} onClose={() => setSelectedContact(null)} />}
          </div>
        )}
      </div>
    </div>
  );
}
