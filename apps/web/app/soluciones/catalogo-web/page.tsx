import type { Metadata } from "next";
import { Reveal } from "@/components/Atoms";
import { ViewContentOnLoad } from "@/components/MetaPixelEvents";
import { SolucionWa } from "@/components/SolucionWa";
import "./catalogo-web.css";

export const metadata: Metadata = {
  title: "Catálogo Web Express · Vende por WhatsApp | UPZITES",
  description:
    "Tu catálogo web profesional para mostrar productos, precios y categorías en un solo link, listo para recibir pedidos por WhatsApp. Desde $249.990 CLP.",
  keywords: [
    "catálogo web",
    "vitrina digital",
    "catálogo para vender por WhatsApp",
    "catálogo online Chile",
    "tienda catálogo",
    "catálogo de productos web",
  ],
  openGraph: {
    title: "Catálogo Web Express · Vende por WhatsApp | UPZITES",
    description: "Ordena tus productos en una vitrina digital profesional, lista para compartir.",
    type: "website",
  },
};

const MSG_MAIN =
  "Hola UPZITES 🛍️, quiero cotizar un Catálogo Web Express para mostrar mis productos y recibir pedidos por WhatsApp.";

const INCLUYE = [
  { icon: "▦", title: "Página principal de catálogo", text: "Una página profesional donde tus clientes ven tus productos organizados." },
  { icon: "▢", title: "Hasta 30 productos cargados", text: "Carga inicial de productos según el alcance definido del servicio." },
  { icon: "≡", title: "Hasta 5 categorías", text: "Organización por categorías para facilitar la navegación." },
  { icon: "🏷", title: "Foto, nombre, precio y descripción", text: "Cada producto muestra su información principal de forma clara." },
  { icon: "✆", title: "Botón de pedido por WhatsApp", text: "Cada producto incluye un botón para consultar o pedir directo por WhatsApp." },
  { icon: "✦", title: "Mensaje automático por producto", text: "El botón abre WhatsApp con un mensaje prellenado según el producto elegido." },
  { icon: "🔍", title: "Buscador o filtro por categoría", text: "Tus clientes encuentran rápido lo que buscan." },
  { icon: "▣", title: "Diseño responsive + SEO básico", text: "Se ve bien en celular, tablet y computador, con estructura ordenada." },
  { icon: "↗", title: "Link listo para compartir", text: "Para Instagram, WhatsApp, biografía, tarjetas digitales o campañas." },
];

const DEMO = [
  { cat: "Tortas", name: "Torta tres leches", desc: "Húmeda de vainilla con crema y decoración personalizada.", price: "$18.000", img: "b1" },
  { cat: "Ropa", name: "Polera oversize", desc: "Algodón premium, corte holgado, varios colores.", price: "$14.990", img: "b2" },
  { cat: "Cosmética", name: "Serum facial", desc: "Hidratación profunda con ácido hialurónico.", price: "$12.500", img: "b3" },
  { cat: "Artesanal", name: "Vela aromática", desc: "Cera de soya, fragancia natural, 40 hrs de duración.", price: "$8.990", img: "b4" },
];

const CATEGORIES = ["Todos", "Tortas", "Ropa", "Cosmética", "Artesanal", "Tecnología"];

const STEPS = [
  { title: "Nos envías tu información", text: "Recibimos tus productos, precios, fotos, categorías y datos de contacto." },
  { title: "Organizamos tu catálogo", text: "Estructuramos tus productos para que se vean claros y fáciles de revisar." },
  { title: "Creamos tu vitrina digital", text: "Diseñamos y publicamos tu catálogo con botones directos a WhatsApp." },
  { title: "Compartes tu link", text: "Lo pones en tu Instagram, lo envías por WhatsApp o lo usas en campañas." },
];

