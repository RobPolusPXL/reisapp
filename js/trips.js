// Gedeelde onderdelen voor reizen: vervoer, itemtypes, formulieren
import { get, update, newId } from './store.js';
import { list, byCode, nameOf, flag } from './data.js';
import { esc, ic, openSheet, toast, daysBetween } from './ui.js';

export const MODES = {
  plane: ['Vliegtuig', 'plane'], car: ['Auto', 'car'], train: ['Trein', 'train'],
  bus: ['Bus', 'bus'], boat: ['Boot', 'boat'], other: ['Anders', 'dots'],
};
export const TYPES = {
  flight: ['Vlucht', 'plane'], stay: ['Verblijf', 'bed'], food: ['Restaurant', 'fork'], activity: ['Activiteit', 'star'],
};
export const CLASSES = ['Economy', 'Premium economy', 'Business', 'First'];

export const countryOptions = sel =>
  '<option value="">Kies een land</option>' + list.map(c => `<option value="${c.c}"${c.c === sel ? ' selected' : ''}>${esc(c.n)}</option>`).join('');

export function legsHtml(legs) {
  return legs.map((l, i) => `${i ? '<div class="leg-dash"></div>' : ''}
    <div class="leg">${flag(l.c)}<div><div class="m">${ic(MODES[l.mode]?.[1] || 'dots', 16)}${MODES[l.mode]?.[0] || ''}</div><div class="p">${esc(nameOf(l.c))}</div></div></div>`).join('');
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
export function openTripForm(trip = null, { onSaved } = {}) {
  const draft = trip ? structuredClone(trip) : { id: newId(), title: '', start: '', end: '', legs: [{ mode: 'plane', c: '' }], items: [] };
  const sh = openSheet('', { title: trip ? 'Reis bewerken' : 'Nieuwe reis' });
  const read = () => {
    const f = sh.el.querySelector('form');
    if (!f) return;
    draft.title = val(f, 'titel'); draft.start = val(f, 'start'); draft.end = val(f, 'einde');
    draft.legs = draft.legs.map((_, i) => ({ mode: val(f, `mode-${i}`) || 'plane', c: val(f, `land-${i}`) }));
  };
  const render = (err = '') => {
    sh.setHtml(`<h2>${trip ? 'Reis bewerken' : 'Nieuwe reis'}</h2>
    <form class="form" novalidate>
      <div class="field"><label for="f-titel">Titel (optioneel)</label><input id="f-titel" name="titel" value="${esc(draft.title)}" placeholder="Bijvoorbeeld Tatra &amp; Energylandia"></div>
      <div class="pair"><div class="field"><label for="f-start">Start</label><input id="f-start" name="start" type="date" value="${esc(draft.start)}"></div>
      <div class="field"><label for="f-einde">Einde</label><input id="f-einde" name="einde" type="date" value="${esc(draft.end)}"></div></div>
      <div class="label">Route</div>
      ${draft.legs.map((l, i) => `<div class="pair" style="align-items:center">
        <div class="field"><select name="mode-${i}" aria-label="Vervoer stop ${i + 1}">${Object.entries(MODES).map(([k, [n]]) => `<option value="${k}"${k === l.mode ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><select name="land-${i}" aria-label="Land stop ${i + 1}">${countryOptions(l.c)}</select></div>
        ${draft.legs.length > 1 ? `<button type="button" class="icon-btn" style="flex:none;background:var(--bg)" data-rm="${i}" aria-label="Stop ${i + 1} verwijderen">${ic('x', 20)}</button>` : ''}
      </div>`).join('')}
      <button type="button" class="btn soft" data-add>${ic('plus', 18)}Stop toevoegen</button>
      <p class="muted" role="alert" style="margin:0;color:var(--danger)">${esc(err)}</p>
      <div class="pair"><button type="button" class="btn" data-close>Annuleren</button><button type="submit" class="btn primary">Opslaan</button></div>
    </form>`);
  };
  render();
  sh.el.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    const add = e.target.closest('[data-add]');
    if (!rm && !add) return;
    read();
    if (rm) draft.legs.splice(+rm.dataset.rm, 1); else draft.legs.push({ mode: 'car', c: '' });
    render();
  });
  sh.el.addEventListener('submit', e => {
    e.preventDefault();
    read();
    if (!draft.start) return render('Kies een startdatum.');
    if (draft.end && draft.end < draft.start) return render('Het einde ligt voor de start.');
    const legs = draft.legs.filter(l => l.c);
    if (!draft.title && !legs.length) return render('Geef een titel of kies minstens één land.');
    const clean = { ...draft, legs, end: draft.end || draft.start };
    update(st => {
      const i = st.trips.findIndex(t => t.id === clean.id);
      if (i >= 0) st.trips[i] = clean; else st.trips.push(clean);
      const y = parseInt(clean.start.slice(0, 4), 10);
      for (const l of legs) if (st.countries[l.c]?.s !== 'v') st.countries[l.c] = { ...(st.countries[l.c] || {}), s: 'v', y };
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
  const sh = openSheet('', { title: item ? 'Item bewerken' : 'Item toevoegen' });
  const read = () => {
    const f = sh.el.querySelector('form');
    if (!f) return;
    draft.type = val(f, 'type') || draft.type;
    draft.date = val(f, 'date'); draft.note = val(f, 'note');
    if (draft.type === 'flight') {
      for (const k of ['airline', 'number', 'from', 'to', 'dep', 'arr', 'seat', 'cls', 'ref']) draft.f[k] = val(f, k);
    } else { draft.name = val(f, 'name'); draft.score = val(f, 'score'); }
  };
  const fld = (n, label, type = 'text', v = '', ph = '') => `<div class="field"><label for="i-${n}">${label}</label><input id="i-${n}" name="${n}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}"></div>`;
  const render = (err = '') => {
    const t = draft.type, f = draft.f;
    sh.setHtml(`<h2>${item ? 'Item bewerken' : 'Item toevoegen'}</h2>
    <form class="form" novalidate>
      <div class="field"><label for="i-type">Soort</label><select id="i-type" name="type">${Object.entries(TYPES).map(([k, [n]]) => `<option value="${k}"${k === t ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      ${t === 'flight' ? `
        <div class="pair">${fld('airline', 'Maatschappij', 'text', f.airline, 'Maatschappij')}${fld('number', 'Vluchtnummer', 'text', f.number, 'Vluchtnummer')}</div>
        <div class="pair">${fld('from', 'Van', 'text', f.from, 'Luchthaven')}${fld('to', 'Naar', 'text', f.to, 'Luchthaven')}</div>
        ${fld('date', 'Datum', 'date', draft.date)}
        <div class="pair">${fld('dep', 'Vertrek', 'time', f.dep)}${fld('arr', 'Aankomst', 'time', f.arr)}</div>
        <div class="pair">${fld('seat', 'Zitplaats', 'text', f.seat, 'Zitplaats')}
          <div class="field"><label for="i-cls">Klasse</label><select id="i-cls" name="cls"><option value="">–</option>${CLASSES.map(c => `<option${c === f.cls ? ' selected' : ''}>${c}</option>`).join('')}</select></div></div>
        ${fld('ref', 'Boekingsreferentie', 'text', f.ref, 'Boekingsreferentie')}`
      : `${fld('name', 'Naam', 'text', draft.name, 'Naam')}
        ${fld('date', 'Datum', 'date', draft.date)}
        ${t === 'stay' || t === 'food' ? `<div class="field"><label for="i-score">Score</label><select id="i-score" name="score"><option value="">Geen score</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${String(draft.score) === String(n) ? ' selected' : ''}>${'★'.repeat(n)} (${n})</option>`).join('')}</select></div>` : ''}`}
      ${fld('note', 'Notitie', 'text', draft.note, 'Notitie')}
      <p class="muted" role="alert" style="margin:0;color:var(--danger)">${esc(err)}</p>
      <div class="pair">${item ? `<button type="button" class="btn danger" data-del>${ic('trash', 18)}Verwijderen</button>` : '<button type="button" class="btn" data-close>Annuleren</button>'}<button type="submit" class="btn primary">Opslaan</button></div>
    </form>`);
  };
  render();
  sh.el.addEventListener('change', e => { if (e.target.name === 'type') { read(); render(); } });
  sh.el.addEventListener('click', e => {
    if (!e.target.closest('[data-del]')) return;
    confirmSheet('Dit item verwijderen?', 'Verwijderen', () => {
      update(st => { const t = st.trips.find(x => x.id === tripId); if (t) t.items = t.items.filter(i => i.id !== draft.id); });
      sh.close();
    });
  });
  sh.el.addEventListener('submit', e => {
    e.preventDefault();
    read();
    if (draft.type === 'flight') draft.name = [draft.f.airline, draft.f.number].filter(Boolean).join(' ') || 'Vlucht';
    else if (!draft.name) return render('Geef het item een naam.');
    update(st => {
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
