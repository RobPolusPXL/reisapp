// Startdata: mijn reizen (uit de blog en Been) laden in een lege app.
import { get, replaceAll } from './store.js';
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

/** Eerste start: laad de startdata automatisch, behalve als sync aan staat (dan komt de data online vandaan). */
export async function autoSeed(syncConfigured) {
  try {
    if (syncConfigured || localStorage.getItem('reisapp.seeded') || !isEmpty(get())) return;
    await loadSeed({ silent: true });
    localStorage.setItem('reisapp.seeded', '1');
  } catch { /* opslag niet beschikbaar: dan blijft de knop beschikbaar */ }
}
