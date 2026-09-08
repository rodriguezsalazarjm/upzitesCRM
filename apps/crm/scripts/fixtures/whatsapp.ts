/**
 * Fixtures de WhatsApp Cloud API.
 *
 * Reproducen la forma real de los payloads de Meta para poder probar el webhook
 * completo sin credenciales. Cuando lleguen las credenciales reales, estas
 * mismas pruebas siguen sirviendo como regresion.
 */
export function inboundTextPayload(input: {
  phoneNumberId: string;
  displayPhoneNumber?: string;
  from: string;
  messageId: string;
  text: string;
  profileName?: string;
  timestamp?: number;
}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID_FIXTURE',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: input.displayPhoneNumber ?? '56900000000',
                phone_number_id: input.phoneNumberId,
              },
              contacts: [
                {
                  profile: { name: input.profileName ?? 'Cliente de Prueba' },
                  wa_id: input.from,
                },
              ],
              messages: [
                {
                  from: input.from,
                  id: input.messageId,
                  timestamp: String(input.timestamp ?? Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: input.text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function statusUpdatePayload(input: {
  phoneNumberId: string;
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp?: number;
  errorCode?: number;
  errorTitle?: string;
}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID_FIXTURE',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '56900000000',
                phone_number_id: input.phoneNumberId,
              },
              statuses: [
                {
                  id: input.messageId,
                  status: input.status,
                  timestamp: String(input.timestamp ?? Math.floor(Date.now() / 1000)),
                  recipient_id: '56911112222',
                  ...(input.errorCode
                    ? { errors: [{ code: input.errorCode, title: input.errorTitle ?? 'Error de envio' }] }
                    : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/** Payload con una forma que el CRM aun no maneja (cambio de calidad del numero). */
export function unsupportedEventPayload(phoneNumberId: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID_FIXTURE',
        changes: [
          {
            field: 'message_template_status_update',
            value: {
              metadata: { phone_number_id: phoneNumberId, display_phone_number: '56900000000' },
              event: 'APPROVED',
              message_template_id: 123,
            },
          },
        ],
      },
    ],
  };
}
