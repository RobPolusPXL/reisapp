// Eén bron van waarheid: de volledige app-state, lokaal bewaard (localStorage).
// Sync (Firebase) hangt zich via onWrite() aan en schrijft remote data terug met applyRemote().
const KEY = 'reisapp.v1';

export const newId = () =>
  (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

const blank = () => ({
  v: 1,
  updatedAt: 0,
  countries: {},                       // { BE: { s: 'v' | 'w', y?: 2019 } }
  places: { cities: [], regions: [], airports: [] },
  trips: [],
  travelers: [],
  credits: {},                         // { coasterId: { date?, rides, score? } }                       // namen die je bij vluchten kunt kiezen
  settings: { theme: 'groen', mode: 'system' },
});

/** Dubbel ingelezen vluchten (zelfde nummer, datum en route, bv. één boarding pass per reiziger) samenvoegen tot één vlucht met alle reizigers. */
export function mergeDuplicateFlights(items = []) {
  const key = i => i.type === 'flight' && i.f?.number && i.date ? [i.date, i.f.number.replace(/\s+/g, '').toUpperCase(), i.f.from, i.f.to].join('|') : null;
  const first = new Map(), out = [];
  for (const it of items) {
    const k = key(it), keep = k && first.get(k);
    if (!keep) { if (k) first.set(k, it); out.push(it); continue; }
    const pk = x => (x.name || '').trim().toLowerCase() || 'seat:' + (x.seat || '');
    const pax = [...(keep.f.pax || [])];
    for (const x of it.f.pax || []) {
      const j = pax.findIndex(y => pk(y) === pk(x));
      if (j < 0) pax.push(x); else pax[j] = { ...x, ...pax[j], seat: pax[j].seat || x.seat, cls: pax[j].cls || x.cls };
    }
    keep.f = { ...it.f, ...Object.fromEntries(Object.entries(keep.f).filter(([, v]) => v !== '' && v != null)), pax };
    for (const k2 of ['note', 'score']) if (!keep[k2] && it[k2]) keep[k2] = it[k2];
  }
  return out;
}

function normalize(s = {}) {
  const b = blank();
  return {
    ...b, ...s,
    countries: s.countries || {},
    places: { ...b.places, ...(s.places || {}) },
    trips: (s.trips || []).map(t => t.items?.length ? { ...t, items: mergeDuplicateFlights(t.items) } : t),
    travelers: s.travelers || [],
    credits: s.credits || {},
    settings: { ...b.settings, ...(s.settings || {}) },
  };
}

let state;
try { state = normalize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { state = blank(); }

const listeners = new Set();
const writeHooks = new Set();

export const get = () => state;
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const onWrite = fn => { writeHooks.add(fn); };

function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* opslag kan geweigerd worden */ } }
const emit = () => listeners.forEach(f => f());

/** Wijzig de state via een mutatiefunctie; bewaart, meldt views en sync. */
export function update(fn) {
  fn(state);
  state.updatedAt = Date.now();
  persist(); emit();
  writeHooks.forEach(f => f(state));
}

/** Remote (Firestore) is nieuwer: overschrijf lokaal zonder terug te schrijven. */
export function applyRemote(remote) {
  state = normalize(remote);
  persist(); emit();
}

/** Volledige vervanging (import); wordt wel gesynchroniseerd. */
export function replaceAll(s) {
  state = normalize(s);
  state.updatedAt = Date.now();
  persist(); emit();
  writeHooks.forEach(f => f(state));
}

export const getTrip = id => state.trips.find(t => t.id === id);

/** Zet land op bezocht/wil-ik-zien/niets. */
export function setCountry(code, s, extra = {}) {
  update(st => {
    if (!s) delete st.countries[code];
    else st.countries[code] = { ...(st.countries[code] || {}), ...extra, s };
  });
}
