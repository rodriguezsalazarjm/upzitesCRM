import Link from "next/link";
import type { Metadata } from "next";
import { TopNav, Footer } from "@/components/Sections";
import { BlogDecisionQuiz } from "@/components/BlogDecisionQuiz";
import { getPost, SITE_URL } from "@/lib/blog";
import "../blog.css";

const post = getPost("pagina-web-tienda-online-o-app-emprendimiento-chile")!;
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
    q: "¿Cuánto cuesta una página web en Chile?",
    a: "Depende del objetivo. Una landing comercial parte desde $89.990–$149.990; un catálogo web desde $249.990; una tienda online se cotiza según catálogo e integraciones de pago. Lo importante no es el precio aislado, sino qué te hace vender y ordenar tus consultas.",
  },
  {
    q: "¿Qué es mejor: Instagram o página web?",
    a: "No compiten: se complementan. Instagram genera alcance, pero no es tuyo y no aparece en Google. Una web es tu base propia: te encuentran, ordena tus ventas y convierte el tráfico de redes en clientes. Lo ideal es usar redes para atraer y la web para convertir.",
  },
  {
    q: "¿Necesito una tienda online si vendo por WhatsApp?",
    a: "No siempre. Si tienes pocos productos y el cierre por WhatsApp funciona, un catálogo web con pedido por WhatsApp puede ser suficiente. La tienda online se justifica cuando necesitas cobrar en línea, manejar stock, despacho y analítica de ventas.",
  },
  {
    q: "¿Cuándo conviene crear una app para mi negocio?",
    a: "Cuando hay usuarios recurrentes, procesos repetitivos (reservas, pedidos, fichas) que hoy haces por WhatsApp, Excel o papel, y necesitas roles, notificaciones y trazabilidad. Si recién partes y no tienes ventas ordenadas, una app suele ser una mala primera inversión.",
  },
  {
    q: "¿Una landing page realmente ayuda a vender?",
    a: "Sí, cuando está diseñada para convertir: un mensaje claro, prueba social, y un solo objetivo (WhatsApp, formulario o agenda). Una landing enfocada suele rendir más que un sitio grande y disperso para captar clientes.",
  },
  {
    q: "¿Qué diferencia hay entre una web, un ecommerce y un CRM?",
    a: "La web es tu vitrina y captación; el ecommerce agrega carrito, pagos y gestión de productos para vender en línea; el CRM ordena lo que pasa después: leads, seguimiento y automatización de ventas (por ejemplo, por WhatsApp). Resuelven etapas distintas del mismo embudo.",
  },
  {
    q: "¿Puedo empezar con una landing y luego crecer?",
    a: "Sí, es lo recomendable. Empiezas con branding + landing para validar y captar, y luego escalas a web comercial, tienda online o CRM según tus ventas. Construir por etapas evita sobreinvertir antes de tiempo.",
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
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
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
            <img src={post.cover} alt="Emprendedor decidiendo entre página web, tienda online o app en Chile" />
          </figure>
          <p className="blog-hero-cap">Decidir bien la primera inversión digital evita gastar de más y vender de menos.</p>

          <div className="blog-body">
            <p className="blog-lede">
              Tener Instagram no significa tener un negocio digital. Si tus ventas dependen de
              responder mensajes, enviar precios manualmente y no perder consultas, probablemente
              no necesitas “más seguidores”: necesitas una base digital que ordene y convierta.
            </p>

            <p>
              En Chile muchas pymes ya están en redes sociales, pero una parte menor tiene un canal
              de ventas digital propio. Esa brecha es justo donde más se pierde dinero: dependes de
              un algoritmo que no controlas y de responder a mano cada consulta. La pregunta correcta
              no es “¿qué está de moda?”, sino <strong>“¿qué necesito para digitalizar mi negocio y
              cuánto me costará?”</strong>. Esta guía responde eso, sin venderte humo.
            </p>

            <h2>El error más caro: invertir en una app antes de tener ventas ordenadas</h2>
            <p>
              La app casi nunca es el primer paso. Es la inversión más cara, la más lenta de construir
              y la que más fácilmente se abandona si el negocio todavía no tiene un flujo de ventas
              ordenado. Antes de pensar en una app, conviene mirar honestamente en qué situación está tu
              negocio:
            </p>

            <div className="blog-table-wrap">
              <table className="blog-table">
                <thead>
                  <tr><th>Situación del negocio</th><th>Lo que realmente necesita</th></tr>
                </thead>
                <tbody>
                  <tr><td>Recién empieza y no se ve profesional</td><td>Branding básico + landing</td></tr>
                  <tr><td>Vende servicios por WhatsApp</td><td>Landing con formulario, WhatsApp y agenda</td></tr>
                  <tr><td>Vende productos</td><td>Catálogo web o tienda online</td></tr>
                  <tr><td>Recibe muchas consultas y se pierden</td><td>CRM + automatización</td></tr>
                  <tr><td>Operación repetitiva, clientes frecuentes y procesos propios</td><td>App o software a medida</td></tr>
                </tbody>
              </table>
            </div>

            <h2>Qué necesita tu negocio según su etapa</h2>
            <p>No todos los negocios necesitan lo mismo al mismo tiempo. Esta es la secuencia que recomendamos:</p>
            <h3>Etapa 1 · Validar idea</h3>
            <p>Branding Express + landing + WhatsApp. Verte profesional y captar bien desde el primer mensaje.</p>
            <h3>Etapa 2 · Vender de forma constante</h3>
            <p>Página web comercial o catálogo web. Que te encuentren en Google y entiendan qué vendes.</p>
            <h3>Etapa 3 · Cobrar y escalar ventas</h3>
            <p>Tienda online con pagos, despacho y analítica. Recién aquí tiene sentido el e-commerce completo.</p>
            <h3>Etapa 4 · Ordenar clientes y seguimiento</h3>
            <p>CRM conectado a formularios, campañas y WhatsApp. Dejas de perder leads por falta de seguimiento.</p>
            <h3>Etapa 5 · Digitalizar una operación específica</h3>
            <p>App web o software a medida, cuando ya hay un proceso claro y repetitivo que automatizar.</p>

            <figure className="blog-hero-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/apps-cover.webp" alt="Pantalla de app y software a medida UPZITES" />
            </figure>

            <h2>Cuánto cuesta cada alternativa en Chile</h2>
            <p>
              Estos son rangos referenciales propios de UPZITES, no precios inventados de mercado. Sirven
              para que sepas qué esperar antes de pedir una cotización a la medida de tu proyecto.
            </p>

            <div className="blog-table-wrap">
              <table className="blog-table">
                <thead>
                  <tr><th>Solución</th><th>Para quién sirve</th><th>Inversión referencial</th></tr>
                </thead>
                <tbody>
                  <tr><td>Branding Express</td><td>Emprendimiento que parte</td><td>Desde $89.990</td></tr>
                  <tr><td>Landing comercial</td><td>Servicios y captación por WhatsApp</td><td>$89.990–$149.990</td></tr>
                  <tr><td>Catálogo Web Express</td><td>Productos con pedido por WhatsApp</td><td>Desde $249.990</td></tr>
                  <tr><td>Tienda online</td><td>Negocios que necesitan pagos online</td><td>Según catálogo e integraciones</td></tr>
                  <tr><td>CRM comercial</td><td>Empresas que pierden leads</td><td>Implementación + mensualidad</td></tr>
                  <tr><td>App o software</td><td>Operaciones con procesos propios</td><td>Proyecto a medida</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              ¿Vendes servicios y captas por WhatsApp? Mira la <Link href="/soluciones/landing-express">Landing Express</Link>.
              ¿Vendes productos? Empieza por el <Link href="/soluciones/catalogo-web">Catálogo Web</Link>.
              ¿Pierdes leads? El <Link href="/soluciones/crm">CRM comercial</Link> ordena el seguimiento.
            </p>

            <h2>Cuándo una app móvil sí vale la pena</h2>
            <p>Una app tiene sentido cuando existen, de verdad, varias de estas condiciones:</p>
            <ul className="blog-list">
              <li>Usuarios recurrentes que vuelven cada semana o mes.</li>
              <li>Pedidos, reservas o procesos repetitivos.</li>
              <li>Operación que hoy se hace por WhatsApp, Excel o papel.</li>
              <li>Necesidad de roles, notificaciones y trazabilidad.</li>
              <li>Un problema específico del rubro que el software estándar no resuelve.</li>
            </ul>
            <p>Algunos ejemplos reales de soluciones que sí justifican software propio:</p>
            <ul className="blog-list">
              <li><Link href="/soluciones/carta-qr">Carta QR</Link> para restaurantes.</li>
              <li><Link href="/soluciones/crm">CRM comercial</Link> conectado a la web.</li>
              <li>Control documental de facturas y órdenes de compra.</li>
              <li>Sistema de ensayos para laboratorios.</li>
              <li><Link href="/soluciones/invitaciones">Invitaciones con QR</Link> y control de acceso.</li>
            </ul>

            <figure className="blog-figrow">
              <figure className="blog-fig">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/proyectos/dirtypizza/01.webp" alt="Branding de Dirty Pizza por UPZITES" />
                <figcaption>Branding real — Dirty Pizza</figcaption>
              </figure>
              <figure className="blog-fig">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/websites/ironmallas-cover.webp" alt="Sitio web de Iron Mallas por UPZITES" />
                <figcaption>Web comercial real — Iron Mallas</figcaption>
              </figure>
            </figure>

            <h2>Checklist: ¿qué necesita mi emprendimiento hoy?</h2>
            <p>
              Si respondes “sí” a 4 o más de estas preguntas, una landing o web comercial probablemente
              te dará más retorno que seguir invirtiendo solo en redes. Marca y descúbrelo:
            </p>

            <BlogDecisionQuiz />

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
              <p>
                No todos los emprendimientos necesitan una app. Pero todo negocio que quiere crecer
                necesita una base digital que se vea profesional, capture clientes y ordene las ventas.
              </p>
            </div>

            <div className="blog-endcta">
              <h3>¿No sabes por dónde empezar?</h3>
              <p>Cuéntanos cómo vendes hoy y te decimos qué solución priorizar. Sin compromiso.</p>
              <Link className="btn-wa" href="/contacto?utm_source=blog&utm_medium=articulo">
                Quiero saber qué necesita mi negocio <span className="arr">&#8599;</span>
              </Link>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
