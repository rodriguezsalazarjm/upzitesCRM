'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Wordmark } from '@/components/ui/wordmark';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();
  const errorId = useId();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError('Credenciales inválidas');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Se perdió la conexión. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas lg:flex-row">
      {/* Zona principal: wordmark, headline corto, descripción y el formulario. */}
      <div className="flex w-full flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:w-[55%] lg:px-16 xl:px-20">
        <div className="mx-auto w-full max-w-sm">
          <Wordmark size="lg" className="mb-10 lg:mb-12" />

          <h1 className="type-display text-[34px] leading-[0.92] text-carbon lg:text-[52px] xl:text-[56px]">
            Captura. Conversa.
            <br />
            Cotiza. Cobra.
          </h1>
          <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-ash lg:mt-4">
            Plataforma de ventas, automatización y conversaciones multicanal.
          </p>

          <div className="mt-9 lg:mt-11">
            <h2 className="text-xl font-bold text-carbon">Bienvenido de vuelta</h2>
            <p className="mt-1.5 text-sm text-soft">Ingresa con el correo y contraseña de tu empresa</p>

            <form onSubmit={handleLogin} className="mt-6 space-y-5">
              <FormField label="Correo electrónico" htmlFor="login-email">
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="tu@empresa.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </FormField>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor="login-password" className="text-sm font-semibold text-carbon">
                    Contraseña
                  </label>
                  <Link href="#" className="text-xs font-medium text-electric hover:text-electric-strong">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                    aria-describedby={error ? errorId : undefined}
                    aria-invalid={error ? true : undefined}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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
                    Iniciar sesión <ArrowRight className="h-4 w-4" aria-hidden />
                  </>
                )}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-line" />
              <span className="type-eyebrow text-soft">o</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <Button asChild variant="outline" className="w-full">
              <Link href="/register">Crear una cuenta</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Superficie de apoyo: cita editorial, sin decoración adicional. */}
      <div className="hidden bg-carbon lg:flex lg:w-[45%] lg:flex-col lg:justify-between lg:p-14 xl:p-16">
        <Wordmark tone="dark" />

        <blockquote className="max-w-md">
          <p className="type-display text-[64px] leading-[0.5] text-lime" aria-hidden>
            &ldquo;
          </p>
          <p className="mt-4 text-2xl font-semibold leading-snug text-canvas">
            La plataforma que nació del sitio web: captura leads, conversa, cotiza y cobra.
          </p>
        </blockquote>

        <p className="text-xs text-fog">© 2026 Upzites · Todos los derechos reservados</p>
      </div>
    </div>
  );
}
