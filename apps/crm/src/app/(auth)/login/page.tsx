'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('admin@upzites.cl');
  const [password, setPassword] = useState('demo1234');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simular auth
    await new Promise((r) => setTimeout(r, 800));
    router.push('/dashboard');
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Panel izquierdo - Branding */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold">CRM Upzites</span>
        </div>

        <div>
          <blockquote className="text-2xl font-light leading-relaxed text-blue-100">
            "El CRM que nació del sitio web: captura leads, conversa, cotiza y cobra."
          </blockquote>
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { label: 'Leads este mes', value: '+34' },
              { label: 'Tasa de cierre', value: '32%' },
              { label: 'Ingresos', value: '$31.7M' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-white/10 p-4 backdrop-blur">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="mt-1 text-xs text-blue-200">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-blue-300">© 2026 Upzites · Todos los derechos reservados</p>
      </div>

      {/* Panel derecho - Form */}
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">CRM Upzites</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Bienvenido de vuelta</h2>
            <p className="mt-1.5 text-sm text-slate-500">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Correo electrónico
              </label>
              <Input
                type="email"
                placeholder="tu@empresa.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
                required
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">Contraseña</label>
                <Link href="#" className="text-xs text-blue-600 hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="h-10 w-full gap-2" disabled={loading}>
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>Ingresar <ArrowRight className="h-4 w-4" /></>
              )}
            </Button>
          </form>

          <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-3">
            <p className="text-[11px] font-medium text-blue-700">Demo rápida</p>
            <p className="text-[11px] text-blue-600 mt-0.5">
              Email: <span className="font-mono">admin@upzites.cl</span> · Pass: <span className="font-mono">demo1234</span>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            ¿No tienes cuenta?{' '}
            <Link href="/register" className="font-medium text-blue-600 hover:underline">
              Crear cuenta gratis
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
