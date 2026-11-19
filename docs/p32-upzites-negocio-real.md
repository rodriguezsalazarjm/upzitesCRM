# P32 — UPZITES como negocio real en Flow

Ensayado de punta a punta en crm_pruebas (`apps/crm/scripts/visual/p32-upzites-hito.ts`).
Falta hacerlo en producción con un lead real: el código de P8–P32 aún no está en producción (prod = `ddbe857`, migraciones pendientes; ver P35).

## Requisito previo

- Producción con la cadena de ramas hasta P32 desplegada y sus migraciones aplicadas, incluidas `20261128120000_payment_incidents` y `20261129120000_form_creates_opportunity`.
- Tu cuenta con `platformRole = SUPER_ADMIN`.

## Pasos (todo desde la UI)

1. **Platform Admin → Nuevo cliente.**
   - Nombre "UPZITES", plan SCALE, origen COMP.
   - Marcar "negocio interno" y "yo como OWNER", tipo de negocio SERVICES.
   - Resultado: el workspace queda fuera de las métricas SaaS, con el pipeline, el formulario principal y las automatizaciones por defecto.
2. **Puesta en marcha (`/onboarding`).** Perfil, servicios, horario, moneda CLP.
3. **Configuración → Conexión con mi sitio web.**
   - Activar "Abrir una oportunidad por cada consulta".
   - Copiar el **Id del formulario**.
4. **Vercel, proyecto de la web (apps/web)**, variables de Production:
   - `CRM_CAPTURE_FORM_PUBLIC_ID` = el id del paso 3.
   - `NEXT_PUBLIC_CRM_BASE_URL` = URL pública del CRM, sin `/` final.
   - Redeploy de la web.

   Sin estas variables, el formulario de upzites.com solo envía el email: hoy los leads no llegan a Flow.
5. **Pipeline:** revisar los nombres de las etapas (Nuevo → Calificado → Propuesta → Negociación → Ganado/Perdido).
6. **Cotizaciones → Studio:** logo, datos de la empresa, plantilla y catálogo de servicios (web, branding, landing express).
7. **Automatizaciones:** confirmar que "Tarea al llegar un lead nuevo" y "Seguimiento a las 2 horas" estén activas.
8. **IA:** conocimiento (servicios, precios, preguntas frecuentes) y publicar el agente.
9. **Inbox / WhatsApp:** conectar el número. Esto está bloqueado por Meta (Tech Provider) y no es requisito del hito.

## Verificación del hito (lead real)

1. Enviar una consulta real desde https://www.upzites.com/contacto, o esperar la primera de un cliente.
2. Comprobar que aparece:
   - en **Leads y clientes**, con su UTM;
   - en **Pipeline**, en la etapa Nuevo, con el título "<empresa> · consulta web";
   - en **Actividades**, como tarea "Contactar lead nuevo".
3. Avanzar la oportunidad a Calificado y luego a Propuesta.
4. Botón **Cotizar** → enviar el link → el cliente acepta → mover la oportunidad a Ganado.
