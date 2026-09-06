'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

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
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="max-w-2xl border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Datos del contacto</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
              {[
                { key: 'firstName', label: 'Nombre', required: true },
                { key: 'lastName', label: 'Apellido', required: true },
                { key: 'email', label: 'Email', type: 'email' },
                { key: 'phone', label: 'Telefono' },
                { key: 'company', label: 'Empresa' },
                { key: 'source', label: 'Fuente' },
                { key: 'value', label: 'Valor estimado', type: 'number' },
                { key: 'tags', label: 'Etiquetas separadas por coma' },
              ].map((field) => (
                <label key={field.key} className="space-y-1.5 text-xs font-medium text-slate-700">
                  {field.label}
                  <Input
                    type={field.type ?? 'text'}
                    value={form[field.key as keyof typeof form]}
                    onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                    required={field.required}
                  />
                </label>
              ))}

              {error && <p className="md:col-span-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" size="sm" disabled={loading}>
                  <Save className="h-4 w-4" />
                  Guardar contacto
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href="/contactos">
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                  </Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
