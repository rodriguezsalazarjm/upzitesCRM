import type { MetadataRoute } from "next";

/**
 * robots.txt generado por Next. Bloquea crawlers de IA y scrapers conocidos
 * (entrenan modelos o copian contenido con tus textos/imágenes). Se mantiene el
 * acceso para buscadores reales (Google, Bing) vía la regla "*", para no dañar
 * el SEO. Los bots que respetan robots.txt dejarán de raspar el sitio; no es
 * obligatorio para los maliciosos, pero corta a la mayoría de los automáticos.
 */
// Bots de BÚSQUEDA/CITACIÓN de IA que SÍ dejamos pasar (visibilidad GEO en
// ChatGPT Search, Perplexity, etc.). No entrenan modelos con tu contenido;
// lo descubren para citarte y enlazarte: OAI-SearchBot, PerplexityBot,
// DuckAssistBot. Los de ENTRENAMIENTO siguen bloqueados abajo.
const BLOCKED_BOTS = [
  // IA / LLM scrapers de ENTRENAMIENTO
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "Google-Extended",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "FacebookBot",
  "cohere-ai",
  "CCBot",
  "Diffbot",
  "Omgilibot",
  "YouBot",
  "Bytespider",
  "Amazonbot",
  "ImagesiftBot",
  // Scrapers / SEO crawlers de la competencia
  "SemrushBot",
  "AhrefsBot",
  "MJ12bot",
  "DotBot",
  "DataForSeoBot",
  "Scrapy",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: BLOCKED_BOTS, disallow: "/" },
    ],
  };
}
