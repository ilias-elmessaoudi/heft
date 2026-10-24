import { db, id } from './db.js';
import {
  VORLAGEN, PAPIER, zeichnePapier, zeichneElement, trifft, imLasso, rahmen, rahmenVergessen,
  verschieben, skalieren, kopie, bildLaden, SCHRIFT,
} from './zeichnen.js';
import { bibliothekZeigen, hinweis, menue, menueZu, dialog, dialogZu, frage, eingabe, neueSeite, vorlagenMuster, ICON } from './app.js';
import { pdfSeiteRendern, pdfExportieren } from './pdf-werkzeug.js';

const $ = (s, el = document) => el.querySelector(s);
const bereich = $('#blatt-bereich');
const seitenEl = $('#seiten');
const leiste = $('#seitenleiste');

const FARBEN = ['#1b1b1f', '#2a5bd7', '#d9342b', '#1f9d55', '#8a3ffc', '#f08a24'];
const MARKER = ['#ffd84d', '#7ee08a', '#7cc6ff', '#ff8fc7', '#ffb35c'];
const STIFT_DICKEN = [1, 1.8, 3, 5];
const MARKER_DICKEN = [8, 14, 22];
const RADIERER = [6, 14, 28];
const TEXTGROESSEN = [12, 16, 22, 32];

/* ================= Zustand ================= */

const ws = Object.assign({
  werkzeug: 'stift',
  stift: { farbe: FARBEN[0], breite: 1.8 },
  marker: { farbe: MARKER[0], breite: 14 },
  radierer: { groesse: 14 },
  form: { art: 'rechteck' },
  text: { groesse: 16 },
  eigeneFarben: [],
}, ladeEinstellungen());
function ladeEinstellungen() { try { return JSON.parse(localStorage.getItem('heft.werkzeug')) || {}; } catch { return {}; } }
const merken = () => { try { localStorage.setItem('heft.werkzeug', JSON.stringify(ws)); } catch {} };

let nurStift = localStorage.getItem('heft.nurStift') === '1';

const z = {
  heft: null,
  seiten: [],          // Seiten-Objekte in Reihenfolge
  dom: new Map(),      // seitenId -> { el, papier, tinte, live, version }
  zoom: 1,
  basis: 1,
  aktuell: 0,          // Index der sichtbaren Seite
  rueck: [], vor: [],
  auswahl: null,       // { seite, elemente: [] }
  ablage: null,        // kopierte Elemente
};
const massstab = () => z.basis * z.zoom;

/* ================= Öffnen / Schließen ================= */

export async function oeffneEditor(heftId) {
  const heft = await db.holen('hefte', heftId);
  if (!heft) return;
  z.heft = heft;
  z.seiten = (await Promise.all(heft.seiten.map((s) => db.holen('seiten', s)))).filter(Boolean);
  z.rueck = []; z.vor = []; z.auswahl = null; z.zoom = 1; z.aktuell = 0;
  // Bilder vorladen
  for (const s of z.seiten) for (const el of s.elemente) if (el.typ === 'bild') await bildVorbereiten(el.dateiId);
  $('#bibliothek').hidden = true;
  $('#editor').hidden = false;
  $('#heft-titel').textContent = heft.titel;
  leiste.hidden = innerWidth < 760 || localStorage.getItem('heft.leiste') !== '1';
  werkzeugZeigen();
  aufbauen();
  bereich.scrollTop = 0;
  knoepfeAktualisieren();
}

async function schliessen() {
  textFertig();
  auswahlAufheben();
  await speichernJetzt();
  z.heft = null;
  seitenEl.innerHTML = '';
  z.dom.clear();
  bibliothekZeigen();
}

const bildUrls = new Map();
async function bildVorbereiten(dateiId) {
  if (bildUrls.has(dateiId)) return;
  const d = await db.holen('dateien', dateiId);
  if (!d) return;
  const url = URL.createObjectURL(d.blob);
  bildUrls.set(dateiId, url);
  const img = bildLaden(dateiId, url);
  await img.decode().catch(() => {});
}

/* ================= Seiten aufbauen und rendern ================= */

function basisBerechnen() {
  const platz = bereich.clientWidth - (innerWidth < 760 ? 24 : 60);
  const breiteste = Math.max(...z.seiten.map((s) => s.breite), 595);
  z.basis = Math.min(platz, 900) / breiteste;
}

function aufbauen() {
  basisBerechnen();
  seitenEl.innerHTML = '';
  z.dom.clear();
  beobachter.disconnect();
  z.seiten.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'seite' + (!nurStift ? ' zeichnen' : '');
    el.dataset.id = s.id;
    el.dataset.index = i;
    el.innerHTML = '<canvas class="papier"></canvas><canvas class="tinte"></canvas><canvas class="live"></canvas>';
    seitenEl.append(el);
    z.dom.set(s.id, { el, papier: el.children[0], tinte: el.children[1], live: el.children[2], version: -1, sichtbar: false });
    beobachter.observe(el);
  });
  groessen();
  leisteAufbauen();
}

function groessen() {
  const m = massstab();
  for (const s of z.seiten) {
    const d = z.dom.get(s.id);
    d.el.style.width = s.breite * m + 'px';
    d.el.style.height = s.hoehe * m + 'px';
    d.el.style.background = s.hintergrund ? '#fff' : (PAPIER[s.papier] || PAPIER.weiss).grund;
  }
  renderVersion++;
  sichtbareRendern();
}

let renderVersion = 0;
const beobachter = new IntersectionObserver((eintraege) => {
  for (const e of eintraege) {
    const d = z.dom.get(e.target.dataset.id);
    if (d) d.sichtbar = e.isIntersecting;
  }
  sichtbareRendern();
  aktuelleSeiteBestimmen();
}, { root: bereich, rootMargin: '400px 0px' });

let renderGeplant = false;
function sichtbareRendern() {
  if (renderGeplant) return;
  renderGeplant = true;
  requestAnimationFrame(() => {
    renderGeplant = false;
    for (const s of z.seiten) {
      const d = z.dom.get(s.id);
      if (d?.sichtbar && d.version !== renderVersion) seiteRendern(s);
    }
  });
}

function aufloesung(s) {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  let f = massstab() * dpr;
  // Canvas nicht riesig werden lassen (Speicher auf dem iPad)
  const max = 4096 / Math.max(s.breite, s.hoehe);
  return Math.min(f, max);
}

