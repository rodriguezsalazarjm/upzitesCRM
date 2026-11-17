'use client';

import { CSS_FONT } from '@/lib/quote-studio/fonts';
import { PAGE, type Op } from '@/lib/quote-studio/layout';

/**
 * P37: dibuja en SVG las mismas operaciones que el servidor escribe en el PDF.
 * Por eso la vista previa y el PDF coinciden (misma maqueta, mismas posiciones).
 */
export function QuotePreview({ pages, logoUrl, className }: { pages: Op[][]; logoUrl: string | null; className?: string }) {
  return (
    <div className={className} data-quote-preview data-pages={pages.length}>
      {pages.map((ops, index) => (
        <svg
          key={index}
          viewBox={`0 0 ${PAGE.width} ${PAGE.height}`}
          className="mb-4 block h-auto w-full rounded-sm bg-white shadow-sm ring-1 ring-line"
          role="img"
          aria-label={`Página ${index + 1} de ${pages.length}`}
        >
          {ops.map((op, i) => {
            if (op.t === 'text') {
              const font = CSS_FONT[op.f];
              return <text key={i} x={op.x} y={op.y} fontFamily={font.family} fontWeight={font.weight} fontSize={op.size} fill={op.color} xmlSpace="preserve">{op.s}</text>;
            }
            if (op.t === 'rect') return <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill={op.fill ?? 'none'} stroke={op.stroke && op.lw ? op.stroke : undefined} strokeWidth={op.lw} />;
            if (op.t === 'line') return <line key={i} x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke={op.color} strokeWidth={op.lw} />;
            return logoUrl ? <image key={i} href={logoUrl} x={op.x} y={op.y} width={op.w} height={op.h} preserveAspectRatio="none" /> : null;
          })}
        </svg>
      ))}
    </div>
  );
}