const SCOPE = [
  "Catálogo web de una página",
  "Diseño visual profesional",
  "Hasta 30 productos cargados",
  "Hasta 5 categorías",
  "Foto, nombre, precio y descripción por producto",
  "Botón “Pedir por WhatsApp”",
  "Mensaje prellenado por producto",
  "Buscador simple o filtro por categoría",
  "Diseño responsive + SEO básico",
  "Publicación en dominio, subdominio o link",
  "Configuración básica de WhatsApp",
  "Link listo para compartir",
];

const COMPARE_BAD = ["Envíos manuales por WhatsApp", "Productos desordenados", "Clientes preguntando precios todo el tiempo", "Historias destacadas difíciles de revisar", "Poca confianza visual", "Proceso lento para responder"];
const COMPARE_GOOD = ["Productos organizados en un solo link", "Categorías claras", "Precios visibles", "Botón directo a WhatsApp", "Mejor presentación de marca", "Más fácil para el cliente elegir"];

const ADDONS = ["Más productos", "Más categorías", "Dominio personalizado", "Correo corporativo", "Catálogo PDF descargable", "Actualización mensual", "Fotografía de productos", "Reels de productos", "Meta Pixel / Analytics", "Escalar a Ecommerce Pro"];

const FAQ = [
  { q: "¿Es una tienda online completa?", a: "No. Es un catálogo web profesional para mostrar productos y recibir pedidos por WhatsApp. Si necesitas pagos online, carrito avanzado o inventario, cotizamos una ecommerce pro." },
  { q: "¿Puedo vender con este catálogo?", a: "Sí. Tus clientes ven productos y te escriben directo por WhatsApp para comprar o consultar." },
  { q: "¿Incluye pagos online?", a: "No en la versión express. Los pagos se coordinan directamente entre el negocio y el cliente." },
  { q: "¿Cuántos productos incluye?", a: "Hasta 30 productos cargados inicialmente. Puedes cotizar carga adicional después." },
  { q: "¿Puedo usarlo en Instagram?", a: "Sí. Pones el link en la biografía, historias, anuncios o lo envías por WhatsApp." },
  { q: "¿Funciona en celular?", a: "Sí. Está pensado principalmente para navegación móvil." },
  { q: "¿Puedo tener categorías?", a: "Sí. Incluye hasta 5 categorías." },
  { q: "¿Cuánto demora?", a: "Es un producto express. Una vez que entregas toda la información completa y ordenada, la producción es rápida." },
];

