import type { WorkspaceRole } from '../../../generated/prisma/enums';
import type { FeatureAccess } from '../navigation/resolve';
import { roleAllows } from '../workspace-roles';
import { CHECKLIST_TASK_IDS, CHECKLIST_TASKS, type ChecklistRequirement, type ChecklistTaskId } from './tasks';

/**
 * Checklist adaptativo (P0-E), puro.
 *
 *  - notRelevant: el preset no la incluye (SERVICES no pide crear producto).
 *  - completed: el estado real lo cumple (se calcula, no se marca).
 *  - locked: el plan no la permite. Se muestra con "Disponible en X": nunca
 *    como obligatoria si es imposible (FREE sin canales no "debe" conectar
 *    WhatsApp).
 *  - available: se puede hacer ya.
 *
 * Con `roleRestricted` la tarea es de OWNER/ADMIN (p. ej. configurar el
 * negocio): quien no tiene el rol la ve como aviso, SIN enlace a una accion
 * que el servidor le negaria, y no le cuenta como pendiente propia.
 */
export type ChecklistState = 'completed' | 'available' | 'locked' | 'notRelevant';

export type ChecklistItem = {
  id: ChecklistTaskId;
  label: string;
  description: string;
  /** null = esta persona no puede hacerla (rol): se muestra sin enlace. */
  href: string | null;
  state: ChecklistState;
  lockedPlan: string | null;
  roleRestricted: boolean;
};

export type ResolvedChecklist = {
  items: ChecklistItem[];
  notRelevant: ChecklistTaskId[];
  /** Completadas / tareas que se pueden hacer (las bloqueadas no cuentan). */
  completed: number;
  actionable: number;
  done: boolean;
};

export function resolveChecklist(input: {
  presetTasks: ChecklistTaskId[];
  completed: Partial<Record<ChecklistTaskId, boolean>>;
  access: (requirement: ChecklistRequirement) => FeatureAccess;
  role: WorkspaceRole;
}): ResolvedChecklist {
  const relevant = input.presetTasks.filter((id, index, list) => CHECKLIST_TASK_IDS.includes(id) && list.indexOf(id) === index);
  const items = relevant.map((id): ChecklistItem => {
    const task = CHECKLIST_TASKS[id];
    const roleRestricted = !roleAllows(input.role, task.minRole);
    const base = { id, label: task.label, description: task.description, href: roleRestricted ? null : task.href, roleRestricted };
    if (input.completed[id]) return { ...base, state: 'completed', lockedPlan: null };
    const access = task.requires ? input.access(task.requires) : { allowed: true, requiredPlanName: null };
    if (!access.allowed) return { ...base, state: 'locked', lockedPlan: access.requiredPlanName };
    return { ...base, state: 'available', lockedPlan: null };
  });
  const completed = items.filter((item) => item.state === 'completed').length;
  // Cuenta lo que ESTA persona puede hacer (ni bloqueado por plan ni de otro rol).
  const actionable = items.filter((item) => item.state === 'completed' || (item.state === 'available' && !item.roleRestricted)).length;
  return {
    items,
    notRelevant: CHECKLIST_TASK_IDS.filter((id) => !relevant.includes(id)),
    completed,
    actionable,
    done: completed === actionable,
  };
}
