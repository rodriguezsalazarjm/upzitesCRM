'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search, Download, Phone, Mail,
  ArrowUpRight, Building2, Calendar, ChevronRight,
} from 'lucide-react';
import {
  statusColors, getInitials,
  type Contact, type ContactStatus,
} from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const statusLabels: Record<ContactStatus, string> = {
  lead: 'Lead',
  activo: 'Activo',
  cliente: 'Cliente',
  inactivo: 'Inactivo',
};

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

export function ContactosClient({ contacts }: { contacts: Contact[] }) {
  const [search, setSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState('todos');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const filtered = contacts.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = activeStatus === 'todos' || c.status === activeStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Contactos"
        subtitle={`${contacts.length} contactos en total`}
        action={{ label: 'Nuevo contacto', href: '/contactos/nuevo' }}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Lista */}
        <div className={cn('flex flex-col overflow-hidden transition-all', selectedContact ? 'w-[55%]' : 'w-full')}>
          {/* Filtros */}
          <div className="flex items-center gap-3 border-b bg-white px-6 py-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Buscar por nombre, empresa o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <div className="flex gap-1">
              {statusFilter.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setActiveStatus(s.value)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    activeStatus === s.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs ml-auto"
              onClick={() => {
                window.location.href = '/api/contacts/export';
              }}
            >
              <Download className="h-3.5 w-3.5" /> Exportar
            </Button>
          </div>

          {/* Tabla */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="border-b">
                  <th className="py-2.5 pl-6 pr-3 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Contacto</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Empresa</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Estado</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Fuente</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Valor</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Última act.</th>
                  <th className="px-3 py-2.5 pr-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((contact) => (
                  <tr
                    key={contact.id}
                    onClick={() => setSelectedContact(selectedContact?.id === contact.id ? null : contact)}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-blue-50/50',
                      selectedContact?.id === contact.id && 'bg-blue-50',
                    )}
                  >
                    <td className="py-3 pl-6 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-[9px] font-bold">
                            {getInitials(contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-slate-900">{contact.name}</p>
                          <p className="text-[10px] text-slate-400">{contact.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 text-slate-600">
                        <Building2 className="h-3 w-3 text-slate-300" />
                        {contact.company}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-semibold', statusColors[contact.status])}>
                        {statusLabels[contact.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{contact.source}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-800">
                      {formatCurrencyLocal(contact.value)}
                    </td>
                    <td className="px-3 py-3 text-slate-400">
                      {new Date(contact.lastActivity).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="px-3 py-3 pr-6">
                      <ChevronRight className={cn('h-3.5 w-3.5 text-slate-300 transition-transform', selectedContact?.id === contact.id && 'rotate-90 text-blue-500')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Search className="mb-3 h-8 w-8" />
                <p className="font-medium">Sin resultados</p>
                <p className="text-xs mt-1">Prueba con otros filtros</p>
              </div>
            )}
          </div>
        </div>

        {/* Panel de detalle */}
        {selectedContact && (
          <div className="flex w-[45%] flex-col overflow-hidden border-l bg-white">
            <div className="flex items-start justify-between border-b p-5">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11">
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm font-bold">
                    {getInitials(selectedContact.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-bold text-slate-900">{selectedContact.name}</p>
                  <p className="text-xs text-slate-500">{selectedContact.company}</p>
                </div>
              </div>
              <span className={cn('rounded-md px-2 py-1 text-[10px] font-semibold', statusColors[selectedContact.status])}>
                {statusLabels[selectedContact.status]}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Acciones rápidas */}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-8 gap-1.5 text-xs">
                  <Mail className="h-3.5 w-3.5" /> Email
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 gap-1.5 text-xs">
                  <Phone className="h-3.5 w-3.5" /> Llamar
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 gap-1.5 text-xs">
                  <Calendar className="h-3.5 w-3.5" /> Agendar
                </Button>
              </div>
              <Button size="sm" variant="outline" className="h-8 w-full text-xs" asChild>
                <Link href={`/contactos/${selectedContact.id}`}>
                  Ver ficha completa
                </Link>
              </Button>

              {/* Info */}
              <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Información</p>
                {[
                  { label: 'Email', value: selectedContact.email, icon: Mail },
                  { label: 'Teléfono', value: selectedContact.phone, icon: Phone },
                  { label: 'Empresa', value: selectedContact.company, icon: Building2 },
                  { label: 'Fuente', value: selectedContact.source, icon: ArrowUpRight },
                  { label: 'Creado', value: new Date(selectedContact.createdAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }), icon: Calendar },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="text-[10px] text-slate-400 w-14 shrink-0">{label}</span>
                    <span className="text-xs font-medium text-slate-700 truncate">{value}</span>
                  </div>
                ))}
              </div>

              {/* Valor */}
              <div className="rounded-lg border p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Valor del contacto</p>
                <p className="text-2xl font-bold text-slate-900">{formatCurrencyLocal(selectedContact.value)}</p>
              </div>

              {/* Tags */}
              {selectedContact.tags.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Etiquetas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedContact.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
