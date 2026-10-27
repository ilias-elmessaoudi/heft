// PDFs öffnen (pdf.js von Mozilla) und Notizbücher als PDF speichern (pdf-lib).
// Striche werden als Vektoren exportiert, bleiben also beim Zoomen scharf.

import { db, id } from './db.js';
import { schriftenFuer } from './schriften.js';
import { A4, PAPIER, vorlage, strichSvg, formSvg, formNormalisieren, rahmen, zeichneElement } from './zeichnen.js';

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
      // Datei (noch) nicht da, z. B. kommt sie gerade vom Abgleich: später erneut versuchen
      if (!d) { dokumente.delete(dateiId); return null; }
      return lib.getDocument({ data: new Uint8Array(await d.blob.arrayBuffer()) }).promise;
    })());
  }
  return dokumente.get(dateiId);
}

export async function pdfImportieren(datei, ordner) {
  const dateiId = id();
  await db.speichern('dateien', { id: dateiId, blob: datei, typ: 'application/pdf' });
  const doc = await dokument(dateiId);
  const heft = { id: id(), titel: datei.name.replace(/\.pdf$/i, ''), cover: -1, pdf: true, ordner, erstellt: Date.now(), seiten: [] };
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
  const schrift = await ziel.embedFont(lib.StandardFonts.HelveticaBold);
  const quellen = new Map();
  const bilder = new Map();
  // Schriften der Textfelder vorher laden, sonst landet im PDF eine Ersatzschrift
  await schriftenFuer(seiten);

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
    const v = vorlage(s.vorlage, s.breite, s.hoehe);
    for (const l of v.linien) {
      const { farbe, deckkraft } = cssRgb(lib, l.rand ? farben.rand : farben.linie);
      seite.drawLine({ start: { x: ox + l.x1, y: Y(l.y1) }, end: { x: ox + l.x2, y: Y(l.y2) }, thickness: .6, color: farbe, opacity: deckkraft });
    }
    if (v.punkte.length || v.kaesten.length) {
      const { farbe, deckkraft } = cssRgb(lib, farben.linie);
      for (const [x, y] of v.punkte) seite.drawCircle({ x: ox + x, y: Y(y), size: .9, color: farbe, opacity: deckkraft });
      for (const k of v.kaesten) seite.drawRectangle({ x: ox + k.x, y: Y(k.y + k.h), width: k.b, height: k.h, borderColor: farbe, borderWidth: .6, borderOpacity: deckkraft });
    }
    for (const t of v.texte) {
      const { farbe, deckkraft } = cssRgb(lib, farben.text);
      seite.drawText(t.t, { x: ox + t.x, y: Y(t.y), size: t.g, font: schrift, color: farbe, opacity: deckkraft });
    }
    // Elemente: Textmarker zuerst (liegt unter der Schrift)
    const reihe = [...s.elemente.filter((e) => e.typ === 'strich' && e.werkzeug === 'marker'), ...s.elemente.filter((e) => !(e.typ === 'strich' && e.werkzeug === 'marker'))];
    for (const el of reihe) {
      if (el.typ === 'strich') {
        const pfad = strichSvg(el);
        if (pfad) seite.drawSvgPath(pfad, { x: ox, y: oy + H, color: hexRgb(lib, el.farbe), opacity: el.werkzeug === 'marker' ? (el.deckkraft ?? .38) : 1, borderWidth: 0 });
      } else if (el.typ === 'form') {
        formNormalisieren(el);
        const pfad = formSvg(el);
        const linie = el.art === 'linie' || el.art === 'pfeil';
        const opt = { x: ox, y: oy + H, borderLineCap: lib.LineCapStyle.Round };
        if (el.fuellung && !linie) Object.assign(opt, farbeMitAlpha(lib, el.fuellung, 'color', 'opacity'));
        if (el.farbe && el.breite > 0) Object.assign(opt, { borderWidth: el.breite }, farbeMitAlpha(lib, el.farbe, 'borderColor', 'borderOpacity'));
        else opt.borderWidth = 0;
        seite.drawSvgPath(pfad, opt);
      } else if (el.typ === 'text' || el.typ === 'bild' && (el.drehung || el.zuschnitt)) {
        // Text (jede Schrift) und bearbeitete Bilder als scharfes Bild einbetten
        const r = rahmen(el);
        const png = await alsBild(el, r);
        if (png) seite.drawImage(await ziel.embedPng(png), { x: ox + r.x1, y: Y(r.y2), width: r.x2 - r.x1, height: r.y2 - r.y1 });
      } else if (el.typ === 'bild') {
        if (!bilder.has(el.dateiId)) bilder.set(el.dateiId, await bildEinbetten(lib, ziel, el.dateiId));
        const b = bilder.get(el.dateiId);
        if (b) seite.drawImage(b, { x: ox + el.x, y: Y(el.y + el.h), width: el.b, height: el.h });
      }
    }
  }
  return ziel.save();
}

function farbeMitAlpha(lib, css, farbSchluessel, alphaSchluessel) {
  if (css.startsWith('#')) return { [farbSchluessel]: hexRgb(lib, css), [alphaSchluessel]: 1 };
  const { farbe, deckkraft } = cssRgb(lib, css);
  return { [farbSchluessel]: farbe, [alphaSchluessel]: deckkraft };
}

// Ein Element in 4-facher Auflösung als PNG malen
async function alsBild(el, r) {
  const f = 4, b = r.x2 - r.x1, h = r.y2 - r.y1;
  if (b <= 0 || h <= 0) return null;
  const c = document.createElement('canvas');
  c.width = Math.ceil(b * f); c.height = Math.ceil(h * f);
  const ctx = c.getContext('2d');
  ctx.setTransform(f, 0, 0, f, -r.x1 * f, -r.y1 * f);
  zeichneElement(ctx, el);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
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
