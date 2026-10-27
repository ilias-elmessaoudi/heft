import { db, id } from './db.js';
import { ws, merken, z, api, $, esc, massstab, aktFarbe, aktBreite } from './zustand.js';
import { I } from './icons.js';
import {
  PAPIER, zeichnePapier, zeichneElement, zeichneAlle, trifft, teilRadieren, imLasso, rahmen, rahmenVergessen,
  verschieben, skalieren, drehen, einfaerben, kopie, bildLaden, bildHolen, formErkennen, formNormalisieren, textNormalisieren, textInhalt,
} from './zeichnen.js';
import { werkzeugleisteZeigen, popover, popoverZu, farbwaehler } from './werkzeugleiste.js';
import { textAnlegen, textFertig, textBearbeitet, textleisteZeigen, textEinstellungen, textNeuPositionieren } from './text.js';
import { zoomfensterUmschalten, zoomfensterOffen, zoomfensterAktualisieren, zoomfensterSeite, zfRendern } from './zoomfenster.js';
import { elementePopover, alsElementSpeichern } from './elemente.js';
import { hintergrundEntfernen, stickerEffekt, bildAusDaten } from './bild-werkzeug.js';
import { schriftenFuer, eigeneLaden } from './schriften.js';
import { pdfSeiteRendern, pdfExportieren } from './pdf-werkzeug.js';
import { bibliothekZeigen, hinweis, menue, menueZu, frage, eingabe, neueSeite, papierDialog, vorschauErstellen } from './app.js';

const bereich = $('#blatt-bereich');
const seitenEl = $('#seiten');
const leiste = $('#seitenleiste');

/* ================= Kopfzeile ================= */

$('#kopf-links').innerHTML = `
  <button class="knopf" data-b="schliessen" title="Zur Bibliothek">${I.zurueck}</button>
  <button class="knopf" data-b="seitenleiste" title="Seitenübersicht">${I.raster}</button>
  <button class="knopf" data-b="suche" title="Im Dokument suchen" data-popover-anker>${I.lupe}</button>
  <button class="knopf" data-b="teilen" title="Teilen / Exportieren">${I.teilen}</button>`;
$('#kopf-rechts').innerHTML = `
  <button class="knopf" data-b="rueck" title="Rückgängig (Strg+Z)">${I.rueck}</button>
  <button class="knopf" data-b="vor" title="Wiederholen (Strg+Y)">${I.vor}</button>
  <button class="knopf" data-b="lesezeichen" title="Lesezeichen">${I.lesezeichen}</button>
  <button class="knopf" data-b="seite" title="Seite hinzufügen">${I.seitePlus}</button>
  <button class="knopf" data-b="mehr" title="Mehr">${I.mehr}</button>`;

/* ================= Öffnen / Schließen / Tabs ================= */

let tabs = (() => { try { return JSON.parse(localStorage.getItem('heft.tabs')) || []; } catch { return []; } })();
const tabsMerken = () => localStorage.setItem('heft.tabs', JSON.stringify(tabs));

export async function oeffneEditor(heftId) {
  if (z.heft) { textFertig(); auswahlAufheben(); await speichernJetzt(); await vorschauSichern(); }
  const heft = await db.holen('hefte', heftId);
  if (!heft) return;
  z.heft = heft;
  z.seiten = (await Promise.all(heft.seiten.map((s) => db.holen('seiten', s)))).filter(Boolean);
  for (const s of z.seiten) for (const el of s.elemente) { formNormalisieren(el); textNormalisieren(el); }
  z.rueck = []; z.vor = []; z.auswahl = null; z.zoom = 1; z.aktuell = 0;
  if (!tabs.includes(heftId)) tabs.push(heftId);
  tabsMerken();
  await eigeneLaden();
  await schriftenFuer(z.seiten);
  for (const s of z.seiten) for (const el of s.elemente) if (el.typ === 'bild') await bildVorbereiten(el.dateiId);
  $('#bibliothek').hidden = true;
  $('#editor').hidden = false;
  $('#heft-titel').innerHTML = `<span>${esc(heft.titel)}</span>${I.pfeilRunter}`;
  leiste.hidden = innerWidth < 820 || localStorage.getItem('heft.leiste') !== '1';
  werkzeugleisteZeigen();
  aufbauen();
  tabsZeigen();
  bereich.scrollTop = heft.letzteSeite ? 0 : 0;
  if (heft.letzteSeite && heft.letzteSeite < z.seiten.length) requestAnimationFrame(() => zuSeite(heft.letzteSeite, false));
  knoepfeAktualisieren();
}

async function schliessen(zurBibliothek = true) {
  textFertig(); auswahlAufheben();
  await speichernJetzt();
  await vorschauSichern();
  z.heft = null;
  seitenEl.innerHTML = ''; z.dom.clear();
  if (zoomfensterOffen()) zoomfensterUmschalten();
  if (zurBibliothek) bibliothekZeigen();
}

// Vorschau für Hefte ohne Umschlag (Bibliothek zeigt dann die erste Seite)
async function vorschauSichern() {
  const h = z.heft; if (!h) return;
  h.letzteSeite = z.aktuell;
  if (h.cover === -1 || h.vorschau !== undefined) {
    const url = await vorschauErstellen(z.seiten[0]);
    if (url) h.vorschau = url;
  }
  await db.speichern('hefte', h);
}

async function tabsZeigen() {
  const hefte = (await Promise.all(tabs.map((t) => db.holen('hefte', t)))).filter(Boolean);
  tabs = hefte.map((h) => h.id); tabsMerken();
  $('#dok-tabs').innerHTML = hefte.map((h) => `<div class="dok-tab ${h.id === z.heft?.id ? 'an' : ''}" data-tab="${h.id}"><button class="zu" data-zu="${h.id}" title="Schließen">${I.x}</button><span>${esc(h.titel)}</span></div>`).join('');
}
$('#dok-tabs').addEventListener('click', async (e) => {
  const zu = e.target.closest('[data-zu]');
  if (zu) {
    tabs = tabs.filter((t) => t !== zu.dataset.zu); tabsMerken();
    if (zu.dataset.zu === z.heft?.id) { if (tabs.length) oeffneEditor(tabs.at(-1)); else schliessen(); }
    else tabsZeigen();
    return;
  }
  const t = e.target.closest('[data-tab]');
  if (t && t.dataset.tab !== z.heft?.id) oeffneEditor(t.dataset.tab);
});

const bildUrls = new Map();
async function bildVorbereiten(dateiId) {
  if (bildUrls.has(dateiId)) return;
  const d = await db.holen('dateien', dateiId);
  if (!d) return;
  const url = URL.createObjectURL(d.blob);
  bildUrls.set(dateiId, url);
  // Auf das Laden warten, aber nie hängen bleiben (decode() wartet in Hintergrund-Tabs teils ewig)
  const img = bildLaden(dateiId, url);
  await Promise.race([
    new Promise((ok) => { if (img.complete && img.naturalWidth) ok(); else { img.addEventListener('load', ok, { once: true }); img.addEventListener('error', ok, { once: true }); } }),
    new Promise((ok) => setTimeout(ok, 4000)),
  ]);
}

/* ================= Seiten aufbauen und rendern ================= */

function basisBerechnen() {
  const platz = bereich.clientWidth - (innerWidth < 820 ? 20 : 56);
  const breiteste = Math.max(...z.seiten.map((s) => s.breite), 300);
  z.basis = Math.max(.2, Math.min(platz, 920) / breiteste);
}

function aufbauen() {
  basisBerechnen();
  seitenEl.innerHTML = '';
  z.dom.clear();
  beobachter.disconnect();
  z.seiten.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'seite' + (!z.nurStift ? ' zeichnen' : '');
    el.dataset.id = s.id; el.dataset.index = i;
    el.innerHTML = '<canvas class="papier"></canvas><canvas class="tinte"></canvas><canvas class="live"></canvas>' + (s.lesezeichen ? '<i class="lz-band"></i>' : '');
    seitenEl.append(el);
    z.dom.set(s.id, { el, papier: el.children[0], tinte: el.children[1], live: el.children[2], version: -1, sichtbar: false });
    beobachter.observe(el);
  });
  groessen();
  leisteAufbauen();
  zoomfensterAktualisieren();
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
  auswahlPositionieren();
  textNeuPositionieren();
  zoomfensterAktualisieren();
}

