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

function openCredit(c) {
  const cur = get().credits[c.id];
  const sh = openSheet(`<h2>${esc(c.name)}</h2>
    <p class="muted" style="margin:-6px 0 14px">${esc([c.maker, c.year, c.type].filter(Boolean).join(' · '))}</p>
    <form class="form" novalidate>
      <div class="field"><label for="c-date">Datum van je eerste rit</label><input id="c-date" name="date" type="date" value="${esc(cur?.date || '')}"></div>
      <div class="pair">
        <div class="field"><label for="c-rides">Aantal ritten</label><input id="c-rides" name="rides" type="number" min="1" step="1" inputmode="numeric" value="${esc(cur?.rides || 1)}"></div>
        <div class="field"><label for="c-score">Score</label><select id="c-score" name="score"><option value="">Geen score</option>${SCORES.map(n => `<option value="${n}"${String(cur?.score) === String(n) ? ' selected' : ''}>★ ${num(n)}</option>`).join('')}</select></div>
      </div>
      <a class="btn soft" href="${link(c)}" target="_blank" rel="noopener" style="align-self:flex-start">Bekijk op Coasterpedia</a>
      <div class="pair">${cur ? '<button type="button" class="btn danger" data-del>Credit verwijderen</button>' : '<button type="button" class="btn" data-close>Annuleren</button>'}<button type="submit" class="btn primary">${cur ? 'Opslaan' : 'Credit toevoegen'}</button></div>
    </form>`, { title: c.name });
  sh.el.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements;
    const rides = Math.max(1, parseInt(f.rides.value, 10) || 1);
    update(st => { st.credits[c.id] = { date: f.date.value, rides, score: f.score.value }; });
    sh.close();
    toast(cur ? 'Opgeslagen' : 'Credit toegevoegd');
  });
  sh.el.addEventListener('click', e => {
    if (!e.target.closest('[data-del]')) return;
    update(st => { delete st.credits[c.id]; });
    sh.close();
    toast('Credit verwijderd');
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
        const list = db.filter(c => c.park === park);
        const open = list.filter(c => c.status === 'open');
        const got = open.filter(c => credits[c.id]).length;
        const pct = open.length ? Math.round(got / open.length * 100) : 0;
        return `<section class="card">
          <div class="card-head"><div style="display:flex;align-items:center;gap:12px">${flag(list[0].c)}<div><h2>${esc(park)}</h2><div class="muted">${esc(nameOf(list[0].c))}</div></div></div>
            <div style="text-align:right"><span class="big" style="font-size:36px">${got}<small> / ${open.length}</small></span></div></div>
          <div class="bar" style="height:10px;border-radius:5px;margin-bottom:12px"><i style="width:${pct}%"></i></div>
          <div class="list">${list.map(c => {
            const cr = credits[c.id], planned = c.status !== 'open';
            const sub = [c.maker, c.year, c.type].filter(Boolean).join(' · ');
            const right = planned ? '<span class="muted">Nog niet open</span>'
              : cr ? `<span style="display:flex;flex-direction:column;align-items:flex-end;font-size:13px;color:var(--muted)">${cr.score ? `<strong style="color:var(--ink)">★ ${esc(num(cr.score))}</strong>` : ''}<span>${cr.rides > 1 ? cr.rides + '× · ' : ''}${cr.date ? esc(fmtDate(cr.date)) : ''}</span></span>` : ic('plus', 20);
            return `<button type="button" class="list-row" style="width:100%;border:0;background:none;text-align:left;cursor:${planned ? 'default' : 'pointer'};border-top:1px solid var(--line);${planned ? 'opacity:.55' : ''}" ${planned ? 'disabled' : `data-c="${esc(c.id)}"`}>
              <span class="credit-dot${cr ? ' on' : ''}" aria-hidden="true">${cr ? ic('check', 16) : ''}</span>
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
