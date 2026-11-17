/**
 * P24: asistente del feed. Analiza la secuencia de UNA cuenta (lo publicado y lo
 * planificado, en orden de publicación) y propone recomendaciones. Es puro y
 * determinista: no guarda nada; reordenar solo ocurre si el usuario acepta
 * (y entonces se usa el mismo "Guardar plan" de P21, que reparte las mismas fechas).
 *
 * shortcut: pilares y tipo visual se infieren por palabras clave y etiquetas de la
 * pieza (no hay visión ni etiquetado manual); si se agrega un campo "pilar" al
 * post, debe mandar sobre la inferencia.
 */

export type AdvisorPost = {
  id: string;
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';
  scheduledAt: string | Date | null;
  publishedAt: string | Date | null;
  caption: string;
  hashtags: string[];
  mediaType: 'IMAGE' | 'REEL';
  mediaUrl: string | null;
  assetTags?: string[];
};

export const PILLARS = {
  promo: 'Promoción',
  prueba_social: 'Prueba social',
  educativo: 'Educativo',
  comunidad: 'Comunidad',
  inspiracional: 'Inspiracional',
} as const;
export type Pillar = keyof typeof PILLARS;
export type VisualKind = 'video' | 'diseño' | 'foto';

// Orden = prioridad: una promo con testimonio cuenta como promo.
const PILLAR_RULES: [Pillar, RegExp][] = [
  ['promo', /(oferta|descuento|promo|c[oó]mpra|precio|\$|cup[oó]n|cupos|link en (la )?bio|lanzamiento|% ?off|rebaja|preventa|ll[eé]vatelo)/i],
  ['prueba_social', /(testimonio|rese[ñn]a|opini[oó]n|resultados?|caso real|clientes? (feliz|nos)|nos escribi[oó]|gracias a|estrellas|⭐)/i],
  // "Cuéntanos cómo…" es comunidad: va antes, y "cómo" solo enseña al inicio del texto.
  ['comunidad', /(coment|cu[eé]ntanos|pregunta|encuesta|etiqueta a|comparte|t[uú] qu[eé])/i],
  ['educativo', /(\btips?\b|consejo|aprend|^c[oó]mo |gu[ií]a|paso a paso|sab[ií]as|errores|tutorial|claves|mitos?)/i],
  ['inspiracional', /(frase|reflexi[oó]n|inspira|motivaci[oó]n|vers[ií]culo|recuerda que|devocional)/i],
];

export function classifyPillar(post: Pick<AdvisorPost, 'caption' | 'hashtags'>): Pillar | null {
  const text = `${post.caption} ${post.hashtags.join(' ')}`;
  return PILLAR_RULES.find(([, re]) => re.test(text))?.[0] ?? null;
}

export function visualKind(post: Pick<AdvisorPost, 'mediaType' | 'assetTags'>): VisualKind {
  if (post.mediaType === 'REEL') return 'video';
  return (post.assetTags ?? []).some((t) => /dise[ñn]o|gr[aá]fic|creativo|carrusel|plantilla/i.test(t)) ? 'diseño' : 'foto';
}

export type AdvisorAction =
  | { type: 'reorder'; order: string[] }
  | { type: 'create'; pillar: Pillar; mediaType: 'IMAGE' | 'REEL'; brief: string; scheduledAt: string | null }
  | { type: 'edit'; postId: string };

export type Recommendation = {
  /** Estable mientras el problema sea el mismo: sirve para "Ignorar". */
  id: string;
  kind: 'promo_streak' | 'missing_educational' | 'missing_social_proof' | 'alternation' | 'pillar_balance' | 'visual_order' | 'next_piece';
  severity: 'alta' | 'media' | 'info';
  title: string;
  detail: string;
  postIds: string[];
  action: AdvisorAction | null;
};

const ts = (v: string | Date | null) => (v ? new Date(v).getTime() : 0);
const WINDOW = 9; // las 3 primeras filas del perfil
const plannable = (p: AdvisorPost) => (p.status === 'DRAFT' || p.status === 'SCHEDULED') && Boolean(p.scheduledAt);

