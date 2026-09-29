/**
 * Concede, revoca o lista roles de PLATAFORMA (`User.platformRole`).
 *
 *   PLATFORM_ADMIN  Ops, clientes SaaS, suscripciones, pagos manuales, soporte.
 *   SUPER_ADMIN     Lo anterior + roles de plataforma, Price Book y COMP.
 *
 * Es la UNICA forma de conceder el permiso por ahora: no hay pantalla ni
 * endpoint que lo haga, para que ningun bug de la web pueda convertir a un
 * cliente en operador. Cuando exista Platform Admin (P0-D), solo un
 * SUPER_ADMIN podra hacerlo desde ahi. Cada cambio queda en
 * `platform_audit_logs`.
 *
 * Uso, desde apps/crm (usa DATABASE_URL: revisar a que base apunta antes):
 *   pnpm exec tsx scripts/platform-admin.ts list
 *   pnpm exec tsx scripts/platform-admin.ts grant persona@upzites.com SUPER_ADMIN "motivo"
 *   pnpm exec tsx scripts/platform-admin.ts grant persona@upzites.com PLATFORM_ADMIN "motivo"
 *   pnpm exec tsx scripts/platform-admin.ts revoke persona@upzites.com "motivo"
 *
 * grant/revoke son DRY-RUN por defecto (solo leen y muestran el cambio). Para
 * escribir: `--apply --confirm-host <host>` con el host EXACTO de DATABASE_URL.
 */
import 'dotenv/config';
import { PlatformRole } from '../generated/prisma/enums';
import { prisma } from '../src/lib/prisma';
import { findUserByEmail } from '../src/lib/identity';
import { setPlatformRoleFromCli } from '../src/lib/platform/roles';

const GRANTABLE: PlatformRole[] = [PlatformRole.PLATFORM_ADMIN, PlatformRole.SUPER_ADMIN];

async function findUser(email: string) {
  // Step 2: email unico global.
  const user = await findUserByEmail(email, { id: true, email: true, platformRole: true });
  if (!user) throw new Error(`No existe un usuario con ${email}.`);
  return user;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const hostFlag = argv.indexOf('--confirm-host');
  const confirmHost = hostFlag >= 0 ? argv[hostFlag + 1] : null;
  const positional = argv.filter((arg, index) => arg !== '--apply' && (hostFlag < 0 || (index !== hostFlag && index !== hostFlag + 1)));
  const [command, email, ...rest] = positional;
  const target = new URL(process.env.DATABASE_URL ?? 'postgresql://sin-configurar/');
  console.log(`Base: ${target.hostname}${target.pathname}${apply ? '' : '  (DRY-RUN: no se escribe nada)'}`);

  if (command === 'list') {
    const operators = await prisma.user.findMany({
      where: { platformRole: { in: GRANTABLE } },
      select: { email: true, platformRole: true, updatedAt: true },
      orderBy: { email: 'asc' },
    });
    for (const user of operators) {
      console.log(`${user.email}\t${user.platformRole}\t${user.updatedAt.toISOString()}`);
    }
    if (operators.length === 0) console.log('Sin operadores de plataforma.');
    return;
  }

  let role: PlatformRole;
  let note: string | undefined;
  if (command === 'grant') {
    role = rest[0] as PlatformRole;
    note = rest[1];
    if (!GRANTABLE.includes(role)) throw new Error('Rol invalido: usa PLATFORM_ADMIN o SUPER_ADMIN.');
  } else if (command === 'revoke') {
    role = PlatformRole.USER;
    note = rest[0];
  } else {
    throw new Error('Uso: platform-admin.ts list | grant <email> <PLATFORM_ADMIN|SUPER_ADMIN> [nota] | revoke <email> [nota]');
  }
  if (!email) throw new Error('Falta el email.');

  const user = await findUser(email);
  if (!apply) {
    console.log(user.platformRole === role ? `Sin cambios: ${user.email} ya es ${role}.` : `Se aplicaria: ${user.email}: ${user.platformRole} → ${role}`);
    console.log('Para escribir: --apply --confirm-host <host de DATABASE_URL>');
    return;
  }
  if (confirmHost !== target.hostname) {
    throw new Error(`--confirm-host debe ser exactamente "${target.hostname}" para escribir en esta base.`);
  }
  // P0-D: misma operacion que la UI (lock + "nunca sin SUPER_ADMIN").
  const result = await setPlatformRoleFromCli({ email: user.email, role, note });
  if (!result.changed) {
    console.log(`Sin cambios: ${user.email} ya es ${role}.`);
    return;
  }
  console.log(`${user.email}: ${user.platformRole} → ${role}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
