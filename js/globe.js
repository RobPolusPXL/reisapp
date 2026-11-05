// Kleine wereldbol (orthografisch) met een werelddeel in het midden.
import { map as mp, list } from './data.js';

const D = Math.PI / 180;
let geo = null;   // { code: [ [ [lon, lat], ... ], ... ] } in radialen

// De kaartdata staat in Mercator-coördinaten; terugrekenen naar lengte/breedte.
function load() {
  if (geo) return geo;
  const { w, scale, ty, paths } = mp;
  geo = {};
  for (const [c, d] of Object.entries(paths)) {
    const rings = [];
    for (const part of d.split('M').slice(1)) {
      const pts = [];
      for (const m of part.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
        const lon = (+m[1] - w / 2) / scale;
        const lat = 2 * Math.atan(Math.exp((ty - +m[2]) / scale)) - Math.PI / 2;
        pts.push([lon, lat]);
      }
      if (pts.length > 2) rings.push(pts);
    }
    geo[c] = rings;
  }
  return geo;
}

// Midden van een werelddeel: gemiddelde richting van de landen (elk land telt even zwaar).
function centerOf(codes) {
  const g = load();
  let X = 0, Y = 0, Z = 0;
  for (const c of codes) {
    let x = 0, y = 0, z = 0, n = 0;
    for (const ring of g[c] || []) for (const [lo, la] of ring) { x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la); n++; }
    if (!n) continue;
    // Zeer grote landen (Rusland, China, VS) wegen minder zwaar, zodat het werelddeel zelf in het midden komt.
    const m = Math.hypot(x, y, z) / n;                    // dichtbij 1 = klein land
    const wgt = m > 0.9 ? 1 : 0.25;
    X += wgt * x / n; Y += wgt * y / n; Z += wgt * z / n;
  }
  return [Math.atan2(Y, X), Math.atan2(Z, Math.hypot(X, Y))];
}

const cache = new Map();

/** SVG-bol gecentreerd op werelddeel `cont`; bezochte landen in accentkleur, het werelddeel iets donkerder. */
export function globeSvg(cont, visited, size = 150) {
  if (!mp || !cont) return '';
  const key = `${cont}|${[...visited].sort().join()}|${size}`;
  if (cache.has(key)) return cache.get(key);
  const g = load();
  const inCont = list.filter(c => c.k === cont && g[c.c]).map(c => c.c);
  const [l0, p0] = centerOf(inCont);
  const R = size / 2 - 1, cx = size / 2, cy = size / 2;
  const sin0 = Math.sin(p0), cos0 = Math.cos(p0);
  const contSet = new Set(inCont);
  const out = { o: '', k: '', v: '' };
  for (const [c, rings] of Object.entries(g)) {
    let d = '';
    for (const ring of rings) {
      // Punten naar 3D-richting in het zicht-assenstelsel: x rechts, y omhoog, z naar de kijker.
      const P = ring.map(([lo, la]) => {
        const dl = lo - l0, cl = Math.cos(la);
        return [cl * Math.sin(dl), cos0 * Math.sin(la) - sin0 * cl * Math.cos(dl), sin0 * Math.sin(la) + cos0 * cl * Math.cos(dl)];
      });
      if (!P.some(q => q[2] >= 0)) continue;
      const pts = [];                       // 2D-punten van de zichtbare omtrek
      let exitAng = null;
      const rimAng = q => Math.atan2(q[1], q[0]);
      const cross = (u, v) => {              // snijpunt van het stuk u-v met de horizon (z = 0)
        const t = u[2] / (u[2] - v[2]);
        const q = [u[0] + t * (v[0] - u[0]), u[1] + t * (v[1] - u[1])];
        const h = Math.hypot(q[0], q[1]) || 1;
        return [q[0] / h, q[1] / h, 0];
      };
      const arc = (a0, a1) => {              // langs de rand van de bol, kortste weg
        let da = a1 - a0;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        const n = Math.max(1, Math.ceil(Math.abs(da) / 0.15));
        for (let i = 1; i < n; i++) { const a = a0 + da * i / n; pts.push([Math.cos(a), Math.sin(a)]); }
      };
      for (let i = 0; i < P.length; i++) {
        const cur = P[i], prev = P[(i + P.length - 1) % P.length];
        const vc = cur[2] >= 0, vp = prev[2] >= 0;
        if (vc && !vp) { const q = cross(prev, cur); if (exitAng !== null) arc(exitAng, rimAng(q)); pts.push([q[0], q[1]]); }
        if (vc) pts.push([cur[0], cur[1]]);
        if (!vc && vp) { const q = cross(cur, prev); pts.push([q[0], q[1]]); exitAng = rimAng(q); }
      }
      if (pts.length > 2) d += 'M' + pts.map(([x, y]) => `${(cx + R * x).toFixed(1)},${(cy - R * y).toFixed(1)}`).join('L') + 'Z';
    }
    if (d) out[visited.has(c) ? 'v' : contSet.has(c) ? 'k' : 'o'] += d;
  }
  const svg = `<svg class="globe" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-hidden="true">
    <defs><clipPath id="gclip"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>
    <circle class="g-sea" cx="${cx}" cy="${cy}" r="${R}"/>
    <g clip-path="url(#gclip)"><path class="g-o" d="${out.o}"/><path class="g-k" d="${out.k}"/><path class="g-v" d="${out.v}"/></g>
    <circle class="g-rim" cx="${cx}" cy="${cy}" r="${R}"/></svg>`;
  cache.set(key, svg);
  return svg;
}
