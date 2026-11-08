import { get, subscribe, getTrip, update } from '../store.js';
import { nameOf } from '../data.js';
import { loadAirports } from '../airports.js';
import { esc, ic, ICONS, fmtRange, fmtDate, daysBetween, scoreH } from '../ui.js';
import { matesText, flagsHtml, transportHtml, metroHtml, stayStops, staysAt, TYPES, openTripForm, openItemForm, confirmSheet, nightsBetween, nightsLabel } from '../trips.js';

export function mount(el, { params }) {
  const id = params[0];

  const itemRow = i => {
    const [label, baseIcon] = TYPES[i.type] || ['Item', 'dots'];
    const icon = i.type === 'activity' && i.icon && ICONS[i.icon] ? i.icon : baseIcon;
    let sub = '';
    if (i.type === 'stay' && i.date && i.dateEnd && i.dateEnd !== i.date) {
      sub = fmtRange(i.date, i.dateEnd);
      const n = nightsBetween(i.date, i.dateEnd);
      if (n) sub += ` · ${nightsLabel(n)}`;
    } else if (i.type === 'activity' && i.date && i.dateEnd && i.dateEnd !== i.date) sub = fmtRange(i.date, i.dateEnd);
    else if (i.date) sub = fmtDate(i.date);
    let extra = '';
    if (i.type === 'flight') {
      const route = [i.f?.from, i.f?.to].filter(Boolean).join(' → ');
      const px = i.f?.pax?.length ? i.f.pax : (i.f?.seat ? [{ seat: i.f.seat }] : []);
      const seats = px.filter(x => x.seat).map(x => x.name ? `${x.name.split(' ')[0]} ${x.seat}` : x.seat);
      if (route) extra += `<div class="s s-route">${[i.f?.from, i.f?.to].filter(Boolean).map(esc).join('<svg class="s-arr" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M14 6l6 6-6 6"/></svg>')}</div>`;
      if (seats.length) extra += `<div class="s">${esc(seats.join(' · '))}</div>`;
    }
    const right = i.score ? `${scoreH(String(i.score).replace('.', ','))}` : ic('chev', 20);
    return `<button type="button" class="item" data-item="${esc(i.id)}"><span class="ico">${ic(icon, 22)}</span><span class="grow"><div class="t">${esc(i.name)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}${extra}</span><span class="r">${right}</span></button>`;
  };

  const draw = () => {
    const t = getTrip(id);
    if (!t) { location.hash = '#/reizen'; return; }
    const d = daysBetween(t.start, t.end);
    const countries = [...new Set(t.legs.map(l => nameOf(l.c)))].join(', ');
    const all = [...(t.items || [])].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
    const inMetro = new Set(stayStops(t).flatMap(st => staysAt(t, st).map(x => x.id)));   // verblijven en activiteiten die al bij een land in de reisweg staan
    const sec = (title, type) => { const l = all.filter(i => i.type === type && !inMetro.has(i.id)); return l.length ? `<section class="card"><div class="card-head"><h2>${title}</h2></div><div class="items">${l.map(itemRow).join('')}</div></section>` : ''; };
    el.innerHTML = `<div class="page">
      <header class="page-head"><a class="icon-btn" href="#/reizen" aria-label="Terug naar reizen">${ic('back', 26)}</a>
        <div style="flex:1;min-width:0"><h1 style="font-size:22px">${esc(t.title || countries || 'Reis')}</h1>
        <div class="sub">${esc(fmtRange(t.start, t.end))} · ${d} ${d === 1 ? 'dag' : 'dagen'}</div>${t.mates?.length ? `<div class="sub">Met ${esc(matesText(t.mates))}</div>` : ''}</div>
        <button type="button" class="icon-btn" id="edit" aria-label="Reis bewerken">${ic('edit', 22)}</button>
        <button type="button" class="icon-btn" id="del" aria-label="Reis verwijderen">${ic('trash', 22)}</button>
      </header>
      ${flagsHtml(t)}
      <div class="trip-secs">
        ${metroHtml(t)}
        ${transportHtml(t)}
        ${sec('Verblijven', 'stay')}${sec('Gedaan', 'activity')}${sec('Gegeten', 'food')}
        <button type="button" class="btn dashed" id="add">${ic('plus', 20)}Item toevoegen</button>
      </div></div>`;
  };
  draw();
  loadAirports().then(() => draw());
  const unsub = subscribe(draw);

  const onClick = e => {
    const t = getTrip(id);
    if (!t) return;
    const ex = e.target.closest('[data-exp]');
    if (ex) { const box = el.querySelector('#' + ex.dataset.exp); const open = box.hidden; box.hidden = !open; ex.setAttribute('aria-expanded', String(open)); return; }
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
