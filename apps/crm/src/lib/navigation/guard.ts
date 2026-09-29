import { notFound } from 'next/navigation';
import { requireCurrentUser } from '../auth';
import { roleAllows } from '../workspace-roles';
import { navItem, type NavItemId } from './items';

/**
 * Guard de pagina por modulo (P0-E). El rol minimo sale del MISMO catalogo
 * que usa el sidebar (`NAV_ITEMS[].minRole`): si el menu no se lo muestra a un
 * rol, la pagina tampoco se le abre escribiendo la URL.
 *
 * Quien no alcanza recibe 404 (misma politica que /platform: que el modulo
 * exista no es asunto de quien no puede usarlo). Las APIs del modulo
 * mantienen su propio chequeo (403 JSON).
 */
export async function requireModuleAccess(id: NavItemId) {
  const user = await requireCurrentUser();
  if (!roleAllows(user.role, navItem(id)?.minRole)) notFound();
  return user;
}
