// Achtbanen en credits (test: Energylandia). Bron van de data: Coasterpedia (CC BY-SA 4.0).
import { get, subscribe, update } from '../store.js';
import { flag, nameOf } from '../data.js';
import { esc, ic, openSheet, toast, fmtDate, fmtRange } from '../ui.js';

const SCORES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const num = n => String(n).replace('.', ',');
const link = c => `https://coasterpedia.net/w/index.php?search=${encodeURIComponent(c.name + ' ' + c.park)}`;

const SEAT_NAMES = { 1: ['plek'], 2: ['links', 'rechts'], 3: ['links', 'midden', 'rechts'], 4: ['links buiten', 'links binnen', 'rechts binnen', 'rechts buiten'] };
const ROW_NAMES = { 2: ['voorste rij', 'achterste rij'], 3: ['voorste rij', 'middelste rij', 'achterste rij'] };
/** 'Wagon 3 · voorste rij · links' voor een zitje in de getekende trein (wagon 1 = voorop). */
export function seatLabel(t, pos) {
  if (!t || !pos) return '';
  const parts = [];
  if (t.cars > 1) parts.push(`Wagon ${pos.car + 1}`);
  if (t.rows > 1) parts.push((ROW_NAMES[t.rows] || [])[pos.row] || `rij ${pos.row + 1}`);
  parts.push((SEAT_NAMES[t.across] || [])[pos.col] || `plaats ${pos.col + 1}`);
  return parts.join(' · ');
}
function trainHtml(t, pos) {
  const cars = [];
  for (let car = 0; car < t.cars; car++) {
    let rows = '';
    for (let row = 0; row < t.rows; row++) {
      let seats = '';
      for (let col = 0; col < t.across; col++) {
        const on = pos && pos.car === car && pos.row === row && pos.col === col;
        const lab = seatLabel(t, { car, row, col });
        seats += `<button type="button" class="tseat${on ? ' on' : ''}" data-seat="${car}.${row}.${col}" aria-label="${esc(lab)}" aria-pressed="${on}"></button>`;
      }
      rows += `<div class="trow">${seats}</div>`;
    }
    cars.push(`<div class="tcar"><span class="tcarn">${t.cars > 1 ? car + 1 : ''}</span>${rows}</div>`);
  }
  return `<div class="train-wrap"><div class="train-front">▲ voorkant</div>${cars.join('')}</div>`;
}

let db = null;
async function load() {
  db ||= await fetch('data/coasters.json').then(r => r.json()).catch(() => []);
  return db;
}

/** Een credit bestaat uit ritten: { rides: [{ date, score, seat }] }. Oude opslag met een aantal ritten wordt omgezet. */
export function ridesOf(cr) {
  if (!cr) return [];
  if (Array.isArray(cr.rides)) return cr.rides;
  const n = Math.max(1, parseInt(cr.rides, 10) || 1);
  return Array.from({ length: n }, (_, i) => i === 0 ? { date: cr.date || '', score: cr.score || '', seat: '' } : { date: '', score: '', seat: '' });
}
/** Gemiddelde van de scores van alle ritten (op één decimaal), of '' zonder scores. */
const avgScore = rides => {
  const v = rides.map(r => parseFloat(r.score)).filter(n => !isNaN(n));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : '';
};
const uniqDates = rides => [...new Set(rides.map(r => r.date).filter(Boolean))].sort();
/** '8 sep, 10 sep 2026' (jaar alleen achteraan als alle datums in hetzelfde jaar liggen). */
const datesText = ds => {
  if (!ds.length) return '';
  const shown = ds.slice(0, 4).map(fmtDate), more = ds.length - shown.length;
  const sameYear = new Set(ds.map(d => d.slice(0, 4))).size === 1;
  const out = sameYear ? shown.map((t, i) => i < shown.length - 1 || more ? t.replace(/ \d{4}$/, '') : t) : shown;
  return out.join(', ') + (more ? ` +${more}` : '');
};

