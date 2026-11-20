// P35: Vercel arma cada función con los archivos de su .nft.json. Si falta
// .next/package.json ({"type":"commonjs"}), manda el "type":"module" de apps/crm
// y cada route.js falla con ERR_REQUIRE_ESM. Lo agregamos a todos los traces.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const dist = join(process.cwd(), '.next');
const target = join(dist, 'package.json');
if (!existsSync(target) || !JSON.parse(readFileSync(target, 'utf8')).type) throw new Error('.next/package.json no existe o no declara type');

let patched = 0;
let traces = 0;
for (const entry of readdirSync(join(dist, 'server'), { recursive: true })) {
  if (!entry.endsWith('.nft.json')) continue;
  traces++;
  const file = join(dist, 'server', entry);
  const trace = JSON.parse(readFileSync(file, 'utf8'));
  const rel = relative(dirname(file), target).replace(/\\/g, '/');
  if (trace.files.includes(rel)) continue;
  trace.files.push(rel);
  writeFileSync(file, JSON.stringify(trace));
  patched++;
}
if (traces === 0) throw new Error('No se encontró ningún .nft.json en .next/server');
console.log(`.next/package.json agregado a ${patched} de ${traces} traces`);
