// Kleine UI-helpers: escapen, iconen, sheet (modal), toast
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICONS = {
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zM5 17a3 3 0 0 1 3-3h11"/>',
  case: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 13h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>',
  plane: '<path d="M12 3l2 7 7 3v2l-7-1-1 5 2 2v1l-3-1-3 1v-1l2-2-1-5-7 1v-2l7-3z"/>',
  car: '<path d="M5 16v-4l2-5h10l2 5v4M3 16h18M7.5 16v2.5M16.5 16v2.5"/><circle cx="8" cy="13" r=".6"/><circle cx="16" cy="13" r=".6"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l2-4M16 21l-2-4"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/>',
  bus: '<rect x="4" y="4" width="16" height="13" rx="2"/><path d="M4 11h16M7 17v3M17 17v3"/>',
  boat: '<path d="M3 15l2 5h14l2-5zM12 3v8M12 4l6 6h-6"/>',
  dots: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  bed: '<path d="M3 18V6M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6"/>',
  fork: '<path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M17 21V3c-2 1-3.5 3.5-3.5 7v3H17"/>',
  snor: '<path d="M12 10.2c-1.4-1.9-3.9-2.6-6.1-1.7-1.7.7-2.7 2-2.9 3.7.3 1.7 1.5 2.8 3.3 2.8 1.8 0 3-1 3.8-2.2.6-.8 1.1-1.2 1.9-1.2s1.3.4 1.9 1.2c.8 1.2 2 2.2 3.8 2.2 1.8 0 3-1.1 3.3-2.8-.2-1.7-1.2-3-2.9-3.7-2.2-.9-4.7-.2-6.1 1.7z"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  share: '<path d="M12 16V4M7 9l5-5 5 5M5 14v5h14v-5"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  doc: '<path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  gear: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
};
export const ic = (n, s = 24) =>
  `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/** Open een bottom sheet. Geeft { el, close } terug. */
export function openSheet(html, { title = '', onClose } = {}) {
  const root = document.getElementById('sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-grab"></div><div class="sheet-body" style="display:flex;flex-direction:column;gap:16px">${html}</div></div>`;
  root.append(wrap);
  const prev = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    prev?.focus?.();
    onClose?.();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  const el = wrap.querySelector('.sheet-body');
  return { el, close, setHtml: h => { el.innerHTML = h; } };
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

export const formField = (id, label, input) => `<div class="field"><label for="${id}">${label}</label>${input}</div>`;

/** Datums: 'YYYY-MM-DD' → '6 sep 2026' en perioden. */
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export function parseDate(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function fmtDate(s) { const d = parseDate(s); return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : ''; }
export function fmtRange(a, b) {
  const da = parseDate(a), db = parseDate(b);
  if (!da) return '';
  if (!db || +da === +db) return fmtDate(a);
  if (da.getFullYear() === db.getFullYear()) {
    if (da.getMonth() === db.getMonth()) return `${da.getDate()}–${db.getDate()} ${MONTHS[db.getMonth()]} ${db.getFullYear()}`;
    return `${da.getDate()} ${MONTHS[da.getMonth()]} – ${db.getDate()} ${MONTHS[db.getMonth()]} ${db.getFullYear()}`;
  }
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}
export function daysBetween(a, b) {
  const da = parseDate(a), db = parseDate(b || a);
  if (!da || !db) return 0;
  return Math.round((db - da) / 86400000) + 1;
}

/** Score met een snor (silhouet van het blog, in themakleur) en een getal met vaste breedte, zodat alles netjes onder elkaar staat. */
export const scoreH = v => `<span class="score"><span class="snor-i" aria-hidden="true"></span><span class="sn">${esc(String(v))}</span></span>`;
/** Scorekiezer met snor-icoon per waarde (vervangt een select, want een select kan geen icoon tonen). Hidden input name=score houdt de waarde vast; opnieuw tikken wist de score. */
export const scorePick = v => `<div class="sp" role="group" aria-label="Score"><input type="hidden" name="score" value="${esc(String(v ?? ''))}">${[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(n => `<button type="button" class="sp-b${String(v) === String(n) ? ' on' : ''}" data-sp="${n}" aria-pressed="${String(v) === String(n)}">${scoreH(String(n).replace('.', ','))}</button>`).join('')}</div>`;
document.addEventListener('click', e => {
  const b = e.target.closest('.sp-b'); if (!b) return;
  const sp = b.closest('.sp'), inp = sp.querySelector('input'), on = !b.classList.contains('on');
  sp.querySelectorAll('.sp-b').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
  if (on) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
  inp.value = on ? b.dataset.sp : '';
  inp.dispatchEvent(new Event('input', { bubbles: true }));
});
/** Tekst voor een scorekeuze: 1 snor, 3,5 snorren. */
export const snorTxt = n => `${String(n).replace('.', ',')} ${Number(n) === 1 ? 'snor' : 'snorren'}`;
