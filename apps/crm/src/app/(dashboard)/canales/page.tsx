import { redirect } from 'next/navigation';

/** Canales: hoy el unico administrado aqui es WhatsApp (Punto 8). */
export default function ChannelsPage() {
  redirect('/canales/whatsapp');
}