function seiteRendern(s) {
  const d = z.dom.get(s.id);
  d.version = renderVersion;
  const f = aufloesung(s);
  const w = Math.round(s.breite * f), h = Math.round(s.hoehe * f);
  for (const c of [d.papier, d.tinte, d.live]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const p = d.papier.getContext('2d');
  p.setTransform(f, 0, 0, f, 0, 0);
  zeichnePapier(p, s);
  if (s.hintergrund) {
    const v = renderVersion;
    pdfSeiteRendern(s.hintergrund.dateiId, s.hintergrund.seite, f).then((bild) => {
      if (!bild || d.version !== v) return;
      p.setTransform(1, 0, 0, 1, 0, 0);
      p.drawImage(bild, 0, 0, w, h);
      p.setTransform(f, 0, 0, f, 0, 0);
      zeichnePapier(p, { ...s, hintergrund: s.hintergrund }); // Vorlagenlinien über dem PDF (falls gewählt)
    });
  }
  tinteRendern(s);
}

function tinteRendern(s) {
  const d = z.dom.get(s.id);
  if (!d || !d.tinte.width) return;
  const f = d.tinte.width / s.breite;
  const t = d.tinte.getContext('2d');
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.clearRect(0, 0, d.tinte.width, d.tinte.height);
  t.setTransform(f, 0, 0, f, 0, 0);
  for (const el of s.elemente) if (!el._versteckt) zeichneElement(t, el);
}

function liveCtx(s) {
  const d = z.dom.get(s.id);
  const f = d.live.width / s.breite;
  const c = d.live.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, d.live.width, d.live.height);
  c.setTransform(f, 0, 0, f, 0, 0);
  return c;
}

function aktuelleSeiteBestimmen() {
  const mitte = bereich.getBoundingClientRect().top + bereich.clientHeight / 3;
  let best = 0, bestAbstand = Infinity;
  z.seiten.forEach((s, i) => {
    const r = z.dom.get(s.id)?.el.getBoundingClientRect();
    if (!r) return;
    const a = r.top <= mitte && r.bottom >= mitte ? 0 : Math.min(Math.abs(r.top - mitte), Math.abs(r.bottom - mitte));
    if (a < bestAbstand) { bestAbstand = a; best = i; }
  });
  if (best !== z.aktuell) { z.aktuell = best; leisteMarkieren(); }
  seitenzahlZeigen();
}
let zahlTimer;
function seitenzahlZeigen() {
  const el = $('#seitenzahl');
  el.textContent = `${z.aktuell + 1} / ${z.seiten.length}`;
  el.style.opacity = 1;
  clearTimeout(zahlTimer);
  zahlTimer = setTimeout(() => (el.style.opacity = 0), 1400);
}
bereich.addEventListener('scroll', () => { if (z.heft) aktuelleSeiteBestimmen(); }, { passive: true });
addEventListener('resize', () => { if (!z.heft) return; const alt = z.basis; basisBerechnen(); if (Math.abs(alt - z.basis) > .001) groessen(); });

/* ================= Speichern ================= */

const zuSpeichern = new Set();
let speicherTimer;
function seiteGeaendert(s) {
  zuSpeichern.add(s);
  clearTimeout(speicherTimer);
  speicherTimer = setTimeout(speichernJetzt, 600);
  miniAktualisieren(s);
}
async function speichernJetzt() {
  clearTimeout(speicherTimer);
  if (!zuSpeichern.size || !z.heft) return;
  const liste = [...zuSpeichern]; zuSpeichern.clear();
  for (const s of liste) await db.speichern('seiten', s);
  await db.speichern('hefte', z.heft);
}
addEventListener('pagehide', speichernJetzt);
document.addEventListener('visibilitychange', () => { if (document.hidden) speichernJetzt(); });

/* ================= Rückgängig ================= */

function aktion(a) {
  z.rueck.push(a);
  if (z.rueck.length > 200) z.rueck.shift();
  z.vor = [];
  knoepfeAktualisieren();
}
function anwenden(a, rueckwaerts) {
  const s = a.seite;
  if (a.typ === 'hinzu' || a.typ === 'weg') {
    const hinzufuegen = (a.typ === 'hinzu') !== rueckwaerts;
    if (hinzufuegen) a.elemente.forEach((el, i) => s.elemente.splice(Math.min(a.indizes?.[i] ?? s.elemente.length, s.elemente.length), 0, el));
    else s.elemente = s.elemente.filter((el) => !a.elemente.includes(el));
  } else if (a.typ === 'aendern') {
    for (const [el, vorher, nachher] of a.paare) { Object.assign(el, rueckwaerts ? kopie(vorher) : kopie(nachher)); rahmenVergessen(el); }
  }
  auswahlAufheben();
  tinteRendern(s);
  seiteGeaendert(s);
}
function rueckgaengig() { textFertig(); const a = z.rueck.pop(); if (!a) return; anwenden(a, true); z.vor.push(a); knoepfeAktualisieren(); }
function wiederholen() { const a = z.vor.pop(); if (!a) return; anwenden(a, false); z.rueck.push(a); knoepfeAktualisieren(); }
function knoepfeAktualisieren() {
  $('[data-befehl=rueckgaengig]').disabled = !z.rueck.length;
  $('[data-befehl=wiederholen]').disabled = !z.vor.length;
}

/* ================= Werkzeugleiste ================= */

