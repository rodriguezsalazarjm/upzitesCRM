/**
 * Capa responsive para las landings convertidas desde Claude Design.
 *
 * Los diseños .dc.html originales son desktop-only: no traen NINGUNA media query
 * y el layout vive en estilos inline (`<div style="display:grid;
 * grid-template-columns:repeat(3,1fr)">`, anchos fijos en px, paddings de 96px+,
 * elementos `position:absolute`, etc.). En móvil eso provoca columnas aplastadas,
 * scroll horizontal, paddings gigantes y adornos descolocados.
 *
 * Como el markup va dentro de un Shadow DOM (ver DcRuntime) y casi todo es inline,
 * usamos selectores de atributo `[style*="..."]` + reglas de etiqueta con
 * `!important` (una hoja con !important vence al estilo inline) para, solo en
 * pantallas chicas, normalizar el layout. NO toca el design.data.ts generado y
 * sobrevive a una reconversión (se pasa concatenado: `css + mobileFix`).
 */
export const mobileFix = `
  @media (max-width: 760px) {
    :host { overflow-x: hidden !important; }

    /* --- ritmo vertical más compacto + menos padding lateral --- */
    section { padding-top: 60px !important; padding-bottom: 60px !important; padding-left: 18px !important; padding-right: 18px !important; }
    header  { padding-top: 100px !important; padding-bottom: 44px !important; padding-left: 18px !important; padding-right: 18px !important; }
    footer  { padding-left: 18px !important; padding-right: 18px !important; }

    /* --- NAV: los 4 links de texto no caben y empujan el CTA fuera de
           pantalla. En móvil dejamos solo logo + botón (el logo lleva a #top y
           el footer repite los enlaces). --- */
    .navlink { display: none !important; }
    nav [style*="gap:30px"] { gap: 0 !important; }
    nav [style*="padding:12px 20px"] { padding: 11px 16px !important; font-size: 13px !important; }

    /* --- colapsar cualquier grid multicolumna a una sola columna --- */
    [style*="grid-template-columns"] { grid-template-columns: 1fr !important; gap: 14px !important; }

    /* --- comparativa: la cabecera de 2 columnas queda confusa al apilarse
           (un “CON INVITA” suelto sobre una fila ✕). La ocultamos: el ✕ rosa y
           el ✓ verde ya distinguen cada lado. --- */
    .cmp-head { display: none !important; }

    /* --- nada de anchos fijos que desborden --- */
    [style*="width:"] { max-width: 100% !important; }
    img, svg, video, canvas { max-width: 100% !important; height: auto !important; }

    /* --- títulos un punto más chicos para que respiren --- */
    h1 { font-size: clamp(34px, 11vw, 46px) !important; line-height: 1.06 !important; }
    h2 { line-height: 1.12 !important; }

    /* --- HERO: ocultar las etiquetas flotantes (z-index:5) que se salen del
           viewport, y centrar el teléfono --- */
    header [style*="z-index:5"] { display: none !important; }
    [style*="border-radius:46px"] { width: 270px !important; margin-left: auto !important; margin-right: auto !important; }

    /* --- "El proceso": ocultar la línea conectora horizontal absoluta que
           queda flotando cuando los pasos se apilan --- */
    [style*="left:8%"][style*="right:8%"] { display: none !important; }

    /* --- bloques con texto alineado a la derecha (banda de cotización) → izq --- */
    [style*="text-align:right"] { text-align: left !important; }

    /* --- CTAs en columna a ancho completo para que sean fáciles de tocar --- */
    [style*="display:flex"][style*="flex-wrap:wrap"][style*="gap:14px"] > a { width: 100% !important; justify-content: center !important; }
  }

  @media (max-width: 460px) {
    /* en pantallas muy chicas, comparativa y métricas necesitan menos padding
       interno para no apretar el texto */
    [style*="padding:16px 24px"] { padding-left: 16px !important; padding-right: 16px !important; }
    [style*="padding:18px 24px"] { padding-left: 16px !important; padding-right: 16px !important; }
  }
`;
