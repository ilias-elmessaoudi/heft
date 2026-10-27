// Speicher im Gerät (IndexedDB). Jede Änderung landet zusätzlich in "offen", damit der Abgleich sie zu den anderen Geräten schickt.
//
// hefte:  { id, titel, ordner, cover, erstellt, geaendert, seiten: [seitenId...] }
// seiten: { id, heftId, vorlage, papier, hintergrund?: { dateiId, seite }, breite, hoehe, elemente: [...], geaendert }
// ordner: { id, name, geaendert }
// dateien: { id, blob, typ, geaendert }
// sammlungen: { id, name, elemente: [{ id, breite, hoehe, inhalt: [...] }] }  (GoodNotes-"Elemente")
// schriften: { id, name, blob }
// offen:  { schluessel: 'art:id', art, id, geloescht?, zeit }   (noch nicht abgeglichen)
// meta:   { id, wert }

const NAME = 'heft';
const VERSION = 3;
export const ARTEN = ['hefte', 'seiten', 'ordner', 'dateien', 'sammlungen', 'schriften'];
// Arten mit Datei (blob), die getrennt hochgeladen werden
export const BLOB_ARTEN = ['dateien', 'schriften'];
let dbPromise;

function oeffnen() {
  dbPromise ||= new Promise((ok, fehler) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ARTEN) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('offen')) db.createObjectStore('offen', { keyPath: 'schluessel' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
  return dbPromise;
}

const anfrage = (r) => new Promise((ok, fehler) => { r.onsuccess = () => ok(r.result); r.onerror = () => fehler(r.error); });

async function store(name, modus = 'readonly') {
  return (await oeffnen()).transaction(name, modus).objectStore(name);
}

export const id = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

async function vormerken(art, schluessel, geloescht = false) {
  await anfrage((await store('offen', 'readwrite')).put({ schluessel: art + ':' + schluessel, art, id: schluessel, geloescht, zeit: Date.now() }));
  dispatchEvent(new Event('heft-lokal'));
}

export const db = {
  async alle(name) { return anfrage((await store(name)).getAll()); },
  async holen(name, schluessel) { return anfrage((await store(name)).get(schluessel)); },
  // still = kommt vom Abgleich: Zeitstempel behalten und nicht erneut verschicken
  async speichern(name, wert, { still = false } = {}) {
    if (!still) wert.geaendert = Date.now();
    await anfrage((await store(name, 'readwrite')).put(wert));
    if (!still && ARTEN.includes(name)) await vormerken(name, wert.id);
    return wert;
  },
  async loeschen(name, schluessel, { still = false } = {}) {
    await anfrage((await store(name, 'readwrite')).delete(schluessel));
    if (!still && ARTEN.includes(name)) await vormerken(name, schluessel, true);
  },
  vormerken,
};

// Browser bitten, die Daten nicht automatisch zu löschen (wichtig auf dem iPad).
export async function dauerhaftSpeichern() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch {}
  return false;
}
