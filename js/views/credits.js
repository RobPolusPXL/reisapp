// Achtbanen en credits (test: Energylandia). Bron van de data: Coasterpedia (CC BY-SA 4.0).
import { get, subscribe, update } from '../store.js';
import { flag, nameOf } from '../data.js';
import { esc, ic, openSheet, toast, fmtDate } from '../ui.js';

const SCORES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const num = n => String(n).replace('.', ',');
const link = c => `https://coasterpedia.net/w/index.php?search=${encodeURIComponent(c.name + ' ' + c.park)}`;

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
const lastScore = rides => [...rides].reverse().find(r => r.score)?.score || '';
const lastDate = rides => rides.map(r => r.date).filter(Boolean).sort().pop() || '';

function openCredit(c) {
  const cur = get().credits[c.id];
  const draft = ridesOf(cur).map(r => ({ ...r }));
  if (!draft.length) draft.push({ date: '', score: '', seat: '' });
  const sh = openSheet('', { title: c.name });
  const rideRow = (r, i) => `<div class="ride" data-ride>
      <div class="ride-h"><strong>Rit ${i + 1}</strong>${draft.length > 1 ? `<button type="button" class="icon-btn" data-delride aria-label="Rit ${i + 1} verwijderen" style="background:var(--bg);width:40px;height:40px">${ic('trash', 18)}</button>` : ''}</div>
      <div class="pair">
        <div class="field"><label>Datum</label><input name="date" type="date" value="${esc(r.date || '')}"></div>
        <div class="field"><label>Score (optioneel)</label><select name="score"><option value="">Geen score</option>${SCORES.map(n => `<option value="${n}"${String(r.score) === String(n) ? ' selected' : ''}>★ ${num(n)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Plaats in de trein (optioneel)</label><input name="seat" value="${esc(r.seat || '')}" placeholder="Bijvoorbeeld rij 3 of voorin" autocomplete="off"></div>
    </div>`;
  const read = () => {
    const rows = [...sh.el.querySelectorAll('[data-ride]')];
    if (!rows.length) return;
    draft.length = 0;
    for (const r of rows) draft.push({ date: r.querySelector('[name=date]').value, score: r.querySelector('[name=score]').value, seat: r.querySelector('[name=seat]').value.trim() });
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
  sh.el.addEventListener('click', e => {
    if (e.target.closest('[data-addride]')) { read(); draft.push({ date: '', score: '', seat: '' }); render(); sh.el.querySelectorAll('[data-ride]')[draft.length - 1]?.querySelector('[name=date]').focus(); return; }
    const d = e.target.closest('[data-delride]');
    if (d) { read(); const i = [...sh.el.querySelectorAll('[data-ride]')].indexOf(d.closest('[data-ride]')); draft.splice(i, 1); render(); return; }
    if (e.target.closest('[data-del]')) { update(st => { delete st.credits[c.id]; }); sh.close(); toast('Credit verwijderd'); }
  });
  sh.el.addEventListener('submit', e => {
    e.preventDefault();
    read();
    update(st => { st.credits[c.id] = { rides: draft }; });
    sh.close();
    toast(cur ? 'Opgeslagen' : 'Credit toegevoegd');
  });
}

export function mount(el) {
  let off = false;
  const draw = () => {
    if (off || !db) return;
    const credits = get().credits;
    const parks = [...new Set(db.map(c => c.park))];
    el.innerHTML = `<div class="page">
      <header class="page-head"><a class="icon-btn" href="#/paspoort" aria-label="Terug naar Paspoort">${ic('back', 26)}</a><h1>Achtbanen</h1></header>
      ${parks.map(park => {
        const list = db.filter(c => c.park === park).sort((x, y) => {
          const rx = ridesOf(credits[x.id]), ry = ridesOf(credits[y.id]);
          if (!!rx.length !== !!ry.length) return rx.length ? -1 : 1;
          if (rx.length) return lastDate(ry).localeCompare(lastDate(rx)) || x.name.localeCompare(y.name, 'nl');
          if ((x.status === 'open') !== (y.status === 'open')) return x.status === 'open' ? -1 : 1;
          return x.name.localeCompare(y.name, 'nl');
        });
        const open = list.filter(c => c.status === 'open');
        const got = open.filter(c => ridesOf(credits[c.id]).length).length;
        const pct = open.length ? Math.round(got / open.length * 100) : 0;
        return `<section class="card">
          <div class="card-head"><div style="display:flex;align-items:center;gap:12px">${flag(list[0].c)}<div><h2>${esc(park)}</h2><div class="muted">${esc(nameOf(list[0].c))}</div></div></div>
            <div style="text-align:right"><span class="big" style="font-size:36px">${got}<small> / ${open.length}</small></span></div></div>
          <div class="bar" style="height:10px;border-radius:5px;margin-bottom:12px"><i style="width:${pct}%"></i></div>
          <div class="list">${list.map(c => {
            const cr = ridesOf(credits[c.id]), planned = c.status !== 'open', sc = lastScore(cr), ld = lastDate(cr);
            const sub = [c.maker, c.year, c.type].filter(Boolean).join(' · ');
            const right = planned ? '<span class="muted">Nog niet open</span>'
              : cr.length ? `<span style="display:flex;flex-direction:column;align-items:flex-end;font-size:13px;color:var(--muted)">${sc ? `<strong style="color:var(--ink)">★ ${esc(num(sc))}</strong>` : ''}<span>${cr.length > 1 ? cr.length + '× · ' : ''}${ld ? esc(fmtDate(ld)) : ''}</span></span>` : ic('plus', 20);
            return `<button type="button" class="list-row" style="width:100%;border:0;background:none;text-align:left;cursor:${planned ? 'default' : 'pointer'};border-top:1px solid var(--line);${planned ? 'opacity:.55' : ''}" ${planned ? 'disabled' : `data-c="${esc(c.id)}"`}>
              <span class="credit-dot${cr.length ? ' on' : ''}" aria-hidden="true">${cr.length ? ic('check', 16) : ''}</span>
              <div class="grow"><div class="t">${esc(c.name)}</div><div class="s">${esc(sub)}</div></div>${right}</button>`;
          }).join('')}</div>
        </section>`;
      }).join('')}
      <p class="muted" style="text-align:center;font-size:13px">Data: <a href="https://coasterpedia.net" target="_blank" rel="noopener" style="color:inherit">Coasterpedia</a> (CC BY-SA 4.0)</p>
    </div>`;
  };
  const onClick = e => {
    const b = e.target.closest('[data-c]');
    if (b) { const c = db.find(x => x.id === b.dataset.c); if (c) openCredit(c); }
  };
  el.addEventListener('click', onClick);
  load().then(() => draw());
  const unsub = subscribe(draw);
  return () => { off = true; unsub(); el.removeEventListener('click', onClick); };
}
