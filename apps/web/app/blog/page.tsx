import Link from "next/link";
import type { Metadata } from "next";
import { TopNav, Footer } from "@/components/Sections";
import { BLOG_POSTS, SITE_URL } from "@/lib/blog";
import "./blog.css";

export const metadata: Metadata = {
  title: "Noticias UPZITES — Blog para emprendedores en Chile",
  description:
    "Guías prácticas sobre branding, páginas web, tiendas online, CRM y apps para emprendedores y pymes en Chile. Decide qué necesita tu negocio para vender más.",
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: "Noticias UPZITES — Blog para emprendedores en Chile",
    description:
      "Guías prácticas para digitalizar tu emprendimiento: branding, web, e-commerce, CRM y apps.",
    url: `${SITE_URL}/blog`,
    type: "website",
  },
};

export default function BlogIndexPage() {
  return (
    <div className="blog-wrap" id="top">
      <TopNav />
      <main className="blog-index">
        <div className="blog-shell">
          <header className="blog-index-head">
            <span className="blog-eyebrow">Noticias · UPZITES</span>
            <h1 className="blog-h1">
              Estrategia digital,<br />sin humo.
            </h1>
            <p className="blog-lead">
              Guías reales para decidir qué necesita tu negocio: branding, página web,
              tienda online, CRM o app. Con costos, criterios y ejemplos de Chile.
            </p>
          </header>

          <div className="blog-grid">
            {BLOG_POSTS.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="blog-card">
                <div className="blog-card-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.cover} alt={p.title} loading="lazy" />
                </div>
                <div className="blog-card-body">
                  <span className="blog-card-cat">{p.category}</span>
                  <h2 className="blog-card-title">{p.title}</h2>
                  <p className="blog-card-excerpt">{p.excerpt}</p>
                  <div className="blog-card-meta">
                    <span>{p.updated}</span>
                    <span>{p.readingTime}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
