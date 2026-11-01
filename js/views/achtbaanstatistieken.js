// Statistieken over je achtbaancredits en ritten (alle parken samen).
import { get, subscribe } from '../store.js';
import { nameOf } from '../data.js';
import { esc, ic } from '../ui.js';
import { load, ridesOf, avgScore } from './credits.js';

const num = n => String(Math.round(n * 10) / 10).replace('.', ',');

const bar = (label, n, max, text) =>
  `<div class="brow"><span class="lbl">${esc(label)}</span><div class="bar"><i style="width:${max ? Math.max(4, n / max * 100) : 0}%"></i></div><span class="n">${esc(text ?? n)}</span></div>`;

export function mount(el) {
  let db = null, off = false;
  const draw = () => {
    if (off || !db) return;
    const credits = get().credits;
    const open = db.filter(c => c.status === 'open');
    const done = open.filter(c => ridesOf(credits[c.id]).length);
    const rides = done.flatMap(c => ridesOf(credits[c.id]).map(r => ({ ...r, c })));
    const avg = avgScore(rides);
    const parks = [...new Set(db.map(c => c.park))];
    const parkStats = parks.map(p => ({ p, got: done.filter(c => c.park === p).length, total: open.filter(c => c.park === p).length })).sort((x, y) => y.got - x.got);
    const countries = new Set(done.map(c => c.c));
    const top = done.map(c => ({ c, a: avgScore(ridesOf(credits[c.id])), n: ridesOf(credits[c.id]).length })).filter(x => x.a)
      .sort((x, y) => y.a - x.a || y.n - x.n || x.c.name.localeCompare(y.c.name, 'nl')).slice(0, 5);
    const years = {};
    for (const r of rides) if (r.date) years[r.date.slice(0, 4)] = (years[r.date.slice(0, 4)] || 0) + 1;
    const yl = Object.entries(years).sort((a, b) => b[0].localeCompare(a[0]));
    const makers = {};
    for (const c of done) if (c.maker) makers[c.maker] = (makers[c.maker] || 0) + 1;
    const ml = Object.entries(makers).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nl')).slice(0, 5);
    const lands = {};
    for (const c of done) lands[c.c] = (lands[c.c] || 0) + 1;
    const ll = Object.entries(lands).sort((a, b) => b[1] - a[1] || nameOf(a[0]).localeCompare(nameOf(b[0]), 'nl'));
    const maxPark = Math.max(1, ...parkStats.map(x => x.total));
    el.innerHTML = `<div class="page credits-page">
      <header class="page-head"><a class="icon-btn" href="#/credits" aria-label="Terug naar Achtbanen">${ic('back', 26)}</a><h1>Achtbaanstatistieken</h1></header>
      ${done.length ? `<div class="big4"><div><b>${done.length}</b><span>${done.length === 1 ? 'credit' : 'credits'}</span></div><div><b>${rides.length}</b><span>${rides.length === 1 ? 'rit' : 'ritten'}</span></div><div><b>${avg ? '★ ' + esc(num(avg)) : '–'}</b><span>gemiddelde score</span></div><div><b>${parkStats.filter(x => x.got).length}</b><span>${parkStats.filter(x => x.got).length === 1 ? 'park' : 'parken'} in ${countries.size} ${countries.size === 1 ? 'land' : 'landen'}</span></div></div>
      <div class="sgrid">
        <section class="card sc2"><h2>Per park</h2>${parkStats.map(x => bar(x.p, x.got, maxPark, `${x.got} / ${x.total}`)).join('')}</section>
        <section class="card sc2"><h2>Hoogst gescoord</h2>${top.length ? top.map((x, i) => `<div class="rank"><span class="p">${i + 1}</span><div><b>${esc(x.c.name)}</b><small>${esc(x.c.park)} · ${x.n}×</small></div><span class="v">★ ${esc(num(x.a))}</span></div>`).join('') : '<div class="muted">Nog geen scores.</div>'}</section>
        <section class="card sc2"><h2>Ritten per jaar</h2>${yl.length ? yl.map(([y, n]) => bar(y, n, Math.max(...yl.map(v => v[1])))).join('') : '<div class="muted">Nog geen ritten met een datum.</div>'}</section>
        <section class="card sc2"><h2>Meeste credits per fabrikant</h2>${ml.map(([m, n]) => bar(m, n, ml[0][1])).join('')}</section>
        <section class="card sc2 span2"><h2>Credits per land</h2>${ll.map(([c, n]) => bar(nameOf(c), n, ll[0][1])).join('')}</section>
      </div>` : '<div class="card"><h2>Nog geen credits</h2><p class="muted">Voeg een rit toe bij Achtbanen, dan verschijnen hier je statistieken.</p></div>'}
    </div>`;
  };
  load().then(d => { db = d; draw(); });
  const unsub = subscribe(draw);
  return () => { off = true; unsub(); };
}