export default function CatalogoWebPage() {
  return (
    <div className="cw">
      <ViewContentOnLoad contentName="Catálogo Web Express" contentCategory="solucion" contentId="landing:catalogo-web" />

      <div className="cw-topbar">
        <div className="cw-topbar-inner">
          <a className="cw-topbar-brand" href="https://www.upzites.com" target="_blank" rel="noopener noreferrer">
            Catálogo<span>Web</span>
          </a>
          <SolucionWa message={MSG_MAIN} className="cw-btn cw-btn--wa cw-btn--sm" location="cw_topbar">
            Quiero mi catálogo
          </SolucionWa>
        </div>
      </div>

      {/* Hero */}
      <header className="cw-hero">
        <div className="cw-shell cw-hero-grid">
          <Reveal>
            <div>
              <p className="cw-eyebrow">Catálogo Web Express · UPZITES</p>
              <h1>Tu catálogo web listo para <span className="cw-accent">vender por WhatsApp</span></h1>
              <p className="cw-hero-sub">
                Creamos una vitrina digital profesional para mostrar tus productos, precios y categorías
                en un solo link, lista para recibir consultas y pedidos por WhatsApp.
              </p>
              <p className="cw-hero-support">
                Ideal para negocios que venden por Instagram o WhatsApp y necesitan ordenar sus productos
                en una página simple, moderna y fácil de compartir.
              </p>
              <div className="cw-hero-cta">
                <SolucionWa message={MSG_MAIN} className="cw-btn cw-btn--wa" location="cw_hero">
                  Quiero mi catálogo web
                </SolucionWa>
                <a className="cw-btn cw-btn--ghost" href="#incluye">Ver qué incluye</a>
              </div>
              <div className="cw-hero-chips">
                {["Categorías", "Precios", "Productos", "Pedidos por WhatsApp"].map((c) => (
                  <span className="cw-chip" key={c}>{c}</span>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={120} variant="scale">
            <div className="cw-phone-wrap">
              <div className="cw-phone">
                <div className="cw-phone-top"><b>Mi Tienda</b><span style={{ fontSize: 11, color: "var(--cw-muted)" }}>catálogo</span></div>
                <div className="cw-phone-cats"><span>Todos</span><span>Tortas</span><span>Ropa</span><span>Cosmética</span></div>
                <div className="cw-phone-grid">
                  {["b1", "b2", "b3", "b4"].map((b, i) => (
                    <div className="cw-mini" key={i}>
                      <div className={`cw-mini-img ${b}`} />
                      <div className="cw-mini-body">
                        <div className="cw-mini-name" />
                        <div className="cw-mini-price">${[18, 14, 12, 8][i]}.990</div>
                        <div className="cw-mini-wa">Pedir</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </header>

      {/* Problema */}
      <section className="cw-section">
        <div className="cw-shell cw-split">
          <Reveal>
            <div>
              <p className="cw-eyebrow">El problema</p>
              <h2>Vender por WhatsApp funciona, pero enviar productos uno por uno te hace perder tiempo</h2>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div>
              <p>
                Muchos negocios venden por redes, pero todavía muestran sus productos con fotos sueltas,
                historias destacadas, mensajes repetidos o catálogos desordenados. Eso hace que el cliente
                pregunte demasiado o no entienda qué puedes ofrecer.
              </p>
              <p>
                Con Catálogo Web Express, tus productos quedan organizados en una página profesional, fácil
                de navegar y lista para compartir.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Qué incluye */}
      <section className="cw-section cw-section--gray" id="incluye">
        <div className="cw-shell">
          <Reveal>
            <div>
              <p className="cw-eyebrow">Qué incluye</p>
              <h2>Qué incluye tu Catálogo Web Express</h2>
            </div>
          </Reveal>
          <div className="cw-cards">
            {INCLUYE.map((c) => (
              <div className="cw-card" key={c.title}>
                <div className="cw-card-icon">{c.icon}</div>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo productos */}
      <section className="cw-section">
        <div className="cw-shell">
          <Reveal>
            <div>
              <p className="cw-eyebrow">Así se ve</p>
              <h2>Una vitrina clara para mostrar y vender</h2>
              <div className="cw-catbar">
                {CATEGORIES.map((c) => <span key={c}>{c}</span>)}
              </div>
            </div>
          </Reveal>
          <div className="cw-demo">
            {DEMO.map((p) => (
              <div className="cw-prod" key={p.name}>
                <div className={`cw-prod-img cw-mini-img ${p.img}`}>
                  <span className="cw-prod-cat">{p.cat}</span>
                </div>
                <div className="cw-prod-body">
                  <span className="cw-prod-name">{p.name}</span>
                  <span className="cw-prod-desc">{p.desc}</span>
                  <span className="cw-prod-price">{p.price}</span>
                  <SolucionWa message={`Hola UPZITES, quiero pedir: ${p.name} (${p.price}).`} className="cw-btn cw-btn--wa cw-btn--sm cw-btn--block" location="cw_demo">
                    Pedir por WhatsApp
                  </SolucionWa>
                </div>
              </div>
            ))}
          </div>
          <p className="cw-note">Ejemplo demostrativo · tu catálogo se arma con tus productos, fotos y precios reales.</p>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="cw-section cw-section--gray">
        <div className="cw-shell">
          <Reveal>
            <div>
              <p className="cw-eyebrow">Cómo funciona</p>
              <h2>De tus productos a un catálogo listo para compartir</h2>
            </div>
          </Reveal>
          <div className="cw-steps">
            {STEPS.map((s, i) => (
              <div className="cw-step" key={s.title}>
                <div className="cw-step-num">{String(i + 1).padStart(2, "0")}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparación */}
      <section className="cw-section">
        <div className="cw-shell">
          <Reveal>
            <div>
              <p className="cw-eyebrow">Deja de vender con fotos sueltas</p>
              <h2>La diferencia se nota</h2>
            </div>
          </Reveal>
          <div className="cw-compare">
            <div className="cw-compare-col cw-compare-col--bad">
              <h3>Vender sin catálogo</h3>
              <ul className="cw-compare-list">{COMPARE_BAD.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div className="cw-compare-col cw-compare-col--good">
              <h3>Con Catálogo Web Express</h3>
              <ul className="cw-compare-list">{COMPARE_GOOD.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      {/* Plan único */}
      <section className="cw-section cw-section--gray">
        <div className="cw-shell">
          <Reveal>
            <div>
              <p className="cw-eyebrow">Precio</p>
              <h2 style={{ textAlign: "center" }}>Un solo plan, alcance claro</h2>
            </div>
          </Reveal>
          <div className="cw-pricing">
            <div className="cw-plan">
              <div className="cw-plan-name">Catálogo Web Express</div>
              <div className="cw-plan-price">$249.990 <small>CLP</small></div>
              <p style={{ fontSize: 14, color: "var(--cw-muted)" }}>Alcance cerrado, producción express.</p>
              <ul className="cw-plan-list">{SCOPE.map((s) => <li key={s}>{s}</li>)}</ul>
              <SolucionWa message={MSG_MAIN} className="cw-btn cw-btn--wa cw-btn--block" location="cw_plan">
                Quiero mi Catálogo Web Express
              </SolucionWa>
            </div>
          </div>
          <p className="cw-note">¿Necesitas pagos online, carrito o inventario? Lo derivamos a Ecommerce Pro / Sitio Web Pro UPZITES.</p>
        </div>
      </section>

      {/* Addons */}
      <section className="cw-section cw-section--tight">
        <div className="cw-shell">
          <Reveal>
            <div>
              <p className="cw-eyebrow">También puedes agregar</p>
              <h2>Adicionales</h2>
              <div className="cw-diff" style={{ marginTop: 24 }}>
                {ADDONS.map((a) => (
                  <div className="cw-diff-item" key={a}><span className="cw-diff-dot">+</span><span>{a}</span></div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="cw-section cw-section--gray">
        <div className="cw-shell" style={{ maxWidth: 800 }}>
          <Reveal>
            <div>
              <p className="cw-eyebrow">Preguntas frecuentes</p>
              <h2>Resolvemos tus dudas</h2>
            </div>
          </Reveal>
          <div className="cw-faq">
            {FAQ.map((item) => (
              <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>
            ))}
          </div>
        </div>
      </section>

      {/* Cierre */}
      <section className="cw-section cw-section--ink cw-closing">
        <div className="cw-shell">
          <Reveal>
            <div>
              <p className="cw-eyebrow" style={{ color: "#7aa2ff" }}>Empieza hoy</p>
              <h2>Ordena tus productos y vende con un link profesional</h2>
              <div className="cw-closing-price">$249.990 CLP</div>
              <div className="cw-hero-cta">
                <SolucionWa message={MSG_MAIN} className="cw-btn cw-btn--wa" location="cw_cierre">
                  Quiero mi Catálogo Web Express
                </SolucionWa>
                <SolucionWa message={MSG_MAIN} className="cw-btn cw-btn--ghost" location="cw_cierre">
                  <span style={{ color: "#fff" }}>Cotizar por WhatsApp</span>
                </SolucionWa>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="cw-footer">
        <div className="cw-shell">
          <div className="cw-footer-brand">UPZITES</div>
          <p>Catálogo Web Express · vende por WhatsApp · <a href="https://www.upzites.com" target="_blank" rel="noopener noreferrer">www.upzites.com</a></p>
        </div>
      </footer>

      <div className="cw-sticky">
        <SolucionWa message={MSG_MAIN} className="cw-btn cw-btn--wa" location="cw_sticky">Quiero mi catálogo web · $249.990</SolucionWa>
      </div>
    </div>
  );
}
