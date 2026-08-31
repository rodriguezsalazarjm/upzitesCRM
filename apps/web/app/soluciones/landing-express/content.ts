/**
 * Fuente unica de contenido de /soluciones/landing-express.
 *
 * La pagina renderiza desde aqui y el JSON-LD (FAQPage + Service) se serializa
 * desde estos mismos objetos, de modo que el structured data no puede quedar
 * desincronizado del contenido visible. Si cambias un precio o una pregunta,
 * cambia en los dos lugares a la vez.
 */

import { SITE_URL } from "@/lib/blog";
import type { IconKey } from "./icons";

/* ------------------------------------------------------------------ */
/* Identidad de la ruta                                                */
/* ------------------------------------------------------------------ */

export const PATH = "/soluciones/landing-express";
export const CANONICAL = `${SITE_URL}${PATH}`;

export const TITLE = "Landing Page + Branding Express | UPZITES";
export const DESCRIPTION =
  "Creamos tu identidad visual base y una landing page profesional para que tu negocio se vea claro, confiable y listo para captar clientes. Solución express.";
export const OG_DESCRIPTION =
  "Marca clara + landing profesional + WhatsApp listo para captar clientes.";

export const KEYWORDS = [
  "landing page para negocio",
  "branding express",
  "identidad visual rápida",
  "página para emprendedores",
  "presencia digital profesional",
  "landing para captar clientes",
];

/* ------------------------------------------------------------------ */
/* Taxonomia de tracking                                               */
/* ------------------------------------------------------------------ */

/** `content_name` unico de esta landing en Meta Pixel / GA4. */
export const CONTENT_NAME = "landing-express";

/** `content_category`: que producto concreto pide el usuario al hacer click. */
export type TrackCategory = "starter" | "express-pro" | "generico";

/** `source_section`: desde donde salio el click. */
export type SourceSection = "nav" | "hero" | "planes" | "cierre" | "sticky";

/* ------------------------------------------------------------------ */
/* Plazo de entrega                                                    */
/* ------------------------------------------------------------------ */

/**
 * Plazo comprometido. Se declara una sola vez porque aparece en cuatro lugares
 * (sello del hero, paso 04, nota de proceso y FAQ) y no pueden contradecirse.
 */
export const PLAZO_LABEL = "7 días hábiles";

/** El plazo arranca cuando llega TODO el material. Ver CHECKLIST. */
export const PLAZO_CONDICION =
  "El plazo empieza a correr cuando recibimos todo el material. Si falta algo, la cuenta se pausa.";

/* ------------------------------------------------------------------ */
/* Mensajes de WhatsApp                                                */
/* ------------------------------------------------------------------ */

export const MSG_MAIN =
  "Hola UPZITES, quiero cotizar Landing Page + Branding Express para mi negocio.";

