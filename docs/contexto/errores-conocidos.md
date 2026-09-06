# Errores conocidos / limitaciones — CRM UPZITES

Registro de riesgos y limitaciones detectados durante el desarrollo, para no re-descubrirlos ni asumir que ya están resueltos.

## 2026-06-30 — Billing Mercado Pago (Fase 1)

**Cobro no es recurrente/automático.** El checkout de Mercado Pago implementado es un pago único (Checkout Pro) que activa 30 días de acceso (`renewsAt`), igual al patrón que ya existía. Cuando se acerca el vencimiento, el usuario debe volver a `/billing` y pagar de nuevo manualmente — no hay cargo automático mensual. Integrar "Preapproval" (suscripción con cargo recurrente) de Mercado Pago queda fuera de esta fase.

**Validación de firma del webhook — verificar empíricamente en sandbox antes de confiar en producción.** El manifest (`id:{dataId};request-id:{requestId};ts:{ts};`) y el uso de `WebhookSignatureValidator.validate()` del SDK oficial se verificaron contra el código fuente real del paquete instalado (`mercadopago@3.1.0`, no solo documentación — dos fuentes de documentación oficial se contradijeron entre sí sobre el formato del manifest). Aun así, **antes de confiar en esto en producción, se debe hacer al menos un pago de prueba real en modo sandbox y confirmar que el webhook llega, la firma valida correctamente, y la suscripción se activa.** Si Mercado Pago cambia su formato de firma (ej. migra a `v2`), el validador del SDK soporta `supportedVersions` para actualizar sin reescribir la lógica de validación.

**`PAST_DUE` sigue sin usarse activamente.** El bloqueo de acceso ocurre por fecha vencida (`getSubscriptionStatus`), no por un estado explícito `PAST_DUE`. El enum existe en el schema pero ningún flujo lo asigna todavía. Aceptable para el MVP de esta fase; si se necesita distinguir "nunca pagó" de "pagó y venció" en reportes, ahí es donde se usaría.

**No hay UI para elegir plan.** El checkout siempre usa el plan `monthly` ($49.000 CLP). Cuando se definan planes por usuario (pendiente, el usuario los definirá), hay que agregar un selector de plan antes del checkout y pasar `planKey` dinámicamente (el backend ya lo soporta vía `checkoutSchema`).

**Rol requerido para gestionar billing.** Se agregó una verificación inline (no un helper reusable) que restringe `POST /api/billing/checkout` a roles `OWNER`/`ADMIN`. Si en el futuro se necesita esta misma verificación en más endpoints, vale la pena extraerla a un helper (`requireRole()`) en `lib/auth.ts` — no se hizo ahora para no agregar abstracción sin un segundo caso de uso real.