function werkzeugZeigen() {
  for (const b of document.querySelectorAll('[data-werkzeug]')) b.classList.toggle('an', b.dataset.werkzeug === ws.werkzeug);
  document.documentElement.style.setProperty('--marker', ws.marker.farbe);
  const o = $('#optionen');
  const w = ws.werkzeug;
  const farbKnoepfe = (liste, aktiv) => [...liste, ...ws.eigeneFarben.filter((f) => !liste.includes(f)).slice(-3)]
    .map((f) => `<button class="farbe ${f === aktiv ? 'an' : ''}" data-farbe="${f}" style="background:${f}" title="${f}"></button>`).join('')
    + `<label class="farbe plus" title="Eigene Farbe"><input type="color" value="${aktiv}"></label>`;
  const dickenKnoepfe = (liste, aktiv, faktor) => liste.map((d) => `<button class="dicke ${d === aktiv ? 'an' : ''}" data-dicke="${d}"><i style="width:${Math.max(3, d * faktor)}px;height:${Math.max(3, d * faktor)}px"></i></button>`).join('');
  if (w === 'stift' || w === 'form') {
    o.innerHTML = (w === 'form' ? ['rechteck', 'ellipse', 'linie', 'pfeil'].map((a) => `<button class="chip ${ws.form.art === a ? 'an' : ''}" data-art="${a}">${{ rechteck: '▭', ellipse: '◯', linie: '╱', pfeil: '↗' }[a]}</button>`).join('') + '<span class="trenner"></span>' : '')
      + farbKnoepfe(FARBEN, ws.stift.farbe) + '<span class="trenner"></span>' + dickenKnoepfe(STIFT_DICKEN, ws.stift.breite, 2.4);
  } else if (w === 'marker') {
    o.innerHTML = farbKnoepfe(MARKER, ws.marker.farbe) + '<span class="trenner"></span>' + dickenKnoepfe(MARKER_DICKEN, ws.marker.breite, .6);
  } else if (w === 'radierer') {
    o.innerHTML = dickenKnoepfe(RADIERER, ws.radierer.groesse, .55) + '<span class="chip" style="cursor:default">Ganze Striche</span>';
  } else if (w === 'text') {
    o.innerHTML = farbKnoepfe(FARBEN, ws.stift.farbe) + '<span class="trenner"></span>' + TEXTGROESSEN.map((g) => `<button class="chip ${ws.text.groesse === g ? 'an' : ''}" data-groesse="${g}">${g}</button>`).join('');
  } else o.innerHTML = '<span class="chip" style="cursor:default">Einkreisen zum Auswählen</span>';
  for (const s of z.seiten) { const d = z.dom.get(s.id); if (d) d.el.style.cursor = w === 'text' ? 'text' : 'crosshair'; }
}

function farbeSetzen(f) {
  const ziel = ws.werkzeug === 'marker' ? ws.marker : ws.stift;
  ziel.farbe = f;
  // Auswahl gleich mit einfärben
  if (z.auswahl) auswahlAendern((el) => { if (el.typ !== 'bild') el.farbe = f; });
  merken(); werkzeugZeigen();
}

$('#werkzeuge').addEventListener('click', (e) => {
  const w = e.target.closest('[data-werkzeug]');
  if (w) { textFertig(); if (w.dataset.werkzeug !== 'lasso') auswahlAufheben(); ws.werkzeug = w.dataset.werkzeug; merken(); werkzeugZeigen(); return; }
  const f = e.target.closest('[data-farbe]'); if (f) return farbeSetzen(f.dataset.farbe);
  const d = e.target.closest('[data-dicke]');
  if (d) {
    const v = +d.dataset.dicke;
    if (ws.werkzeug === 'marker') ws.marker.breite = v; else if (ws.werkzeug === 'radierer') ws.radierer.groesse = v; else ws.stift.breite = v;
    merken(); werkzeugZeigen(); return;
  }
  const a = e.target.closest('[data-art]'); if (a) { ws.form.art = a.dataset.art; merken(); werkzeugZeigen(); return; }
  const g = e.target.closest('[data-groesse]'); if (g) { ws.text.groesse = +g.dataset.groesse; merken(); werkzeugZeigen(); }
});
$('#werkzeuge').addEventListener('change', (e) => {
  if (e.target.type !== 'color') return;
  const f = e.target.value;
  if (!ws.eigeneFarben.includes(f)) ws.eigeneFarben.push(f);
  farbeSetzen(f);
});

/* ================= Eingabe: Stift, Finger, Maus ================= */

let geste = null; // laufende Zeichen-Geste
const finger = new Map(); // aktive Touch-Punkte für Zoom

function erlaubtZeichnen(e) {
  if (e.pointerType === 'pen') {
    if (!nurStift && !localStorage.getItem('heft.nurStiftGefragt')) {
      // Apple Pencil erkannt: ab jetzt scrollt der Finger, der Stift zeichnet (wie GoodNotes)
      localStorage.setItem('heft.nurStiftGefragt', '1');
      setzeNurStift(true);
      hinweis('Stift erkannt: Finger scrollen jetzt, der Stift zeichnet. Änderbar unter „…“.', 4000);
    }
    return true;
  }
  if (e.pointerType === 'touch') return !nurStift;
  return e.button === 0;
}
function setzeNurStift(an) {
  nurStift = an;
  localStorage.setItem('heft.nurStift', an ? '1' : '0');
  for (const d of z.dom.values()) d.el.classList.toggle('zeichnen', !an);
}

const seitePunkt = (s, e) => {
  const r = z.dom.get(s.id).el.getBoundingClientRect();
  const m = r.width / s.breite;
  return [(e.clientX - r.left) / m, (e.clientY - r.top) / m];
};
const seiteAus = (el) => z.seiten[+el.closest('.seite').dataset.index];

seitenEl.addEventListener('pointerdown', (e) => {
  const seiteEl = e.target.closest('.seite');
  if (!seiteEl || e.target.closest('.textfeld, .auswahl, .auswahl-menue')) return;
  if (e.pointerType === 'touch') {
    finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (finger.size >= 2) { abbrechenGeste(); return; }
  }
  if (!erlaubtZeichnen(e)) return;
  menueZu();
  const s = seiteAus(seiteEl);
  const [x, y] = seitePunkt(s, e);
  const druck = e.pointerType === 'pen' ? (e.pressure || .5) : .5;
  try { seiteEl.setPointerCapture(e.pointerId); } catch {}
  e.preventDefault();
  const w = ws.werkzeug;
  if (w === 'text') { textAnlegen(s, x, y); return; }
  textFertig();
  if (w !== 'lasso') auswahlAufheben();
  geste = { id: e.pointerId, seite: s, werkzeug: w, typ: e.pointerType, punkte: [x, y, druck], start: [x, y], weg: [], glatt: [x, y] };
  if (w === 'lasso') { auswahlAufheben(); geste.poly = [[x, y]]; }
  if (w === 'radierer') radieren(x, y);
  zeichneGeste();
});

seitenEl.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && finger.has(e.pointerId)) finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!geste || e.pointerId !== geste.id) {
    if (ws.werkzeug === 'radierer' && e.pointerType !== 'touch' && !geste) radiererCursor(e);
    return;
  }
  const ereignisse = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (ereignisse.length ? ereignisse : [e])) punktHinzu(ev);
  zeichneGeste();
});

