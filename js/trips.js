// Gedeelde onderdelen voor reizen: vervoer, itemtypes, formulieren
import { get, update, newId } from './store.js';
import { list, byCode, nameOf, flag } from './data.js';
import { loadAirlines, airlineByName, attachAirlineSearch } from './airlines.js';
import { scanBoardingPass } from './boardingpass.js';
import { loadAirports, airportByCode, attachAirportSearch, ensureMyAirport } from './airports.js';
import { esc, ic, openSheet, toast, daysBetween, snorTxt, iconPick } from './ui.js';

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
      <div class="legs">${draft.legs.map((l, i) => `<div class="legrow" data-leg="${i}"><button type="button" class="grip" aria-label="Stop ${i + 1} verslepen" title="Sleep om te verplaatsen"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button><div class="pair" style="align-items:center;flex:1;min-width:0">
        <div class="field"><select name="mode-${i}" aria-label="Vervoer stop ${i + 1}">${Object.entries(MODES).map(([k, [n]]) => `<option value="${k}"${k === l.mode ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><select name="land-${i}" aria-label="Land stop ${i + 1}">${countryOptions(l.c)}</select></div>
        ${draft.legs.length > 1 ? `<button type="button" class="icon-btn" style="flex:none;background:var(--bg)" data-rm="${i}" aria-label="Stop ${i + 1} verwijderen">${ic('x', 20)}</button>` : ''}
      </div></div>`).join('')}</div>
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
