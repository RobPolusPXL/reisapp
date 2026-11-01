import { loadData } from './data.js';
import { get, subscribe } from './store.js';
import { ic, esc } from './ui.js';
import { initSync } from './sync.js';

const TABS = [['kaart', 'Kaart', 'map'], ['paspoort', 'Paspoort', 'book'], ['reizen', 'Reizen', 'case']];
const view = document.getElementById('view');
let cleanup = null;

// ---------- Thema ----------
const dark = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const { theme, mode } = get().settings;
  const isDark = mode === 'dark' || (mode === 'system' && dark.matches);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.scheme = isDark ? 'dark' : 'light';
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', accent);
}
dark.addEventListener('change', applyTheme);
subscribe(applyTheme);
applyTheme();

// ---------- Navigatie ----------
function drawNav(active) {
  const links = TABS.map(([id, label, icon]) => `<a href="#/${id}" ${active === id ? 'aria-current="page"' : ''}>${ic(icon, 24)}${label}</a>`).join('');
  document.getElementById('tabs').innerHTML = links;
  document.getElementById('side').innerHTML =
    `<div class="brand"><img src="assets/snor.webp" alt="" width="36" height="11"><span>Mustache Passport</span></div>${TABS.map(([id, label, icon]) => `<a href="#/${id}" ${active === id ? 'aria-current="page"' : ''}>${ic(icon, 22)}${label}</a>`).join('')}
     <div class="spacer"></div><a href="#/instellingen" ${active === 'instellingen' ? 'aria-current="page"' : ''}>${ic('gear', 22)}Instellingen</a>`;
}

const loaders = {
  kaart: () => import('./views/kaart.js'),
  paspoort: () => import('./views/paspoort.js'),
  reizen: () => import('./views/reizen.js'),
  reis: () => import('./views/reis.js'),
  statistieken: () => import('./views/statistieken.js'),
  credits: () => import('./views/credits.js'),
  achtbaanstatistieken: () => import('./views/achtbaanstatistieken.js'),
  instellingen: () => import('./views/instellingen.js'),
};

async function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'kaart').split('/');
  const name = loaders[parts[0]] ? parts[0] : 'kaart';
  const tab = name === 'reis' || name === 'statistieken' ? 'reizen' : name === 'credits' || name === 'achtbaanstatistieken' ? 'paspoort' : name;
  cleanup?.(); cleanup = null;
  view.className = '';
  view.innerHTML = '';
  drawNav(tab);
  try {
    const mod = await loaders[name]();
    cleanup = mod.mount(view, { params: parts.slice(1) }) || null;
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="page"><div class="card"><h2>Dit scherm is er nog niet</h2><p class="muted">${esc(err.message || '')}</p></div></div>`;
  }
  if (name !== 'kaart') view.scrollTop = 0;
}

(async () => {
  await loadData();
  window.addEventListener('hashchange', route);
  await route();
  initSync();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
