import { Injectable } from '@nestjs/common';

const mockOpportunities = [
  { id: '1', title: 'Sitio web + CRM Constructora Andes', contactId: '1', company: 'Constructora Andes', stage: 'ganado', value: 4800000, probability: 100, closeDate: '2026-05-15', owner: 'Ana García', createdAt: '2026-01-15' },
  { id: '2', title: 'Plataforma e-commerce Inmo Centro', contactId: '2', company: 'Inmo Centro', stage: 'negociacion', value: 3500000, probability: 75, closeDate: '2026-06-30', owner: 'Carlos López', createdAt: '2026-02-03' },
  { id: '3', title: 'Web corporativa Salud 360', contactId: '3', company: 'Salud 360', stage: 'propuesta', value: 1500000, probability: 50, closeDate: '2026-07-15', owner: 'Ana García', createdAt: '2026-03-10' },
  { id: '4', title: 'CRM + automatizaciones TechPyme', contactId: '4', company: 'TechPyme', stage: 'ganado', value: 6700000, probability: 100, closeDate: '2026-04-20', owner: 'Pedro Díaz', createdAt: '2025-11-20' },
  { id: '5', title: 'LMS plataforma EducaPlus', contactId: '5', company: 'EducaPlus', stage: 'calificado', value: 3100000, probability: 40, closeDate: '2026-08-01', owner: 'Carlos López', createdAt: '2026-01-28' },
];

@Injectable()
export class OpportunitiesService {
  findAll(stage?: string) {
    const data = stage ? mockOpportunities.filter((o) => o.stage === stage) : mockOpportunities;
    return { data, total: data.length };
  }

  findOne(id: string) {
    const opp = mockOpportunities.find((o) => o.id === id);
    if (!opp) throw new Error(`Opportunity ${id} not found`);
    return opp;
  }

  create(dto: any) {
    const newOpp = { id: String(Date.now()), ...dto, createdAt: new Date().toISOString() };
    mockOpportunities.push(newOpp);
    return newOpp;
  }

  update(id: string, dto: any) {
    const idx = mockOpportunities.findIndex((o) => o.id === id);
    if (idx === -1) throw new Error(`Opportunity ${id} not found`);
    mockOpportunities[idx] = { ...mockOpportunities[idx], ...dto };
    return mockOpportunities[idx];
  }

  updateStage(id: string, stage: string) {
    return this.update(id, { stage });
  }

  getDashboardStats() {
    const total = mockOpportunities.length;
    const open = mockOpportunities.filter((o) => !['ganado', 'perdido'].includes(o.stage));
    const won = mockOpportunities.filter((o) => o.stage === 'ganado');
    return {
      total,
      openCount: open.length,
      openValue: open.reduce((s, o) => s + o.value, 0),
      wonCount: won.length,
      wonValue: won.reduce((s, o) => s + o.value, 0),
      conversionRate: total > 0 ? Math.round((won.length / total) * 100) : 0,
    };
  }
}