let renderVersion = 0;
const beobachter = new IntersectionObserver((eintraege) => {
  for (const e of eintraege) { const d = z.dom.get(e.target.dataset.id); if (d) d.sichtbar = e.isIntersecting; }
  sichtbareRendern();
  aktuelleSeiteBestimmen();
}, { root: bereich, rootMargin: '500px 0px' });

let renderGeplant = false;
function sichtbareRendern() {
  if (renderGeplant) return;
  renderGeplant = true;
  requestAnimationFrame(() => {
    renderGeplant = false;
    for (const s of z.seiten) { const d = z.dom.get(s.id); if (d?.sichtbar && d.version !== renderVersion) seiteRendern(s); }
  });
}

function aufloesung(s) {
  const f = massstab() * Math.min(devicePixelRatio || 1, 3);
  return Math.min(f, 4096 / Math.max(s.breite, s.hoehe));
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
      p.setTransform(1, 0, 0, 1, 0, 0); p.drawImage(bild, 0, 0, w, h);
      p.setTransform(f, 0, 0, f, 0, 0); zeichnePapier(p, s);
      zoomfensterAktualisieren();
    });
  }
  tinteRendern(s);
}

function tinteRendern(s) {
  const d = z.dom.get(s.id);
  if (!d || !d.tinte.width) return;
  const f = d.tinte.width / s.breite, t = d.tinte.getContext('2d');
  t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, d.tinte.width, d.tinte.height);
  t.setTransform(f, 0, 0, f, 0, 0);
  zeichneAlle(t, s.elemente);
  zoomfensterAktualisieren();
}
const alleTinteRendern = () => { for (const s of z.seiten) tinteRendern(s); };

function liveCtx(s) {
  const d = z.dom.get(s.id);
  const f = d.live.width / s.breite, c = d.live.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, d.live.width, d.live.height);
  c.setTransform(f, 0, 0, f, 0, 0);
  return c;
}

function aktuelleSeiteBestimmen() {
  const mitte = bereich.getBoundingClientRect().top + bereich.clientHeight / 3;
  let best = 0, bestAbstand = Infinity;
  z.seiten.forEach((s, i) => {
    const r = z.dom.get(s.id)?.el.getBoundingClientRect(); if (!r) return;
    const a = r.top <= mitte && r.bottom >= mitte ? 0 : Math.min(Math.abs(r.top - mitte), Math.abs(r.bottom - mitte));
    if (a < bestAbstand) { bestAbstand = a; best = i; }
  });
  if (best !== z.aktuell) { z.aktuell = best; leisteMarkieren(); }
  $('#seitenzahl').textContent = `${z.aktuell + 1} von ${z.seiten.length}`;
  $('[data-b=lesezeichen]').innerHTML = z.seiten[z.aktuell]?.lesezeichen ? I.lesezeichenVoll : I.lesezeichen;
  $('[data-b=lesezeichen]').style.color = z.seiten[z.aktuell]?.lesezeichen ? '#ff453a' : '';
}
bereich.addEventListener('scroll', () => { if (z.heft) aktuelleSeiteBestimmen(); }, { passive: true });
addEventListener('resize', () => { if (!z.heft) return; const alt = z.basis; basisBerechnen(); if (Math.abs(alt - z.basis) > .001) groessen(); });

/* ================= Speichern ================= */

const zuSpeichern = new Set();
let speicherTimer;
function seiteGeaendert(s) {
  zuSpeichern.add(s);
  clearTimeout(speicherTimer);
  speicherTimer = setTimeout(speichernJetzt, 700);
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
  if (z.rueck.length > 300) z.rueck.shift();
  z.vor = [];
  knoepfeAktualisieren();
}
function anwenden(a, rueckwaerts) {
  const s = a.seite;
  if (a.typ === 'hinzu' || a.typ === 'weg') {
    const hinzu = (a.typ === 'hinzu') !== rueckwaerts;
    if (hinzu) a.elemente.forEach((el, i) => s.elemente.splice(Math.min(a.indizes?.[i] ?? s.elemente.length, s.elemente.length), 0, el));
    else s.elemente = s.elemente.filter((el) => !a.elemente.includes(el));
  } else if (a.typ === 'aendern') {
    for (const [el, vorher, nachher] of a.paare) { for (const k of Object.keys(el)) delete el[k]; Object.assign(el, kopie(rueckwaerts ? vorher : nachher)); rahmenVergessen(el); }
  } else if (a.typ === 'tausch') {
    s.elemente = rueckwaerts ? a.vorher.slice() : a.nachher.slice();
  }
  auswahlAufheben();
  tinteRendern(s);
  seiteGeaendert(s);
}
function rueckgaengig() { textFertig(); const a = z.rueck.pop(); if (!a) return; anwenden(a, true); z.vor.push(a); knoepfeAktualisieren(); }
function wiederholen() { const a = z.vor.pop(); if (!a) return; anwenden(a, false); z.rueck.push(a); knoepfeAktualisieren(); }
function knoepfeAktualisieren() {
  $('[data-b=rueck]').disabled = !z.rueck.length;
  $('[data-b=vor]').disabled = !z.vor.length;
}

/* ================= Eingabe ================= */

let geste = null;
const finger = new Map();
let vorherWerkzeug = null;

function erlaubtZeichnen(e) {
  if (e.pointerType === 'pen') {
    if (!z.nurStift && !localStorage.getItem('heft.nurStiftGefragt')) {
      localStorage.setItem('heft.nurStiftGefragt', '1');
      setzeNurStift(true);
      hinweis('Apple Pencil erkannt: Ab jetzt zeichnet nur der Stift, der Finger scrollt. Änderbar im Stift-Menü.', 4500);
    }
    return true;
  }
  if (e.pointerType === 'touch') return !z.nurStift;
  return e.button === 0;
}
function setzeNurStift(an) {
  z.nurStift = an;
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
  if (!seiteEl || e.target.closest('.textfeld, .textfeld-breite, .auswahl, .auswahl-menue, .zf-rahmen, .zuschnitt, .zuschnitt-knoepfe')) return;
  if (e.pointerType === 'touch') { finger.set(e.pointerId, 1); if (finger.size >= 2) { gesteAbbrechen(); return; } }
  if (!erlaubtZeichnen(e)) return;
  try { seiteEl.setPointerCapture(e.pointerId); } catch {}
  const s = seiteAus(seiteEl);
  if (zoomfensterOffen() && ws.werkzeug !== 'lasso' && ws.werkzeug !== 'text') { const [x, y] = seitePunkt(s, e); zoomfensterSeite(s, x, y); return; }
  gesteStarten(e, s, (ev) => seitePunkt(s, ev), false);
});
seitenEl.addEventListener('pointermove', (e) => {
  if (!geste || e.pointerId !== geste.id) { if (ws.werkzeug === 'radierer' && e.pointerType !== 'touch' && !geste) radiererCursor(e); return; }
  gesteBewegen(e);
});
seitenEl.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') finger.delete(e.pointerId); gesteEnde(e); });
seitenEl.addEventListener('pointercancel', (e) => { if (e.pointerType === 'touch') finger.delete(e.pointerId); if (geste?.id === e.pointerId) gesteAbbrechen(); });
seitenEl.addEventListener('pointerleave', () => { if (cursorSeite && !geste) { liveCtx(seiteAus(cursorSeite)); cursorSeite = null; } });
bereich.addEventListener('touchstart', (e) => { if ([...e.touches].some((t) => t.touchType === 'stylus')) e.preventDefault(); }, { passive: false });

