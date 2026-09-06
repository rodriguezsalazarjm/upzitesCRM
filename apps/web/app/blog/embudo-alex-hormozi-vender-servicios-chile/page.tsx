import Link from "next/link";
import type { Metadata } from "next";
import { TopNav, Footer } from "@/components/Sections";
import { getPost, SITE_URL } from "@/lib/blog";
import "../blog.css";

const post = getPost("embudo-alex-hormozi-vender-servicios-chile")!;
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
    q: "¿Qué es el embudo de Alex Hormozi en simple?",
    a: "Es un sistema para vender servicios donde primero entregas valor con contenido, captas al interesado con una oferta muy clara y de bajo riesgo, y haces seguimiento ordenado hasta el cierre. Su fuerza está en reducir el riesgo percibido y clarificar la oferta, no en una técnica mágica.",
  },
  {
    q: "¿Funciona el embudo de Hormozi en Chile?",
    a: "La lógica sí: oferta clara, captura de leads, seguimiento y prueba social. Lo que no se traslada bien es el tono. El estilo agresivo y las promesas exageradas restan credibilidad en el mercado chileno y pueden verse como contenido genérico. Conviene adaptarlo a un tono más directo y honesto.",
  },
  {
    q: "¿Necesito invertir miles de dólares al mes en contenido como Hormozi?",
    a: "No. Hormozi y Leila han mencionado operaciones de cientos de piezas mensuales con presupuestos altos (referencias de ~160 piezas/mes y ~US$70.000 mensuales). Eso es escala de una empresa grande, no un modelo de presupuesto para una pyme. Úsalo como referencia de ambición, no como meta inicial.",
  },
  {
    q: "¿Qué errores se cometen al copiar su embudo?",
    a: "Copiar titulares de resultados que no son tuyos, prometer cifras irreales, saturar con ofertas y descuidar el seguimiento. También usar un tono que en Chile suena a venta agresiva. El embudo falla cuando hay promesa fuerte pero la oferta y el cumplimiento no la respaldan.",
  },
  {
    q: "¿Por dónde empiezo si vendo servicios?",
    a: "Por una oferta clara y una landing con un solo objetivo, formulario con preguntas filtro y WhatsApp o agenda. Luego un CRM para seguimiento. No necesitas todo el sistema el primer día: necesitas captar bien y no perder leads.",
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
            <Link href="/">Inicio</Link> / <Link href="/blog">Noticias</Link> / Análisis
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
            <img src={post.cover} alt="Embudo de ventas para servicios adaptado a Chile" />
          </figure>
          <p className="blog-hero-cap">Un buen embudo no es agresivo: es claro, honesto y ordenado.</p>

          <div className="blog-body">
            <p className="blog-lede">
              El embudo de Hormozi funciona porque reduce el riesgo percibido, hace la oferta muy clara
              y conecta contenido con captura de leads. Pero copiarlo literal en Chile puede sonar
              agresivo, poco creíble o caro para una pyme. Aquí lo desarmamos y lo adaptamos.
            </p>

            <p>
              Aclaración honesta: no vas a leer “el embudo que llevó mis ventas de $200 a $100.000”.
              Ese tipo de titular, cuando no es una prueba real propia, mata credibilidad y se ve como
              contenido genérico de IA. Lo que sí hacemos es analizar el método con postura y mostrar
              cómo aplicarlo de verdad para vender servicios en Chile.
            </p>

            <h2>Por qué el embudo de Hormozi funciona (la parte que sí sirve)</h2>
            <p>
              Más allá del personaje, la estructura es sólida porque ataca las tres razones por las que
              un servicio no se vende: la oferta no se entiende, el riesgo percibido es alto y no hay
              seguimiento. El embudo ordena eso en una secuencia repetible.
            </p>
            <ul className="blog-list">
              <li>Contenido corto con una idea útil que demuestra criterio.</li>
              <li>CTA a un recurso o diagnóstico (no “cómprame ya”).</li>
              <li>Landing page con un solo objetivo claro.</li>
              <li>Formulario con preguntas filtro para calificar.</li>
              <li>WhatsApp o agenda para hablar con los que califican.</li>
              <li>CRM para seguimiento, sin perder ningún lead.</li>
              <li>Oferta clara, con casos, prueba social y garantía cuando aplica.</li>
            </ul>

            <h2>Qué NO trasladar literal a Chile</h2>
            <p>
              El tono. El estilo de promesa fuerte y urgencia extrema rinde distinto en un mercado más
              escéptico. Para una pyme chilena, el exceso de hype baja la confianza. La adaptación es
              mantener la claridad de la oferta y el orden del seguimiento, pero con un lenguaje
              directo, honesto y con pruebas reales.
            </p>

            <h2>La plantilla, paso a paso (versión adaptada)</h2>
            <div className="blog-table-wrap">
              <table className="blog-table">
                <thead>
                  <tr><th>Etapa</th><th>Qué hacer</th><th>Herramienta</th></tr>
                </thead>
                <tbody>
                  <tr><td>Atraer</td><td>Contenido útil con una idea por pieza</td><td>Reels / TikTok / posts</td></tr>
                  <tr><td>Capturar</td><td>Oferta clara + landing con un objetivo</td><td>Landing page</td></tr>
                  <tr><td>Calificar</td><td>Formulario con preguntas filtro</td><td>Formulario + WhatsApp</td></tr>
                  <tr><td>Conversar</td><td>Diagnóstico o llamada con los que califican</td><td>Agenda / WhatsApp</td></tr>
                  <tr><td>Seguir</td><td>Seguimiento ordenado hasta el cierre</td><td>CRM</td></tr>
                  <tr><td>Cerrar</td><td>Oferta con casos, prueba social y garantía</td><td>Propuesta clara</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              En la práctica, esto se monta con una <Link href="/soluciones/landing-express">landing</Link>,
              captación por WhatsApp y un <Link href="/soluciones/crm">CRM</Link> que ordene el
              seguimiento. Sin eso, el contenido atrae pero las ventas se filtran.
            </p>

            <h2>La trampa del presupuesto: la escala de Hormozi no es tu modelo</h2>
            <p>
              Hormozi y Leila han señalado una operación de contenido de alrededor de 160 piezas
              mensuales, con una inversión aproximada de US$70.000 al mes. Úsalo como referencia de
              escala, no como modelo presupuestario para una pyme chilena. Tu versión inicial puede ser
              3–5 piezas por semana bien hechas + un embudo simple que no pierda leads. La consistencia
              vence al volumen cuando recién empiezas.
            </p>

            <h2>Errores comunes al implementarlo</h2>
            <ul className="blog-list">
              <li>Prometer cifras irreales o ajenas.</li>
              <li>Tener gran contenido pero una landing confusa con varios objetivos.</li>
              <li>No calificar: hablar con todos y quemar tiempo en leads malos.</li>
              <li>No hacer seguimiento (aquí se cae la mayoría de las ventas).</li>
              <li>Oferta poco clara o sin prueba social que la respalde.</li>
            </ul>

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
              <p>El embudo de Hormozi sirve por su claridad y orden, no por su agresividad. En Chile gana la versión honesta: oferta clara, leads calificados y seguimiento que no falla.</p>
            </div>

            <div className="blog-endcta">
              <h3>¿Quieres este embudo funcionando para tu servicio?</h3>
              <p>En UPZITES montamos la landing, la captación por WhatsApp y el CRM para que dejes de perder leads y cierres más.</p>
              <Link className="btn-wa" href="/contacto?utm_source=blog&utm_medium=articulo-hormozi">
                Quiero armar mi embudo <span className="arr">&#8599;</span>
              </Link>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