const lastDate = rides => rides.map(r => r.date).filter(Boolean).sort().pop() || '';

function openCredit(c, { addRide = false, focus = -1 } = {}) {
  const cur = get().credits[c.id];
  const draft = ridesOf(cur).map(r => ({ ...r }));
  if (!draft.length) draft.push({ date: '', score: '', seat: '' });
  else if (addRide) draft.push({ date: [...draft].reverse().find(r => r.date)?.date || '', score: '', seat: '' });
  let openIdx = -1;
  const sh = openSheet('', { title: c.name });
  const rideRow = (r, i) => `<div class="ride" data-ride>
      <div class="ride-h"><strong>Rit ${i + 1}</strong>${draft.length > 1 ? `<button type="button" class="icon-btn" data-delride aria-label="Rit ${i + 1} verwijderen" style="background:var(--bg);width:40px;height:40px">${ic('trash', 18)}</button>` : ''}</div>
      <div class="pair">
        <div class="field"><label>Datum</label><input name="date" type="date" value="${esc(r.date || '')}"></div>
        <div class="field"><label>Score (optioneel)</label><select name="score"><option value="">Geen score</option>${SCORES.map(n => `<option value="${n}"${String(r.score) === String(n) ? ' selected' : ''}>★ ${num(n)}</option>`).join('')}</select></div>
      </div>
      ${c.train ? `<div class="field"><label>Plaats in de trein (optioneel)</label>
        <button type="button" class="seatbtn" data-pick="${i}" aria-expanded="${openIdx === i}">${r.pos ? esc(seatLabel(c.train, r.pos)) : '<span class="muted">Kies je plaats in de trein</span>'}${ic('chev', 18)}</button>
        ${openIdx === i ? trainHtml(c.train, r.pos) : ''}</div>`
      : `<div class="field"><label>Plaats in de trein (optioneel)</label><input name="seat" value="${esc(r.seat || '')}" placeholder="Bijvoorbeeld rij 3 of voorin" autocomplete="off"></div>`}
    </div>`;
  const read = () => {
    const rows = [...sh.el.querySelectorAll('[data-ride]')];
    if (!rows.length) return;
    const old = draft.slice();
    draft.length = 0;
    rows.forEach((r, i) => draft.push({ date: r.querySelector('[name=date]').value, score: r.querySelector('[name=score]').value, seat: r.querySelector('[name=seat]')?.value.trim() ?? old[i]?.seat ?? '', ...(old[i]?.pos ? { pos: old[i].pos } : {}) }));
  };
  const render = () => sh.setHtml(`<h2>${esc(c.name)}</h2>
    <p class="muted" style="margin:-6px 0 14px">${esc([c.maker, c.year, c.type].filter(Boolean).join(' · '))}</p>
    <form class="form" novalidate>
      ${draft.map(rideRow).join('')}
      <button type="button" class="btn soft" data-addride style="align-self:flex-start">${ic('plus', 18)}Nieuwe rit</button>
      <a class="btn soft" href="${link(c)}" target="_blank" rel="noopener" style="align-self:flex-start">Bekijk op Coasterpedia</a>
      <div class="pair">${cur ? '<button type="button" class="btn danger" data-del>Credit verwijderen</button>' : '<button type="button" class="btn" data-close>Annuleren</button>'}<button type="submit" class="btn primary">${cur ? 'Opslaan' : 'Credit toevoegen'}</button></div>
    </form>`);
  render();
  if (focus >= 0) sh.el.querySelectorAll('[data-ride]')[focus]?.scrollIntoView({ block: 'center' });
  sh.el.addEventListener('click', e => {
    const pk = e.target.closest('[data-pick]');
    if (pk) { read(); const i = +pk.dataset.pick; openIdx = openIdx === i ? -1 : i; render(); return; }
    const st = e.target.closest('[data-seat]');
    if (st) {
      read();
      const [car, row, col] = st.dataset.seat.split('.').map(Number), r = draft[openIdx];
      if (r) { if (r.pos && r.pos.car === car && r.pos.row === row && r.pos.col === col) { delete r.pos; r.seat = ''; } else { r.pos = { car, row, col }; r.seat = seatLabel(c.train, r.pos); } }
      openIdx = -1; render(); return;
    }
    if (e.target.closest('[data-addride]')) { read(); draft.push({ date: [...draft].reverse().find(r => r.date)?.date || '', score: '', seat: '' }); render(); sh.el.querySelectorAll('[data-ride]')[draft.length - 1]?.querySelector('[name=date]').focus(); return; }
    const d = e.target.closest('[data-delride]');
    if (d) { read(); const i = [...sh.el.querySelectorAll('[data-ride]')].indexOf(d.closest('[data-ride]')); draft.splice(i, 1); openIdx = -1; render(); return; }
    if (e.target.closest('[data-del]')) { update(st => { delete st.credits[c.id]; }); sh.close(); toast('Credit verwijderd'); }
  });
  sh.el.addEventListener('submit', e => {
    e.preventDefault();
    read();
    for (let i = 1; i < draft.length; i++) if (!draft[i].date) draft[i].date = draft[i - 1].date;
    update(st => { st.credits[c.id] = { rides: draft }; });
    sh.close();
    toast(cur ? 'Opgeslagen' : 'Credit toegevoegd');
  });
}

