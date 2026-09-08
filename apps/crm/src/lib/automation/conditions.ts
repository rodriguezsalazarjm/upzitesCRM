import { isGroup, type Condition, type ConditionGroup } from './schema';

/**
 * Evaluacion de condiciones sobre el contexto de un evento.
 *
 * Es una funcion pura y sin acceso a la base: el contexto se arma antes. Asi se
 * puede probar exhaustivamente sin datos, y una regla mal escrita no puede
 * disparar consultas inesperadas.
 */
export type EventContext = Record<string, unknown>;

/** Lee `contact.temperature` o `message.text` sin asumir la forma del contexto. */
export function readPath(context: EventContext, path: string): unknown {
  let current: unknown = context;
  for (const key of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function toComparable(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) && value.trim() !== '' ? asNumber : value;
  }
  return value;
}

function compare(actual: unknown, operator: Condition['operator'], expected: unknown): boolean {
  switch (operator) {
    case 'is_empty':
      return actual === null || actual === undefined || actual === '' ||
        (Array.isArray(actual) && actual.length === 0);
    case 'is_not_empty':
      return !compare(actual, 'is_empty', undefined);
    case 'eq':
      return String(actual) === String(expected);
    case 'neq':
      return String(actual) !== String(expected);
    case 'in':
      return Array.isArray(expected) && expected.map(String).includes(String(actual));
    case 'not_in':
      return Array.isArray(expected) && !expected.map(String).includes(String(actual));
    case 'contains': {
      if (Array.isArray(actual)) return actual.map(String).includes(String(expected));
      return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = toComparable(actual);
      const b = toComparable(expected);
      // Solo se comparan numeros: comparar textos con `>` da resultados
      // sorpresivos y es casi siempre un error de configuracion de la regla.
      if (typeof a !== 'number' || typeof b !== 'number') return false;
      if (operator === 'gt') return a > b;
      if (operator === 'gte') return a >= b;
      if (operator === 'lt') return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

export function evaluateCondition(condition: Condition, context: EventContext) {
  return compare(readPath(context, condition.field), condition.operator, condition.value);
}

/**
 * Evalua un grupo. Un grupo `ALL` sin reglas es verdadero (regla sin
 * condiciones); uno `ANY` sin reglas es falso, porque no hay nada que cumplir.
 */
export function evaluateGroup(group: ConditionGroup, context: EventContext): boolean {
  if (group.rules.length === 0) return group.match === 'ALL';

  const results = group.rules.map((node) =>
    isGroup(node) ? evaluateGroup(node, context) : evaluateCondition(node, context),
  );

  return group.match === 'ALL' ? results.every(Boolean) : results.some(Boolean);
}
