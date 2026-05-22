import type { CSSProperties } from "react";
import Link from "next/link";
import { TopNav, Footer, Marquee } from "@/components/Sections";
import { Eyebrow, Reveal, Sticker } from "@/components/Atoms";
import { FeatureCards, type FeatureCard } from "@/components/FeatureCards";
import { ServiceNav } from "@/components/ServiceNav";

export const metadata = {
  title: "E-commerce — UPZITES",
  description:
    "Diseñamos tiendas online modernas, rápidas y escalables con UX/UI, SEO y estructura de conversión para reducir fricción y aumentar ventas.",
};

const ACCENT = "var(--upz-guava)";

const CARDS: FeatureCard[] = [
  { num: "01", title: "Arquitectura de tienda", visible: "Organizamos tu tienda para que comprar sea fácil.", detail: "Definimos categorías, colecciones, navegación, filtros, estructura de productos y recorrido de compra para que el usuario encuentre rápido lo que busca y avance sin fricción.", micro: "Una tienda clara vende más." },
  { num: "02", title: "Diseño UX/UI e-commerce", visible: "Diseñamos una experiencia de compra moderna y fluida.", detail: "Creamos interfaces pensadas para navegar, comparar, elegir y comprar con facilidad. Cuidamos jerarquía visual, botones, cards de producto, menús, búsqueda, mobile y puntos de conversión.", micro: "Menos fricción. Más compras." },
  { num: "03", title: "Fichas de producto", visible: "Convertimos tus productos en argumentos de venta.", detail: "Diseñamos páginas de producto con imágenes, beneficios, detalles, variantes, precios, reviews, preguntas frecuentes, confianza y llamados a la acción claros.", micro: "El producto debe explicarse solo." },
  { num: "04", title: "Carrito y checkout", visible: "Optimizamos el momento más importante de la compra.", detail: "Diseñamos un proceso de carrito y pago claro, rápido y confiable para reducir abandono y ayudar al usuario a completar su pedido sin dudas.", micro: "El checkout no puede estorbar." },
  { num: "05", title: "SEO para e-commerce", visible: "Tu tienda debe poder encontrarse.", detail: "Trabajamos estructura SEO para categorías, productos, URLs, metadata, jerarquía semántica, performance e indexabilidad desde la base de la tienda.", micro: "SEO desde la estructura." },
  { num: "06", title: "Confianza y prueba social", visible: "Diseñamos señales que ayudan a comprar con seguridad.", detail: "Integramos reviews, garantías, métodos de pago, políticas claras, envíos, cambios, devoluciones, badges, testimonios y mensajes de confianza para reducir dudas antes de la compra.", micro: "La confianza también convierte." },
  { num: "07", title: "Responsive y velocidad", visible: "Tu tienda debe funcionar perfecto en móvil.", detail: "Optimizamos la experiencia en desktop, tablet y mobile, cuidando carga, navegación, visualización de productos, botones y flujo de compra.", micro: "Mobile es donde se decide la compra." },
  { num: "08", title: "Sistema escalable", visible: "Diseñamos una tienda lista para crecer.", detail: "Creamos una estructura flexible para sumar productos, colecciones, campañas, promociones, landing pages, bundles, lanzamientos y nuevas categorías sin romper el sistema.", micro: "Tu tienda debe crecer contigo." },
];

const IMPLEMENTACION = [
  { title: "Catálogo de productos", body: "Organización de productos, categorías, colecciones, variantes, precios, imágenes y descripciones." },
  { title: "Métodos de pago", body: "Integración o preparación para pagos con tarjeta, transferencia, PSE, Nequi, Daviplata u otros métodos según el mercado." },
  { title: "Envíos y logística", body: "Estructura visual y funcional para políticas de envío, zonas, tiempos, costos y condiciones." },
  { title: "Automatizaciones básicas", body: "Correos de confirmación, recuperación de carrito, mensajes post-compra, notificaciones o integraciones según la plataforma." },
  { title: "Analítica y medición", body: "Configuración de eventos clave como vistas de producto, añadir al carrito, inicio de checkout y compra." },
];

