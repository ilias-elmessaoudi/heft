// Tabellen: aus der Zwischenablage übernehmen (Excel, Word, Webseiten, ChatGPT, Markdown), neu anlegen, Zellen bearbeiten
import { ws, z, api, esc, massstab } from './zustand.js';
import { rahmen, rahmenVergessen, kopie, messCtx, RASTER, STANDARD_SCHRIFT, tabelleMasse, tabelleAufLinie, tabellenSchrift } from './zeichnen.js';

const RAND = 24;

/* ================= Zwischenablage lesen ================= */

// Zelltext aus HTML: Zeilenumbrüche (<br>, Absätze) bleiben, sonstige Leerräume werden zu einem Leerzeichen
function zellText(td) {
  const c = td.cloneNode(true);
  for (const br of c.querySelectorAll('br')) br.replaceWith('\u0001');
  for (const b of c.querySelectorAll('p, div, li')) b.append('\u0001');
  for (const x of c.querySelectorAll('style, script')) x.remove();
  return c.textContent.replace(/\s+/g, ' ').replace(/ ?\u0001 ?/g, '\n').replace(/\n+$/, '').trim();
}

function ausHtml(html) {
  if (!/<table/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tab = doc.querySelector('table');
  if (!tab) return null;
  const zellen = [], belegt = []; // belegt: Zellen, die ein rowspan von oben füllt
  [...tab.rows].forEach((tr, i) => {
    const reihe = [];
    let j = 0;
    for (const td of tr.cells) {
      while (belegt[i]?.[j]) { reihe.push(''); j++; }
      reihe.push(zellText(td));
      const cs = Math.max(1, +td.colSpan || 1), rs = Math.max(1, +td.rowSpan || 1);
      for (let k = 1; k < cs; k++) reihe.push('');
      for (let r = 1; r < rs; r++) for (let k = 0; k < cs; k++) ((belegt[i + r] ||= [])[j + k] = true);
      j += cs;
    }
    zellen.push(reihe);
  });
  const kopf = !!(tab.querySelector('thead') || tab.rows[0]?.querySelector('th'));
  return { zellen, kopf };
}

function ausText(text) {
  const zeilen = text.replace(/\r/g, '').split('\n');
  while (zeilen.length && !zeilen[zeilen.length - 1].trim()) zeilen.pop();
  if (!zeilen.length) return null;
  // Markdown: | a | b | mit Trennzeile |---|---|
  const md = zeilen.filter((l) => l.trim());
  if (md.length >= 2 && md.every((l) => l.trim().startsWith('|')) && /^\s*\|?\s*:?-{2,}/.test(md[1])) {
    const teile = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((t) => t.trim().replace(/<br\s*\/?>/gi, '\n').replace(/\*\*(.+?)\*\*/g, '$1'));
    return { zellen: [teile(md[0]), ...md.slice(2).map(teile)], kopf: true };
  }
  // Tabulator-getrennt (Excel, Google Tabellen, Numbers)
  if (zeilen.some((l) => l.includes('\t'))) return { zellen: zeilen.map((l) => l.split('\t').map((t) => t.trim().replace(/^"(.*)"$/s, '$1'))), kopf: false };
  return null;
}

// Liefert { zellen, kopf } oder null, wenn in der Zwischenablage keine Tabelle steckt
export function tabelleAusDaten(daten) {
  if (!daten) return null;
  const roh = ausHtml(daten.getData('text/html') || '') || ausText(daten.getData('text/plain') || '');
  if (!roh) return null;
  let { zellen } = roh;
  const n = Math.max(...zellen.map((r) => r.length));
  zellen = zellen.map((r) => [...r, ...Array(n - r.length).fill('')]);
  // Leere Ränder weg (Excel kopiert oft eine leere Spalte/Zeile mit)
  while (zellen.length && zellen[zellen.length - 1].every((t) => !t)) zellen.pop();
  while (zellen[0]?.length && zellen.every((r) => !r[r.length - 1])) zellen.forEach((r) => r.pop());
  if (!zellen.length || !zellen[0].length || (zellen.length < 2 && zellen[0].length < 2)) return null;
  return { zellen, kopf: roh.kopf };
}

/* ================= Anlegen ================= */

// Spaltenbreiten nach Inhalt; passt die Tabelle nicht aufs Blatt, wird sie schmaler und bricht um
function spaltenBerechnen(el, maxB) {
  messCtx.font = tabellenSchrift(el, true);
  const natur = el.zellen[0].map((_, j) => Math.max(36, Math.min(230, Math.max(...el.zellen.map((r) => Math.max(...String(r[j]).split('\n').map((t) => messCtx.measureText(t).width)))) + 12)));
  const summe = natur.reduce((a, b) => a + b, 0);
  el.b = Math.min(maxB, Math.max(summe, Math.min(maxB, 120 * natur.length)));
  el.spalten = natur.map((w) => w / summe);
}

export function tabelleErstellen(s, roh, x, y) {
  const raster = !s.hintergrund && RASTER[s.vorlage] ? { ...RASTER[s.vorlage] } : null;
  const links = raster && s.vorlage === 'liniert' ? 70 : 40;
  x = Math.max(links, Math.min(x ?? links, s.breite - 160));
  // Ohne feste Stelle: unter das, was schon auf der Seite steht
  if (y == null) {
    const unten = Math.max(0, ...s.elemente.filter((e) => !e._versteckt).map((e) => rahmen(e).y2));
    y = unten && unten < s.hoehe - 120 ? unten + 14 : 90;
  }
  const el = {
    typ: 'tabelle', x, y: y ?? 90, b: 0, spalten: [], zellen: roh.zellen, kopf: roh.kopf,
    f: ws.text.schrift || STANDARD_SCHRIFT, g: 12, c: ws.text.farbe || '#1b1b1f', linie: '#8e8e93', kopfFarbe: '#e9eef7', raster, drehung: 0,
  };
  spaltenBerechnen(el, s.breite - x - RAND);
  tabelleAufLinie(el);
  return el;
}

// Tabelle einfügen; zu lange Tabellen laufen auf den nächsten Seiten weiter (Kopfzeile wird wiederholt)
export async function tabelleEinfuegen(s, el) {
  const teile = [];
  let rest = el, seite = s;
  for (let n = 0; n < 30 && rest; n++) {
    const weiter = zeilenTeilen(rest, seite.hoehe);
    teile.push([seite, rest]);
    if (!weiter) break;
    seite = await api.naechsteSeite(seite);
    weiter.raster = !seite.hintergrund && RASTER[seite.vorlage] ? { ...RASTER[seite.vorlage] } : null;
    weiter.y = weiter.raster ? weiter.raster.oben : 40;
    tabelleAufLinie(weiter);
    rest = weiter;
  }
  for (const [sx, t] of teile) {
    sx.elemente.push(t);
    api.aktion({ typ: 'hinzu', seite: sx, elemente: [t] });
    api.tinteRendern(sx); api.seiteGeaendert(sx);
  }
  return teile;
}

function zeilenTeilen(el, hoehe) {
  const { ys } = tabelleMasse(el);
  const grenze = hoehe - 20 - el.y;
  let k = ys.findIndex((y) => y > grenze) - 1; // so viele Zeilen passen
  if (k < 0) return null;
  const minimum = el.kopf ? 2 : 1;
  if (k < minimum) k = minimum;
  if (k >= el.zellen.length) return null;
  const weiter = { ...kopie(el), zellen: [...(el.kopf ? [el.zellen[0]] : []), ...el.zellen.slice(k)] };
  el.zellen = el.zellen.slice(0, k);
  rahmenVergessen(el);
  return weiter;
}

// Neue leere Tabelle (3 × 3) unter dem, was schon auf der Seite steht
export function neueTabelle() {
  const s = z.seiten[z.aktuell];
  if (!z.dom.get(s.id)) return;
  const el = tabelleErstellen(s, { zellen: [['', '', ''], ['', '', ''], ['', '', '']], kopf: true });
  el.b = Math.min(s.breite - el.x - RAND, 420); el.spalten = [1 / 3, 1 / 3, 1 / 3];
  s.elemente.push(el);
  api.aktion({ typ: 'hinzu', seite: s, elemente: [el] });
  api.seiteGeaendert(s);
  tabelleBearbeiten(s, el, true);
}

export function tabelleAn(s, x, y) {
  return [...s.elemente].reverse().find((t) => t.typ === 'tabelle' && (() => { const r = rahmen(t); return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2; })());
}

/* ================= Bearbeiten ================= */

let edit = null;
export const tabelleOffen = () => !!edit;

export function tabelleBearbeiten(s, el, neu = false, zelle = null) {
  tabelleFertig();
  api.auswahlAufheben?.();
  const vorher = neu ? null : kopie(el);
  el._versteckt = true; api.tinteRendern(s);
  const box = document.createElement('div');
  box.className = 'tabellenfeld';
  z.dom.get(s.id).el.append(box);
  edit = { s, el, vorher, box };
  aufbauen();
  const [i, j] = zelle || [0, 0];
  zelleFokus(box.querySelector(`td[data-i="${i}"][data-j="${j}"]`) || box.querySelector('td'));
}

function zelleFokus(td) {
  if (!td) return;
  td.focus();
  const sel = getSelection(); sel.selectAllChildren(td); sel.collapseToEnd();
  edit.zelle = [+td.dataset.i, +td.dataset.j];
}
// Zelle, in der der Cursor steht
function aktZelle() {
  const n = getSelection().anchorNode;
  const td = n && (n.nodeType === 1 ? n : n.parentElement)?.closest?.('td');
  if (td && edit.box.contains(td)) edit.zelle = [+td.dataset.i, +td.dataset.j];
  return edit.zelle;
}

function zellenLesen() {
  if (!edit) return;
  for (const td of edit.box.querySelectorAll('td')) edit.el.zellen[+td.dataset.i][+td.dataset.j] = td.innerText.replace(/\n$/, '');
}

function aufbauen(fokus) {
  const { box, el } = edit, m = massstab();
  const { xs, L, pad } = tabelleMasse(el);
  const innen = el.raster ? 0 : pad;
  Object.assign(box.style, { left: el.x * m + 'px', top: el.y * m + 'px', width: el.b * m + 'px' });
  box.innerHTML = `
    <div class="tabelle-leiste">
      <button data-b="zeile">+ Zeile</button><button data-b="spalte">+ Spalte</button>
      <button data-b="zeile-weg">− Zeile</button><button data-b="spalte-weg">− Spalte</button>
      <button data-b="kopf" class="${el.kopf ? 'an' : ''}">Kopfzeile</button><button data-b="fertig" class="fertig">Fertig</button>
    </div>
    <table style="width:${el.b * m}px">
      <colgroup>${el.spalten.map((a) => `<col style="width:${a * el.b * m}px">`).join('')}</colgroup>
      ${el.zellen.map((reihe, i) => `<tr>${reihe.map((t, j) => `<td contenteditable="plaintext-only" data-i="${i}" data-j="${j}" style="font:${tabellenSchrift({ ...el, g: el.g * m }, el.kopf && i === 0).replace(/"/g, "'")};line-height:${L * m}px;padding:${innen * m}px ${pad * m}px;color:${el.c};${el.kopf && i === 0 ? `background:${el.kopfFarbe}` : ''}">${esc(t)}</td>`).join('')}</tr>`).join('')}
    </table>
    ${xs.slice(1).map((x, j) => `<div class="spalten-griff" data-j="${j}" style="left:${x * m - 6}px"></div>`).join('')}`;
  box.querySelector('.tabelle-leiste').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
  box.querySelector('.tabelle-leiste').addEventListener('click', (e) => befehl(e.target.closest('[data-b]')?.dataset.b));
  for (const g of box.querySelectorAll('.spalten-griff')) g.addEventListener('pointerdown', spalteZiehen);
  box.querySelector('table').addEventListener('keydown', taste);
  box.querySelector('table').addEventListener('focusin', (e) => { const td = e.target.closest('td'); if (td) edit.zelle = [+td.dataset.i, +td.dataset.j]; });
  if (fokus) zelleFokus(box.querySelector(`td[data-i="${fokus[0]}"][data-j="${fokus[1]}"]`));
}

function befehl(b) {
  if (!b || !edit) return;
  zellenLesen();
  const { el } = edit, [i, j] = aktZelle() || [el.zellen.length - 1, 0];
  if (b === 'fertig') return tabelleFertig();
  if (b === 'zeile') el.zellen.splice(i + 1, 0, el.spalten.map(() => ''));
  if (b === 'zeile-weg' && el.zellen.length > 1) el.zellen.splice(i, 1);
  if (b === 'spalte') {
    for (const r of el.zellen) r.splice(j + 1, 0, '');
    const neu = 1 / (el.spalten.length + 1);
    el.spalten = el.spalten.map((a) => a * (1 - neu)); el.spalten.splice(j + 1, 0, neu);
  }
  if (b === 'spalte-weg' && el.spalten.length > 1) {
    for (const r of el.zellen) r.splice(j, 1);
    const [weg] = el.spalten.splice(j, 1);
    el.spalten = el.spalten.map((a) => a / (1 - weg));
  }
  if (b === 'kopf') el.kopf = !el.kopf;
  rahmenVergessen(el);
  aufbauen([Math.min(i + (b === 'zeile' ? 1 : 0), el.zellen.length - 1), Math.min(j + (b === 'spalte' ? 1 : 0), el.spalten.length - 1)]);
}

// Tab springt in die nächste Zelle, am Ende kommt eine neue Zeile dazu; Escape beendet
function taste(e) {
  e.stopPropagation(); // keine Werkzeug-Kürzel beim Tippen in Zellen
  if (e.key === 'Escape') { e.preventDefault(); return tabelleFertig(); }
  if (e.key !== 'Tab') return;
  e.preventDefault();
  zellenLesen();
  const { el } = edit, n = el.spalten.length;
  let [i, j] = aktZelle() || [0, 0];
  let k = i * n + j + (e.shiftKey ? -1 : 1);
  if (k < 0) k = 0;
  if (k >= el.zellen.length * n) { el.zellen.push(el.spalten.map(() => '')); rahmenVergessen(el); return aufbauen([el.zellen.length - 1, 0]); }
  [i, j] = [Math.floor(k / n), k % n];
  zelleFokus(edit.box.querySelector(`td[data-i="${i}"][data-j="${j}"]`));
}

// Spaltengrenze ziehen; die letzte Grenze ändert die Breite der ganzen Tabelle
function spalteZiehen(e) {
  e.preventDefault(); e.stopPropagation();
  zellenLesen();
  const { el, s } = edit, j = +e.target.dataset.j, m = massstab(), start = e.clientX;
  const breiten = el.spalten.map((a) => a * el.b);
  const bew = (ev) => {
    const d = (ev.clientX - start) / m, b = breiten.slice();
    if (j === b.length - 1) b[j] = Math.max(24, Math.min(s.breite - 8 - el.x - (el.b - breiten[j]), breiten[j] + d));
    else { const g = breiten[j] + breiten[j + 1]; b[j] = Math.max(24, Math.min(g - 24, breiten[j] + d)); b[j + 1] = g - b[j]; }
    el.b = b.reduce((x, y) => x + y, 0); el.spalten = b.map((w) => w / el.b);
    const cols = edit.box.querySelectorAll('col');
    b.forEach((w, k) => (cols[k].style.width = w * m + 'px'));
    edit.box.querySelector('table').style.width = el.b * m + 'px'; edit.box.style.width = el.b * m + 'px';
    let x = 0; edit.box.querySelectorAll('.spalten-griff').forEach((g, k) => { x += b[k]; g.style.left = x * m - 6 + 'px'; });
  };
  const los = () => { removeEventListener('pointermove', bew); removeEventListener('pointerup', los); rahmenVergessen(el); aufbauen(edit.zelle || [0, 0]); };
  addEventListener('pointermove', bew); addEventListener('pointerup', los);
}

export function tabelleFertig() {
  if (!edit) return;
  zellenLesen();
  const { s, el, vorher, box } = edit;
  edit = null;
  box.remove();
  delete el._versteckt;
  rahmenVergessen(el);
  const leer = el.zellen.every((r) => r.every((t) => !t.trim()));
  if (leer && vorher === null) {
    // leere neue Tabelle wieder weg
    const i = s.elemente.indexOf(el); if (i >= 0) { s.elemente.splice(i, 1); api.aktion({ typ: 'weg', seite: s, elemente: [el], indizes: [i] }); }
  } else if (vorher && JSON.stringify(vorher) !== JSON.stringify(kopie(el))) api.aktion({ typ: 'aendern', seite: s, paare: [[el, vorher, kopie(el)]] });
  api.tinteRendern(s);
  api.seiteGeaendert(s);
}

// Außerhalb tippen beendet das Bearbeiten
document.addEventListener('pointerdown', (e) => { if (edit && !edit.box.contains(e.target)) tabelleFertig(); }, true);

// Zelle an einer Seitenposition (zum direkten Hineintippen)
export function zelleAn(el, x, y) {
  const { xs, ys } = tabelleMasse(el);
  const i = Math.max(0, ys.findIndex((v) => v > y - el.y) - 1), j = Math.max(0, xs.findIndex((v) => v > x - el.x) - 1);
  return [Math.min(i, el.zellen.length - 1), Math.min(j, el.spalten.length - 1)];
}
