import { get, subscribe, update, newId, setCountry } from '../store.js';
import { byCode, CONT, flag, nameOf, statsFor } from '../data.js';
import { createMap } from '../map.js';
import { esc, ic, openSheet, toast } from '../ui.js';
import { countryOptions } from '../trips.js';
import { openCountryPicker, openCountrySheet } from '../sheets.js';

const PLACES = {
  cities: { title: 'Mijn steden', add: 'Stad toevoegen', empty: 'Nog geen steden' },
  regions: { title: "Mijn regio's", add: 'Regio toevoegen', empty: "Nog geen regio's" },
  airports: { title: 'Mijn luchthavens', add: 'Luchthaven toevoegen', empty: 'Nog geen luchthavens' },
};

function openPlaceForm(kind) {
  const cfg = PLACES[kind];
  const sh = openSheet(`<h2>${cfg.add}</h2>
    <form class="form" novalidate>
      ${kind === 'airports' ? `<div class="pair"><div class="field" style="flex:0 0 110px"><label for="p-code">Code</label><input id="p-code" name="code" maxlength="4" placeholder="BRU" style="text-transform:uppercase"></div>
        <div class="field"><label for="p-naam">Naam</label><input id="p-naam" name="naam" placeholder="Naam van de luchthaven"></div></div>`
      : `<div class="field"><label for="p-naam">Naam</label><input id="p-naam" name="naam" placeholder="Naam"></div>`}
      <div class="field"><label for="p-land">Land</label><select id="p-land" name="land">${countryOptions('')}</select></div>
      <p class="muted" role="alert" id="p-err" style="margin:0;color:var(--danger)"></p>
      <div class="pair"><button type="button" class="btn" data-close>Annuleren</button><button type="submit" class="btn primary">Opslaan</button></div>
    </form>`, { title: cfg.add });
  sh.el.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements;
    const naam = f.naam.value.trim(), land = f.land.value, code = (f.code?.value || '').trim().toUpperCase();
    const err = sh.el.querySelector('#p-err');
    if (kind === 'airports' ? (!code && !naam) : !naam) { err.textContent = 'Vul een naam in.'; return; }
    if (!land) { err.textContent = 'Kies een land.'; return; }
    update(st => {
      st.places[kind].push(kind === 'airports' ? { id: newId(), code, name: naam, c: land } : { id: newId(), name: naam, c: land });
      if (!st.countries[land]) st.countries[land] = { s: 'v' };
    });
    sh.close();
    toast('Toegevoegd');
  });
}