const CATS = ['Thrill', 'Familie', 'Kinderen'];
const cat = c => /kiddie/i.test(c.type) ? 'Kinderen' : /hyper|launch|invert|hybrid|water|wing/i.test(c.type) ? 'Thrill' : 'Familie';
/** Ritten per datum (oplopend), elk met zijn oorspronkelijke index. */
function rideGroups(cr) {
  const m = new Map();
  cr.forEach((r, i) => { const k = r.date || ''; if (!m.has(k)) m.set(k, []); m.get(k).push({ ...r, i }); });
  return [...m].sort((x, y) => !x[0] ? 1 : !y[0] ? -1 : x[0].localeCompare(y[0]));
}
/** Opeenvolgende dagen samengevoegd tot één label: 9–10 sep 2026; losse dagen blijven apart. */
const dateChips = ds => {
  const day = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const runs = [];
  for (const d of ds) {
    const last = runs[runs.length - 1];
    if (last && day(d) - day(last.to) === 86400000) last.to = d; else runs.push({ from: d, to: d });
  }
  return runs.map(r => `<span class="chip a">${esc(r.from === r.to ? fmtDate(r.from) : fmtRange(r.from, r.to))}</span>`).join('');
};

function openPicker(coasters) {
  const sh = openSheet(`<h2>Nieuwe rit</h2><p class="muted" style="margin:-6px 0 12px">Kies de baan</p>
    <div class="list">${coasters.map(c => {
      const n = ridesOf(get().credits[c.id]).length;
      return `<button type="button" class="list-row pick" data-pick="${esc(c.id)}"><div class="grow"><div class="t">${esc(c.name)}</div><div class="s">${esc([c.maker, c.year].filter(Boolean).join(' · '))}${n ? ` · ${n}× gereden` : ''}</div></div>${ic('chev', 20)}</button>`;
    }).join('')}</div>`, { title: 'Nieuwe rit' });
  sh.el.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const c = coasters.find(x => x.id === b.dataset.pick);
    sh.close();
    if (c) openCredit(c, { addRide: ridesOf(get().credits[c.id]).length > 0 });
  });
}

