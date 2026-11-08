import { get, subscribe } from '../store.js';
import { esc, ic, fmtRange, daysBetween } from '../ui.js';
import { matesText, flagsHtml, tripStats } from '../trips.js';
import { openTripForm } from '../tripform.js';
import { loadAirports } from '../airports.js';

export function mount(el) {
  loadAirports().then(() => draw());
  const draw = () => {
    const st = get();
    const s = tripStats(st);
    const trips = [...st.trips].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    let lastYear = null;
    const cards = trips.map(t => {
      const y = (t.start || '').slice(0, 4);
      const head = y !== lastYear && lastYear !== null ? `<div class="year">${y}</div>` : '';
      lastYear = y;
      const d = daysBetween(t.start, t.end);
      return `${head}<a class="card card-link" href="#/reis/${esc(t.id)}">
        <div class="trip-head"><span>${ic('cal', 18)}${esc(fmtRange(t.start, t.end))}</span><span>Duur <strong>${d} ${d === 1 ? 'dag' : 'dagen'}</strong></span></div>
        ${t.title ? `<div class="trip-title">${esc(t.title)}</div>` : ''}
        ${flagsHtml(t)}
        ${t.mates?.length ? `<div class="trip-note">${ic(t.mates.length > 1 ? 'users' : 'user', 18)}Met ${esc(matesText(t.mates))}</div>` : ''}
      </a>`;
    }).join('');
    el.innerHTML = `<div class="page">
      <header class="page-head"><h1>Reizen</h1><a class="icon-btn" href="#/instellingen" aria-label="Instellingen">${ic('gear', 22)}</a></header>
      <section class="stat-card" aria-label="Reisstatistieken">
        <svg class="plane" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 0C54 0 56 6 56 12V38L96 58V66L56 56V80L68 90V96L50 91L32 96V90L44 80V56L4 66V58L44 38V12C44 6 46 0 50 0Z"/></svg>
        <div class="top">
          <div><div class="l">${ic('case', 20)}Reizen</div><div class="n">${s.trips}</div></div>
          <div><div class="l">${ic('clock', 20)}Duur</div><div class="n">${s.days}d</div></div>
        </div>
        <div class="bot">
          <div><div class="l">Continenten</div><div class="n">${s.continents}</div></div>
          <div><div class="l">Landen</div><div class="n">${s.countries}</div></div>
          <div><div class="l">Steden</div><div class="n">${s.cities}</div></div>
        </div>
        <a class="all" href="#/statistieken">Alle reisstatistieken${ic('chev', 20)}</a>
      </section>
      ${trips.length ? `<h2 style="font-size:18px">Afgelopen</h2>${cards}` : `<div class="card"><h2>Nog geen reizen</h2><p class="muted">Voeg je eerste reis toe met de knop rechtsonder.</p></div>`}
      <button type="button" class="fab" id="add" aria-label="Reis toevoegen" style="position:fixed;bottom:calc(88px + env(safe-area-inset-bottom))">${ic('plus', 26)}</button>
    </div>`;
  };
  draw();
  const unsub = subscribe(draw);
  const onClick = e => { if (e.target.closest('#add')) openTripForm(null); };
  el.addEventListener('click', onClick);
  return () => { unsub(); el.removeEventListener('click', onClick); };
}
