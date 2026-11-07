// Wereldkaart (SVG) met pan/zoom (muis, touch, pinch) en klikbare landen.
import { map as mp, list } from './data.js';
import { get } from './store.js';

export function createMap(host, { interactive = true, onSelect = null , contain = false } = {}) {
  const { w: W, h: H, paths, scale, ty } = mp;
  const markers = list.filter(c => c.p);
  const body = Object.entries(paths).map(([c, d]) => `<path data-c="${c}" d="${d}"/>`).join('') +
    markers.map(c => `<circle data-c="${c.c}" cx="${c.p[0]}" cy="${c.p[1]}" r="5"/>`).join('');
  host.innerHTML = `<svg class="map${interactive ? '' : ' static'}" role="img" aria-label="Wereldkaart met bezochte landen"><g>${body}</g></svg>`;
  const svg = host.querySelector('svg');
  const g = svg.querySelector('g');
  const els = [...g.querySelectorAll('[data-c]')];
  const circles = [...g.querySelectorAll('circle')];
  let vw = 1, vh = 1, k = 1, x = 0, y = 0, k0 = 1, inited = false;

  const project = (lon, lat) => [
    W / 2 + scale * lon * Math.PI / 180,
    -scale * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) + ty,
  ];

  function apply(smooth) {
    g.style.transition = smooth ? 'transform .35s ease' : 'none';
    g.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    const r = (interactive ? 5 : 4) / k;
    for (const c of circles) c.setAttribute('r', r.toFixed(2));
  }
  function clamp() {
    k = Math.min(Math.max(k, k0), k0 * 80);
    const ww = W * k, hh = H * k;
    x = ww <= vw ? (vw - ww) / 2 : Math.min(0, Math.max(vw - ww, x));
    y = hh <= vh ? (vh - hh) / 2 : Math.min(0, Math.max(vh - hh, y));
  }
  function zoomAt(px, py, factor, smooth) {
    const nk = Math.min(Math.max(k * factor, k0), k0 * 80);
    const f = nk / k;
    x = px - (px - x) * f; y = py - (py - y) * f; k = nk;
    clamp(); apply(smooth);
  }
  function focusPoint(lon, lat, kk) {
    const [px, py] = project(lon, lat);
    k = kk; x = vw / 2 - k * px; y = vh / 2 - k * py;
    clamp(); apply(false);
  }

  function resize() {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    vw = r.width; vh = r.height;
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    k0 = interactive ? Math.max(vw / W, vh / H) : contain ? Math.min(vw / W, vh / H) : vw / W;
    if (!inited) {
      inited = true;
      if (interactive) focusPoint(14, 50, Math.max(k0, vw >= 900 ? vw / 1000 : vw / 300)); else { k = k0; x = 0; y = 0; clamp(); apply(false); }
    } else { clamp(); apply(false); }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  function update() {
    const cs = get().countries;
    // Landen waar je enkel doorheen reed (auto, trein, bus, boot): lichte kleur, maar niet als bezocht geteld.
    const thru = new Set();
    for (const t of get().trips || []) for (const l of t.legs || []) if (l.transit && l.mode !== 'plane') thru.add(l.c);
    for (const el of els) {
      const s = cs[el.dataset.c]?.s;
      el.classList.toggle('v', s === 'v');
      el.classList.toggle('w', s === 'w');
      el.classList.toggle('t', s !== 'v' && thru.has(el.dataset.c));
    }
  }
  update();

  let selected = null;
  function select(code) {
    selected?.forEach(e => e.classList.remove('sel'));
    selected = code ? els.filter(e => e.dataset.c === code) : null;
    selected?.forEach(e => e.classList.add('sel'));
  }

  function focus(code) {
    const el = els.find(e => e.dataset.c === code);
    if (!el) return;
    let bb;
    try { bb = el.getBBox(); } catch { return; }
    const isMarker = el.tagName === 'circle';
    const kk = isMarker ? Math.max(k, k0 * 12) : Math.min(Math.max(Math.min(vw / (bb.width * 1.8), vh / (bb.height * 1.8)), k0), k0 * 40);
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    k = kk; x = vw / 2 - k * cx; y = vh / 2 - k * cy;
    clamp(); apply(true);
  }

  // ---------- Gebaren ----------
  if (interactive) {
    const ptrs = new Map();
    let down = null, moved = false, pinch = null, suppressClick = false;
    svg.addEventListener('pointerdown', e => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { down = { x: e.clientX, y: e.clientY, t: Date.now(), target: e.target.closest?.('[data-c]') }; moved = false; }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; moved = true; }
    });
    svg.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (ptrs.size === 1) {
        if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { moved = true; svg.setPointerCapture(e.pointerId); }
        if (moved) { x += dx; y += dy; clamp(); apply(false); }
      } else if (ptrs.size === 2 && pinch) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const rect = svg.getBoundingClientRect();
        zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, d / pinch.d, false);
        pinch.d = d;
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const end = e => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (ptrs.size === 0) { suppressClick = moved; down = null; }
    };
    svg.addEventListener('click', e => {
      if (suppressClick) { suppressClick = false; return; }
      const t = e.target.closest?.('[data-c]');
      if (t) onSelect?.(t.dataset.c);
    });
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015), false);
    }, { passive: false });
  }

  return {
    update, select, focus,
    zoomBy: f => zoomAt(vw / 2, vh / 2, f, true),
    destroy: () => ro.disconnect(),
  };
}