const PROCESS = [
  { num: "01", title: "Diagnóstico comercial", body: "Analizamos tus productos, audiencia, ticket promedio, modelo de venta, competencia y objetivo del e-commerce." },
  { num: "02", title: "Arquitectura de tienda", body: "Definimos categorías, navegación, estructura SEO, flujo de compra y puntos clave de conversión." },
  { num: "03", title: "Wireframes UX", body: "Organizamos home, categorías, fichas de producto, carrito, checkout y páginas de confianza." },
  { num: "04", title: "Diseño UI", body: "Convertimos la estructura en una tienda moderna, clara, visualmente fuerte y alineada con tu marca." },
  { num: "05", title: "Implementación", body: "Construimos la tienda cuidando responsive, velocidad, catálogo, integraciones, SEO técnico y experiencia de compra." },
  { num: "06", title: "Pruebas y lanzamiento", body: "Revisamos navegación, compra, formularios, pagos, mobile, velocidad y detalles finales antes de salir al mercado." },
];

const PHRASES = [
  "Tu tienda vende incluso cuando no estás conectado",
  "Comprar debe sentirse fácil, rápido y seguro",
  "Menos pasos innecesarios · más intención de compra",
  "Cada producto necesita estructura, no solo fotos bonitas",
  "El diseño también reduce el abandono del carrito",
  "Marca que compite por valor, no por precio",
];

