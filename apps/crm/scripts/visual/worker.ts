import { prisma } from '../../src/lib/prisma';
import { processOutbox } from '../../src/lib/whatsapp/outbound';
if (!(globalThis as Record<symbol, unknown>)[Symbol.for('upzites.visual.guard')]) throw Error('Arranca mediante visual:worker.');
try {
  for (;;) { await processOutbox(); await new Promise((resolve) => setTimeout(resolve, 1000)); }
} finally { await prisma.$disconnect(); }
