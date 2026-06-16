import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requireCurrentUser } from '@/lib/auth';
import { getPipelineStages } from '@/lib/crm-data';
import { isDatabaseUnavailable, isDevDemoEnabled } from '@/lib/dev-demo';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const user = await requireCurrentUser();
  const baseUrl = process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001';
  const form = await getActiveForm(user.workspace.id);
  const stages = await getPipelineStages();
  const workspacePublicKey = await getWorkspacePublicKey(user.workspace.id);

  const snippet = `<script async src="${baseUrl}/api/capture/snippet?key=${workspacePublicKey}"></script>`;
  const formEmbed = form
    ? `<iframe src="${baseUrl}/api/capture/forms/${form.publicId}?pageUrl=https://tusitio.cl/contacto" style="width:100%;height:520px;border:0"></iframe>`
    : 'No hay formularios activos.';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Configuracion" subtitle="Ajustes del workspace y captura web" />
      <div className="max-w-3xl flex-1 space-y-4 overflow-y-auto p-6">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Perfil del workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Nombre', value: user.workspace.name },
              { label: 'Slug', value: user.workspace.slug },
              { label: 'Usuario actual', value: user.email },
            ].map((field) => (
              <div key={field.label}>
                <label className="mb-1 block text-xs font-medium text-slate-600">{field.label}</label>
                <Input defaultValue={field.value} className="h-9 text-xs" readOnly />
              </div>
            ))}
            <Button size="sm" className="h-8 text-xs" disabled>
              Guardar cambios
            </Button>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Snippet web</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              Instala este script antes de cerrar el tag <code>&lt;/body&gt;</code> en el sitio del cliente.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
              <code>{snippet}</code>
            </pre>
            <p className="text-[11px] text-slate-400">
              Captura page views, clicks en elementos con <code>data-upzites-event</code> y clicks de WhatsApp.
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Formulario embebible</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              Este iframe crea contactos, registra submissions y deja actividad en el timeline.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
              <code>{formEmbed}</code>
            </pre>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Pipeline comercial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stages.map((stage) => (
              <div key={stage.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-xs font-semibold text-slate-800">{stage.name}</p>
                  <p className="text-[10px] text-slate-400">Posicion {stage.position}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-900">{stage.probability}%</p>
                  <p className="text-[10px] text-slate-400">
                    {stage.isWon ? 'Ganada' : stage.isLost ? 'Perdida' : 'Abierta'}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function getActiveForm(workspaceId: string) {
  try {
    return await prisma.form.findFirst({
      where: {
        workspaceId,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) {
      return {
        id: 'demo-form',
        publicId: 'demo-contacto',
      };
    }
    throw error;
  }
}

async function getWorkspacePublicKey(workspaceId: string) {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { publicKey: true },
    });

    return workspace?.publicKey ?? '';
  } catch (error) {
    if (isDevDemoEnabled() && isDatabaseUnavailable(error)) return 'dev-demo-public-key';
    throw error;
  }
}
