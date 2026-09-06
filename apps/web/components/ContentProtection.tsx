"use client";

import { useEffect } from "react";

/**
 * Disuasión básica contra la descarga de imágenes: desactiva el menú contextual
 * (clic derecho → "Guardar imagen") y el arrastre sobre cualquier <img>, también
 * dentro de los Shadow DOM de las landings (por eso se usa composedPath y captura).
 *
 * Importante: NO bloquea la copia de texto ni el clic derecho fuera de imágenes,
 * y NO es infalible (quien sepa abrir las DevTools podrá igual). Es una capa para
 * frenar el guardado casual, no un candado real.
 */
export function ContentProtection() {
  useEffect(() => {
    const hitsImage = (e: Event) =>
      (e.composedPath?.() ?? []).some(
        (n) => (n as HTMLElement)?.tagName === "IMG",
      );

    const onContextMenu = (e: MouseEvent) => {
      if (hitsImage(e)) e.preventDefault();
    };
    const onDragStart = (e: DragEvent) => {
      if (hitsImage(e)) e.preventDefault();
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart, true);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart, true);
    };
  }, []);

  return null;
}
