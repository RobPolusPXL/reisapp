import { get, subscribe } from '../store.js';
import { statsFor, searchCountries, flag, CONT } from '../data.js';
import { createMap } from '../map.js';
import { openCountrySheet, openCountryPicker } from '../sheets.js';
import { esc, ic } from '../ui.js';

export function mount(el) {
  el.classList.add('kaart');
  el.innerHTML = `
    <div class="map-host"></div>
    <div class="map-top">
      <div class="search" role="search">${ic('search', 20)}
        <input type="search" placeholder="Zoek een land" aria-label="Zoek een land" autocomplete="off">
        <a class="icon-btn" href="#/instellingen" aria-label="Instellingen">${ic('gear', 22)}</a>
      </div>
      <ul class="results" hidden></ul>
      <div class="pill" id="pill"></div>
    </div>
    <div class="zoom">
      <button type="button" class="icon-btn" data-zoom="1.6" aria-label="Inzoomen">${ic('plus', 22)}</button>
      <button type="button" class="icon-btn" data-zoom="0.625" aria-label="Uitzoomen">${ic('minus', 22)}</button>
    </div>
    <button type="button" class="fab" aria-label="Land toevoegen">${ic('plus', 26)}</button>`;

  const m = createMap(el.querySelector('.map-host'), {
    onSelect: code => { m.select(code); openCountrySheet(code, { onClose: () => m.select(null) }); },
  });
  const input = el.querySelector('input');
  const results = el.querySelector('.results');
  const pill = el.querySelector('#pill');

  const refresh = () => {
    m.update();
    const s = statsFor(get());
    pill.textContent = `${s.un.length} van ${s.totalUN} landen`;
  };
  refresh();
  const unsub = subscribe(refresh);

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) { results.hidden = true; return; }
    const found = searchCountries(q, 8);
    results.innerHTML = found.map(c => `<li><button type="button" data-c="${c.c}">${flag(c.c)}<span>${esc(c.n)}</span><span class="muted" style="margin-left:auto">${c.k ? CONT[c.k] : ''}</span></button></li>`).join('')
      || '<li class="empty" style="padding:12px">Geen landen gevonden.</li>';
    results.hidden = false;
  });
  results.addEventListener('click', e => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const code = b.dataset.c;
    results.hidden = true; input.value = '';
    m.focus(code); m.select(code);
    openCountrySheet(code, { onClose: () => m.select(null) });
  });
  el.querySelector('.fab').addEventListener('click', () => openCountryPicker());
  el.querySelector('.zoom').addEventListener('click', e => {
    const b = e.target.closest('[data-zoom]');
    if (b) m.zoomBy(parseFloat(b.dataset.zoom));
  });

  return () => { unsub(); m.destroy(); el.classList.remove('kaart'); };
}
