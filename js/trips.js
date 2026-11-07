// Gedeelde onderdelen voor reizen: vervoer, itemtypes, formulieren
import { get, update, newId } from './store.js';
import { list, byCode, nameOf, flag, searchCountries } from './data.js';
import { loadAirlines, airlineByName, attachAirlineSearch } from './airlines.js';
import { scanBoardingPass } from './boardingpass.js';
import { loadAirports, airportByCode, attachAirportSearch, ensureMyAirport } from './airports.js';
import { esc, ic, openSheet, toast, daysBetween, snorTxt, iconPick } from './ui.js';

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

/** Route van een reis: begin- en eindluchthaven uit je vluchten, overstappen (vluchten die aansluiten) en daartussen de stops die je invulde. */
export function routeOf(trip) {
  let legs = (trip.legs || []).map(l => ({ kind: 'c', mode: l.mode, c: l.c, ...(l.transit && l.mode !== 'plane' ? { through: true } : {}) }));
  if (!legs.length) return legs;
  const up = x => String(x || '').trim().toUpperCase();
  // Vluchten op volgorde van datum en vertrektijd; dubbele vluchten (zelfde reizigers apart ingevoerd) tellen één keer; aansluitende vluchten op dezelfde dag staan achter elkaar.
  const seen = new Set();
  const flights = (trip.items || []).filter(i => i.type === 'flight' && i.f?.from)
    .filter(i => { const k = `${i.date}|${up(i.f.from)}|${up(i.f.to)}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || String(a.f.dep || '').localeCompare(String(b.f.dep || '')));
  for (let pass = 0; pass < flights.length; pass++) {
    let moved = false;
    for (let i = 0; i < flights.length; i++) for (let j = i + 1; j < flights.length; j++) {
      if (flights[j].date === flights[i].date && up(flights[j].f.to) === up(flights[i].f.from) && up(flights[i].f.to) !== up(flights[j].f.from)) {
        flights.splice(i, 0, flights.splice(j, 1)[0]); moved = true;
      }
    }
    if (!moved) break;
  }
  const fromAp = airportByCode(flights[0]?.f.from);
  // Per vliegtuig bereikt zonder vlucht naar dat land (bv. een stop in Lissabon op weg naar Florida): toon de opgeslagen luchthaven van dat land.
  if (flights.length) {
    const flownTo = new Set(flights.map(f => airportByCode(f.f.to)?.c).filter(Boolean));
    const saved = get().places?.airports || [];
    legs = legs.map(l => {
      if (l.mode !== 'plane' || flownTo.has(l.c)) return l;
      const aps = saved.filter(a => a.c === l.c);
      return aps.length === 1 ? { kind: 'ap', mode: 'plane', c: l.c, code: aps[0].code, name: cityNl(aps[0].name) } : l;
    });
  }
  // Aankomst- en vertrekluchthaven per land waar je met het vliegtuig naartoe gaat (eerste keer erheen, laatste keer eruit).
  if (flights.length) {
    const apInfo = code => { const a = airportByCode(code); return a ? { code: a.code, name: cityNl(a.city || a.name), c: a.c } : null; };
    legs.forEach((l, i) => {
      if (l.kind !== 'c') return;
      const arr = flights.find(f => airportByCode(f.f.to)?.c === l.c);
      if (l.mode === 'plane' && arr && legs.findIndex(x => x.c === l.c) === i) l.arr = apInfo(arr.f.to);
      const dep = [...flights].reverse().find(f => airportByCode(f.f.from)?.c === l.c);
      if (dep && legs.map(x => x.c).lastIndexOf(l.c) === i) l.dep = apInfo(dep.f.from);
    });
  }
  if (!fromAp) {
    // Geen vlucht: begin in het gekozen vertrekland (of je thuisland) als je er niet met het vliegtuig vertrekt.
    const start = trip.from || homeCountry();
    if (start && legs[0].mode !== 'plane' && legs[0].c !== start) return [{ kind: 'c', mode: legs[0].mode, c: start }, ...legs];
    return legs;
  }
  const ap = (code, layover) => {
    const a = airportByCode(code);
    return a ? { kind: 'ap', mode: 'plane', c: a.c, code: a.code, name: cityNl(a.city || a.name), layover } : null;
  };
  const near = (x, y) => x.date && y.date && daysBetween(x.date, y.date) <= 2 && daysBetween(x.date, y.date) >= 1;
  const same = (x, y) => String(x || '').toUpperCase() === String(y || '').toUpperCase();
  // heenreis: aansluitende vluchten vanaf de eerste vlucht
  let n = 1;
  while (n < flights.length && same(flights[n - 1].f.to, flights[n].f.from) && near(flights[n - 1], flights[n])) n++;
  const outStops = flights.slice(0, n - 1).map(f => ap(f.f.to, true)).filter(x => x && x.c !== legs[0].c);
  const out = [{ ...ap(fromAp.code, false), mode: legs[0].mode }, ...outStops, ...legs];
  if (legs[0].c === fromAp.c && !outStops.length) out.shift();
  // terugreis: aansluitende vluchten naar het land van vertrek
  const rest = flights.slice(n);
  const end = ap(fromAp.code, false);
  const lastIn = rest[rest.length - 1];
  const back = [];
  if (lastIn && airportByCode(lastIn.f.to)?.c === fromAp.c) {
    let k = rest.length - 1;
    while (k > 0 && same(rest[k - 1].f.to, rest[k].f.from) && near(rest[k - 1], rest[k])) k--;
    for (let m = k + 1; m < rest.length; m++) { const x = ap(rest[m].f.from, true); if (x && x.c !== legs[legs.length - 1].c) back.push(x); }
  }
  // Landt de laatste vlucht niet in het land van vertrek (bv. terug in Frankfurt), dan is dat een overstap vóór de thuisreis.
  if (lastIn && airportByCode(lastIn.f.to)?.c !== fromAp.c) { const x = ap(lastIn.f.to, true); if (x && x.c !== legs[legs.length - 1].c) back.push(x); }
  if (out[out.length - 1].c !== fromAp.c || back.length) out.push(...back, { ...end, mode: 'plane' });
  return out;
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
/** Route in de reis zelf (en op laptop): stops onder elkaar, het vervoer op de lijn ertussen; een luchthaven met zijn naam, een overstap iets lichter. */
export function legsHtml(items) {
  return items.map((l, i) => `${i ? `<div class="conn${l.layover ? ' light' : ''}"><span class="cl"></span><span class="cm">${ic(MODES[l.mode]?.[1] || 'dots', 16)}${MODES[l.mode]?.[0] || ''}</span></div>` : ''}
    <div class="leg2${l.layover || l.through ? ' light' : ''}">${flag(l.c)}<div>${l.kind === 'ap'
      ? `<div class="p">${esc(l.name)} (${esc(l.code)})</div><div class="sub">${l.layover ? 'Overstap · ' : ''}${nm(l.c)}</div>`
      : `<div class="p">${nm(l.c)}</div>${l.through ? '<div class="sub">Doorgereden</div>' : ''}`}</div></div>`).join('');
}

/** Eén stop van de compacte route: landen als vlag, luchthavens als label met de code en de vlag als watermerk. */
const chipOf = l => l.kind === 'ap'
  ? `<span class="ac${l.layover ? ' lt' : ''}" title="${esc(l.name)}, ${esc(nameOf(l.c))}"><img class="wm" src="assets/flags/${esc(String(l.c).toLowerCase())}.svg" alt="" aria-hidden="true"><b>${esc(l.code)}</b></span>`
  : l.through ? `<span class="thru" title="Doorgereden">${flag(l.c)}</span>` : flag(l.c);
const modeIc = l => `<span class="cm2" title="${esc(MODES[l.mode]?.[0] || '')}">${ic(MODES[l.mode]?.[1] || 'dots', 16)}</span>`;

/** Route op één regel (overzicht op mobiel). */
export function legsCompact(items) {
  return `<div class="croute">${items.map((l, i) => `${i ? modeIc(l) : ''}${chipOf(l)}`).join('')}</div>`;
}

/** Overzicht op mobiel in drie regels: heen, bezocht (met landnaam) en terug. Zonder bezocht land: de gewone route op één regel. */
export function legsSplit(items) {
  const n = items.length;
  const visited = items.map((l, i) => l.kind === 'c' ? !l.through : (l.kind === 'ap' && !l.layover && i > 0 && i < n - 1));
  visited[0] = false;                                              // vertrek is nooit een bezocht land
  if (n > 1 && items[n - 1].c === items[0].c) visited[n - 1] = false;   // terug thuis
  const first = visited.indexOf(true), last = visited.lastIndexOf(true);
  if (first < 0) return legsCompact(items);
  const chain = arr => arr.map((l, i) => `${i ? modeIc(l) : ''}${chipOf(l)}`).join('');
  const asAp = (l, x) => x ? { kind: 'ap', mode: l.mode, c: x.c, code: x.code, name: x.name } : l;   // aankomst/vertrek als luchthaven
  const heen = items.slice(0, first + 1), terug = items.slice(last);
  heen[first] = asAp(heen[first], heen[first].arr);
  terug[0] = asAp(terug[0], terug[0].dep);   // inclusief vertrek, aankomst en het vervoer ertussen
  // Bezocht: de landen in volgorde van de reis, met het vervoer ertussen (zodat bv. de boot naar de Bahama's blijft staan).
  const vis = items.map((l, i) => ({ l, i })).filter(x => visited[x.i]);
  const stays = vis.map((x, k) => `${k ? modeIc(x.l) : ''}<span class="cvis" title="${esc(nameOf(x.l.c))}">${flag(x.l.c)}</span>`).join('');
  const row = (lab, html, cls = '') => html ? `<div class="srow${cls}"><i>${lab}</i><div class="croute">${html}</div></div>` : '';
  return `<div class="split">${row('Heen', chain(heen))}${row('Bezocht', stays, ' v')}${row('Terug', terug.length > 1 ? chain(terug) : '')}</div>`;
}

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

export function openTripForm(trip = null, { onSaved } = {}) {
  const draft = trip ? structuredClone(trip) : { id: newId(), title: '', start: '', end: '', legs: [{ mode: 'plane', c: '' }], items: [], mates: [] };
  draft.mates ||= [];
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
      <div class="label">Route</div>
      <div class="field" data-vertrek${(draft.legs[0]?.mode || 'plane') === 'plane' ? ' hidden' : ''}><label for="f-vertrek">Vertrek uit</label>${countryPick('vertrek', draft.from || homeCountry(), 'Vertrek uit', 'f-vertrek')}</div>
      <div class="legs">${draft.legs.map((l, i) => `<div class="legrow" data-leg="${i}"><button type="button" class="grip" aria-label="Stop ${i + 1} verslepen" title="Sleep om te verplaatsen"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button><div style="flex:1;min-width:0"><div class="pair" style="align-items:center">
        <div class="field"><select name="mode-${i}" aria-label="Vervoer stop ${i + 1}">${Object.entries(MODES).map(([k, [n]]) => `<option value="${k}"${k === l.mode ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field">${countryPick(`land-${i}`, l.c, `Land stop ${i + 1}`)}</div>
        ${draft.legs.length > 1 ? `<button type="button" class="icon-btn" style="flex:none;background:var(--bg)" data-rm="${i}" aria-label="Stop ${i + 1} verwijderen">${ic('x', 20)}</button>` : ''}
      </div>
      <label class="transit" data-transit="${i}"><input type="checkbox" name="transit-${i}"${l.transit ? ' checked' : ''}> <span>${transitTxt(l.mode)} (land telt niet mee als bezocht)</span></label></div></div>`).join('')}</div>
      <button type="button" class="btn soft" data-add>${ic('plus', 18)}Stop toevoegen</button>
      <p class="muted" role="alert" style="margin:0;color:var(--danger)">${esc(err)}</p>
      <div class="pair"><button type="button" class="btn" data-close>Annuleren</button><button type="submit" class="btn primary">Opslaan</button></div>
    </form>`);
  };
  render();
  bindCountryPick(sh.el);
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
    const legs = draft.legs.filter(l => l.c);
    if (!draft.title && !legs.length) return render('Geef een titel of kies minstens één land.');
    const clean = { ...draft, legs, end: draft.end || draft.start };
    if (!legs.length || legs[0].mode === 'plane' || !draft.from) delete clean.from;
    if (!clean.mates?.length) delete clean.mates;
    update(st => {
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
