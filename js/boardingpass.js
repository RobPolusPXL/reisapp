// Boarding pass inlezen: streepjescode (PDF417 / Aztec / QR) lokaal decoderen en het IATA-BCBP-formaat uitlezen.
import { airlineByCode, loadAirlines } from './airlines.js';
import { loadAirports, airportByCode } from './airports.js';

const FORMATS = ['PDF417', 'Aztec', 'QRCode', 'DataMatrix'];

/** Geeft de tekst van de eerste streepjescode in een afbeelding, of null. */
export async function readBarcodeText(file) {
  if ('BarcodeDetector' in globalThis) {
    try {
      const det = new BarcodeDetector({ formats: ['pdf417', 'aztec', 'qr_code', 'data_matrix'] });
      const bmp = await createImageBitmap(file);
      const res = await det.detect(bmp);
      if (res[0]?.rawValue) return res[0].rawValue;
    } catch { /* val terug op de ingebouwde decoder */ }
  }
  const { readBarcodes, prepareZXingModule } = await import('../vendor/zxing/reader.js');
  prepareZXingModule({ overrides: { locateFile: p => new URL('../vendor/zxing/' + p, import.meta.url).href } });
  const res = await readBarcodes(file, { formats: FORMATS, tryHarder: true, tryRotate: true, maxNumberOfSymbols: 1 });
  return res[0]?.text || null;
}

const CLASS_BY_CODE = { F: 'First', A: 'First', J: 'Business', C: 'Business', D: 'Business', Z: 'Business', I: 'Business', W: 'Premium economy', Y: 'Economy' };

function dateFromJulian(day, start, end) {
  const years = [...new Set([+String(start || '').slice(0, 4), +String(end || '').slice(0, 4)].filter(Boolean))];
  if (!years.length) years.push(new Date().getFullYear());
  const cands = years.map(y => new Date(Date.UTC(y, 0, day)));
  const iso = d => d.toISOString().slice(0, 10);
  return iso(cands.find(d => (!start || iso(d) >= start) && (!end || iso(d) <= end)) || cands[0]);
}

const titleCase = s => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, m => m.toUpperCase());

/** Leest de eerste vlucht van een IATA-BCBP-tekst (type M). */
export function parseBcbp(text, { start = '', end = '' } = {}) {
  const t = String(text || '');
  if (t[0] !== 'M' || t.length < 58) return null;
  const nameRaw = t.slice(2, 22).trim();
  const [sur, rest = ''] = nameRaw.split('/');
  const first = rest.replace(/\s+(MR|MRS|MS|MISS|MSTR|DR)$/i, '').trim();
  const name = titleCase([first, sur].filter(Boolean).join(' '));
  const carrier = t.slice(36, 39).trim();
  const num = t.slice(39, 44).trim().replace(/^0+(?=\d)/, '');
  const day = parseInt(t.slice(44, 47), 10);
  const seat = t.slice(48, 52).trim().replace(/^0+/, '');
  return {
    name, pnr: t.slice(23, 30).trim(),
    from: t.slice(30, 33), to: t.slice(33, 36),
    carrier, number: num ? `${carrier} ${num}` : carrier,
    date: day >= 1 && day <= 366 ? dateFromJulian(day, start, end) : '',
    seat, cls: CLASS_BY_CODE[t[47]] || '',
    legs: parseInt(t[1], 10) || 1,
  };
}

/** Leest een afbeelding en geeft de ingelezen gegevens (met maatschappij en luchthavens opgezocht), of een foutcode. */
export async function scanBoardingPass(file, trip = {}) {
  await Promise.all([loadAirlines(), loadAirports()]);
  let text;
  try { text = await readBarcodeText(file); } catch { return { error: 'decoder' }; }
  if (!text) return { error: 'geen-code' };
  const bp = parseBcbp(text, trip);
  if (!bp) return { error: 'geen-boardingpass' };
  return { bp, airline: airlineByCode(bp.carrier), from: airportByCode(bp.from), to: airportByCode(bp.to) };
}