function punktHinzu(ev) {
  const g = geste;
  const [rx, ry] = seitePunkt(g.seite, ev);
  if (g.werkzeug === 'radierer') { radieren(rx, ry); g.cursor = [rx, ry]; return; }
  if (g.werkzeug === 'lasso') { g.poly.push([rx, ry]); return; }
  if (g.werkzeug === 'form') { g.ende = [rx, ry]; return; }
  // Leichte Glättung gegen Zittern; der Stift folgt trotzdem ohne spürbare Verzögerung
  const glaett = g.typ === 'pen' ? .55 : .45;
  const x = g.glatt[0] + (rx - g.glatt[0]) * glaett, y = g.glatt[1] + (ry - g.glatt[1]) * glaett;
  g.glatt = [x, y];
  const p = g.punkte, n = p.length;
  if (Math.hypot(x - p[n - 3], y - p[n - 2]) < .6 / z.zoom) return;
  const druck = g.typ === 'pen' ? (ev.pressure || .5) : .5;
  p.push(x, y, druck);
}

function zeichneGeste() {
  if (geste?._raf) return;
  if (!geste) return;
  geste._raf = requestAnimationFrame(() => {
    if (!geste) return;
    geste._raf = 0;
    const g = geste, c = liveCtx(g.seite);
    if (g.werkzeug === 'stift' || g.werkzeug === 'marker') {
      const o = ws[g.werkzeug];
      zeichneElement(c, { typ: 'strich', werkzeug: g.werkzeug, farbe: o.farbe, breite: o.breite, punkte: g.punkte });
    } else if (g.werkzeug === 'form' && g.ende) {
      zeichneElement(c, formAus(g));
    } else if (g.werkzeug === 'lasso') {
      c.save(); c.setLineDash([5, 4]); c.strokeStyle = '#5b5bd6'; c.lineWidth = 1.2 / z.zoom; c.fillStyle = 'rgba(91,91,214,.06)';
      c.beginPath(); g.poly.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); c.stroke(); c.restore();
    } else if (g.werkzeug === 'radierer' && g.cursor) {
      radiererKreis(c, ...g.cursor);
    }
  });
}

function formAus(g) {
  let [x2, y2] = g.ende;
  const [x1, y1] = g.start;
  // Linien rasten bei fast waagerecht/senkrecht ein
  if (ws.form.art === 'linie' || ws.form.art === 'pfeil') {
    const w = Math.atan2(y2 - y1, x2 - x1), schritt = Math.PI / 4, ger = Math.round(w / schritt) * schritt;
    if (Math.abs(w - ger) < .08) { const l = Math.hypot(x2 - x1, y2 - y1); x2 = x1 + Math.cos(ger) * l; y2 = y1 + Math.sin(ger) * l; }
  }
  return { typ: 'form', art: ws.form.art, x1, y1, x2, y2, farbe: ws.stift.farbe, breite: ws.stift.breite };
}

function radiererKreis(c, x, y) {
  c.save(); c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1 / z.zoom; c.fillStyle = 'rgba(255,255,255,.35)';
  c.beginPath(); c.arc(x, y, ws.radierer.groesse / 2, 0, 7); c.fill(); c.stroke(); c.restore();
}
let cursorSeite = null;
function radiererCursor(e) {
  const el = e.target.closest('.seite');
  if (cursorSeite && cursorSeite !== el) { const s = seiteAus(cursorSeite); liveCtx(s); }
  cursorSeite = el;
  if (!el) return;
  const s = seiteAus(el);
  radiererKreis(liveCtx(s), ...seitePunkt(s, e));
}

function radieren(x, y) {
  const g = geste, s = g.seite;
  const weg = s.elemente.filter((el) => !el._versteckt && trifft(el, x, y, ws.radierer.groesse / 2));
  if (!weg.length) return;
  for (const el of weg) {
    g.weg.push({ el, index: s.elemente.indexOf(el) });
    s.elemente.splice(s.elemente.indexOf(el), 1);
  }
  tinteRendern(s);
}

function gesteEnde(e) {
  if (e.pointerType === 'touch') finger.delete(e.pointerId);
  if (!geste || e.pointerId !== geste.id) return;
  const g = geste; geste = null;
  cancelAnimationFrame(g._raf);
  const s = g.seite;
  liveCtx(s);
  if (g.werkzeug === 'stift' || g.werkzeug === 'marker') {
    const o = ws[g.werkzeug];
    const el = { typ: 'strich', werkzeug: g.werkzeug, farbe: o.farbe, breite: o.breite, punkte: g.punkte.map((v) => Math.round(v * 100) / 100) };
    s.elemente.push(el);
    // Nur den neuen Strich auf die Tinte malen statt alles neu
    const d = z.dom.get(s.id), f = d.tinte.width / s.breite, t = d.tinte.getContext('2d');
    t.setTransform(f, 0, 0, f, 0, 0);
    zeichneElement(t, el);
    aktion({ typ: 'hinzu', seite: s, elemente: [el] });
    seiteGeaendert(s);
  } else if (g.werkzeug === 'form' && g.ende) {
    const el = formAus(g);
    if (Math.hypot(el.x2 - el.x1, el.y2 - el.y1) < 3) return;
    s.elemente.push(el);
    tinteRendern(s);
    aktion({ typ: 'hinzu', seite: s, elemente: [el] });
    seiteGeaendert(s);
  } else if (g.werkzeug === 'radierer' && g.weg.length) {
    const sortiert = g.weg.sort((a, b) => a.index - b.index);
    aktion({ typ: 'weg', seite: s, elemente: sortiert.map((w) => w.el), indizes: sortiert.map((w) => w.index) });
    seiteGeaendert(s);
  } else if (g.werkzeug === 'lasso' && g.poly.length > 3) {
    const ctx = z.dom.get(s.id).tinte.getContext('2d');
    const gewaehlt = s.elemente.filter((el) => imLasso(el, g.poly, ctx));
    if (gewaehlt.length) auswahlSetzen(s, gewaehlt);
  }
}
function abbrechenGeste() {
  if (!geste) return;
  const g = geste; geste = null;
  liveCtx(g.seite);
  // Schon radierte Elemente zurücklegen
  if (g.weg.length) { for (const w of g.weg.sort((a, b) => a.index - b.index)) g.seite.elemente.splice(w.index, 0, w.el); tinteRendern(g.seite); }
}
seitenEl.addEventListener('pointerup', gesteEnde);
seitenEl.addEventListener('pointercancel', (e) => { if (e.pointerType === 'touch') finger.delete(e.pointerId); if (geste?.id === e.pointerId) abbrechenGeste(); });
seitenEl.addEventListener('pointerleave', () => { if (cursorSeite && !geste) { liveCtx(seiteAus(cursorSeite)); cursorSeite = null; } });

// iPad: verhindern, dass der Apple Pencil die Seite scrollt statt zu zeichnen
bereich.addEventListener('touchstart', (e) => {
  if ([...e.touches].some((t) => t.touchType === 'stylus')) e.preventDefault();
}, { passive: false });

