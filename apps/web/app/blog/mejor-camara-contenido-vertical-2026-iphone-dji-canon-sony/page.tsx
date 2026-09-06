import Link from "next/link";
import type { Metadata } from "next";
import { TopNav, Footer } from "@/components/Sections";
import { getPost, SITE_URL } from "@/lib/blog";
import "../blog.css";

const post = getPost("mejor-camara-contenido-vertical-2026-iphone-dji-canon-sony")!;
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
    q: "¿Cuál es la mejor cámara para hacer Reels y TikTok en 2026?",
    a: "No hay una sola: depende de cómo grabas. Si te mueves mucho (locales, eventos, calle), la DJI Osmo Pocket 4. Si haces talking-head y quieres verte pro de forma simple, la Canon PowerShot V1. Si quieres producción seria con lentes, la Sony ZV-E10 II. Y si recién partes, tu celular actual con buen audio y luz suele bastar.",
  },
  {
    q: "¿Vale la pena comprar una cámara si tengo un iPhone reciente?",
    a: "Si publicas con poca consistencia o recién empiezas, no. Un iPhone (o Android de gama media-alta) reciente graba muy bien en vertical. Conviene comprar cámara cuando ya publicas seguido y necesitas algo específico que el teléfono no te da: súper estabilización caminando, lentes intercambiables o grabaciones largas sin sobrecalentar.",
  },
  {
    q: "¿Qué es mejor para video: DJI Osmo Pocket 4 o Sony ZV-E10 II?",
    a: "La DJI Osmo Pocket 4 gana en movilidad y estabilización mecánica para grabar caminando; es plug-and-play y vertical nativo. La Sony ZV-E10 II gana en calidad, control y flujo profesional (lentes, APS-C, 4K hasta 60p y 10-bit), pero es más grande y exige más edición. Movilidad vs. producción.",
  },
  {
    q: "¿Qué compro primero: cámara, micrófono o luz?",
    a: "Casi siempre micrófono y luz antes que cámara. El público perdona una imagen promedio, pero abandona un audio malo en segundos. El orden sano: micrófono, luz, trípode o estabilización, cámara y por último un sistema de edición y contenidos.",
  },
  {
    q: "¿La cámara mejora mis ventas?",
    a: "No por sí sola. Una cámara cara no arregla guiones débiles, mala estrategia ni falta de constancia. Mejora la percepción, pero las ventas vienen del mensaje, la oferta y un sistema que convierta la atención (por ejemplo, una landing y seguimiento por WhatsApp).",
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
            <img src={post.cover} alt="Cámaras para crear contenido vertical: iPhone, DJI, Canon y Sony" />
          </figure>
          <p className="blog-hero-cap">La mejor cámara es la que se ajusta a cómo grabas, no la más cara.</p>

          <div className="blog-body">
            <p className="blog-lede">
              No necesitas la cámara más cara para crear contenido que venda. Necesitas la correcta
              para cómo grabas, editas y publicas. Aquí va la comparación directa, sin marketing.
            </p>

            <h2>La respuesta rápida: cuál comprar según tu tipo de contenido</h2>
            <div className="blog-table-wrap">
              <table className="blog-table">
                <thead>
                  <tr><th>Perfil</th><th>Recomendación probable</th></tr>
                </thead>
                <tbody>
                  <tr><td>Emprendedor que comienza y publica rápido</td><td>Tu celular actual + buen audio y luz</td></tr>
                  <tr><td>Graba caminando, locales, eventos o entrevistas</td><td>DJI Osmo Pocket 4</td></tr>
                  <tr><td>Quiere calidad pro, formato compacto y simple</td><td>Canon PowerShot V1</td></tr>
                  <tr><td>Quiere crecer en producción audiovisual y usar lentes</td><td>Sony ZV-E10 II</td></tr>
                </tbody>
              </table>
            </div>

            <h2>Antes de comprar una cámara: el error que hace perder plata a la mayoría</h2>
            <p>
              Una cámara no arregla guiones débiles, mala luz, audios pobres ni contenido sin
              estrategia. Antes de gastar $1.000.000, revisa si realmente estás publicando con
              consistencia. La mayoría no tiene un problema de cámara: tiene un problema de hábito,
              mensaje y oferta.
            </p>
            <p>
              Si llevas meses sin publicar seguido, comprar un equipo mejor no cambiará tus números.
              Primero crea el hábito con lo que tienes; después, sube de equipo cuando el cuello de
              botella sea de verdad la imagen.
            </p>

            <h2>DJI Osmo Pocket 4: la mejor para videos en movimiento</h2>
            <p>
              Pensada para video vertical nativo: sensor de 1 pulgada, pantalla rotatoria,
              estabilización mecánica de tres ejes y grabación hasta 4K/120 fps. Es la opción para
              negocios que graban instalaciones, restaurantes, obras, propiedades, eventos y
              entrevistas caminando. Plug-and-play: enciendes, grabas estable y publicas.
            </p>

            <h2>Canon PowerShot V1: la mejor compacta para creadores que quieren verse pro</h2>
            <p>
              Apunta a creadores que quieren una cámara compacta para video: formato vertical,
              estabilización, autoenfoque y ventilación activa para grabaciones largas. Ideal para
              talking-head, educación, tutoriales, podcasts visuales, reviews y contenido de marca
              personal donde quieres una imagen más pulida sin complicarte.
            </p>

            <h2>Sony ZV-E10 II: la mejor si quieres construir una producción audiovisual seria</h2>
            <p>
              Conviene para quien necesita lentes intercambiables, sensor APS-C, 4K hasta 60p, 10-bit
              y un flujo de edición más profesional. Es la opción para agencias, videos comerciales,
              ads y contenido con look cinematográfico. En UPZITES es el tipo de equipo que tiene
              sentido cuando hay producción recurrente y clientes que la pagan.
            </p>

            <h2>¿Y el iPhone o Android? Cuándo NO necesitas comprar cámara</h2>
            <p>
              Si tu teléfono es relativamente reciente, probablemente ya graba mejor de lo que tu
              contenido necesita hoy. No compres cámara si: publicas con poca frecuencia, todavía no
              tienes claro tu mensaje, o tu cuello de botella es el guion y la edición, no la imagen.
              Mejora primero <strong>audio, luz y constancia</strong>; el salto de calidad será mayor
              que el de cambiar de cámara.
            </p>

            <h2>Qué comprar primero: cámara, micrófono, luz o editor</h2>
            <p>El orden que más retorno da, de mayor a menor impacto por peso:</p>
            <ul className="blog-list">
              <li>Micrófono — el audio malo es lo primero que hace abandonar un video.</li>
              <li>Luz — una buena luz mejora cualquier cámara, incluso el celular.</li>
              <li>Trípode o estabilización — estabilidad y encuadres consistentes.</li>
              <li>Cámara — recién aquí, cuando lo anterior ya está resuelto.</li>
              <li>Edición y sistema de contenidos — para publicar seguido y con estrategia.</li>
            </ul>

            <h2>La configuración recomendada según presupuesto en Chile</h2>
            <p>
              Rangos referenciales (revísalos: los valores de equipos cambian; actualizamos cada 60–90
              días). No son precios fijos permanentes.
            </p>
            <div className="blog-table-wrap">
              <table className="blog-table">
                <thead>
                  <tr><th>Presupuesto</th><th>Setup recomendado</th><th>Para quién</th></tr>
                </thead>
                <tbody>
                  <tr><td>Menos de $300.000</td><td>Celular actual + micrófono + aro/panel de luz + trípode</td><td>Validar y crear el hábito</td></tr>
                  <tr><td>$500.000–$1.000.000</td><td>DJI Osmo Pocket 4 o Canon PowerShot V1 + audio + luz</td><td>Creadores y negocios constantes</td></tr>
                  <tr><td>Más de $1.000.000</td><td>Sony ZV-E10 II + lente luminoso + audio y luz pro</td><td>Producción seria / agencias</td></tr>
                </tbody>
              </table>
            </div>

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
              <span>En resumen</span>
              <p>La mejor cámara es la que se ajusta a cómo grabas y publicas. El equipo importa; la estrategia, el guion y la constancia importan más.</p>
            </div>

            <div className="blog-endcta">
              <h3>¿Tienes cámara, pero no sabes qué grabar para vender?</h3>
              <p>En UPZITES diseñamos estrategia de contenido, guiones, identidad visual y landing pages para convertir atención en clientes.</p>
              <Link className="btn-wa" href="/contacto?utm_source=blog&utm_medium=articulo-camara">
                Quiero una estrategia de contenido <span className="arr">&#8599;</span>
              </Link>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
