// Sheets rond landen: detail van één land en de "land toevoegen"-lijst
import { get, setCountry } from './store.js';
import { byCode, CONT, flag, searchCountries } from './data.js';
import { esc, ic, openSheet, toast } from './ui.js';

const STATUS = { v: 'Bezocht', w: 'Wil ik zien' };

export function openCountrySheet(code, { onClose } = {}) {
  const c = byCode.get(code);
  if (!c) return;
  const sh = openSheet('', { title: c.n, onClose });
  const render = () => {
    const st = get().countries[code] || {};
    sh.setHtml(`
      <div class="sheet-head">${flag(code)}<div><h2>${esc(c.n)}</h2><div class="muted">${c.k ? CONT[c.k] : ''}${c.u ? '' : ' · niet-VN-gebied'}</div></div></div>
      <div class="pair">
        <button type="button" class="btn ${st.s === 'v' ? 'primary' : ''}" data-act="v" aria-pressed="${st.s === 'v'}">${ic('check', 20)}Bezocht</button>
        <button type="button" class="btn ${st.s === 'w' ? 'primary' : ''}" data-act="w" aria-pressed="${st.s === 'w'}">${ic('heart', 20)}Wil ik zien</button>
      </div>
      ${st.s === 'v' ? `<div class="field"><label for="cy">Jaar (optioneel)</label><input id="cy" type="number" inputmode="numeric" min="1900" max="2100" value="${esc(st.y ?? '')}" placeholder="Bijvoorbeeld 2025"></div>` : ''}
      <button type="button" class="btn block" data-close>Sluiten</button>`);
  };
  render();
  sh.el.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const cur = get().countries[code]?.s;
    setCountry(code, cur === b.dataset.act ? null : b.dataset.act);
    render();
  });
  sh.el.addEventListener('change', e => {
    if (e.target.id === 'cy') {
      const y = parseInt(e.target.value, 10);
      setCountry(code, 'v', { y: Number.isFinite(y) ? y : undefined });
    }
  });
  return sh;
}

/** Zoek en markeer landen als bezocht. */
export function openCountryPicker({ onPick } = {}) {
  const sh = openSheet('', { title: 'Land toevoegen' });
  sh.setHtml(`<h2>Land toevoegen</h2>
    <div class="field"><label for="cq">Zoek een land</label><input id="cq" type="search" autocomplete="off" placeholder="Bijvoorbeeld Slovenië"></div>
    <div class="list" id="cl" style="max-height:50dvh;overflow:auto"></div>
    <button type="button" class="btn block" data-close>Klaar</button>`);
  const input = sh.el.querySelector('#cq');
  const listEl = sh.el.querySelector('#cl');
  const draw = () => {
    const cs = get().countries;
    listEl.innerHTML = searchCountries(input.value, 60).map(c => `
      <div class="list-row">${flag(c.c)}<div class="grow"><div class="t">${esc(c.n)}</div><div class="s">${cs[c.c] ? STATUS[cs[c.c].s] : (c.k ? CONT[c.k] : '')}</div></div>
      <button type="button" class="btn ${cs[c.c]?.s === 'v' ? 'primary' : 'soft'}" data-c="${c.c}" aria-label="${esc(c.n)} ${cs[c.c]?.s === 'v' ? 'verwijderen uit bezocht' : 'markeren als bezocht'}">${cs[c.c]?.s === 'v' ? ic('check', 18) + 'Bezocht' : 'Bezocht'}</button></div>`).join('')
      || '<div class="empty">Geen landen gevonden.</div>';
  };
  input.addEventListener('input', draw);
  listEl.addEventListener('click', e => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const code = b.dataset.c;
    const cur = get().countries[code]?.s;
    setCountry(code, cur === 'v' ? null : 'v');
    onPick?.(code);
    draw();
  });
  draw();
  input.focus();
  return sh;
}

export { toast };