export function planMessage(planName: string) {
  return `Hola UPZITES, quiero cotizar el Plan ${planName} de Landing Page + Branding Express para mi negocio.`;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

/**
 * Formatea un monto CLP como "$89.990". Manual y no dependiente de ICU para que
 * el HTML del servidor y el del cliente sean identicos byte a byte.
 */
export function clp(amount: number): string {
  return `$${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/* ------------------------------------------------------------------ */
/* Contenido                                                           */
/* ------------------------------------------------------------------ */

export type IncluyeItem = { icon: IconKey; title: string; text: string };

export const INCLUYE: IncluyeItem[] = [
  { icon: "identidad", title: "Identidad visual base", text: "Una dirección visual clara para tu marca: colores, estilo gráfico y línea estética inicial." },
  { icon: "paleta", title: "Paleta de colores", text: "Colores principales y secundarios para que tu marca se vea coherente." },
  { icon: "tipografia", title: "Tipografías recomendadas", text: "Combinaciones tipográficas para títulos, textos y piezas digitales." },
  { icon: "landing", title: "Landing page profesional", text: "Diseñamos y desarrollamos una landing enfocada en presentar tu negocio y generar consultas." },
  { icon: "copy", title: "Copy comercial organizado", text: "Ordenamos los textos para explicar qué haces, a quién ayudas y por qué contactarte." },
  { icon: "chat", title: "Botón a WhatsApp", text: "Llamadas a la acción para que los visitantes te escriban directamente." },
  { icon: "movil", title: "Versión móvil optimizada", text: "Se ve impecable desde el celular, donde llegan tus clientes de Instagram y WhatsApp." },
];

export const STEPS = [
  { title: "Nos cuentas tu negocio", text: "Recopilamos info básica de tu marca, servicio, público, objetivo y contacto." },
  { title: "Definimos tu dirección visual", text: "Trabajamos una línea simple: colores, tipografías, estilo y tono de presentación." },
  { title: "Construimos tu landing", text: "Creamos una página moderna, simple y orientada a conversión." },
  { title: "Publicas y compartes", text: `Te entregamos un link listo para WhatsApp, Instagram, anuncios o tarjetas digitales, en ${PLAZO_LABEL}.` },
];

export type Plan = {
  /** Coincide con `content_category` en los eventos de conversion. */
  id: Extract<TrackCategory, "starter" | "express-pro">;
  name: string;
  /** Monto en CLP como numero: alimenta el precio visible Y el `offer` del JSON-LD. */
  amountClp: number;
  ideal: string;
  /** Rondas de ajustes incluidas. Alimenta la lista del plan Y la FAQ de cambios. */
  rounds: number;
  features: string[];
  cta: string;
  featured: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    amountClp: 89990,
    ideal: "Presencia digital simple, rápida y profesional.",
    rounds: 2,
    features: ["Dirección visual base", "Paleta de colores", "Tipografías recomendadas", "Landing de hasta 4 secciones", "Copy básico organizado", "Botón directo a WhatsApp", "Diseño responsive", "Publicación en subdominio o link"],
    cta: "Quiero el Plan Starter",
    featured: false,
  },
  {
    id: "express-pro",
    name: "Express Pro",
    amountClp: 149990,
    ideal: "Presentación más completa y mejor estructura comercial.",
    rounds: 3,
    features: ["Todo lo del Plan Starter", "Logo simple o mejora del actual", "Landing de hasta 6 secciones", "Sección de servicios", "Sección de confianza / testimonios", "Copy comercial organizado", "Optimización móvil", "Publicación en subdominio, dominio o link"],
    cta: "Quiero el Plan Express Pro",
    featured: true,
  },
];

/** "2 rondas de ajustes incluidas". Se inyecta en la lista de cada plan. */
export function roundsLabel(plan: Plan): string {
  return `${plan.rounds} ${plan.rounds === 1 ? "ronda" : "rondas"} de ajustes incluidas`;
}

/** Lista de features + las rondas, para que el plan muestre una sola lista coherente. */
export function planFeatures(plan: Plan): string[] {
  return [...plan.features, roundsLabel(plan)];
}

export const COMPARE_BAD = ["No comunica bien", "No tiene estructura", "No genera confianza", "No explica el servicio", "No tiene identidad visual", "No guía a tomar acción"];
export const COMPARE_GOOD = ["Presenta tu negocio de forma profesional", "Ordena visualmente tu marca", "Explica tu oferta con claridad", "Genera confianza", "CTA directo a WhatsApp", "Pensada para captar clientes"];

export const EXAMPLES = [
  { title: "Marca personal", text: "Para asesores, corredores, coaches, consultores o profesionales independientes." },
  { title: "Servicio local", text: "Instalación, estética, salud, fotografía, gastronomía o servicios técnicos." },
  { title: "Emprendimiento", text: "Para presentar una idea, validar un servicio o lanzar una oferta." },
  { title: "Profesional independiente", text: "Para mostrar experiencia, servicios, beneficios y contacto." },
];

export const DIFFS = [
  "No solo diseñamos: pensamos cómo presentar mejor tu negocio.",
  "Creamos una base visual clara y útil.",
  "Diseñamos páginas enfocadas en conversión.",
  "Unimos marca, diseño web y estrategia comercial.",
  "Entregamos rápido sin que parezca improvisado.",
  "Puedes escalar a web completa, ecommerce o campañas.",
];

export type Addon = {
  name: string;
  /**
   * Precio "desde" en CLP. `null` = dato pendiente: la UI NO muestra precio en
   * lugar de inventar uno. En cuanto pongas el numero, aparece solo.
   */
  priceFrom: number | null;
  note?: string;
};

/**
 * TODO(upzites): faltan los 6 precios. Mientras `priceFrom` sea null, el
 * adicional se muestra sin valor y el cliente sigue teniendo que preguntar por
 * WhatsApp — que es justo el problema que esta seccion deberia resolver.
 */
export const ADDONS: Addon[] = [
  { name: "Dominio personalizado", priceFrom: null /* TODO(upzites): precio */ },
  { name: "Correo corporativo", priceFrom: null /* TODO(upzites): precio */ },
  { name: "SEO básico", priceFrom: null /* TODO(upzites): precio */ },
  { name: "Kit visual para redes", priceFrom: null /* TODO(upzites): precio */ },
  { name: "Meta Pixel / Analytics", priceFrom: null /* TODO(upzites): precio */ },
  { name: "Formulario de contacto", priceFrom: null /* TODO(upzites): precio */ },
];

/**
 * TODO(upzites): definir quien paga la renovacion anual del dominio a partir
 * del segundo ano. Mientras sea null no se muestra ninguna nota.
 */
export const DOMINIO_RENOVACION: string | null = null;

/**
 * Condiciones comerciales. TODO(upzites): confirmar si los precios publicados
 * incluyen IVA y que medios de pago se aceptan. Con los campos vacios la UI
 * omite el bloque completo en vez de afirmar algo falso.
 */
export const CONDICIONES: { iva: string | null; formasPago: string[] } = {
  iva: null, // TODO(upzites): "Precios con IVA incluido" | "Precios netos, + IVA"
  formasPago: [], // TODO(upzites): ej. ["Transferencia", "Webpay", "50% de anticipo"]
};

/* ------------------------------------------------------------------ */
/* Prueba social                                                       */
/* ------------------------------------------------------------------ */

/**
 * OJO con la honestidad del rotulo: grafiks.cl e ironmallas.cl son sitios web
 * completos que hizo UPZITES, NO landings express. La seccion los presenta como
 * "trabajo publicado", nunca como casos de este producto.
 */
export type CaseStudy = {
  slug: string;
  brand: string;
  sector: string;
  url: string;
  /** Portada 900x648; se muestra dentro de un marco de navegador. */
  shot: string;
  /** Una linea de resultado verificable. null = no se muestra nada. */
  result: string | null;
};

export const CASES: CaseStudy[] = [
  {
    slug: "grafiks",
    brand: "Grafiks",
    sector: "Estudio creativo",
    url: "https://www.grafiks.cl",
    shot: "/images/websites/grafiks-cover.webp",
    result: null, // TODO(upzites): una linea de resultado verificable
  },
  {
    slug: "ironmallas",
    brand: "Iron Mallas",
    sector: "Web industrial",
    url: "https://www.ironmallas.cl",
    shot: "/images/websites/ironmallas-cover.webp",
    result: null, // TODO(upzites): una linea de resultado verificable
  },
];

export type Testimonial = { quote: string; name: string; role: string; brand: string };

/**
 * TODO(upzites): faltan testimonios reales. Vacio a proposito: el bloque no se
 * renderiza y la pagina se puede publicar sin inventar citas.
 * Forma esperada:
 *   { quote: "...", name: "Nombre Apellido", role: "Dueño", brand: "Marca" }
 */
export const TESTIMONIALS: Testimonial[] = [];

export type ClientLogo = { name: string; src: string };

/**
 * TODO(upzites): confirmar cuales de los 8 archivos de /public/work-brands se
 * pueden publicar como cliente. Vacio = la franja no se renderiza.
 * Disponibles: avacos, dirty-pizza, gloobitos, iron-mallas, reyes-protec,
 * urban-wild, valle-smash, vr-automotriz.
 */
export const CLIENT_LOGOS: ClientLogo[] = [];

/* ------------------------------------------------------------------ */
/* Qué necesitamos de ti                                               */
/* ------------------------------------------------------------------ */

export const CHECKLIST = [
  { title: "Tu logo, si ya tienes", text: "El archivo en el mejor formato que tengas: vectorial, PDF, PNG o incluso una foto. Si no tienes logo, el plan Express Pro lo incluye." },
  { title: "Fotos de tu trabajo", text: "Entre 5 y 10 imágenes reales de tus productos, servicios, local o equipo. Las del celular sirven si tienen buena luz." },
  { title: "Textos base", text: "Qué haces, a quién ayudas y por qué elegirte. No hace falta que estén redactados: nosotros los ordenamos." },
  { title: "Tus redes y enlaces", text: "Instagram, Facebook, TikTok o cualquier perfil que quieras enlazar desde la landing." },
  { title: "Datos de contacto", text: "Número de WhatsApp, correo, ciudad y horario de atención." },
];

export const TRUST_ITEMS = [
  "Identidad visual base",
  "Landing profesional",
  "CTA a WhatsApp",
  "Optimizada para móvil",
  "Lista para compartir",
  "Producción express",
];

export type FaqItem = { q: string; a: string };

export const FAQ: FaqItem[] = [
  { q: "¿Esto es una marca completa?", a: "No. Es una identidad visual express para empezar con una presencia clara y profesional. Si necesitas branding completo, se cotiza como proyecto personalizado." },
  { q: "¿La landing queda publicada?", a: "Sí. Puede publicarse en un dominio, subdominio o link temporal según el plan contratado." },
  { q: "¿Puedo usar mi logo actual?", a: "Sí. Si ya tienes logo, trabajamos sobre esa base y mejoramos la presentación visual." },
  { q: "¿Sirve para vender?", a: "Sí. Se estructura para explicar tu oferta, generar confianza y llevar al usuario a contactarte." },
  { q: "¿Puedo agregar más secciones después?", a: "Sí. Si necesitas crecer, pasamos a una web más completa o un proyecto personalizado." },
  { q: "¿Incluye ecommerce?", a: "No en la versión base. Si necesitas vender productos online, cotizamos una tienda o catálogo aparte." },
  {
    q: "¿Cuánto demora?",
    a: `${PLAZO_LABEL} desde que recibimos todo el material: logo si lo tienes, fotos, textos base, redes y datos de contacto. Si falta algo, la cuenta se pausa hasta que llegue.`,
  },
  {
    q: "¿Cuántos cambios puedo pedir?",
    // Derivado de PLANS: si cambias las rondas de un plan, esta respuesta cambia sola.
    a: `${PLANS.map((plan, i) =>
      i === 0
        ? `${plan.name} incluye ${plan.rounds} ${plan.rounds === 1 ? "ronda" : "rondas"} de ajustes`
        : `${plan.name} incluye ${plan.rounds}`
    ).join(" y ")}. Cada ronda junta todos tus comentarios en una sola entrega, así avanzamos rápido. Si necesitas más ajustes después de eso, se cotizan aparte.`,
  },
];

/* ------------------------------------------------------------------ */
/* JSON-LD                                                             */
/* ------------------------------------------------------------------ */

/**
 * Structured data derivado de los arrays de arriba. No escribas preguntas ni
 * precios a mano aqui: si algo falta en el JSON-LD, falta en el contenido.
 */
export function buildJsonLd() {
  const faqPage = {
    "@type": "FAQPage",
    "@id": `${CANONICAL}#faq`,
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const service = {
    "@type": "Service",
    "@id": `${CANONICAL}#service`,
    name: "Landing Page + Branding Express",
    serviceType: "Diseño de landing page e identidad visual express",
    description: DESCRIPTION,
    url: CANONICAL,
    provider: {
      "@type": "Organization",
      name: "UPZITES",
      url: SITE_URL,
    },
    areaServed: { "@type": "Country", name: "Chile" },
    offers: PLANS.map((plan) => ({
      "@type": "Offer",
      name: `Plan ${plan.name}`,
      description: plan.ideal,
      price: String(plan.amountClp),
      priceCurrency: "CLP",
      url: CANONICAL,
      availability: "https://schema.org/InStock",
    })),
  };

  return { "@context": "https://schema.org", "@graph": [service, faqPage] };
}

/** Serializa el JSON-LD neutralizando `<` para que no pueda cerrar el <script>. */
export function jsonLdString() {
  return JSON.stringify(buildJsonLd()).replace(/</g, "\\u003c");
}
