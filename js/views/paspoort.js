import { get, subscribe, update, newId, setCountry } from '../store.js';
import { byCode, CONT, flag, nameOf, statsFor } from '../data.js';
import { createMap } from '../map.js';
import { esc, ic, openSheet, toast, fmtRange, fmtDate, daysBetween, scoreH } from '../ui.js';
import { load as loadCoasters, parkOverview, ridesOf, avgScore } from './credits.js';
import { countryOptions } from '../trips.js';
import { openCountryPicker, openCountrySheet } from '../sheets.js';
import { loadAirports, attachAirportSearch } from '../airports.js';

const wideNow = () => window.matchMedia('(min-width: 1100px)').matches;
const num = v => String(v).replace('.', ',');

const PLACES = {
  cities: { title: 'Mijn steden', add: 'Stad toevoegen', empty: 'Nog geen steden' },
  regions: { title: "Mijn regio's", add: 'Regio toevoegen', empty: "Nog geen regio's" },
  airports: { title: 'Mijn luchthavens', add: 'Luchthaven toevoegen', empty: 'Nog geen luchthavens' },
};

function openPlaceForm(kind) {
  const cfg = PLACES[kind];
  const sh = openSheet(`<h2>${cfg.add}</h2>
    <form class="form" novalidate>
      ${kind === 'airports' ? `<div class="field"><label for="p-zoek">Zoeken</label><input id="p-zoek" placeholder="Zoek luchthaven, stad of code" autocapitalize="characters"></div>
      <p class="muted" style="margin:-4px 0 0;font-size:13px">Staat hij er niet tussen? Vul hem hieronder zelf in.</p>
      <div class="pair"><div class="field" style="flex:0 0 110px"><label for="p-code">Code</label><input id="p-code" name="code" maxlength="4" placeholder="BRU" style="text-transform:uppercase"></div>
        <div class="field"><label for="p-naam">Naam</label><input id="p-naam" name="naam" placeholder="Naam van de luchthaven"></div></div>`
      : `<div class="field"><label for="p-naam">Naam</label><input id="p-naam" name="naam" placeholder="Naam"></div>`}
      <div class="field"><label for="p-land">Land</label><select id="p-land" name="land">${countryOptions('')}</select></div>
      <p class="muted" role="alert" id="p-err" style="margin:0;color:var(--danger)"></p>
      <div class="pair"><button type="button" class="btn" data-close>Annuleren</button><button type="submit" class="btn primary">Opslaan</button></div>
    </form>`, { title: cfg.add });
  if (kind === 'airports') {
    loadAirports();
    attachAirportSearch(sh.el.querySelector('#p-zoek'), a => {
      const f = sh.el.querySelector('form').elements;
      f.code.value = a.code; f.naam.value = a.name; f.land.value = a.c;
    });
  }
  sh.el.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements;
    const naam = f.naam.value.trim(), land = f.land.value, code = (f.code?.value || '').trim().toUpperCase();
    const err = sh.el.querySelector('#p-err');
    if (kind === 'airports' ? (!code && !naam) : !naam) { err.textContent = 'Vul een naam in.'; return; }
    if (!land) { err.textContent = 'Kies een land.'; return; }
    update(st => {
      st.places[kind].push(kind === 'airports' ? { id: newId(), code, name: naam, c: land } : { id: newId(), name: naam, c: land });
      if (kind !== 'airports' && !st.countries[land]) st.countries[land] = { s: 'v' };
    });
    sh.close();
    toast('Toegevoegd');
  });
}

