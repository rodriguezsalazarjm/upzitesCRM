/**
 * Headers internos que pone `src/proxy.ts`. El proxy borra los que traiga el
 * cliente y los reescribe, asi que el codigo del servidor puede confiar en
 * ellos. Modulo sin dependencias para usarlo desde cualquier capa.
 */
export const REQUEST_METHOD_HEADER = 'x-upzites-method';
export const REQUEST_PATH_HEADER = 'x-upzites-path';
export const REQUEST_ID_HEADER = 'x-upzites-request-id';
/** SupportSession de la cookie firmada; enlaza la auditoria de negocio con el soporte. */
export const SUPPORT_SESSION_HEADER = 'x-upzites-support-session';
/** Consistencia multi-pestana: workspace con el que se renderizo la pagina (lo manda el cliente). */
export const WORKSPACE_HEADER = 'x-upzites-workspace';

export const PROXY_OWNED_HEADERS = [
  REQUEST_METHOD_HEADER,
  REQUEST_PATH_HEADER,
  REQUEST_ID_HEADER,
  SUPPORT_SESSION_HEADER,
] as const;
