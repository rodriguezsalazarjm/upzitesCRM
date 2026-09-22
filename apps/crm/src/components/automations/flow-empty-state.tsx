import { Workflow } from 'lucide-react';

/**
 * Un solo componente para los dos vacíos del Builder: inspector sin
 * selección (variant por defecto) y canvas sin ningún nodo — solo llega a
 * pasar si se borran todos, ya que el grafo siempre nace con al menos uno.
 * Explica lo mínimo (cómo agregar el primer nodo), no es un onboarding.
 */
export function FlowEmptyState({ variant = 'inspector' }: { variant?: 'inspector' | 'canvas' }) {
  if (variant === 'canvas') {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ivory text-ash">
          <Workflow className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        </span>
        <p className="text-sm font-bold text-carbon">Sin nodos todavía</p>
        <p className="max-w-xs text-sm text-soft">
          Agrega el primero desde la paleta. El flow arranca en cuanto el disparador de arriba esté configurado.
        </p>
      </div>
    );
  }

  return (
    <p className="text-sm text-soft">
      Selecciona un nodo. Arrastra desde la paleta o pulsa para añadir. Une los conectores para definir el recorrido.
    </p>
  );
}
