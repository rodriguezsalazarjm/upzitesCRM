import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canonicalBusiness } from '@/lib/workspace-profile/business';
import { canManageProfile } from '@/lib/workspace-profile/service';
import { SetupForm } from './setup-form';

export const dynamic = 'force-dynamic';

/**
 * Setup inicial del negocio (P0-E). Solo OWNER/ADMIN configura; MEMBER ve un
 * aviso. Guardar aplica el preset recomendado y marca el onboarding.
 */
export default async function WelcomePage() {
  const user = await requireCurrentUser();
  const profile = await prisma.workspaceProfile.findUnique({ where: { workspaceId: user.workspace.id } });
  const business = canonicalBusiness(profile);
  const canEdit = canManageProfile(user.role);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Configura tu negocio" subtitle={user.workspace.name} />
      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-2 sm:px-8">
        <Card className="mx-auto max-w-2xl p-6 sm:p-8">
          {canEdit ? (
            <SetupForm
              initial={{
                businessType: business.businessType === 'UNDEFINED' ? null : business.businessType,
                commerceSubtype: business.commerceSubtype,
                primaryGoal: profile?.primaryGoal ?? null,
                preferredChannels: profile?.preferredChannels ?? [],
                teamSize: profile?.teamSize ?? null,
              }}
            />
          ) : (
            <p className="text-sm text-soft" role="status">
              Solo un owner o admin de <strong>{user.workspace.name}</strong> puede configurar el tipo de negocio. Tú puedes seguir
              usando el CRM normalmente.
              <Link href="/dashboard" className="mt-4 block font-semibold text-electric hover:underline">
                Volver al inicio
              </Link>
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
