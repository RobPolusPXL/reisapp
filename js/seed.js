// Startdata: mijn reizen (uit de blog en Been) laden in een lege app.
import { get, replaceAll } from './store.js';
import { toast } from './ui.js';

export const isEmpty = s => !Object.keys(s.countries).length && !s.trips.length && !Object.values(s.places).some(a => a.length);

export async function loadSeed() {
  try {
    const d = await fetch('data/mijn-reizen.json').then(r => r.json());
    d.settings = get().settings;
    replaceAll(d);
    toast('Mijn reizen geladen');
  } catch { toast('De startdata kon niet geladen worden'); }
}
