'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError, FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

type ContactField = { key: keyof ContactFormState; label: string; type?: string; required?: boolean };

const FIELDS: ContactField[] = [
  { key: 'firstName', label: 'Nombre', required: true },
  { key: 'lastName', label: 'Apellido', required: true },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'company', label: 'Empresa' },
  { key: 'source', label: 'Fuente' },
  { key: 'value', label: 'Valor estimado', type: 'number' },
  { key: 'tags', label: 'Etiquetas separadas por coma' },
];

type ContactFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  value: string;
  tags: string;
};

export default function NuevoContactoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    source: 'Carga manual',
    value: '0',
    tags: '',
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || undefined,
        phone: form.phone || undefined,
        company: form.company || undefined,
        source: form.source || undefined,
        value: Number(form.value || 0),
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      }),
    });

    setLoading(false);

    if (!response.ok) {
      setError('No pudimos crear el contacto. Revisa los datos e intenta de nuevo.');
      return;
    }

    router.push('/contactos');
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Nuevo contacto" subtitle="Carga un lead o cliente manualmente" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-8">
        <Card className="max-w-2xl p-5 sm:p-6">
          <h2 className="mb-5 text-base font-bold text-carbon">Datos del contacto</h2>
          <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
            {FIELDS.map((field) => (
              <FormField key={field.key} label={field.label} htmlFor={`contact-${field.key}`}>
                <Input
                  type={field.type ?? 'text'}
                  value={form[field.key]}
                  onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                  required={field.required}
                />
              </FormField>
            ))}

            {error && <FormError className="md:col-span-2 mt-0">{error}</FormError>}

            <div className="flex gap-2 border-t border-line pt-5 md:col-span-2">
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                Guardar contacto
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href="/contactos">
                  <ArrowLeft aria-hidden />
                  Volver
                </Link>
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
