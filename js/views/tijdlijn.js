import { get, subscribe } from '../store.js';
import { ic } from '../ui.js';
import { timelineHtml } from '../timeline.js';

export function mount(el) {
  let scroll = null;   // onthoud waar je stond; de eerste keer begin je bij de nieuwste reis
  const draw = () => {
    const prev = el.querySelector('#tl-wrap'); if (prev) scroll = prev.scrollLeft;
    const trips = get().trips.filter(t => t.start);
    const years = trips.map(t => t.start.slice(0, 4)).sort();
    el.innerHTML = `<div class="page">
      <header class="page-head"><h1>Tijdlijn</h1><a class="icon-btn" href="#/instellingen" aria-label="Instellingen">${ic('gear', 22)}</a></header>
      ${trips.length ? `<p class="muted" style="margin:-6px 0 0">${trips.length} ${trips.length === 1 ? 'reis' : 'reizen'} · ${years[0]} – ${years[years.length - 1]} · veeg naar links om terug in de tijd te gaan</p>
      <section class="card tl-card">${timelineHtml(get().trips)}</section>`
      : '<div class="card"><h2>Nog geen reizen</h2><p class="muted">Voeg een reis toe bij Reizen, dan verschijnt ze hier op de tijdlijn.</p></div>'}
    </div>`;
    const w = el.querySelector('#tl-wrap'); if (w) w.scrollLeft = scroll ?? w.scrollWidth;
  };
  draw();
  return subscribe(draw);
}
