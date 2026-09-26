/**
 * Concede, revoca o lista operadores de plataforma (modelo `PlatformAdmin`).
 *
 * Es la UNICA forma de conceder el permiso: no hay pantalla ni endpoint que lo
 * haga, para que ningun bug de la web pueda convertir a un cliente en operador.
 * Cada cambio queda en `audit_logs` del workspace del usuario.
 *
 * Uso, desde apps/crm (usa DATABASE_URL: revisar a que base apunta antes):
 *   pnpm exec tsx scripts/platform-admin.ts list
 *   pnpm exec tsx scripts/platform-admin.ts grant persona@upzites.com "motivo"
 *   pnpm exec tsx scripts/platform-admin.ts revoke persona@upzites.com
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function findUser(email: string) {
  const users = await prisma.user.findMany({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, email: true, workspaceId: true, workspace: { select: { name: true } } },
  });
  // El email es unico por workspace, no global: ante dos coincidencias no se
  // adivina a cual se referia quien lo ejecuta.
  if (users.length !== 1) {
    throw new Error(`Se esperaba exactamente un usuario con ${email}; hay ${users.length}.`);
  }
  return users[0];
}

async function main() {
  const [command, email, note] = process.argv.slice(2);
  const target = new URL(process.env.DATABASE_URL ?? 'postgresql://sin-configurar/');
  console.log(`Base: ${target.hostname}${target.pathname}`);

  if (command === 'list') {
    const admins = await prisma.platformAdmin.findMany({
      include: { user: { select: { email: true, workspace: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    for (const admin of admins) {
      console.log(`${admin.user.email}\t${admin.user.workspace.name}\t${admin.createdAt.toISOString()}\t${admin.note ?? ''}`);
    }
    if (admins.length === 0) console.log('Sin operadores de plataforma.');
    return;
  }

  if ((command !== 'grant' && command !== 'revoke') || !email) {
    throw new Error('Uso: platform-admin.ts list | grant <email> [nota] | revoke <email>');
  }

  const user = await findUser(email);

  if (command === 'grant') {
    await prisma.platformAdmin.upsert({
      where: { userId: user.id },
      create: { userId: user.id, note: note ?? null },
      update: { note: note ?? null },
    });
  } else {
    await prisma.platformAdmin.deleteMany({ where: { userId: user.id } });
  }

  await prisma.auditLog.create({
    data: {
      workspaceId: user.workspaceId,
      action: command === 'grant' ? 'platform.admin_granted' : 'platform.admin_revoked',
      entity: 'User',
      entityId: user.id,
      metadata: { via: 'cli', note: note ?? null },
    },
  });

  console.log(`${command === 'grant' ? 'Concedido' : 'Revocado'}: ${user.email} (${user.workspace.name})`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