function gesteStarten(e, s, abbild, imZf) {
  e.preventDefault();
  menueZu(); popoverZu();
  const [x, y] = abbild(e);
  const w = ws.werkzeug;
  if (w === 'text') { if (!imZf) textAnlegen(s, x, y); return; }
  if (w === 'elemente' || w === 'bild' || w === 'zoomfenster') return;
  textFertig();
  if (w !== 'lasso') auswahlAufheben();
  const druck = e.pointerType === 'pen' ? (e.pressure || .5) : .5;
  geste = { id: e.pointerId, seite: s, werkzeug: w, typ: e.pointerType, abbild, imZf, punkte: [x, y, druck], start: [x, y], weg: [], neu: [], glatt: [x, y], letzterX: x };
  if (w === 'lasso') { auswahlAufheben(); geste.poly = [[x, y]]; }
  if (w === 'radierer') { geste.elementeVorher = s.elemente.slice(); radieren(x, y); }
  haltenPruefen();
  zeichneGeste();
}

function gesteBewegen(e) {
  if (!geste || e.pointerId !== geste.id) return;
  const liste = e.getCoalescedEvents?.() || [];
  for (const ev of (liste.length ? liste : [e])) punktHinzu(ev);
  zeichneGeste();
}

function punktHinzu(ev) {
  const g = geste;
  const [rx, ry] = g.abbild(ev);
  g.letzterX = rx;
  if (g.werkzeug === 'radierer') { radieren(rx, ry); g.cursor = [rx, ry]; return; }
  if (g.werkzeug === 'lasso') { g.poly.push([rx, ry]); return; }
  if (g.werkzeug === 'form' && ws.form.art !== 'auto') { g.ende = [rx, ry]; return; }
  if (g.form) return; // schon zur Form geworden ("Zeichnen und halten")
  const glaett = g.typ === 'pen' ? .6 : .45;
  const x = g.glatt[0] + (rx - g.glatt[0]) * glaett, y = g.glatt[1] + (ry - g.glatt[1]) * glaett;
  g.glatt = [x, y];
  const p = g.punkte, n = p.length;
  if (Math.hypot(x - p[n - 3], y - p[n - 2]) < .5 / z.zoom) return;
  const druck = g.typ === 'pen' ? (ev.pressure || .5) : .5;
  if (g.werkzeug === 'marker' && ws.marker.gerade) { g.punkte = [g.start[0], g.start[1], .5, x, y, .5]; }
  else p.push(x, y, druck);
  haltenPruefen();
}

// "Zeichnen und halten": kurz stillhalten am Ende macht aus der Linie eine saubere Form
function haltenPruefen() {
  const g = geste;
  if (!g || g.form || !((g.werkzeug === 'stift' && ws.stift.halten) || (g.werkzeug === 'form' && ws.form.art === 'auto'))) return;
  clearTimeout(g.halten);
  g.halten = setTimeout(() => {
    if (geste !== g || g.punkte.length < 18) return;
    const o = g.werkzeug === 'form' ? ws.form : ws.stift;
    const f = formErkennen(g.punkte, o.farben[o.farbe], o.breiten[o.breite]);
    if (f) { if (g.werkzeug === 'form' && ws.form.fuellung && f.art !== 'linie') f.fuellung = ws.form.fuellung; g.form = f; zeichneGeste(); }
  }, 550);
}

function strichAusGeste(g) {
  const w = g.werkzeug, o = ws[w];
  const el = { typ: 'strich', werkzeug: w === 'marker' ? 'marker' : 'stift', farbe: o.farben[o.farbe], breite: o.breiten[o.breite], punkte: g.punkte };
  if (w === 'stift') Object.assign(el, { stift: o.stift, schaerfe: o.schaerfe, empf: o.empf });
  return el;
}
function formAusGeste(g) {
  const [x1, y1] = g.start, [x2, y2] = g.ende || g.start, o = ws.form;
  const farbe = o.farben[o.farbe], breite = o.breiten[o.breite], fuellung = o.fuellung;
  const l = Math.min(x1, x2), r = Math.max(x1, x2), t = Math.min(y1, y2), u = Math.max(y1, y2);
  if (o.art === 'rechteck') return { typ: 'form', art: 'polygon', ecken: [[l, t], [r, t], [r, u], [l, u]], farbe, breite, fuellung };
  if (o.art === 'dreieck') return { typ: 'form', art: 'polygon', ecken: [[(l + r) / 2, t], [r, u], [l, u]], farbe, breite, fuellung };
  if (o.art === 'ellipse') return { typ: 'form', art: 'ellipse', cx: (l + r) / 2, cy: (t + u) / 2, rx: (r - l) / 2, ry: (u - t) / 2, winkel: 0, farbe, breite, fuellung };
  return { typ: 'form', art: o.art, x1, y1, x2, y2, farbe, breite, fuellung: null };
}

let laserSpuren = [];
function zeichneGeste() {
  if (!geste || geste._raf) return;
  geste._raf = requestAnimationFrame(() => {
    if (!geste) return;
    geste._raf = 0;
    const g = geste, c = liveCtx(g.seite);
    let vorschau = null;
    if (g.form) vorschau = g.form;
    else if (g.werkzeug === 'stift' || g.werkzeug === 'marker' || (g.werkzeug === 'form' && ws.form.art === 'auto')) vorschau = strichAusGeste(g.werkzeug === 'form' ? { ...g, werkzeug: 'stift' } : g);
    else if (g.werkzeug === 'form' && g.ende) vorschau = formAusGeste(g);
    if (g.werkzeug === 'form' && !g.form && ws.form.art === 'auto' && vorschau) Object.assign(vorschau, { farbe: aktFarbe('form'), breite: aktBreite('form') });
    if (vorschau) { zeichneElement(c, vorschau); if (g.imZf) zfRendern(vorschau); }
    if (g.werkzeug === 'lasso') {
      c.save(); c.setLineDash([5 / z.zoom, 4 / z.zoom]); c.strokeStyle = '#4c93ff'; c.lineWidth = 1.4 / z.zoom; c.fillStyle = 'rgba(76,147,255,.07)';
      c.beginPath(); g.poly.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); c.stroke(); c.restore();
    }
    if (g.werkzeug === 'radierer' && g.cursor) radiererKreis(c, ...g.cursor);
    if (g.werkzeug === 'laser') laserMalen(c, g.seite, g.punkte);
  });
}

function laserMalen(c, s, aktuell) {
  const jetzt = performance.now();
  laserSpuren = laserSpuren.filter((sp) => jetzt - sp.ende < 900);
  const alle = [...laserSpuren.filter((sp) => sp.seite === s).map((sp) => ({ p: sp.punkte, a: 1 - (jetzt - sp.ende) / 900 })), ...(aktuell ? [{ p: aktuell, a: 1 }] : [])];
  for (const { p, a } of alle) {
    c.save(); c.globalAlpha = Math.max(0, a); c.lineCap = 'round'; c.lineJoin = 'round';
    c.shadowColor = ws.laser.farbe; c.shadowBlur = 12; c.strokeStyle = ws.laser.farbe; c.lineWidth = 3.2 / Math.sqrt(z.zoom);
    c.beginPath(); for (let i = 0; i < p.length; i += 3) (i ? c.lineTo(p[i], p[i + 1]) : c.moveTo(p[i], p[i + 1])); c.stroke();
    c.shadowBlur = 0; c.strokeStyle = '#fff'; c.lineWidth = 1.2 / Math.sqrt(z.zoom); c.stroke(); c.restore();
  }
}
function laserAusblenden(s) {
  const schritt = () => {
    if (geste?.werkzeug === 'laser') return;
    const c = liveCtx(s); laserMalen(c, s, null);
    if (laserSpuren.some((sp) => sp.seite === s)) requestAnimationFrame(schritt);
  };
  requestAnimationFrame(schritt);
}

function radiererKreis(c, x, y) {
  const r = ws.radierer.breiten[ws.radierer.breite] / 2;
  c.save(); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1 / z.zoom; c.fillStyle = 'rgba(255,255,255,.4)';
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke(); c.restore();
}
let cursorSeite = null;
function radiererCursor(e) {
  const el = e.target.closest('.seite');
  if (cursorSeite && cursorSeite !== el) liveCtx(seiteAus(cursorSeite));
  cursorSeite = el;
  if (!el) return;
  const s = seiteAus(el);
  radiererKreis(liveCtx(s), ...seitePunkt(s, e));
}

