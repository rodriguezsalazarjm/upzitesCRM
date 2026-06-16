import { UserRole } from '../../generated/prisma/client';
import { mockActivities, mockContacts, mockKPIs, mockOpportunities, mockSourceData } from './mock-data';

export const DEV_DEMO_USER = {
  id: 'dev-demo-user',
  name: 'Admin Upzites',
  email: 'admin@upzites.cl',
  role: UserRole.OWNER,
  workspace: {
    id: 'dev-demo-workspace',
    name: 'Upzites Demo',
    slug: 'upzites-demo',
  },
};

export function isDevDemoEnabled() {
  return process.env.NODE_ENV !== 'production';
}

export function isDemoCredential(email: string, password: string) {
  return email.toLowerCase() === 'admin@upzites.cl' && password === 'demo1234';
}

export function isDatabaseUnavailable(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const code = 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : JSON.stringify(error);

  return code === 'ECONNREFUSED' || message.includes('ECONNREFUSED') || message.includes('Connection terminated');
}

export const devDemoData = {
  contacts: mockContacts,
  opportunities: mockOpportunities,
  activities: mockActivities,
  dashboard: {
    kpis: mockKPIs,
    activities: mockActivities,
    opportunities: mockOpportunities,
    sourceData: mockSourceData,
  },
};
