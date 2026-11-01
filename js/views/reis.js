import { get, subscribe, getTrip, update } from '../store.js';
import { nameOf } from '../data.js';
import { esc, ic, ICONS, fmtRange, fmtDate, daysBetween, scoreH } from '../ui.js';
import { legsHtml, TYPES, openTripForm, openItemForm, confirmSheet, nightsBetween, nightsLabel } from '../trips.js';

const FILTERS = [['all', 'Alles'], ['flight', 'Vluchten'], ['stay', 'Verblijf'], ['food', 'Eten'], ['activity', 'Activiteit']];

export function mount(el, { params }) {
  const id = params[0];
  let filter = 'all';

  const itemRow = i => {
    const [label, baseIcon] = TYPES[i.type] || ['Item', 'dots'];
    const icon = i.type === 'activity' && i.icon && ICONS[i.icon] ? i.icon : baseIcon;
    let sub = label;
    if (i.type === 'stay' && i.date && i.dateEnd && i.dateEnd !== i.date) {
      sub += ` · ${fmtRange(i.date, i.dateEnd)}`;
      const n = nightsBetween(i.date, i.dateEnd);
      if (n) sub += ` · ${nightsLabel(n)}`;
    } else if (i.type === 'activity' && i.date && i.dateEnd && i.dateEnd !== i.date) sub += ` · ${fmtRange(i.date, i.dateEnd)}`;
    else if (i.date) sub += ` · ${fmtDate(i.date)}`;
    let extra = '';
    if (i.type === 'flight') {
      const route = [i.f?.from, i.f?.to].filter(Boolean).join(' → ');
      const px = i.f?.pax?.length ? i.f.pax : (i.f?.seat ? [{ seat: i.f.seat }] : []);
      const seats = px.filter(x => x.seat).map(x => x.name ? `${x.name.split(' ')[0]} ${x.seat}` : x.seat);
      if (route) extra += `<div class="s s-route">${[i.f?.from, i.f?.to].filter(Boolean).map(esc).join('<svg class="s-arr" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M14 6l6 6-6 6"/></svg>')}</div>`;
      if (seats.length) extra += `<div class="s">${esc(seats.join(' · '))}</div>`;
    }
    const right = i.score ? `${scoreH(String(i.score).replace('.', ','))}` : ic('chev', 20);
    return `<button type="button" class="item" data-item="${esc(i.id)}"><span class="ico">${ic(icon, 22)}</span><span class="grow"><div class="t">${esc(i.name)}</div><div class="s">${esc(sub)}</div>${extra}</span><span class="r">${right}</span></button>`;
  };

  const draw = () => {
    const t = getTrip(id);
    if (!t) { location.hash = '#/reizen'; return; }
    const d = daysBetween(t.start, t.end);
    const countries = [...new Set(t.legs.map(l => nameOf(l.c)))].join(', ');
    const items = [...(t.items || [])].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))
      .filter(i => filter === 'all' || i.type === filter);
    el.innerHTML = `<div class="page">
      <header class="page-head"><a class="icon-btn" href="#/reizen" aria-label="Terug naar reizen">${ic('back', 26)}</a>
        <div style="flex:1;min-width:0"><h1 style="font-size:22px">${esc(t.title || countries || 'Reis')}</h1>
        <div class="sub">${esc(fmtRange(t.start, t.end))} · ${d} ${d === 1 ? 'dag' : 'dagen'}${countries ? ' · ' + esc(countries) : ''}</div></div>
        <button type="button" class="icon-btn" id="edit" aria-label="Reis bewerken">${ic('edit', 22)}</button>
        <button type="button" class="icon-btn" id="del" aria-label="Reis verwijderen">${ic('trash', 22)}</button>
      </header>
      <div class="cols">
        ${t.legs.length ? `<section class="card" style="flex:1 1 260px"><div class="card-head"><h2>Route</h2></div>${legsHtml(t.legs)}</section>` : ''}
        <section class="card" style="flex:3 1 380px"><div class="card-head"><h2>Onderweg</h2></div>
          <div class="chips" role="group" aria-label="Filter" style="margin-bottom:14px">${FILTERS.map(([k, n]) => `<button type="button" class="btn" data-filter="${k}" aria-pressed="${filter === k}">${n}</button>`).join('')}</div>
          <div class="items">${items.map(itemRow).join('') || '<div class="empty">Nog niets toegevoegd.</div>'}</div>
          <button type="button" class="btn dashed" id="add" style="margin-top:12px">${ic('plus', 20)}Item toevoegen</button>
        </section>
      </div></div>`;
  };
  draw();
  const unsub = subscribe(draw);

  const onClick = e => {
    const t = getTrip(id);
    if (!t) return;
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; draw(); return; }
    const it = e.target.closest('[data-item]');
    if (it) { openItemForm(id, t.items.find(x => x.id === it.dataset.item)); return; }
    if (e.target.closest('#add')) { openItemForm(id, null, { type: filter === 'all' ? 'activity' : filter, date: t.start }); return; }
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