function radieren(x, y) {
  const g = geste, s = g.seite, o = ws.radierer, r = o.breiten[o.breite] / 2;
  const passt = (el) => !el._versteckt && (!o.nurMarker || (el.typ === 'strich' && el.werkzeug === 'marker'));
  let geaendert = false;
  for (const el of [...s.elemente]) {
    if (!passt(el)) continue;
    if (o.modus === 'praezision' && el.typ === 'strich') {
      const teile = teilRadieren(el, x, y, r);
      if (!teile) continue;
      const i = s.elemente.indexOf(el);
      s.elemente.splice(i, 1, ...teile);
      geaendert = true;
    } else if (trifft(el, x, y, r)) {
      s.elemente.splice(s.elemente.indexOf(el), 1);
      geaendert = true;
    }
  }
  if (geaendert) { g.radiert = true; tinteRendern(s); }
}

function gesteEnde(e) {
  if (!geste || e.pointerId !== geste.id) return null;
  const g = geste; geste = null;
  cancelAnimationFrame(g._raf); clearTimeout(g.halten);
  const s = g.seite;
  liveCtx(s);
  if (g.werkzeug === 'laser') { laserSpuren.push({ seite: s, punkte: g.punkte, ende: performance.now() }); laserAusblenden(s); return g; }
  let neu = null;
  if (g.form) neu = g.form;
  else if (g.werkzeug === 'stift' || g.werkzeug === 'marker') neu = strichAusGeste(g);
  else if (g.werkzeug === 'form' && ws.form.art === 'auto') {
    neu = formErkennen(g.punkte, aktFarbe('form'), aktBreite('form'));
    if (neu && ws.form.fuellung && neu.art !== 'linie') neu.fuellung = ws.form.fuellung;
    if (!neu) hinweis('Form nicht erkannt – zeichne sie etwas deutlicher.');
  } else if (g.werkzeug === 'form' && g.ende) { neu = formAusGeste(g); if (Math.hypot(g.ende[0] - g.start[0], g.ende[1] - g.start[1]) < 3) neu = null; }
  if (neu) {
    if (neu.punkte) neu.punkte = neu.punkte.map((v) => Math.round(v * 100) / 100);
    s.elemente.push(neu);
    if (neu.typ === 'strich' && neu.werkzeug !== 'marker') { const d = z.dom.get(s.id), f = d.tinte.width / s.breite, t = d.tinte.getContext('2d'); t.setTransform(f, 0, 0, f, 0, 0); zeichneElement(t, neu); zoomfensterAktualisieren(); }
    else tinteRendern(s);
    aktion({ typ: 'hinzu', seite: s, elemente: [neu] });
    seiteGeaendert(s);
  } else if (g.werkzeug === 'radierer' && g.radiert) {
    aktion({ typ: 'tausch', seite: s, vorher: g.elementeVorher, nachher: s.elemente.slice() });
    seiteGeaendert(s);
    if (ws.radierer.zurueck && vorherWerkzeug) { ws.werkzeug = vorherWerkzeug; merken(); werkzeugleisteZeigen(); }
  } else if (g.werkzeug === 'lasso' && g.poly.length > 3) {
    const f = ws.lasso.filter;
    const gewaehlt = s.elemente.filter((el) => {
      const art = el.typ === 'strich' ? (el.werkzeug === 'marker' ? 'marker' : 'strich') : el.typ;
      return f[art] !== false && imLasso(el, g.poly);
    });
    if (gewaehlt.length) auswahlSetzen(s, gewaehlt);
  }
  return g;
}
function gesteAbbrechen() {
  if (!geste) return;
  const g = geste; geste = null;
  clearTimeout(g.halten);
  liveCtx(g.seite);
  if (g.elementeVorher && g.radiert) { g.seite.elemente = g.elementeVorher; tinteRendern(g.seite); }
}

/* ---------- Zoomen ---------- */

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
  neu = Math.max(.4, Math.min(6, neu));
  if (Math.abs(neu - z.zoom) < .001) return;
  textFertig();
  const r = bereich.getBoundingClientRect();
  const px = cx - r.left + bereich.scrollLeft, py = cy - r.top + bereich.scrollTop, f = neu / z.zoom;
  z.zoom = neu;
  const m = massstab();
  for (const s of z.seiten) { const d = z.dom.get(s.id); d.el.style.width = s.breite * m + 'px'; d.el.style.height = s.hoehe * m + 'px'; }
  bereich.scrollLeft = px * f - (cx - r.left); bereich.scrollTop = py * f - (cy - r.top);
  auswahlPositionieren(); zoomfensterAktualisieren();
  clearTimeout(zoomTimer);
  if (sofort) zoomTimer = setTimeout(zoomFertig, 180);
}
function zoomFertig() { renderVersion++; sichtbareRendern(); }

/* ================= Auswahl (Lasso) ================= */

function auswahlSetzen(s, elemente) {
  auswahlAufheben();
  z.auswahl = { seite: s, elemente };
  const d = z.dom.get(s.id);
  const box = document.createElement('div');
  box.className = 'auswahl';
  box.innerHTML = `<button class="weg" title="Löschen">${I.x}</button><div class="griff dreh" title="Drehen"></div><div class="griff se" title="Größe ändern"></div>`;
  const m = document.createElement('div');
  m.className = 'auswahl-menue';
  const nurBild = elemente.length === 1 && elemente[0].typ === 'bild';
  const nurText = elemente.length === 1 && elemente[0].typ === 'text';
  const mitForm = elemente.some((e) => e.typ === 'form' && e.art !== 'linie' && e.art !== 'pfeil');
  m.innerHTML = [
    nurText && '<button data-a="bearbeiten">Bearbeiten</button>',
    '<button data-a="ausschneiden">Ausschneiden</button>', '<button data-a="kopieren">Kopieren</button>', '<button data-a="duplizieren">Duplizieren</button>', '<button data-a="loeschen">Löschen</button>',
    !nurBild && '<button data-a="farbe" data-popover-anker>Farbe</button>',
    mitForm && '<button data-a="fuellung" data-popover-anker>Füllung</button>',
    nurBild && '<button data-a="zuschneiden">Zuschneiden</button>', nurBild && '<button data-a="freistellen">Freistellen</button>', nurBild && '<button data-a="sticker" data-popover-anker>Sticker</button>',
    '<button data-a="element">Als Element</button>', '<button data-a="vorne">Nach vorne</button>', '<button data-a="hinten">Nach hinten</button>',
  ].filter(Boolean).join('');
  d.el.append(box, m);
  z.auswahl.box = box; z.auswahl.menue = m;
  auswahlPositionieren();
  box.addEventListener('pointerdown', auswahlZiehen);
  box.querySelector('.weg').addEventListener('click', (e) => { e.stopPropagation(); auswahlLoeschen(); });
  m.addEventListener('pointerdown', (e) => e.stopPropagation());
  m.addEventListener('click', (e) => auswahlBefehl(e.target.closest('[data-a]')));
  if (elemente.some((e) => e.typ === 'text')) textleisteZeigen($('#schnell'));
}

