"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";

export function GalleryMarquee({ images, name }: { images: string[]; name: string }) {
  const [idx, setIdx] = useState<number | null>(null);
  const open = idx !== null;

  const close = useCallback(() => setIdx(null), []);
  const prev = useCallback(
    () => setIdx((i) => (i === null ? i : (i - 1 + images.length) % images.length)),
    [images.length]
  );
  const next = useCallback(
    () => setIdx((i) => (i === null ? i : (i + 1) % images.length)),
    [images.length]
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close, prev, next]);

  const track = [...images, ...images];
  const duration = `${Math.max(18, images.length * 6)}s`;

  return (
    <>
      <div className="gm" aria-label={`Galería de ${name}`}>
        <div className="gm-track" style={{ animationDuration: duration } as CSSProperties}>
          {track.map((src, i) => {
            const real = i % images.length;
            return (
              <button
                key={i}
                type="button"
                className="gm-item"
                onClick={() => setIdx(real)}
                aria-label={`Ampliar imagen ${real + 1} de ${name}`}
              >
                <img src={src} alt={`${name} — ${real + 1}`} loading="lazy" draggable={false} />
              </button>
            );
          })}
        </div>
        <span className="gm-hint">Pasa el cursor para pausar · clic para ampliar</span>
      </div>

      {open && (
        <div className="lightbox" onClick={close} role="dialog" aria-modal="true">
          <button className="lightbox-close" onClick={close} aria-label="Cerrar">✕</button>
          {images.length > 1 && (
            <button
              className="lightbox-nav lightbox-prev"
              onClick={(e) => { e.stopPropagation(); prev(); }}
              aria-label="Anterior"
            >‹</button>
          )}
          <img
            className="lightbox-img"
            src={images[idx as number]}
            alt={`${name} — ${(idx as number) + 1}`}
            onClick={(e) => e.stopPropagation()}
          />
          {images.length > 1 && (
            <button
              className="lightbox-nav lightbox-next"
              onClick={(e) => { e.stopPropagation(); next(); }}
              aria-label="Siguiente"
            >›</button>
          )}
          <div className="lightbox-count">{(idx as number) + 1} / {images.length}</div>
        </div>
      )}
    </>
  );
}