/** Orden de publicación: lo publicado y después lo planificado, del más antiguo al más nuevo. */
export function publicationSequence(posts: AdvisorPost[]) {
  const published = posts.filter((p) => p.status === 'PUBLISHED').sort((a, b) => ts(a.publishedAt) - ts(b.publishedAt));
  const planned = posts.filter(plannable).sort((a, b) => ts(a.scheduledAt) - ts(b.scheduledAt) || a.id.localeCompare(b.id));
  return [...published, ...planned];
}

/** Rachas de 3 o más seguidas que cumplen `same` e incluyen algo movible. */
function runs(seq: AdvisorPost[], key: (p: AdvisorPost) => string | null) {
  const out: AdvisorPost[][] = [];
  let current: AdvisorPost[] = [];
  for (const post of seq) {
    if (current.length && key(post) !== null && key(post) === key(current[0])) current.push(post);
    else {
      if (current.length >= 3) out.push(current);
      current = key(post) === null ? [] : [post];
    }
  }
  if (current.length >= 3) out.push(current);
  return out.filter((run) => run.some(plannable));
}

/**
 * Propone cortar la racha intercambiando la fecha de una pieza planificada del
 * medio con la planificada más cercana que no comparte la característica.
 * Devuelve el orden de grilla (más tardía primero) o null si no hay con qué.
 */
function breakRun(seq: AdvisorPost[], run: AdvisorPost[], key: (p: AdvisorPost) => string | null) {
  const planned = seq.filter(plannable);
  const movable = run.slice(1, -1).find(plannable) ?? run.find(plannable)!;
  const from = planned.indexOf(movable);
  const candidates = planned
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => key(p) !== key(run[0]) && !run.includes(p))
    .sort((a, b) => Math.abs(a.i - from) - Math.abs(b.i - from));
  if (!candidates.length) return null;
  const next = [...planned];
  [next[from], next[candidates[0].i]] = [next[candidates[0].i], next[from]];
  return next.map((p) => p.id).reverse();
}

