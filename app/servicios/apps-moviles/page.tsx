import type { CSSProperties } from "react";
import Link from "next/link";
import { TopNav, Footer, Marquee } from "@/components/Sections";
import { Eyebrow, Reveal, Sticker } from "@/components/Atoms";
import { FeatureCards, type FeatureCard } from "@/components/FeatureCards";
import { ServiceNav } from "@/components/ServiceNav";

export const metadata = {
  title: "Apps móviles — UPZITES",
  description:
    "Diseñamos experiencias móviles para iOS y Android con UX/UI estratégico, arquitectura clara, prototipos interactivos y sistemas visuales listos para escalar.",
};

const ACCENT = "var(--upz-electric)";

const CARDS: FeatureCard[] = [
  { num: "01", title: "Estrategia de producto", visible: "Definimos qué debe hacer la app y por qué.", detail: "Aterrizamos la idea, objetivo, usuarios, funcionalidades principales, propuesta de valor y prioridades del producto para que la app no se convierta en una lista infinita de pantallas sin dirección.", micro: "Primero claridad. Luego pantallas." },
  { num: "02", title: "Arquitectura de la app", visible: "Organizamos la estructura antes de diseñar.", detail: "Definimos secciones, navegación, jerarquía de funciones, módulos principales y rutas de usuario para que la experiencia sea fácil de entender desde el primer uso.", micro: "Una buena app tiene camino." },
  { num: "03", title: "User flows", visible: "Diseñamos los recorridos clave del usuario.", detail: "Mapeamos cómo una persona entra, explora, se registra, completa acciones, compra, reserva, publica, consulta o usa las funciones principales de la app.", micro: "Cada acción debe tener sentido." },
  { num: "04", title: "Wireframes UX", visible: "Creamos la base funcional de cada pantalla.", detail: "Diseñamos wireframes para validar estructura, navegación, contenido, botones, formularios y comportamiento antes de aplicar diseño visual.", micro: "Antes de verse bonita, debe funcionar." },
  { num: "05", title: "Diseño UI para iOS y Android", visible: "Interfaz moderna, clara y lista para usuarios reales.", detail: "Diseñamos pantallas visualmente sólidas, consistentes y adaptadas a patrones móviles. Cuidamos botones, cards, navegación, estados, jerarquía visual, legibilidad y personalidad de marca.", micro: "Diseño que se entiende rápido." },
  { num: "06", title: "Onboarding y registro", visible: "Diseñamos una primera experiencia sin fricción.", detail: "Creamos pantallas de bienvenida, registro, login, permisos, explicación de valor y primeros pasos para que el usuario entienda la app y quiera seguir usándola.", micro: "El primer minuto decide mucho." },
  { num: "07", title: "Design system móvil", visible: "Creamos componentes para escalar la app.", detail: "Definimos botones, inputs, cards, menús, iconos, colores, tipografías, estados, espaciados y componentes reutilizables para mantener coherencia mientras el producto crece.", micro: "Sistema antes que improvisación." },
  { num: "08", title: "Prototipo interactivo", visible: "Tu app se puede probar antes de desarrollarla.", detail: "Creamos un prototipo navegable para visualizar la experiencia, validar recorridos, presentar la idea, conseguir feedback o preparar el handoff a desarrollo.", micro: "Probar antes de construir." },
  { num: "09", title: "Pantallas clave", visible: "Diseñamos las vistas que sostienen la experiencia.", detail: "Creamos pantallas como home, perfil, búsqueda, detalle, favoritos, carrito, reservas, dashboard, notificaciones, ajustes, pagos o cualquier módulo necesario según el tipo de app.", micro: "Cada pantalla tiene un trabajo." },
  { num: "10", title: "Handoff a desarrollo", visible: "Dejamos el diseño listo para construir.", detail: "Organizamos archivos, componentes, estilos, especificaciones, prototipo y documentación para facilitar el trabajo del equipo de desarrollo iOS, Android o multiplataforma.", micro: "Diseño listo para producción." },
];

