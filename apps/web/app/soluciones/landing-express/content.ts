/**
 * Fuente unica de contenido de /soluciones/landing-express.
 *
 * La pagina renderiza desde aqui y el JSON-LD (FAQPage + Service) se serializa
 * desde estos mismos objetos, de modo que el structured data no puede quedar
 * desincronizado del contenido visible. Si cambias un precio o una pregunta,
 * cambia en los dos lugares a la vez.
 */

import { SITE_URL } from "@/lib/blog";
import { BRANDING_PROJECTS, WEB_PROJECTS } from "@/lib/projects";
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
  "Hola UPZITES, quiero profesionalizar mi marca con Landing Page + Branding Express.";

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

export type IncluyeItem = { icon: IconKey; title: string; text: string; image: string; accent: string };

/** El `accent` tiñe la foto en multiply, igual que las tarjetas de Servicios. */
export const INCLUYE: IncluyeItem[] = [
  { icon: "identidad", title: "Identidad visual base", text: "Una dirección visual clara para tu marca: colores, estilo gráfico y línea estética inicial.", image: "/images/branding-cover.webp", accent: "var(--upz-guava)" },
  { icon: "paleta", title: "Paleta de colores", text: "Colores principales y secundarios para que tu marca se vea coherente.", image: "/images/branding-system.webp", accent: "var(--upz-electric)" },
  { icon: "tipografia", title: "Tipografías recomendadas", text: "Combinaciones tipográficas para títulos, textos y piezas digitales.", image: "/images/branding-process.webp", accent: "var(--upz-solar)" },
  { icon: "landing", title: "Landing page profesional", text: "Diseñamos y desarrollamos una landing enfocada en presentar tu negocio y generar consultas.", image: "/images/diseno-web-cover.webp", accent: "var(--upz-electric)" },
  { icon: "copy", title: "Copy comercial organizado", text: "Ordenamos los textos para explicar qué haces, a quién ayudas y por qué contactarte.", image: "/images/diseno-web-promise.webp", accent: "var(--upz-lime)" },
  { icon: "chat", title: "Botón a WhatsApp", text: "Llamadas a la acción para que los visitantes te escriban directamente.", image: "/images/diseno-web-conversion.webp", accent: "var(--upz-tangerine)" },
  { icon: "movil", title: "Versión móvil optimizada", text: "Se ve impecable desde el celular, donde llegan tus clientes de Instagram y WhatsApp.", image: "/images/apps-cover.webp", accent: "var(--upz-guava)" },
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
    amountClp: 99990,
    ideal: "Presencia digital simple, rápida y profesional.",
    rounds: 2,
    features: ["Dirección visual base", "Paleta de colores", "Tipografías recomendadas", "Landing de hasta 4 secciones", "Copy básico organizado", "Botón directo a WhatsApp", "Diseño responsive", "Publicación en subdominio o link"],
    cta: "Quiero el Plan Starter",
    featured: false,
  },
  {
    id: "express-pro",
    name: "Express Pro",
    amountClp: 179990,
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

export const DIFFS = [
  "No solo diseñamos: pensamos cómo presentar mejor tu negocio.",
  "Creamos una base visual clara y útil.",
  "Diseñamos páginas enfocadas en conversión.",
  "Unimos marca, diseño web y estrategia comercial.",
  "Entregamos rápido sin que parezca improvisado.",
  "Puedes escalar a web completa, ecommerce o campañas.",
];

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
/* Galería del hero                                                    */
/* ------------------------------------------------------------------ */

export type HeroShot = { src: string; brand: string; kind: string };

/**
 * Paneles del hero. Todo esto SI es trabajo de UPZITES (sale de
 * public/images/proyectos y public/images/websites), asi que aqui si se puede
 * rotular con la marca. Se alterna claro/oscuro para que la fila respire.
 */
export const HERO_GALLERY: HeroShot[] = [
  { src: "/images/websites/grafiks-cover.webp", brand: "Grafiks", kind: "Sitio web" },
  { src: "/images/proyectos/dirtypizza/03.webp", brand: "Dirty Pizza", kind: "Identidad" },
  { src: "/images/websites/ironmallas-cover.webp", brand: "Iron Mallas", kind: "Sitio web" },
  { src: "/images/proyectos/valle-smash/02.webp", brand: "Valle Smash", kind: "Identidad" },
  { src: "/images/proyectos/urbanwild/02.webp", brand: "Urban Wild", kind: "Identidad" },
  { src: "/images/websites/profileempresarial-cover.webp", brand: "Profile Empresarial", kind: "Sitio web" },
];

/* ------------------------------------------------------------------ */
/* Prueba social                                                       */
/* ------------------------------------------------------------------ */

/**
 * OJO con la honestidad del rotulo: grafiks.cl e ironmallas.cl son sitios web
 * completos que hizo UPZITES, NO landings express. La seccion los presenta como
 * "trabajo publicado", nunca como casos de este producto.
 */
export type WorkItem = {
  slug: string;
  name: string;
  /** "Sitio web" | "Identidad". Se muestra como eyebrow del panel. */
  kind: string;
  image: string;
  url: string;
};

/**
 * Marcas destacadas para la tira. Se cura a mano: con las 16 los paneles
 * quedaban demasiado angostos para reconocer nada. El portafolio completo vive
 * en /proyectos y se enlaza al pie de la seccion.
 */
const MARCAS_DESTACADAS = [
  "dirtypizza",
  "valle-smash",
  "urbanwild",
  "crema",
  "koriramen",
  "gloobitos",
  "vr-automotriz",
];

/**
 * Portafolio de la tira: los sitios publicados (`WEB_PROJECTS`, sin los que
 * siguen en construcción) mas las marcas destacadas.
 *
 * Sale de los mismos arrays que /proyectos en la web principal, asi que al
 * publicar un proyecto nuevo basta con sumarlo a la lista de destacadas.
 */
export const WORK_STRIP: WorkItem[] = [
  ...WEB_PROJECTS.filter((p) => !p.status).map((p) => ({
    slug: p.slug,
    name: p.name,
    kind: "Sitio web",
    image: p.cover,
    url: p.url,
  })),
  ...MARCAS_DESTACADAS.flatMap((slug) => {
    const p = BRANDING_PROJECTS.find((b) => b.slug === slug);
    // Si mañana se renombra un slug en /proyectos, se cae solo en vez de
    // renderizar un panel roto.
    return p ? [{ slug: p.slug, name: p.name, kind: "Identidad", image: p.images[0], url: `${SITE_URL}/proyectos` }] : [];
  }),
];

/** Cuantos proyectos hay en total, para el pie de la seccion. */
export const WORK_TOTAL = WEB_PROJECTS.length + BRANDING_PROJECTS.length;

export type Testimonial = { quote: string; name: string; role: string; brand: string; avatar?: string };

/**
 * ⚠️ TESTIMONIOS DE RELLENO — NO SON REALES.
 *
 * Estan aqui solo para ver y ajustar el layout. NO deben publicarse: son
 * opiniones inventadas y presentarlas como reales seria falsear reseñas.
 * Reemplazalos por los de verdad antes de subir a produccion; para vaciar la
 * seccion basta con dejar el array en [].
 *
 * A proposito no llevan foto: se dibuja una placa con la inicial. Poner
 * retratos de stock haria pasar por clientes a personas que no lo son.
 */
export const TESTIMONIALS_SON_PLACEHOLDER = true;

export const TESTIMONIALS: Testimonial[] = [
  { quote: "Llevaba dos años mandando fotos por WhatsApp para explicar lo que hacía. Ahora mando un link y se entiende solo.", name: "Camila Fuentes", role: "Dueña", brand: "Estudio de uñas" },
  { quote: "Lo que más me sirvió fue el orden. No era que me faltara trabajo, era que no sabía cómo mostrarlo.", name: "Rodrigo Peña", role: "Fotógrafo", brand: "Marca personal" },
  { quote: "En una semana pasé de no tener nada a tener marca y página. Justo antes de la temporada alta.", name: "Valentina Soto", role: "Fundadora", brand: "Pastelería" },
  { quote: "Los colores y las tipografías me ordenaron todo lo demás: el Instagram, los flyers, hasta el delantal.", name: "Matías Aravena", role: "Socio", brand: "Food truck" },
  { quote: "Antes me preguntaban si era formal. Ahora me preguntan por disponibilidad.", name: "Javiera Núñez", role: "Corredora de propiedades", brand: "Marca personal" },
  { quote: "El botón de WhatsApp cambió todo. Las consultas llegan directo y ya sé de dónde vienen.", name: "Sebastián Rojas", role: "Gerente", brand: "Servicios técnicos" },
  { quote: "Pedí dos rondas de cambios y quedaron. No hubo que pelear por cada detalle.", name: "Antonia Lagos", role: "Dueña", brand: "Tienda de plantas" },
  { quote: "Me explicaron qué mandar y cuándo. Nunca tuve que estar persiguiéndolos.", name: "Ignacio Vera", role: "Consultor", brand: "Asesoría contable" },
  { quote: "La página se ve igual de bien en el celular, que es por donde me llega el 90% de la gente.", name: "Francisca Morales", role: "Fundadora", brand: "Estética" },
  { quote: "Partí con el plan más simple para probar. Funcionó, y después escalamos a algo más grande.", name: "Diego Contreras", role: "Dueño", brand: "Taller mecánico" },
];

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
