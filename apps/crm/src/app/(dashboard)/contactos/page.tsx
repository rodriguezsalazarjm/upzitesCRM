import { getContacts } from '@/lib/crm-data';
import { ContactosClient } from './contactos-client';

export const dynamic = 'force-dynamic';

export default async function ContactosPage() {
  const contacts = await getContacts();

  return <ContactosClient contacts={contacts} />;
}