/* ---------- Zoomen: zwei Finger, Strg+Mausrad, Tasten ---------- */

let pinch = null;
bereich.addEventListener('touchmove', (e) => {
  if (e.touches.length !== 2 || [...e.touches].some((t) => t.touchType === 'stylus')) { pinch = null; return; }
  e.preventDefault();
  const [a, b] = e.touches;
  const abstand = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
  if (!pinch) { pinch = { abstand, zoom: z.zoom, mx, my }; return; }
  zoomen(pinch.zoom * (abstand / pinch.abstand), mx, my, false);
  bereich.scrollLeft -= mx - pinch.mx; bereich.scrollTop -= my - pinch.my;
  pinch.mx = mx; pinch.my = my;
}, { passive: false });
bereich.addEventListener('touchend', () => { if (pinch) { pinch = null; zoomFertig(); } });
bereich.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  zoomen(z.zoom * Math.exp(-e.deltaY * .01), e.clientX, e.clientY);
}, { passive: false });

let zoomTimer;
function zoomen(neu, cx, cy, sofort = true) {
  neu = Math.max(.5, Math.min(5, neu));
  if (Math.abs(neu - z.zoom) < .001) return;
  const r = bereich.getBoundingClientRect();
  const px = cx - r.left + bereich.scrollLeft, py = cy - r.top + bereich.scrollTop;
  const f = neu / z.zoom;
  z.zoom = neu;
  // Größen sofort setzen (Canvas wird gestreckt), scharf neu malen erst nach kurzer Pause
  const m = massstab();
  for (const s of z.seiten) { const d = z.dom.get(s.id); d.el.style.width = s.breite * m + 'px'; d.el.style.height = s.hoehe * m + 'px'; }
  bereich.scrollLeft = px * f - (cx - r.left);
  bereich.scrollTop = py * f - (cy - r.top);
  auswahlPositionieren();
  clearTimeout(zoomTimer);
  if (sofort) zoomTimer = setTimeout(zoomFertig, 180);
}
function zoomFertig() { renderVersion++; sichtbareRendern(); }

/* ================= Text ================= */

let textEdit = null;
function textAnlegen(s, x, y, vorhanden) {
  textFertig();
  auswahlAufheben();
  // Auf bestehenden Text getippt? Dann den bearbeiten.
  if (!vorhanden) {
    const ctx = z.dom.get(s.id).tinte.getContext('2d');
    vorhanden = [...s.elemente].reverse().find((el) => el.typ === 'text' && (() => { const r = rahmen(el, ctx); return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2; })());
  }
  const el = vorhanden || { typ: 'text', x, y: y - (ws.text.groesse * .65), b: Math.min(320, s.breite - x - 20), text: '', groesse: ws.text.groesse, farbe: ws.stift.farbe };
  if (el.b < 60) { el.x = Math.max(10, s.breite - 200); el.b = 180; }
  const vorher = vorhanden ? kopie(vorhanden) : null;
  if (vorhanden) { vorhanden._versteckt = true; tinteRendern(s); }
  const m = massstab();
  const feld = document.createElement('div');
  feld.className = 'textfeld';
  feld.contentEditable = 'true';
  feld.spellcheck = true;
  Object.assign(feld.style, { left: el.x * m + 'px', top: el.y * m + 'px', width: el.b * m + 'px', fontSize: el.groesse * m + 'px', color: el.farbe });
  feld.innerText = el.text;
  z.dom.get(s.id).el.append(feld);
  textEdit = { feld, el, s, vorher, neu: !vorhanden };
  setTimeout(() => { feld.focus(); const sel = getSelection(); sel.selectAllChildren(feld); sel.collapseToEnd(); }, 0);
  feld.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); textFertig(); } e.stopPropagation(); });
  feld.addEventListener('blur', () => setTimeout(textFertig, 0));
}
function textFertig() {
  if (!textEdit) return;
  const { feld, el, s, vorher, neu } = textEdit; textEdit = null;
  const text = feld.innerText.replace(/\n$/, '');
  feld.remove();
  delete el._versteckt;
  if (neu && text.trim()) {
    el.text = text; s.elemente.push(el);
    aktion({ typ: 'hinzu', seite: s, elemente: [el] });
  } else if (!neu && !text.trim()) {
    const i = s.elemente.indexOf(el); s.elemente.splice(i, 1);
    aktion({ typ: 'weg', seite: s, elemente: [el], indizes: [i] });
  } else if (!neu && text !== vorher.text) {
    el.text = text; rahmenVergessen(el);
    aktion({ typ: 'aendern', seite: s, paare: [[el, vorher, kopie(el)]] });
  }
  rahmenVergessen(el);
  tinteRendern(s);
  seiteGeaendert(s);
}
seitenEl.addEventListener('dblclick', (e) => {
  const seiteEl = e.target.closest('.seite'); if (!seiteEl || ws.werkzeug !== 'lasso') return;
  const s = seiteAus(seiteEl), [x, y] = seitePunkt(s, e);
  const ctx = z.dom.get(s.id).tinte.getContext('2d');
  const el = [...s.elemente].reverse().find((t) => t.typ === 'text' && (() => { const r = rahmen(t, ctx); return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2; })());
  if (el) textAnlegen(s, x, y, el);
});

/* ================= Auswahl (Lasso) ================= */

