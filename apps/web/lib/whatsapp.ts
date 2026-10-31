// Número único de WhatsApp de UPZITES para toda la web y las landings de
// Soluciones. Cambiarlo acá cambia todos los CTA generados por código.
// Las landings estáticas (app/soluciones/*/design.data.ts y public/soluciones)
// lo llevan escrito en su HTML: si cambia, buscar "wa.me/" y actualizarlas.
export const WA_NUMBER = "56978167863";
export const WA_DISPLAY = "+56 9 7816 7863";

export function waLink(message?: string) {
  const base = `https://wa.me/${WA_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
