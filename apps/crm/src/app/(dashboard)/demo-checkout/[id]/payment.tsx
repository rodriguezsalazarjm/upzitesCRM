'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function DemoPayment({ id }: { id: string }) {
  const router = useRouter(); const [result, setResult] = useState(''); const [busy, setBusy] = useState(false);
  return <><button disabled={busy} className="rounded bg-indigo-600 px-4 py-2 text-white" onClick={async () => { setBusy(true); try { const response = await fetch(`/api/demo-checkout/${id}`, { method: 'POST' }); const data = await response.json(); setResult(response.ok ? `Pago fake procesado. Entregas: ${data.data.delivered ?? 0}` : data.message ?? 'Error'); router.refresh(); } catch { setResult('No se pudo procesar.'); } finally { setBusy(false); } }}>Simular pago aprobado</button><p role="status">{result}</p></>;
}
