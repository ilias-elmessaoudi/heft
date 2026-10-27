// Elemente (wie GoodNotes): Sammlungen mit wiederverwendbaren Notizzetteln, Stickern, Deko – eigene und mitgelieferte.

import { db, id } from './db.js';
import { z, api, $, esc } from './zustand.js';
import { I } from './icons.js';
import { zeichneAlle, rahmen, kopie, verschieben, skalieren } from './zeichnen.js';
import { popover, popoverZu } from './werkzeugleiste.js';

// Hilfen für mitgelieferte Elemente
const rechteck = (x, y, b, h, fuellung, farbe = null, breite = 0) => ({ typ: 'form', art: 'polygon', ecken: [[x, y], [x + b, y], [x + b, y + h], [x, y + h]], fuellung, farbe, breite });
const linie = (x1, y1, x2, y2, farbe, breite = .8) => ({ typ: 'form', art: 'linie', x1, y1, x2, y2, farbe, breite, fuellung: null });
const poly = (ecken, fuellung, farbe = null, breite = 0) => ({ typ: 'form', art: 'polygon', ecken, fuellung, farbe, breite });
const stern = (cx, cy, r1, r2, n = 5) => Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? r2 : r1; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const herz = (cx, cy, s) => Array.from({ length: 48 }, (_, i) => { const t = (i / 48) * Math.PI * 2; return [cx + s * 16 * Math.sin(t) ** 3 / 16, cy - s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16]; });
const text = (x, y, b, t, g, c, f = 'Caveat') => ({ typ: 'text', x, y, b, drehung: 0, ausrichtung: 'mitte', hintergrund: null, absaetze: [[{ t, f, g, c, b: true }]] });

const MITGELIEFERT = [
  { id: 'std-zettel', name: 'Notizzettel', mit: true, elemente: [
    { id: 'k1', breite: 200, hoehe: 140, inhalt: [rechteck(0, 0, 200, 140, '#f6c9c0'), ...[34, 58, 82, 106].map((y) => linie(16, y, 184, y, '#e2a69b'))] },
    { id: 'k2', breite: 150, hoehe: 160, inhalt: [rechteck(0, 10, 150, 150, '#ffe680'), poly([[45, 0], [105, 4], [103, 22], [43, 18]], 'rgba(190, 220, 240, .85)')] },
    { id: 'k3', breite: 200, hoehe: 140, inhalt: [rechteck(0, 0, 200, 140, '#cfe7f5'), rechteck(0, 0, 200, 26, '#9fcbe8'), ...[52, 76, 100, 124].map((y) => linie(14, y, 186, y, '#8bb9d6'))] },
    { id: 'k4', breite: 160, hoehe: 160, inhalt: [rechteck(0, 0, 160, 160, '#d9f2d0'), ...[[20, 30], [20, 62], [20, 94], [20, 126]].flatMap(([x, y]) => [rechteck(x, y - 8, 10, 10, null, '#5e9c55', 1.2), linie(40, y, 144, y, '#9bc993')])] },
    { id: 'k5', breite: 220, hoehe: 90, inhalt: [poly([[0, 0], [220, 0], [200, 45], [220, 90], [0, 90], [20, 45]], '#e8d9ff')] },
    { id: 'k6', breite: 190, hoehe: 130, inhalt: [{ typ: 'form', art: 'ellipse', cx: 95, cy: 55, rx: 92, ry: 52, winkel: 0, fuellung: '#ffffff', farbe: '#222', breite: 1.4 }, poly([[50, 95], [70, 102], [40, 128]], '#ffffff', '#222', 1.4)] },
  ] },
  { id: 'std-deko', name: 'Deko', mit: true, elemente: [
    { id: 'd1', breite: 200, hoehe: 28, inhalt: [rechteck(0, 0, 200, 28, 'rgba(244, 182, 194, .85)'), ...[20, 50, 80, 110, 140, 170].map((x) => linie(x, 6, x + 10, 22, 'rgba(255,255,255,.8)', 2))] },
    { id: 'd2', breite: 200, hoehe: 28, inhalt: [rechteck(0, 0, 200, 28, 'rgba(160, 205, 235, .85)'), ...[14, 34, 54, 74, 94, 114, 134, 154, 174].map((x) => ({ typ: 'form', art: 'ellipse', cx: x, cy: 14, rx: 3, ry: 3, winkel: 0, fuellung: '#fff', farbe: null, breite: 0 }))] },
    { id: 'd3', breite: 90, hoehe: 90, inhalt: [poly(stern(45, 47, 44, 19), '#ffd84d')] },
    { id: 'd4', breite: 90, hoehe: 82, inhalt: [poly(herz(45, 44, 2.6), '#ff6b8b')] },
    { id: 'd5', breite: 220, hoehe: 60, inhalt: [rechteck(0, 0, 220, 60, '#2a5bd7'), text(0, 12, 220, 'Überschrift', 28, '#ffffff')] },
    { id: 'd6', breite: 160, hoehe: 40, inhalt: [linie(0, 20, 150, 20, '#222', 2), { typ: 'form', art: 'pfeil', x1: 100, y1: 20, x2: 158, y2: 20, farbe: '#222', breite: 2, fuellung: null }] },
  ] },
];

async function sammlungen() {
  const eigene = await db.alle('sammlungen');
  return [...MITGELIEFERT, ...eigene.sort((a, b) => a.name.localeCompare(b.name, 'de'))];
}

