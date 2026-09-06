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
      updated="junio de 2026"
      intro="En UPZITES respetamos la privacidad de las personas que visitan nuestro sitio web, completan formularios o se comunican con nosotros mediante redes sociales, correo electrónico, WhatsApp u otros canales."
      sections={[
        {
          heading: "Información que recopilamos",
          body: (
            <p>
              Podemos recopilar información como nombre, correo electrónico,
              número de teléfono, empresa, rubro, necesidades de proyecto,
              presupuesto estimado y cualquier información que la persona entregue
              voluntariamente mediante formularios, mensajes o solicitudes de
              contacto.
            </p>
          ),
        },
        {
          heading: "Para qué usamos la información",
          body: (
            <>
              <p>Usamos estos datos para:</p>
              <ul>
                <li>Responder solicitudes de información, cotización o diagnóstico.</li>
                <li>
                  Contactar a potenciales clientes sobre servicios de branding,
                  diseño web, ecommerce, automatización, marketing u otras
                  soluciones digitales.
                </li>
                <li>Preparar propuestas comerciales y orientar proyectos.</li>
                <li>Mejorar nuestros servicios, procesos y comunicación.</li>
                <li>
                  Enviar información comercial relacionada con UPZITES cuando
                  exista autorización o una relación previa.
                </li>
              </ul>
            </>
          ),
        },
        {
          heading: "Protección y tratamiento de datos",
          body: (
            <>
              <p>
                UPZITES no vende, arrienda ni comparte datos personales con
                terceros para fines comerciales ajenos a nuestros servicios.
              </p>
              <p>
                La información puede ser tratada mediante herramientas
                tecnológicas utilizadas para operar nuestro negocio, gestionar
                formularios, comunicaciones, CRM, analítica o campañas
                publicitarias, siempre bajo medidas razonables de seguridad.
              </p>
            </>
          ),
        },
        {
          heading: "Formularios de Meta",
          body: (
            <p>
              Cuando una persona completa un formulario instantáneo de Facebook o
              Instagram, sus datos pueden ser recopilados mediante las
              herramientas de Meta y enviados a UPZITES para responder su
              solicitud. Meta también puede tratar información conforme a sus
              propias políticas de privacidad.
            </p>
          ),
        },
        {
          heading: "Derechos de las personas",
          body: (
            <p>
              Puedes solicitar acceso, corrección, actualización o eliminación de
              tus datos personales escribiendo a{" "}
              <a href="mailto:contacto@upzites.com">contacto@upzites.com</a>.
            </p>
          ),
        },
        {
          heading: "Cambios a esta política",
          body: (
            <p>
              UPZITES puede actualizar esta Política de Privacidad cuando sea
              necesario. La versión vigente estará siempre disponible en esta
              página.
            </p>
          ),
        },
      ]}
    />
  );
}
