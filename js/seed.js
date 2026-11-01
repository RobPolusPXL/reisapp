// Startdata: mijn reizen (uit de blog en Been) laden in een lege app.
import { get, replaceAll, applyRemote } from './store.js';
import { toast } from './ui.js';

export const isEmpty = s => !Object.keys(s.countries).length && !s.trips.length && !Object.values(s.places).some(a => a.length);

export async function loadSeed({ silent = false } = {}) {
  try {
    const d = await fetch('data/mijn-reizen.json').then(r => r.json());
    d.settings = get().settings;
    replaceAll(d);
    if (!silent) toast('Mijn reizen geladen');
  } catch { if (!silent) toast('De startdata kon niet geladen worden'); }
}

/**
 * Eerste start: laad de startdata automatisch in een lege app.
 * De data krijgt tijdstempel 1, zodat online gegevens (sync) altijd voorgaan op een nieuw toestel,
 * terwijl een leeg Firestore-document wel met deze data gevuld wordt.
 */
export async function autoSeed() {
  try {
    if (localStorage.getItem('reisapp.seeded') || !isEmpty(get())) return;
    const d = await fetch('data/mijn-reizen.json').then(r => r.json());
    d.settings = get().settings;
    d.updatedAt = 1;
    applyRemote(d);
    localStorage.setItem('reisapp.seeded', '1');
  } catch { /* opslag niet beschikbaar: de knop 'Mijn reizen laden' blijft werken */ }
}