const PROCESS = [
  { num: "01", title: "Diagnóstico de producto", body: "Entendemos la idea, objetivo, usuarios, funcionalidades, mercado y necesidades reales de la app." },
  { num: "02", title: "Arquitectura UX", body: "Definimos estructura, navegación, flujos principales, jerarquía de información y recorrido del usuario." },
  { num: "03", title: "Wireframes", body: "Diseñamos la base funcional de las pantallas para validar lógica, orden y experiencia antes del diseño visual." },
  { num: "04", title: "Diseño UI", body: "Creamos la interfaz visual de la app con estética moderna, componentes consistentes y alineación con la marca." },
  { num: "05", title: "Prototipo interactivo", body: "Conectamos pantallas para simular la experiencia real de uso y revisar el flujo antes de desarrollo." },
  { num: "06", title: "Sistema y entrega", body: "Organizamos componentes, estilos, pantallas y documentación para facilitar implementación y escalabilidad." },
];

const INCLUYE = [
  { title: "Investigación inicial", body: "Objetivos, usuarios, competencia, funcionalidades y necesidades del producto." },
  { title: "Mapa de navegación", body: "Estructura general de secciones, módulos y rutas principales." },
  { title: "Flujos de usuario", body: "Recorridos para registro, compra, reserva, búsqueda, interacción o función principal." },
  { title: "Wireframes UX", body: "Pantallas base para validar estructura y lógica." },
  { title: "Diseño UI mobile", body: "Interfaz visual para iOS, Android o experiencia multiplataforma." },
  { title: "Design system", body: "Componentes, colores, tipografías, botones, inputs, cards, iconografía y estados." },
  { title: "Prototipo navegable", body: "Versión interactiva para probar, presentar o validar." },
  { title: "Handoff técnico", body: "Archivos organizados para equipo de desarrollo." },
];

const PARA_QUIEN = [
  "Startups que necesitan diseñar su primera app.",
  "Empresas que quieren digitalizar un servicio.",
  "Marcas que necesitan una app para clientes o comunidad.",
  "Negocios que quieren vender, reservar o gestionar desde móvil.",
  "Equipos que ya tienen desarrollo, pero necesitan UX/UI profesional.",
  "Proyectos que necesitan prototipo para presentar, validar o levantar inversión.",
  "Apps existentes que necesitan rediseño, orden o mejor experiencia.",
];

const RESULTADOS = [
  "Experiencia de usuario más clara.",
  "Navegación más intuitiva.",
  "Pantallas visualmente consistentes.",
  "Menos fricción en acciones clave.",
  "Producto más fácil de presentar.",
  "Diseño listo para desarrollo.",
  "Sistema visual escalable.",
  "Mayor confianza en la experiencia digital.",
  "Mejor percepción de marca.",
];

const FRASES = [
  "Una app no empieza en código · empieza en experiencia",
  "Si el usuario se pierde, la app pierde valor",
  "Menos fricción · más uso",
  "Cada pantalla debe guiar una acción",
  "Diseño móvil para productos que quieren crecer",
  "Premium a la vista · fácil al tacto",
];

