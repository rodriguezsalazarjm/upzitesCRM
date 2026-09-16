import type { ChannelSendInput, ChannelSendResult } from '../channels/provider-types';

/**
 * TikTok Business Messaging API: acceso restringido a cuentas de negocio con
 * Advanced Access o verificadas, con restriccion geografica (no disponible
 * para cuentas registradas en UE/Reino Unido/Suiza; India tampoco entra en
 * el DM API) y aprobacion caso por caso. No existe hoy ninguna app de TikTok
 * aprobada para Upzites Flow — implementar el envio real sin esa aprobacion
 * seria inventar un endpoint que no podemos ejercitar ni confirmar.
 *
 * Este cliente existe como CONTRATO (misma forma que Instagram/Messenger)
 * para que el motor de automatizaciones no tenga que distinguir TikTok de
 * los demas canales, pero siempre falla explicitamente hasta que exista una
 * conexion real aprobada. Ver informe: "ACCION MANUAL TIKTOK REQUERIDA".
 */
export async function sendTikTokDirectMessage(_input: ChannelSendInput): Promise<ChannelSendResult> {
  return {
    ok: false,
    error: 'TikTok Business Messaging API requiere aprobación externa (Advanced Access / cuenta verificada). No configurado.',
  };
}