async function auswahlBefehl(b) {
  const a = b?.dataset.a; if (!a) return;
  const aw = z.auswahl, s = aw.seite;
  if (a === 'kopieren') { kopieren(); hinweis('Kopiert'); }
  if (a === 'duplizieren') { kopieren(); einfuegen(14); }
  if (a === 'ausschneiden') { kopieren(); auswahlLoeschen(); }
  if (a === 'loeschen') auswahlLoeschen();
  if (a === 'bearbeiten') { const el = aw.elemente[0]; auswahlAufheben(); textAnlegen(s, el.x, el.y, el); }
  if (a === 'farbe') {
    const erste = aw.elemente.find((e) => e.farbe || e.absaetze);
    farbwaehler(b, { titel: 'Farbe', farbe: erste?.farbe || erste?.absaetze?.[0]?.[0]?.c, gewaehlt: (f) => auswahlEinfaerben(f) });
  }
  if (a === 'fuellung') farbwaehler(b, { titel: 'Füllfarbe', farbe: aw.elemente.find((e) => e.typ === 'form')?.fuellung, mitKeine: true, gewaehlt: (f) => auswahlFuellen(f) });
  if (a === 'element') alsElementSpeichern(aw.elemente);
  if (a === 'vorne' || a === 'hinten') {
    const vorher = s.elemente.slice();
    const rest = s.elemente.filter((e) => !aw.elemente.includes(e));
    s.elemente = a === 'vorne' ? [...rest, ...aw.elemente] : [...aw.elemente, ...rest];
    aktion({ typ: 'tausch', seite: s, vorher, nachher: s.elemente.slice() });
    tinteRendern(s); seiteGeaendert(s);
  }
  if (a === 'zuschneiden') zuschneiden(aw.elemente[0], s);
  if (a === 'freistellen') bildBearbeiten(aw.elemente[0], s, (blob) => hintergrundEntfernen(blob), 'Hintergrund wird entfernt …');
  if (a === 'sticker') {
    const p = popover(`<h3>Sticker-Effekt</h3><div class="liste-knoepfe"><button data-e="rand">Weißer Rand</button><button data-e="glanz">Glänzend</button><button data-e="schatten">Schatten</button><button data-e="freistellen">Nur freistellen</button></div>`, b);
    p.onclick = (ev) => {
      const art = ev.target.closest('[data-e]')?.dataset.e; if (!art) return;
      popoverZu();
      const el = aw.elemente[0];
      bildBearbeiten(el, s, async (blob) => stickerEffekt(art === 'freistellen' ? await hintergrundEntfernen(blob) : await hintergrundEntfernen(blob), art === 'freistellen' ? 'keiner' : art), 'Sticker wird erstellt …');
    };
  }
}

function auswahlRahmen() {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const el of z.auswahl.elemente) { const r = rahmen(el); x1 = Math.min(x1, r.x1); y1 = Math.min(y1, r.y1); x2 = Math.max(x2, r.x2); y2 = Math.max(y2, r.y2); }
  return { x1, y1, x2, y2 };
}
function auswahlPositionieren() {
  if (!z.auswahl) return;
  const r = auswahlRahmen(), m = massstab(), p = 6;
  Object.assign(z.auswahl.box.style, { left: r.x1 * m - p + 'px', top: r.y1 * m - p + 'px', width: (r.x2 - r.x1) * m + 2 * p + 'px', height: (r.y2 - r.y1) * m + 2 * p + 'px' });
  Object.assign(z.auswahl.menue.style, { left: ((r.x1 + r.x2) / 2) * m + 'px', top: Math.max(46, r.y1 * m - 44) + 'px' });
}
function auswahlAufheben() {
  if (!z.auswahl) return;
  z.auswahl.box.remove(); z.auswahl.menue.remove();
  z.auswahl = null;
  if (ws.werkzeug !== 'text') werkzeugleisteZeigen();
}
function auswahlZiehen(e) {
  if (e.target.closest('.weg')) return;
  e.stopPropagation(); e.preventDefault();
  const a = z.auswahl, s = a.seite, box = a.box;
  try { box.setPointerCapture(e.pointerId); } catch {}
  const modus = e.target.classList.contains('se') ? 'groesse' : e.target.classList.contains('dreh') ? 'drehen' : 'bewegen';
  const vorher = a.elemente.map(kopie);
  const start = seitePunkt(s, e), r0 = auswahlRahmen();
  const mitte = [(r0.x1 + r0.x2) / 2, (r0.y1 + r0.y2) / 2];
  const w0 = Math.atan2(start[1] - mitte[1], start[0] - mitte[0]);
  let letzte = start;
  const zurueck = () => a.elemente.forEach((el, i) => { for (const k of Object.keys(el)) delete el[k]; Object.assign(el, kopie(vorher[i])); rahmenVergessen(el); });
  const bewegen = (ev) => {
    const p = seitePunkt(s, ev);
    if (modus === 'groesse') {
      const bw = r0.x2 - r0.x1 || 1, bh = r0.y2 - r0.y1 || 1;
      const k = Math.max(.08, Math.min(30, Math.max((bw + p[0] - start[0]) / bw, (bh + p[1] - start[1]) / bh)));
      zurueck(); a.elemente.forEach((el) => skalieren(el, k, k, r0.x1, r0.y1));
    } else if (modus === 'drehen') {
      let w = Math.atan2(p[1] - mitte[1], p[0] - mitte[0]) - w0;
      const grad = (w * 180) / Math.PI, gerade = Math.round(grad / 90) * 90;
      if (Math.abs(grad - gerade) < 4) w = (gerade * Math.PI) / 180;
      zurueck(); a.elemente.forEach((el) => drehen(el, w, mitte[0], mitte[1]));
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
  const a = z.auswahl; if (!a) return;
  const paare = a.elemente.map((el) => { const v = kopie(el); fn(el); rahmenVergessen(el); return [el, v, kopie(el)]; });
  aktion({ typ: 'aendern', seite: a.seite, paare });
  tinteRendern(a.seite); seiteGeaendert(a.seite); auswahlPositionieren();
}
const auswahlEinfaerben = (f) => { if (z.auswahl && f) auswahlAendern((el) => einfaerben(el, f)); };
const auswahlFuellen = (f) => { if (z.auswahl) auswahlAendern((el) => { if (el.typ === 'form' && el.art !== 'linie' && el.art !== 'pfeil') el.fuellung = f; }); };
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
  elementeEinfuegen(s, neu);
}
function elementeEinfuegen(s, neu) {
  s.elemente.push(...neu);
  aktion({ typ: 'hinzu', seite: s, elemente: neu });
  tinteRendern(s); seiteGeaendert(s);
  ws.werkzeug = 'lasso'; merken(); werkzeugleisteZeigen();
  auswahlSetzen(s, neu);
}

/* ================= Bilder ================= */

async function bildEinfuegen(blob, s = z.seiten[z.aktuell], pos) {
  const dateiId = id();
  await db.speichern('dateien', { id: dateiId, blob, typ: blob.type || 'image/png' });
  await bildVorbereiten(dateiId);
  const img = bildHolen(dateiId);
  const b = Math.min(s.breite * .55, img.naturalWidth || 300);
  const h = b * ((img.naturalHeight || 1) / (img.naturalWidth || 1));
  const x = pos ? pos[0] - b / 2 : (s.breite - b) / 2, y = pos ? pos[1] - h / 2 : Math.max(40, (s.hoehe - h) / 3);
  elementeEinfuegen(s, [{ typ: 'bild', dateiId, x, y, b, h, drehung: 0 }]);
}
$('#datei-bild').onchange = async (e) => { const d = e.target.files[0]; e.target.value = ''; if (d) bildEinfuegen(d); };

async function ausZwischenablage() {
  try {
    for (const item of await navigator.clipboard.read()) {
      const typ = item.types.find((t) => t.startsWith('image/'));
      if (typ) return bildEinfuegen(await item.getType(typ));
    }
    hinweis('In der Zwischenablage ist kein Bild.');
  } catch { hinweis('Zugriff auf die Zwischenablage nicht erlaubt – nutze Strg+V bzw. „Einsetzen“.'); }
}
document.addEventListener('paste', async (e) => {
  if (!z.heft || $('#editor').hidden || textBearbeitet() || e.target.closest?.('input, textarea')) return;
  const bild = await bildAusDaten(e.clipboardData);
  if (bild) { e.preventDefault(); bildEinfuegen(bild); }
  else if (z.ablage) einfuegen(z.auswahl ? 14 : 0);
});
bereich.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
bereich.addEventListener('drop', async (e) => {
  e.preventDefault();
  const seiteEl = e.target.closest('.seite');
  const s = seiteEl ? seiteAus(seiteEl) : z.seiten[z.aktuell];
  const pos = seiteEl ? seitePunkt(s, e) : null;
  const pdf = [...(e.dataTransfer.files || [])].find((f) => f.type === 'application/pdf');
  if (pdf) return hinweis('PDFs bitte über die Bibliothek („Neu …“ → Importieren) öffnen.');
  const bild = await bildAusDaten(e.dataTransfer);
  if (bild) bildEinfuegen(bild, s, pos);
  else hinweis('Dieses Bild lässt sich nicht übernehmen – speichere es und füge es dann ein.');
});

async function bildBearbeiten(el, s, fn, text) {
  const d = await db.holen('dateien', el.dateiId);
  if (!d) return;
  hinweis(text, 30000);
  try {
    const neu = await fn(d.blob);
    const dateiId = id();
    await db.speichern('dateien', { id: dateiId, blob: neu, typ: 'image/png' });
    await bildVorbereiten(dateiId);
    const img = bildHolen(dateiId);
    const vorher = kopie(el);
    el.dateiId = dateiId; delete el.zuschnitt;
    el.h = el.b * (img.naturalHeight / img.naturalWidth);
    rahmenVergessen(el);
    aktion({ typ: 'aendern', seite: s, paare: [[el, vorher, kopie(el)]] });
    tinteRendern(s); seiteGeaendert(s); auswahlSetzen(s, [el]);
    $('#hinweis').hidden = true;
  } catch (err) { console.error(err); hinweis('Hat nicht geklappt.'); }
}

function zuschneiden(el, s) {
  if (el.drehung) return hinweis('Zum Zuschneiden das Bild erst gerade drehen.');
  auswahlAufheben();
  const d = z.dom.get(s.id), m = massstab();
  const z0 = el.zuschnitt || { x: 0, y: 0, w: 1, h: 1 };
  // Ganzes Originalbild in Seitenkoordinaten
  const gb = el.b / z0.w, gh = el.h / z0.h, gx = el.x - z0.x * gb, gy = el.y - z0.y * gh;
  let r = { x: el.x, y: el.y, b: el.b, h: el.h };
  const vorher = kopie(el);
  el._versteckt = true; tinteRendern(s);
  // Original blass zeigen
  const vorschau = document.createElement('img');
  vorschau.src = bildHolen(el.dateiId).src;
  Object.assign(vorschau.style, { position: 'absolute', zIndex: 4, left: gx * m + 'px', top: gy * m + 'px', width: gb * m + 'px', height: gh * m + 'px', opacity: .55, pointerEvents: 'none' });
  const rahmenEl = document.createElement('div');
  rahmenEl.className = 'zuschnitt';
  rahmenEl.innerHTML = '<i class="griff" data-g="nw"></i><i class="griff" data-g="ne"></i><i class="griff" data-g="sw"></i><i class="griff" data-g="se"></i>';
  rahmenEl.style.background = `url("${vorschau.src}") ${(gx - r.x) * m}px ${(gy - r.y) * m}px / ${gb * m}px ${gh * m}px no-repeat`;
  const knoepfe = document.createElement('div');
  knoepfe.className = 'zuschnitt-knoepfe';
  knoepfe.innerHTML = '<button class="btn" data-z="zurueck">Zurücksetzen</button><button class="btn" data-z="ab">Abbrechen</button><button class="btn haupt" data-z="ok">Fertig</button>';
  d.el.append(vorschau, rahmenEl, knoepfe);
  const zeigen = () => {
    Object.assign(rahmenEl.style, { left: r.x * m + 'px', top: r.y * m + 'px', width: r.b * m + 'px', height: r.h * m + 'px', backgroundPosition: `${(gx - r.x) * m}px ${(gy - r.y) * m}px` });
    Object.assign(knoepfe.style, { left: (r.x + r.b / 2) * m + 'px', top: (r.y + r.h) * m + 14 + 'px' });
  };
  zeigen();
  rahmenEl.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const g = e.target.dataset.g, start = seitePunkt(s, e), r0 = { ...r };
    const bew = (ev) => {
      const [px, py] = seitePunkt(s, ev), dx = px - start[0], dy = py - start[1];
      if (!g) { r.x = Math.max(gx, Math.min(gx + gb - r.b, r0.x + dx)); r.y = Math.max(gy, Math.min(gy + gh - r.h, r0.y + dy)); }
      else {
        let x1 = r0.x, y1 = r0.y, x2 = r0.x + r0.b, y2 = r0.y + r0.h;
        if (g.includes('w')) x1 = Math.max(gx, Math.min(x2 - 10, x1 + dx)); else x2 = Math.min(gx + gb, Math.max(x1 + 10, x2 + dx));
        if (g.includes('n')) y1 = Math.max(gy, Math.min(y2 - 10, y1 + dy)); else y2 = Math.min(gy + gh, Math.max(y1 + 10, y2 + dy));
        r = { x: x1, y: y1, b: x2 - x1, h: y2 - y1 };
      }
      zeigen();
    };
    const los = () => { removeEventListener('pointermove', bew); removeEventListener('pointerup', los); };
    addEventListener('pointermove', bew); addEventListener('pointerup', los);
  });
  knoepfe.addEventListener('click', (e) => {
    const a = e.target.closest('[data-z]')?.dataset.z; if (!a) return;
    if (a === 'zurueck') { r = { x: gx, y: gy, b: gb, h: gh }; return zeigen(); }
    vorschau.remove(); rahmenEl.remove(); knoepfe.remove(); delete el._versteckt;
    if (a === 'ok') {
      el.zuschnitt = { x: (r.x - gx) / gb, y: (r.y - gy) / gh, w: r.b / gb, h: r.h / gh };
      Object.assign(el, { x: r.x, y: r.y, b: r.b, h: r.h });
      rahmenVergessen(el);
      aktion({ typ: 'aendern', seite: s, paare: [[el, vorher, kopie(el)]] });
      seiteGeaendert(s);
    }
    tinteRendern(s); auswahlSetzen(s, [el]);
  });
}

