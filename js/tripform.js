// Reisformulier: je bouwt de Reisweg zelf, van thuis tot thuis.
// Elke halte (behalve de eerste) heeft 'via': het vervoer waarmee je er aankomt; een vlucht hangt aan de halte waar ze landt.
import { get, update, newId } from './store.js';
import { list, nameOf, flag, searchCountries } from './data.js';
import { loadAirports, airportByCode, attachAirportSearch, ensureMyAirport } from './airports.js';
import { scanBoardingPass } from './boardingpass.js';
import { esc, ic, openSheet, toast, fmtDate } from './ui.js';
import { MODES, AP_MODES, MODE_COLOR, AP_NAME, houseDot, homeCountry, stationsOf } from './trips.js';

const LAND_MODES = ['car', 'train', 'bus', 'boat', 'plane'];
const col = m => MODE_COLOR[m] || '#94a3b8';
const modeName = m => (MODES[m] || AP_MODES[m])?.[0] || '';
const modeIcon = m => (MODES[m] || AP_MODES[m])?.[1] || 'dots';
const apName = code => { const a = airportByCode(code); return AP_NAME[code] || (a ? (a.city || a.name || code) : code); };
const flightLabel = f => f ? [f.number, f.dep && f.arr ? `${f.dep} – ${f.arr}` : f.date ? fmtDate(f.date) : ''].filter(Boolean).join(' · ') || 'Vliegtuig' : 'Vliegtuig';
const ctryOfAp = code => airportByCode(code)?.c || '';

/** Bestaande reis → lijst van haltes voor het formulier. */
function routeOf(t) {
  const it = t.items || [];
  const fOf = id => { const x = id && it.find(i => i.id === id); return x ? { id: x.id, from: x.f.from, to: x.f.to, number: x.f.number || '', date: x.date || '', dep: x.f.dep || '', arr: x.f.arr || '' } : null; };
  const r = stationsOf(t).map((s, i) => {
    if (s.kind === 'house') return { t: 'home', via: i ? s.mode : null, note: s.ap?.note || '' };
    if (s.code) return { t: 'ap', code: s.code, via: i ? s.mode : null, fl: fOf(s.flightIn) };
    return { t: 'land', c: s.c, st: s.kind === 'small' ? (s.mode === 'plane' ? 'o' : 'd') : 'v', via: i ? s.mode : null, fl: fOf(s.flightIn) };
  });
  // vervoer uit de route bewaren voor landen waar de Reisweg het niet kent (bv. vliegreis zonder vluchten)
  const legs = (t.legs || []).filter(l => l.c); let li = 0;
  for (const x of r) if (x.t === 'land') { const k = legs.findIndex((l, j) => j >= li && l.c === x.c); if (k >= 0) { x.legMode = legs[k].mode; li = k + 1; } }
  if (!r.length || r[0].t !== 'home') r.unshift({ t: 'home', via: null });
  if (r.length < 2 || r[r.length - 1].t !== 'home') r.push({ t: 'home', via: null });
  if (r[1]) r[1].note ||= t.ap?.heen?.note || '';
  return r;
}