export function mount(el) {
  let off = false;
  const openGroups = new Set(['Thrill']);
  const openCards = new Set();
  const draw = () => {
    if (off || !db) return;
    const credits = get().credits;
    const parks = [...new Set(db.map(c => c.park))];
    const all = db.filter(c => c.status === 'open');
    const allRides = all.flatMap(c => ridesOf(credits[c.id]));
    const kAvg = avgScore(allRides), kLast = lastDate(allRides);
    el.innerHTML = `<div class="page credits-page">
      <header class="page-head"><a class="icon-btn" href="#/paspoort" aria-label="Terug naar Paspoort">${ic('back', 26)}</a><h1>Achtbanen</h1>
        <button type="button" class="gplus" data-new aria-label="Nieuwe rit toevoegen">${ic('plus', 24)}</button></header>
      ${parks.map(park => {
        const list = db.filter(c => c.park === park);
        const open = list.filter(c => c.status === 'open');
        const done = open.filter(c => ridesOf(credits[c.id]).length)
          .sort((x, y) => lastDate(ridesOf(credits[y.id])).localeCompare(lastDate(ridesOf(credits[x.id]))) || x.name.localeCompare(y.name, 'nl'));
        const todo = open.filter(c => !ridesOf(credits[c.id]).length);
        const soon = list.filter(c => c.status !== 'open');
        const pct = open.length ? Math.round(done.length / open.length * 100) : 0;
        const pr = done.flatMap(c => ridesOf(credits[c.id]));
        return `<div class="hero2">
          <section class="card"><div class="park-row">${flag(list[0].c)}<div><h2>${esc(park)}</h2><div class="muted">${esc(nameOf(list[0].c))}</div></div>
            <span class="big" style="margin-left:auto;font-size:34px">${done.length}<small> / ${open.length}</small></span></div>
            <div class="bar" style="height:10px;border-radius:5px;margin-top:12px"><i style="width:${pct}%"></i></div></section>
          <section class="card kpis"><div><b>${pr.length}</b><span>${pr.length === 1 ? 'rit' : 'ritten'}</span></div><div><b>${kAvg ? '★ ' + esc(num(kAvg)) : '–'}</b><span>gemiddeld</span></div><div><b style="font-size:16px">${kLast ? esc(fmtDate(kLast)) : '–'}</b><span>laatst gereden</span></div></section>
        </div>
        ${done.length ? `<div class="sec-h"><h2>Gereden</h2><span class="muted">${done.length}</span></div>
        <div class="ride-cards app-only">${done.map(c => {
          const cr = ridesOf(credits[c.id]), sc = avgScore(cr), ds = uniqDates(cr), o = openCards.has(c.id);
          return `<div class="ride-card${o ? ' open' : ''}"><button type="button" class="rc-head" data-exp="${esc(c.id)}" aria-expanded="${o}"><div class="rc-top"><div class="rc-t"><b>${esc(c.name)}</b><div class="s">${esc([c.maker, c.year, c.type].filter(Boolean).join(' · '))}</div></div>
            <div class="rc-score">${sc ? `<div class="sc">★ ${esc(num(sc))}</div>` : ''}<small>${cr.length} ${cr.length === 1 ? 'rit' : 'ritten'}</small></div><span class="rc-chev">${ic('chev', 18)}</span></div>
            ${o ? '' : `<div class="chips">${dateChips(ds)}</div>`}</button>
            ${o ? `<div class="rc-body">${rideGroups(cr).map(([k, l]) => `<div class="rc-gh"><b>${k ? esc(fmtDate(k)) : 'Zonder datum'}</b><span>${l.length} ${l.length === 1 ? 'rit' : 'ritten'}</span></div>
              ${l.map(r => `<button type="button" class="rc-tile" data-ride="${esc(c.id)}:${r.i}"><div class="l1"><b>Rit ${r.i + 1}</b>${r.score ? `<span class="st">★ ${esc(num(r.score))}</span>` : ''}</div><div class="l2">${r.seat ? esc(r.seat) : '<span class="muted">Geen plaats</span>'}</div></button>`).join('')}`).join('')}</div>` : ''}</div>`;
        }).join('')}</div>
        <div class="ctable site-only"><div class="ctr cth"><span>Baan</span><span>Fabrikant · jaar</span><span>Score</span><span>Ritten</span><span>Datums</span><span></span></div>
          ${done.map(c => {
            const cr = ridesOf(credits[c.id]), sc = avgScore(cr), ds = uniqDates(cr), o = openCards.has(c.id);
            return `<button type="button" class="ctr${o ? ' open' : ''}" data-exp="${esc(c.id)}" aria-expanded="${o}"><b>${esc(c.name)}</b><span class="muted">${esc([c.maker, c.year].filter(Boolean).join(' · '))}</span><span class="csc">${sc ? '★ ' + esc(num(sc)) : ''}</span><span>${cr.length}</span><span class="cds">${dateChips(ds)}</span><span class="rc-chev">${ic('chev', 18)}</span></button>
            ${o ? `<div class="csub"><div class="crr crh"><span>Datum</span><span>Rit</span><span>Plaats in de trein</span><span style="text-align:right">Score</span><span></span></div>
              ${cr.map((r, i) => ({ ...r, i })).sort((x, y) => (x.date || '9').localeCompare(y.date || '9') || x.i - y.i).map(r => `<button type="button" class="crr" data-ride="${esc(c.id)}:${r.i}"><span>${r.date ? esc(fmtDate(r.date)) : '<span class="muted">Zonder datum</span>'}</span><b>Rit ${r.i + 1}</b><span>${r.seat ? esc(r.seat) : '<span class="muted">Geen plaats</span>'}</span><span class="cst">${r.score ? '★ ' + esc(num(r.score)) : ''}</span>${ic('chev', 18)}</button>`).join('')}</div>` : ''}`;
          }).join('')}</div>` : ''}
        <div class="sec-h"><h2>Nog te rijden</h2><span class="muted">${todo.length}${soon.length ? ` · ${soon.length} binnenkort` : ''}</span></div>
        <div class="groups">${CATS.map(g => {
          const l = todo.filter(c => cat(c) === g), sn = soon.filter(c => cat(c) === g);
          if (!l.length && !sn.length) return '';
          const o = openGroups.has(g);
          return `<div class="grp2${o ? ' open' : ''}"><button type="button" class="grp2-h" data-g="${g}" aria-expanded="${o}">${ic('chev', 18)}<span>${g}</span><span class="cnt">${l.length}</span></button>
            ${o ? l.map(c => `<button type="button" class="todo" data-c="${esc(c.id)}"><div class="grow"><div class="t">${esc(c.name)}</div><div class="s">${esc([c.maker, c.year].filter(Boolean).join(' · '))}</div></div>${ic('plus', 20)}</button>`).join('')
              + sn.map(c => `<div class="todo soon" aria-disabled="true"><div class="grow"><div class="t">${esc(c.name)}</div><div class="s">${esc(c.maker || '')}</div></div><span class="muted soon-l">Binnenkort</span></div>`).join('') : ''}</div>`;
        }).join('')}</div>`;
      }).join('')}
      <p class="muted" style="text-align:center;font-size:13px;margin-top:16px">Data: <a href="https://coasterpedia.net" target="_blank" rel="noopener" style="color:inherit">Coasterpedia</a> (CC BY-SA 4.0)</p>
    </div>`;
  };
  const onClick = e => {
    if (e.target.closest('[data-new]')) { openPicker(db.filter(c => c.status === 'open')); return; }
    const rb = e.target.closest('[data-ride]');
    if (rb) { const [cid, i] = rb.dataset.ride.split(':'); const c = db.find(x => x.id === cid); if (c) openCredit(c, { focus: +i }); return; }
    const ex = e.target.closest('[data-exp]');
    if (ex) { openCards.has(ex.dataset.exp) ? openCards.delete(ex.dataset.exp) : openCards.add(ex.dataset.exp); draw(); return; }
    const g = e.target.closest('[data-g]');
    if (g) { openGroups.has(g.dataset.g) ? openGroups.delete(g.dataset.g) : openGroups.add(g.dataset.g); draw(); return; }
    const b = e.target.closest('[data-c]');
    if (b) { const c = db.find(x => x.id === b.dataset.c); if (c) openCredit(c); }
  };
  el.addEventListener('click', onClick);
  load().then(() => draw());
  const unsub = subscribe(draw);
  return () => { off = true; unsub(); el.removeEventListener('click', onClick); };
}