function auswahlSetzen(s, elemente) {
  auswahlAufheben();
  z.auswahl = { seite: s, elemente };
  const d = z.dom.get(s.id);
  const box = document.createElement('div');
  box.className = 'auswahl';
  box.innerHTML = '<div class="griff"></div>';
  const m = document.createElement('div');
  m.className = 'auswahl-menue';
  m.innerHTML = '<button data-a="kopieren">Kopieren</button><button data-a="duplizieren">Duplizieren</button><button data-a="ausschneiden">Ausschneiden</button><button data-a="loeschen">Löschen</button>';
  d.el.append(box, m);
  z.auswahl.box = box; z.auswahl.menue = m;
  auswahlPositionieren();
  box.addEventListener('pointerdown', auswahlZiehen);
  m.addEventListener('pointerdown', (e) => e.stopPropagation());
  m.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'kopieren') { kopieren(); hinweis('Kopiert'); }
    if (a === 'duplizieren') { kopieren(); einfuegen(12); }
    if (a === 'ausschneiden') { kopieren(); auswahlLoeschen(); }
    if (a === 'loeschen') auswahlLoeschen();
  });
}
function auswahlRahmen() {
  const ctx = z.dom.get(z.auswahl.seite.id).tinte.getContext('2d');
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const el of z.auswahl.elemente) { const r = rahmen(el, ctx); x1 = Math.min(x1, r.x1); y1 = Math.min(y1, r.y1); x2 = Math.max(x2, r.x2); y2 = Math.max(y2, r.y2); }
  return { x1, y1, x2, y2 };
}
function auswahlPositionieren() {
  if (!z.auswahl) return;
  const r = auswahlRahmen(), m = massstab(), p = 6;
  Object.assign(z.auswahl.box.style, { left: r.x1 * m - p + 'px', top: r.y1 * m - p + 'px', width: (r.x2 - r.x1) * m + 2 * p + 'px', height: (r.y2 - r.y1) * m + 2 * p + 'px' });
  Object.assign(z.auswahl.menue.style, { left: ((r.x1 + r.x2) / 2) * m + 'px', top: Math.max(40, r.y1 * m - 14) + 'px' });
}
function auswahlAufheben() {
  if (!z.auswahl) return;
  z.auswahl.box.remove(); z.auswahl.menue.remove();
  z.auswahl = null;
}
function auswahlZiehen(e) {
  e.stopPropagation(); e.preventDefault();
  const a = z.auswahl, s = a.seite, box = a.box;
  try { box.setPointerCapture(e.pointerId); } catch {}
  const skal = e.target.classList.contains('griff');
  const vorher = a.elemente.map(kopie);
  const start = seitePunkt(s, e), r0 = auswahlRahmen();
  let letzte = start;
  const bewegen = (ev) => {
    const p = seitePunkt(s, ev);
    if (skal) {
      const w0 = r0.x2 - r0.x1 || 1, h0 = r0.y2 - r0.y1 || 1;
      const f = Math.max(.1, Math.min((w0 + p[0] - start[0]) / w0, 20));
      const g = Math.max(.1, Math.min((h0 + p[1] - start[1]) / h0, 20));
      const k = Math.max(f, g); // Seitenverhältnis behalten
      a.elemente.forEach((el, i) => { Object.assign(el, kopie(vorher[i])); skalieren(el, k, k, r0.x1, r0.y1); });
    } else {
      for (const el of a.elemente) verschieben(el, p[0] - letzte[0], p[1] - letzte[1]);
      letzte = p;
    }
    tinteRendern(s); auswahlPositionieren();
  };
  const los = () => {
    box.removeEventListener('pointermove', bewegen);
    const paare = a.elemente.map((el, i) => [el, vorher[i], kopie(el)]);
    if (JSON.stringify(vorher) !== JSON.stringify(paare.map((p) => p[2]))) { aktion({ typ: 'aendern', seite: s, paare }); seiteGeaendert(s); }
  };
  box.addEventListener('pointermove', bewegen);
  box.addEventListener('pointerup', los, { once: true });
}
function auswahlAendern(fn) {
  const a = z.auswahl;
  const paare = a.elemente.map((el) => { const v = kopie(el); fn(el); rahmenVergessen(el); return [el, v, kopie(el)]; });
  aktion({ typ: 'aendern', seite: a.seite, paare });
  tinteRendern(a.seite); seiteGeaendert(a.seite);
}
function auswahlLoeschen() {
  const a = z.auswahl; if (!a) return;
  const s = a.seite;
  const indizes = a.elemente.map((el) => s.elemente.indexOf(el));
  s.elemente = s.elemente.filter((el) => !a.elemente.includes(el));
  aktion({ typ: 'weg', seite: s, elemente: a.elemente, indizes });
  auswahlAufheben();
  tinteRendern(s); seiteGeaendert(s);
}
function kopieren() { if (z.auswahl) z.ablage = z.auswahl.elemente.map(kopie); }
function einfuegen(versatz = 0) {
  if (!z.ablage?.length) return hinweis('Nichts zum Einfügen');
  const s = z.auswahl?.seite || z.seiten[z.aktuell];
  const neu = z.ablage.map(kopie);
  for (const el of neu) verschieben(el, versatz, versatz);
  s.elemente.push(...neu);
  aktion({ typ: 'hinzu', seite: s, elemente: neu });
  tinteRendern(s); seiteGeaendert(s);
  ws.werkzeug = 'lasso'; merken(); werkzeugZeigen();
  auswahlSetzen(s, neu);
}

/* ================= Bilder ================= */

$('#datei-bild').onchange = async (e) => {
  const datei = e.target.files[0]; e.target.value = '';
  if (!datei) return;
  const dateiId = id();
  await db.speichern('dateien', { id: dateiId, blob: datei, typ: datei.type });
  await bildVorbereiten(dateiId);
  const img = bildLaden(dateiId);
  const s = z.seiten[z.aktuell];
  const b = Math.min(s.breite * .6, img.naturalWidth || 300);
  const h = b * ((img.naturalHeight || 1) / (img.naturalWidth || 1));
  const el = { typ: 'bild', dateiId, x: (s.breite - b) / 2, y: Math.max(40, (s.hoehe - h) / 3), b, h };
  s.elemente.push(el);
  aktion({ typ: 'hinzu', seite: s, elemente: [el] });
  tinteRendern(s); seiteGeaendert(s);
  ws.werkzeug = 'lasso'; merken(); werkzeugZeigen();
  auswahlSetzen(s, [el]);
};

/* ================= Seitenleiste ================= */

