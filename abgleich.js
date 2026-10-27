// Abgleich zwischen Geräten über Supabase (Tabelle "eintraege" + Speicher "dateien").
// Jedes Heft, jede Seite, jeder Ordner und jede Datei ist ein Eintrag. Bei Konflikten gewinnt die neuere Änderung.

import { db, ARTEN, BLOB_ARTEN } from './db.js';

const TABELLE = 'eintraege';
const EIMER = 'dateien';

let client = null;
let laeuft = null;
let nochmal = false;
export const zustand = { angemeldet: false, email: null, laeuft: false, letzter: null, fehler: null, eingerichtet: false };

// Speicherort einer Datei: <Nutzer>/<id> (Dateien) bzw. <Nutzer>/schrift-<id>
const pfad = (art, eid) => `${zustand.uid}/${art === 'schriften' ? 'schrift-' : ''}${eid}`;

const melden = () => dispatchEvent(new CustomEvent('heft-abgleich', { detail: { ...zustand } }));

function konfig() { return window.HEFT_SUPABASE || {}; }

let ladePromise;
function bibliothek() {
  ladePromise ||= new Promise((ok, fehler) => {
    if (window.supabase) return ok(window.supabase);
    const s = document.createElement('script');
    s.src = new URL('./vendor/supabase.min.js', import.meta.url).href;
    s.onload = () => ok(window.supabase);
    s.onerror = fehler;
    document.head.append(s);
  });
  return ladePromise;
}

export async function starten() {
  const { url, key } = konfig();
  zustand.eingerichtet = !!(url && key);
  if (!zustand.eingerichtet) return melden();
  const sb = await bibliothek();
  client = sb.createClient(url, key, { auth: { persistSession: true, storageKey: 'heft-anmeldung', autoRefreshToken: true } });
  const { data } = await client.auth.getSession();
  sitzung(data.session);
  client.auth.onAuthStateChange((_e, s) => sitzung(s));
  // Wann abgleichen: kurz nach eigenen Änderungen, beim Zurückkehren zur App, regelmäßig, wenn wieder online
  let timer;
  addEventListener('heft-lokal', () => { clearTimeout(timer); timer = setTimeout(abgleichen, 2500); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) abgleichen(); });
  addEventListener('online', abgleichen);
  setInterval(() => { if (!document.hidden) abgleichen(); }, 25000);
  abgleichen();
}

function sitzung(s) {
  const vorher = zustand.angemeldet;
  zustand.angemeldet = !!s;
  zustand.email = s?.user?.email || null;
  zustand.uid = s?.user?.id || null;
  melden();
  if (!vorher && s) abgleichen();
}

