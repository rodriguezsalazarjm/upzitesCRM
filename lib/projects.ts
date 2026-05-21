export type BrandingProject = {
  slug: string;
  name: string;
  category: "Empresarial" | "Foodie" | "Marca";
  blurb: string;
  images: string[];
};

export type WebProject = {
  slug: string;
  name: string;
  url: string;
  category: string;
  status?: string;
};

function gallery(slug: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `/images/proyectos/${slug}/${String(i + 1).padStart(2, "0")}.jpg`);
}
function single(slug: string): string[] {
  return [`/images/proyectos/${slug}.jpg`];
}

export const BRANDING_PROJECTS: BrandingProject[] = [
  { slug: "valle-smash", name: "Valle Smash", category: "Foodie", blurb: "Identidad retro inspirada en los diners americanos y el pop art.", images: gallery("valle-smash", 8) },
  { slug: "dirtypizza", name: "Dirty Pizza", category: "Foodie", blurb: "Identidad callejera y desenfadada para una pizzería con actitud.", images: gallery("dirtypizza", 8) },
  { slug: "smash-po", name: "Smash Po", category: "Foodie", blurb: "Marca de hamburguesas smash con energía urbana.", images: gallery("smash-po", 8) },
  { slug: "gloobitos", name: "Gloobitos", category: "Empresarial", blurb: "Marca tierna y emocional, diseñada para el afecto.", images: gallery("gloobitos", 5) },
  { slug: "reyes-protec", name: "Reyes Protec", category: "Empresarial", blurb: "Identidad para el sector de protección automotriz.", images: gallery("reyes-protec", 8) },
  { slug: "avacos", name: "Avacos", category: "Empresarial", blurb: "Sistema de marca profesional, claro y consistente.", images: gallery("avacos", 6) },
  { slug: "ironmallas", name: "Iron Mallas", category: "Empresarial", blurb: "Marca industrial sólida para soluciones en mallas y cerramientos.", images: gallery("ironmallas", 7) },
  { slug: "profileempresarial", name: "Profile Empresarial", category: "Empresarial", blurb: "Identidad corporativa enfocada en liderazgo y resultados.", images: gallery("profileempresarial", 7) },
  { slug: "urbanwild", name: "Urban Wild", category: "Marca", blurb: "Marca urbana con espíritu salvaje y energía tropical.", images: gallery("urbanwild", 8) },
  { slug: "vr-automotriz", name: "V&R Automotriz", category: "Empresarial", blurb: "Identidad profesional que representa libertad.", images: single("vr-automotriz") },
  { slug: "callebrava", name: "Calle Brava", category: "Foodie", blurb: "Identidad gastronómica con sabor callejero.", images: single("callebrava") },
  { slug: "crema", name: "Crema", category: "Foodie", blurb: "Branding cálido para una marca artesanal.", images: single("crema") },
  { slug: "koriramen", name: "Kori Ramen", category: "Foodie", blurb: "Identidad de fusión japonesa moderna para una marca de ramen.", images: single("koriramen") },
  { slug: "lidonastro", name: "Lido Nastro", category: "Foodie", blurb: "Sistema de marca con carácter editorial.", images: single("lidonastro") },
  { slug: "norisoi", name: "Norisoi", category: "Foodie", blurb: "Identidad limpia y moderna para una marca de sushi.", images: single("norisoi") },
];

export const WEB_PROJECTS: WebProject[] = [
  { slug: "profileempresarial", name: "Profile Empresarial", url: "https://www.profileempresarial.com", category: "Web corporativa" },
  { slug: "grafiks", name: "Grafiks", url: "https://www.grafiks.cl", category: "Estudio creativo" },
  { slug: "ironmallas", name: "Iron Mallas", url: "https://www.ironmallas.cl", category: "Web industrial" },
  { slug: "kyrontecnology", name: "Kyron Technology", url: "https://www.kyrontecnology.com", category: "Web tecnología", status: "En construcción" },
];
