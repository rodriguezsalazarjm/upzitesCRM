export type ContactStatus = 'lead' | 'activo' | 'cliente' | 'inactivo';
export type OpportunityStage = 'nuevo' | 'calificado' | 'propuesta' | 'negociacion' | 'ganado' | 'perdido';

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  status: ContactStatus;
  source: string;
  createdAt: string;
  lastActivity: string;
  value: number;
  tags: string[];
}

export interface Opportunity {
  id: string;
  title: string;
  contactName: string;
  company: string;
  stage: OpportunityStage;
  value: number;
  probability: number;
  closeDate: string;
  owner: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  type: 'email' | 'call' | 'meeting' | 'note' | 'deal';
  description: string;
  contactName: string;
  time: string;
  dueAt?: string;
  completedAt?: string;
  icon?: string;
}

export const mockContacts: Contact[] = [
  { id: '1', name: 'Valentina Torres', email: 'vtorres@empresa.cl', phone: '+56 9 8765 4321', company: 'Constructora Andes', status: 'cliente', source: 'Sitio Web', createdAt: '2026-01-15', lastActivity: '2026-05-20', value: 4800000, tags: ['construcción', 'vip'] },
  { id: '2', name: 'Rodrigo Muñoz', email: 'rmunoz@inmocentro.cl', phone: '+56 9 7654 3210', company: 'Inmo Centro', status: 'activo', source: 'WhatsApp', createdAt: '2026-02-03', lastActivity: '2026-05-22', value: 2200000, tags: ['inmobiliaria'] },
  { id: '3', name: 'Camila Reyes', email: 'creyes@salud360.cl', phone: '+56 9 6543 2109', company: 'Salud 360', status: 'lead', source: 'LinkedIn', createdAt: '2026-03-10', lastActivity: '2026-05-24', value: 1500000, tags: ['salud', 'nuevo'] },
  { id: '4', name: 'Andrés Vega', email: 'avega@techpyme.cl', phone: '+56 9 5432 1098', company: 'TechPyme', status: 'cliente', source: 'Referido', createdAt: '2025-11-20', lastActivity: '2026-05-18', value: 6700000, tags: ['tecnología', 'vip'] },
  { id: '5', name: 'Sofía Martínez', email: 'smartinez@educaplus.cl', phone: '+56 9 4321 0987', company: 'EducaPlus', status: 'activo', source: 'Google Ads', createdAt: '2026-01-28', lastActivity: '2026-05-21', value: 3100000, tags: ['educación'] },
  { id: '6', name: 'Felipe Contreras', email: 'fcontreras@logistica.cl', phone: '+56 9 3210 9876', company: 'LogiRápido', status: 'inactivo', source: 'Sitio Web', createdAt: '2025-09-05', lastActivity: '2026-02-10', value: 890000, tags: ['logística'] },
  { id: '7', name: 'Carla Fuentes', email: 'cfuentes@restaurante.cl', phone: '+56 9 2109 8765', company: 'Sabores del Sur', status: 'lead', source: 'Instagram', createdAt: '2026-04-02', lastActivity: '2026-05-25', value: 750000, tags: ['gastronomía', 'nuevo'] },
  { id: '8', name: 'Matías Herrera', email: 'mherrera@consultora.cl', phone: '+56 9 1098 7654', company: 'Herrera & Asociados', status: 'cliente', source: 'Referido', createdAt: '2025-08-14', lastActivity: '2026-05-19', value: 9200000, tags: ['consultoría', 'vip'] },
  { id: '9', name: 'Ignacia Pizarro', email: 'ipizarro@agencia.cl', phone: '+56 9 0987 6543', company: 'Agencia Creativa', status: 'activo', source: 'Facebook Ads', createdAt: '2026-02-22', lastActivity: '2026-05-23', value: 1800000, tags: ['marketing'] },
  { id: '10', name: 'Diego Romero', email: 'dromero@retail.cl', phone: '+56 9 9876 5432', company: 'RetailMax', status: 'lead', source: 'Sitio Web', createdAt: '2026-05-01', lastActivity: '2026-05-26', value: 2500000, tags: ['retail', 'nuevo'] },
];

