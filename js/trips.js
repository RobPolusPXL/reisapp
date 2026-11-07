// Gedeelde onderdelen voor reizen: vervoer, itemtypes, formulieren
import { get, update, newId } from './store.js';
import { list, byCode, nameOf, flag, searchCountries } from './data.js';
import { loadAirlines, airlineByName, attachAirlineSearch } from './airlines.js';
import { scanBoardingPass } from './boardingpass.js';
import { loadAirports, airportByCode, attachAirportSearch, ensureMyAirport } from './airports.js';
import { esc, ic, openSheet, toast, daysBetween, snorTxt, iconPick, fmtDate } from './ui.js';

export const MODES = {
  plane: ['Vliegtuig', 'plane'], car: ['Auto', 'car'], train: ['Trein', 'train'],
  bus: ['Bus', 'bus'], boat: ['Boot', 'boat'], other: ['Anders', 'dots'],
};
export const TYPES = {
  flight: ['Vlucht', 'plane'], stay: ['Verblijf', 'bed'], food: ['Restaurant', 'fork'], activity: ['Activiteit', 'ticket'],
};
/** Aantal nachten tussen inchecken en uitchecken, of null als dat niet kan. */
export function nightsBetween(a, b) {
  if (!a || !b) return null;
  const n = daysBetween(a, b) - 1;
  return n >= 0 ? n : null;
}
export const nightsLabel = n => `${n} ${n === 1 ? 'nacht' : 'nachten'}`;
export const CLASSES = ['Economy', 'Premium economy', 'Business', 'First'];

export const countryOptions = sel =>
  '<option value="">Kies een land</option>' + list.map(c => `<option value="${c.c}"${c.c === sel ? ' selected' : ''}>${esc(c.n)}</option>`).join('');

/** Landkeuze die eruitziet als een gewone keuzelijst; bovenaan de lijst staat een zoekveld. Een verborgen veld houdt de landcode bij (formulieren lezen het gewoon als `name`). */
export const countryPick = (name, sel, label, id = '') => `<div class="cpick">
  <input type="hidden" name="${name}" value="${esc(sel || '')}">
  <button type="button" class="cp-btn${sel ? '' : ' empty'}"${id ? ` id="${id}"` : ''} aria-label="${esc(label)}" aria-haspopup="listbox"><span>${esc(sel ? nameOf(sel) : 'Kies een land')}</span></button>
  <div class="cp-panel" hidden><input type="search" class="cp-in" placeholder="Zoek een land" aria-label="Zoek een land" autocomplete="off" autocapitalize="words" enterkeyhint="done"><ul class="cp-list"></ul></div></div>`;
/** Zet een landkeuze (verborgen veld + zichtbare naam) op een code. */
export function setCountryPick(form, name, code) {
  const h = form.elements[name]; if (!h) return;
  h.value = code || '';
  const btn = h.closest('.cpick')?.querySelector('.cp-btn');
  if (btn) { btn.querySelector('span').textContent = code ? nameOf(code) : 'Kies een land'; btn.classList.toggle('empty', !code); }
}
/** Koppelt alle landkeuzes binnen `root` (ook later toegevoegde). */
export function bindCountryPick(root) {
  const closeAll = except => root.querySelectorAll('.cp-panel:not([hidden])').forEach(p => { if (p.parentElement !== except) p.hidden = true; });
  const draw = box => {
    const q = box.querySelector('.cp-in').value;
    const cur = box.querySelector('input[type=hidden]').value;
    box.querySelector('.cp-list').innerHTML = searchCountries(q, 300).map(c => `<li><button type="button" data-pick="${c.c}"${c.c === cur ? ' aria-selected="true"' : ''}>${flag(c.c)}<span>${esc(c.n)}</span></button></li>`).join('') || '<li class="empty">Geen landen gevonden.</li>';
  };
  const pick = (box, code) => { setCountryPick(box.closest('form') || root, box.querySelector('input[type=hidden]').name, code); box.querySelector('.cp-panel').hidden = true; };
  root.addEventListener('click', e => {
    const btn = e.target.closest?.('.cp-btn');
    if (btn) {
      const box = btn.parentElement, panel = box.querySelector('.cp-panel');
      closeAll(box);
      panel.hidden = !panel.hidden;
      panel.classList.remove('up');
      if (!panel.hidden) { const inp = panel.querySelector('.cp-in'); inp.value = ''; draw(box); panel.querySelector('[aria-selected]')?.scrollIntoView({ block: 'center' }); const r = panel.getBoundingClientRect(), vh = window.visualViewport?.height || window.innerHeight; if (r.bottom > vh - 8 && btn.getBoundingClientRect().top > r.height + 16) panel.classList.add('up'); inp.focus({ preventScroll: true }); }
      return;
    }
    const it = e.target.closest?.('[data-pick]');
    if (it) { e.stopPropagation(); pick(it.closest('.cpick'), it.dataset.pick); return; }
    if (!e.target.closest?.('.cp-panel')) closeAll(null);
  });
  root.addEventListener('input', e => { if (e.target.classList?.contains('cp-in')) draw(e.target.closest('.cpick')); });
  root.addEventListener('keydown', e => {
    if (!e.target.classList?.contains('cp-in')) return;
    const box = e.target.closest('.cpick');
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const f = box.querySelector('[data-pick]'); if (f) pick(box, f.dataset.pick); }
    if (e.key === 'Escape') { e.stopPropagation(); box.querySelector('.cp-panel').hidden = true; box.querySelector('.cp-btn').focus(); }
  });
}

