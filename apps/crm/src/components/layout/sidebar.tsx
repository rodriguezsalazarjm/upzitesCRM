'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  EyeOff,
  FileText,
  Gauge,
  Globe2,
  Home,
  Lock,
  Menu,
  MessageSquare,
  Package,
  Pin,
  PlugZap,
  Receipt,
  Rocket,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Wordmark } from '@/components/ui/wordmark';
import type { CurrentUser } from '@/lib/auth';
import type { NavIcon } from '@/lib/navigation/items';
import type { ResolvedNavEntry, ResolvedNavigation } from '@/lib/navigation/resolve';
import { SIDEBAR, clampSidebarWidth, sidebarWidthFor } from '@/lib/navigation/sidebar-layout';
import { cn } from '@/lib/utils';
import { LogoutForm } from './logout-form';
import { WorkspaceSwitcher, type SwitchableWorkspace } from './workspace-switcher';

const ICONS: Record<NavIcon, typeof Rocket> = {
  rocket: Rocket,
  home: Home,
  inbox: MessageSquare,
  users: Users,
  pipeline: TrendingUp,
  package: Package,
  receipt: Receipt,
  file: FileText,
  activity: Activity,
  globe: Globe2,
  plug: PlugZap,
  bot: Bot,
  send: Send,
  sparkles: Sparkles,
  book: BookOpen,
  chart: BarChart3,
  gauge: Gauge,
  card: CreditCard,
  settings: Settings,
};

/** Solo operadores de plataforma: vista global del sistema. */
const platformItems: ResolvedNavEntry[] = [
  { id: 'platform', href: '/platform', label: 'Platform Admin', icon: 'settings', locked: false, lockedPlan: null },
  { id: 'ops', href: '/ops', label: 'Ops plataforma', icon: 'settings', locked: false, lockedPlan: null },
];

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

