// Genereert data/map.json, data/countries.json en assets/flags/*.svg
// uit world-atlas (Natural Earth 1:50m), world-countries en flag-icons.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import * as topojson from 'topojson-client';
import { geoPath, geoMercator } from 'd3-geo';

const require = createRequire(import.meta.url);
const countries = require('world-countries');
const topo = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-50m.json', 'utf8'));

const byNum = new Map(countries.filter(c => c.ccn3).map(c => [c.ccn3, c]));
const byName = { Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO' };

const feats = topojson.feature(topo, topo.objects.countries).features.filter(f => f.id !== '010');

const W = 2000;
const proj = geoMercator().scale(W / (2 * Math.PI)).translate([W / 2, 0]);
const pathGen = geoPath(proj).digits(1);
let y0 = Infinity, y1 = -Infinity;
for (const f of feats) { const b = geoPath(proj).bounds(f); y0 = Math.min(y0, b[0][1]); y1 = Math.max(y1, b[1][1]); }
proj.translate([W / 2, -y0 + 2]);
const H = Math.ceil(y1 - y0 + 4);

const paths = {};
for (const f of feats) {
  let cca2 = f.id ? byNum.get(f.id)?.cca2 : byName[f.properties.name];
  if (!cca2) { console.warn('geen land voor', f.id, f.properties.name); continue; }
  const d = pathGen(f);
  if (!d) continue;
  paths[cca2] = (paths[cca2] || '') + d;
}

const continent = c => ({ Europe: 'eu', Asia: 'as', Africa: 'af', Oceania: 'oc', Antarctic: 'an' }[c.region] || (c.region === 'Americas' ? (c.subregion === 'South America' ? 'sa' : 'na') : null));
const list = countries.map(c => {
  const un195 = c.unMember || ['VA', 'PS'].includes(c.cca2);
  const o = { c: c.cca2, n: c.translations?.nld?.common || c.name.common, e: c.name.common, k: continent(c), u: un195 ? 1 : 0 };
  if (!paths[c.cca2] && c.latlng?.length === 2) {
    const pt = proj([c.latlng[1], c.latlng[0]]);
    if (pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1]) && pt[1] >= 0 && pt[1] <= H) o.p = [Math.round(pt[0] * 10) / 10, Math.round(pt[1] * 10) / 10];
  }
  return o;
}).sort((a, b) => a.n.localeCompare(b.n, 'nl'));

const mapOut = { w: W, h: H, scale: W / (2 * Math.PI), ty: -y0 + 2, paths };
fs.writeFileSync('data/map.json', JSON.stringify(mapOut));
fs.writeFileSync('data/countries.json', JSON.stringify(list));

fs.mkdirSync('assets/flags', { recursive: true });
let n = 0;
for (const c of list) {
  const src = path.join('node_modules/flag-icons/flags/4x3', c.c.toLowerCase() + '.svg');
  if (fs.existsSync(src)) { fs.copyFileSync(src, path.join('assets/flags', c.c.toLowerCase() + '.svg')); n++; }
}
console.log('landen', list.length, 'met pad', Object.keys(paths).length, 'vlaggen', n, 'view', W, H);
console.log('VN-195:', list.filter(c => c.u).length);