export function mount(el) {
  let coasters = [];
  loadCoasters().then(db => { coasters = db; if (wideNow()) draw(); });
  const mq = window.matchMedia('(min-width: 1100px)');
  let showAll = false;
  const openSitePark = new Set();
  let slide = 0;
  let map = null;

  const open = new Set();
  const delBtn = (kind, p) => `<button type="button" class="icon-btn" style="background:var(--bg)" data-del="${kind}:${esc(p.id)}" aria-label="${esc(p.name || p.code)} verwijderen">${ic('trash', 20)}</button>`;

  // Steden staan gegroepeerd per land: één rij per land, openklappen voor de steden.
  const citiesList = items => {
    const groups = new Map();
    for (const p of items) { if (!groups.has(p.c)) groups.set(p.c, []); groups.get(p.c).push(p); }
    const sorted = [...groups].sort((a, b) => b[1].length - a[1].length || nameOf(a[0]).localeCompare(nameOf(b[0]), 'nl'));
    return `<div class="list">${sorted.map(([c, ps]) => {
      const isOpen = open.has(c);
      return `<div class="grp${isOpen ? ' open' : ''}"><button type="button" class="list-row grp-head" data-grp="${esc(c)}" aria-expanded="${isOpen}">${flag(c)}<div class="grow"><div class="t">${esc(nameOf(c))}</div>${isOpen ? '' : `<div class="s ell">${esc(ps.map(p => p.name).join(', '))}</div>`}</div><span class="count">${ps.length}</span>${ic('chev', 20)}</button>
        ${isOpen ? `<div class="grp-body">${ps.map(p => `<div class="list-row sub"><div class="grow"><div class="t">${esc(p.name)}</div></div>${delBtn('cities', p)}</div>`).join('')}</div>` : ''}</div>`;
    }).join('')}</div>`;
  };

  const placeCard = kind => {
    const cfg = PLACES[kind];
    const items = get().places[kind];
    const n = items.length, l = new Set(items.map(p => p.c)).size;
    const sub = kind === 'cities' && n ? `<div class="muted">${n} ${n === 1 ? 'stad' : 'steden'} in ${l} ${l === 1 ? 'land' : 'landen'}</div>` : '';
    return `<section class="card"><div class="card-head"><div><h2>${cfg.title}</h2>${sub}</div><button type="button" class="btn soft" data-add="${kind}">${ic('plus', 18)}Toevoegen</button></div>
      ${!n ? `<div class="empty">${cfg.empty}</div>` : kind === 'cities' ? citiesList(items) : `<div class="list">${items.map(p => `<div class="list-row">${flag(p.c)}<div class="grow"><div class="t">${esc(kind === 'airports' ? [p.code, p.name].filter(Boolean).join(' · ') : p.name)}</div><div class="s">${esc(nameOf(p.c))}</div></div>${delBtn(kind, p)}</div>`).join('')}</div>`}
    </section>`;
  };

  // Overzicht voor de site (breed scherm): geen kaarten, open lijsten met dunne lijnen.
  const siteHtml = (st, s, visited, conts, contTotal) => {
    const trips = [...st.trips].sort((a, b) => (b.start || '').localeCompare(a.start || '')).slice(0, 5);
    const parks = parkOverview(coasters, st.credits || {});
    const allRides = parks.flatMap(p => p.rows);
    const rideN = allRides.reduce((n, r) => n + r.rides, 0), creditN = allRides.length;
    const cities = st.places.cities, airports = st.places.airports;
    const cityGroups = new Map();
    for (const p of cities) { if (!cityGroups.has(p.c)) cityGroups.set(p.c, []); cityGroups.get(p.c).push(p.name); }
    const cg = [...cityGroups].sort((a, b) => b[1].length - a[1].length || nameOf(a[0]).localeCompare(nameOf(b[0]), 'nl'));
    const avgAll = avgScore(parks.flatMap(pk => []).concat(Object.values(st.credits || {}).flatMap(c => ridesOf(c))));
    const stat = (n, small, l, sub) => `<div><b>${n}${small ? `<small> ${small}</small>` : ''}</b><span>${l}</span><em>${sub || '&nbsp;'}</em></div>`;
    return `<div class="site pas-site">
      <header class="site-head"><h1>Paspoort</h1><a class="icon-btn" href="#/instellingen" aria-label="Instellingen">${ic('gear', 22)}</a></header>
      <p class="site-lead">${s.un.length} van ${s.totalUN} landen bezocht · ${cities.length} ${cities.length === 1 ? 'stad' : 'steden'} · ${airports.length} ${airports.length === 1 ? 'luchthaven' : 'luchthavens'}</p>
      <div class="site-map"><div class="map-host mini plain" id="mini"></div></div>
      <div class="site-stats">${stat(s.un.length, `/ ${s.totalUN}`, 'landen', `${s.pct}% van de wereld`)}${stat(conts, `/ ${contTotal}`, 'continenten', `${Math.round(conts / contTotal * 100)}% verkend`)}${stat(cities.length, '', cities.length === 1 ? 'stad' : 'steden', `in ${new Set(cities.map(p => p.c)).size} landen`)}${stat(airports.length, '', airports.length === 1 ? 'luchthaven' : 'luchthavens', '')}${stat(creditN, creditN === 1 ? 'credit' : 'credits', 'pretparken', rideN ? `${rideN} ${rideN === 1 ? 'rit' : 'ritten'}${avgAll ? ` · gemiddeld ${num(avgAll)}` : ''}` : '')}</div>
      <div class="site-cols">
        <section><h2>Reizen<a href="#/reizen">Alle reizen</a></h2>${trips.length ? trips.map(t => { const d = daysBetween(t.start, t.end); return `<a class="s-trip" href="#/reis/${esc(t.id)}"><span class="s-tt">${esc(t.title || nameOf(t.legs[0]?.c) || 'Reis')}</span><span class="s-tl">${d} ${d === 1 ? 'dag' : 'dagen'}</span><span class="s-td">${esc(fmtRange(t.start, t.end))}</span><span class="s-tf">${t.legs.slice(0, 5).map(l => flag(l.c)).join('')}</span></a>`; }).join('') : '<div class="empty">Nog geen reizen</div>'}</section>
        <section><h2>Landen<button type="button" class="s-add" id="addc">Toevoegen</button></h2><ul class="s-two">${visited.map(c => `<li data-c="${c.c}">${flag(c.c)}<span>${esc(c.n)}</span><small>${st.countries[c.c]?.y ? esc(st.countries[c.c].y) : ''}</small></li>`).join('')}</ul></section>
        <section><h2>Pretparken<a href="#/credits">Alle pretparken</a></h2>${parks.length ? parks.map(pk => { const o = openSitePark.has(pk.park); return `<div class="s-parkwrap${o ? ' open' : ''}"><button type="button" class="s-park" data-spark="${esc(pk.park)}" aria-expanded="${o}">${pk.country ? flag(pk.country) : ''}<div class="s-pn"><b>${esc(pk.park)}</b><small>${pk.country ? esc(nameOf(pk.country)) : ''}${pk.last ? ` · laatst ${esc(fmtDate(pk.last))}` : ''}</small></div><div class="s-c">${pk.got}<small> / ${pk.total} credits</small></div><span class="s-chev">${ic('chev', 18)}</span></button><div class="s-pb"><u style="width:${Math.round(pk.got / (pk.total || 1) * 100)}%"></u></div>
          ${o ? `<table class="s-tab"><tr><th>Baan</th><th>Score</th><th>Ritten</th><th class="d">Datums</th></tr>${pk.rows.map(r => `<tr><td class="n">${esc(r.name)}<small>${esc(r.meta)}</small></td><td>${r.score ? scoreH(num(r.score)) : ''}</td><td>${r.rides}</td><td class="d">${esc(r.dates)}</td></tr>`).join('')}</table>` : ''}</div>`; }).join('') : '<div class="empty">Nog geen pretparken</div>'}</section>
        <section><h2>Steden<button type="button" class="s-add" data-add="cities">Toevoegen</button></h2><ul>${cg.map(([c, names]) => `<li data-c="${esc(c)}">${flag(c)}<span>${esc(nameOf(c))}<small>${esc(names.join(', '))}</small></span><em>${names.length}</em></li>`).join('') || '<li class="empty">Nog geen steden</li>'}</ul></section>
        <section><h2>Luchthavens<button type="button" class="s-add" data-add="airports">Toevoegen</button></h2><ul>${airports.map(p => `<li>${flag(p.c)}<span>${esc([p.code, p.name].filter(Boolean).join(' · '))}<small>${esc(nameOf(p.c))}</small></span></li>`).join('') || '<li class="empty">Nog geen luchthavens</li>'}</ul></section>
        <section><h2>Continenten</h2>${Object.entries(CONT).filter(([k]) => s.cont[k].total).map(([k, n]) => `<div class="s-cb"><span>${esc(n)}</span><div><u style="width:${s.cont[k].pct}%"></u></div><b>${s.cont[k].got}/${s.cont[k].total}</b></div>`).join('')}</section>
      </div></div>`;
  };

  const draw = () => {
    const st = get();
    const s = statsFor(st);
    const visited = s.visited.map(c => byCode.get(c)).sort((a, b) => a.n.localeCompare(b.n, 'nl'));
    const shown = showAll ? visited : visited.slice(0, 5);
    const contVisited = new Set(s.visited.map(c => byCode.get(c)?.k).filter(Boolean));
    const contTotal = Object.keys(CONT).length;
    const conts = contVisited.size, contPct = Math.round((conts / contTotal) * 100);
    const top = Object.keys(CONT).filter(k => s.cont[k].got).sort((a, b) => s.cont[b].got - s.cont[a].got)[0] || null;
    const wish = Object.entries(st.countries).filter(([, v]) => v.s === 'w').map(([c]) => byCode.get(c)).filter(Boolean).sort((a, b) => a.n.localeCompare(b.n, 'nl'));
    if (wideNow()) {
      el.innerHTML = siteHtml(st, s, visited, conts, contTotal);
      map?.destroy();
      map = createMap(el.querySelector('#mini'), { interactive: false, contain: true });
      return;
    }
    el.innerHTML = `<div class="page">
      <header class="page-head"><h1>Paspoort</h1><a class="icon-btn" href="#/instellingen" aria-label="Instellingen">${ic('gear', 22)}</a></header>
      <div class="cols">
        <div class="map-plain"><div class="map-host mini plain" id="mini"></div></div>
        <section class="card" aria-roledescription="carrousel" aria-label="Statistieken">
          <div class="carousel" id="car" tabindex="0">
            <div class="slide" role="group" aria-roledescription="kaart" aria-label="1 van 3: In totaal">
              <h2>In totaal</h2>
              <div style="display:flex;align-items:flex-end;gap:24px;margin-top:16px">
                <div><span class="big">${s.un.length}</span><span class="big"><small> / ${s.totalUN}</small></span><div class="muted">landen</div></div>
                <div style="margin-left:auto;text-align:right"><span class="big">${s.pct}<small>%</small></span><div class="muted">van de wereld</div></div>
              </div>
              <div class="bar" style="height:12px;margin-top:16px;border-radius:6px"><i style="width:${s.pct}%"></i></div>
              <p class="muted" style="margin:10px 0 0;text-align:center;font-size:13px">Gebaseerd op ${s.totalUN} VN-landen</p>
            </div>
            <div class="slide" role="group" aria-roledescription="kaart" aria-label="2 van 3: Continenten">
              <h2>Continenten</h2>
              <div style="display:flex;align-items:flex-end;gap:24px;margin-top:16px">
                <div><span class="big">${conts}</span><span class="big"><small> / ${contTotal}</small></span><div class="muted">bezocht</div></div>
                <div style="margin-left:auto;text-align:right"><span class="big">${contPct}<small>%</small></span><div class="muted">verkend</div></div>
              </div>
              <div class="bar" style="height:12px;margin-top:16px;border-radius:6px"><i style="width:${contPct}%"></i></div>
            </div>
            <div class="slide" role="group" aria-roledescription="kaart" aria-label="3 van 3: Meest bezochte continent">
              <h2>Meest bezochte continent</h2>
              ${top ? `<div style="font-size:30px;font-weight:700;color:var(--muted);margin-top:14px">${CONT[top]}</div>
              <div><span class="big">${s.cont[top].got}</span><span class="big"><small> / ${s.cont[top].total}</small></span></div>
              <div class="muted">landen</div>
              <div class="bar" style="height:12px;margin-top:14px;border-radius:6px"><i style="width:${s.cont[top].pct}%"></i></div>` : '<p class="muted" style="margin-top:14px">Nog geen landen bezocht.</p>'}
            </div>
          </div>
          <div class="dots" role="group" aria-label="Kies een kaart">${[0, 1, 2].map(i => `<button type="button" data-dot="${i}" aria-label="Kaart ${i + 1} van 3" aria-current="${i === slide}"></button>`).join('')}</div>
        </section>
      </div>
      <div class="cols">
        <section class="card"><div class="card-head"><h2>Mijn continenten</h2></div>
          ${Object.entries(CONT).filter(([k]) => s.cont[k].total).map(([k, n]) => `<div class="bar-row"><span class="name">${n}</span><div class="bar"><i style="width:${s.cont[k].pct}%;${s.cont[k].got ? 'min-width:6px' : ''}"></i></div><span class="num">${s.cont[k].got}/${s.cont[k].total}</span></div>`).join('')}
        </section>
      </div>
      <section class="card"><div class="card-head"><div><h2>Mijn landen</h2><div class="muted">en niet-VN-gebieden</div></div><button type="button" class="btn soft" id="addc">${ic('plus', 18)}Toevoegen</button></div>
        ${shown.length ? `<div class="list">${shown.map(c => `<button type="button" class="list-row" style="width:100%;border:0;background:none;text-align:left;cursor:pointer;border-top:1px solid var(--line)" data-c="${c.c}">${flag(c.c)}<div class="grow"><div class="t">${esc(c.n)}</div><div class="s">${st.countries[c.c]?.y ? esc(st.countries[c.c].y) : ''}${c.u ? '' : ' niet-VN-gebied'}</div></div></button>`).join('')}</div>` : '<div class="empty">Nog geen landen. Tik op de kaart of voeg er een toe.</div>'}
        ${visited.length > 5 ? `<button type="button" class="btn block" id="more" style="margin-top:10px">${showAll ? 'Minder tonen' : `+ ${visited.length - 5} meer`}</button>` : ''}
      </section>
      ${wish.length ? `<section class="card"><div class="card-head"><h2>Wil ik zien</h2></div><div class="list">${wish.map(c => `<button type="button" class="list-row" style="width:100%;border:0;background:none;text-align:left;cursor:pointer;border-top:1px solid var(--line)" data-c="${c.c}">${flag(c.c)}<div class="grow"><div class="t">${esc(c.n)}</div></div></button>`).join('')}</div></section>` : ''}
      <a class="card list-row" href="#/credits" style="padding:14px 20px"><span class="ico-sm">${ic('coaster', 22)}</span><div class="grow"><div class="t">Mijn pretparken</div><div class="s">${Object.keys(st.credits || {}).length} ${Object.keys(st.credits || {}).length === 1 ? 'credit' : 'credits'}</div></div>${ic('chev', 20)}</a>
      <div class="cols">${placeCard('cities')}${placeCard('regions')}${placeCard('airports')}</div>
    </div>`;
    map?.destroy();
    map = createMap(el.querySelector('#mini'), { interactive: false });
    const car = el.querySelector('#car');
    car.scrollLeft = slide * car.clientWidth;
    let raf = 0;
    car.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        slide = Math.round(car.scrollLeft / car.clientWidth);
        el.querySelectorAll('[data-dot]').forEach(d => d.setAttribute('aria-current', String(+d.dataset.dot === slide)));
      });
    });
    car.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = Math.max(0, Math.min(2, slide + (e.key === 'ArrowRight' ? 1 : -1)));
      car.scrollTo({ left: i * car.clientWidth, behavior: 'smooth' });
    });
  };
  draw();
  const unsub = subscribe(draw);
  mq.addEventListener('change', draw);

  const onClick = e => {
    const dot = e.target.closest('[data-dot]');
    if (dot) { const car = el.querySelector('#car'); car.scrollTo({ left: +dot.dataset.dot * car.clientWidth, behavior: 'smooth' }); return; }
    const c = e.target.closest('[data-c]');
    if (c) { openCountrySheet(c.dataset.c); return; }
    const sp = e.target.closest('[data-spark]');
    if (sp) { const k = sp.dataset.spark; openSitePark.has(k) ? openSitePark.delete(k) : openSitePark.add(k); draw(); return; }
    const g = e.target.closest('[data-grp]');
    if (g) { const c = g.dataset.grp; open.has(c) ? open.delete(c) : open.add(c); draw(); return; }
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
  return () => { unsub(); mq.removeEventListener('change', draw); map?.destroy(); el.removeEventListener('click', onClick); };
}