export default function AppsMovilesPage() {
  return (
    <div id="top" style={{ "--svc-accent": ACCENT } as CSSProperties}>
      <TopNav />
      <ServiceNav current="apps-moviles" />

      {/* 1. Hero */}
      <section className="brand-hero" data-screen-label="Apps · Hero">
        <div className="shell">
          <div className="svc-breadcrumb">
            <Link href="/servicios">Servicios</Link>
            <span>↗</span>
            <span>Apps móviles</span>
          </div>
          <div className="brand-hero-grid">
            <div>
              <Eyebrow num="01">Servicio · Apps móviles</Eyebrow>
              <h1 className="brand-hero-title">
                Apps móviles diseñadas para sentirse <span className="mark">simples, rápidas y memorables</span>.
              </h1>
              <p className="brand-hero-sub">
                Diseñamos experiencias móviles para iOS y Android con UX/UI
                estratégico, arquitectura clara, prototipos interactivos y sistemas
                visuales listos para escalar.
              </p>
              <p className="brand-hero-note">
                Una app no empieza en código. Empieza en entender al usuario,
                ordenar la experiencia y diseñar cada interacción con intención.
              </p>
              <div className="hero-actions">
                <Link href="/#contact" className="btn btn-dark btn-lg">Quiero diseñar mi app <span className="arr">↗</span></Link>
                <a href="#incluye" className="btn btn-ivory btn-lg">Ver qué incluye <span className="arr">↗</span></a>
              </div>
            </div>
            <div className="brand-hero-media">
              <img src="/images/apps-cover.jpg" alt="Interfaz de app móvil en varios dispositivos iOS y Android" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Problema */}
      <section className="section section--tight" data-screen-label="Apps · Problema">
        <div className="shell brand-problem">
          <Reveal>
            <h2 className="brand-promise-h" style={{ marginTop: 0 }}>Una app difícil de usar se abandona rápido.</h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="brand-lead">
              Muchas apps nacen con una buena idea, pero fallan en la experiencia:
              pantallas confusas, recorridos largos, navegación poco clara, diseño
              genérico o funciones que el usuario no entiende. El problema no
              siempre es la tecnología. Muchas veces es la falta de estrategia, UX
              y diseño desde el inicio.
            </p>
          </Reveal>
          <Reveal delay={140}>
            <h2 className="brand-punch">
              Una app no debe obligar al usuario a <span className="strike">pensar demasiado</span>.<br />
              Debe <span className="mark">guiarlo con claridad</span>.
            </h2>
          </Reveal>
        </div>
      </section>

      {/* 3. Promesa */}
      <section className="section section--ivory" data-screen-label="Apps · Promesa">
        <div className="shell">
          <div className="brand-promise">
            <Reveal>
              <div className="brand-promise-media">
                <img src="/images/apps-promise.jpg" alt="Sistema visual de app móvil consistente en varias pantallas" />
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div>
                <Eyebrow num="02">La promesa</Eyebrow>
                <h2 className="brand-promise-h">
                  Convertimos tu idea en una experiencia móvil clara, usable y lista para desarrollarse.
                </h2>
                <p className="brand-body">
                  Diseñamos apps móviles con estructura, flujo, interfaz y sistema
                  visual para que cada pantalla tenga una función clara. Desde la
                  arquitectura inicial hasta el prototipo, creamos experiencias
                  pensadas para usuarios reales, negocios reales y productos
                  digitales que necesitan crecer.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 4. Qué incluye · cards interactivas */}
      <section id="incluye" className="section" data-screen-label="Apps · Incluye">
        <div className="shell">
          <Eyebrow num="03">¿Qué incluye el Diseño de Apps?</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                De la idea<br />
                <span className="b">al prototipo<span style={{ color: ACCENT }}>.</span></span>
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

      {/* 5. Nuestro enfoque */}
      <section className="section section--ivory" data-screen-label="Apps · Enfoque">
        <div className="shell">
          <div className="brand-promise">
            <Reveal>
              <div className="brand-promise-media">
                <img src="/images/apps-enfoque.jpg" alt="Persona usando una app móvil en un entorno real" />
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div>
                <Eyebrow>Nuestro enfoque</Eyebrow>
                <h2 className="brand-promise-h">
                  Diseñamos apps con estrategia, experiencia y carácter visual.
                </h2>
                <p className="brand-body">
                  En UPZITES no diseñamos pantallas aisladas. Diseñamos productos
                  digitales con lógica, flujo, estética y sistema. Cada interacción
                  debe ayudar al usuario a avanzar y cada pantalla debe reforzar el
                  valor del producto.
                </p>
                <p className="brand-body" style={{ marginTop: 12 }}>
                  Una app bien diseñada no solo se ve moderna: se siente fácil,
                  clara y confiable.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 6. Proceso */}
      <section className="section" data-screen-label="Apps · Proceso">
        <div className="shell">
          <Eyebrow num="04">Proceso</Eyebrow>
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
                <img src="/images/apps-process.jpg" alt="Wireframes y flujos de usuario para diseño de app" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 7. Qué puede incluir el servicio */}
      <section className="section section--ivory" data-screen-label="Apps · Incluye servicio">
        <div className="shell">
          <Eyebrow num="05">Qué puede incluir el servicio</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Diseño completo.<br />
                <span className="b">Listo para construir<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 460, margin: 0 }}>
                Definimos el alcance según el tipo de app, su etapa y tus objetivos.
              </p>
            </Reveal>
          </div>
          <div className="svc-includes">
            {INCLUYE.map((it, i) => (
              <Reveal key={it.title} delay={i * 50}>
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

      {/* 8. Para quién es */}
      <section className="section" data-screen-label="Apps · Para quién">
        <div className="shell">
          <Eyebrow num="06">Para quién es este servicio</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Para ideas digitales que necesitan<br />
                <span className="b">convertirse en producto<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
          </div>
          <div className="mkt-points">
            {PARA_QUIEN.map((p, i) => (
              <Reveal key={i} delay={i * 50}>
                <div className="mkt-point">
                  <span className="mkt-point-arr">↗</span>
                  <span>{p}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 9. Resultados */}
      <section className="section section--carbon" data-screen-label="Apps · Resultados">
        <div className="shell">
          <Eyebrow>Resultados que buscamos</Eyebrow>
          <div className="services-head">
            <Reveal>
              <h2 className="services-h">
                Más clara, más usable,<br />
                <span className="b">más lista para crecer<span style={{ color: ACCENT }}>.</span></span>
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p style={{ fontFamily: "var(--font-text)", fontSize: 16, lineHeight: 1.55, color: "rgba(250,251,245,.72)", maxWidth: 460, margin: 0 }}>
                El objetivo no es solo diseñar pantallas bonitas: es construir una
                experiencia que el usuario entienda, use y quiera repetir.
              </p>
            </Reveal>
          </div>
          <ul className="svc-benefits">
            {RESULTADOS.map((r, i) => (
              <Reveal key={i} delay={i * 50} as="li">
                <span className="svc-benefit-arr">↗</span>
                <span>{r}</span>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <Marquee variant="carbon" items={FRASES} />

      {/* 10. Venta */}
      <section className="section section--ivory" data-screen-label="Apps · Venta">
        <div className="shell brand-sell">
          <Reveal>
            <h2 className="services-h">
              Tu app debe sentirse tan bien<br />
              <span className="b">como se ve<span style={{ color: ACCENT }}>.</span></span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-body">
              Diseñamos experiencias móviles que conectan estrategia, UX, interfaz
              y sistema visual para que tu producto digital tenga claridad desde el
              primer toque. No se trata de llenar pantallas: se trata de diseñar
              una experiencia que el usuario entienda, disfrute y use.
            </p>
            <Link href="/#contact" className="btn btn-dark btn-lg">Diseñar mi app móvil <span className="arr">↗</span></Link>
          </Reveal>
        </div>
      </section>

      {/* 11. Cierre */}
      <section className="brand-closing" data-screen-label="Apps · Cierre">
        <div className="shell">
          <Sticker tone="lime" angle={-3}>Premium a la vista · fácil al tacto</Sticker>
          <Reveal>
            <h2 className="brand-closing-h">
              Apps móviles con dirección, sistema y <span className="mark">experiencia real</span>.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="brand-closing-copy">
              Para marcas, startups y empresas que no quieren lanzar una app
              improvisada. Quieren un producto digital claro, moderno, escalable y
              listo para usuarios reales.
            </p>
            <Link href="/#contact" className="btn btn-lime btn-lg">Quiero crear mi app <span className="arr">↗</span></Link>
            <Link href="/#projects" className="btn btn-light btn-lg">Ver proyectos <span className="arr">↗</span></Link>
          </Reveal>
        </div>
      </section>

      <ServiceNav current="apps-moviles" />
      <Footer />
    </div>
  );
}