export function openTripForm(trip = null, { onSaved } = {}) {
  const home = trip?.from || homeCountry() || 'BE';
  const S = {
    title: trip?.title || '', start: trip?.start || '', end: trip?.end || '', mates: [...(trip?.mates || [])], more: false,
    route: trip ? routeOf(trip) : [{ t: 'home', via: null }, { t: 'home', via: null }],
  };
  const removed = new Set();      // vluchten die je uit de Reisweg haalde
  const newFlights = new Map();   // id → nieuw vlucht-item
  const sh = openSheet('', { title: trip ? 'Reis bewerken' : 'Nieuwe reis' });
  loadAirports().then(() => draw());
  const empty = () => S.route.length === 2;
  const readTop = () => {
    const f = sh.el;
    if (!f.querySelector('#tf-t')) return;
    S.title = f.querySelector('#tf-t').value.trim(); S.start = f.querySelector('#tf-d1').value; S.end = f.querySelector('#tf-d2').value;
  };

  function draw(err = '') {
    const r = S.route, emp = empty();
    let hid = 0;
    const rows = r.map((s, i) => {
      const inc = i ? s.via : null, out = r[i + 1]?.via || null;
      const dash = c => `--c:${c}" data-dash="1`;
      const up = i ? (inc ? `<span class="tf-seg u" style="--c:${col(inc)}"></span>` : `<span class="tf-seg u dash" style="${dash('var(--field)')}"></span>`) : '';
      const dn = i < r.length - 1 ? (out ? `<span class="tf-seg d" style="--c:${col(out)}"></span>` : `<span class="tf-seg d dash" style="${dash('var(--field)')}"></span>`) : '';
      let dot, title, sub = '', cls = '';
      if (s.t === 'home') { dot = houseDot(home, emp ? '#94a3b8' : col(out || inc), `tfh${hid++}`); title = 'Thuis'; sub = i ? 'aankomst' : 'vertrek'; if (emp && i) cls = ' ghost'; }
      else if (s.t === 'ap') { dot = `<span class="tf-dot" style="--c:${col('plane')}">${flag(ctryOfAp(s.code) || home)}</span>`; title = `<b class="mcode">${esc(s.code)}</b>`; sub = `${esc(apName(s.code))} · ${s.lay ? 'overstap' : 'luchthaven'}`; }
      else { const sm = s.st !== 'v'; dot = `<span class="tf-dot${sm ? ' sm' : ''}" style="--c:${col(out || inc)}">${flag(s.c)}</span>`; title = esc(nameOf(s.c)); sub = [s.st === 'o' ? 'overstap' : s.st === 'd' ? 'doorgereden' : '', s.fl?.to ? `aangekomen in ${esc(s.fl.to)}` : ''].filter(Boolean).join(' · '); if (sm) cls = ' small'; }
      let h = `<div class="tf-n${cls}" data-node="${i}" role="button" tabindex="0"><div class="tf-rail">${up}${dn}${dot}</div><div class="tf-tx">${title.startsWith('<b') ? title : `<b>${title}</b>`}${sub ? `<small>${sub}</small>` : ''}</div></div>`;
      if (i < r.length - 1) {
        const nx = r[i + 1];
        if (emp) h += `<div class="tf-l"><div class="tf-rail"><span class="tf-seg f dash" style="--c:var(--field)"></span></div><button type="button" class="tf-addbig" data-add="${i}">${ic('plus', 20)}Waar ging je naartoe?</button></div>`;
        else {
          const toAp = (s.t === 'home' && nx.t === 'ap'), fromAp = (s.t === 'ap' && nx.t === 'home');
          const c = nx.via ? col(nx.via) : 'var(--muted)';
          const txt = !nx.via ? (toAp ? 'Hoe naar de luchthaven?' : fromAp ? 'Hoe naar huis?' : 'Vervoer kiezen')
            : nx.via === 'plane' ? flightLabel(nx.fl) : toAp ? `${modeName(nx.via)} naar de luchthaven` : fromAp ? `${modeName(nx.via)} naar huis` : modeName(nx.via);
          h += `<div class="tf-l"><div class="tf-rail"><span class="tf-seg f${nx.via ? '' : ' dash'}" style="--c:${nx.via ? c : 'var(--field)'}"></span>${nx.via ? `<span class="tf-ico" style="color:${c}">${ic(modeIcon(nx.via), 15)}</span>` : ''}</div><button type="button" class="tf-lk" style="color:${c}" data-link="${i + 1}">${esc(txt)}${nx.note && (toAp || fromAp) ? ' · ' + esc(nx.note) : ''}</button><button type="button" class="tf-ins" data-add="${i}" aria-label="Iets invoegen">${ic('plus', 16)}</button></div>`;
        }
      }
      return h;
    }).join('');
    sh.setHtml(`<div class="tf-top"><h2>${trip ? 'Reis bewerken' : 'Nieuwe reis'}</h2><button type="button" class="icon-btn tf-x" data-close aria-label="Sluiten">${ic('x', 20)}</button></div>
      <input class="tf-title" id="tf-t" placeholder="Naam van de reis" value="${esc(S.title)}" aria-label="Naam van de reis">
      <div class="tf-dates"><label>Van<input type="date" id="tf-d1" value="${esc(S.start)}"></label><label>Tot<input type="date" id="tf-d2" value="${esc(S.end)}"></label></div>
      <div class="tf-rwh"><b>Reisweg</b>${emp ? '' : '<span>Tik om aan te passen</span>'}</div>
      <div class="tf-route">${rows}</div>
      <button type="button" class="tf-more" data-more>${ic('users', 18)}Reisgenoten <span>${esc(S.mates.join(', ') || 'niemand')}</span>${ic('chev', 16)}</button>
      ${S.more ? `<div class="tf-moreb">${S.mates.length ? `<div class="mates">${S.mates.map((m, i) => `<span class="mate">${esc(m)}<button type="button" data-rmm="${i}" aria-label="${esc(m)} verwijderen">${ic('x', 16)}</button></span>`).join('')}</div>` : ''}
        <div class="mate-add"><input id="tf-mate" list="tf-mates" placeholder="Naam" autocomplete="off" enterkeyhint="done"><button type="button" class="btn soft" data-addm>${ic('plus', 18)}Toevoegen</button></div>
        <datalist id="tf-mates">${[...new Set(get().trips.flatMap(t => t.mates || []))].filter(n => !S.mates.includes(n)).map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist></div>` : ''}
      <p class="muted" role="alert" style="margin:0;color:var(--danger)">${esc(err)}</p>
      <div class="pair"><button type="button" class="btn" data-close>Annuleren</button><button type="button" class="btn primary" data-save>Opslaan</button></div>`);
  }

  // ---- kleine vensters bovenop het formulier ----
  function addSheet(at) {
    const s = openSheet(`<h2>Wat voeg je toe?</h2><div class="tf-tiles">
      <button type="button" class="tf-tile" data-k="land">${ic('pin', 26)}Land<small>waar je was</small></button>
      <button type="button" class="tf-tile" data-k="flight">${ic('plane', 26)}Vlucht<small>met de hand</small></button>
      <label class="tf-tile">${ic('doc', 26)}Boarding pass<small>foto inlezen</small><input type="file" accept="image/*,application/pdf" hidden data-bp></label></div>`, { title: 'Toevoegen' });
    s.el.addEventListener('click', e => {
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (k === 'land') { s.close(); landSheet(at); }
      if (k === 'flight') { s.close(); flightSheet(at); }
    });
    s.el.addEventListener('change', async e => {
      const file = e.target.closest('[data-bp]')?.files?.[0]; if (!file) return;
      readTop(); toast('Boarding pass lezen…');
      const res = await scanBoardingPass(file, { start: S.start, end: S.end });
      if (res.error) return toast({ decoder: 'Inlezen lukt niet op dit toestel.', 'geen-code': 'Geen streepjescode gevonden. Probeer een scherpere foto.', 'geen-boardingpass': 'Dit is geen boarding pass.' }[res.error] || 'Inlezen lukt niet.');
      const { bp, airline } = res;
      const item = { id: newId(), type: 'flight', name: [airline?.name || bp.carrier, bp.number.split(' ').pop()].filter(Boolean).join(' ') || 'Vlucht', date: bp.date || '', note: '', score: '', f: { airline: airline?.name || bp.carrier, ...(airline ? { airlineCode: airline.code } : {}), number: bp.number, from: bp.from, to: bp.to, ref: bp.pnr || '', pax: [{ name: bp.name, seat: bp.seat, cls: bp.cls }] } };
      newFlights.set(item.id, item);
      s.close(); insertFlight(at, { id: item.id, from: bp.from, to: bp.to, number: bp.number, date: bp.date || '' });
      toast(`${bp.name} · ${bp.number} ingelezen`);
    });
  }
  function landSheet(at) {
    const nxVia = S.route[at + 1]?.via;
    let mode = nxVia && nxVia !== 'plane' && LAND_MODES.includes(nxVia) ? nxVia : (S.route[at].t === 'ap' ? 'car' : 'car');
    const s = openSheet(`<h2>Welk land?</h2><div><div class="label" style="margin-bottom:8px">Hoe kwam je er?</div><div class="tf-chips">${LAND_MODES.map(m => `<button type="button" class="tf-chip${m === mode ? ' on' : ''}" data-m="${m}">${ic(modeIcon(m), 18)}${modeName(m)}</button>`).join('')}</div></div>
      <input class="tf-search" placeholder="Zoek een land" aria-label="Zoek een land" enterkeyhint="search"><div class="tf-clist"></div>`, { title: 'Land kiezen' });
    const listEl = s.el.querySelector('.tf-clist');
    const fill = q => { listEl.innerHTML = searchCountries(q, 300).filter(c => c.c !== home).sort((a, b) => a.n.localeCompare(b.n)).map(c => `<button type="button" class="tf-citem" data-c="${c.c}">${flag(c.c)}${esc(c.n)}</button>`).join(''); };
    fill(''); s.el.querySelector('.tf-search').addEventListener('input', e => fill(e.target.value));
    s.el.addEventListener('click', e => {
      const m = e.target.closest('[data-m]');
      if (m) { mode = m.dataset.m; s.el.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === m)); return; }
      const c = e.target.closest('[data-c]'); if (!c) return;
      readTop();
      S.route.splice(at + 1, 0, { t: 'land', c: c.dataset.c, st: 'v', via: mode });
      const nx = S.route[at + 2]; if (nx && nx.t === 'home' && !nx.via) nx.via = mode === 'plane' ? 'car' : mode;
      s.close(); draw();
    });
  }
  function flightSheet(at) {
    const prev = S.route[at];
    const from0 = prev.t === 'ap' ? prev.code : prev.t === 'land' && prev.fl?.to && ctryOfAp(prev.fl.to) === prev.c ? prev.fl.to : '';
    const date0 = at === 0 ? S.start : (S.route[at + 1]?.t === 'home' ? S.end : '');
    const s = openSheet(`<h2>Vlucht</h2>
      <div class="two2"><div class="pl"><div class="label">Van</div><input class="titel-in" data-f="from" value="${esc(from0)}" placeholder="BRU"></div><div class="pl"><div class="label">Naar</div><input class="titel-in" data-f="to" placeholder="LIS"></div></div>
      <div class="pair"><div class="field"><label>Datum</label><input type="date" data-f="date" value="${esc(date0)}"></div><div class="field"><label>Vluchtnummer</label><input data-f="number" placeholder="TP 573"></div></div>
      <div class="pair"><div class="field"><label>Vertrek</label><input type="time" data-f="dep"></div><div class="field"><label>Aankomst</label><input type="time" data-f="arr"></div></div>
      <p class="muted" role="alert" style="margin:0;color:var(--danger)"></p>
      <button type="button" class="btn primary" data-ok>Toevoegen</button>`, { title: 'Vlucht' });
    s.el.querySelectorAll('.titel-in').forEach(inp => attachAirportSearch(inp));
    s.el.addEventListener('click', e => {
      if (!e.target.closest('[data-ok]')) return;
      const v = k => s.el.querySelector(`[data-f="${k}"]`).value.trim();
      const from = v('from').toUpperCase(), to = v('to').toUpperCase();
      const err = s.el.querySelector('[role=alert]');
      if (!airportByCode(from) || !airportByCode(to)) { err.textContent = 'Kies een luchthaven bij Van en Naar.'; return; }
      if (from === to) { err.textContent = 'Van en Naar zijn dezelfde luchthaven.'; return; }
      const id = newId(), number = v('number').toUpperCase();
      newFlights.set(id, { id, type: 'flight', name: number || `${from} → ${to}`, date: v('date'), note: '', score: '', f: { number, from, to, ...(v('dep') ? { dep: v('dep') } : {}), ...(v('arr') ? { arr: v('arr') } : {}) } });
      readTop(); s.close(); insertFlight(at, { id, from, to, number, date: v('date'), dep: v('dep'), arr: v('arr') });
    });
  }
  function insertFlight(at, fl) {
    const r = S.route, prev = r[at], ins = [];
    const fromC = ctryOfAp(fl.from), toC = ctryOfAp(fl.to);
    // Vertrek: vanuit thuis of een ander land eerst naar de luchthaven; vanuit hetzelfde land vertrekt de vlucht daar gewoon.
    if (prev.t === 'home' || (prev.t === 'land' && prev.c !== fromC) || (prev.t === 'ap' && prev.code !== fl.from)) ins.push({ t: 'ap', code: fl.from, via: prev.t === 'home' ? null : (prev.t === 'ap' ? null : 'car') });
    // Aankomst: thuisland = luchthaven; anders meteen het land.
    if (toC === home) ins.push({ t: 'ap', code: fl.to, via: 'plane', fl });
    else ins.push({ t: 'land', c: toC, st: 'v', via: 'plane', fl });
    r.splice(at + 1, 0, ...ins);
    relay(); draw();
  }
  // Een luchthaven of land waar je meteen weer verder vliegt is een overstap.
  function relay() {
    const r = S.route;
    for (let i = 1; i < r.length - 1; i++) { const s = r[i], n = r[i + 1]; if (s.t === 'ap') s.lay = s.via === 'plane' && n?.via === 'plane' && n.t !== 'home'; }
  }
  function linkSheet(i) {
    const n = S.route[i], p = S.route[i - 1];
    if (n.via === 'plane' && n.fl) {   // vlucht: aanpassen gebeurt in de reis zelf (vlucht openen); hier enkel verwijderen
      const s = openSheet(`<h2>${esc(n.fl.from)} → ${esc(n.fl.to)}</h2><p class="muted" style="margin:0">${esc(flightLabel(n.fl))}${n.fl.date ? ' · ' + esc(fmtDate(n.fl.date)) : ''}</p>
        <p class="muted" style="margin:0">Details zoals stoelen en tijden pas je aan door de vlucht in de reis te openen.</p>
        <button type="button" class="btn" data-del style="color:var(--danger)">Vlucht verwijderen</button>`, { title: 'Vlucht' });
      s.el.addEventListener('click', e => { if (e.target.closest('[data-del]')) { readTop(); removeFlightAt(i); s.close(); draw(); } });
      return;
    }
    const toAp = (p.t === 'home' && n.t === 'ap') || (p.t === 'ap' && n.t === 'home');
    const opts = toAp ? Object.keys(AP_MODES) : LAND_MODES;
    const s = openSheet(`<h2>${toAp ? (p.t === 'home' ? 'Naar de luchthaven' : 'Van de luchthaven naar huis') : 'Vervoer'}</h2>
      <div class="tf-chips">${opts.map(m => `<button type="button" class="tf-chip${m === n.via ? ' on' : ''}" data-m="${m}">${ic(modeIcon(m), 18)}${modeName(m)}</button>`).join('')}</div>
      ${toAp ? `<div class="field"><label>Notitie (optioneel)</label><input data-note value="${esc(n.note || '')}" placeholder="Bijvoorbeeld parking of trein-uur"></div>` : ''}
      <button type="button" class="btn primary" data-ok>Klaar</button>`, { title: 'Vervoer' });
    let pick = n.via;
    s.el.addEventListener('click', e => {
      const m = e.target.closest('[data-m]');
      if (m) { pick = pick === m.dataset.m && toAp ? null : m.dataset.m; s.el.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x.dataset.m === pick)); return; }
      if (e.target.closest('[data-ok]')) { readTop(); n.via = pick; if (toAp) n.note = s.el.querySelector('[data-note]').value.trim(); s.close(); draw(); }
    });
  }
  function removeFlightAt(i) {
    const n = S.route[i];
    if (n.fl?.id) { if (newFlights.has(n.fl.id)) newFlights.delete(n.fl.id); else removed.add(n.fl.id); }
    if (n.t === 'land') { n.via = 'car'; delete n.fl; }
    else S.route.splice(i, 1);
    // een vertrekluchthaven zonder vlucht meer erna mag ook weg
    S.route = S.route.filter((x, k, a) => !(x.t === 'ap' && a[k + 1]?.via !== 'plane' && !(x.via === 'plane')));
    relay();
  }
  function nodeSheet(i) {
    const n = S.route[i];
    if (n.t === 'home') { toast('Thuis staat altijd aan het begin en het einde.'); return; }
    if (n.t === 'ap') {
      const s = openSheet(`<h2>${esc(n.code)} · ${esc(apName(n.code))}</h2><p class="muted" style="margin:0">${n.lay ? 'Overstap' : 'Luchthaven'} op je Reisweg.</p>
        <button type="button" class="btn" data-del style="color:var(--danger)">Luchthaven en vlucht verwijderen</button>`, { title: n.code });
      s.el.addEventListener('click', e => {
        if (!e.target.closest('[data-del]')) return;
        readTop();
        const nx = S.route[i + 1];
        if (n.fl?.id) { if (newFlights.has(n.fl.id)) newFlights.delete(n.fl.id); else removed.add(n.fl.id); }
        if (nx?.via === 'plane' && nx.fl?.id) { if (newFlights.has(nx.fl.id)) newFlights.delete(nx.fl.id); else removed.add(nx.fl.id); if (nx.t === 'land') { nx.via = 'car'; delete nx.fl; } }
        S.route.splice(i, 1);
        S.route = S.route.filter((x, k, a) => !(x.t === 'ap' && x.via !== 'plane' && a[k + 1]?.via !== 'plane'));
        relay(); s.close(); draw();
      });
      return;
    }
    const s = openSheet(`<h2>${esc(nameOf(n.c))}</h2><div class="seg" role="group">${[['v', 'Bezocht'], ['o', 'Overstap'], ['d', 'Doorgereden']].map(([k, t]) => `<button type="button" data-st="${k}" aria-pressed="${n.st === k}">${t}</button>`).join('')}</div>
      <p class="muted" style="margin:0">Overstap en doorgereden tellen niet mee als bezocht land.</p>
      <button type="button" class="btn" data-del style="color:var(--danger)">Land verwijderen</button>`, { title: nameOf(n.c) });
    s.el.addEventListener('click', e => {
      const b = e.target.closest('[data-st]');
      if (b) { readTop(); n.st = b.dataset.st; s.close(); draw(); return; }
      if (e.target.closest('[data-del]')) {
        readTop();
        if (n.fl?.id) { if (newFlights.has(n.fl.id)) newFlights.delete(n.fl.id); else removed.add(n.fl.id); }
        S.route.splice(i, 1);
        S.route = S.route.filter((x, k, a) => !(x.t === 'ap' && x.via !== 'plane' && a[k + 1]?.via !== 'plane'));
        if (empty()) S.route[1].via = null;
        relay(); s.close(); draw();
      }
    });
  }

  // ---- opslaan: Reisweg → legs, heen/terug, vluchten, vervoer naar de luchthaven ----
  function save() {
    readTop();
    const pend = sh.el.querySelector('#tf-mate')?.value.trim().replace(/\s+/g, ' ');
    if (pend && !S.mates.some(m => m.toLowerCase() === pend.toLowerCase())) S.mates.push(pend);
    if (!S.start) return draw('Kies een startdatum.');
    if (S.end && S.end < S.start) return draw('Het einde ligt voor de start.');
    const r = S.route, lands = r.map((x, i) => x.t === 'land' ? i : -1).filter(i => i >= 0);
    if (!S.title && !lands.length) return draw('Geef een naam of voeg minstens één land toe.');
    const fi = lands[0] ?? r.length - 1, li = lands[lands.length - 1] ?? 0;
    const legs = lands.map(i => { const x = r[i]; return { mode: x.via && MODES[x.via] ? x.via : (x.legMode || 'car'), c: x.c, ...(x.st !== 'v' ? { transit: true } : {}) }; });
    // terug naar huis met ander vervoer dan het laatste stuk (bv. trein heen, bus terug): als doorgereden thuisland bewaren
    const endVia = r[r.length - 1].via;
    if (legs.length && legs[0].mode !== 'plane' && r[r.length - 2]?.t === 'land' && endVia && MODES[endVia] && endVia !== legs[legs.length - 1].mode) legs.push({ mode: endVia, c: home, transit: true });
    const step = x => ({ mode: 'plane', from: x.fl.from, to: x.fl.to, ...(x.fl.id ? { flight: x.fl.id } : {}) });
    const heen = r.slice(1, fi + 1).filter(x => x.via === 'plane' && x.fl).map(step);
    const terug = lands.length ? r.slice(li + 1).filter(x => x.via === 'plane' && x.fl).map(step) : [];
    const base = trip ? structuredClone(trip) : { id: newId(), items: [] };
    // vluchten: verwijderde eruit, nieuwe erbij (met Heenreis/Terugreis waar ze staan)
    const partOf = id => heen.some(s => s.flight === id) ? 'heen' : terug.some(s => s.flight === id) ? 'terug' : '';
    let items = (base.items || []).filter(x => !removed.has(x.id));
    for (const f of newFlights.values()) { const p = partOf(f.id); items.push(p ? { ...f, f: { ...f.f, part: p } } : f); }
    const clean = { ...base, title: S.title, start: S.start, end: S.end || S.start, legs, items };
    if (S.mates.length) clean.mates = [...S.mates]; else delete clean.mates;
    if (heen.length) clean.heen = heen; else delete clean.heen;
    if (terug.length) clean.terug = terug; else delete clean.terug;
    if (legs.length && legs[0].mode !== 'plane') clean.from = home; else delete clean.from;
    const apH = r[1]?.t === 'ap' && r[1].via && AP_MODES[r[1].via] ? { mode: r[1].via, ...(r[1].note ? { note: r[1].note } : {}) } : null;
    const last = r[r.length - 1], apT = r[r.length - 2]?.t === 'ap' && last.via && AP_MODES[last.via] ? { mode: last.via, ...(last.note ? { note: last.note } : {}) } : null;
    if (apH || apT) clean.ap = { ...(apH ? { heen: apH } : {}), ...(apT && (!apH || apT.mode !== apH.mode || apT.note) ? { same: false, terug: apT } : {}) }; else delete clean.ap;
    update(st => {
      for (const f of newFlights.values()) for (const k of ['from', 'to']) ensureMyAirport(st, airportByCode(f.f[k]), newId);
      const i = st.trips.findIndex(t => t.id === clean.id);
      if (i >= 0) st.trips[i] = clean; else st.trips.push(clean);
      const y = parseInt(clean.start.slice(0, 4), 10);
      for (const c of new Set(legs.filter(l => !l.transit).map(l => l.c))) {
        const cur = st.countries[c] || {};
        if (cur.s !== 'v') st.countries[c] = { ...cur, s: 'v', y };
        else if (!cur.y) st.countries[c] = { ...cur, y };
      }
    });
    sh.close();
    toast('Reis opgeslagen');
    onSaved?.(clean);
  }

  sh.el.addEventListener('click', e => {
    const a = e.target.closest('[data-add]'); if (a) { readTop(); return addSheet(+a.dataset.add); }
    const l = e.target.closest('[data-link]'); if (l) { readTop(); return linkSheet(+l.dataset.link); }
    const n = e.target.closest('[data-node]'); if (n) { readTop(); return nodeSheet(+n.dataset.node); }
    if (e.target.closest('[data-more]')) { readTop(); S.more = !S.more; draw(); return; }
    if (e.target.closest('[data-addm]')) { readTop(); const v = sh.el.querySelector('#tf-mate').value.trim().replace(/\s+/g, ' '); if (v && !S.mates.some(m => m.toLowerCase() === v.toLowerCase())) S.mates.push(v); draw(); sh.el.querySelector('#tf-mate')?.focus(); return; }
    const rm = e.target.closest('[data-rmm]'); if (rm) { readTop(); S.mates.splice(+rm.dataset.rmm, 1); draw(); return; }
    if (e.target.closest('[data-save]')) save();
  });
  sh.el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'tf-mate') { e.preventDefault(); sh.el.querySelector('[data-addm]').click(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-node]')) { e.preventDefault(); e.target.click(); }
  });
  draw();
  return sh;
}
