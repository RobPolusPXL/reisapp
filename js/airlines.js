// Maatschappijen (OpenFlights): [IATA-code, naam, land]
import { norm } from './data.js';
import { esc } from './ui.js';

let db = null, loading = null;
const byCode = new Map();

export function loadAirlines() {
  loading ||= fetch('data/airlines.json').then(r => r.json()).then(rows => {
    db = rows.map(([code, name, country]) => ({ code, name, country, k: norm(`${code} ${name}`) }));
    for (const a of db) byCode.set(a.code, a);
    return db;
  }).catch(() => { loading = null; return []; });
  return loading;
}

export const airlineByCode = code => byCode.get(String(code || '').trim().toUpperCase()) || null;
/** Zoekt op code (KL) of op naam (KLM Royal Dutch Airlines). */
export const airlineByName = name => (db || []).find(a => norm(a.name) === norm(String(name || '').trim())) || null;

export function searchAirlines(q, limit = 8) {
  const n = norm(q.trim());
  if (!db || !n) return [];
  const score = a => {
    const code = a.code.toLowerCase(), name = norm(a.name);
    if (code === n) return 0;
    if (name.startsWith(n)) return 1;
    if (name.split(/[\s-]+/).some(w => w.startsWith(n))) return 2;
    if (code.startsWith(n)) return 3;
    if (a.k.includes(n)) return 4;
    return 9;
  };
  return db.map(a => [score(a), a]).filter(([s]) => s < 9)
    .sort((x, y) => x[0] - y[0] || x[1].name.length - y[1].name.length || x[1].name.localeCompare(y[1].name)).slice(0, limit).map(([, a]) => a);
}

export function attachAirlineSearch(input, onPick) {
  const box = document.createElement('div');
  box.className = 'ap-results';
  box.setAttribute('role', 'listbox');
  box.hidden = true;
  (input.closest('.pair') || input).insertAdjacentElement('afterend', box);
  input.setAttribute('autocomplete', 'off');
  const close = () => { box.hidden = true; box.innerHTML = ''; };
  const show = async () => {
    await loadAirlines();
    const res = searchAirlines(input.value);
    if (!res.length || document.activeElement !== input) return close();
    box.innerHTML = res.map(a => `<button type="button" class="ap-row" role="option" data-code="${esc(a.code)}"><span class="ap-code">${esc(a.code)}</span><span class="ap-name"><b>${esc(a.name)}</b><small>${esc(a.country || '')}</small></span></button>`).join('');
    box.hidden = false;
  };
  input.addEventListener('input', show);
  input.addEventListener('focus', show);
  input.addEventListener('blur', () => setTimeout(close, 150));
  box.addEventListener('pointerdown', e => e.preventDefault());
  box.addEventListener('click', e => {
    const row = e.target.closest('[data-code]');
    if (!row) return;
    const a = airlineByCode(row.dataset.code);
    if (a) { input.value = a.name; onPick?.(a); }
    close();
  });
}
