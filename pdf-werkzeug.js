// PDFs öffnen (pdf.js von Mozilla) und Notizbücher als PDF speichern (pdf-lib).
// Striche werden als Vektoren exportiert, bleiben also beim Zoomen scharf.

import { db, id } from './db.js';
import { A4, PAPIER, vorlagenLinien, vorlagenPunkte, strichTeile, strichSvg, textZeilen } from './zeichnen.js';

let pdfjsPromise;
function pdfjs() {
  pdfjsPromise ||= import('./vendor/pdf.min.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
    return m;
  });
  return pdfjsPromise;
}

const dokumente = new Map(); // dateiId -> Promise<PDFDocumentProxy>
async function dokument(dateiId) {
  if (!dokumente.has(dateiId)) {
    dokumente.set(dateiId, (async () => {
      const [lib, d] = await Promise.all([pdfjs(), db.holen('dateien', dateiId)]);
      if (!d) return null;
      return lib.getDocument({ data: new Uint8Array(await d.blob.arrayBuffer()) }).promise;
    })());
  }
  return dokumente.get(dateiId);
}

export async function pdfImportieren(datei, ordner) {
  const dateiId = id();
  await db.speichern('dateien', { id: dateiId, blob: datei, typ: 'application/pdf' });
  const doc = await dokument(dateiId);
  const heft = { id: id(), titel: datei.name.replace(/\.pdf$/i, ''), cover: 0, ordner, erstellt: Date.now(), seiten: [] };
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n);
    const v = p.getViewport({ scale: 1 });
    const seite = { id: id(), heftId: heft.id, vorlage: 'leer', papier: 'weiss', breite: v.width, hoehe: v.height, hintergrund: { dateiId, seite: n }, elemente: [] };
    heft.seiten.push(seite.id);
    await db.speichern('seiten', seite);
  }
  // Vorschaubild der ersten Seite für die Bibliothek
  const bild = await pdfSeiteRendern(dateiId, 1, 300 / (await doc.getPage(1)).getViewport({ scale: 1 }).width);
  if (bild) heft.vorschau = bild.toDataURL('image/jpeg', .8);
  await db.speichern('hefte', heft);
  return heft;
}

// Gerenderte Seiten kurz merken, damit Scrollen nicht ständig neu rendert
const renderCache = new Map();
export async function pdfSeiteRendern(dateiId, nr, faktor) {
  const schluessel = `${dateiId}:${nr}:${faktor.toFixed(3)}`;
  if (renderCache.has(schluessel)) return renderCache.get(schluessel);
  const auftrag = (async () => {
    const doc = await dokument(dateiId);
    if (!doc) return null;
    const p = await doc.getPage(nr);
    const v = p.getViewport({ scale: faktor });
    const c = document.createElement('canvas');
    c.width = Math.round(v.width); c.height = Math.round(v.height);
    await p.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
    return c;
  })();
  renderCache.set(schluessel, auftrag);
  if (renderCache.size > 24) renderCache.delete(renderCache.keys().next().value);
  return auftrag;
}

/* ================= Export ================= */

let pdfLibPromise;
function pdfLib() {
  pdfLibPromise ||= new Promise((ok, fehler) => {
    if (window.PDFLib) return ok(window.PDFLib);
    const s = document.createElement('script');
    s.src = new URL('./vendor/pdf-lib.min.js', import.meta.url).href;
    s.onload = () => ok(window.PDFLib);
    s.onerror = fehler;
    document.head.append(s);
  });
  return pdfLibPromise;
}

const hexRgb = (lib, hex) => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return lib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const cssRgb = (lib, css) => {
  const m = css.match(/[\d.]+/g).map(Number);
  return { farbe: lib.rgb(m[0] / 255, m[1] / 255, m[2] / 255), deckkraft: m[3] ?? 1 };
};

