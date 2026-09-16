/** The environment flag alone is insufficient: the preload installs the network guard. */
export function isLocalDemo() {
  return process.env.LOCAL_VISUAL_TEST === '1' && (globalThis as Record<symbol, unknown>)[Symbol.for('upzites.visual.guard')] === true;
}