/** Thuisland: het land waar je het vaakst vertrekt volgens de eerste vlucht van elke reis. */
export function homeCountry(state = get()) {
  const count = {};
  for (const t of state.trips || []) {
    const f = (t.items || []).filter(i => i.type === 'flight' && i.f?.from).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))[0];
    const c = f && airportByCode(f.f.from)?.c;
    if (c) count[c] = (count[c] || 0) + 1;
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}


// Nederlandse namen voor veelvoorkomende luchthavensteden (de bron heeft Engelse namen).
const NL_CITY = {
  Brussels: 'Brussel', Vienna: 'Wenen', Lisbon: 'Lissabon', Prague: 'Praag', Cologne: 'Keulen', Warsaw: 'Warschau', Athens: 'Athene',
  Copenhagen: 'Kopenhagen', Munich: 'München', Geneva: 'Genève', Rome: 'Rome', Venice: 'Venetië', Florence: 'Florence', Naples: 'Napels',
  Seville: 'Sevilla', Zurich: 'Zürich', Moscow: 'Moskou', 'Saint Petersburg': 'Sint-Petersburg', Bucharest: 'Boekarest', Belgrade: 'Belgrado',
  Brasov: 'Brașov', Cairo: 'Caïro', Edinburgh: 'Edinburgh', 'New York': 'New York', Marrakesh: 'Marrakech', Dubrovnik: 'Dubrovnik',
};
const cityNl = c => NL_CITY[c] || c;
const nm = c => esc(nameOf(c));




export function tripStats(state) {
  const countries = new Set();
  let days = 0;
  for (const t of state.trips) {
    t.legs.forEach(l => l.c && countries.add(l.c));
    days += daysBetween(t.start, t.end);
  }
  const conts = new Set([...countries].map(c => byCode.get(c)?.k).filter(Boolean));
  return { trips: state.trips.length, days, countries: countries.size, continents: conts.size, cities: state.places.cities.length };
}

export function confirmSheet(text, yesLabel, onYes) {
  const sh = openSheet(`<h2>${esc(text)}</h2><div class="pair"><button type="button" class="btn" data-close>Annuleren</button><button type="button" class="btn primary" data-yes>${esc(yesLabel)}</button></div>`, { title: text });
  sh.el.querySelector('[data-yes]').addEventListener('click', () => { sh.close(); onYes(); });
}

const val = (f, n) => (f.elements[n]?.value ?? '').trim();

/** Formulier voor een nieuwe of bestaande reis. */
/** "Joke", "Joke en Rob", "Joke, Rob en An" */
export function matesText(mates) {
  const m = (mates || []).filter(Boolean);
  return m.length < 2 ? m.join('') : m.slice(0, -1).join(', ') + ' en ' + m[m.length - 1];
}

