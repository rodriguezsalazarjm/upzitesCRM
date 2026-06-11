import { Injectable } from '@nestjs/common';

// Mock data for v1.0 (replace with DB when PostgreSQL is connected)
const mockContacts = [
  { id: '1', name: 'Valentina Torres', email: 'vtorres@empresa.cl', phone: '+56 9 8765 4321', company: 'Constructora Andes', status: 'cliente', source: 'Sitio Web', value: 4800000, createdAt: '2026-01-15', updatedAt: '2026-05-20' },
  { id: '2', name: 'Rodrigo Muñoz', email: 'rmunoz@inmocentro.cl', phone: '+56 9 7654 3210', company: 'Inmo Centro', status: 'activo', source: 'WhatsApp', value: 2200000, createdAt: '2026-02-03', updatedAt: '2026-05-22' },
  { id: '3', name: 'Camila Reyes', email: 'creyes@salud360.cl', phone: '+56 9 6543 2109', company: 'Salud 360', status: 'lead', source: 'LinkedIn', value: 1500000, createdAt: '2026-03-10', updatedAt: '2026-05-24' },
  { id: '4', name: 'Andrés Vega', email: 'avega@techpyme.cl', phone: '+56 9 5432 1098', company: 'TechPyme', status: 'cliente', source: 'Referido', value: 6700000, createdAt: '2025-11-20', updatedAt: '2026-05-18' },
  { id: '5', name: 'Sofía Martínez', email: 'smartinez@educaplus.cl', phone: '+56 9 4321 0987', company: 'EducaPlus', status: 'activo', source: 'Google Ads', value: 3100000, createdAt: '2026-01-28', updatedAt: '2026-05-21' },
];

@Injectable()
export class ContactsService {
  findAll(query?: { status?: string; search?: string }) {
    let result = [...mockContacts];
    if (query?.status) result = result.filter((c) => c.status === query.status);
    if (query?.search) {
      const s = query.search.toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(s) ||
        c.email.toLowerCase().includes(s) ||
        c.company.toLowerCase().includes(s),
      );
    }
    return { data: result, total: result.length };
  }

  findOne(id: string) {
    const contact = mockContacts.find((c) => c.id === id);
    if (!contact) throw new Error(`Contact ${id} not found`);
    return contact;
  }

  create(dto: any) {
    const newContact = { id: String(Date.now()), ...dto, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    mockContacts.push(newContact);
    return newContact;
  }

  update(id: string, dto: any) {
    const idx = mockContacts.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Contact ${id} not found`);
    mockContacts[idx] = { ...mockContacts[idx], ...dto, updatedAt: new Date().toISOString() };
    return mockContacts[idx];
  }

  delete(id: string) {
    const idx = mockContacts.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Contact ${id} not found`);
    const [deleted] = mockContacts.splice(idx, 1);
    return { deleted: true, id: deleted.id };
  }
}
