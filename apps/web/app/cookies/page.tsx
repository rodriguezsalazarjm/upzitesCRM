import { LegalPage } from "@/components/LegalPage";

export const metadata = {
  title: "Política de cookies — UPZITES",
  description: "Qué cookies usamos en el sitio de UPZITES y cómo gestionarlas.",
};

export default function CookiesPage() {
  return (
    <LegalPage
      eyebrow="Legal · Cookies"
      title="Política de cookies"
      updated="21 de mayo de 2026"
      intro="Usamos cookies para que el sitio funcione, recordar tus preferencias y entender cómo se usa. Aquí te explicamos cuáles y para qué."
      sections={[
        {
          heading: "1. Qué son las cookies",
          body: (
            <p>
              Son pequeños archivos que se guardan en tu dispositivo cuando visitas
              un sitio web. Sirven para recordar información y mejorar tu
              experiencia.
            </p>
          ),
        },
        {
          heading: "2. Tipos que usamos",
          body: (
            <ul>
              <li><strong>Técnicas:</strong> necesarias para que el sitio funcione y recuerde tu elección sobre cookies.</li>
              <li><strong>Analíticas:</strong> nos ayudan a entender de forma agregada cómo se navega el sitio para mejorarlo.</li>
            </ul>
          ),
        },
        {
          heading: "3. Gestión de cookies",
          body: (
            <p>
              Puedes aceptar o rechazar las cookies no esenciales desde el aviso que
              aparece al entrar. También puedes borrarlas o bloquearlas desde la
              configuración de tu navegador en cualquier momento.
            </p>
          ),
        },
        {
          heading: "4. Cambios",
          body: (
            <p>
              Podemos actualizar esta política si cambian las cookies que usamos. La
              versión vigente será siempre la publicada en esta página.
            </p>
          ),
        },
      ]}
    />
  );
}
