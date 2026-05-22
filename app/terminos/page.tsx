import { LegalPage } from "@/components/LegalPage";

export const metadata = {
  title: "Términos y condiciones — UPZITES",
  description: "Condiciones de uso del sitio web de UPZITES.",
};

export default function TerminosPage() {
  return (
    <LegalPage
      eyebrow="Legal · Términos"
      title="Términos y condiciones"
      updated="21 de mayo de 2026"
      intro="Estas condiciones regulan el uso del sitio web de UPZITES. Al navegar por él aceptas los términos descritos a continuación."
      sections={[
        {
          heading: "1. Uso del sitio",
          body: (
            <p>
              Este sitio tiene fines informativos y de contacto comercial. Te
              comprometes a usarlo de forma lícita y a no realizar acciones que
              dañen su funcionamiento o seguridad.
            </p>
          ),
        },
        {
          heading: "2. Propiedad intelectual",
          body: (
            <p>
              Los textos, el diseño, los logotipos y el contenido del sitio son
              propiedad de UPZITES o de sus clientes y están protegidos. Los
              proyectos mostrados se presentan con fines de portafolio. No puedes
              reproducirlos sin autorización.
            </p>
          ),
        },
        {
          heading: "3. Servicios",
          body: (
            <p>
              La información sobre servicios es orientativa y no constituye una
              oferta vinculante. Cada proyecto se formaliza mediante una propuesta y
              acuerdo específicos.
            </p>
          ),
        },
        {
          heading: "4. Enlaces externos",
          body: (
            <p>
              El sitio puede incluir enlaces a páginas de terceros. No nos hacemos
              responsables del contenido ni de las prácticas de esos sitios.
            </p>
          ),
        },
        {
          heading: "5. Responsabilidad",
          body: (
            <p>
              Trabajamos para mantener el sitio actualizado y disponible, pero no
              garantizamos la ausencia de errores o interrupciones. No nos hacemos
              responsables de daños derivados del uso del sitio.
            </p>
          ),
        },
        {
          heading: "6. Cambios",
          body: (
            <p>
              Podemos actualizar estos términos en cualquier momento. La versión
              vigente será siempre la publicada en esta página.
            </p>
          ),
        },
      ]}
    />
  );
}
