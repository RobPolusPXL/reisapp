import { get, subscribe, getTrip, update } from '../store.js';
import { nameOf } from '../data.js';
import { loadAirports } from '../airports.js';
import { esc, ic, fmtRange, fmtDate, daysBetween, scoreH } from '../ui.js';
import { matesText, bigStamps, movesHtml, openTripForm, openItemForm, confirmSheet, nightsBetween, nightsLabel } from '../trips.js';

export function mount(el, { params }) {
  const id = params[0];
  const draw = () => {
    const t = getTrip(id);
    if (!t) { location.hash = '#/reizen'; return; }
    const d = daysBetween(t.start, t.end);
    const countries = [...new Set(t.legs.map(l => nameOf(l.c)))].join(', ');
    const all = [...(t.items || [])].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
    const block = (title, list, render) => list.length ? `<div class="lab">${title}</div>${list.map(render).join('')}` : '';
    const row = i => `<button type="button" class="prow" data-item="${esc(i.id)}"><span class="grow"><span class="r-t">${esc(i.name)}</span>${i.type === 'stay' ? `<span class="r-s">${esc([i.date && i.dateEnd ? fmtRange(i.date, i.dateEnd) : fmtDate(i.date), i.note].filter(Boolean).join(' · '))}</span>` : ''}</span>${i.type === 'stay' && nightsBetween(i.date, i.dateEnd) ? `<span class="r-n">${esc(nightsLabel(nightsBetween(i.date, i.dateEnd)))}</span>` : i.score ? scoreH(String(i.score).replace('.', ',')) : ''}</button>`;
    el.innerHTML = `<div class="page paper"><div class="ppage">
      <header class="ptop"><a class="icon-btn" href="#/reizen" aria-label="Terug naar reizen">${ic('back', 24)}</a><span class="grow"></span>
        <button type="button" class="icon-btn" id="edit" aria-label="Reis bewerken">${ic('edit', 22)}</button>
        <button type="button" class="icon-btn" id="del" aria-label="Reis verwijderen">${ic('trash', 22)}</button></header>
      <h1 class="ptitle">${esc(t.title || countries || 'Reis')}</h1>
      <div class="pmeta">${esc(fmtRange(t.start, t.end))} · ${d} ${d === 1 ? 'dag' : 'dagen'}${t.mates?.length ? ' · met ' + esc(matesText(t.mates)) : ''}</div>
      ${bigStamps(t)}
      ${movesHtml(t)}
      ${block('Verblijven', all.filter(i => i.type === 'stay'), row)}
      ${block('Gedaan', all.filter(i => i.type === 'activity'), row)}
      ${block('Gegeten', all.filter(i => i.type === 'food'), row)}
      ${block('Vluchten', all.filter(i => i.type === 'flight' && !movesHtml(t).includes(`data-item="${i.id}"`)), i => `<button type="button" class="prow" data-item="${esc(i.id)}"><span class="r-t">${esc([i.f?.from, i.f?.to].filter(Boolean).join(' → ') || i.name)}</span><span class="r-n">${esc(fmtDate(i.date))}</span></button>`)}
      <button type="button" class="btn dashed" id="add" style="margin-top:18px;width:100%">${ic('plus', 20)}Item toevoegen</button>
    </div></div>`;
  };
  draw();
  loadAirports().then(() => draw());
  const unsub = subscribe(draw);

  const onClick = e => {
    const t = getTrip(id);
    if (!t) return;
    const it = e.target.closest('[data-item]');
    if (it) { openItemForm(id, t.items.find(x => x.id === it.dataset.item)); return; }
    if (e.target.closest('#add')) { openItemForm(id, null, { type: 'activity', date: t.start }); return; }
    if (e.target.closest('#edit')) { openTripForm(t); return; }
    if (e.target.closest('#del')) {
      confirmSheet('Deze reis verwijderen?', 'Verwijderen', () => {
        update(st => { st.trips = st.trips.filter(x => x.id !== id); });
        location.hash = '#/reizen';
      });
    }
  };
  el.addEventListener('click', onClick);
  return () => { unsub(); el.removeEventListener('click', onClick); };
}