export default function EcommercePage() {
  return (
    <div id="top" style={{ "--svc-accent": ACCENT } as CSSProperties}>
      <TopNav />
      <ServiceNav current="ecommerce" />

      {/* 1. Hero */}
      <section className="brand-hero" data-screen-label="E-commerce · Hero">
        <div className="shell">
          <div className="svc-breadcrumb">
            <Link href="/servicios">Servicios</Link>
            <span>↗</span>
            <span>E-commerce</span>
          </div>
          <div className="brand-hero-grid">
            <div>
              <Eyebrow num="01">Servicio · E-commerce</Eyebrow>
              <h1 className="brand-hero-title">
                Tu tienda online no solo debe verse bien. <span className="mark">Debe vender mejor</span>.
              </h1>
              <p className="brand-hero-sub">
                Diseñamos e-commerce modernos, rápidos y escalables con UX/UI,
                SEO, estructura de conversión y una experiencia de compra pensada
                para reducir fricción y aumentar ventas.
              </p>
              <div className="hero-actions">
                <Link href="/#contact" className="btn btn-dark btn-lg">Quiero vender online <span className="arr">↗</span></Link>
                <a href="#incluye" className="btn btn-ivory btn-lg">Ver qué incluye <span className="arr">↗</span></a>
              </div>
            </div>
            <div className="brand-hero-media">
              <img src="/images/ecommerce-cover.webp" alt="Tienda online de streetwear diseñada para vender, en desktop y móvil" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Problema */}
      <section className="section section--tight" data-screen-label="E-commerce · Problema">
        <div className="shell brand-problem">
          <Reveal>
            <h2 className="brand-promise-h" style={{ marginTop: 0 }}>Una tienda bonita no siempre convierte.</h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="brand-lead">
              Muchos e-commerce tienen buenos productos, pero pierden ventas por
              una experiencia confusa, fichas débiles, navegación lenta, falta de
              confianza, mal checkout o una estructura que no guía al usuario
              hacia la compra.
            </p>
          </Reveal>
          <Reveal delay={140}>
            <h2 className="brand-punch">
              No necesitas solo una <span className="strike">tienda online</span>.<br />
              Necesitas un <span className="mark">sistema digital de venta</span>.
            </h2>
          </Reveal>
        </div>
      </section>

      {/* 3. Promesa */}
      <section className="section section--ivory" data-screen-label="E-commerce · Promesa">
        <div className="shell">
          <div className="brand-promise">
            <Reveal>
              <div className="brand-promise-media">
                <img src="/images/ecommerce-promise.webp" alt="Identidad de marca y tienda online que conectan y convierten" />
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div>
                <Eyebrow num="02">La promesa</Eyebrow>
                <h2 className="brand-promise-h">
                  Diseñamos tiendas online con estrategia, identidad y conversión.
                </h2>
                <p className="brand-body">
                  Construimos plataformas e-commerce donde cada categoría, ficha de
                  producto, botón, filtro, imagen, texto y paso del checkout tiene
                  una intención: facilitar la compra, comunicar valor y convertir
                  visitantes en clientes.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 4. Qué incluye · cards interactivas */}
      <section id="incluye" className="section" data-screen-label="E-commerce · Incluye">
        <div className="shell">
          <Eyebrow num="03">¿Qué incluye el E-commerce?</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Una tienda que vende.<br />
                <span className="b">No solo un catálogo<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
                Pasa el cursor o toca cada tarjeta para ver el detalle de cada
                entregable.
              </p>
            </Reveal>
          </div>
          <FeatureCards cards={CARDS} />
        </div>
      </section>

      {/* 5. Qué puede incluir la implementación */}
      <section className="section section--ivory" data-screen-label="E-commerce · Implementación">
        <div className="shell">
          <Eyebrow num="04">Qué puede incluir la implementación</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Lista para<br />
                <span className="b">operar de verdad<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
                Según tu plataforma y mercado, dejamos tu tienda preparada para
                vender, cobrar, despachar y medir.
              </p>
            </Reveal>
          </div>
          <div className="svc-includes">
            {IMPLEMENTACION.map((it, i) => (
              <Reveal key={it.title} delay={i * 60}>
                <div className="svc-include">
                  <span className="svc-include-num">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{it.title}</h3>
                  <p>{it.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Proceso */}
      <section className="section" data-screen-label="E-commerce · Proceso">
        <div className="shell">
          <Eyebrow num="05">Proceso</Eyebrow>
          <div className="brand-process brand-process--light">
            <div className="brand-process-steps">
              {PROCESS.map((s, i) => (
                <Reveal key={s.num} delay={i * 70}>
                  <div className="brand-step">
                    <span className="brand-step-num">{s.num}</span>
                    <div className="brand-step-body">
                      <h3>{s.title}</h3>
                      <p>{s.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={120}>
              <div className="brand-process-media">
                <img src="/images/ecommerce-process.webp" alt="Tienda online moderna en desktop y móvil con fichas de producto" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <Marquee variant="carbon" items={PHRASES} />

      {/* 7. Venta */}
      <section className="section section--ivory" data-screen-label="E-commerce · Venta">
        <div className="shell brand-sell">
          <Reveal>
            <h2 className="services-h">
              Cada clic debe acercar al usuario<br />
              <span className="b">a la compra<span style={{ color: ACCENT }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-body">
              Un buen e-commerce no depende solo de productos atractivos. Depende
              de claridad, confianza, velocidad, estructura y una experiencia de
              compra diseñada con intención. Creamos tiendas online que se ven
              modernas, funcionan bien y están preparadas para vender.
            </p>
            <Link href="/#contact" className="btn btn-dark btn-lg">Diseñar mi tienda online <span className="arr">↗</span></Link>
          </Reveal>
        </div>
      </section>

      {/* 8. Cierre */}
      <section className="brand-closing" data-screen-label="E-commerce · Cierre">
        <div className="shell">
          <Sticker tone="lime" angle={-3}>Comprar fácil, rápido y seguro</Sticker>
          <Reveal>
            <h2 className="brand-closing-h">
              Tiendas online con identidad, estructura y <span className="mark">poder de venta</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-closing-copy">
              Para marcas que no quieren vender desde una plantilla más. Quieren
              una plataforma comercial clara, rápida, escalable y con carácter.
            </p>
            <Link href="/#contact" className="btn btn-lime btn-lg">Quiero mi e-commerce <span className="arr">↗</span></Link>
            <Link href="/#projects" className="btn btn-light btn-lg">Ver proyectos <span className="arr">↗</span></Link>
          </Reveal>
        </div>
      </section>

      <ServiceNav current="ecommerce" />
      <Footer />
    </div>
  );
}
