import { NextResponse } from 'next/server';
import { isInternalRequest } from '@/lib/internal-auth';
import { processDueEnrollments, scanJourneyEntries } from '@/lib/marketing/journeys';

export const dynamic = 'force-dynamic';

/**
 * Latido de los journeys: inscribe a quien califique y avanza lo vencido.
 *
 * Existe aparte de /run-jobs para poder mover la recuperacion sin tocar el
 * resto de la cola, y para que el cron pueda darle su propia frecuencia.
 *
 * `?scan=0` salta el barrido de entradas, que es la parte cara.
 */
export async function POST(request: Request) {
  if (!isInternalRequest(request)) {
    return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
  }

  const scan = new URL(request.url).searchParams.get('scan') !== '0';
  const entries = scan ? await scanJourneyEntries(200) : { journeys: 0, enrolled: 0 };
  const advanced = await processDueEnrollments(100);

  return NextResponse.json({
    data: {
      enrolled: entries.enrolled,
      journeysScanned: entries.journeys,
      processed: advanced.processed,
      outcomes: advanced.results.reduce<Record<string, number>>((acc, result) => {
        acc[result.outcome] = (acc[result.outcome] ?? 0) + 1;
        return acc;
      }, {}),
    },
  });
}
