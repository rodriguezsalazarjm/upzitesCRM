export type BrandingCategory = "Empresarial" | "Foodie" | "Marca";

export type BrandingProject = {
  slug: string;
  name: string;
  category: BrandingCategory;
  description: string;
  fuertes: string[];
  beneficios: string[];
  images: string[];
};

export type WebProject = {
  slug: string;
  name: string;
  url: string;
  category: string;
  status?: string;
};

export const BRANDING_CATEGORIES: { key: BrandingCategory; label: string }[] = [
  { key: "Empresarial", label: "Empresariales" },
  { key: "Foodie", label: "Foodie" },
  { key: "Marca", label: "Marcas" },
];

function gallery(slug: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `/images/proyectos/${slug}/${String(i + 1).padStart(2, "0")}.jpg`);
}
function detail(slug: string): string[] {
  return [`/images/proyectos/${slug}.jpg`, ...Array.from({ length: 4 }, (_, i) => `/images/proyectos/${slug}-d${i + 1}.jpg`)];
}

export const BRANDING_PROJECTS: BrandingProject[] = [
  // ---- Empresariales ----
  {
    slug: "gloobitos", name: "Gloobitos", category: "Empresarial",
    description: "Marca tierna y emocional, diseñada para conectar desde el afecto. Un sistema cálido y amigable que humaniza el producto.",
    fuertes: ["Identidad emocional", "Recursos gráficos propios", "Sistema amigable"],
    beneficios: ["Vínculo afectivo con la audiencia", "Marca cálida y memorable"],
    images: gallery("gloobitos", 5),
  },
  {
    slug: "reyes-protec", name: "Reyes Protec", category: "Empresarial",
    description: "Identidad sólida para el sector de protección automotriz, que transmite respaldo y profesionalismo.",
    fuertes: ["Imagen confiable", "Sistema técnico", "Aplicaciones reales"],
    beneficios: ["Percepción de seriedad y respaldo", "Coherencia en cada soporte"],
    images: gallery("reyes-protec", 5),
  },
  {
    slug: "avacos", name: "Avacos", category: "Empresarial",
    description: "Sistema de marca corporativo, claro y consistente, pensado para escalar a múltiples aplicaciones.",
    fuertes: ["Identidad profesional", "Sistema escalable", "Manual de uso"],
    beneficios: ["Imagen ordenada y confiable", "Coherencia en todos los canales"],
    images: gallery("avacos", 5),
  },
  {
    slug: "ironmallas", name: "Iron Mallas", category: "Empresarial",
    description: "Marca industrial sólida para soluciones en mallas y cerramientos, con una imagen robusta y directa.",
    fuertes: ["Imagen robusta", "Sistema técnico", "Aplicaciones comerciales"],
    beneficios: ["Confianza para clientes B2B", "Presencia clara y profesional"],
    images: gallery("ironmallas", 5),
  },
  {
    slug: "profileempresarial", name: "Profile Empresarial", category: "Empresarial",
    description: "Identidad corporativa enfocada en liderazgo, experiencia y resultados, alineada con su sitio web.",
    fuertes: ["Imagen ejecutiva", "Sistema corporativo", "Listo para web"],
    beneficios: ["Autoridad y credibilidad", "Marca alineada a su plataforma digital"],
    images: gallery("profileempresarial", 5),
  },
  {
    slug: "vr-automotriz", name: "V&R Automotriz", category: "Empresarial",
    description: "Identidad profesional que representa libertad y movimiento para una marca del sector automotriz.",
    fuertes: ["Imagen dinámica", "Sistema automotriz", "Aplicaciones reales"],
    beneficios: ["Presencia profesional", "Reconocimiento en su sector"],
    images: detail("vr-automotriz"),
  },
  // ---- Foodie ----
  {
    slug: "valle-smash", name: "Valle Smash", category: "Foodie",
    description: "Identidad retro inspirada en los diners americanos y el pop art, con paleta intensa y tipografía con actitud.",
    fuertes: ["Identidad pop art", "Paleta intensa", "Sistema menú + redes"],
    beneficios: ["Marca memorable y diferenciada", "Aplicaciones listas para local y delivery"],
    images: gallery("valle-smash", 5),
  },
  {
    slug: "dirtypizza", name: "Dirty Pizza", category: "Foodie",
    description: "Identidad callejera y desenfadada para una pizzería con carácter urbano.",
    fuertes: ["Estética street", "Logotipo contundente", "Packaging y redes"],
    beneficios: ["Personalidad reconocible al instante", "Coherencia en cada punto de contacto"],
    images: gallery("dirtypizza", 5),
  },
  {
    slug: "smash-po", name: "Smash Po", category: "Foodie",
    description: "Marca de hamburguesas smash con energía urbana y apetito visual.",
    fuertes: ["Branding apetitoso", "Sistema flexible", "Listo para delivery"],
    beneficios: ["Antojo a primera vista", "Marca que escala a nuevos productos"],
    images: gallery("smash-po", 5),
  },
  {
    slug: "callebrava", name: "Calle Brava", category: "Foodie",
    description: "Identidad gastronómica con sabor callejero y color tropical.",
    fuertes: ["Identidad vibrante", "Aplicaciones de menú", "Tono cercano"],
    beneficios: ["Conexión rápida con el público", "Imagen apetitosa y consistente"],
    images: detail("callebrava"),
  },
  {
    slug: "crema", name: "Crema", category: "Foodie",
    description: "Branding cálido y artesanal para una marca con foco en el producto.",
    fuertes: ["Paleta cálida", "Detalle artesanal", "Sistema editorial"],
    beneficios: ["Percepción premium", "Marca que transmite cercanía"],
    images: detail("crema"),
  },
  {
    slug: "koriramen", name: "Kori Ramen", category: "Foodie",
    description: "Identidad de fusión japonesa moderna para una marca de ramen.",
    fuertes: ["Estética nipona", "Tipografía fuerte", "Sistema carta + redes"],
    beneficios: ["Diferenciación en su categoría", "Imagen apetitosa y ordenada"],
    images: detail("koriramen"),
  },
  {
    slug: "lidonastro", name: "Lido Nastro", category: "Foodie",
    description: "Sistema de marca con carácter editorial y elegancia contenida.",
    fuertes: ["Dirección editorial", "Tipografía protagonista", "Paleta sobria"],
    beneficios: ["Imagen sofisticada", "Coherencia en cada pieza"],
    images: detail("lidonastro"),
  },
  {
    slug: "norisoi", name: "Norisoi", category: "Foodie",
    description: "Identidad limpia y moderna para una marca de sushi.",
    fuertes: ["Diseño limpio", "Sistema minimal", "Aplicaciones de carta"],
    beneficios: ["Lectura clara del menú", "Percepción fresca y profesional"],
    images: detail("norisoi"),
  },
  // ---- Marcas ----
  {
    slug: "urbanwild", name: "Urban Wild", category: "Marca",
    description: "Marca urbana con espíritu salvaje y energía tropical underground, pensada para producto y comunidad.",
    fuertes: ["Identidad streetwear", "Sistema gráfico fuerte", "Aplicaciones de producto"],
    beneficios: ["Marca con actitud y comunidad", "Diferenciación cultural"],
    images: gallery("urbanwild", 5),
  },
];

export const WEB_PROJECTS: WebProject[] = [
  { slug: "profileempresarial", name: "Profile Empresarial", url: "https://www.profileempresarial.com", category: "Web corporativa" },
  { slug: "grafiks", name: "Grafiks", url: "https://www.grafiks.cl", category: "Estudio creativo" },
  { slug: "ironmallas", name: "Iron Mallas", url: "https://www.ironmallas.cl", category: "Web industrial" },
  { slug: "kyrontecnology", name: "Kyron Technology", url: "https://www.kyrontecnology.com", category: "Web tecnología", status: "En construcción" },
];
