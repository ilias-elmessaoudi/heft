// Zoom-Fenster (wie GoodNotes): unten vergrößert schreiben, es landet klein im blauen Rahmen auf der Seite.

import { z, api, $, massstab } from './zustand.js';
import { I } from './icons.js';
import { zeichneAlle, zeichneElement } from './zeichnen.js';

const zf = { offen: false, seite: null, x: 40, y: 100, w: 220, rand: 40 };
const fenster = $('#zoomfenster');
const cv = $('#zf-canvas');
let rahmenEl = null;

$('[data-zf=rand]').innerHTML = I.einruecken;
$('[data-zf=zeile]').innerHTML = I.neueZeile;
$('[data-zf=zu]').innerHTML = I.schliessenFenster;

const hoehe = () => zf.w * (cv.clientHeight / Math.max(1, cv.clientWidth));

export const zoomfensterOffen = () => zf.offen;

export function zoomfensterUmschalten() {
  zf.offen = !zf.offen;
  fenster.hidden = !zf.offen;
  if (zf.offen) {
    const s = z.seiten[z.aktuell];
    if (!zf.seite || !z.seiten.includes(zf.seite)) { zf.seite = s; zf.w = s.breite * .42; zf.x = zf.rand; zf.y = Math.min(s.hoehe * .15, 120); }
    if (zf.seite !== s) { zf.seite = s; zf.y = 100; zf.x = zf.rand; }
    requestAnimationFrame(() => { rahmenZeigen(); zfRendern(); api.groessenNeu?.(); });
  } else {
    rahmenEl?.remove(); rahmenEl = null;
    api.groessenNeu?.();
  }
}

function rahmenZeigen() {
  if (!zf.offen || !zf.seite) return;
  const d = z.dom.get(zf.seite.id); if (!d) return;
  if (!rahmenEl || rahmenEl.parentNode !== d.el) {
    rahmenEl?.remove();
    rahmenEl = document.createElement('div');
    rahmenEl.className = 'zf-rahmen';
    d.el.append(rahmenEl);
    rahmenEl.addEventListener('pointerdown', rahmenZiehen);
  }
  const m = massstab();
  Object.assign(rahmenEl.style, { left: zf.x * m + 'px', top: zf.y * m + 'px', width: zf.w * m + 'px', height: hoehe() * m + 'px' });
}
export function zoomfensterAktualisieren() { if (zf.offen) { rahmenZeigen(); zfRendern(); } }

function rahmenZiehen(e) {
  e.preventDefault(); e.stopPropagation();
  const m = massstab(), sx = e.clientX, sy = e.clientY, x0 = zf.x, y0 = zf.y;
  const bew = (ev) => { zf.x = Math.max(0, Math.min(zf.seite.breite - zf.w, x0 + (ev.clientX - sx) / m)); zf.y = Math.max(0, Math.min(zf.seite.hoehe - hoehe(), y0 + (ev.clientY - sy) / m)); rahmenZeigen(); zfRendern(); };
  const los = () => { removeEventListener('pointermove', bew); removeEventListener('pointerup', los); };
  addEventListener('pointermove', bew); addEventListener('pointerup', los);
}

// Beim Antippen einer anderen Seite: Rahmen dorthin
export function zoomfensterSeite(s, x, y) {
  if (!zf.offen) return;
  zf.seite = s;
  zf.x = Math.max(0, Math.min(s.breite - zf.w, x - zf.w / 2));
  zf.y = Math.max(0, Math.min(s.hoehe - hoehe(), y - hoehe() / 2));
  rahmenZeigen(); zfRendern();
}

let gepl = false;
export function zfRendern(geste) {
  if (!zf.offen || !zf.seite) return;
  if (gepl && !geste) return;
  const malen = () => {
    gepl = false;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d');
    const f = W / zf.w;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    // Papier (inkl. PDF) aus der bereits gemalten Seite holen
    const d = z.dom.get(zf.seite.id);
    if (d?.papier.width) {
      const q = d.papier.width / zf.seite.breite;
      ctx.drawImage(d.papier, zf.x * q, zf.y * q, zf.w * q, hoehe() * q, 0, 0, W, H);
    }
    ctx.setTransform(f, 0, 0, f, -zf.x * f, -zf.y * f);
    zeichneAlle(ctx, zf.seite.elemente);
    if (geste) zeichneElement(ctx, geste);
  };
  if (geste) malen(); else { gepl = true; requestAnimationFrame(malen); }
}

// Stift im Zoom-Fenster: Punkte auf die Seite umrechnen
const abbild = (e) => {
  const r = cv.getBoundingClientRect();
  return [zf.x + ((e.clientX - r.left) / r.width) * zf.w, zf.y + ((e.clientY - r.top) / r.height) * hoehe()];
};
cv.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && z.nurStift) return;
  e.preventDefault();
  try { cv.setPointerCapture(e.pointerId); } catch {}
  api.gesteStarten(e, zf.seite, abbild, true);
});
cv.addEventListener('pointermove', (e) => api.gesteBewegen(e));
cv.addEventListener('pointerup', (e) => {
  const g = api.gesteEnde(e);
  // Automatisch weiterrücken, wenn im gestreiften Bereich rechts geschrieben wurde
  if (g && (g.werkzeug === 'stift' || g.werkzeug === 'marker') && g.letzterX > zf.x + zf.w * .84) weiter();
  zfRendern();
});
cv.addEventListener('pointercancel', (e) => api.gesteAbbrechen(e));
cv.addEventListener('touchstart', (e) => { if ([...e.touches].some((t) => t.touchType === 'stylus')) e.preventDefault(); }, { passive: false });

function weiter() {
  zf.x += zf.w * .62;
  if (zf.x + zf.w > zf.seite.breite - 10) neueZeile();
  rahmenZeigen(); zfRendern();
}
function neueZeile() {
  zf.x = zf.rand;
  zf.y += hoehe();
  if (zf.y + hoehe() > zf.seite.hoehe) {
    const i = z.seiten.indexOf(zf.seite);
    if (i < z.seiten.length - 1) { zf.seite = z.seiten[i + 1]; zf.y = 60; api.zuSeite?.(i + 1); }
    else zf.y = zf.seite.hoehe - hoehe();
  }
}
fenster.addEventListener('click', (e) => {
  const a = e.target.closest('[data-zf]')?.dataset.zf; if (!a) return;
  if (a === 'zu') { zoomfensterUmschalten(); api.werkzeugleisteZeigen(); return; }
  if (a === 'rand') { zf.x = zf.rand; }
  if (a === 'zeile') neueZeile();
  rahmenZeigen(); zfRendern();
});

// Höhe des Fensters ziehen
$('.zf-griff').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const sy = e.clientY, h0 = fenster.offsetHeight;
  const bew = (ev) => { fenster.style.height = Math.max(140, Math.min(innerHeight * .7, h0 - (ev.clientY - sy))) + 'px'; rahmenZeigen(); zfRendern(); };
  const los = () => { removeEventListener('pointermove', bew); removeEventListener('pointerup', los); };
  addEventListener('pointermove', bew); addEventListener('pointerup', los);
});
addEventListener('resize', () => zoomfensterAktualisieren());

// Zoom im Fenster: Mausrad/Pinch ändert die Breite des Rahmens
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  zf.w = Math.max(60, Math.min(zf.seite.breite, zf.w * Math.exp(e.deltaY * .002)));
  rahmenZeigen(); zfRendern();
}, { passive: false });