/* ================= Seitenleiste ================= */

let leisteFilter = 'alle';
function leisteAufbauen() {
  const liste = z.seiten.map((s, i) => [s, i]).filter(([s]) => leisteFilter === 'alle' || s.lesezeichen);
  leiste.innerHTML = `<div class="leiste-tabs"><button data-f="alle" class="${leisteFilter === 'alle' ? 'an' : ''}">Alle Seiten</button><button data-f="lz" class="${leisteFilter === 'lz' ? 'an' : ''}">Lesezeichen</button></div>`
    + liste.map(([s, i]) => `<div class="mini-seite ${i === z.aktuell ? 'an' : ''}" data-i="${i}">${s.lesezeichen ? `<span class="lz">${I.lesezeichenVoll}</span>` : ''}<canvas></canvas>${i + 1}</div>`).join('')
    + (leisteFilter === 'alle' ? `<button class="btn" data-neu style="margin:0 auto">＋ Seite</button>` : (liste.length ? '' : '<p style="font-size:12.5px;color:var(--text-2);text-align:center">Keine Lesezeichen. Tippe oben auf das Lesezeichen-Symbol.</p>'));
  if (!leiste.hidden) for (const [s] of liste) miniAktualisieren(s);
}
function leisteMarkieren() {
  leiste.querySelectorAll('.mini-seite').forEach((m) => m.classList.toggle('an', +m.dataset.i === z.aktuell));
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
    const f = (146 * Math.min(devicePixelRatio, 2)) / s.breite;
    c.width = Math.round(s.breite * f); c.height = Math.round(s.hoehe * f);
    const ctx = c.getContext('2d');
    ctx.setTransform(f, 0, 0, f, 0, 0);
    zeichnePapier(ctx, s);
    if (s.hintergrund) { const bild = await pdfSeiteRendern(s.hintergrund.dateiId, s.hintergrund.seite, f); if (bild) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bild, 0, 0, c.width, c.height); ctx.setTransform(f, 0, 0, f, 0, 0); } }
    zeichneAlle(ctx, s.elemente);
  }, 250));
}
leiste.addEventListener('click', (e) => {
  const f = e.target.closest('[data-f]'); if (f) { leisteFilter = f.dataset.f; return leisteAufbauen(); }
  if (e.target.closest('[data-neu]')) return seiteHinzu(z.seiten.length - 1);
  const m = e.target.closest('.mini-seite'); if (m) zuSeite(+m.dataset.i);
});
leiste.addEventListener('contextmenu', (e) => { const m = e.target.closest('.mini-seite'); if (!m) return; e.preventDefault(); seitenMenue(+m.dataset.i, m); });
let leisteDruck;
leiste.addEventListener('pointerdown', (e) => { const m = e.target.closest('.mini-seite'); if (!m) return; leisteDruck = setTimeout(() => seitenMenue(+m.dataset.i, m), 550); });
leiste.addEventListener('pointerup', () => clearTimeout(leisteDruck));
leiste.addEventListener('pointercancel', () => clearTimeout(leisteDruck));

