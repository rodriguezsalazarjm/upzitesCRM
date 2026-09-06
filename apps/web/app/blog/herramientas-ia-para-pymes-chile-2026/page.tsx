import Link from "next/link";
import type { Metadata } from "next";
import { TopNav, Footer } from "@/components/Sections";
import { getPost, SITE_URL } from "@/lib/blog";
import "../blog.css";

const post = getPost("herramientas-ia-para-pymes-chile-2026")!;
const url = `${SITE_URL}/blog/${post.slug}`;

export const metadata: Metadata = {
  title: post.metaTitle,
  description: post.metaDescription,
  keywords: post.tags,
  alternates: { canonical: url },
  openGraph: {
    title: post.metaTitle,
    description: post.metaDescription,
    url,
    type: "article",
    publishedTime: post.date,
    modifiedTime: post.date,
    authors: [post.author.name],
    images: [{ url: `${SITE_URL}${post.cover}`, width: 1200, height: 630, alt: post.title }],
  },
  twitter: {
    card: "summary_large_image",
    title: post.metaTitle,
    description: post.metaDescription,
    images: [`${SITE_URL}${post.cover}`],
  },
};

const FAQ = [
  {
    q: "¿Cuáles son las mejores herramientas de IA para una pyme en Chile?",
    a: "Depende del dolor. Para crear contenido y propuestas: ChatGPT Business y Canva AI. Si trabajas con Gmail y Drive: Gemini para Google Workspace. Para ordenar procesos: Notion AI. Para conectar formularios, correo y CRM: Zapier. Si ya usas HubSpot: Breeze. Y para captar y dar seguimiento comercial a la medida: un CRM con automatización como el de UPZITES.",
  },
  {
    q: "¿Por dónde empiezo a usar IA si nunca la he usado en mi negocio?",
    a: "Por un solo dolor concreto, no por “la IA” en general. Si no sabes qué publicar, parte por ChatGPT + Canva. Si se te pierden consultas, parte por un CRM con automatización. Resuelve un problema real con una o dos herramientas bien usadas antes de sumar más.",
  },
  {
    q: "¿Necesito un agente de IA que responda solo a mis clientes?",
    a: "Todavía no, en la mayoría de los casos. Antes necesitas preguntas frecuentes claras, políticas comerciales definidas y supervisión humana. Un agente autónomo sin esa base responde mal y daña la experiencia. Primero ordena; después automatiza con criterio.",
  },
  {
    q: "¿Cuánto debería invertir una pyme en herramientas de IA?",
    a: "Menos de lo que crees. Es mejor tener dos o tres herramientas conectadas y usadas de verdad que pagar diez suscripciones abandonadas. Empieza con lo que resuelve tu cuello de botella y suma solo cuando una herramienta ya te esté ahorrando tiempo o trayendo ventas.",
  },
  {
    q: "¿La IA reemplaza tener una página web o un CRM?",
    a: "No. La IA acelera tareas, pero no captura ni ordena clientes por sí sola. Necesitas una base (landing/web + CRM) donde la IA trabaje sobre tus datos. Sin esa base, la IA produce texto e ideas, pero las ventas se siguen perdiendo entre WhatsApp, Excel y correos.",
  },
];

function Schema() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: post.title,
        description: post.metaDescription,
        image: `${SITE_URL}${post.cover}`,
        datePublished: post.date,
        dateModified: post.date,
        inLanguage: "es-CL",
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        author: { "@type": "Person", name: post.author.name, jobTitle: post.author.role },
        publisher: {
          "@type": "Organization",
          name: "UPZITES",
          url: SITE_URL,
          logo: { "@type": "ImageObject", url: `${SITE_URL}/images/upzites-logo-full.webp` },
        },
        keywords: post.tags.join(", "),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Noticias", item: `${SITE_URL}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: url },
        ],
      },
      {
        "@type": "Organization",
        name: "UPZITES",
        url: SITE_URL,
        logo: `${SITE_URL}/images/upzites-logo-full.webp`,
        description: "Estudio de diseño estratégico, branding, web y software para emprendedores y pymes en Chile.",
        areaServed: { "@type": "Country", name: "Chile" },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} />;
}

