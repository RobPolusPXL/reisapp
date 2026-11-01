import { get, subscribe } from '../store.js';
import { nameOf, flag } from '../data.js';
import { esc, ic, daysBetween, fmtRange } from '../ui.js';
import { MODES, TYPES, tripStats } from '../trips.js';

const num = n => String(Math.round(n * 10) / 10).replace('.', ',');

export function mount(el) {
  const draw = () => {
    const st = get();
    const trips = st.trips;
    const s = tripStats(st);

    // Per jaar: aantal reizen en dagen onderweg
    const years = {};
    for (const t of trips) {
      const y = (t.start || '').slice(0, 4);
      if (!y) continue;
      years[y] ||= { n: 0, d: 0 };
      years[y].n++;
      years[y].d += daysBetween(t.start, t.end);
    }
    const ys = Object.keys(years).sort().reverse();
    const maxD = Math.max(1, ...ys.map(y => years[y].d));

    // Vervoer per etappe
    const modes = {};
    for (const t of trips) for (const l of t.legs) modes[l.mode] = (modes[l.mode] || 0) + 1;
    const modeList = Object.entries(modes).sort((a, b) => b[1] - a[1]);
    const maxM = Math.max(1, ...modeList.map(([, n]) => n));

    // Onderweg: items per soort en gemiddelde score
    const items = trips.flatMap(t => t.items || []);
    const types = {};
    for (const i of items) types[i.type] = (types[i.type] || 0) + 1;
    const scored = items.filter(i => i.score !== '' && i.score != null && !Number.isNaN(+i.score));
    const avg = scored.length ? scored.reduce((a, i) => a + +i.score, 0) / scored.length : null;
    const best = [...scored].sort((a, b) => +b.score - +a.score).slice(0, 3);

    // Landen die in de meeste reizen voorkomen
    const cc = {};
    for (const t of trips) for (const c of new Set(t.legs.map(l => l.c))) cc[c] = (cc[c] || 0) + 1;
    const topC = Object.entries(cc).sort((a, b) => b[1] - a[1] || nameOf(a[0]).localeCompare(nameOf(b[0]), 'nl')).slice(0, 5);

    const longest = trips.reduce((a, t) => (!a || daysBetween(t.start, t.end) > daysBetween(a.start, a.end) ? t : a), null);
    const avgDays = trips.length ? s.days / trips.length : 0;

    const bar = (label, value, max, right) => `<div class="bar-row"><span class="name">${label}</span><div class="bar"><i style="width:${Math.round((value / max) * 100)}%;${value ? 'min-width:6px' : ''}"></i></div><span class="num">${right}</span></div>`;

    el.innerHTML = `<div class="page">
      <header class="page-head"><a class="icon-btn" href="#/reizen" aria-label="Terug naar reizen">${ic('back', 26)}</a><h1>Reisstatistieken</h1></header>
      ${trips.length ? `
      <div class="cols">
        <section class="card"><div class="card-head"><h2>Overzicht</h2></div>
          <div class="list">
            <div class="list-row"><div class="grow">Reizen</div><strong>${s.trips}</strong></div>
            <div class="list-row"><div class="grow">Dagen onderweg</div><strong>${s.days}</strong></div>
            <div class="list-row"><div class="grow">Gemiddeld per reis</div><strong>${num(avgDays)} dagen</strong></div>
            ${longest ? `<a class="list-row" href="#/reis/${esc(longest.id)}"><div class="grow">Langste reis<div class="s">${esc(longest.title || nameOf(longest.legs[0]?.c || ''))} · ${esc(fmtRange(longest.start, longest.end))}</div></div><strong>${daysBetween(longest.start, longest.end)} dagen</strong></a>` : ''}
          </div>
        </section>
        <section class="card"><div class="card-head"><h2>Per jaar</h2></div>
          ${ys.map(y => bar(y, years[y].d, maxD, `${years[y].d}d · ${years[y].n}×`)).join('')}
        </section>
      </div>
      <div class="cols">
        <section class="card"><div class="card-head"><h2>Vervoer</h2></div>
          ${modeList.length ? modeList.map(([m, n]) => bar(`<span style="display:inline-flex;align-items:center;gap:8px">${ic(MODES[m]?.[1] || 'dots', 18)}${MODES[m]?.[0] || m}</span>`, n, maxM, `${n}×`)).join('') : '<div class="empty">Nog geen vervoer ingevuld.</div>'}
        </section>
        <section class="card"><div class="card-head"><h2>Meeste reizen naar</h2></div>
          ${topC.length ? `<div class="list">${topC.map(([c, n]) => `<div class="list-row">${flag(c)}<div class="grow"><div class="t">${esc(nameOf(c))}</div></div><strong>${n}×</strong></div>`).join('')}</div>` : '<div class="empty">Nog geen landen in je reizen.</div>'}
        </section>
      </div>
      <section class="card"><div class="card-head"><h2>Onderweg</h2></div>
        <div class="list">
          ${Object.entries(TYPES).map(([k, [label, icon]]) => `<div class="list-row"><span class="ico-sm">${ic(icon, 20)}</span><div class="grow">${label}</div><strong>${types[k] || 0}</strong></div>`).join('')}
          ${avg !== null ? `<div class="list-row"><span class="ico-sm">${ic('star', 20)}</span><div class="grow">Gemiddelde score<div class="s">${scored.length} met score</div></div><strong>★ ${num(avg)}</strong></div>` : ''}
        </div>
        ${best.length ? `<h3 style="font-size:15px;margin:18px 0 6px">Hoogst gescoord</h3><div class="list">${best.map(i => `<div class="list-row"><div class="grow"><div class="t">${esc(i.name)}</div><div class="s">${esc(TYPES[i.type]?.[0] || '')}</div></div><strong>★ ${esc(String(i.score).replace('.', ','))}</strong></div>`).join('')}</div>` : ''}
      </section>` : `<div class="card"><h2>Nog geen reizen</h2><p class="muted">Voeg een reis toe, dan verschijnen hier je statistieken.</p></div>`}
    </div>`;
  };
  draw();
  return subscribe(draw);
}
