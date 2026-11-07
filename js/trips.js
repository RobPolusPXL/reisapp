// Gedeelde onderdelen voor reizen: vervoer, itemtypes, formulieren
import { get, update, newId } from './store.js';
import { list, byCode, nameOf, flag } from './data.js';
import { loadAirlines, airlineByName, attachAirlineSearch } from './airlines.js';
import { scanBoardingPass } from './boardingpass.js';
import { loadAirports, airportByCode, attachAirportSearch, ensureMyAirport } from './airports.js';
import { esc, ic, openSheet, toast, daysBetween, snorTxt, iconPick, fmtDate } from './ui.js';

export const MODES = {
  plane: ['Vliegtuig', 'plane'], car: ['Auto', 'car'], train: ['Trein', 'train'],
  bus: ['Bus', 'bus'], boat: ['Boot', 'boat'], other: ['Anders', 'dots'],
};
const transitTxt = m => m === 'plane' ? 'Enkel overstap met het vliegtuig' : 'Enkel doorgereden';
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

export function tripStats(state) {
  const countries = new Set();
  let days = 0;
  for (const t of state.trips) {
    t.legs.forEach(l => l.c && !l.transit && countries.add(l.c));   // overstappen (transit) tellen niet mee
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

/** "Joke", "Joke en Rob", "Joke, Rob en An" */
export function matesText(mates) {
  const m = (mates || []).filter(Boolean);
  return m.length < 2 ? m.join('') : m.slice(0, -1).join(', ') + ' en ' + m[m.length - 1];
}


// ---- Eén weergave van de reisweg: Heenreis → Route → Terugreis ----
// Alles wat getoond wordt komt uit wat in de reis is opgeslagen (heen, legs, terug); er wordt niets bij gegokt.
// Enkel oudere reizen zonder heen/terug krijgen die eenmalig afgeleid uit hun vluchten (legacyParts), tot je ze bewerkt en opslaat.
const STEP_MODES = ['plane', 'car', 'train', 'boat'];
const dayDiff = (a, b) => (a && b) ? Math.abs(Math.round((new Date(b) - new Date(a)) / 864e5)) : 0;
const flightOf = (step, items = []) => step?.flight ? items.find(i => i.id === step.flight) : null;
/** Een stap met een gekoppelde vlucht neemt van/naar uit die vlucht, zodat stap en vlucht nooit uit elkaar lopen. */
const stepEnds = (s, items) => { const f = flightOf(s, items)?.f; return { from: f?.from || s.from, to: f?.to || s.to }; };
const placeOf = (x, mode) => {
  if (!x) return null;
  if (mode === 'plane') { const a = airportByCode(x); return a ? { c: a.c, code: a.code, name: cityNl(a.city || a.name || a.code) } : { code: String(x).toUpperCase() }; }
  return { c: x };
};
const stepsInfo = (steps, items) => {
  const nr = steps.map(x => flightOf(x, items)?.f?.number || '').filter(Boolean).join(', ');
  if (steps.length === 1) return [MODES[steps[0].mode]?.[0] || '', nr].filter(Boolean).join(' · ');
  if (steps.every(x => x.mode === 'plane')) {
    const via = steps.slice(0, -1).map(x => placeOf(stepEnds(x, items).to, 'plane')?.name).filter(Boolean).join(', ');
    return `${steps.length} vluchten${nr ? ' · ' + nr : ''}${via ? ' · overstap in ' + via : ''}`;
  }
  const n = steps.map(x => (MODES[x.mode]?.[0] || '').toLowerCase());
  return n[0].charAt(0).toUpperCase() + n[0].slice(1) + n.slice(1).map(x => ', daarna ' + x).join('');
};
const conn = mode => `<span class="rd-ln"></span><span class="rd-mi" title="${esc(MODES[mode]?.[0] || '')}">${ic(MODES[mode]?.[1] || 'dots', 20)}</span><span class="rd-ln"></span>`;
const dot = p => `<span class="rd-p">${p?.c ? flag(p.c) : ''}${p?.code ? `<b>${esc(p.code)}</b>` : ''}</span>`;
/** Heenreis of terugreis: titel met datum, één lijn met vlaggen en vervoer, info eronder. */
function partHtml(title, date, steps, items) {
  steps = steps.filter(x => x.from || x.to || x.flight);
  if (!steps.length) return '';
  const ends = steps.map(s => stepEnds(s, items));
  const places = [placeOf(ends[0].from, steps[0].mode), ...ends.map((e, i) => placeOf(e.to, steps[i].mode))];
  const row = places.map((p, i) => (i ? conn(steps[i - 1].mode) : '') + dot(p)).join('');
  return `<div class="rd"><h3>${esc(title)}${date ? ` <small>${esc(fmtDate(date))}</small>` : ''}</h3><div class="rd-row">${row}</div><div class="rd-info">${esc(stepsInfo(steps, items))}</div></div>`;
}
/** Route: de landen die je bezocht, met het vervoer ertussen; doorgereden landen lichter. */
function routeHtml(legs) {
  legs = legs.filter(l => l.c);
  if (!legs.length) return '';
  const row = legs.map((l, i) => (i ? conn(l.mode) : '') + `<span class="rd-p${l.transit ? ' lt' : ''}" title="${esc(nameOf(l.c))}${l.transit ? ' (doorgereden)' : ''}">${flag(l.c)}</span>`).join('');
  const names = legs.filter(l => !l.transit).map(l => nameOf(l.c)).filter((n, i, a) => n !== a[i - 1]);
  return `<div class="rd"><h3>Route</h3><div class="rd-row">${row}</div><div class="rd-info">${esc(names.join(', '))}</div></div>`;
}
/** Oudere reizen zonder heen/terug: afgeleid uit de vluchten (heen = eerste aansluitende vluchten, terug = laatste naar huis). */
function legacyParts(t) {
  const home = homeCountry();
  const fl = (t.items || []).filter(i => i.type === 'flight' && i.f?.from && i.f?.to).sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || String(a.f.dep || '').localeCompare(String(b.f.dep || '')));
  const ctry = code => airportByCode(code)?.c;
  const step = f => ({ mode: 'plane', from: f.f.from, to: f.f.to, flight: f.id });
  const out = { heen: [], terug: [] };
  if (!fl.length) return out;
  const used = new Set([fl[0].id]), h = [fl[0]];
  for (const f of fl.slice(1)) {
    const p = h[h.length - 1];
    if (f.f.from === p.f.to && dayDiff(p.date, f.date) <= 1 && ctry(p.f.to) !== home) { h.push(f); used.add(f.id); } else break;
  }
  out.heen = h.map(step);
  let end = -1;
  for (let i = fl.length - 1; i >= 0; i--) if (!used.has(fl[i].id) && ctry(fl[i].f.to) === home) { end = i; break; }
  if (end >= 0) {
    const k = [fl[end]];
    for (let i = end - 1; i >= 0 && !used.has(fl[i].id); i--) { if (fl[i].f.to === k[0].f.from && dayDiff(fl[i].date, k[0].date) <= 1) k.unshift(fl[i]); else break; }
    out.terug = k.map(step);
  }
  return out;
}
/** Heen en terug van een reis: wat is opgeslagen, anders (oude reis) afgeleid uit de vluchten. */
export const partsData = t => {
  if (t.heen || t.terug) return { heen: t.heen || [], terug: t.terug || [] };
  return legacyParts(t);
};
/** De volledige reisweg in de volgorde van het formulier: Heenreis, Route, Terugreis. */
export function journeyHtml(t) {
  const d = partsData(t), it = t.items || [];
  const dateOf = (steps, fallback, first) => flightOf(first ? steps[0] : steps[steps.length - 1], it)?.date || fallback;
  return partHtml('Heenreis', dateOf(d.heen, t.start, true), d.heen, it) + routeHtml(t.legs || []) + partHtml('Terugreis', dateOf(d.terug, t.end, false), d.terug, it);
}


/** Formulier voor een nieuwe of bestaande reis. */
export function openTripForm(trip = null, { onSaved } = {}) {
  const draft = trip ? structuredClone(trip) : { id: newId(), title: '', start: '', end: '', legs: [{ mode: 'plane', c: '' }], items: [], mates: [] };
  draft.mates ||= [];
  const pd = trip ? partsData(trip) : { heen: [], terug: [] };
  const hv = { heen: structuredClone(pd.heen), terug: structuredClone(pd.terug) };
  for (const w of ['heen', 'terug']) for (const x of hv[w]) if (typeof x.flight === 'string') { Object.assign(x, stepEnds(x, trip?.items)); x.flightId = x.flight; delete x.flight; }
  const stepsHtml = w => hv[w].map((s, i) => `<div class="stp"><div class="chips">${STEP_MODES.map(m => `<button type="button" class="ch${s.mode === m ? ' on' : ''}" data-mode="${w}-${i}-${m}" aria-label="${MODES[m][0]}">${ic(MODES[m][1], 20)}</button>`).join('')}<button type="button" class="icon-btn" style="flex:none;background:var(--bg)" data-rmstep="${w}-${i}" aria-label="Stap verwijderen">${ic('x', 20)}</button></div><div class="two2"><div class="pl">${stepPlace(w, i, 'from', s)}</div><div class="pl">${stepPlace(w, i, 'to', s)}</div></div>${s.mode === 'plane' ? `<label class="btn soft scan" style="margin-top:8px">${ic('plane', 18)}Boarding pass inlezen<input type="file" accept="image/*" data-bp="${w}-${i}" hidden></label>` : ''}</div>`).join('') + `<button type="button" class="btn soft" data-addstep="${w}">${ic('plus', 18)}Stap toevoegen</button>`;
  const stepPlace = (w, i, k, s) => s.mode === 'plane'
    ? `<input class="titel-in" data-ap="${w}-${i}-${k}" aria-label="${k === 'from' ? 'Van' : 'Naar'}" value="${esc(s[k] || '')}">`
    : `<select name="${w}-${i}-${k}" aria-label="${k === 'from' ? 'Van' : 'Naar'}">${countryOptions(s[k])}</select>`;
  const sh = openSheet('', { title: trip ? 'Reis bewerken' : 'Nieuwe reis' });
  const addMate = name => {
    name = (name || '').trim().replace(/\s+/g, ' ');
    if (name && !draft.mates.some(m => m.toLowerCase() === name.toLowerCase())) draft.mates.push(name);
  };
  const read = () => {
    const f = sh.el.querySelector('form');
    if (!f) return;
    draft.title = val(f, 'titel'); draft.start = val(f, 'start'); draft.end = val(f, 'einde');
    if (f.elements.vertrek) draft.from = val(f, 'vertrek');
    for (const w of ['heen', 'terug']) hv[w].forEach((s, i) => {
      for (const k of ['from', 'to']) {
        const ap = f.querySelector(`[data-ap="${w}-${i}-${k}"]`);
        if (ap) s[k] = ap.value.trim().toUpperCase(); else if (f.elements[`${w}-${i}-${k}`]) s[k] = f.elements[`${w}-${i}-${k}`].value;
      }
    });
    draft.legs = draft.legs.map((_, i) => {
      const mode = val(f, `mode-${i}`) || 'plane';
      const leg = { mode, c: val(f, `land-${i}`) };
      if (f.elements[`transit-${i}`]?.checked) leg.transit = true;
      return leg;
    });
  };
  const render = (err = '') => {
    sh.setHtml(`<h2>${trip ? 'Reis bewerken' : 'Nieuwe reis'}</h2>
    <form class="form" novalidate>
      <div class="field"><label for="f-titel">Titel (optioneel)</label><input id="f-titel" name="titel" value="${esc(draft.title)}" placeholder="Bijvoorbeeld Tatra &amp; Energylandia"></div>
      <div class="pair"><div class="field"><label for="f-start">Start</label><input id="f-start" name="start" type="date" value="${esc(draft.start)}"></div>
      <div class="field"><label for="f-einde">Einde</label><input id="f-einde" name="einde" type="date" value="${esc(draft.end)}"></div></div>
      <div class="field"><label for="f-mate">Reisgenoten (optioneel)</label>
        ${draft.mates.length ? `<div class="mates">${draft.mates.map((m, i) => `<span class="mate">${esc(m)}<button type="button" data-rmmate="${i}" aria-label="${esc(m)} verwijderen">${ic('x', 16)}</button></span>`).join('')}</div>` : ''}
        <div class="mate-add"><input id="f-mate" name="mate" list="mates-dl" placeholder="Naam" autocomplete="off" enterkeyhint="done"><button type="button" class="btn soft" data-addmate>${ic('plus', 18)}Toevoegen</button></div>
        <datalist id="mates-dl">${[...new Set(get().trips.flatMap(t => t.mates || []))].filter(n => !draft.mates.includes(n)).map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist></div>
      <div class="label">Heenreis</div>
      <div data-sec="heen">${stepsHtml('heen')}</div>
      <div class="label">Route</div>
      <div class="field" data-vertrek${(draft.legs[0]?.mode || 'plane') === 'plane' ? ' hidden' : ''}><label for="f-vertrek">Vertrek uit</label><select id="f-vertrek" name="vertrek">${countryOptions(draft.from || homeCountry())}</select></div>
      <div class="legs">${draft.legs.map((l, i) => `<div class="legrow" data-leg="${i}"><button type="button" class="grip" aria-label="Stop ${i + 1} verslepen" title="Sleep om te verplaatsen"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button><div style="flex:1;min-width:0"><div class="pair" style="align-items:center">
        <div class="field"><select name="mode-${i}" aria-label="Vervoer stop ${i + 1}">${Object.entries(MODES).map(([k, [n]]) => `<option value="${k}"${k === l.mode ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><select name="land-${i}" aria-label="Land stop ${i + 1}">${countryOptions(l.c)}</select></div>
        ${draft.legs.length > 1 ? `<button type="button" class="icon-btn" style="flex:none;background:var(--bg)" data-rm="${i}" aria-label="Stop ${i + 1} verwijderen">${ic('x', 20)}</button>` : ''}
      </div>
      <label class="transit" data-transit="${i}"><input type="checkbox" name="transit-${i}"${l.transit ? ' checked' : ''}> <span>${transitTxt(l.mode)} (land telt niet mee als bezocht)</span></label></div></div>`).join('')}</div>
      <button type="button" class="btn soft" data-add>${ic('plus', 18)}Stop toevoegen</button>
      <div class="label">Terugreis</div>
      <div data-sec="terug">${stepsHtml('terug')}</div>
      <p class="muted" role="alert" style="margin:0;color:var(--danger)">${esc(err)}</p>
      <div class="pair"><button type="button" class="btn" data-close>Annuleren</button><button type="submit" class="btn primary">Opslaan</button></div>
    </form>`);
    sh.el.querySelectorAll('[data-ap]').forEach(inp => attachAirportSearch(inp));
  };
  render();
  sh.el.addEventListener('click', e => {
    const am = e.target.closest('[data-addmate]'), rmm = e.target.closest('[data-rmmate]');
    if (am || rmm) {
      read();
      if (am) addMate(sh.el.querySelector('[name=mate]')?.value);
      else draft.mates.splice(+rmm.dataset.rmmate, 1);
      render();
      if (am) sh.el.querySelector('[name=mate]')?.focus();
      return;
    }
    const md = e.target.closest('[data-mode]');
    if (md) {
      const [w, i, m] = md.dataset.mode.split('-'); read();
      const s = hv[w][+i];
      if ((s.mode === 'plane') !== (m === 'plane')) for (const k of ['from', 'to']) s[k] = s.mode === 'plane' ? (airportByCode(s[k])?.c || '') : '';
      s.mode = m; render(); return;
    }
    const ad = e.target.closest('[data-addstep]');
    if (ad) { const w = ad.dataset.addstep; read(); const prev = hv[w][hv[w].length - 1]; hv[w].push({ mode: prev?.mode || '', from: prev?.to || '', to: '' }); render(); return; }
    const rs = e.target.closest('[data-rmstep]');
    if (rs) { const [w, i] = rs.dataset.rmstep.split('-'); read(); hv[w].splice(+i, 1); render(); return; }
    const rm = e.target.closest('[data-rm]');
    const add = e.target.closest('[data-add]');
    if (!rm && !add) return;
    read();
    if (rm) draft.legs.splice(+rm.dataset.rm, 1); else draft.legs.push({ mode: 'car', c: '' });
    render();
  });
  // Stops verslepen: pak het handvat vast en sleep de rij omhoog of omlaag. De rij zelf verhuist pas bij het loslaten.
  sh.el.addEventListener('pointerdown', e => {
    const grip = e.target.closest('.grip');
    if (!grip) return;
    const box = sh.el.querySelector('.legs'), row = grip.closest('.legrow');
    if (!box || !row || box.children.length < 2) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const rows = [...box.children];
    const from = rows.indexOf(row), startY = e.clientY;
    const mids = rows.map(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
    const step = rows.length > 1 ? mids[1] - mids[0] : 0;
    let to = from;
    row.classList.add('dragging');
    rows.forEach(r => { if (r !== row) r.style.transition = 'transform .15s'; });
    const move = ev => {
      const dy = ev.clientY - startY;
      row.style.transform = `translateY(${dy}px)`;
      const pos = mids[from] + dy;
      to = 0;
      rows.forEach((r, k) => { if (k !== from && mids[k] < pos) to++; });
      rows.forEach((r, k) => {
        if (k === from) return;
        let shift = 0;
        if (from < to && k > from && k <= to) shift = -step;
        if (from > to && k < from && k >= to) shift = step;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const end = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      rows.forEach(r => { r.style.transform = ''; r.style.transition = ''; });
      row.classList.toggle('dragging', false);
      if (to === from) return;
      read();
      const [moved] = draft.legs.splice(from, 1);
      draft.legs.splice(to, 0, moved);
      render();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  });
  sh.el.addEventListener('change', async e => {
    const inp = e.target.closest?.('[data-bp]'); const file = inp?.files?.[0];
    if (!file) return;
    const [w, i] = inp.dataset.bp.split('-'); read();
    toast('Boarding pass lezen…');
    const r = await scanBoardingPass(file, { start: draft.start, end: draft.end });
    if (r.error) return toast({ decoder: 'Inlezen lukt niet op dit toestel.', 'geen-code': 'Geen streepjescode gevonden. Probeer een scherpere foto.', 'geen-boardingpass': 'Dit is geen boarding pass.' }[r.error]);
    const { bp, airline } = r, step = hv[w][+i];
    step.from = bp.from; step.to = bp.to;
    step.flight = { id: step.flight?.id || step.flightId || newId(), type: 'flight', name: [airline?.name || bp.carrier, bp.number.split(' ').pop()].filter(Boolean).join(' ') || 'Vlucht', date: bp.date || '', note: '', score: '', f: { airline: airline?.name || bp.carrier, ...(airline ? { airlineCode: airline.code } : {}), number: bp.number, from: bp.from, to: bp.to, ref: bp.pnr || '', pax: [{ name: bp.name, seat: bp.seat, cls: bp.cls }] } };
    render();
    toast(`${bp.name} · ${bp.number} ingelezen`);
  });
  sh.el.addEventListener('change', e => {
    if (e.target.name === 'mode-0') {
      const box = sh.el.querySelector('[data-vertrek]');
      if (box) box.hidden = e.target.value === 'plane';
    }
    const m = /^mode-(\d+)$/.exec(e.target.name || '');
    if (!m) return;
    const lab = sh.el.querySelector(`[data-transit="${m[1]}"]`);
    if (lab) lab.querySelector('span').textContent = `${transitTxt(e.target.value)} (land telt niet mee als bezocht)`;
  });
  sh.el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.name !== 'mate') return;
    e.preventDefault();
    read(); addMate(e.target.value); render();
    sh.el.querySelector('[name=mate]')?.focus();
  });
  sh.el.addEventListener('submit', e => {
    e.preventDefault();
    read();
    addMate(sh.el.querySelector('[name=mate]')?.value);   // een ingetypte naam gaat niet verloren
    if (!draft.start) return render('Kies een startdatum.');
    if (draft.end && draft.end < draft.start) return render('Het einde ligt voor de start.');
    let legs = draft.legs.filter(l => l.c);
    if (!legs.length) {   // geen route ingevuld: elk land uit heen en terug in de reis, onderweg als doorgereden
      const cOf = (x, mode) => mode === 'plane' ? airportByCode(x)?.c : x;
      const hs = hv.heen.filter(x => x.from || x.to), ts = hv.terug.filter(x => x.from || x.to), home = homeCountry();
      hs.forEach((x, i) => { const c = cOf(x.to, x.mode); if (c) legs.push({ mode: x.mode || 'other', c, ...(i < hs.length - 1 ? { transit: true } : {}) }); });
      ts.forEach((x, i) => { const c = cOf(x.to, x.mode); if (c && !(i === ts.length - 1 && c === home)) legs.push({ mode: x.mode || 'other', c, transit: true }); });
    }
    if (!draft.title && !legs.length) return render('Geef een titel of kies minstens één land.');
    const cl = steps => steps.map(s => ({ mode: s.mode || 'other', from: s.from, to: s.to, ...(s.mode === 'plane' && (s.flight || s.flightId) ? { flight: s.flight?.id || s.flightId } : {}) })).filter(s => s.from || s.to);
    const flights = [...hv.heen, ...hv.terug].filter(s => s.mode === 'plane' && s.flight && typeof s.flight === 'object').map(s => s.flight);
    // Een stap die aan een bestaande vlucht hangt: pas je van/naar aan, dan volgt de vlucht mee (stap en vlucht blijven gelijk).
    const linked = new Map([...hv.heen, ...hv.terug].filter(s => s.mode === 'plane' && s.flightId && !s.flight).map(s => [s.flightId, s]));
    const items = (draft.items || []).filter(x => !flights.some(f => f.id === x.id)).map(x => {
      const s = linked.get(x.id);
      return s && x.f && (s.from !== x.f.from || s.to !== x.f.to) ? { ...x, f: { ...x.f, from: s.from || x.f.from, to: s.to || x.f.to } } : x;
    });
    const clean = { ...draft, legs, end: draft.end || draft.start, items: [...items, ...flights] };
    const heenC = cl(hv.heen), terugC = cl(hv.terug);
    if (heenC.length) clean.heen = heenC; else delete clean.heen;
    if (terugC.length) clean.terug = terugC; else delete clean.terug;
    if (!legs.length || legs[0].mode === 'plane' || !draft.from) delete clean.from;
    if (!clean.mates?.length) delete clean.mates;
    update(st => {
      for (const f of flights) for (const k of ['from', 'to']) ensureMyAirport(st, airportByCode(f.f[k]), newId);
      const i = st.trips.findIndex(t => t.id === clean.id);
      if (i >= 0) st.trips[i] = clean; else st.trips.push(clean);
      const y = parseInt(clean.start.slice(0, 4), 10);
      // Een land telt als bezocht, tenzij alle stops in dat land enkel een overstap met het vliegtuig zijn.
      const counted = new Set(legs.filter(l => !l.transit).map(l => l.c));
      for (const c of counted) {
        const cur = st.countries[c] || {};
        if (cur.s !== 'v') st.countries[c] = { ...cur, s: 'v', y };
        else if (!cur.y) st.countries[c] = { ...cur, y };
      }
    });
    sh.close();
    toast('Reis opgeslagen');
    onSaved?.(clean);
  });
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

// ---- Reisoverzicht: vlaggen met vervoer, en het vervoer apart (vluchten / autoritten) ----
/** Bezochte landen in volgorde met het vervoer waarmee je binnenkwam; doorgereden landen tellen niet. */
export function entries(t) {
  const d = partsData(t), out = [];
  (t.legs || []).forEach((l, i) => {
    if (!l.c || l.transit || out.some(x => x.c === l.c)) return;
    const mode = i === 0 && d.heen.length ? d.heen[d.heen.length - 1].mode : l.mode;
    out.push({ c: l.c, mode: mode || 'other' });
  });
  return out;
}
export const flagsHtml = t => `<div class="fvs">${entries(t).map(e => `<span class="fv" title="${esc(nameOf(e.c))} · ${esc(MODES[e.mode]?.[0] || '')}">${flag(e.c)}<span class="fm">${ic(MODES[e.mode]?.[1] || 'dots', 12)}</span></span>`).join('')}</div>`;
const apH = (code, right) => { const a = airportByCode(code); return `<div class="ap${right ? ' r' : ''}">${a?.c ? flag(a.c) : ''}<b>${esc(code || '?')}</b>${a ? `<small>${esc(cityNl(a.city || a.name || ''))}</small>` : ''}</div>`; };
const lineH = mode => `<div class="fc-l"><span></span>${ic(MODES[mode]?.[1] || 'dots', 16)}<span></span></div>`;
/** Reisweg in volgorde: heenreis (vluchten of rit), dan de landen met tussendoorvluchten op hun plaats, dan de terugreis. */
export function transportHtml(t) {
  const d = partsData(t), it = t.items || [];
  const ctryOf = code => airportByCode(code)?.c;
  const byId = new Map(it.filter(i => i.type === 'flight').map(i => [i.id, i]));
  const used = new Set();
  const fcard = (i, k) => {
    used.add(i.id);
    const px = i.f?.pax?.length ? i.f.pax : (i.f?.seat ? [{ seat: i.f.seat }] : []);
    const seats = px.filter(x => x.seat).map(x => x.name ? `${x.name.split(' ')[0]} ${x.seat}` : x.seat).join(' · ');
    return `<button type="button" class="fc" data-item="${esc(i.id)}"><div class="fc-h"><span>${k}</span><span>${esc(fmtDate(i.date))}</span></div>
      <div class="fc-r">${apH(i.f?.from)}${lineH('plane')}${apH(i.f?.to, true)}</div>
      ${i.f?.airline || seats ? `<div class="fc-f"><span>${esc(i.f?.airline || '')}</span><span>${seats ? ic('seat', 14) + esc(seats) : ''}</span></div>` : ''}</button>`;
  };
  const cH = (c, r) => `<div class="ap${r ? ' r' : ''}">${c ? flag(c) : ''}<b>${esc(nameOf(c) || '?')}</b></div>`;
  // Heen of terug: vluchten als kaartjes, andere stappen samen als één rit met de landen waar je doorrijdt.
  const part = (k, steps, date, edgeVia) => {
    steps = steps.filter(x => x.from || x.to || x.flight);
    let out = '', ride = [];
    const flushRide = () => {
      if (!ride.length) return;
      const via = [...new Set([...ride.slice(0, -1).map(x => x.to), ...edgeVia])].filter(c => c && c !== ride[0].from && c !== ride[ride.length - 1].to);
      out += `<div class="fc"><div class="fc-h"><span>${k}</span><span>${esc(fmtDate(date))}</span></div><div class="fc-r">${cH(ride[0].from)}${lineH(ride[0].mode)}${cH(ride[ride.length - 1].to, true)}</div>
        ${via.length ? `<div class="fc-f"><span class="via">door ${via.map(c => `${flag(c)}${esc(nameOf(c))}`).join(', ')}</span></div>` : ''}</div>`;
      ride = [];
    };
    for (const s of steps) {
      const f = s.flight && byId.get(s.flight);
      if (s.mode === 'plane' && f) { flushRide(); out += fcard(f, k); }
      else if (s.mode === 'plane') { flushRide(); out += `<div class="fc"><div class="fc-h"><span>${k}</span><span>${esc(fmtDate(date))}</span></div><div class="fc-r">${apH(s.from)}${lineH('plane')}${apH(s.to, true)}</div></div>`; }
      else ride.push(s);
    }
    flushRide();
    return out;
  };
  const legs = (t.legs || []).filter(l => l.c);
  // Doorgereden landen aan het begin/einde van de route horen bij de heen-/terugrit als die met de auto is.
  const carH = d.heen.some(x => x.mode !== 'plane'), carT = d.terug.some(x => x.mode !== 'plane');
  let a = 0, b = legs.length;
  const viaH = [], viaT = [];
  if (carH) while (a < b && legs[a].transit) viaH.push(legs[a++].c);
  if (carT) while (b > a && legs[b - 1].transit) viaT.unshift(legs[--b].c);
  const mid = legs.slice(a, b);
  const free = () => [...byId.values()].filter(i => !used.has(i.id));
  let out = part('Heen', d.heen, t.start, viaH);
  const terugIds = new Set(d.terug.map(s => s.flight).filter(Boolean));
  terugIds.forEach(id => used.add(id));   // terugvluchten niet als tussendoor gebruiken
  mid.forEach((l, i) => {
    if (i) {
      const prev = mid[i - 1];
      const f = free().filter(x => !terugIds.has(x.id)).find(x => ctryOf(x.f?.from) === prev.c && ctryOf(x.f?.to) === l.c);
      out += f ? fcard(f, 'Tussendoor') : (prev.c !== l.c || l.mode !== prev.mode ? `<div class="hop">${ic(MODES[l.mode]?.[1] || 'dots', 16)}<span>${esc(MODES[l.mode]?.[0] || '')}</span></div>` : '');
    }
    out += `<div class="ctry${l.transit ? ' lt' : ''}">${flag(l.c)}<b>${esc(nameOf(l.c))}</b>${l.transit ? '<small>doorgereden</small>' : ''}</div>`;
  });
  terugIds.forEach(id => used.delete(id));
  const rest = free().filter(x => !terugIds.has(x.id));
  out += rest.map(x => fcard(x, 'Tussendoor')).join('');
  out += part('Terug', d.terug, t.end, viaT);
  return out ? `<section class="card"><div class="card-head"><h2>Reisweg</h2></div>${out}</section>` : '';
}