function zuSeite(i, sanft = true) {
  const d = z.dom.get(z.seiten[i]?.id); if (!d) return;
  bereich.scrollTo({ top: d.el.offsetTop - 14, behavior: sanft ? 'smooth' : 'auto' });
  if (innerWidth < 820) leiste.hidden = true;
}

/* ================= Seiten verwalten ================= */

async function seiteHinzu(nach, vorlage, papier) {
  const vb = z.seiten[nach] || z.seiten[0];
  const s = neueSeite(z.heft.id, vorlage || (vb?.hintergrund ? 'leer' : vb?.vorlage) || 'liniert', papier || vb?.papier || 'weiss', { breite: vb?.breite, hoehe: vb?.hoehe });
  z.seiten.splice(nach + 1, 0, s);
  z.heft.seiten = z.seiten.map((x) => x.id);
  await db.speichern('seiten', s); await db.speichern('hefte', z.heft);
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
  knoepfeAktualisieren(); aufbauen();
}
async function seiteVerschieben(i, richtung) {
  const j = i + richtung;
  if (j < 0 || j >= z.seiten.length) return;
  [z.seiten[i], z.seiten[j]] = [z.seiten[j], z.seiten[i]];
  z.heft.seiten = z.seiten.map((x) => x.id);
  await db.speichern('hefte', z.heft);
  aufbauen(); requestAnimationFrame(() => zuSeite(j));
}
async function lesezeichenUmschalten(i = z.aktuell) {
  const s = z.seiten[i];
  s.lesezeichen = !s.lesezeichen;
  await db.speichern('seiten', s);
  const d = z.dom.get(s.id);
  d.el.querySelector('.lz-band')?.remove();
  if (s.lesezeichen) d.el.insertAdjacentHTML('beforeend', '<i class="lz-band"></i>');
  aktuelleSeiteBestimmen(); leisteAufbauen();
}
function seitenMenue(i, anker) {
  const m = menue(`<div class="titel">Seite ${i + 1}</div>
    <button data-a="davor">Neue Seite davor ${I.seitePlus}</button>
    <button data-a="danach">Neue Seite danach ${I.seitePlus}</button>
    <button data-a="vorlage">Vorlage ändern ${I.dokument}</button>
    <button data-a="lz">${z.seiten[i].lesezeichen ? 'Lesezeichen entfernen' : 'Lesezeichen setzen'} ${I.lesezeichen}</button>
    <button data-a="duplizieren">Duplizieren ${I.kopie}</button>
    <button data-a="hoch" ${i === 0 ? 'disabled' : ''}>Nach oben</button>
    <button data-a="runter" ${i === z.seiten.length - 1 ? 'disabled' : ''}>Nach unten</button>
    <hr><button class="gefahr" data-a="loeschen">Seite löschen ${I.muell}</button>`, anker);
  m.onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; menueZu();
    if (a === 'davor') seiteHinzu(i - 1);
    if (a === 'danach') seiteHinzu(i);
    if (a === 'vorlage') vorlageAendern(i);
    if (a === 'lz') lesezeichenUmschalten(i);
    if (a === 'duplizieren') seiteDuplizieren(i);
    if (a === 'hoch') seiteVerschieben(i, -1);
    if (a === 'runter') seiteVerschieben(i, 1);
    if (a === 'loeschen') seiteLoeschen(i);
  };
}
async function vorlageAendern(i) {
  const s = z.seiten[i];
  const w = await papierDialog({ titel: 'Vorlage ändern', vorlage: s.vorlage, papier: s.papier, alleMoeglich: true });
  if (!w) return;
  for (const x of w.alle ? z.seiten : [s]) { x.vorlage = w.vorlage; if (!x.hintergrund) x.papier = w.papier; await db.speichern('seiten', x); }
  groessen(); leisteAufbauen();
}

/* ================= Kopfzeilen-Befehle ================= */

$('#editor').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-b]'); if (!b) return;
  const c = b.dataset.b;
  if (c === 'schliessen') schliessen();
  if (c === 'seitenleiste') { leiste.hidden = !leiste.hidden; localStorage.setItem('heft.leiste', leiste.hidden ? '0' : '1'); if (!leiste.hidden) { leisteAufbauen(); leisteMarkieren(); } const alt = z.basis; basisBerechnen(); if (Math.abs(alt - z.basis) > .001) groessen(); }
  if (c === 'rueck') rueckgaengig();
  if (c === 'vor') wiederholen();
  if (c === 'lesezeichen') lesezeichenUmschalten();
  if (c === 'suche') suchPopover(b);
  if (c === 'teilen') teilenMenue(b);
  if (c === 'seite') {
    const m = menue(`<button data-a="danach">Nach aktueller Seite ${I.seitePlus}</button><button data-a="davor">Vor aktueller Seite ${I.seitePlus}</button><button data-a="ende">Als letzte Seite ${I.seitePlus}</button><hr><button data-a="vorlage">Mit anderer Vorlage … ${I.dokument}</button>`, b, { rechts: true });
    m.onclick = async (ev) => {
      const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return; menueZu();
      if (a === 'danach') seiteHinzu(z.aktuell);
      if (a === 'davor') seiteHinzu(z.aktuell - 1);
      if (a === 'ende') seiteHinzu(z.seiten.length - 1);
      if (a === 'vorlage') { const w = await papierDialog({ titel: 'Neue Seite', vorlage: z.seiten[z.aktuell].vorlage, papier: z.seiten[z.aktuell].papier }); if (w) seiteHinzu(z.aktuell, w.vorlage, w.papier); }
    };
  }
  if (c === 'mehr') mehrMenue(b);
});
$('#heft-titel').addEventListener('click', (e) => {
  const m = menue(`<button data-a="umbenennen">Umbenennen ${I.stift}</button><button data-a="export">Als PDF exportieren ${I.teilen}</button><button data-a="vorlage">Vorlage für alle Seiten ${I.dokument}</button>`, e.currentTarget);
  m.onclick = async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return; menueZu();
    if (a === 'umbenennen') { const n = await eingabe('Umbenennen', z.heft.titel); if (n) { z.heft.titel = n; $('#heft-titel span').textContent = n; await db.speichern('hefte', z.heft); tabsZeigen(); } }
    if (a === 'export') exportieren();
    if (a === 'vorlage') vorlageAendern(z.aktuell);
  };
});

function teilenMenue(anker) {
  const m = menue(`<button data-a="pdf">Als PDF exportieren ${I.dokument}</button><button data-a="seite">Aktuelle Seite als PDF ${I.dokument}</button><button data-a="bild">Aktuelle Seite als Bild ${I.bild}</button>`, anker);
  m.onclick = (ev) => { const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return; menueZu(); if (a === 'pdf') exportieren(); if (a === 'seite') exportieren([z.seiten[z.aktuell]]); if (a === 'bild') seiteAlsBild(); };
}

function mehrMenue(anker) {
  const i = z.aktuell;
  const m = menue(`<div class="titel">Seite ${i + 1} von ${z.seiten.length}</div>
    <button data-a="vorlage">Vorlage ändern ${I.dokument}</button>
    <button data-a="duplizieren">Seite duplizieren ${I.kopie}</button>
    <button class="gefahr" data-a="loeschen">Seite löschen ${I.muell}</button>
    <hr>
    <button data-a="einfuegen" ${z.ablage ? '' : 'disabled'}>Einsetzen ${I.kopie}</button>
    <div class="titel">Ansicht</div>
    <button data-a="zoom+">Vergrößern <span>${Math.round(z.zoom * 100)} %</span></button>
    <button data-a="zoom-">Verkleinern</button>
    <button data-a="zoom1">Seitenbreite</button>
    <label class="punkt">Nur mit Stift zeichnen <input type="checkbox" data-a="nurstift" ${z.nurStift ? 'checked' : ''}></label>`, anker, { rechts: true });
  m.onclick = (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a || a === 'nurstift') return;
    const r = bereich.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (a.startsWith('zoom')) { zoomen(a === 'zoom+' ? z.zoom * 1.25 : a === 'zoom-' ? z.zoom / 1.25 : 1, cx, cy); m.querySelector('[data-a="zoom+"] span').textContent = Math.round(z.zoom * 100) + ' %'; return; }
    menueZu();
    if (a === 'vorlage') vorlageAendern(i);
    if (a === 'duplizieren') seiteDuplizieren(i);
    if (a === 'loeschen') seiteLoeschen(i);
    if (a === 'einfuegen') einfuegen();
  };
  m.querySelector('[data-a=nurstift]').onchange = (ev) => setzeNurStift(ev.target.checked);
}

