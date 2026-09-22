'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Wordmark } from '@/components/ui/wordmark';

const FEATURES = [
  'Workspace separado por cliente',
  'Acceso con correo y contrasena',
  'Suscripcion activa por 30 dias',
  'Captura de leads desde web o formulario',
];

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
  const errorId = useId();

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
    <div className="flex min-h-screen flex-col bg-canvas lg:flex-row">
      {/* Zona principal: wordmark, headline corto, descripción y el formulario. */}
      <div className="flex w-full flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:w-[55%] lg:px-16 xl:px-20">
        <div className="mx-auto w-full max-w-sm">
          <Wordmark size="lg" className="mb-10 lg:mb-12" />

          <h1 className="type-display text-[34px] leading-[0.92] text-carbon lg:text-[48px] xl:text-[52px]">
            Cada cliente,
            <br />
            su propio espacio.
          </h1>
          <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-slate-600 lg:mt-4">
            Workspace separado, con tus leads, fuentes y oportunidades.
          </p>

          <div className="mt-9 lg:mt-11">
            <h2 className="text-xl font-bold text-carbon">Crear acceso de cliente</h2>
            <p className="mt-1.5 text-sm text-slate-500">Crea un espacio mensual con datos separados para esta empresa.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <FormField label="Empresa" htmlFor="register-company">
                <Input
                  autoComplete="organization"
                  value={form.companyName}
                  onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                  placeholder="Nombre de la empresa"
                  required
                />
              </FormField>

              <FormField label="Nombre del responsable" htmlFor="register-owner">
                <Input
                  autoComplete="name"
                  value={form.ownerName}
                  onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))}
                  placeholder="Ej: Camila Perez"
                  required
                />
              </FormField>

              <FormField label="Correo de acceso" htmlFor="register-email">
                <Input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="cliente@empresa.cl"
                  required
                />
              </FormField>

              <div>
                <label htmlFor="register-password" className="mb-1.5 block text-sm font-semibold text-carbon">
                  Contrasena inicial
                </label>
                <div className="relative">
                  <Input
                    id="register-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="Minimo 8 caracteres"
                    className="pr-10"
                    aria-describedby={error ? errorId : undefined}
                    aria-invalid={error ? true : undefined}
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone transition-colors hover:text-graphite"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p id={errorId} role="alert" className="rounded-lg bg-tomato/12 px-3 py-2 text-xs font-medium text-danger-ink">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <>
                    Crear acceso mensual <ArrowRight className="h-4 w-4" aria-hidden />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-500">
              Ya tienes acceso?{' '}
              <Link href="/login" className="font-semibold text-electric hover:text-electric-strong">
                Ingresar
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Superficie de apoyo: checklist informativo, sin decoración adicional. */}
      <div className="hidden bg-carbon lg:flex lg:w-[45%] lg:flex-col lg:justify-between lg:p-14 xl:p-16">
        <Wordmark tone="dark" />

        <div>
          <p className="type-eyebrow text-lime">Venta mensual</p>
          <ul className="mt-5 space-y-3 text-sm text-canvas">
            {FEATURES.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-lime" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-fog">Upzites Flow · SaaS comercial para clientes</p>
      </div>
    </div>
  );
}