let aktSammlung = 'std-zettel';
export async function elementePopover(anker) {
  const alle = await sammlungen();
  if (!alle.some((s) => s.id === aktSammlung)) aktSammlung = alle[0].id;
  const s = alle.find((x) => x.id === aktSammlung);
  const p = popover(`<h3>Elemente</h3>
    <div class="sammlungen">${alle.map((x) => `<button data-s="${x.id}" class="${x.id === aktSammlung ? 'an' : ''}">${esc(x.name)}</button>`).join('')}<button data-neu>＋ Sammlung</button></div>
    <div class="elementraster">${s.elemente.map((e) => `<button data-e="${e.id}" title="Einfügen${s.mit ? '' : ' – gedrückt halten zum Löschen'}"><canvas width="160" height="160"></canvas></button>`).join('')}</div>
    ${s.elemente.length ? '' : '<p style="font-size:13px;color:var(--text-2);text-align:center">Noch leer. Wähle mit dem Lasso etwas aus und tippe auf „Als Element“.</p>'}
    ${s.mit ? '' : '<div class="knopfzeile"><button data-a="umbenennen">Umbenennen</button><button class="gefahr" data-a="loeschen">Sammlung löschen</button></div>'}`, anker, { breite: 330 });
  // Vorschauen malen
  p.querySelectorAll('[data-e]').forEach((b) => {
    const e = s.elemente.find((x) => x.id === b.dataset.e);
    const c = $('canvas', b), ctx = c.getContext('2d');
    const f = Math.min(150 / e.breite, 150 / e.hoehe);
    ctx.setTransform(f, 0, 0, f, (160 - e.breite * f) / 2, (160 - e.hoehe * f) / 2);
    zeichneAlle(ctx, kopie(e.inhalt));
  });
  let druck;
  p.onpointerdown = (ev) => {
    const b = ev.target.closest('[data-e]'); if (!b || s.mit) return;
    druck = setTimeout(async () => { druck = 'lang'; if (await api.frage('Element löschen?', 'Es wird aus der Sammlung entfernt.')) { s.elemente = s.elemente.filter((x) => x.id !== b.dataset.e); await db.speichern('sammlungen', s); elementePopover(anker); } }, 600);
  };
  p.onpointerup = () => { if (druck !== 'lang') clearTimeout(druck); };
  p.onclick = async (ev) => {
    if (druck === 'lang') { druck = null; return; }
    const sb = ev.target.closest('[data-s]'); if (sb) { aktSammlung = sb.dataset.s; return elementePopover(anker); }
    if (ev.target.closest('[data-neu]')) { const n = await api.eingabe('Neue Sammlung', 'Meine Elemente', 'Erstellen'); if (n) { const neu = { id: id(), name: n, elemente: [] }; await db.speichern('sammlungen', neu); aktSammlung = neu.id; } return elementePopover(anker); }
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'umbenennen') { const n = await api.eingabe('Sammlung umbenennen', s.name); if (n) { s.name = n; await db.speichern('sammlungen', s); } return elementePopover(anker); }
    if (a === 'loeschen' && await api.frage(`„${s.name}“ löschen?`, 'Alle Elemente darin werden entfernt.')) { await db.loeschen('sammlungen', s.id); aktSammlung = 'std-zettel'; return elementePopover(anker); }
    const eb = ev.target.closest('[data-e]'); if (!eb) return;
    popoverZu();
    einfuegen(s.elemente.find((x) => x.id === eb.dataset.e));
  };
}

function einfuegen(e) {
  const s = z.seiten[z.aktuell];
  const neu = e.inhalt.map(kopie);
  const f = Math.min(1, (s.breite * .5) / e.breite);
  const x = (s.breite - e.breite * f) / 2, y = Math.max(40, s.hoehe * .3 - (e.hoehe * f) / 2);
  for (const el of neu) { if (f !== 1) skalieren(el, f, f, 0, 0); verschieben(el, x, y); }
  api.elementeEinfuegen(s, neu);
}

// Lasso-Auswahl als Element speichern
export async function alsElementSpeichern(auswahl) {
  const eigene = await db.alle('sammlungen');
  const box = api.dialog(`<h2>Zu Elementen hinzufügen</h2><div class="menue" style="position:static;box-shadow:none;border:0;padding:0;animation:none;background:none">
    ${eigene.map((x) => `<button data-s="${x.id}">${I.w_elemente}${esc(x.name)}</button>`).join('')}
    <button data-s="neu">${I.plus}Neue Sammlung …</button></div>`);
  box.onclick = async (ev) => {
    const b = ev.target.closest('[data-s]'); if (!b) return;
    let ziel;
    if (b.dataset.s === 'neu') { api.dialogZu(); const n = await api.eingabe('Neue Sammlung', 'Meine Elemente', 'Erstellen'); if (!n) return; ziel = { id: id(), name: n, elemente: [] }; }
    else { ziel = eigene.find((x) => x.id === b.dataset.s); api.dialogZu(); }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const el of auswahl) { const r = rahmen(el); x1 = Math.min(x1, r.x1); y1 = Math.min(y1, r.y1); x2 = Math.max(x2, r.x2); y2 = Math.max(y2, r.y2); }
    const inhalt = auswahl.map(kopie);
    for (const el of inhalt) verschieben(el, -x1, -y1);
    ziel.elemente.push({ id: id(), breite: x2 - x1, hoehe: y2 - y1, inhalt });
    await db.speichern('sammlungen', ziel);
    aktSammlung = ziel.id;
    api.hinweis(`Zu „${ziel.name}“ hinzugefügt`);
  };
}
