import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Guardia de aislamiento entre tenants, SOLO para tests y smoke.
 *
 * Detecta consultas "globales" accidentales: un findMany/updateMany/count/...
 * sobre un modelo que tiene `workspaceId` sin ninguna condicion que lo acote a
 * un tenant o a un registro concreto. En una pagina normal eso seria mezclar
 * datos de clientes.
 *
 * Las consultas cross-tenant legitimas (workers, cola de jobs, Platform Admin)
 * se ejecutan dentro de `withPlatformScope(...)`, que las declara como tales.
 *
 * Se activa con CRM_TENANT_GUARD=throw|report y nunca en produccion. En
 * produccion `withPlatformScope` solo ejecuta la funcion.
 */

const platformScope = new AsyncLocalStorage<true>();

/** Marca un bloque como cross-tenant a proposito (plataforma, workers). */
export function withPlatformScope<T>(run: () => T): T {
  return platformScope.run(true, run);
}

export function isPlatformScope() {
  return platformScope.getStore() === true;
}

export type TenantGuardMode = 'off' | 'report' | 'throw';

export function tenantGuardMode(): TenantGuardMode {
  if (process.env.NODE_ENV === 'production') return 'off';
  const mode = process.env.CRM_TENANT_GUARD;
  return mode === 'throw' || mode === 'report' ? mode : 'off';
}

/** Operaciones que pueden tocar muchas filas. Las de registro unico van por clave. */
const MULTI_ROW_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Una condicion "acota" si nombra el tenant, un registro, o un padre por su
 * FK (`conversationId`, `orderId`, ...). Un padre ya pertenece a un solo
 * tenant, asi que filtrar por el no mezcla clientes.
 */
function whereIsScoped(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (key === 'AND') {
      const parts = Array.isArray(value) ? value : [value];
      if (parts.some(whereIsScoped)) return true;
      continue;
    }
    if (key === 'OR') {
      const parts = Array.isArray(value) ? value : [value];
      if (parts.length > 0 && parts.every(whereIsScoped)) return true;
      continue;
    }
    if (key === 'NOT') continue;
    if (key === 'id' || key === 'workspaceId' || key === 'workspace') return true;
    if (/Id$/.test(key) && value !== null) return true;
    // Claves unicas compuestas: workspaceId_email, channelId_contactId, ...
    if (key.includes('_') && value && typeof value === 'object') return true;
    // Filtro por relacion a un padre: { conversation: { id } }
    if (value && typeof value === 'object' && !Array.isArray(value) && whereIsScoped(value)) return true;
  }
  return false;
}

export class TenantGuardViolation extends Error {
  constructor(model: string, operation: string) {
    super(
      `TENANT_GUARD: ${model}.${operation} sin workspaceId ni clave acotada. ` +
        'Si es cross-tenant a proposito, envolverlo en withPlatformScope().',
    );
  }
}

export const tenantGuardViolations: string[] = [];

/** Revisa una operacion. Devuelve el error (o null) segun el modo. */
export function inspectTenantQuery(input: {
  tenantModels: ReadonlySet<string>;
  model: string | undefined;
  operation: string;
  args: unknown;
  mode: TenantGuardMode;
}) {
  const { model, operation, mode } = input;
  if (mode === 'off' || !model || !input.tenantModels.has(model)) return null;
  if (!MULTI_ROW_OPERATIONS.has(operation)) return null;
  if (isPlatformScope()) return null;
  const where = (input.args as { where?: unknown } | undefined)?.where;
  if (whereIsScoped(where)) return null;

  const violation = new TenantGuardViolation(model, operation);
  // Primer frame del codigo de la app, saltando la guardia y el cliente Prisma.
  const site =
    (new Error().stack ?? '')
      .split('\n')
      .filter((line) => /[\\/](src|scripts|prisma)[\\/]/.test(line))
      .find((line) => !/tenant-guard|[\\/]lib[\\/]prisma\.ts|generated[\\/]prisma/.test(line)) ?? '';
  tenantGuardViolations.push(`${model}.${operation} ${site.trim()}`);
  if (mode === 'report') {
    console.warn(violation.message, site.trim());
    return null;
  }
  return violation;
}

/**
 * Envuelve un cliente Prisma: cada llamada a un modelo tenant se revisa en el
 * momento de invocarla (sincronico), asi el error apunta a la linea que la
 * hizo. Tambien envuelve el cliente de las transacciones interactivas.
 */
export function guardPrismaClient<T extends object>(client: T, tenantModels: ReadonlySet<string>, mode: TenantGuardMode): T {
  if (mode === 'off') return client;
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === '$transaction' && typeof value === 'function') {
        return (arg: unknown, ...rest: unknown[]) =>
          typeof arg === 'function'
            ? value.call(target, (tx: object) => (arg as (tx: object) => unknown)(guardPrismaClient(tx, tenantModels, mode)), ...rest)
            : value.call(target, arg, ...rest);
      }
      if (typeof prop !== 'string' || prop.startsWith('$') || !value || typeof value !== 'object') return value;
      const model = prop[0].toUpperCase() + prop.slice(1);
      if (!tenantModels.has(model)) return value;
      return new Proxy(value as object, {
        get(delegate, operation) {
          const fn = Reflect.get(delegate, operation);
          if (typeof fn !== 'function' || typeof operation !== 'string') return fn;
          return (args: unknown) => {
            const violation = inspectTenantQuery({ tenantModels, model, operation, args, mode });
            if (violation) return Promise.reject(violation);
            return fn.call(delegate, args);
          };
        },
      });
    },
  });
}
