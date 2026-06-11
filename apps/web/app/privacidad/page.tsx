import { LegalPage } from "@/components/LegalPage";

export const metadata = {
  title: "Política de privacidad — UPZITES",
  description: "Cómo UPZITES recoge, usa y protege tus datos personales.",
};

export default function PrivacidadPage() {
  return (
    <LegalPage
      eyebrow="Legal · Privacidad"
      title="Política de privacidad"
      updated="21 de mayo de 2026"
      intro="En UPZITES respetamos tu privacidad. Esta política explica qué datos recogemos, para qué los usamos y qué derechos tienes sobre ellos."
      sections={[
        {
          heading: "1. Quiénes somos",
          body: (
            <p>
              UPZITES es un estudio de diseño y estrategia digital con base en
              Santiago de Chile. Responsable del tratamiento de datos:
              UPZITES — contacto@upzites.com.
            </p>
          ),
        },
        {
          heading: "2. Qué datos recogemos",
          body: (
            <ul>
              <li>Datos que nos envías por formularios o correo: nombre, email, marca o proyecto y el mensaje del brief.</li>
              <li>Datos de navegación y uso del sitio recogidos mediante cookies y herramientas de analítica.</li>
            </ul>
          ),
        },
        {
          heading: "3. Para qué los usamos",
          body: (
            <ul>
              <li>Responder tus consultas y elaborar propuestas de trabajo.</li>
              <li>Enviar nuestra newsletter, solo si te suscribes voluntariamente.</li>
              <li>Mejorar el sitio, su rendimiento y la experiencia de uso.</li>
            </ul>
          ),
        },
        {
          heading: "4. Base legal",
          body: (
            <p>
              Tratamos tus datos sobre la base de tu consentimiento y de nuestro
              interés legítimo en responder solicitudes y operar el sitio.
            </p>
          ),
        },
        {
          heading: "5. Con quién los compartimos",
          body: (
            <p>
              No vendemos tus datos. Solo los compartimos con proveedores que nos
              ayudan a operar (por ejemplo, alojamiento web y analítica), bajo
              acuerdos de confidencialidad.
            </p>
          ),
        },
        {
          heading: "6. Tus derechos",
          body: (
            <p>
              Puedes solicitar acceso, rectificación o eliminación de tus datos, así
              como revocar tu consentimiento, escribiendo a contacto@upzites.com.
            </p>
          ),
        },
        {
          heading: "7. Conservación",
          body: (
            <p>
              Conservamos tus datos solo el tiempo necesario para las finalidades
              descritas o mientras exista una relación contigo.
            </p>
          ),
        },
      ]}
    />
  );
}