export async function anmelden(email, passwort) {
  const { error } = await client.auth.signInWithPassword({ email, password: passwort });
  if (error) throw new Error(uebersetzen(error.message));
}
export async function registrieren(email, passwort) {
  const { data, error } = await client.auth.signUp({ email, password: passwort, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw new Error(uebersetzen(error.message));
  return !data.session; // true = E-Mail muss noch bestätigt werden
}
export async function abmelden() {
  await client.auth.signOut();
  await db.loeschen('meta', 'stand', { still: true });
}
function uebersetzen(m) {
  if (/invalid login/i.test(m)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/not confirmed/i.test(m)) return 'Bitte bestätige zuerst den Link in deiner E-Mail.';
  if (/already registered/i.test(m)) return 'Für diese E-Mail gibt es schon ein Konto – bitte anmelden.';
  if (/at least 6/i.test(m)) return 'Das Passwort braucht mindestens 6 Zeichen.';
  return m;
}

/* ================= Abgleichen ================= */

export function abgleichen() {
  if (!client || !zustand.angemeldet || !navigator.onLine) return Promise.resolve();
  if (laeuft) { nochmal = true; return laeuft; }
  laeuft = (async () => {
    zustand.laeuft = true; zustand.fehler = null; melden();
    try {
      do { nochmal = false; await hochladen(); await herunterladen(); } while (nochmal);
      zustand.letzter = Date.now();
    } catch (e) {
      console.warn('Abgleich', e);
      zustand.fehler = e.message || String(e);
    } finally {
      zustand.laeuft = false; laeuft = null; melden();
    }
  })();
  return laeuft;
}

async function hochladen() {
  const uid = zustand.uid;
  // Erster Abgleich auf diesem Gerät: alles Vorhandene mitschicken
  if (!(await db.holen('meta', 'erstabgleich'))?.wert) {
    for (const art of ARTEN) for (const e of await db.alle(art)) await db.vormerken(art, e.id);
    await db.speichern('meta', { id: 'erstabgleich', wert: true }, { still: true });
  }
  const offen = await db.alle('offen');
  if (!offen.length) return;
  const zeilen = [];
  const erledigt = [];
  for (const o of offen) {
    if (o.geloescht) {
      if (BLOB_ARTEN.includes(o.art)) await client.storage.from(EIMER).remove([pfad(o.art, o.id)]).catch(() => {});
      zeilen.push({ besitzer: uid, art: o.art, id: o.id, daten: null, geloescht: true, geaendert: o.zeit });
    } else {
      const eintrag = await db.holen(o.art, o.id);
      if (!eintrag) { erledigt.push(o); continue; }
      let daten = eintrag;
      if (BLOB_ARTEN.includes(o.art)) {
        const { error } = await client.storage.from(EIMER).upload(pfad(o.art, o.id), eintrag.blob, { upsert: true, contentType: eintrag.typ || 'application/octet-stream' });
        if (error) throw new Error('Datei-Upload: ' + error.message);
        const { blob, ...rest } = eintrag;
        daten = rest;
      }
      zeilen.push({ besitzer: uid, art: o.art, id: o.id, daten, geloescht: false, geaendert: eintrag.geaendert || Date.now() });
    }
    erledigt.push(o);
  }
  // In Paketen schicken (Seiten können groß sein)
  for (let i = 0; i < zeilen.length; i += 25) {
    const { error } = await client.from(TABELLE).upsert(zeilen.slice(i, i + 25), { onConflict: 'besitzer,art,id' });
    if (error) throw new Error('Hochladen: ' + error.message);
  }
  // Nur austragen, was seitdem nicht erneut geändert wurde
  for (const o of erledigt) {
    const jetzt = (await db.alle('offen')).find((x) => x.schluessel === o.schluessel);
    if (jetzt && jetzt.zeit === o.zeit) await db.loeschen('offen', o.schluessel, { still: true });
  }
}

async function herunterladen() {
  const stand = (await db.holen('meta', 'stand'))?.wert || '1970-01-01T00:00:00Z';
  let neuerStand = stand;
  const geaendert = { hefte: new Set(), seiten: new Set(), ordner: false, dateien: new Set(), sammlungen: false, schriften: false };
  const offen = new Map((await db.alle('offen')).map((o) => [o.schluessel, o]));
  for (;;) {
    const { data, error } = await client.from(TABELLE).select('*').gt('server_zeit', neuerStand).order('server_zeit').limit(200);
    if (error) throw new Error('Herunterladen: ' + error.message);
    for (const z of data) {
      neuerStand = z.server_zeit;
      if (!ARTEN.includes(z.art)) continue;
      const schl = z.art + ':' + z.id;
      const lokal = await db.holen(z.art, z.id);
      // Eigene, noch nicht verschickte Änderung ist neuer? Dann behalten.
      if (offen.has(schl) && (lokal?.geaendert || offen.get(schl).zeit) > z.geaendert) continue;
      if (z.geloescht) {
        if (lokal) await db.loeschen(z.art, z.id, { still: true });
      } else if (BLOB_ARTEN.includes(z.art)) {
        if (!lokal || (lokal.geaendert || 0) < z.geaendert) {
          const { data: blob, error: e2 } = await client.storage.from(EIMER).download(pfad(z.art, z.id));
          if (e2) throw new Error('Datei-Download: ' + e2.message);
          await db.speichern(z.art, { ...z.daten, id: z.id, blob, typ: z.daten?.typ || blob.type, geaendert: z.geaendert }, { still: true });
        }
      } else if (!lokal || (lokal.geaendert || 0) <= z.geaendert) {
        await db.speichern(z.art, { ...z.daten, geaendert: z.geaendert }, { still: true });
      } else continue;
      if (offen.has(schl)) await db.loeschen('offen', schl, { still: true });
      if (z.art === 'hefte') geaendert.hefte.add(z.id);
      if (z.art === 'seiten') geaendert.seiten.add(z.id);
      if (z.art === 'ordner') geaendert.ordner = true;
      if (z.art === 'dateien') geaendert.dateien.add(z.id);
      if (z.art === 'sammlungen') geaendert.sammlungen = true;
      if (z.art === 'schriften') geaendert.schriften = true;
    }
    if (data.length < 200) break;
  }
  if (neuerStand !== stand) await db.speichern('meta', { id: 'stand', wert: neuerStand }, { still: true });
  if (geaendert.hefte.size || geaendert.seiten.size || geaendert.ordner || geaendert.dateien.size || geaendert.sammlungen || geaendert.schriften) {
    dispatchEvent(new CustomEvent('heft-remote', { detail: geaendert }));
  }
}
