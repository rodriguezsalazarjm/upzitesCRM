# Privacidad y consentimiento — qué hace el sistema

> **Esto no es un documento legal.** Es la descripción factual de qué datos trata
> el CRM, cómo pide consentimiento y qué garantías da técnicamente. Sirve como
> insumo para que un abogado redacte la política de privacidad y los términos:
> no los reemplaza, y publicarlo como si lo fuera sería un error.
>
> **Tarea pendiente del propietario (T24):** revisión legal y publicación de la
> política, los términos y el aviso de consentimiento antes de la beta pública.

---

## Qué datos trata

| Dato | De dónde viene | Para qué |
|---|---|---|
| Nombre, teléfono, email | Formulario web, WhatsApp, importación CSV | Identificar y contactar |
| Mensajes de WhatsApp | El propio contacto | Atender y responder |
| Historial de compras y cotizaciones | Actividad en el CRM | Vender y dar seguimiento |
| Score y temperatura | Calculados por el CRM | Priorizar la atención |
| Aperturas y clics de email | Proveedor de email | Medir interés |
| Consumo de IA | Uso del producto | Facturar y limitar |

**No se tratan datos sensibles** en el sentido de la normativa: ni salud, ni
origen, ni afiliación, ni datos financieros del titular. Los pagos los procesa
Mercado Pago o Shopify; el CRM guarda el identificador del pago y el monto,
nunca el medio de pago.

---

## Cómo se pide el consentimiento

El consentimiento es **por canal e independiente**: WhatsApp, email y publicidad
se otorgan por separado. La política implementada es **opt-in explícito**: la
ausencia de registro NO habilita el envío.

De cada consentimiento se guarda:

- el canal,
- el estado (`GRANTED`, `REVOKED`, `SUPPRESSED`),
- la fuente (qué formulario, qué conversación),
- la evidencia (el contenido del formulario o del mensaje),
- la fecha de otorgamiento y la de revocación.

### Qué NO se considera consentimiento

- Que el contacto haya escrito alguna vez (eso habilita responderle, no hacerle
  marketing).
- Que haya comprado (un mensaje operativo de una compra no se reutiliza como
  permiso promocional).
- Una importación de CSV.

---

## Cómo se revoca

Tres caminos, todos con el mismo efecto:

1. **Decirlo por WhatsApp.** Una frase inequívoca —"no me escriban", "salir",
   "cancelar"— es detectada y suprime el canal.
2. **El enlace de baja del email.** Obligatorio en todo email comercial. La
   baja no se ejecuta al abrir el enlace, solo al confirmar: los clientes de
   correo siguen enlaces para escanearlos.
3. **Manualmente**, desde el CRM.

Revocar hace cuatro cosas de forma atómica:

- marca el consentimiento como `REVOKED`,
- agrega la identidad a la **lista de supresión**,
- cancela las acciones programadas pendientes,
- saca al contacto de los journeys que escriben por ese canal.

### La supresión sobrevive a todo

La lista de supresión guarda la **identidad normalizada** (el email en
minúsculas, el teléfono en E.164), no el id del contacto. Eso significa que
sobrevive a que el contacto se borre y a que se vuelva a importar por CSV.
Reimportar a alguien suprimido **no** le devuelve el consentimiento: hay una
prueba automatizada que lo verifica en cada corrida.

---

## Límites de contacto

Aunque haya consentimiento, el sistema no escribe cuando quiere:

- **Ventana de silencio** por defecto de 20:30 a 09:00, en la zona horaria del
  negocio. Lo que cae dentro se reprograma, no se descarta.
- **Topes de frecuencia**: 1 WhatsApp promocional al día y 3 emails a la semana
  por contacto, configurables.
- **No se mezclan canales**: nada de WhatsApp y email promocional el mismo día,
  salvo que el negocio lo habilite a propósito.

Los mensajes operativos de una compra están exentos de los topes y del horario.
Confirmarle a alguien que su pedido salió no es marketing.

---

## Rebotes y quejas

Un rebote **permanente** o una queja de spam suprimen la dirección
automáticamente. Un rebote transitorio no. La diferencia importa: seguir
escribiendo a un buzón que no existe destruye la reputación de envío de todos
los clientes del proveedor.

---

## Retención

| Dato | Cuánto se conserva |
|---|---|
| Contactos, conversaciones, pedidos | Mientras el workspace exista |
| Entradas de supresión | **Indefinidamente**, a propósito |
| Trabajos de la cola terminados | 7 días |
| Ventanas de rate limiting | 24 horas |
| Registros de auditoría | Mientras el workspace exista |

Borrar un workspace borra en cascada todos sus datos. La lista de supresión se
va con él, que es correcto: es del negocio, no de la plataforma.

> **Pendiente:** no hay un flujo de "borrar mis datos" para el titular ni
> exportación por contacto. Es un requisito de la normativa chilena de datos
> personales vigente desde 2026 y hay que resolverlo antes de la beta pública.

---

## Quién ve qué

- Cada workspace ve **solo** sus datos. El aislamiento se prueba en cada corrida
  de la suite crítica sobre contactos, conversaciones, pedidos, cotizaciones,
  agentes y segmentos.
- Los tokens de integración se guardan cifrados con AES-256-GCM y una clave que
  vive fuera de la base.
- Los enlaces públicos (PDF de cotización, entrega digital, baja de email)
  guardan solo el **hash** del token.

---

## Qué falta para poder publicar

| Pendiente | Quién |
|---|---|
| Redacción legal de la política y los términos | Abogado (T24) |
| Flujo de borrado y exportación por titular | Desarrollo |
| Designar responsable de datos y canal de contacto | Propietario |
| Acuerdos de encargado con Meta, Resend, Mercado Pago y OpenAI | Propietario |
