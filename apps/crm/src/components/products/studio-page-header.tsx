import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Cabecera de las pantallas de un producto: volver al listado + titulo. El
 * titulo es el nombre que escribio el negocio, asi que corta palabras largas
 * en vez de desbordar en movil.
 */
export function StudioPageHeader({
  title,
  eyebrow,
  badge,
  back = { href: '/productos', label: 'Productos' },
}: {
  title: string;
  eyebrow: string;
  badge?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="shrink-0 py-5 pl-16 pr-4 sm:px-8 sm:pb-4 sm:pt-7 md:pl-8">
      <Link href={back.href} className="inline-flex items-center gap-1.5 text-xs font-semibold text-soft hover:text-carbon">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {back.label}
      </Link>
      <p className="type-eyebrow mt-3 text-soft">{eyebrow}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="min-w-0 break-words text-[28px] font-bold leading-tight tracking-tight text-carbon [overflow-wrap:anywhere] sm:text-[36px]">{title}</h1>
        {badge}
      </div>
    </header>
  );
}