// Suche im Dokument (Text in Textfeldern)
function suchPopover(anker) {
  const p = popover(`<h3>Im Dokument suchen</h3><label class="suchfeld" style="height:36px">${I.lupe}<input id="dok-suche" placeholder="Text suchen"></label><div id="dok-treffer"></div>`, anker, { breite: 320 });
  const inp = $('#dok-suche', p);
  setTimeout(() => inp.focus(), 30);
  inp.onkeydown = (e) => e.stopPropagation();
  inp.oninput = () => {
    const q = inp.value.trim().toLowerCase();
    const treffer = [];
    if (q) z.seiten.forEach((s, i) => s.elemente.forEach((el) => { if (el.typ === 'text') { const t = textInhalt(el); const k = t.toLowerCase().indexOf(q); if (k >= 0) treffer.push({ i, el, t, k }); } }));
    $('#dok-treffer', p).innerHTML = treffer.slice(0, 40).map((t, n) => `<div class="treffer" data-n="${n}"><div><b>Seite ${t.i + 1}</b><small>${esc(t.t.slice(Math.max(0, t.k - 30), t.k))}<mark>${esc(t.t.substr(t.k, q.length))}</mark>${esc(t.t.slice(t.k + q.length, t.k + q.length + 40))}</small></div></div>`).join('') || (q ? '<p style="color:var(--text-2);text-align:center;font-size:13px">Nichts gefunden.</p>' : '');
    $('#dok-treffer', p).onclick = (e) => { const d = e.target.closest('[data-n]'); if (!d) return; const t = treffer[+d.dataset.n]; popoverZu(); zuSeite(t.i); setTimeout(() => { ws.werkzeug = 'lasso'; werkzeugleisteZeigen(); auswahlSetzen(z.seiten[t.i], [t.el]); }, 400); };
  };
}

async function exportieren(seiten = z.seiten) {
  await speichernJetzt();
  hinweis('PDF wird erstellt …', 60000);
  try {
    const bytes = await pdfExportieren(z.heft, seiten);
    teilenOderLaden(new File([bytes], dateiname() + '.pdf', { type: 'application/pdf' }));
  } catch (err) { console.error(err); hinweis('Export fehlgeschlagen.'); }
}
async function seiteAlsBild() {
  const s = z.seiten[z.aktuell], f = 3;
  const c = document.createElement('canvas'); c.width = s.breite * f; c.height = s.hoehe * f;
  const ctx = c.getContext('2d'); ctx.setTransform(f, 0, 0, f, 0, 0);
  zeichnePapier(ctx, s);
  if (s.hintergrund) { const b = await pdfSeiteRendern(s.hintergrund.dateiId, s.hintergrund.seite, f); if (b) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(b, 0, 0, c.width, c.height); ctx.setTransform(f, 0, 0, f, 0, 0); } }
  zeichneAlle(ctx, s.elemente);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  teilenOderLaden(new File([blob], `${dateiname()} – Seite ${z.aktuell + 1}.png`, { type: 'image/png' }));
}
const dateiname = () => (z.heft.titel || 'Notizbuch').replace(/[\\/:*?"<>|]/g, '');
async function teilenOderLaden(datei) {
  $('#hinweis').hidden = true;
  if (navigator.canShare?.({ files: [datei] }) && 'ontouchend' in document) { await navigator.share({ files: [datei], title: z.heft.titel }).catch(() => {}); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(datei); a.download = datei.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ================= Änderungen von anderen Geräten ================= */

addEventListener('heft-remote', async function neuLaden(e) {
  if (!z.heft) return;
  const { hefte, seiten } = e.detail;
  if (!hefte.has(z.heft.id) && !z.seiten.some((s) => seiten.has(s.id))) return;
  if (geste || textBearbeitet()) return setTimeout(() => neuLaden(e), 1500);
  await speichernJetzt();
  const heft = await db.holen('hefte', z.heft.id);
  if (!heft) { hinweis('Dieses Heft wurde auf einem anderen Gerät gelöscht.'); return schliessen(); }
  const neu = (await Promise.all(heft.seiten.map((sid) => db.holen('seiten', sid)))).filter(Boolean);
  for (const s of neu) for (const el of s.elemente) { formNormalisieren(el); textNormalisieren(el); if (el.typ === 'bild') await bildVorbereiten(el.dateiId); }
  await schriftenFuer(neu);
  const [oben, links] = [bereich.scrollTop, bereich.scrollLeft];
  auswahlAufheben();
  z.heft = heft; z.seiten = neu; z.rueck = []; z.vor = []; knoepfeAktualisieren();
  $('#heft-titel span').textContent = heft.titel;
  aufbauen();
  bereich.scrollTop = oben; bereich.scrollLeft = links;
});

/* ================= Tastatur ================= */

addEventListener('keydown', (e) => {
  if (!z.heft || $('#editor').hidden || e.target.closest?.('input, textarea, [contenteditable=true]') || !$('#dialog').hidden) return;
  const strg = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (strg && k === 'z' && !e.shiftKey) { e.preventDefault(); rueckgaengig(); }
  else if (strg && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); wiederholen(); }
  else if (strg && k === 'c' && z.auswahl) kopieren();
  else if (strg && k === 'x' && z.auswahl) { kopieren(); auswahlLoeschen(); }
  else if (strg && k === 'd') { e.preventDefault(); kopieren(); einfuegen(14); }
  else if (strg && (k === '+' || k === '=')) { e.preventDefault(); const r = bereich.getBoundingClientRect(); zoomen(z.zoom * 1.25, r.left + r.width / 2, r.top + r.height / 2); }
  else if (strg && k === '-') { e.preventDefault(); const r = bereich.getBoundingClientRect(); zoomen(z.zoom / 1.25, r.left + r.width / 2, r.top + r.height / 2); }
  else if (strg && k === '0') { e.preventDefault(); const r = bereich.getBoundingClientRect(); zoomen(1, r.left + r.width / 2, r.top + r.height / 2); }
  else if ((k === 'delete' || k === 'backspace') && z.auswahl) { e.preventDefault(); auswahlLoeschen(); }
  else if (k === 'escape') { auswahlAufheben(); popoverZu(); }
  else if (!strg && !e.altKey) {
    const w = { p: 'stift', h: 'marker', e: 'radierer', l: 'lasso', s: 'form', t: 'text' }[k];
    if (w) { werkzeugWechsel(w); ws.werkzeug = w; merken(); werkzeugleisteZeigen(); }
  }
});

function werkzeugWechsel(neu) {
  textFertig();
  if (neu !== 'lasso') auswahlAufheben();
  if (neu === 'radierer' && ws.werkzeug !== 'radierer') vorherWerkzeug = ws.werkzeug;
}

/* ================= Schnittstellen für die anderen Module ================= */

Object.assign(api, {
  tinteRendern, seiteGeaendert, aktion, auswahlAufheben, auswahlAendern, auswahlEinfaerben, auswahlFuellen,
  werkzeugleisteZeigen, textleisteZeigen, textEinstellungen, zoomfensterUmschalten, zoomfensterOffen, elementePopover, elementeEinfuegen,
  setzeNurStift, ausZwischenablage, gesteStarten, gesteBewegen, gesteEnde, gesteAbbrechen, zuSeite, alleTinteRendern, werkzeugWechsel,
  groessenNeu: () => { if (!z.heft) return; const alt = z.basis; basisBerechnen(); if (Math.abs(alt - z.basis) > .001) groessen(); },
});
