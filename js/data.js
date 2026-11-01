// Landenlijst + kaartpaden (gegenereerd door scripts/build-data.mjs)
export const CONT = {
  eu: 'Europa', as: 'Azië', af: 'Afrika', na: 'Noord-Amerika', sa: 'Zuid-Amerika', oc: 'Oceanië', an: 'Antarctica',
};

export let list = [];            // [{ c, n, e, k, u, p? }]
export const byCode = new Map();
export let map = null;           // { w, h, scale, ty, paths }

export async function loadData() {
  const [c, m] = await Promise.all([
    fetch('data/countries.json').then(r => r.json()),
    fetch('data/map.json').then(r => r.json()),
  ]);
  list = c; map = m;
  byCode.clear();
  for (const x of list) byCode.set(x.c, x);
}

export const nameOf = c => byCode.get(c)?.n || c;
export const flag = (c, cls = '') =>
  `<img class="flag ${cls}" src="assets/flags/${String(c).toLowerCase()}.svg" alt="" loading="lazy" width="32" height="24">`;

/** Normaliseer tekst voor zoeken (zonder accenten, kleine letters). */
export const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function searchCountries(q, limit = 40) {
  const n = norm(q.trim());
  if (!n) return list.slice(0, limit);
  return list.filter(c => norm(c.n).includes(n) || norm(c.e).includes(n) || c.c.toLowerCase() === n).slice(0, limit);
}

/** Statistieken voor Paspoort en Kaart. */
export function statsFor(state) {
  const visited = Object.entries(state.countries).filter(([, v]) => v.s === 'v').map(([c]) => c).filter(c => byCode.has(c));
  const un = visited.filter(c => byCode.get(c).u);
  const totalUN = list.filter(c => c.u).length;
  const cont = {};
  for (const k of Object.keys(CONT)) {
    const total = list.filter(c => c.u && c.k === k).length;
    const got = un.filter(c => byCode.get(c).k === k).length;
    cont[k] = { total, got, pct: total ? Math.round((got / total) * 100) : 0 };
  }
  return { visited, un, totalUN, cont, pct: Math.round((un.length / totalUN) * 100) };
}
