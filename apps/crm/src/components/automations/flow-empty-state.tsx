/** Estado vacío del inspector: ningún nodo seleccionado todavía. */
export function FlowEmptyState() {
  return (
    <p className="text-sm text-soft">
      Selecciona un nodo. Arrastra desde la paleta o pulsa para añadir. Une los conectores para definir el recorrido.
    </p>
  );
}