export function mount(el) {
  let showAll = false;
  let map = null;

  const placeCard = kind => {
    const cfg = PLACES[kind];
    const items = get().places[kind];
    return `<section class="card"><div class="card-head"><h2>${cfg.title}</h2><button type="button" class="btn soft" data-add="${kind}">${ic('plus', 18)}Toevoegen</button></div>
      ${items.length ? `<div class="list">${items.map(p => `<div class="list-row">${flag(p.c)}<div class="grow"><div class="t">${esc(kind === 'airports' ? [p.code, p.name].filter(Boolean).join(' · ') : p.name)}</div><div class="s">${esc(nameOf(p.c))}</div></div>
        <button type="button" class="icon-btn" style="background:var(--bg)" data-del="${kind}:${esc(p.id)}" aria-label="${esc(p.name || p.code)} verwijderen">${ic('trash', 20)}</button></div>`).join('')}</div>` : `<div class="empty">${cfg.empty}</div>`}
    </section>`;
  };

  const draw = () => {
    const st = get();
    const s = statsFor(st);
    const visited = s.visited.map(c => byCode.get(c)).sort((a, b) => a.n.localeCompare(b.n, 'nl'));
    const shown = showAll ? visited : visited.slice(0, 5);
    const wish = Object.entries(st.countries).filter(([, v]) => v.s === 'w').map(([c]) => byCode.get(c)).filter(Boolean).sort((a, b) => a.n.localeCompare(b.n, 'nl'));
    el.innerHTML = `<div class="page">
      <header class="page-head"><h1>Paspoort</h1><a class="icon-btn" href="#/instellingen" aria-label="Instellingen">${ic('gear', 22)}</a></header>
      <div class="cols">
        <section class="card" style="padding:12px 20px 20px">
          <div class="map-host mini" id="mini"></div>
          <div style="display:flex;align-items:flex-end;gap:24px;margin-top:18px">
            <div><span class="big">${s.un.length}</span><span class="big"><small> / ${s.totalUN}</small></span><div class="muted">landen</div></div>
            <div style="margin-left:auto;text-align:right"><span class="big">${s.pct}<small>%</small></span><div class="muted">van de wereld</div></div>
          </div>
          <div class="bar" style="height:12px;margin-top:16px;border-radius:6px"><i style="width:${s.pct}%"></i></div>
          <p class="muted" style="margin:10px 0 0;text-align:center;font-size:13px">Gebaseerd op ${s.totalUN} VN-landen</p>
        </section>
        <section class="card"><div class="card-head"><h2>Mijn continenten</h2></div>
          ${Object.entries(CONT).filter(([k]) => s.cont[k].total).map(([k, n]) => `<div class="bar-row"><span class="name">${n}</span><div class="bar"><i style="width:${s.cont[k].pct}%;${s.cont[k].got ? 'min-width:6px' : ''}"></i></div><span class="num">${s.cont[k].got}/${s.cont[k].total}</span></div>`).join('')}
        </section>
      </div>
      <section class="card"><div class="card-head"><div><h2>Mijn landen</h2><div class="muted">en niet-VN-gebieden</div></div><button type="button" class="btn soft" id="addc">${ic('plus', 18)}Toevoegen</button></div>
        ${shown.length ? `<div class="list">${shown.map(c => `<button type="button" class="list-row" style="width:100%;border:0;background:none;text-align:left;cursor:pointer;border-top:1px solid var(--line)" data-c="${c.c}">${flag(c.c)}<div class="grow"><div class="t">${esc(c.n)}</div><div class="s">${st.countries[c.c]?.y ? esc(st.countries[c.c].y) : ''}${c.u ? '' : ' niet-VN-gebied'}</div></div></button>`).join('')}</div>` : '<div class="empty">Nog geen landen. Tik op de kaart of voeg er een toe.</div>'}
        ${visited.length > 5 ? `<button type="button" class="btn block" id="more" style="margin-top:10px">${showAll ? 'Minder tonen' : `+ ${visited.length - 5} meer`}</button>` : ''}
      </section>
      ${wish.length ? `<section class="card"><div class="card-head"><h2>Wil ik zien</h2></div><div class="list">${wish.map(c => `<button type="button" class="list-row" style="width:100%;border:0;background:none;text-align:left;cursor:pointer;border-top:1px solid var(--line)" data-c="${c.c}">${flag(c.c)}<div class="grow"><div class="t">${esc(c.n)}</div></div></button>`).join('')}</div></section>` : ''}
      <div class="cols">${placeCard('cities')}${placeCard('regions')}${placeCard('airports')}</div>
    </div>`;
    map?.destroy();
    map = createMap(el.querySelector('#mini'), { interactive: false });
  };
  draw();
  const unsub = subscribe(draw);

  const onClick = e => {
    const c = e.target.closest('[data-c]');
    if (c) { openCountrySheet(c.dataset.c); return; }
    const a = e.target.closest('[data-add]');
    if (a) { openPlaceForm(a.dataset.add); return; }
    const d = e.target.closest('[data-del]');
    if (d) {
      const [kind, pid] = d.dataset.del.split(':');
      update(st => { st.places[kind] = st.places[kind].filter(p => p.id !== pid); });
      return;
    }
    if (e.target.closest('#addc')) { openCountryPicker(); return; }
    if (e.target.closest('#more')) { showAll = !showAll; draw(); }
  };
  el.addEventListener('click', onClick);
  return () => { unsub(); map?.destroy(); el.removeEventListener('click', onClick); };
}
