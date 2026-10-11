/**
 * Opciones de los selects de los formularios que envían a /api/contact.
 *
 * Viven aquí y no en cada formulario porque el endpoint valida contra estas
 * mismas listas: si se agrega una opción en un formulario sin tocar el
 * servidor, el envío legítimo se rechazaría. Una sola fuente evita eso.
 */

// /contacto
export const CONTACT_SERVICES = [
  "Branding y Dirección Visual",
  "Diseño y Desarrollo Web",
  "E-commerce",
  "Marketing Digital y Contenido",
  "Ads y Performance",
  "Apps Móviles",
  "Automatización e Inteligencia Artificial",
  "Soluciones Express",
  "No estoy seguro, quiero orientación",
];

export const CONTACT_BUDGETS = [
  "Menos de $500.000 CLP",
  "$500.000 - $1.500.000 CLP",
  "$1.500.000 - $3.000.000 CLP",
  "$3.000.000 - $6.000.000 CLP",
  "Más de $6.000.000 CLP",
  "Prefiero definirlo con ustedes",
];

export const CONTACT_URGENCIES = [
  "Esta semana",
  "Este mes",
  "1 a 3 meses",
  "Estoy planificando",
];

// CTA de la home ("Qué necesitas")
export const HOME_CTA_SCOPES = [
  "Branding estratégico",
  "Web de alto rendimiento",
  "E-commerce",
  "UX / UI",
  "Dirección creativa",
  "Auditoría de marca",
  "Otro · Conversemos",
];

// /brief/*
export const BRIEF_BUDGETS = [
  "Menos de $500.000 CLP",
  "$500.000 - $1.500.000 CLP",
  "$1.500.000 - $3.000.000 CLP",
  "Más de $3.000.000 CLP",
  "Prefiero definirlo con ustedes",
];

export const BRIEF_TYPES = ["Brief de marca", "Brief de marca personal"];
export const BRIEF_SERVICES = ["Branding y Dirección Visual", "Branding personal"];

/** Valores aceptados por el servidor (unión de todos los formularios). */
export const ALLOWED_SERVICES = new Set([...CONTACT_SERVICES, ...HOME_CTA_SCOPES, ...BRIEF_SERVICES]);
export const ALLOWED_BUDGETS = new Set([...CONTACT_BUDGETS, ...BRIEF_BUDGETS]);
export const ALLOWED_URGENCIES = new Set(CONTACT_URGENCIES);
export const ALLOWED_BRIEF_TYPES = new Set(BRIEF_TYPES);
export const ALLOWED_KINDS = new Set(["brief"]);

/** Nombre del campo trampa. Lo comparten los formularios y el endpoint. */
export const HONEYPOT_FIELD = "website";

/**
 * Envíos más rápidos que esto se registran como señal en los logs
 * (`contact_form_fast_submit`), pero no se descartan: con autocompletado y un
 * mensaje pegado, un cliente real puede enviar en un segundo.
 */
export const MIN_FILL_MS = 1500;