async function savePreference(patch: Record<string, unknown>) {
  await fetch('/api/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).catch(() => undefined);
}

/**
 * Sidebar adaptativo (P0-E). El CONTENIDO llega resuelto del servidor
 * (preset → plan → rol → preferencias, ver lib/navigation/resolve): aqui no
 * hay reglas por tipo de negocio. Escritorio: redimensionable y colapsable,
 * persistido por USUARIO x WORKSPACE. Movil: drawer de ancho fijo; el ancho
 * guardado no aplica.
 */
export function Sidebar({
  user,
  isPlatformAdmin = false,
  workspaces = [],
  navigation,
  preference,
}: {
  user: CurrentUser;
  isPlatformAdmin?: boolean;
  /** Negocios con membership ACTIVE. Con mas de uno aparece el selector. */
  workspaces?: SwitchableWorkspace[];
  navigation: ResolvedNavigation;
  preference: { sidebarWidth: number | null; sidebarCollapsed: boolean; navOrder: string[]; hiddenNavItems: string[] };
}) {
  const canSwitch = workspaces.length > 1;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(preference.sidebarCollapsed);
  const [width, setWidth] = useState(clampSidebarWidth(preference.sidebarWidth));
  const [showHidden, setShowHidden] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const dragging = useRef<{ startX: number; startWidth: number } | null>(null);

  // Escape cierra el drawer móvil y devuelve el foco al botón que lo abrió.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    if (!dragging.current) return;
    setWidth(clampSidebarWidth(dragging.current.startWidth + event.clientX - dragging.current.startX));
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = null;
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onPointerMove);
    setWidth((current) => {
      void savePreference({ sidebarWidth: current });
      return current;
    });
  }, [onPointerMove]);

  function startResize(event: React.PointerEvent) {
    if (collapsed) return;
    dragging.current = { startX: event.clientX, startWidth: width };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  function resizeWithKeyboard(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = clampSidebarWidth(width + (event.key === 'ArrowRight' ? 20 : -20));
    setWidth(next);
    void savePreference({ sidebarWidth: next });
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    void savePreference({ sidebarCollapsed: next });
  }

  async function hideItem(id: string) {
    await savePreference({
      hiddenNavItems: [...new Set([...preference.hiddenNavItems, id])],
      navOrder: preference.navOrder.filter((item) => item !== id),
    });
    router.refresh();
  }

  async function pinItem(id: string) {
    await savePreference({
      hiddenNavItems: preference.hiddenNavItems.filter((item) => item !== id),
      navOrder: [...navigation.primary.map((item) => item.id), id],
    });
    router.refresh();
  }

  const desktopWidth = sidebarWidthFor({ sidebarWidth: width, sidebarCollapsed: collapsed }, { mobile: false });

  function renderItems(items: ResolvedNavEntry[], options: { matchNested: boolean; hideable?: boolean; pinnable?: boolean }) {
    return (
      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? ShieldCheck;
          const active = pathname === item.href || (options.matchNested && pathname.startsWith(`${item.href}/`));
          const lockedLabel = item.locked ? (item.lockedPlan ? `Disponible en ${item.lockedPlan}` : 'No incluido en tu plan') : null;
          return (
            <li key={item.id} className="group/item relative">
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                aria-label={lockedLabel ? `${item.label} (bloqueado: ${lockedLabel})` : collapsed ? item.label : undefined}
                title={lockedLabel ?? (collapsed ? item.label : undefined)}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  collapsed && 'md:justify-center md:px-0',
                  active ? 'bg-canvas text-carbon' : 'text-mist hover:bg-white/[0.07] hover:text-white',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-electric' : 'text-fog group-hover:text-white')} strokeWidth={1.75} />
                <span className={cn('min-w-0 flex-1 truncate', collapsed && 'md:sr-only')}>{item.label}</span>
                {item.locked && (
                  <span className={cn('flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog', collapsed && 'md:hidden')}>
                    <Lock className="h-3 w-3" strokeWidth={2} aria-hidden />
                    {item.lockedPlan}
                  </span>
                )}
              </Link>
              {!collapsed && options.hideable && (
                <button
                  type="button"
                  onClick={() => void hideItem(item.id)}
                  aria-label={`Ocultar ${item.label} del menú`}
                  title="Ocultar del menú"
                  className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-1 text-fog hover:text-white focus-visible:flex group-hover/item:flex"
                >
                  <EyeOff className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
              {!collapsed && options.pinnable && (
                <button
                  type="button"
                  onClick={() => void pinItem(item.id)}
                  aria-label={`Mostrar ${item.label} en el menú`}
                  title="Mostrar en el menú"
                  className="absolute right-1.5 top-1/2 flex -translate-y-1/2 rounded p-1 text-fog hover:text-white"
                >
                  <Pin className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  function section(label: string, first = false) {
    if (collapsed) return <div className={cn('mx-3 hidden border-t border-white/10 md:block', !first && 'my-4')} aria-hidden />;
    return <p className={cn('mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-fog', !first && 'mt-7')}>{label}</p>;
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        aria-label={open ? 'Cerrar navegación' : 'Abrir navegación'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-paper text-carbon outline-none focus-visible:ring-2 focus-visible:ring-electric md:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        // Solo es el área de click fuera del drawer: el botón accesible es el toggle.
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-carbon/40 md:hidden"
        />
      )}
      <aside
        style={{ '--sidebar-w': `${desktopWidth}px` } as React.CSSProperties}
        data-collapsed={collapsed || undefined}
        className={cn(
          // Móvil: drawer de ancho fijo. Escritorio: ancho de la preferencia.
          'fixed inset-y-0 left-0 z-40 flex h-dvh shrink-0 flex-col bg-carbon text-canvas transition-transform md:static md:h-screen md:translate-x-0',
          // 248px = SIDEBAR.mobileWidth (Tailwind necesita la clase literal).
          'w-[248px] md:w-[var(--sidebar-w)]',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* En móvil el toggle fijo (left-3, 40px) queda sobre esta franja: pl-16 deja el wordmark a su derecha. */}
        <div className={cn('flex h-20 items-center pl-16 pr-6 md:px-6', collapsed && 'md:justify-center md:px-2')}>
          {collapsed ? (
            <span className="hidden text-lg font-black text-lime md:block" aria-hidden>
              U
            </span>
          ) : null}
          <div className={cn(collapsed && 'md:hidden')}>
            <Wordmark tone="dark" subtitle={canSwitch ? undefined : user.workspace.name} />
          </div>
        </div>
        {canSwitch && !collapsed && <WorkspaceSwitcher current={user.workspace} workspaces={workspaces} />}

        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
          {section('Principal', true)}
          {renderItems(navigation.primary, { matchNested: true, hideable: true })}
          {navigation.hidden.length > 0 && !collapsed && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowHidden((value) => !value)}
                aria-expanded={showHidden}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-fog hover:text-white"
              >
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showHidden && 'rotate-180')} aria-hidden />
                Más módulos ({navigation.hidden.length})
              </button>
              {showHidden && renderItems(navigation.hidden, { matchNested: true, pinnable: true })}
            </div>
          )}
          {section('Sistema')}
          {renderItems(navigation.system, { matchNested: true })}
          {isPlatformAdmin && (
            <>
              {section('Plataforma')}
              {renderItems(platformItems, { matchNested: false })}
            </>
          )}
        </nav>

        <div className={cn('border-t border-white/10 p-4', collapsed && 'md:px-2')}>
          <div className={cn('flex items-center gap-3 rounded-lg p-2', collapsed && 'md:justify-center md:p-0')}>
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-canvas text-xs font-bold text-carbon">{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className={cn('min-w-0 flex-1', collapsed && 'md:hidden')}>
              <p className="truncate text-[13px] font-semibold text-canvas">{user.name}</p>
              <p className="truncate text-[11px] text-fog">{user.email}</p>
            </div>
            <span className={cn('rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-carbon', collapsed && 'md:hidden')}>
              {user.role}
            </span>
          </div>
          <div className={cn(collapsed && 'md:hidden')}>
            <LogoutForm />
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            className="mt-2 hidden w-full items-center justify-center gap-2 rounded-lg py-1.5 text-xs text-fog hover:bg-white/[0.07] hover:text-white md:flex"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden /> : <ChevronsLeft className="h-4 w-4" aria-hidden />}
            {!collapsed && 'Colapsar'}
          </button>
        </div>
      </aside>
      {/* Agarradera de resize: solo escritorio y con el menú expandido. */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Cambiar el ancho del menú"
          aria-valuemin={SIDEBAR.minWidth}
          aria-valuemax={SIDEBAR.maxWidth}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={resizeWithKeyboard}
          className="relative z-40 -ml-1 hidden w-2 shrink-0 cursor-col-resize outline-none hover:bg-electric/30 focus-visible:bg-electric/40 md:block"
        />
      )}
    </>
  );
}