// ---- Heenreis en terugreis: stappen (vervoer, van, naar) ----
const STEP_MODES = ['plane', 'car', 'train', 'boat'];
const placeOf = (x, mode) => {
  if (!x) return null;
  if (mode === 'plane') { const a = airportByCode(x); return a ? { c: a.c, code: a.code, name: a.city || a.name || a.code } : null; }
  return { c: x };
};
const stepsInfo = steps => {
  if (steps.length === 1) return MODES[steps[0].mode]?.[0] || '';
  if (steps.every(x => x.mode === 'plane')) {
    const via = steps.slice(0, -1).map(x => placeOf(x.to, 'plane')?.name).filter(Boolean).join(', ');
    return `${steps.length} vluchten${via ? ' · overstap in ' + via : ''}`;
  }
  const n = steps.map(x => (MODES[x.mode]?.[0] || '').toLowerCase());
  return n[0].charAt(0).toUpperCase() + n[0].slice(1) + n.slice(1).map(x => ', daarna ' + x).join('');
};
/** Eén deel (heenreis of terugreis): titel met datum, één lijn met vlaggen en vervoer, info eronder. */
function partHtml(title, date, steps) {
  steps = (steps || []).filter(x => x.from || x.to);
  if (!steps.length) return '';
  const places = [placeOf(steps[0].from, steps[0].mode), ...steps.map(x => placeOf(x.to, x.mode))];
  const row = places.map((p, i) => `${i ? `<span class="rd-ln"></span><span class="rd-mi">${ic(MODES[steps[i - 1].mode]?.[1] || 'dots', 20)}</span><span class="rd-ln"></span>` : ''}${p?.c ? flag(p.c) : ''}${p?.code ? `<b>${esc(p.code)}</b>` : ''}`).join('');
  return `<div class="rd"><h3>${esc(title)}${date ? ` <small>${esc(fmtDate(date))}</small>` : ''}</h3><div class="rd-row">${row}</div><div class="rd-info">${esc(stepsInfo(steps))}</div></div>`;
}
/** Heen en terug uit de vluchten (tickets, boarding passes); zonder vluchten uit de vervoerstops van oudere reizen. */
const dayDiff = (a, b) => (a && b) ? Math.abs(Math.round((new Date(b) - new Date(a)) / 864e5)) : 0;
function legacyParts(t) {
  const L = t.legs || [], home = homeCountry();
  const fl = (t.items || []).filter(i => i.type === 'flight' && i.f?.from && i.f?.to).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  const ctry = c => airportByCode(c)?.c;
  const step = f => ({ mode: 'plane', from: f.f.from, to: f.f.to, flight: f.id });
  const out = {};
  const used = new Set();
  if (fl.length) {
    // Heen: de eerste vlucht en de vluchten die er direct op aansluiten (zelfde luchthaven, binnen een dag).
    const h = [fl[0]]; used.add(fl[0].id);
    for (const f of fl.slice(1)) {
      const p = h[h.length - 1];
      if (f.f.from === p.f.to && dayDiff(p.date, f.date) <= 1 && ctry(p.f.to) !== home) { h.push(f); used.add(f.id); } else break;
    }
    out.heen = h.map(step);
    // Terug: de laatste vlucht die in het thuisland landt, met de vluchten die er direct aan voorafgaan.
    let end = -1;
    for (let i = fl.length - 1; i >= 0; i--) if (!used.has(fl[i].id) && ctry(fl[i].f.to) === home) { end = i; break; }
    if (end >= 0) {
      const k = [fl[end]];
      for (let i = end - 1; i >= 0; i--) { if (used.has(fl[i].id)) break; if (fl[i].f.to === k[0].f.from && dayDiff(fl[i].date, k[0].date) <= 1) k.unshift(fl[i]); else break; }
      out.terug = k.map(step);
    }
  } else if (L.length) {
    out.heen = [{ mode: L[0].mode, from: t.from || home, to: L[0].c }].filter(x => x.from && x.to && L[0].mode !== 'plane');
    const last = L[L.length - 1];
    if (L.length >= 2 && last.c === home && last.mode !== 'plane') out.terug = [{ mode: last.mode, from: L[L.length - 2].c, to: home }];
  }
  return out;
}
/** Heen en terug van een reis: wat is ingevuld, anders afgeleid uit de vluchten of stops. */
export const partsData = t => { const l = legacyParts(t); return { heen: t.heen?.length ? t.heen : (l.heen || []), terug: t.terug?.length ? t.terug : (l.terug || []) }; };
export const partsHtml = t => { const d = partsData(t); return partHtml('Heenreis', t.start, d.heen) + partHtml('Terugreis', t.end, d.terug); };

