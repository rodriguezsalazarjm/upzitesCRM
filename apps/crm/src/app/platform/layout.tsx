import { notFound } from 'next/navigation';
import { PlatformRole } from '../../../generated/prisma/enums';
import { PlatformNav } from '@/components/platform/platform-nav';
import { currentPlatformActor } from '@/lib/platform/access';

export const dynamic = 'force-dynamic';

/**
 * Area de PLATAFORMA (P0-D). Solo PLATFORM_ADMIN y SUPER_ADMIN; cualquier otro
 * (incluido el OWNER de un workspace) recibe 404. No depende del workspace
 * activo ni de sus entitlements: vive fuera de (dashboard).
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentPlatformActor();
  if (!actor) notFound();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas md:h-dvh md:flex-row md:overflow-hidden">
      <PlatformNav superAdmin={actor.platformRole === PlatformRole.SUPER_ADMIN} operator={{ name: actor.name, role: actor.platformRole }} />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