export async function pdfExportieren(heft, seiten) {
  const lib = await pdfLib();
  const ziel = await lib.PDFDocument.create();
  ziel.setTitle(heft.titel || 'Notizbuch');
  ziel.setCreator('Heft');
  const schrift = await ziel.embedFont(lib.StandardFonts.Helvetica);
  const quellen = new Map();
  const bilder = new Map();
  const messCtx = document.createElement('canvas').getContext('2d');

  for (const s of seiten) {
    let seite, ox = 0, oy = 0;
    if (s.hintergrund) {
      if (!quellen.has(s.hintergrund.dateiId)) {
        const d = await db.holen('dateien', s.hintergrund.dateiId);
        quellen.set(s.hintergrund.dateiId, await lib.PDFDocument.load(await d.blob.arrayBuffer(), { ignoreEncryption: true }));
      }
      [seite] = await ziel.copyPages(quellen.get(s.hintergrund.dateiId), [s.hintergrund.seite - 1]);
      ziel.addPage(seite);
      const box = seite.getCropBox();
      ox = box.x; oy = box.y;
    } else {
      seite = ziel.addPage([s.breite, s.hoehe]);
      const farben = PAPIER[s.papier] || PAPIER.weiss;
      seite.drawRectangle({ x: 0, y: 0, width: s.breite, height: s.hoehe, color: hexRgb(lib, farben.grund) });
    }
    const H = s.hoehe;
    const Y = (y) => oy + H - y;
    // Vorlage
    const farben = PAPIER[s.papier] || PAPIER.weiss;
    for (const l of vorlagenLinien(s.vorlage, s.breite, s.hoehe)) {
      const { farbe, deckkraft } = cssRgb(lib, l.rand ? farben.rand : farben.linie);
      seite.drawLine({ start: { x: ox + l.x1, y: Y(l.y1) }, end: { x: ox + l.x2, y: Y(l.y2) }, thickness: .6, color: farbe, opacity: deckkraft });
    }
    const punkte = vorlagenPunkte(s.vorlage, s.breite, s.hoehe);
    if (punkte.length) {
      const { farbe, deckkraft } = cssRgb(lib, farben.linie);
      for (const [x, y] of punkte) seite.drawCircle({ x: ox + x, y: Y(y), size: .9, color: farbe, opacity: deckkraft });
    }
    // Elemente
    for (const el of s.elemente) {
      if (el.typ === 'strich') {
        const pfad = strichSvg(strichTeile(el.punkte, el.breite, el.werkzeug !== 'marker'));
        if (pfad) seite.drawSvgPath(pfad, { x: ox, y: oy + H, color: hexRgb(lib, el.farbe), opacity: el.werkzeug === 'marker' ? .38 : 1, borderWidth: 0 });
      } else if (el.typ === 'form') {
        const farbe = hexRgb(lib, el.farbe), dicke = el.breite;
        const { x1, y1, x2, y2 } = el;
        if (el.art === 'rechteck') seite.drawRectangle({ x: ox + Math.min(x1, x2), y: Y(Math.max(y1, y2)), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), borderColor: farbe, borderWidth: dicke });
        else if (el.art === 'ellipse') seite.drawEllipse({ x: ox + (x1 + x2) / 2, y: Y((y1 + y2) / 2), xScale: Math.abs(x2 - x1) / 2, yScale: Math.abs(y2 - y1) / 2, borderColor: farbe, borderWidth: dicke });
        else {
          const linie = (a, b, c, d) => seite.drawLine({ start: { x: ox + a, y: Y(b) }, end: { x: ox + c, y: Y(d) }, thickness: dicke, color: farbe, lineCap: lib.LineCapStyle.Round });
          linie(x1, y1, x2, y2);
          if (el.art === 'pfeil') {
            const w = Math.atan2(y2 - y1, x2 - x1), l = 10 + dicke * 2;
            linie(x2, y2, x2 - l * Math.cos(w - .45), y2 - l * Math.sin(w - .45));
            linie(x2, y2, x2 - l * Math.cos(w + .45), y2 - l * Math.sin(w + .45));
          }
        }
      } else if (el.typ === 'text') {
        const zeilen = textZeilen(messCtx, el);
        zeilen.forEach((zeile, i) => {
          const sicher = [...zeile].map((ch) => { try { schrift.encodeText(ch); return ch; } catch { return '?'; } }).join('');
          seite.drawText(sicher, { x: ox + el.x, y: Y(el.y + i * el.groesse * 1.3 + el.groesse * .82), size: el.groesse, font: schrift, color: hexRgb(lib, el.farbe) });
        });
      } else if (el.typ === 'bild') {
        if (!bilder.has(el.dateiId)) bilder.set(el.dateiId, await bildEinbetten(lib, ziel, el.dateiId));
        const b = bilder.get(el.dateiId);
        if (b) seite.drawImage(b, { x: ox + el.x, y: Y(el.y + el.h), width: el.b, height: el.h });
      }
    }
  }
  return ziel.save();
}

async function bildEinbetten(lib, ziel, dateiId) {
  const d = await db.holen('dateien', dateiId);
  if (!d) return null;
  const bytes = new Uint8Array(await d.blob.arrayBuffer());
  try {
    if (d.typ === 'image/png') return await ziel.embedPng(bytes);
    if (d.typ === 'image/jpeg') return await ziel.embedJpg(bytes);
  } catch {}
  // Andere Formate (HEIC, WebP …) über ein Canvas in PNG umwandeln
  const bmp = await createImageBitmap(d.blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  const png = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  return ziel.embedPng(new Uint8Array(await png.arrayBuffer()));
}

export { A4 };
