import type { MetadataRoute } from "next";
import { BLOG_POSTS, SITE_URL } from "@/lib/blog";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    "",
    "/nosotros",
    "/servicios",
    "/proyectos",
    "/contacto",
    "/blog",
    "/soluciones/landing-express",
    "/soluciones/catalogo-web",
    "/soluciones/carta-qr",
    "/soluciones/crm",
    "/soluciones/invitaciones",
    "/soluciones/reels",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7,
  }));

  const posts = BLOG_POSTS.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [...routes, ...posts];
}
