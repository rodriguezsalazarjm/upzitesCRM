import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ConfiguracionPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Configuración" subtitle="Ajustes del workspace" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-2xl">
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Perfil del workspace</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[{ label: 'Nombre', value: 'Upzites Agency' }, { label: 'Email', value: 'hola@upzites.cl' }, { label: 'Sitio web', value: 'https://upzites.cl' }].map(f => (
              <div key={f.label}>
                <label className="mb-1 block text-xs font-medium text-slate-600">{f.label}</label>
                <Input defaultValue={f.value} className="h-9 text-xs" />
              </div>
            ))}
            <Button size="sm" className="h-8 text-xs">Guardar cambios</Button>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Integraciones</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              { name: 'WhatsApp Business', status: 'Conectado', color: 'text-emerald-600 bg-emerald-50' },
              { name: 'Google Workspace', status: 'Conectado', color: 'text-emerald-600 bg-emerald-50' },
              { name: 'Transbank Webpay', status: 'No conectado', color: 'text-slate-400 bg-slate-100' },
              { name: 'Mercado Pago', status: 'No conectado', color: 'text-slate-400 bg-slate-100' },
            ].map(i => (
              <div key={i.name} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-xs font-medium text-slate-700">{i.name}</span>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${i.color}`}>{i.status}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
