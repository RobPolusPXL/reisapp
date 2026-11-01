import { get, update, replaceAll, subscribe } from '../store.js';
import { ic, toast } from '../ui.js';
import { syncCardHtml, signIn, signOut, onStatus } from '../sync.js';
import { isEmpty, loadSeed } from '../seed.js';

export const THEMES = [
  ['groen', 'Groen', '#0E7C66'], ['blauw', 'Blauw', '#1D5FD1'], ['amber', 'Amber', '#B45309'],
  ['paars', 'Paars', '#6D3FC8'], ['roze', 'Roze', '#C2255C'], ['grafiet', 'Grafiet', '#374151'],
];
const MODES = [['light', 'Licht'], ['dark', 'Donker'], ['system', 'Systeem']];

export function mount(el) {
  const draw = () => {
    const s = get().settings;
    el.innerHTML = `<div class="page">
      <header class="page-head"><a class="icon-btn" href="#/kaart" aria-label="Terug">${ic('back', 26)}</a><h1>Instellingen</h1></header>
      <section class="card"><div class="card-head"><h2>Kleur</h2></div>
        <div class="swatches">${THEMES.map(([id, n, col]) => `<button type="button" class="swatch" style="--sw:${col}" data-theme="${id}" aria-pressed="${s.theme === id}"><i>${s.theme === id ? ic('check', 20) : ''}</i>${n}</button>`).join('')}</div>
      </section>
      <section class="card"><div class="card-head"><h2>Weergave</h2></div>
        <div class="seg" role="group" aria-label="Weergave">${MODES.map(([id, n]) => `<button type="button" data-mode="${id}" aria-pressed="${s.mode === id}">${n}</button>`).join('')}</div>
      </section>
      ${isEmpty(get()) ? '<section class="card"><div class="card-head"><h2>Startdata</h2></div><p class="muted" style="margin:0 0 12px">Laad je bekende reizen en landen (uit je blog en Been) in deze lege app.</p><button type="button" class="btn soft block" id="seed">Mijn reizen laden</button></section>' : ''}
      ${syncCardHtml()}
      <section class="card"><div class="card-head"><h2>Back-up</h2></div>
        <p class="muted" style="margin:0 0 12px">Exporteer al je gegevens als bestand, of zet een eerder bestand terug.</p>
        <div class="pair"><button type="button" class="btn" id="exp">Exporteren</button>
        <label class="btn" for="imp" style="cursor:pointer">Importeren</label></div>
        <input id="imp" type="file" accept="application/json,.json" hidden>
      </section>
    </div>`;
  };
  draw();
  const unsub = subscribe(draw);
  const unsubSync = onStatus(draw);

  el.addEventListener('click', onClick);
  el.addEventListener('change', onChange);
  function onClick(e) {
    const t = e.target.closest('button[data-theme]');
    if (t) { update(st => { st.settings.theme = t.dataset.theme; }); return; }
    const m = e.target.closest('button[data-mode]');
    if (m) { update(st => { st.settings.mode = m.dataset.mode; }); return; }
    if (e.target.closest('#seed')) { loadSeed(); return; }
    if (e.target.closest('#sync-in')) { signIn(); return; }
    if (e.target.closest('#sync-out')) { signOut(); return; }
    if (e.target.closest('#exp')) {
      const blob = new Blob([JSON.stringify(get(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `reisapp-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  }
  function onChange(e) {
    if (e.target.id !== 'imp' || !e.target.files[0]) return;
    e.target.files[0].text().then(txt => {
      try {
        const data = JSON.parse(txt);
        if (!data || typeof data !== 'object' || !('countries' in data || 'trips' in data)) throw new Error('geen reisapp-bestand');
        replaceAll(data);
        toast('Gegevens teruggezet');
      } catch { toast('Dit bestand kan niet gelezen worden'); }
    });
  }
  return () => { unsub(); unsubSync(); el.removeEventListener('click', onClick); el.removeEventListener('change', onChange); };
}