function leisteAufbauen() {
  leiste.innerHTML = z.seiten.map((s, i) => `<div class="mini-seite ${i === z.aktuell ? 'an' : ''}" data-i="${i}"><canvas></canvas>${i + 1}</div>`).join('')
    + '<button class="btn" data-neu style="margin:0 auto">+ Seite</button>';
  if (!leiste.hidden) z.seiten.forEach(miniAktualisieren);
}
function leisteMarkieren() {
  leiste.querySelectorAll('.mini-seite').forEach((m, i) => m.classList.toggle('an', i === z.aktuell));
  const an = leiste.querySelector('.mini-seite.an');
  if (an && !leiste.hidden) an.scrollIntoView({ block: 'nearest' });
}
const miniTimer = new Map();
function miniAktualisieren(s) {
  if (leiste.hidden) return;
  clearTimeout(miniTimer.get(s.id));
  miniTimer.set(s.id, setTimeout(async () => {
    const i = z.seiten.indexOf(s);
    const c = leiste.querySelector(`.mini-seite[data-i="${i}"] canvas`);
    if (!c) return;
    const f = (134 * Math.min(devicePixelRatio, 2)) / s.breite;
    c.width = Math.round(s.breite * f); c.height = Math.round(s.hoehe * f);
    const ctx = c.getContext('2d');
    ctx.setTransform(f, 0, 0, f, 0, 0);
    zeichnePapier(ctx, s);
    if (s.hintergrund) {
      const bild = await pdfSeiteRendern(s.hintergrund.dateiId, s.hintergrund.seite, f);
      if (bild) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bild, 0, 0, c.width, c.height); ctx.setTransform(f, 0, 0, f, 0, 0); }
    }
    for (const el of s.elemente) zeichneElement(ctx, el);
  }, 250));
}
leiste.addEventListener('click', (e) => {
  if (e.target.closest('[data-neu]')) return seiteHinzu(z.seiten.length - 1);
  const m = e.target.closest('.mini-seite'); if (!m) return;
  zuSeite(+m.dataset.i);
});
leiste.addEventListener('contextmenu', (e) => { const m = e.target.closest('.mini-seite'); if (!m) return; e.preventDefault(); seitenMenue(+m.dataset.i, m); });
let leisteDruck;
leiste.addEventListener('pointerdown', (e) => { const m = e.target.closest('.mini-seite'); if (!m) return; leisteDruck = setTimeout(() => seitenMenue(+m.dataset.i, m), 550); });
leiste.addEventListener('pointerup', () => clearTimeout(leisteDruck));
leiste.addEventListener('pointercancel', () => clearTimeout(leisteDruck));

function zuSeite(i) {
  const d = z.dom.get(z.seiten[i]?.id); if (!d) return;
  bereich.scrollTo({ top: d.el.offsetTop * 1 - 16, behavior: 'smooth' });
  if (innerWidth < 760) leiste.hidden = true;
}

/* ================= Seiten verwalten ================= */

async function seiteHinzu(nach, vorlage, papier) {
  const vorbild = z.seiten[nach] || z.seiten[0];
  const s = neueSeite(z.heft.id, vorlage || (vorbild?.hintergrund ? 'leer' : vorbild?.vorlage) || 'liniert', papier || vorbild?.papier || 'weiss');
  z.seiten.splice(nach + 1, 0, s);
  z.heft.seiten = z.seiten.map((x) => x.id);
  await db.speichern('seiten', s);
  await db.speichern('hefte', z.heft);
  aufbauen();
  requestAnimationFrame(() => zuSeite(nach + 1));
}
async function seiteDuplizieren(i) {
  const s = { ...structuredClone(z.seiten[i]), id: id() };
  z.seiten.splice(i + 1, 0, s);
  z.heft.seiten = z.seiten.map((x) => x.id);
  await db.speichern('seiten', s); await db.speichern('hefte', z.heft);
  aufbauen();
}
async function seiteLoeschen(i) {
  if (z.seiten.length === 1) return hinweis('Die letzte Seite kann nicht gelöscht werden.');
  if (!await frage(`Seite ${i + 1} löschen?`, 'Das kann nicht rückgängig gemacht werden.')) return;
  const [s] = z.seiten.splice(i, 1);
  z.heft.seiten = z.seiten.map((x) => x.id);
  z.rueck = z.rueck.filter((a) => a.seite !== s); z.vor = z.vor.filter((a) => a.seite !== s);
  await db.loeschen('seiten', s.id); await db.speichern('hefte', z.heft);
  knoepfeAktualisieren();
  aufbauen();
}
async function seiteVerschieben(i, richtung) {
  const j = i + richtung;
  if (j < 0 || j >= z.seiten.length) return;
  [z.seiten[i], z.seiten[j]] = [z.seiten[j], z.seiten[i]];
  z.heft.seiten = z.seiten.map((x) => x.id);
  await db.speichern('hefte', z.heft);
  aufbauen();
  requestAnimationFrame(() => zuSeite(j));
}
function seitenMenue(i, anker) {
  const m = menue(`<div class="titel">Seite ${i + 1}</div>
    <button data-a="danach">${ICON.heft}Neue Seite danach</button>
    <button data-a="vorlage">${ICON.cover}Papier ändern</button>
    <button data-a="duplizieren">${ICON.kopie}Duplizieren</button>
    <button data-a="hoch" ${i === 0 ? 'disabled' : ''}>↑ Nach oben</button>
    <button data-a="runter" ${i === z.seiten.length - 1 ? 'disabled' : ''}>↓ Nach unten</button>
    <hr><button class="gefahr" data-a="loeschen">${ICON.muell}Seite löschen</button>`, anker);
  m.onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; menueZu();
    if (a === 'danach') seiteHinzu(i);
    if (a === 'vorlage') vorlageDialog(i);
    if (a === 'duplizieren') seiteDuplizieren(i);
    if (a === 'hoch') seiteVerschieben(i, -1);
    if (a === 'runter') seiteVerschieben(i, 1);
    if (a === 'loeschen') seiteLoeschen(i);
  };
}
function vorlageDialog(i) {
  const s = z.seiten[i];
  let vorlage = s.vorlage, papier = s.papier;
  const box = dialog(`<h2>Papier für Seite ${i + 1}</h2>
    <div class="wahl" id="v-vorlage">${Object.entries(VORLAGEN).map(([k, n]) => `<button class="vorlage ${k === vorlage ? 'an' : ''}" data-v="${k}"><span class="muster"><canvas width="124" height="164"></canvas></span>${n}</button>`).join('')}</div>
    ${s.hintergrund ? '' : `<div style="display:flex;gap:8px;margin-bottom:14px" id="v-papier">${Object.keys(PAPIER).map((k) => `<button class="btn ${k === papier ? 'haupt' : ''}" data-p="${k}" style="padding:7px 14px;font-weight:500">${{ weiss: 'Weiß', creme: 'Creme', dunkel: 'Dunkel' }[k]}</button>`).join('')}</div>`}
    <label class="punkt" style="display:flex;gap:8px;align-items:center;margin-bottom:12px;font-size:14px"><input type="checkbox" id="v-alle"> Für alle Seiten übernehmen</label>
    <div class="dialog-knoepfe"><button class="btn" data-n>Abbrechen</button><button class="btn haupt" data-j>Übernehmen</button></div>`);
  const muster = () => box.querySelectorAll('#v-vorlage button').forEach((b) => vorlagenMuster($('canvas', b), b.dataset.v, papier));
  muster();
  $('#v-vorlage', box).onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; vorlage = b.dataset.v; box.querySelectorAll('#v-vorlage button').forEach((x) => x.classList.toggle('an', x === b)); };
  $('#v-papier', box)?.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; papier = b.dataset.p; box.querySelectorAll('#v-papier button').forEach((x) => x.classList.toggle('haupt', x === b)); muster(); });
  $('[data-n]', box).onclick = dialogZu;
  $('[data-j]', box).onclick = async () => {
    const ziele = $('#v-alle', box).checked ? z.seiten : [s];
    for (const x of ziele) { x.vorlage = vorlage; if (!x.hintergrund) x.papier = papier; await db.speichern('seiten', x); }
    dialogZu(); groessen(); leisteAufbauen();
  };
}