export default function ArticlePage() {
  return (
    <div className="blog-wrap" id="top">
      <Schema />
      <TopNav />
      <main className="blog-article">
        <article className="blog-article-shell">
          <nav className="blog-article-breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Inicio</Link> / <Link href="/blog">Noticias</Link> / Guía
          </nav>

          <h1 className="blog-article-title">{post.title}</h1>
          <p className="blog-article-sub">{post.subtitle}</p>

          <div className="blog-article-byline">
            <span className="au">{post.author.name}</span>
            <span className="dot" />
            <span>{post.author.role}</span>
            <span className="dot" />
            <span>{post.updated}</span>
            <span className="dot" />
            <span>{post.readingTime}</span>
          </div>

          <figure className="blog-hero-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.cover} alt="Inteligencia artificial aplicada a una pyme chilena en 2026" />
          </figure>
          <p className="blog-hero-cap">La IA no reemplaza tu estrategia: ordena y acelera lo que ya tienes claro.</p>

          <div className="blog-body">
            <p className="blog-lede">
              La mayoría de las pymes no necesita “más IA”. Necesita dejar de perder clientes, repetir
              respuestas y trabajar en cinco herramientas desconectadas.
            </p>

            <p>
              Esta no es otra lista de “las mejores IA”. Es una guía honesta de implementación: qué dolor
              resuelve cada herramienta, para quién sirve, qué no hace y cuándo no vale la pena pagarla.
              El tema, además, está alineado con el mercado: Sercotec sigue impulsando capacitación y
              adopción tecnológica para micro y pequeñas empresas con programas como Digitaliza tu Pyme.
            </p>

            <h2>Empieza por tu problema, no por la herramienta</h2>
            <p>Antes de pagar nada, ubica tu dolor en esta tabla y mira por dónde partir (y por dónde no):</p>
            <div className="blog-table-wrap">
              <table className="blog-table">
                <thead>
                  <tr><th>Si tu problema es…</th><th>Parte por…</th><th>No partas por…</th></tr>
                </thead>
                <tbody>
                  <tr><td>No sabes qué publicar</td><td>ChatGPT + Canva</td><td>Un agente autónomo caro</td></tr>
                  <tr><td>Se pierden consultas</td><td>CRM + automatización</td><td>Otra campaña de anuncios</td></tr>
                  <tr><td>Tienes desorden interno</td><td>Notion AI o Workspace</td><td>Una app a medida</td></tr>
                  <tr><td>Copias datos entre plataformas</td><td>Zapier</td><td>Contratar más personal</td></tr>
                  <tr><td>Tu equipo usa Gmail y Drive todo el día</td><td>Gemini Workspace</td><td>Migrar todo de sistema</td></tr>
                  <tr><td>Necesitas vender más ordenadamente</td><td>Landing + CRM + seguimiento</td><td>Una app móvil genérica</td></tr>
                </tbody>
              </table>
            </div>

            <h2>Los dolores reales que vamos a resolver</h2>
            <ul className="blog-list">
              <li>“Pierdo tiempo respondiendo las mismas preguntas.”</li>
              <li>“No sé qué publicar en redes.”</li>
              <li>“Tengo clientes en WhatsApp, Excel y correos distintos.”</li>
              <li>“Las reuniones terminan y nadie recuerda qué hacer.”</li>
              <li>“Tengo formularios, pero nadie les hace seguimiento.”</li>
              <li>“Quiero usar IA, pero no sé por dónde partir.”</li>
            </ul>

            <h2>Las 7 herramientas de IA que sí sirven</h2>
            <div className="blog-table-wrap">
              <table className="blog-table">
                <thead>
                  <tr><th>Herramienta</th><th>Problema real que resuelve</th><th>Para qué pyme sirve</th></tr>
                </thead>
                <tbody>
                  <tr><td>ChatGPT Business</td><td>Ideas, propuestas, análisis de documentos, borradores, procesos internos</td><td>Servicios, agencias, ventas, administración</td></tr>
                  <tr><td>Gemini para Google Workspace</td><td>Correos, Drive, Docs, Sheets, resúmenes y tareas</td><td>Equipos que ya trabajan con Gmail</td></tr>
                  <tr><td>Canva AI</td><td>Diseños, piezas de redes, presentaciones y adaptación visual</td><td>Negocios sin diseñador interno</td></tr>
                  <tr><td>Notion AI</td><td>Ordenar procesos, reuniones, manuales y proyectos</td><td>Equipos pequeños con desorden operativo</td></tr>
                  <tr><td>Zapier</td><td>Conectar formularios, correos, CRM, planillas y alertas</td><td>Negocios que pierden leads o repiten tareas</td></tr>
                  <tr><td>HubSpot Breeze</td><td>Priorizar leads, generar contenido y apoyar ventas dentro del CRM</td><td>Empresas que ya trabajan con CRM</td></tr>
                  <tr><td>UPZITES CRM + automatización a medida</td><td>Capturar, organizar y hacer seguimiento comercial según el negocio</td><td>Empresas que necesitan un sistema propio</td></tr>
                </tbody>
              </table>
            </div>

            <h3>Crear y pensar más rápido: ChatGPT Business, Gemini y Canva AI</h3>
            <p>
              ChatGPT Business ofrece un espacio de trabajo compartido, controles administrativos,
              proyectos y conexiones con herramientas de empresa. Gemini se integra directo en Gmail,
              Docs, Drive, Sheets y Meet, ideal si tu operación ya vive en Google. Canva AI permite
              generar y adaptar piezas visuales sin diseñador interno: el combo perfecto para resolver el
              clásico “no sé qué publicar”.
            </p>

            <figure className="blog-hero-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/blog/ia-content.jpg" alt="IA para crear y adaptar contenido de redes sociales" />
            </figure>

            <h3>Ordenar el caos: Notion AI</h3>
            <p>
              Notion AI suma agentes, notas de reuniones, manuales y búsqueda interna. Resuelve el dolor
              de “las reuniones terminan y nadie recuerda qué hacer” y de tener procesos en la cabeza en
              vez de en un sistema.
            </p>

            <h3>Conectar todo sin trabajo manual: Zapier</h3>
            <p>
              Aquí está el bloque más valioso para una pyme: mover datos entre formularios, correo, CRM,
              planillas y otros sistemas sin hacerlo a mano cada vez. Su plataforma declara más de 9.000
              integraciones, aunque la automatización debe diseñarse según el flujo real de tu negocio,
              no copiando recetas genéricas.
            </p>

            <figure className="blog-hero-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/blog/ia-automation.jpg" alt="Automatizar y ordenar el trabajo de una pyme con IA" />
            </figure>

            <h3>IA sobre tus datos de venta: HubSpot Breeze y un CRM a medida</h3>
            <p>
              HubSpot Breeze tiene sentido solo si ya usas HubSpot como CRM: sus funciones de IA trabajan
              sobre datos, conversaciones y registros internos para apoyar marketing, ventas y atención.
              Si necesitas algo que se ajuste a tu forma de vender, un <Link href="/soluciones/crm">CRM
              con automatización a medida</Link> captura, ordena y da seguimiento según tu negocio,
              conectado a tu web y a WhatsApp.
            </p>

            <h2>3 herramientas que una pyme NO necesita todavía</h2>
            <h3>1 · Un agente autónomo que responda solo a clientes</h3>
            <p>Primero necesitas preguntas frecuentes claras, políticas comerciales y supervisión humana. Sin esa base, automatizar respuestas empeora la experiencia.</p>
            <h3>2 · Una app móvil propia</h3>
            <p>Si el negocio aún vende por mensajes sin un proceso estable, una landing, catálogo o CRM tendrá mejor retorno que una app.</p>
            <h3>3 · Diez suscripciones de IA</h3>
            <p>Mejor dos o tres herramientas conectadas y usadas de verdad que pagar por software que terminas abandonando.</p>

            <h2>Preguntas frecuentes</h2>
            <div className="blog-faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>

            <div className="blog-callout">
              <span>La tesis</span>
              <p>La IA no arregla un negocio desordenado. Resuelve un dolor a la vez, con dos o tres herramientas conectadas, sobre una base que capture y ordene tus ventas.</p>
            </div>

            <div className="blog-endcta">
              <h3>¿No sabes qué herramienta implementar primero?</h3>
              <p>En UPZITES analizamos cómo entra un cliente a tu negocio, dónde se pierden las ventas y qué se puede ordenar con web, CRM, automatización o IA.</p>
              <Link className="btn-wa" href="/contacto?utm_source=blog&utm_medium=articulo-ia">
                Quiero ordenar mi negocio con IA <span className="arr">&#8599;</span>
              </Link>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
