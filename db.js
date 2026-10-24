// Speicher im Gerät (IndexedDB). Jeder Eintrag trägt "geaendert", damit später ein Abgleich zwischen Geräten möglich ist.
//
// hefte:  { id, titel, ordner, cover, erstellt, geaendert, seiten: [seitenId...], geloescht? }
// seiten: { id, heftId, vorlage, papier, hintergrund?: { dateiId, seite }, breite, hoehe, elemente: [...], geaendert }
// ordner: { id, name, geaendert }
// dateien: { id, blob, typ }

const NAME = 'heft';
const VERSION = 1;
let dbPromise;

function oeffnen() {
  dbPromise ||= new Promise((ok, fehler) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['hefte', 'seiten', 'ordner', 'dateien']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
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

export const db = {
  async alle(name) { return anfrage((await store(name)).getAll()); },
  async holen(name, schluessel) { return anfrage((await store(name)).get(schluessel)); },
  async speichern(name, wert) {
    if (name !== 'dateien') wert.geaendert = Date.now();
    await anfrage((await store(name, 'readwrite')).put(wert));
    return wert;
  },
  async loeschen(name, schluessel) { return anfrage((await store(name, 'readwrite')).delete(schluessel)); },
};

// Browser bitten, die Daten nicht automatisch zu löschen (wichtig auf dem iPad).
export async function dauerhaftSpeichern() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch {}
  return false;
}
