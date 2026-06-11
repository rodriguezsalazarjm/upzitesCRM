export type ServiceDetail = {
  headline: string;
  intro: string[];
  includes: { title: string; body: string }[];
  benefits: string[];
  cta: string;
};

export type Service = {
  num: string;
  slug: string;
  title: string;
  tagline: string;
  card: string;
  tags: string[];
  image: string;
  accent: string;
  badge?: string;
  detail: ServiceDetail;
};

export const SERVICES: Service[] = [
  {
    num: "01",
    slug: "branding",
    title: "Branding estratégico",
    tagline: "Identidad que vende, no solo que se ve bonita.",
    card: "Creamos identidades visuales memorables. Convertimos tu visión en un sistema visual coherente, profesional y poderoso.",
    tags: ["Identidad", "Sistema visual", "Manual"],
    image: "/images/branding-cover.webp",
    accent: "var(--upz-tomato)",
    detail: {
      headline: "Branding estratégico",
      intro: [
        "En un mercado saturado, tu marca necesita ser más que 'bonita'. Fusionamos creatividad con análisis profundo para construir identidades memorables, coherentes y orientadas a resultados.",
        "No entregamos un logo: entregamos un sistema de marca que dirige las decisiones de tu negocio.",
      ],
      includes: [
        { title: "Identidad visual coherente", body: "Logotipo principal con variantes, diseñado para funcionar en web, impresión y redes sociales." },
        { title: "Estrategia de tono y mensaje", body: "Tono de voz y mensajes clave que guían toda tu estrategia de marketing digital." },
        { title: "Paleta cromática y tipografías", body: "Color y fuentes que refuerzan el mensaje y garantizan legibilidad en todas las plataformas." },
        { title: "Sistemas gráficos y elementos", body: "Patrones, iconos y elementos visuales de apoyo que dan vida a la marca." },
        { title: "Manual de marca detallado", body: "Guía completa de uso que asegura coherencia en cada aplicación." },
      ],
      benefits: [
        "Orientación a conversión en plataformas digitales",
        "SEO integrado desde la presentación de marca",
        "Listo para pantallas 4K y entornos móviles",
        "Propiedad total con archivos fuente editables",
      ],
      cta: "¿Listo para construir una marca que genere resultados reales?",
    },
  },
  {
    num: "02",
    slug: "diseno-web",
    title: "Diseño web",
    tagline: "Tu sitio web es tu vendedor 24/7.",
    card: "Sitios de alto rendimiento con SEO técnico y UX/UI de fábrica. Y ahora tu web puede integrar un chatbot con IA que responde a tus clientes por ti.",
    tags: ["Alto rendimiento", "SEO integrado", "Chatbot IA"],
    image: "/images/diseno-web-cover.webp",
    accent: "var(--upz-electric)",
    badge: "Nuevo · IA",
    detail: {
      headline: "Diseño web de alto rendimiento",
      intro: [
        "Tu sitio web es tu vendedor 24/7. Diseñamos plataformas rápidas, modernas y escalables — con buen SEO y un diseño UX/UI cuidado integrados desde el primer wireframe, no como un extra que se cobra aparte.",
        "Cada sitio nace con estructura SEO técnica, jerarquía semántica y un recorrido de usuario pensado para la conversión.",
      ],
      includes: [
        { title: "Landing pages de alta conversión", body: "Diseño y copy enfocados 100% en la acción y con velocidad de carga crítica." },
        { title: "Sitios corporativos a medida", body: "Plataformas que reflejan tu branding, con código limpio y estructura SEO." },
        { title: "SEO técnico integrado", body: "Jerarquía de encabezados, código semántico y Core Web Vitals optimizados desde el wireframe." },
        { title: "Diseño UX/UI", body: "Research, arquitectura y flujos intuitivos centrados en el recorrido del cliente." },
        { title: "Integración CMS / React", body: "WordPress o frameworks de vanguardia como React para máxima escalabilidad." },
        { title: "Mantenimiento y auditoría", body: "Soporte continuo de velocidad, seguridad y actualizaciones." },
      ],
      benefits: [
        "Velocidad impecable y altas puntuaciones en PageSpeed",
        "Tráfico orgánico de calidad gracias al SEO técnico",
        "Navegación intuitiva que reduce la fricción",
        "Escalable y fácil de administrar por tu equipo",
      ],
      cta: "¿Quieres una plataforma de alto rendimiento que venda por ti?",
    },
  },
  {
    num: "03",
    slug: "ecommerce",
    title: "E-commerce",
    tagline: "Tu tienda online, tu motor de ventas más potente.",
    card: "Tiendas online que venden, ahora potenciadas con IA: recomendaciones inteligentes y atención automática para subir tu conversión.",
    tags: ["Shopify", "WooCommerce", "IA + Conversión"],
    image: "/images/ecommerce-cover.webp",
    accent: "var(--upz-solar)",
    badge: "Nuevo · IA",
    detail: {
      headline: "E-commerce que convierte",
      intro: [
        "Diseñamos tu tienda como una máquina generadora de ingresos: fusionamos un UX/UI de alto nivel con ingeniería técnica robusta, desde la búsqueda del producto hasta el checkout.",
        "Cada decisión está pensada para tu retorno de inversión (ROI).",
      ],
      includes: [
        { title: "Experiencia de compra UX/UI", body: "Fichas de producto y filtros avanzados que minimizan la fricción en el carrito." },
        { title: "Sistemas de pago y seguridad", body: "Integración con pasarelas de pago e implementación de certificados SSL." },
        { title: "Gestión de catálogo", body: "Sistemas robustos para administrar inventario y variantes de producto." },
        { title: "Logística y automatización", body: "Configuración de envíos, cálculo de impuestos y automatización de correos." },
        { title: "Optimización SEO", body: "Microdatos y jerarquía para posicionar en búsquedas orgánicas." },
      ],
      benefits: [
        "Reducción del abandono de carrito",
        "Velocidad de carga optimizada",
        "Adaptable a móvil y pantallas 4K",
        "Diseño que refuerza marca y credibilidad",
      ],
      cta: "¿Es hora de que tu tienda online sea tu motor de ventas más potente?",
    },
  },
  {
    num: "04",
    slug: "marketing-digital",
    title: "Marketing digital",
    tagline: "Las campañas deben ser una inversión, no un gasto.",
    card: "Servicio integral: contenido, grabación de reels y TikTok, community manager y campañas en Meta y Google Ads. Estrategia y data para escalar tus ingresos.",
    tags: ["Contenido", "Community manager", "Meta & Google Ads"],
    image: "/images/marketing-cover.webp",
    accent: "var(--upz-guava)",
    detail: {
      headline: "Marketing digital integral",
      intro: [
        "Un solo equipo para todo tu crecimiento: creamos el contenido, lo distribuimos y lo amplificamos con campañas que sí convierten. Contenido, redes y ads alineados bajo una sola estrategia.",
        "Trabajamos sobre embudos de venta diseñados para atraer tráfico cualificado, nutrir leads y convertirlos en clientes recurrentes — con cada peso medido hacia el ROI.",
      ],
      includes: [
        { title: "Creación de contenido", body: "Grabación y edición de reels, TikTok y video vertical optimizado para el algoritmo." },
        { title: "Community management", body: "Gestión de tus redes, calendario editorial y una comunidad activa." },
        { title: "Meta Ads", body: "Gestión profesional de publicidad en redes con segmentación avanzada." },
        { title: "Google Ads", body: "Campañas enfocadas en la intención de búsqueda." },
        { title: "Embudos de venta", body: "Mapeo del viaje del cliente (awareness, consideración, conversión) con automatización." },
        { title: "Optimización constante", body: "Monitoreo diario y pruebas A/B para mejorar el rendimiento." },
      ],
      benefits: [
        "Contenido, redes y ads bajo una sola estrategia",
        "Enfoque en ROI real: leads, ventas y CPA",
        "Equipo multidisciplinario",
        "Reportes claros y transparentes",
      ],
      cta: "¿Quieres escalar tu negocio y dejar de adivinar qué funciona en publicidad?",
    },
  },
  {
    num: "05",
    slug: "apps-moviles",
    title: "Apps móviles",
    tagline: "Pon tu negocio en el bolsillo de tus clientes.",
    card: "Aplicaciones móviles nativas y multiplataforma para empresas y emprendedores. Experiencias intuitivas, veloces y escalables para iOS y Android.",
    tags: ["iOS", "Android", "Multiplataforma"],
    image: "/images/apps-cover.webp",
    accent: "var(--upz-lime)",
    detail: {
      headline: "Desarrollo de apps móviles",
      intro: [
        "Transformamos conceptos complejos en aplicaciones intuitivas, veloces y robustas para empresas y emprendedores.",
        "Desde apps nativas de máximo rendimiento hasta desarrollo multiplataforma para mayor agilidad comercial.",
      ],
      includes: [
        { title: "Desarrollo nativo (iOS & Android)", body: "Swift y Kotlin con rendimiento máximo y acceso total al hardware." },
        { title: "Desarrollo multiplataforma", body: "React Native o Flutter: una sola base de código para ambos sistemas." },
        { title: "Diseño UX/UI mobile-first", body: "Interfaces pensadas antes de codificar, con gestos y flujos intuitivos." },
        { title: "Mantenimiento y backend", body: "Infraestructura en la nube (APIs, bases de datos) con seguridad al día." },
      ],
      benefits: [
        "Código limpio y arquitectura sólida",
        "Principios de psicología del usuario para retención",
        "Asesoramiento en monetización y lanzamiento",
        "Escalable para crecer con tu negocio",
      ],
      cta: "¿Tienes una idea para una app? Vamos a construirla correctamente.",
    },
  },
  {
    num: "06",
    slug: "automatizacion-ia",
    title: "Automatización con IA",
    tagline: "Tu negocio funcionando solo, 24/7.",
    card: "Conectamos tus herramientas y automatizamos procesos con IA (n8n, Make, chatbots). Menos tareas manuales y más tiempo para crecer — sin perder el control ni tu identidad.",
    tags: ["n8n", "Make", "Chatbots IA"],
    image: "/images/automatizacion-ia-cover.webp",
    accent: "var(--upz-tangerine)",
    badge: "Nuevo",
    detail: {
      headline: "Automatización con IA",
      intro: [
        "La IA no reemplaza tu marca: hace que tu negocio funcione mejor. Conectamos tus herramientas y diseñamos automatizaciones que eliminan tareas repetitivas, responden a tus clientes y mueven la información sola.",
        "Lo integramos como una capa estratégica sobre lo que ya tienes — con criterio, sin convertirte en una empresa fría de software.",
      ],
      includes: [
        { title: "Chatbots e IA conversacional", body: "Asistentes que responden a tus clientes 24/7 con el tono de tu marca, califican leads y agendan reuniones." },
        { title: "Automatización de flujos (n8n / Make)", body: "Conectamos formularios, CRM, email, WhatsApp, Sheets y más para que la información viaje sola." },
        { title: "Captación y seguimiento", body: "Leads que entran, se clasifican y reciben seguimiento automático sin intervención manual." },
        { title: "Integraciones a medida", body: "Conexión entre tus plataformas (web, tienda, agenda, pagos) mediante APIs e integraciones inteligentes." },
        { title: "Reportes automáticos", body: "Métricas y resúmenes que llegan solos a tu correo o panel, listos para decidir." },
      ],
      benefits: [
        "Menos tareas manuales, más foco en crecer",
        "Atención al cliente 24/7 sin perder tu tono",
        "Procesos más rápidos y con menos errores",
        "Escalable: empieza simple y crece por módulos",
      ],
      cta: "¿Listo para que tu negocio trabaje aunque tú no estés?",
    },
  },
];

export function getService(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}
