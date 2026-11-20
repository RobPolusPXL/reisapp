// Tijdlijn van alle reizen: één lange lijn opzij, op ware tijdschaal.
import { esc, ic } from './ui.js';
import { flag } from './data.js';
import { MODES, MODE_COLOR } from './trips.js';

const PXY = 368, PAD = 60, CW = 118, STEM = 26, LH = 74;   // pixels per jaar, rand, kaartbreedte, steel, rijhoogte
const MON = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const D = s => new Date(s + 'T00:00:00');
const dayOfYear = d => (d - new Date(d.getFullYear(), 0, 1)) / 864e5;
const days = t => Math.round((D(t.end || t.start) - D(t.start)) / 864e5) + 1;
const range = t => {
  const a = D(t.start), b = D(t.end || t.start);
  if (+a === +b) return `${a.getDate()} ${MON[a.getMonth()]} ${a.getFullYear()}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${b.getDate()} ${MON[a.getMonth()]} ${a.getFullYear()}`;
  return `${a.getDate()} ${MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]} ${b.getFullYear()}`;
};
const mainMode = t => {
  if ((t.items || []).some(i => i.type === 'flight') || (t.legs || []).some(l => l.mode === 'plane') || (t.heen || []).some(s => s.mode === 'plane')) return 'plane';
  return (t.legs || []).find(l => l.mode)?.mode || 'car';
};
const noFlags = s => String(s || '').replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '').replace(/\s+/g, ' ').trim();
const countries = t => [...new Set((t.legs || []).filter(l => l.c && !l.transit).map(l => l.c))];

/** HTML van de tijdlijn, of '' zonder reizen. */
export function timelineHtml(allTrips) {
  const trips = allTrips.filter(t => t.start).sort((a, b) => a.start.localeCompare(b.start));
  if (!trips.length) return '';
  const y0 = D(trips[0].start).getFullYear(), y1 = Math.max(...trips.map(t => D(t.end || t.start).getFullYear())) + 1;
  const x = s => { const d = D(s); return PAD + (d.getFullYear() - y0 + dayOfYear(d) / 365.25) * PXY; };
  // Banen boven en onder de lijn: een kaartje mag geen ander kaartje raken, en een steel geen kaartje kruisen.
  const placed = [];
  const free = (side, lv, mid) => placed.every(p => p.side !== side || (p.lv === lv ? Math.abs(p.mid - mid) >= CW + 8 : Math.abs(p.mid - mid) >= CW / 2 + 6));
  const items = trips.map((t, i) => {
    const a = x(t.start), w = Math.max(10, days(t) / 365.25 * PXY), mid = a + w / 2;
    const pref = i % 2 ? ['dn', 'up'] : ['up', 'dn'];
    let pos = null;
    for (let lv = 0; lv < 8 && !pos; lv++) for (const side of pref) if (free(side, lv, mid)) { pos = { side, lv }; break; }
    pos ||= { side: pref[0], lv: 8 };
    placed.push({ ...pos, mid });
    return { t, a, w, mid, ...pos };
  });
  const maxLv = Math.max(...items.map(i => i.lv));
  const line = 60 + (maxLv + 1) * LH + 40, width = (y1 - y0) * PXY + 2 * PAD;
  const years = Array.from({ length: y1 - y0 + 1 }, (_, k) => `<div class="tl-yr" style="left:${PAD + k * PXY}px"><span>${y0 + k}</span></div>`).join('');
  const body = items.map(({ t, a, w, mid, side, lv }) => {
    const m = mainMode(t), c = MODE_COLOR[m] || MODE_COLOR.other, cs = countries(t);
    return `<span class="tl-seg" style="left:${a.toFixed(0)}px;width:${w.toFixed(0)}px;background:${c}"></span>
      <a class="tl-trip ${side}" href="#/reis/${esc(t.id)}" style="left:${mid.toFixed(0)}px;--stem:${STEM + lv * LH}px;--c:${c}"><span class="tl-stem"></span><span class="tl-mi">${ic(MODES[m]?.[1] || 'dots', 14)}</span>
      <span class="tl-cd">${cs.length ? `<span class="tl-fl">${cs.map(k => flag(k)).join('')}</span>` : ''}<b>${esc(noFlags(t.title) || cs.join(', ') || 'Reis')}</b><small>${esc(range(t))} · ${days(t)} d</small></span></a>`;
  }).join('');
  return `<div class="tl-legend">${['plane', 'car', 'train'].map(k => `<span><i style="background:${MODE_COLOR[k]}"></i>${MODES[k][0].toLowerCase()}</span>`).join('')}</div>
    <div class="tl-wrap" id="tl-wrap"><div class="tl" style="width:${width.toFixed(0)}px;height:${2 * line}px;--tly:${line}px">${years}${body}</div></div>`;
}