export function openTripForm(trip = null, { onSaved } = {}) {
  const mates = [...(trip?.mates || [])];
  const pd = trip ? partsData(trip) : { heen: [], terug: [] };
  const st = { heen: structuredClone(pd.heen), terug: structuredClone(pd.terug) };
  for (const w of ['heen', 'terug']) for (const x of st[w]) if (typeof x.flight === 'string') { x.flightId = x.flight; delete x.flight; }
  const sh = openSheet(`<div class="label">Titel</div><input class="titel-in" name="titel" aria-label="Titel" placeholder="Bijvoorbeeld Tatra &amp; Energylandia" value="${esc(trip?.title || '')}"><div class="datums"><div><div class="label">Start</div><input class="titel-in" type="date" name="start" aria-label="Start" value="${esc(trip?.start || '')}"></div><div><div class="label">Einde</div><input class="titel-in" type="date" name="einde" aria-label="Einde" value="${esc(trip?.end || '')}"></div></div><div class="label">Reisgenoten (optioneel)</div><div data-mates></div><div class="label">Heenreis</div><div data-sec="heen"></div><div class="label">Route</div><div class="label">Terugreis</div><div data-sec="terug"></div><p class="muted" role="alert" data-err style="margin:0;color:var(--danger)"></p><div class="pair"><button type="button" class="btn" data-close>Annuleren</button><button type="button" class="btn primary" data-save>Opslaan</button></div>`, { title: trip ? 'Reis bewerken' : 'Nieuwe reis' });
  const addMate = name => {
    name = (name || '').trim().replace(/\s+/g, ' ');
    if (name && !mates.some(m => m.toLowerCase() === name.toLowerCase())) mates.push(name);
  };
  const drawMates = () => {
    sh.el.querySelector('[data-mates]').innerHTML = `${mates.length ? `<div class="mates">${mates.map((m, i) => `<span class="mate">${esc(m)}<button type="button" data-rmmate="${i}" aria-label="${esc(m)} verwijderen">${ic('x', 16)}</button></span>`).join('')}</div>` : ''}
      <div class="mate-add"><input id="f-mate" name="mate" list="mates-dl" placeholder="Naam" autocomplete="off" enterkeyhint="done"><button type="button" class="btn soft" data-addmate>${ic('plus', 18)}Toevoegen</button></div>
      <datalist id="mates-dl">${[...new Set(get().trips.flatMap(t => t.mates || []))].filter(n => !mates.includes(n)).map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;
  };
  const place = (w, i, k, s) => s.mode === 'plane'
    ? `<input class="titel-in" data-ap="${w}-${i}-${k}" aria-label="${k === 'from' ? 'Van' : 'Naar'}" value="${esc(s[k] || '')}">`
    : countryPick(`${w}-${i}-${k}`, s[k], k === 'from' ? 'Van' : 'Naar');
  const drawSec = w => {
    const box = sh.el.querySelector(`[data-sec="${w}"]`);
    box.innerHTML = st[w].map((s, i) => `<div class="stp"><div class="chips">${STEP_MODES.map(m => `<button type="button" class="ch${s.mode === m ? ' on' : ''}" data-mode="${w}-${i}-${m}" aria-label="${MODES[m][0]}">${ic(MODES[m][1], 20)}</button>`).join('')}${i ? `<button type="button" class="icon-btn" style="flex:none;background:var(--bg)" data-rmstep="${w}-${i}" aria-label="Stap verwijderen">${ic('x', 20)}</button>` : ''}</div><div class="two2"><div class="pl">${place(w, i, 'from', s)}</div><div class="pl">${place(w, i, 'to', s)}</div></div>${s.mode === 'plane' ? `<label class="btn soft scan" style="margin-top:8px">${ic('plane', 18)}Boarding pass inlezen<input type="file" accept="image/*" data-bp="${w}-${i}" hidden></label>` : ''}</div>`).join('')
      + `<button type="button" class="btn soft" data-addstep="${w}">${ic('plus', 18)}Stap toevoegen</button>`;
    box.querySelectorAll('[data-ap]').forEach(inp => attachAirportSearch(inp));
  };
  // Leest de ingevulde plaatsen terug in de stappen.
  const sync = () => {
    for (const w of ['heen', 'terug']) st[w].forEach((s, i) => {
      for (const k of ['from', 'to']) {
        const ap = sh.el.querySelector(`[data-ap="${w}-${i}-${k}"]`), cp = sh.el.querySelector(`input[name="${w}-${i}-${k}"]`);
        if (ap) s[k] = ap.value.trim().toUpperCase(); else if (cp) s[k] = cp.value;
      }
    });
  };
  drawMates(); drawSec('heen'); drawSec('terug');
  bindCountryPick(sh.el);
  sh.el.addEventListener('click', e => {
    const am = e.target.closest('[data-addmate]'), rmm = e.target.closest('[data-rmmate]');
    if (am || rmm) {
      if (am) addMate(sh.el.querySelector('[name=mate]')?.value); else mates.splice(+rmm.dataset.rmmate, 1);
      drawMates();
      if (am) sh.el.querySelector('[name=mate]')?.focus();
      return;
    }
    const md = e.target.closest('[data-mode]');
    if (md) {
      const [w, i, m] = md.dataset.mode.split('-'); sync();
      const s = st[w][+i];
      if ((s.mode === 'plane') !== (m === 'plane')) {
        for (const k of ['from', 'to']) s[k] = s.mode === 'plane' ? (airportByCode(s[k])?.c || '') : '';
      }
      s.mode = m; drawSec(w); return;
    }
    const ad = e.target.closest('[data-addstep]');
    if (ad) { const w = ad.dataset.addstep; sync(); const prev = st[w][st[w].length - 1]; st[w].push({ mode: prev?.mode || '', from: prev?.to || '', to: '' }); drawSec(w); return; }
    const rs = e.target.closest('[data-rmstep]');
    if (rs) { const [w, i] = rs.dataset.rmstep.split('-'); sync(); st[w].splice(+i, 1); drawSec(w); return; }
    if (e.target.closest('[data-save]')) save();
  });
  sh.el.addEventListener('change', async e => {
    const inp = e.target.closest?.('[data-bp]'); const file = inp?.files?.[0];
    if (!file) return;
    const [w, i] = inp.dataset.bp.split('-'); sync();
    toast('Boarding pass lezen…');
    const g = n => (sh.el.querySelector(`[name=${n}]`)?.value || '').trim();
    const r = await scanBoardingPass(file, { start: g('start'), end: g('einde') });
    if (r.error) return toast({ decoder: 'Inlezen lukt niet op dit toestel.', 'geen-code': 'Geen streepjescode gevonden. Probeer een scherpere foto.', 'geen-boardingpass': 'Dit is geen boarding pass.' }[r.error]);
    const { bp, airline } = r, step = st[w][+i];
    step.from = bp.from; step.to = bp.to;
    step.flight = { id: step.flight?.id || step.flightId || newId(), type: 'flight', name: [airline?.name || bp.carrier, bp.number.split(' ').pop()].filter(Boolean).join(' ') || 'Vlucht', date: bp.date || '', note: '', score: '', f: { airline: airline?.name || bp.carrier, ...(airline ? { airlineCode: airline.code } : {}), number: bp.number, from: bp.from, to: bp.to, ref: bp.pnr || '', pax: [{ name: bp.name, seat: bp.seat, cls: bp.cls }] } };
    drawSec(w);
    toast(`${bp.name} · ${bp.number} ingelezen`);
  });
  sh.el.addEventListener('input', e => { if (e.target.type === 'date') e.target.classList.toggle('e', !e.target.value); });
  sh.el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.name !== 'mate') return;
    e.preventDefault();
    addMate(e.target.value); drawMates();
    sh.el.querySelector('[name=mate]')?.focus();
  });
  const save = () => {
    sync();
    const err = m => { sh.el.querySelector('[data-err]').textContent = m; };
    const g = n => (sh.el.querySelector(`[name=${n}]`)?.value || '').trim();
    addMate(sh.el.querySelector('[name=mate]')?.value);
    const title = g('titel'), start = g('start'), end = g('einde');
    if (!title) return err('Geef een titel.');
    if (!start) return err('Kies een startdatum.');
    if (end && end < start) return err('Het einde ligt voor de start.');
    const clean = steps => steps.map(s => ({ mode: s.mode || 'other', from: s.from, to: s.to, ...(s.mode === 'plane' && (s.flight || s.flightId) ? { flight: s.flight?.id || s.flightId } : {}) })).filter(s => s.from || s.to);
    const flights = [...st.heen, ...st.terug].filter(s => s.mode === 'plane' && s.flight && typeof s.flight === 'object').map(s => s.flight);
    const heen = clean(st.heen), terug = clean(st.terug);
    const last = heen[heen.length - 1];
    const dest = last ? placeOf(last.to, last.mode)?.c : '';
    const out = { ...(trip || {}), id: trip?.id || newId(), title, start, end: end || start, legs: trip?.legs?.length && !trip.heen ? (dest && !trip.legs.some(l => l.c === dest) ? [...trip.legs, { mode: last.mode, c: dest }] : trip.legs) : (dest ? [{ mode: last.mode, c: dest }] : []), items: [...(trip?.items || []).filter(x => !flights.some(f => f.id === x.id)), ...flights] };
    if (mates.length) out.mates = [...mates]; else delete out.mates;
    if (heen.length) out.heen = heen; else delete out.heen;
    if (terug.length) out.terug = terug; else delete out.terug;
    update(s => {
      for (const f of flights) for (const k of ['from', 'to']) ensureMyAirport(s, airportByCode(f.f[k]), newId);
      const i = s.trips.findIndex(t => t.id === out.id);
      if (i >= 0) s.trips[i] = out; else s.trips.push(out);
      if (dest) {
        const y = parseInt(start.slice(0, 4), 10), cur = s.countries[dest] || {};
        if (cur.s !== 'v') s.countries[dest] = { ...cur, s: 'v', y }; else if (!cur.y) s.countries[dest] = { ...cur, y };
      }
    });
    sh.close();
    toast('Reis opgeslagen');
    onSaved?.(out);
  };
  return sh;
}

/** Formulier voor een item in een reis (vlucht, verblijf, restaurant, activiteit). */
export function openItemForm(tripId, item = null, { type = 'activity', date = '' } = {}) {
  const draft = item ? structuredClone(item) : { id: newId(), type, name: '', date, note: '', score: '', f: {} };
  draft.f ||= {};
  if (!draft.f.pax) draft.f.pax = (draft.f.seat || draft.f.cls) ? [{ name: '', seat: draft.f.seat || '', cls: draft.f.cls || '' }] : [];
  const sh = openSheet('', { title: item ? 'Item bewerken' : 'Item toevoegen' });
  const read = () => {
    const f = sh.el.querySelector('form');
    if (!f) return;
    draft.type = val(f, 'type') || draft.type;
    draft.date = val(f, 'date'); draft.note = val(f, 'note');
    if (draft.type === 'activity') draft.icon = val(f, 'icon') || 'ticket'; else delete draft.icon;
    if (draft.type === 'stay' || draft.type === 'activity') draft.dateEnd = val(f, 'dateEnd'); else delete draft.dateEnd;
    if (draft.type === 'flight') {
      for (const k of ['airline', 'number', 'from', 'to', 'dep', 'arr', 'ref']) draft.f[k] = val(f, k);
      draft.f.pax = [...f.querySelectorAll('[data-pax]')].map(r => ({
        name: r.querySelector('[name=pname]').value.trim(), seat: r.querySelector('[name=pseat]').value.trim().toUpperCase(), cls: r.querySelector('[name=pcls]').value,
      })).filter(x => x.name || x.seat || x.cls);
      delete draft.f.seat; delete draft.f.cls;
      for (const k of ['from', 'to']) if (/^[a-z]{3}$/i.test(draft.f[k])) draft.f[k] = draft.f[k].toUpperCase();
    } else { draft.name = val(f, 'name'); draft.score = val(f, 'score'); }
  };
  const fld = (n, label, type = 'text', v = '', ph = '', extra = '') => `<div class="field"><label for="i-${n}">${label}</label><input id="i-${n}" name="${n}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}"${extra}></div>`;
  const apAttr = ' autocomplete="off" autocapitalize="characters"';
  let endOpen = false;
  const paxRow = (x = {}) => `<div class="pax" data-pax>
      <input name="pname" list="trav-list" value="${esc(x.name || '')}" placeholder="Naam" aria-label="Naam reiziger" autocomplete="off">
      <input name="pseat" value="${esc(x.seat || '')}" placeholder="Plaats" aria-label="Zitplaats" autocapitalize="characters" autocomplete="off">
      <select name="pcls" aria-label="Klasse"><option value="">Klasse</option>${CLASSES.map(c => `<option${c === x.cls ? ' selected' : ''}>${c}</option>`).join('')}</select>
      <button type="button" class="icon-btn" data-delpax aria-label="Reiziger verwijderen" style="background:var(--bg)">${ic('trash', 18)}</button></div>`;
  const render = (err = '') => {
    const t = draft.type, f = draft.f;
    sh.setHtml(`<h2>${item ? 'Item bewerken' : 'Item toevoegen'}</h2>
    <form class="form" novalidate>
      <div class="field"><label for="i-type">Soort</label><select id="i-type" name="type">${Object.entries(TYPES).map(([k, [n]]) => `<option value="${k}"${k === t ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      ${t === 'flight' ? `
        <label class="btn soft scan">${ic('plane', 18)}Boarding pass inlezen<input type="file" accept="image/*" id="bp-file" hidden></label>
        <div class="pair">${fld('airline', 'Maatschappij', 'text', f.airline, 'Maatschappij')}${fld('number', 'Vluchtnummer', 'text', f.number, 'Vluchtnummer')}</div>
        <div class="pair">${fld('from', 'Van', 'text', f.from, 'Luchthaven of stad', apAttr)}${fld('to', 'Naar', 'text', f.to, 'Luchthaven of stad', apAttr)}</div>
        ${fld('date', 'Datum', 'date', draft.date)}
        <div class="pair">${fld('dep', 'Vertrek', 'time', f.dep)}${fld('arr', 'Aankomst', 'time', f.arr)}</div>
        <div class="field"><label>Reizigers</label>
          <div class="pax-list">${(f.pax.length ? f.pax : [{}]).map(paxRow).join('')}</div>
          <button type="button" class="btn soft" data-addpax style="align-self:flex-start;margin-top:8px">${ic('plus', 18)}Reiziger toevoegen</button>
          <datalist id="trav-list">${get().travelers.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist></div>
        ${fld('ref', 'Boekingsreferentie', 'text', f.ref, 'Boekingsreferentie')}`
      : `${fld('name', 'Naam', 'text', draft.name, 'Naam')}
        ${t === 'stay'
          ? `<div class="pair">${fld('date', 'Inchecken', 'date', draft.date)}${fld('dateEnd', 'Uitchecken', 'date', draft.dateEnd || '')}</div>
             <p class="muted" id="i-nights" style="margin:-4px 0 0;font-weight:600;color:var(--accent)">${(n => n === null ? '' : esc(nightsLabel(n)))(nightsBetween(draft.date, draft.dateEnd))}</p>`
          : t === 'activity' && (endOpen || draft.dateEnd)
            ? `<div class="pair">${fld('date', 'Begint op', 'date', draft.date)}${fld('dateEnd', 'Eindigt op', 'date', draft.dateEnd || '')}</div>
               <button type="button" class="btn soft" data-noend style="align-self:flex-start">${ic('trash', 18)}Eén dag</button>`
            : `${fld('date', 'Datum', 'date', draft.date)}${t === 'activity' ? `<button type="button" class="btn soft" data-endday style="align-self:flex-start">${ic('plus', 18)}Eindigt op een andere dag</button>` : ''}`}
        <div class="field"><label for="i-score">Score (optioneel)</label><select id="i-score" name="score"><option value="">Geen score</option>${[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(n => `<option value="${n}"${String(draft.score) === String(n) ? ' selected' : ''}>${snorTxt(n)}</option>`).join('')}</select></div>`}
      ${t === 'activity' ? `<div class="field"><label>Icoon</label>${iconPick(draft.icon)}</div>` : ''}
      ${fld('note', 'Notitie', 'text', draft.note, 'Notitie')}
      <p class="muted" role="alert" style="margin:0;color:var(--danger)">${esc(err)}</p>
      <div class="pair">${item ? `<button type="button" class="btn danger" data-del>${ic('trash', 18)}Verwijderen</button>` : '<button type="button" class="btn" data-close>Annuleren</button>'}<button type="submit" class="btn primary">Opslaan</button></div>
    </form>`);
    if (t === 'flight') { const al = sh.el.querySelector('#i-airline'); if (al) attachAirlineSearch(al, a => { draft.f.airlineCode = a.code; const nr = sh.el.querySelector('#i-number'); if (nr && !nr.value.trim()) { nr.value = a.code + ' '; nr.focus(); } }); }
    if (t === 'flight') for (const id of ['i-from', 'i-to']) { const el = sh.el.querySelector('#' + id); if (el) attachAirportSearch(el); }
  };
  loadAirports(); loadAirlines();
  render();
  const scan = async file => {
    read();
    toast('Boarding pass lezen…');
    const trip = get().trips.find(x => x.id === tripId) || {};
    const r = await scanBoardingPass(file, { start: trip.start, end: trip.end });
    if (r.error) return toast({ decoder: 'Inlezen lukt niet op dit toestel.', 'geen-code': 'Geen streepjescode gevonden. Probeer een scherpere foto.', 'geen-boardingpass': 'Dit is geen boarding pass.' }[r.error]);
    const { bp, airline } = r;
    draft.f.airline = airline?.name || bp.carrier;
    if (airline) draft.f.airlineCode = airline.code; else delete draft.f.airlineCode;
    draft.f.number = bp.number; draft.f.from = bp.from; draft.f.to = bp.to;
    if (bp.date) draft.date = bp.date;
    if (bp.pnr) draft.f.ref = bp.pnr;
    const pax = draft.f.pax || [], same = pax.find(x => x.name && x.name.toLowerCase() === bp.name.toLowerCase());
    if (same) { same.seat = bp.seat || same.seat; same.cls = bp.cls || same.cls; }
    else if (pax.length === 1 && !pax[0].name && !pax[0].seat && !pax[0].cls) pax[0] = { name: bp.name, seat: bp.seat, cls: bp.cls };
    else pax.push({ name: bp.name, seat: bp.seat, cls: bp.cls });
    draft.f.pax = pax;
    render();
    toast(`${bp.name} · ${bp.number} ingelezen`);
  };
  sh.el.addEventListener('input', e => {
    if (e.target.name !== 'date' && e.target.name !== 'dateEnd') return;
    const out = sh.el.querySelector('#i-nights'); if (!out) return;
    const f = sh.el.querySelector('form'), n = nightsBetween(val(f, 'date'), val(f, 'dateEnd'));
    out.textContent = n === null ? '' : nightsLabel(n);
  });
  sh.el.addEventListener('change', e => {
    if (e.target.name === 'type') { read(); render(); return; }
    if (e.target.id === 'bp-file' && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ''; scan(f); }
  });
  sh.el.addEventListener('click', e => {
    if (e.target.closest('[data-endday]')) { read(); endOpen = true; render(); sh.el.querySelector('#i-dateEnd')?.focus(); return; }
    if (e.target.closest('[data-noend]')) { read(); endOpen = false; draft.dateEnd = ''; render(); return; }
    if (e.target.closest('[data-addpax]')) { read(); draft.f.pax.push({}); render(); sh.el.querySelectorAll('[name=pname]')[draft.f.pax.length - 1]?.focus(); return; }
    const dp = e.target.closest('[data-delpax]');
    if (dp) { const rows = [...sh.el.querySelectorAll('[data-pax]')]; const i = rows.indexOf(dp.closest('[data-pax]')); rows[i].querySelector('[name=pname]').value = ''; rows[i].querySelector('[name=pseat]').value = ''; rows[i].querySelector('[name=pcls]').value = ''; read(); render(); return; }
    if (!e.target.closest('[data-del]')) return;
    confirmSheet('Dit item verwijderen?', 'Verwijderen', () => {
      update(st => { const t = st.trips.find(x => x.id === tripId); if (t) t.items = t.items.filter(i => i.id !== draft.id); });
      sh.close();
    });
  });
  sh.el.addEventListener('submit', e => {
    e.preventDefault();
    read();
    if (draft.type === 'flight') { const a = airlineByName(draft.f.airline); if (a) draft.f.airlineCode = a.code; else delete draft.f.airlineCode; }
    if (draft.type === 'flight') draft.name = [draft.f.airline, draft.f.number].filter(Boolean).join(' ') || 'Vlucht';
    else if (!draft.name) return render('Geef het item een naam.');
    if ((draft.type === 'stay' || draft.type === 'activity') && draft.date && draft.dateEnd && draft.dateEnd < draft.date) return render(draft.type === 'stay' ? 'Uitchecken ligt voor inchecken.' : 'De einddatum ligt voor de begindatum.');
    if (!draft.dateEnd) delete draft.dateEnd;
    update(st => {
      if (draft.type === 'flight') {
        for (const k of ['from', 'to']) ensureMyAirport(st, airportByCode(draft.f[k]), newId);
        for (const x of draft.f.pax) if (x.name && !st.travelers.includes(x.name)) st.travelers.push(x.name);
      }
      const t = st.trips.find(x => x.id === tripId);
      if (!t) return;
      t.items ||= [];
      const i = t.items.findIndex(x => x.id === draft.id);
      if (i >= 0) t.items[i] = draft; else t.items.push(draft);
    });
    sh.close();
    toast('Item opgeslagen');
  });
  return sh;
}
