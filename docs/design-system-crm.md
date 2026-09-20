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
| `StatusBadge` | Estado con tono fijo (`success/warning/danger/info/ai/ink/neutral/draft`). `variant="soft"` (pill) o `"dot"` (punto + texto neutro, para tablas y cards densas); `onDark` para Carbon. Mapas de dominio en `lib/status-tone.ts` |
| `Card` | `tone`: `default` · `sunken` · `dark` (Carbon) · `ink`; las oscuras reasignan el texto secundario (`text-soft`) |
| `Table` | Semántica HTML real; `tone` light/dark, `density` compact/comfortable, filas `interactive`/`selected` (teclado Enter/Espacio), `TableEmpty`, `TableSkeletonRows` |
| `Tabs` | Control segmentado. `semantics="tabs"` (tablist, flechas/Home/End) o `"filter"` (aria-pressed); items con `count`, icono o `href` |
| `Select` | `<select>` nativo con estilo de sistema |
| `Toolbar`, `FilterBar`, `ToolbarSearch`, `ToolbarSpacer` | Fila de controles sobre el canvas / cabecera de módulo |
| `PageHeader` | Título display + descripción + acciones. `Header` (layout) lo compone con búsqueda global y acción |
| `Input`, `StatCard` (`size` sm/default), `Eyebrow`, `SectionHeading`, `EmptyState`, `Skeleton` | |
| `AutomationRow`, `RuleChip`, `RunHealth` (`components/automations`) | Fila de regla/flujo; base visual para el Builder |
| `Sidebar` (layout) | Carbon, item activo en canvas, wordmark "Upzites Flow" |

**Neutros y tintas semánticos** (usar en código nuevo en vez de `slate-*`): `ash` `graphite` `stone` `fog`
`mist` `ink-muted`; tintas de estado `success-ink` `warning-ink` `danger-ink` `info-ink`;
`electric-strong` / `electric-press` (hover/press de acción primaria).

**Estados de arrastre**: card de pipeline y columna exponen `data-dragging` / `data-over` ya estilizados.
El tablero aún no es arrastrable (no había DnD): al añadirlo solo hay que setear esos atributos.

## 4. Plan

**P0 — hecho**: tokens, fuentes locales (Helvena + Bebas Neue), remapeo de paleta, primitivas, shell,
Dashboard, Integraciones, Inbox (lista).

**P1 — hecho**: Pipeline (tablero + lista), Contactos (tabla, filtros, panel lateral, ficha completa),
Automatizaciones (métricas, reglas, flujos, catálogo) y los primitives Table/Tabs/Select/Toolbar/
PageHeader/StatusBadge. `loading.tsx` con skeleton en las tres rutas.

**Inbox — hecho**: lista | conversación | contexto (`components/inbox`). ≥1400px tres columnas fijas; <1400px el contexto abre como panel lateral; <1024px la lista es la ruta `/inbox` y la conversación va a pantalla completa. Cliente = burbuja Paper con hairline, agente humano = Carbon, IA/automático = Ivory con punto Lime (única señal Lime, nunca fondo). Canal = icono + nombre (`ChannelLabel`), sin superficies de color. Estados: sin selección, vacío, skeleton (`loading.tsx`), error (`error.tsx`), envío/error/reintento, toma humana, canal con incidencia, offline. Lógica de mensajería intacta (`conversation-client.tsx` conserva efectos, `post`, `send`, reintentos y borradores).

**Regla Server/Client**: un componente (función) no puede pasar de un Server Component a uno client. Para `Tabs` construido en servidor usar `iconElement={<Icon />}`, no `icon={Icon}`.

**P1 — pendiente**
- Flow builder (nodos, panel lateral) — fuera de este alcance a propósito.
- Formularios: Configuración, Productos, Cotizaciones, Pedidos, nueva oportunidad/contacto (usar `Input`/`Select`).
- Login/registro (degradado azul fuera de marca).
- Sustituir `slate-*`/`blue-*` legacy por tokens semánticos y retirar la capa de compatibilidad.

**P2**
- Sparklines/gráficas con paleta de marca; módulo de métricas dark en Uso y costos.
- Motion de entrada (slide 8px); DnD real en pipeline.
- Regla ESLint/Tailwind que prohíba familias genéricas de color y `text-[9-11px]`.
- Regresión visual (Playwright) sobre las pantallas migradas.

## 5. Cómo verificar
`pnpm --filter @upzites/crm visual:prepare` y `visual:dev` (puerto 3101, BD local `crm_pruebas`, red externa
bloqueada). No usar `pnpm dev` para revisar diseño: el `.env` local apunta a la base de producción.
Ambas tipografías están autoalojadas (`next/font/local`), así que el modo aislado las renderiza igual que producción.
