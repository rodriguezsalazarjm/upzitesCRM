# UPZITES FLOW — Design system del CRM

> "Tropical Underground convertido en SaaS". Lenguaje de producto premium B2B
> (cards amplias, superficies oscuras para módulos densos, casi sin sombras) con
> la identidad UPZITES. Fuente única de tokens: `apps/crm/src/app/globals.css`.

## 1. Auditoría (estado previo)

| Hallazgo | Detalle |
|---|---|
| Tokens shadcn por defecto | `globals.css` con el azul `221 83% 53%` genérico; ninguna relación con la marca. |
| Config muerto | `tailwind.config.js` (`primary #0ea5e9`) no lo carga Tailwind v4: eliminado. |
| Utilidades a mano | `.bg-primary`, `.text-muted-foreground`… duplicaban lo que hace `@theme`; sin modificadores de opacidad (`bg-primary/90` no funcionaba). |
| Paleta hardcodeada | 687 clases `slate/blue/red/amber/emerald/indigo/violet` en 64 archivos. |
| Radios y sombras mezclados | `rounded-md/lg/xl/2xl` sin regla; `shadow-sm` en 75 sitios. |
| Tipografía | Sin fuentes de marca en el CRM (sistema). ~150 textos de 9–11px. |
| Contraste | `text-slate-400` (≈2.9:1) en labels de 10px. |
| Estados sin semántica | Badge `success/warning/info` con emerald/amber/blue de Tailwind; "IA" en violeta, ajeno a la marca. |
| Dark mode | Bloque `.dark` sin uso; la marca es de lienzo claro. Eliminado. |

## 2. Tokens

**Paleta (70 / 20 / 10)**: Off-white `#FAFBF5` (canvas) · Ivory `#F4F1E8` · Paper `#FFFFFF` (cards) ·
Carbon `#111111` · Ink `#001B2A` · Line `#E6E4DC` · Electric `#0057FF`.
Acentos: Lime `#A6FF00` · Guava `#FF5CAB` · Solar `#FFD100` · Tomato `#FF3B30`.

**Significado del color** (un estado = un color, siempre):

| Color | Uso |
|---|---|
| Electric | Acción primaria (un botón por vista), enlaces, "en curso", info |
| Lime | Éxito, conectado, automatización / IA |
| Solar | Atención, requiere revisión |
| Tomato | Error, reconexión, crítico |
| Guava | Acento excepcional (canal Instagram) |
| Ink | Superficie destacada / IA sobria |

**Tipografía**: Helvena (UI, 400–800, `next/font/local`) · Bebas Neue (`.type-display`: títulos de
página y cifras de métricas). Eyebrows: `.type-eyebrow` (11px, mayúsculas, tracking 0.14em).
Texto secundario: `text-soft` (se adapta a superficie clara u oscura).

**Forma**: cards 20px (`rounded-2xl`), controles 12px (`rounded-lg`), pills 999px. Hairline `#E6E4DC`.
**Sombras**: `shadow-xs/sm` dibujan un hairline; `shadow-md` es el único lift (hover de card);
`lg+` solo popovers/modales. Sin glow, sin degradados, sin glass.
**Movimiento**: 200ms ease-out; hover de card sube 2px; press baja 1px.

**Capa de compatibilidad**: la paleta genérica de Tailwind está remapeada a la de marca en `@theme`
(`slate`→neutros cálidos, `blue`/`indigo`→Electric, `emerald`→Lime/oliva, `amber`→Solar, `red`→Tomato,
`violet`→Ink, `fuchsia`→Guava). Las pantallas legacy heredan la identidad sin reescribirse. Es transitoria:
en código nuevo usar tokens semánticos (`bg-canvas`, `text-carbon`, `bg-electric`…), no estas familias.

## 3. Componentes reutilizables (`src/components/ui`)

| Componente | Notas |
|---|---|
| `Button` | `default` Electric · `dark` · `inverse` (sobre oscuro) · `outline` · `secondary` · `ghost` · `destructive` · `link` |
| `Badge` | `success` `warning` `danger` `info` `ai` `neutral` `outline` `default` (pill) |
| `Card` | `tone`: `default` · `sunken` · `dark` (Carbon) · `ink`; las oscuras reasignan el texto secundario |
| `Input` | 40px, borde `slate-300`, foco Electric |
| `StatCard` | Eyebrow + cifra display + variación (lime/tomato/neutra) + contexto |
| `Eyebrow`, `SectionHeading` | Label y encabezado de sección |
| `EmptyState` | Icono fino + mensaje corto |
| `Header` (layout) | Título display + subtítulo, acciones a la derecha; misma API |
| `Sidebar` (layout) | Carbon, item activo en canvas, wordmark "Upzites Flow" |

## 4. Plan

**P0 — hecho**
- Tokens, fuentes, remapeo de paleta, sombras y radios (`globals.css`, `layout.tsx`, `manifest.ts`).
- Primitivas: Button, Badge, Card, Input. Nuevos: StatCard, Eyebrow/SectionHeading, EmptyState.
- Shell: Sidebar Carbon, Header editorial, canvas.
- Pantallas: Dashboard, Integraciones (page + tarjetas Meta/WhatsApp/Mercado Pago/canales), Inbox (lista).

**P1 — siguiente**
- Contactos, Pipeline, Automatizaciones: barras de filtro `border-b bg-white` → canvas; tabla `Table`
  (claro y variante Carbon densa); kanban con cards 20px; chips de etapa con `Badge`.
- Detalle de inbox (`inbox/[id]`) y de contacto (`contactos/[id]`); flow builder (nodos, panel lateral).
- Componente `Table` + `Tabs/SegmentedControl` + `Select`/`Textarea` de sistema (hoy hay `<select>` y `<textarea>` crudos).
- Sustituir progresivamente `slate-*`/`blue-*` por tokens semánticos; formularios de Configuración, Productos, Cotizaciones.
- Login/registro (hoy con degradado azul: fuera de marca).

**P2**
- Sparklines/gráficas con paleta de marca; módulo de métricas dark en Uso y costos.
- Skeletons y estados de carga; motion de entrada (slide 8px).
- Regla ESLint/Tailwind que prohíba familias genéricas de color y `text-[9-11px]`.
- Regresión visual (Playwright) sobre las pantallas migradas; retirar la capa de compatibilidad.

## 5. Cómo verificar
`pnpm --filter @upzites/crm visual:prepare` y `visual:dev` (puerto 3101, BD local `crm_pruebas`, red externa
bloqueada). No usar `pnpm dev` para revisar diseño: el `.env` local apunta a la base de producción.
Nota: el guard bloquea Google Fonts, así que en ese modo Bebas Neue cae al fallback.