export function analyzeFeed(posts: AdvisorPost[], now = new Date()): Recommendation[] {
  const seq = publicationSequence(posts);
  const planned = seq.filter(plannable);
  if (!seq.length) return [];
  const recs: Recommendation[] = [];
  const recent = seq.slice(-WINDOW);
  const pillarOf = (p: AdvisorPost) => classifyPillar(p);
  const lastPlanned = planned.at(-1)?.scheduledAt;
  const nextSlot = new Date(Math.max(now.getTime(), ts(lastPlanned ?? null)) + 86_400_000);
  nextSlot.setHours(11, 0, 0, 0);
  const create = (pillar: Pillar, mediaType: 'IMAGE' | 'REEL', brief: string): AdvisorAction => ({ type: 'create', pillar, mediaType, brief, scheduledAt: nextSlot.toISOString() });

  for (const run of runs(seq, (p) => (pillarOf(p) === 'promo' ? 'promo' : null))) {
    const order = breakRun(seq, run, (p) => (pillarOf(p) === 'promo' ? 'promo' : 'otro'));
    recs.push({
      id: `promo_streak:${run.map((p) => p.id).join(',')}`,
      kind: 'promo_streak',
      severity: 'alta',
      title: `${run.length} promociones seguidas`,
      detail: order ? 'Intercalar una pieza que no vende descansa al público. Aceptar intercambia las fechas de dos piezas planificadas.' : 'No hay otra pieza planificada para intercalar: crea una que aporte valor.',
      postIds: run.map((p) => p.id),
      action: order ? { type: 'reorder', order } : create('educativo', 'IMAGE', 'Pieza educativa para cortar una racha de promociones'),
    });
  }

  if (recent.length >= 4 && !recent.some((p) => pillarOf(p) === 'educativo')) {
    recs.push({ id: `missing_educational:${recent.length}`, kind: 'missing_educational', severity: 'media', title: 'Falta contenido educativo', detail: `Ninguna de las últimas ${recent.length} piezas enseña algo. Un tip o una guía corta genera guardados.`, postIds: [], action: create('educativo', 'IMAGE', 'Un tip o guía corta útil para nuestro público') });
  }
  if (recent.length >= 4 && !recent.some((p) => pillarOf(p) === 'prueba_social')) {
    recs.push({ id: `missing_social_proof:${recent.length}`, kind: 'missing_social_proof', severity: 'media', title: 'Falta prueba social', detail: 'No hay testimonios, reseñas ni resultados recientes. Muestran que otros ya confiaron.', postIds: [], action: create('prueba_social', 'IMAGE', 'Testimonio o resultado real de un cliente (usar solo datos verdaderos)') });
  }

  for (const run of runs(seq, visualKind)) {
    const kind = visualKind(run[0]);
    const order = breakRun(seq, run, visualKind);
    recs.push({
      id: `alternation:${run.map((p) => p.id).join(',')}`,
      kind: 'alternation',
      severity: 'media',
      title: `${run.length} piezas seguidas de tipo ${kind}`,
      detail: order ? 'Alternar foto, diseño y video hace el perfil más variado. Aceptar intercambia las fechas de dos piezas.' : `Planifica una pieza de otro tipo (${kind === 'video' ? 'foto o diseño' : 'video'}).`,
      postIds: run.map((p) => p.id),
      action: order ? { type: 'reorder', order } : create(pillarOf(run[0]) ?? 'educativo', kind === 'video' ? 'IMAGE' : 'REEL', `Pieza en ${kind === 'video' ? 'imagen' : 'video'} para alternar el feed`),
    });
  }

  const counted = recent.map(pillarOf).filter((p): p is Pillar => p !== null);
  if (counted.length >= 4) {
    const counts = Object.keys(PILLARS).map((p) => ({ p: p as Pillar, n: counted.filter((c) => c === p).length }));
    const top = [...counts].sort((a, b) => b.n - a.n)[0];
    if (top.n / counted.length > 0.5) {
      const least = [...counts].sort((a, b) => a.n - b.n)[0];
      recs.push({ id: `pillar_balance:${top.p}:${top.n}`, kind: 'pillar_balance', severity: 'info', title: `${PILLARS[top.p]} domina el feed`, detail: `${top.n} de ${counted.length} piezas clasificadas son ${PILLARS[top.p].toLowerCase()}. Distribución: ${counts.filter((c) => c.n).map((c) => `${PILLARS[c.p]} ${c.n}`).join(', ')}.`, postIds: [], action: create(least.p, 'IMAGE', `Pieza del pilar ${PILLARS[least.p]}`) });
    }
  }

  for (const post of planned.filter((p) => !p.mediaUrl)) {
    recs.push({ id: `visual_order:${post.id}`, kind: 'visual_order', severity: 'media', title: 'Pieza sin imagen ni video', detail: 'En la grilla quedará como un hueco y no se podrá publicar. Elige una pieza de la biblioteca.', postIds: [post.id], action: { type: 'edit', postId: post.id } });
  }

  const missing = (Object.keys(PILLARS) as Pillar[]).filter((p) => p !== 'promo').sort((a, b) => counted.filter((c) => c === a).length - counted.filter((c) => c === b).length)[0];
  const lastKind = seq.at(-1) ? visualKind(seq.at(-1)!) : 'foto';
  recs.push({ id: `next_piece:${seq.at(-1)?.id}:${missing}`, kind: 'next_piece', severity: 'info', title: `Próxima pieza: ${PILLARS[missing].toLowerCase()} en ${lastKind === 'video' ? 'imagen' : 'video'}`, detail: 'Es el pilar menos usado últimamente y cambia el tipo de la última pieza.', postIds: [], action: create(missing, lastKind === 'video' ? 'IMAGE' : 'REEL', `Pieza del pilar ${PILLARS[missing]}`) });

  const rank = { alta: 0, media: 1, info: 2 };
  return recs.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
