export const SITE_URL = "https://www.upzites.com";

export type BlogPost = {
  slug: string;
  title: string;        // H1 visible
  metaTitle: string;    // <title>
  metaDescription: string;
  subtitle: string;
  excerpt: string;      // resumen para el índice
  category: string;
  keyword: string;
  cover: string;
  date: string;         // ISO para schema
  updated: string;      // texto visible
  author: { name: string; role: string };
  readingTime: string;
  tags: string[];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "pagina-web-tienda-online-o-app-emprendimiento-chile",
    title:
      "¿Página web, tienda online o app? Qué necesita tu emprendimiento en Chile para vender más en 2026",
    metaTitle:
      "¿Página web, tienda online o app? Guía para emprendedores en Chile 2026",
    metaDescription:
      "Descubre si tu negocio necesita branding, una landing page, tienda online, CRM o una app. Guía práctica con costos y prioridades para emprendedores en Chile.",
    subtitle:
      "Guía práctica para decidir entre branding, landing page, tienda online, CRM o app móvil según tu etapa, presupuesto y forma de vender.",
    excerpt:
      "Tener Instagram no significa tener un negocio digital. Te mostramos cuándo necesitas branding, una landing, una tienda online, un CRM o una app — y qué invertir primero.",
    category: "Guía · Digitalización",
    keyword: "página web para emprendedores Chile",
    cover: "/images/diseno-web-cover.webp",
    date: "2026-06-23",
    updated: "Actualizado en junio de 2026",
    author: { name: "José Rodríguez", role: "Fundador, programador y diseñador de UPZITES" },
    readingTime: "9 min de lectura",
    tags: [
      "página web para emprendedores Chile",
      "cuánto cuesta una página web en Chile 2026",
      "tienda online para emprendedores",
      "branding para emprendimientos",
      "landing page para vender por WhatsApp",
      "CRM para pymes Chile",
      "cómo digitalizar un emprendimiento",
    ],
  },
  {
    slug: "mejor-camara-contenido-vertical-2026-iphone-dji-canon-sony",
    title:
      "La mejor cámara para crear contenido vertical en 2026: iPhone, DJI Osmo Pocket 4, Canon PowerShot V1 o Sony ZV-E10 II",
    metaTitle:
      "Mejor cámara para contenido vertical 2026: iPhone, DJI, Canon o Sony",
    metaDescription:
      "Comparamos iPhone, DJI Osmo Pocket 4, Canon PowerShot V1 y Sony ZV-E10 II para Reels, TikTok y ads. Cuál comprar según cómo grabas, editas y publicas.",
    subtitle:
      "No necesitas la cámara más cara para crear contenido que venda. Necesitas la correcta para cómo grabas, editas y publicas.",
    excerpt:
      "iPhone, DJI Osmo Pocket 4, Canon PowerShot V1 o Sony ZV-E10 II. Cuál te conviene según tu tipo de contenido, y qué comprar primero antes de gastar en una cámara.",
    category: "Guía · Contenido",
    keyword: "mejor cámara para contenido vertical 2026",
    cover: "/images/marketing-cover.webp",
    date: "2026-06-23",
    updated: "Actualizado en junio de 2026",
    author: { name: "José Rodríguez", role: "Fundador, programador y diseñador de UPZITES" },
    readingTime: "8 min de lectura",
    tags: [
      "mejor cámara para contenido vertical 2026",
      "DJI Osmo Pocket 4",
      "Canon PowerShot V1",
      "Sony ZV-E10 II",
      "cámara para reels y tiktok",
      "qué cámara comprar para crear contenido",
    ],
  },
  {
    slug: "embudo-alex-hormozi-vender-servicios-chile",
    title:
      "Desarmamos el embudo de Alex Hormozi para vender servicios en Chile: plantilla, errores y adaptación real",
    metaTitle:
      "Embudo de Alex Hormozi en Chile: plantilla, errores y adaptación real",
    metaDescription:
      "Análisis con postura del embudo de Alex Hormozi para vender servicios en Chile: qué sirve, qué no, plantilla paso a paso y errores al copiarlo literal.",
    subtitle:
      "El embudo de Hormozi funciona porque reduce el riesgo percibido y hace la oferta muy clara. Pero copiarlo literal en Chile puede sonar agresivo o caro. Lo adaptamos.",
    excerpt:
      "Qué del embudo de Alex Hormozi sirve para vender servicios en Chile y qué no. Plantilla paso a paso, errores comunes y una adaptación realista para pymes.",
    category: "Análisis · Ventas",
    keyword: "embudo de Alex Hormozi Chile",
    cover: "/images/diseno-web-conversion.webp",
    date: "2026-06-23",
    updated: "Actualizado en junio de 2026",
    author: { name: "José Rodríguez", role: "Fundador, programador y diseñador de UPZITES" },
    readingTime: "10 min de lectura",
    tags: [
      "embudo de Alex Hormozi Chile",
      "embudo de ventas para servicios",
      "oferta irresistible Hormozi",
      "captar leads por WhatsApp",
      "CRM para seguimiento de leads",
      "cómo vender servicios online en Chile",
    ],
  },
  {
    slug: "herramientas-ia-para-pymes-chile-2026",
    title:
      "7 herramientas de IA que una pyme chilena sí puede usar en 2026 (y 3 que no necesita todavía)",
    metaTitle: "7 Herramientas de IA para Pymes en Chile que Sí Sirven en 2026",
    metaDescription:
      "Conoce las herramientas de inteligencia artificial que una pyme chilena puede usar para vender, crear contenido, ordenar clientes y automatizar tareas sin gastar de más.",
    subtitle:
      "No necesitas un “equipo de agentes IA” ni pagar diez suscripciones. Estas son las herramientas que realmente sirven para vender, responder, ordenar tareas y crear contenido sin botar plata.",
    excerpt:
      "Guía honesta de implementación: qué problema resuelve cada herramienta de IA, para quién sirve y cuándo no vale la pena pagarla. Más 3 que tu pyme no necesita todavía.",
    category: "Guía · Inteligencia Artificial",
    keyword: "herramientas IA para pymes Chile",
    cover: "/blog/ia-pymes-cover.jpg",
    date: "2026-06-23",
    updated: "Actualizado en junio de 2026",
    author: { name: "José Rodríguez", role: "Fundador, programador y diseñador de UPZITES" },
    readingTime: "9 min de lectura",
    tags: [
      "herramientas IA para pymes Chile",
      "inteligencia artificial para emprendedores",
      "automatización para pymes",
      "IA para ventas",
      "IA para redes sociales",
      "cómo usar ChatGPT en mi negocio",
      "automatizar WhatsApp y formularios",
      "CRM con inteligencia artificial",
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
