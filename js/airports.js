// Luchthavendatabase (OurAirports, publiek domein): [code, naam, stad, land, breedtegraad, lengtegraad]
import { flag, nameOf, norm } from './data.js';
import { esc } from './ui.js';

let db = null, loading = null;
const byCode = new Map();

export function loadAirports() {
  loading ||= fetch('data/airports.json').then(r => r.json()).then(rows => {
    db = rows.map(([code, name, city, c, lat, lon]) => ({ code, name, city, c, lat, lon, k: norm(`${code} ${name} ${city}`) }));
    for (const a of db) byCode.set(a.code, a);
    return db;
  }).catch(() => { loading = null; return []; });
  return loading;
}

export const airportByCode = code => byCode.get(String(code || '').trim().toUpperCase()) || null;

export function searchAirports(q, limit = 8) {
  const n = norm(q.trim());
  if (!db || !n) return [];
  const score = a => {
    const code = a.code.toLowerCase(), city = norm(a.city), name = norm(a.name);
    if (code === n) return 0;
    if (code.startsWith(n)) return 1;
    if (city.startsWith(n)) return 2;
    if (name.startsWith(n)) return 3;
    if (a.k.includes(n)) return 4;
    return 9;
  };
  return db.map(a => [score(a), a]).filter(([s]) => s < 9)
    .sort((x, y) => x[0] - y[0] || x[1].name.localeCompare(y[1].name)).slice(0, limit).map(([, a]) => a);
}

/** Koppelt zoeksuggesties aan een invoerveld. onPick(airport) wordt aangeroepen bij een keuze. */
export function attachAirportSearch(input, onPick) {
  const box = document.createElement('div');
  box.className = 'ap-results';
  box.setAttribute('role', 'listbox');
  box.hidden = true;
  (input.closest('.pair') || input).insertAdjacentElement('afterend', box);
  input.setAttribute('autocomplete', 'off');
  const close = () => { box.hidden = true; box.innerHTML = ''; };
  const show = async () => {
    await loadAirports();
    const res = searchAirports(input.value);
    if (!res.length || document.activeElement !== input) return close();
    box.innerHTML = res.map(a => `<button type="button" class="ap-row" role="option" data-code="${esc(a.code)}">${flag(a.c)}<span class="ap-code">${esc(a.code)}</span><span class="ap-name"><b>${esc(a.name)}</b><small>${esc(a.city ? a.city + ', ' : '')}${esc(nameOf(a.c))}</small></span></button>`).join('');
    box.hidden = false;
  };
  input.addEventListener('input', show);
  input.addEventListener('focus', show);
  input.addEventListener('blur', () => setTimeout(close, 150));
  box.addEventListener('pointerdown', e => e.preventDefault());
  box.addEventListener('click', e => {
    const row = e.target.closest('[data-code]');
    if (!row) return;
    const a = airportByCode(row.dataset.code);
    if (a) { input.value = a.code; onPick?.(a); }
    close();
  });
}

/** Zet een luchthaven in Mijn luchthavens (alleen als hij er nog niet staat). */
export function ensureMyAirport(st, a, newId) {
  if (!a || st.places.airports.some(p => (p.code || '').toUpperCase() === a.code)) return;
  st.places.airports.push({ id: newId(), code: a.code, name: a.name, c: a.c });
}