/* ================= Befehle und Menü ================= */

document.querySelector('#editor .werkzeugleiste').addEventListener('click', (e) => {
  const b = e.target.closest('[data-befehl]'); if (!b) return;
  const c = b.dataset.befehl;
  if (c === 'schliessen') schliessen();
  if (c === 'seitenleiste') { leiste.hidden = !leiste.hidden; localStorage.setItem('heft.leiste', leiste.hidden ? '0' : '1'); if (!leiste.hidden) { leisteAufbauen(); leisteMarkieren(); } const alt = z.basis; basisBerechnen(); if (Math.abs(alt - z.basis) > .001) groessen(); }
  if (c === 'rueckgaengig') rueckgaengig();
  if (c === 'wiederholen') wiederholen();
  if (c === 'bild') { textFertig(); $('#datei-bild').click(); }
  if (c === 'mehr') mehrMenue(b);
});
$('#heft-titel').addEventListener('click', async () => {
  const n = await eingabe('Umbenennen', z.heft.titel);
  if (n) { z.heft.titel = n; $('#heft-titel').textContent = n; await db.speichern('hefte', z.heft); }
});

function mehrMenue(anker) {
  const i = z.aktuell;
  const m = menue(`<div class="titel">Seite ${i + 1} von ${z.seiten.length}</div>
    <button data-a="danach">${ICON.heft}Neue Seite danach</button>
    <button data-a="vorlage">${ICON.cover}Papier ändern</button>
    <button data-a="duplizieren">${ICON.kopie}Seite duplizieren</button>
    <button class="gefahr" data-a="loeschen">${ICON.muell}Seite löschen</button>
    <hr>
    <button data-a="einfuegen" ${z.ablage ? '' : 'disabled'}>📋&nbsp; Einfügen</button>
    <div class="titel">Ansicht</div>
    <div class="reihe"><button data-a="zoom-">−</button><button data-a="zoom1">${Math.round(z.zoom * 100)} %</button><button data-a="zoom+">+</button></div>
    <label class="punkt"><input type="checkbox" data-a="nurstift" ${nurStift ? 'checked' : ''}> Nur mit Stift zeichnen (Finger scrollt)</label>
    <hr>
    <button data-a="export">${ICON.pdf}Als PDF exportieren</button>
    <button data-a="umbenennen">${ICON.stift}Notizbuch umbenennen</button>`, anker, { rechts: true });
  m.onclick = async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a || a === 'nurstift') return;
    if (!a.startsWith('zoom')) menueZu();
    const r = bereich.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (a === 'zoom-') zoomen(z.zoom / 1.25, cx, cy);
    if (a === 'zoom+') zoomen(z.zoom * 1.25, cx, cy);
    if (a === 'zoom1') zoomen(1, cx, cy);
    if (a.startsWith('zoom')) m.querySelector('[data-a=zoom1]').textContent = Math.round(z.zoom * 100) + ' %';
    if (a === 'danach') seiteHinzu(i);
    if (a === 'vorlage') vorlageDialog(i);
    if (a === 'duplizieren') seiteDuplizieren(i);
    if (a === 'loeschen') seiteLoeschen(i);
    if (a === 'einfuegen') einfuegen();
    if (a === 'umbenennen') $('#heft-titel').click();
    if (a === 'export') exportieren();
  };
  m.querySelector('[data-a=nurstift]').onchange = (e) => setzeNurStift(e.target.checked);
}

async function exportieren() {
  await speichernJetzt();
  hinweis('PDF wird erstellt …', 30000);
  try {
    const bytes = await pdfExportieren(z.heft, z.seiten);
    const datei = new File([bytes], (z.heft.titel || 'Notizbuch').replace(/[\\/:*?"<>|]/g, '') + '.pdf', { type: 'application/pdf' });
    $('#hinweis').hidden = true;
    // iPad: Teilen-Menü (Dateien, AirDrop …); PC: normaler Download
    if (navigator.canShare?.({ files: [datei] }) && /iPad|iPhone|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document) {
      await navigator.share({ files: [datei], title: z.heft.titel }).catch(() => {});
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(datei); a.download = datei.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
  } catch (err) { console.error(err); hinweis('Export fehlgeschlagen.'); }
}

/* ================= Tastatur ================= */

addEventListener('keydown', (e) => {
  if (!z.heft || $('#editor').hidden || e.target.closest?.('input, textarea, [contenteditable=true]') || !$('#dialog').hidden) return;
  const strg = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (strg && k === 'z' && !e.shiftKey) { e.preventDefault(); rueckgaengig(); }
  else if (strg && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); wiederholen(); }
  else if (strg && k === 'c') { kopieren(); }
  else if (strg && k === 'x') { kopieren(); auswahlLoeschen(); }
  else if (strg && k === 'v') { e.preventDefault(); einfuegen(z.auswahl ? 12 : 0); }
  else if (strg && k === 'd') { e.preventDefault(); kopieren(); einfuegen(12); }
  else if (strg && (k === '+' || k === '=')) { e.preventDefault(); const r = bereich.getBoundingClientRect(); zoomen(z.zoom * 1.25, r.left + r.width / 2, r.top + r.height / 2); }
  else if (strg && k === '-') { e.preventDefault(); const r = bereich.getBoundingClientRect(); zoomen(z.zoom / 1.25, r.left + r.width / 2, r.top + r.height / 2); }
  else if (strg && k === '0') { e.preventDefault(); const r = bereich.getBoundingClientRect(); zoomen(1, r.left + r.width / 2, r.top + r.height / 2); }
  else if ((k === 'delete' || k === 'backspace') && z.auswahl) { e.preventDefault(); auswahlLoeschen(); }
  else if (k === 'escape') auswahlAufheben();
  else if (!strg && !e.altKey) {
    const w = { p: 'stift', h: 'marker', e: 'radierer', l: 'lasso', s: 'form', t: 'text' }[k];
    if (w) { if (w !== 'lasso') auswahlAufheben(); ws.werkzeug = w; merken(); werkzeugZeigen(); }
  }
});
