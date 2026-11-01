// Optionele synchronisatie via Firebase (Auth met Google + Firestore).
// Zonder ingevulde js/firebase-config.js doet dit module niets en blijft alles lokaal.
import { get, onWrite, applyRemote } from './store.js';
import { FIREBASE_CONFIG } from './firebase-config.js';
import { esc } from './ui.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.10.0/';
export const configured = Boolean(FIREBASE_CONFIG?.apiKey && FIREBASE_CONFIG?.projectId);

let status = { state: configured ? 'uit' : 'niet-ingesteld', user: null, error: '' };
const listeners = new Set();
export const getStatus = () => status;
export const onStatus = fn => { listeners.add(fn); return () => listeners.delete(fn); };
function setStatus(p) { status = { ...status, ...p }; listeners.forEach(f => f(status)); }

let fb = null, initPromise = null, unsubSnap = null, pushTimer = null, ref = null;

function init() {
  if (!configured) return Promise.resolve(null);
  initPromise ||= (async () => {
    const [app, auth, fs] = await Promise.all([
      import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
    ]);
    const a = app.initializeApp(FIREBASE_CONFIG);
    const authI = auth.getAuth(a);
    const db = fs.initializeFirestore(a, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    fb = { auth, fs, authI, db };
    auth.onAuthStateChanged(authI, user => {
      setStatus({ user: user ? { name: user.displayName || user.email, email: user.email } : null });
      user ? start(user) : stop();
    });
    return fb;
  })().catch(err => { setStatus({ state: 'fout', error: err.message }); initPromise = null; return null; });
  return initPromise;
}

const hasData = s => Object.keys(s.countries).length || s.trips.length || Object.values(s.places).some(a => a.length);

function push() {
  if (!ref) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      const s = get();
      await fb.fs.setDoc(ref, { json: JSON.stringify(s), updatedAt: s.updatedAt });
      setStatus({ state: 'verbonden', error: '' });
    } catch (err) { setStatus({ state: 'fout', error: err.message }); }
  }, 600);
}

function start(user) {
  stop();
  ref = fb.fs.doc(fb.db, 'users', user.uid);
  setStatus({ state: 'verbinden', error: '' });
  unsubSnap = fb.fs.onSnapshot(ref, snap => {
    if (snap.metadata.hasPendingWrites) return;
    const local = get();
    if (!snap.exists()) { if (hasData(local)) push(); setStatus({ state: 'verbonden' }); return; }
    let remote;
    try { remote = JSON.parse(snap.data().json); } catch { setStatus({ state: 'fout', error: 'Online gegevens zijn onleesbaar' }); return; }
    if ((remote.updatedAt || 0) > (local.updatedAt || 0)) applyRemote(remote);
    else if ((remote.updatedAt || 0) < (local.updatedAt || 0)) push();
    setStatus({ state: 'verbonden', error: '' });
  }, err => setStatus({ state: 'fout', error: err.message }));
}
function stop() { unsubSnap?.(); unsubSnap = null; ref = null; if (status.state !== 'niet-ingesteld') setStatus({ state: 'uit' }); }

onWrite(() => { if (ref) push(); });

/** Bij het opstarten: herstel een bestaande login. */
export function initSync() { if (configured) init(); }

export async function signIn() {
  const f = await init();
  if (!f) return;
  const provider = new f.auth.GoogleAuthProvider();
  try { await f.auth.signInWithPopup(f.authI, provider); }
  catch (err) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(err.code)) await f.auth.signInWithRedirect(f.authI, provider);
    else if (err.code !== 'auth/popup-closed-by-user') setStatus({ state: 'fout', error: err.message });
  }
}
export async function signOut() { const f = await init(); if (f) await f.auth.signOut(f.authI); }

/** HTML voor de kaart in Instellingen. */
export function syncCardHtml() {
  const s = status;
  let body;
  if (!configured) body = `<p class="muted" style="margin:0">Synchronisatie staat nog niet aan. Vul <code>js/firebase-config.js</code> in (zie README); tot dan blijven je gegevens alleen op dit toestel.</p>`;
  else if (!s.user) body = `<p class="muted" style="margin:0 0 12px">Log in om je gegevens op al je toestellen te hebben.</p><button type="button" class="btn primary block" id="sync-in">Inloggen met Google</button>`;
  else body = `<p style="margin:0 0 4px;font-weight:600">${esc(s.user.name)}</p>
    <p class="muted" style="margin:0 0 12px">${{ verbonden: 'Gesynchroniseerd', verbinden: 'Verbinden…', fout: 'Fout bij synchroniseren', uit: 'Niet verbonden' }[s.state] || ''}</p>
    <button type="button" class="btn block" id="sync-out">Uitloggen</button>`;
  return `<section class="card"><div class="card-head"><h2>Synchronisatie</h2></div>${body}${s.error ? `<p role="alert" style="margin:12px 0 0;color:var(--danger);font-size:14px">${esc(s.error)}</p>` : ''}</section>`;
}
