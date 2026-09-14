import Image from 'next/image';
import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Image
          src="/icons/upzites-192.png"
          alt="Upzites"
          width={72}
          height={72}
          className="mx-auto rounded-2xl"
        />
        <h1 className="mt-5 text-xl font-bold text-slate-900">Sin conexión</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Revisa tu conexión e inténtalo nuevamente. El CRM no enviará mensajes ni guardará cambios
          mientras estés sin internet.
        </p>
        <Link
          href="/inbox"
          className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Intentar nuevamente
        </Link>
      </section>
    </main>
  );
}
