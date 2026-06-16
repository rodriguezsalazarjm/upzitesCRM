import { getContacts } from '@/lib/crm-data';

function csvCell(value: string | number) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET() {
  const contacts = await getContacts();
  const headers = ['name', 'email', 'phone', 'company', 'status', 'source', 'value', 'tags'];
  const rows = contacts.map((contact) =>
    [
      contact.name,
      contact.email,
      contact.phone,
      contact.company,
      contact.status,
      contact.source,
      contact.value,
      contact.tags.join('|'),
    ].map(csvCell).join(','),
  );

  return new Response([headers.join(','), ...rows].join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="contactos-upzites.csv"',
    },
  });
}
