'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    companyName: '',
    ownerName: '',
    email: '',
    password: '',
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    setLoading(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message ?? 'No pudimos crear la cuenta. Revisa los datos e intenta de nuevo.');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="hidden w-1/2 flex-col justify-between bg-slate-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-bold">CRM Upzites</p>
            <p className="text-xs text-slate-400">Sistema comercial mensual</p>
          </div>
        </div>

        <div className="max-w-lg">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
            Venta mensual
          </p>
          <h1 className="text-4xl font-black tracking-tight">
            Cada cliente entra a su propio CRM, con sus leads, fuentes y oportunidades.
          </h1>
          <div className="mt-8 grid gap-3 text-sm text-slate-300">
            {[
              'Workspace separado por cliente',
              'Acceso con correo y contrasena',
              'Suscripcion activa por 30 dias',
              'Captura de leads desde web o formulario',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-blue-400" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-500">Upzites CRM · SaaS comercial para clientes</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Zap className="h-5 w-5" />
            </div>
            <p className="font-bold text-slate-900">CRM Upzites</p>
          </div>

          <div className="mb-7">
            <h2 className="text-2xl font-bold text-slate-900">Crear acceso de cliente</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Crea un CRM mensual con datos separados para esta empresa.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">Empresa</label>
              <Input
                value={form.companyName}
                onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                placeholder="Nombre de la empresa"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">Nombre del responsable</label>
              <Input
                value={form.ownerName}
                onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))}
                placeholder="Ej: Camila Perez"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">Correo de acceso</label>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="cliente@empresa.cl"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">Contrasena inicial</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Minimo 8 caracteres"
                  className="pr-10"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}

            <Button type="submit" className="h-10 w-full" disabled={loading}>
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  Crear CRM mensual <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Ya tienes acceso?{' '}
            <Link href="/login" className="font-medium text-blue-600 hover:underline">
              Ingresar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
