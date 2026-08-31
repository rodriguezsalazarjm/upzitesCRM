/**
 * Set de iconos de la landing. Reemplaza los caracteres sueltos (◈ ▦ ▢ ✎ ✆ ▣ ✦)
 * que se desalineaban y dependian de la fuente del sistema.
 *
 * Reglas: grilla de 24px, stroke 1.75 uniforme, remates cuadrados y uniones en
 * angulo (nada redondeado, coherente con la linea editorial de la marca) y
 * `currentColor` para que hereden el color del sello que los contiene.
 */

type IconProps = { className?: string };

const svg = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  "aria-hidden": true,
};

/** Identidad visual: dos planos superpuestos. */
export const IconIdentidad = ({ className }: IconProps) => (
  <svg {...svg} className={className}>
    <path d="M3 3h13v13H3z" />
    <path d="M8 21h13V8" />
  </svg>
);

/** Paleta: tres muestras de color. */
export const IconPaleta = ({ className }: IconProps) => (
  <svg {...svg} className={className}>
    <path d="M3 4h4.5v16H3z" />
    <path d="M9.75 4h4.5v16h-4.5z" />
    <path d="M16.5 4H21v16h-4.5z" />
  </svg>
);

/** Tipografia: una A sobre su linea base. */
export const IconTipografia = ({ className }: IconProps) => (
  <svg {...svg} className={className}>
    <path d="M4 18 10.5 4 17 18" />
    <path d="M6.6 13.2h7.8" />
    <path d="M3 21h18" />
  </svg>
);

/** Landing: ventana de navegador. */
export const IconLanding = ({ className }: IconProps) => (
  <svg {...svg} className={className}>
    <path d="M3 4h18v16H3z" />
    <path d="M3 9h18" />
    <path d="M6 6.5h.5M9 6.5h.5" />
  </svg>
);

/** Copy: lineas de texto ordenadas. */
export const IconCopy = ({ className }: IconProps) => (
  <svg {...svg} className={className}>
    <path d="M4 5h16" />
    <path d="M4 10h16" />
    <path d="M4 15h11" />
    <path d="M4 20h7" />
  </svg>
);

/** WhatsApp: globo de conversacion. */
export const IconChat = ({ className }: IconProps) => (
  <svg {...svg} className={className}>
    <path d="M4 4h16v12H9.5L4 20V4z" />
    <path d="M8 8h8M8 11.5h5" />
  </svg>
);

/** Movil. */
export const IconMovil = ({ className }: IconProps) => (
  <svg {...svg} className={className}>
    <path d="M6 2h12v20H6z" />
    <path d="M10 18.5h4" />
  </svg>
);

/** Suma, para los adicionales. */
export const IconPlus = ({ className }: IconProps) => (
  <svg {...svg} className={className}>
    <path d="M12 4v16M4 12h16" />
  </svg>
);

/** Flecha diagonal del vocabulario grafico de marca. */
export const IconArrow = ({ className }: IconProps) => (
  <svg {...svg} className={className}>
    <path d="M7 17 17 7" />
    <path d="M9 7h8v8" />
  </svg>
);

export const IconCheck = ({ className }: IconProps) => (
  <svg {...svg} className={className}>
    <path d="m4 12 5 5L20 6" />
  </svg>
);

export const IconCross = ({ className }: IconProps) => (
  <svg {...svg} className={className}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

/** Mapa clave -> icono, para que el contenido no importe componentes. */
export const ICONS = {
  identidad: IconIdentidad,
  paleta: IconPaleta,
  tipografia: IconTipografia,
  landing: IconLanding,
  copy: IconCopy,
  chat: IconChat,
  movil: IconMovil,
} as const;

export type IconKey = keyof typeof ICONS;