export const mockOpportunities: Opportunity[] = [
  { id: '1', title: 'Sitio web + CRM Constructora Andes', contactName: 'Valentina Torres', company: 'Constructora Andes', stage: 'ganado', value: 4800000, probability: 100, closeDate: '2026-05-15', owner: 'Ana García', createdAt: '2026-01-15' },
  { id: '2', title: 'Plataforma e-commerce Inmo Centro', contactName: 'Rodrigo Muñoz', company: 'Inmo Centro', stage: 'negociacion', value: 3500000, probability: 75, closeDate: '2026-06-30', owner: 'Carlos López', createdAt: '2026-02-03' },
  { id: '3', title: 'Web corporativa Salud 360', contactName: 'Camila Reyes', company: 'Salud 360', stage: 'propuesta', value: 1500000, probability: 50, closeDate: '2026-07-15', owner: 'Ana García', createdAt: '2026-03-10' },
  { id: '4', title: 'CRM + automatizaciones TechPyme', contactName: 'Andrés Vega', company: 'TechPyme', stage: 'ganado', value: 6700000, probability: 100, closeDate: '2026-04-20', owner: 'Pedro Díaz', createdAt: '2025-11-20' },
  { id: '5', title: 'LMS plataforma EducaPlus', contactName: 'Sofía Martínez', company: 'EducaPlus', stage: 'calificado', value: 3100000, probability: 40, closeDate: '2026-08-01', owner: 'Carlos López', createdAt: '2026-01-28' },
  { id: '6', title: 'Landing campaign LogiRápido', contactName: 'Felipe Contreras', company: 'LogiRápido', stage: 'perdido', value: 890000, probability: 0, closeDate: '2026-03-01', owner: 'Ana García', createdAt: '2025-09-05' },
  { id: '7', title: 'Web + carta digital Sabores del Sur', contactName: 'Carla Fuentes', company: 'Sabores del Sur', stage: 'nuevo', value: 750000, probability: 20, closeDate: '2026-08-30', owner: 'Pedro Díaz', createdAt: '2026-04-02' },
  { id: '8', title: 'Portal clientes Herrera & Asoc.', contactName: 'Matías Herrera', company: 'Herrera & Asociados', stage: 'negociacion', value: 9200000, probability: 80, closeDate: '2026-06-15', owner: 'Ana García', createdAt: '2025-08-14' },
  { id: '9', title: 'Rebranding + web Agencia Creativa', contactName: 'Ignacia Pizarro', company: 'Agencia Creativa', stage: 'propuesta', value: 1800000, probability: 55, closeDate: '2026-07-30', owner: 'Carlos López', createdAt: '2026-02-22' },
  { id: '10', title: 'Tienda online RetailMax', contactName: 'Diego Romero', company: 'RetailMax', stage: 'nuevo', value: 2500000, probability: 15, closeDate: '2026-09-15', owner: 'Pedro Díaz', createdAt: '2026-05-01' },
];

export const mockActivities: Activity[] = [
  { id: '1', type: 'deal', description: 'Oportunidad ganada: CRM + automatizaciones TechPyme', contactName: 'Andrés Vega', time: 'Hace 2 horas' },
  { id: '2', type: 'email', description: 'Email enviado con propuesta comercial', contactName: 'Camila Reyes', time: 'Hace 3 horas' },
  { id: '3', type: 'call', description: 'Llamada de seguimiento realizada (25 min)', contactName: 'Rodrigo Muñoz', time: 'Hace 5 horas' },
  { id: '4', type: 'meeting', description: 'Reunión de kickoff agendada para el 02/06', contactName: 'Matías Herrera', time: 'Hace 1 día' },
  { id: '5', type: 'note', description: 'Nota: cliente solicita demo de módulo pagos', contactName: 'Sofía Martínez', time: 'Hace 1 día' },
  { id: '6', type: 'email', description: 'Nuevo lead desde formulario sitio web', contactName: 'Diego Romero', time: 'Hace 2 días' },
];

export const mockKPIs = {
  totalLeads: 34,
  leadsGrowth: 18.6,
  openOpportunities: 6,
  opportunitiesValue: 22350000,
  closedWon: 8,
  revenue: 31700000,
  revenueGrowth: 24.3,
  conversionRate: 32,
};

export const mockSourceData = [
  { source: 'Sitio Web', leads: 12, percentage: 35 },
  { source: 'Referidos', leads: 8, percentage: 24 },
  { source: 'Google Ads', leads: 6, percentage: 18 },
  { source: 'Instagram', leads: 4, percentage: 12 },
  { source: 'LinkedIn', leads: 4, percentage: 11 },
];

export const stageLabels: Record<OpportunityStage, string> = {
  nuevo: 'Nuevo',
  calificado: 'Calificado',
  propuesta: 'Propuesta',
  negociacion: 'Negociación',
  ganado: 'Ganado',
  perdido: 'Perdido',
};

export const stageColors: Record<OpportunityStage, string> = {
  nuevo: 'bg-slate-100 border-slate-200',
  calificado: 'bg-blue-50 border-blue-200',
  propuesta: 'bg-violet-50 border-violet-200',
  negociacion: 'bg-amber-50 border-amber-200',
  ganado: 'bg-emerald-50 border-emerald-200',
  perdido: 'bg-red-50 border-red-200',
};

export const stageBadgeColors: Record<OpportunityStage, string> = {
  nuevo: 'bg-slate-100 text-slate-700',
  calificado: 'bg-blue-100 text-blue-700',
  propuesta: 'bg-violet-100 text-violet-700',
  negociacion: 'bg-amber-100 text-amber-700',
  ganado: 'bg-emerald-100 text-emerald-700',
  perdido: 'bg-red-100 text-red-700',
};

export const statusColors: Record<ContactStatus, string> = {
  lead: 'bg-blue-100 text-blue-700',
  activo: 'bg-violet-100 text-violet-700',
  cliente: 'bg-emerald-100 text-emerald-700',
  inactivo: 'bg-slate-100 text-slate-500',
};


export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}
