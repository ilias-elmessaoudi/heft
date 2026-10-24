import { db, id, dauerhaftSpeichern } from './db.js';
import { A4, VORLAGEN, PAPIER, zeichnePapier } from './zeichnen.js';
import { oeffneEditor } from './editor.js';
import { pdfImportieren } from './pdf-werkzeug.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const COVER = [
  'linear-gradient(150deg, #5b5bd6, #2b2b8a)',
  'linear-gradient(150deg, #ff7a59, #c2304f)',
  'linear-gradient(150deg, #22c1a6, #0f6e74)',
  'linear-gradient(150deg, #ffd166, #f08a24)',
  'linear-gradient(150deg, #2d2d33, #0e0e12)',
  'linear-gradient(150deg, #9b6bff, #e05bd6)',
  'linear-gradient(150deg, #76b852, #2f7d32)',
  'linear-gradient(150deg, #8ec5fc, #5b8def)',
  'linear-gradient(150deg, #f6f1e7, #d9cbb0)',
];

const ICON = {
  ordner: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
  ordnerVoll: '<svg viewBox="0 0 64 52"><path d="M4 8a5 5 0 0 1 5-5h14l5 5h27a5 5 0 0 1 5 5v31a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/></svg>',
  heft: '<svg viewBox="0 0 24 24"><path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6z"/><path d="M6 3.5v17M9.5 8h5"/></svg>',
  pdf: '<svg viewBox="0 0 24 24"><path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/></svg>',
  stift: '<svg viewBox="0 0 24 24"><path d="M4 20l1.5-5L16 4.5a2.1 2.1 0 0 1 3 3L8.5 18z"/></svg>',
  kopie: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>',
  verschieben: '<svg viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="m11 11 3 2.5-3 2.5"/></svg>',
  muell: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7"/></svg>',
  cover: '<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M5 14l4-3 3 2.5 3-2 4 3"/></svg>',
};
export { ICON };

/* ================= Allgemeine Bausteine ================= */

export function hinweis(text, ms = 2600) {
  const h = $('#hinweis');
  h.textContent = text; h.hidden = false;
  clearTimeout(hinweis.t);
  hinweis.t = setTimeout(() => (h.hidden = true), ms);
}

// Kleines Menü an einem Element oder einer Position
export function menue(html, anker, { rechts = false } = {}) {
  const m = $('#menue');
  m.innerHTML = html; m.hidden = false;
  const r = anker.getBoundingClientRect ? anker.getBoundingClientRect() : { left: anker.x, right: anker.x, bottom: anker.y, top: anker.y };
  const b = m.offsetWidth, h = m.offsetHeight;
  let x = rechts ? r.right - b : r.left, y = r.bottom + 6;
  if (y + h > innerHeight - 10) y = Math.max(10, r.top - h - 6);
  m.style.left = Math.max(10, Math.min(x, innerWidth - b - 10)) + 'px';
  m.style.top = y + 'px';
  return m;
}
export const menueZu = () => ($('#menue').hidden = true);
addEventListener('pointerdown', (e) => { if (!$('#menue').hidden && !e.target.closest('#menue')) menueZu(); }, true);

export function dialog(html) {
  const d = $('#dialog');
  $('.dialog-box', d).innerHTML = html;
  d.hidden = false;
  return $('.dialog-box', d);
}
export const dialogZu = () => ($('#dialog').hidden = true);
$('.dialog-hinter').addEventListener('click', dialogZu);

export function frage(titel, text, jaText = 'Löschen') {
  return new Promise((ok) => {
    const box = dialog(`<h2>${esc(titel)}</h2><p style="color:var(--text-2);margin:0 0 10px">${esc(text)}</p>
      <div class="dialog-knoepfe"><button class="btn" data-n>Abbrechen</button><button class="btn haupt" data-j style="background:#e5484d">${esc(jaText)}</button></div>`);
    $('[data-n]', box).onclick = () => { dialogZu(); ok(false); };
    $('[data-j]', box).onclick = () => { dialogZu(); ok(true); };
  });
}
export function eingabe(titel, wert = '', knopf = 'Fertig') {
  return new Promise((ok) => {
    const box = dialog(`<h2>${esc(titel)}</h2><label class="feld"><input type="text" value="${esc(wert)}"></label>
      <div class="dialog-knoepfe"><button class="btn" data-n>Abbrechen</button><button class="btn haupt" data-j>${esc(knopf)}</button></div>`);
    const inp = $('input', box);
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
    const fertig = () => { dialogZu(); ok(inp.value.trim() || null); };
    $('[data-j]', box).onclick = fertig;
    inp.onkeydown = (e) => { if (e.key === 'Enter') fertig(); };
    $('[data-n]', box).onclick = () => { dialogZu(); ok(null); };
  });
}

export function vorlagenMuster(canvas, vorlage, papier) {
  const s = canvas.width / A4.breite;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(s, 0, 0, s, 0, 0);
  zeichnePapier(ctx, { breite: A4.breite, hoehe: A4.hoehe, vorlage, papier });
}

/* ================= Hefte anlegen ================= */

export function neueSeite(heftId, vorlage = 'liniert', papier = 'weiss', extra = {}) {
  return { id: id(), heftId, vorlage, papier, breite: A4.breite, hoehe: A4.hoehe, elemente: [], ...extra };
}

async function heftAnlegen({ titel, cover, vorlage, papier, ordner }) {
  const heft = { id: id(), titel, cover, ordner, erstellt: Date.now(), seiten: [] };
  const seite = neueSeite(heft.id, vorlage, papier);
  heft.seiten.push(seite.id);
  heft.vorlage = vorlage; heft.papier = papier;
  await db.speichern('seiten', seite);
  await db.speichern('hefte', heft);
  return heft;
}

function neuDialog() {
  let cover = 0, vorlage = 'liniert', papier = 'weiss';
  const box = dialog(`<h2>Neues Notizbuch</h2>
    <label class="feld">Titel<input type="text" id="n-titel" value="Notizbuch"></label>
    <div class="feld" style="font-size:13px;color:var(--text-2)">Cover</div>
    <div class="wahl" id="n-cover">${COVER.map((c, i) => `<button data-i="${i}" class="${i === cover ? 'an' : ''}"><span class="muster" style="background:${c}"></span></button>`).join('')}</div>
    <div class="feld" style="font-size:13px;color:var(--text-2)">Papier</div>
    <div class="wahl" id="n-vorlage">${Object.entries(VORLAGEN).map(([k, n]) => `<button class="vorlage ${k === vorlage ? 'an' : ''}" data-v="${k}"><span class="muster"><canvas width="124" height="164"></canvas></span>${n}</button>`).join('')}</div>
    <div class="menue-reihe" style="display:flex;gap:8px;margin-bottom:14px" id="n-papier">${Object.keys(PAPIER).map((k) => `<button class="btn ${k === papier ? 'haupt' : ''}" data-p="${k}" style="padding:7px 14px;font-weight:500">${{ weiss: 'Weiß', creme: 'Creme', dunkel: 'Dunkel' }[k]}</button>`).join('')}</div>
    <div class="dialog-knoepfe"><button class="btn" data-n>Abbrechen</button><button class="btn haupt" data-j>Erstellen</button></div>`);
  const muster = () => box.querySelectorAll('#n-vorlage button').forEach((b) => vorlagenMuster($('canvas', b), b.dataset.v, papier));
  muster();
  $('#n-cover', box).onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; cover = +b.dataset.i; box.querySelectorAll('#n-cover button').forEach((x) => x.classList.toggle('an', x === b)); };
  $('#n-vorlage', box).onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; vorlage = b.dataset.v; box.querySelectorAll('#n-vorlage button').forEach((x) => x.classList.toggle('an', x === b)); };
  $('#n-papier', box).onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; papier = b.dataset.p; box.querySelectorAll('#n-papier button').forEach((x) => x.classList.toggle('haupt', x === b)); muster(); };
  $('[data-n]', box).onclick = dialogZu;
  $('[data-j]', box).onclick = async () => {
    const heft = await heftAnlegen({ titel: $('#n-titel', box).value.trim() || 'Notizbuch', cover, vorlage, papier, ordner: aktOrdner });
    dialogZu();
    oeffneEditor(heft.id);
  };
  setTimeout(() => $('#n-titel', box).select(), 50);
}

/* ================= Bibliothek ================= */

let aktOrdner = null;
let sortierung = localStorage.getItem('heft.sortierung') || 'geaendert';

export async function bibliothekZeigen() {
  $('#editor').hidden = true;
  $('#bibliothek').hidden = false;
  const [hefte, ordner] = await Promise.all([db.alle('hefte'), db.alle('ordner')]);
  const q = $('#suche').value.trim().toLowerCase();
  const o = ordner.find((x) => x.id === aktOrdner);
  if (aktOrdner && !o) aktOrdner = null;
  $('#bib-titel').textContent = o ? o.name : 'Dokumente';
  $('#ordner-zurueck').hidden = !aktOrdner;
  const sort = (a, b) => (sortierung === 'name' ? a.titel.localeCompare(b.titel, 'de') : b.geaendert - a.geaendert);
  const sichtbar = hefte.filter((h) => !h.geloescht && (q ? h.titel.toLowerCase().includes(q) : (h.ordner || null) === aktOrdner)).sort(sort);
  const ordnerSichtbar = q || aktOrdner ? [] : ordner.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const zahl = (oid) => hefte.filter((h) => !h.geloescht && h.ordner === oid).length;
  const raster = $('#raster');
  raster.innerHTML = ordnerSichtbar.map((x) => `<div class="eintrag" data-ordner="${x.id}"><div class="ordner-huelle">${ICON.ordnerVoll}</div><b>${esc(x.name)}</b><small>${zahl(x.id)} Elemente</small></div>`).join('')
    + sichtbar.map((h) => `<div class="eintrag" data-heft="${h.id}">
        ${h.vorschau ? `<div class="huelle dokument"><img src="${h.vorschau}" alt=""></div>` : `<div class="huelle" style="background:${COVER[h.cover] || COVER[0]}"></div>`}
        <b>${esc(h.titel)}</b><small>${datum(h.geaendert)}</small></div>`).join('')
    || `<div class="leer-hinweis"><b>${q ? 'Nichts gefunden' : 'Noch leer'}</b>${q ? '' : 'Tippe auf + für ein neues Notizbuch oder um ein PDF zu öffnen.'}</div>`;
}

const datum = (t) => {
  const d = new Date(t), heute = new Date();
  if (d.toDateString() === heute.toDateString()) return 'Heute, ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: d.getFullYear() === heute.getFullYear() ? undefined : 'numeric' });
};

$('#suche').addEventListener('input', bibliothekZeigen);
$('#ordner-zurueck').onclick = () => { aktOrdner = null; bibliothekZeigen(); };
$('#sortieren').onclick = (e) => {
  const m = menue(`<div class="titel">Sortieren nach</div>
    <button data-s="geaendert">${sortierung === 'geaendert' ? '✓ ' : ''}Zuletzt geändert</button>
    <button data-s="name">${sortierung === 'name' ? '✓ ' : ''}Name</button>`, e.currentTarget, { rechts: true });
  m.onclick = (ev) => { const b = ev.target.closest('[data-s]'); if (!b) return; sortierung = b.dataset.s; localStorage.setItem('heft.sortierung', sortierung); menueZu(); bibliothekZeigen(); };
};

$('#neu').onclick = (e) => {
  const m = menue(`<button data-n="heft">${ICON.heft}Notizbuch</button>
    <button data-n="pdf">${ICON.pdf}PDF öffnen</button>
    ${aktOrdner ? '' : `<button data-n="ordner">${ICON.ordner}Ordner</button>`}`, e.currentTarget, { rechts: true });
  const r = e.currentTarget.getBoundingClientRect();
  m.style.top = Math.max(10, r.top - m.offsetHeight - 10) + 'px';
  m.onclick = async (ev) => {
    const n = ev.target.closest('[data-n]')?.dataset.n; if (!n) return;
    menueZu();
    if (n === 'heft') neuDialog();
    if (n === 'pdf') $('#datei-pdf').click();
    if (n === 'ordner') { const name = await eingabe('Neuer Ordner', 'Ordner', 'Erstellen'); if (name) { await db.speichern('ordner', { id: id(), name }); bibliothekZeigen(); } }
  };
};

$('#datei-pdf').onchange = async (e) => {
  const datei = e.target.files[0]; e.target.value = '';
  if (!datei) return;
  hinweis('PDF wird geöffnet …', 20000);
  try {
    const heft = await pdfImportieren(datei, aktOrdner);
    $('#hinweis').hidden = true;
    oeffneEditor(heft.id);
  } catch (err) { console.error(err); hinweis('PDF konnte nicht geöffnet werden.'); }
};

// Klick öffnet, langes Drücken oder Rechtsklick zeigt das Menü
let druckTimer, langGedrueckt = false;
const raster = $('#raster');
raster.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.eintrag'); if (!el) return;
  langGedrueckt = false;
  druckTimer = setTimeout(() => { langGedrueckt = true; eintragMenue(el); }, 500);
});
raster.addEventListener('pointerup', () => clearTimeout(druckTimer));
raster.addEventListener('pointercancel', () => clearTimeout(druckTimer));
raster.addEventListener('contextmenu', (e) => { const el = e.target.closest('.eintrag'); if (!el) return; e.preventDefault(); clearTimeout(druckTimer); eintragMenue(el); });
raster.addEventListener('click', (e) => {
  const el = e.target.closest('.eintrag'); if (!el || langGedrueckt) return;
  if (el.dataset.ordner) { aktOrdner = el.dataset.ordner; $('#suche').value = ''; bibliothekZeigen(); }
  else oeffneEditor(el.dataset.heft);
});

async function eintragMenue(el) {
  if (el.dataset.ordner) {
    const o = await db.holen('ordner', el.dataset.ordner);
    const m = menue(`<button data-a="umbenennen">${ICON.stift}Umbenennen</button><hr><button class="gefahr" data-a="loeschen">${ICON.muell}Ordner löschen</button>`, $('.ordner-huelle', el));
    m.onclick = async (ev) => {
      const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return; menueZu();
      if (a === 'umbenennen') { const n = await eingabe('Ordner umbenennen', o.name); if (n) { o.name = n; await db.speichern('ordner', o); } }
      if (a === 'loeschen' && await frage('Ordner löschen?', 'Die Notizbücher darin bleiben erhalten und wandern zurück in „Dokumente“.')) {
        for (const h of await db.alle('hefte')) if (h.ordner === o.id) { h.ordner = null; await db.speichern('hefte', h); }
        await db.loeschen('ordner', o.id);
      }
      bibliothekZeigen();
    };
    return;
  }
  const h = await db.holen('hefte', el.dataset.heft);
  const m = menue(`<button data-a="umbenennen">${ICON.stift}Umbenennen</button>
    ${h.vorschau ? '' : `<button data-a="cover">${ICON.cover}Cover ändern</button>`}
    <button data-a="duplizieren">${ICON.kopie}Duplizieren</button>
    <button data-a="verschieben">${ICON.verschieben}In Ordner verschieben</button>
    <hr><button class="gefahr" data-a="loeschen">${ICON.muell}Löschen</button>`, $('.huelle', el));
  m.onclick = async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return; menueZu();
    if (a === 'umbenennen') { const n = await eingabe('Umbenennen', h.titel); if (n) { h.titel = n; await db.speichern('hefte', h); } }
    if (a === 'cover') return coverWahl(h);
    if (a === 'duplizieren') await duplizieren(h);
    if (a === 'verschieben') return ordnerWahl(h);
    if (a === 'loeschen' && await frage(`„${h.titel}“ löschen?`, 'Das kann nicht rückgängig gemacht werden.')) await heftLoeschen(h);
    bibliothekZeigen();
  };
}

function coverWahl(h) {
  const box = dialog(`<h2>Cover</h2><div class="wahl">${COVER.map((c, i) => `<button data-i="${i}" class="${i === h.cover ? 'an' : ''}"><span class="muster" style="background:${c}"></span></button>`).join('')}</div>`);
  box.onclick = async (e) => { const b = e.target.closest('[data-i]'); if (!b) return; h.cover = +b.dataset.i; await db.speichern('hefte', h); dialogZu(); bibliothekZeigen(); };
}
async function ordnerWahl(h) {
  const ordner = await db.alle('ordner');
  const box = dialog(`<h2>Verschieben nach</h2><div class="menue" style="position:static;box-shadow:none;border:0;padding:0;animation:none">
    <button data-o="">${ICON.ordner}Dokumente (oberste Ebene)</button>
    ${ordner.map((o) => `<button data-o="${o.id}">${ICON.ordner}${esc(o.name)}</button>`).join('')}
    <button data-o="neu">${ICON.ordner}Neuer Ordner …</button></div>`);
  box.onclick = async (e) => {
    const b = e.target.closest('[data-o]'); if (!b) return;
    let ziel = b.dataset.o || null;
    if (ziel === 'neu') { dialogZu(); const n = await eingabe('Neuer Ordner', 'Ordner', 'Erstellen'); if (!n) return; ziel = id(); await db.speichern('ordner', { id: ziel, name: n }); }
    h.ordner = ziel; await db.speichern('hefte', h); dialogZu(); bibliothekZeigen();
  };
}
async function duplizieren(h) {
  const neu = { ...h, id: id(), titel: h.titel + ' (Kopie)', erstellt: Date.now(), seiten: [] };
  for (const sid of h.seiten) {
    const s = await db.holen('seiten', sid);
    const k = { ...structuredClone(s), id: id(), heftId: neu.id };
    neu.seiten.push(k.id);
    await db.speichern('seiten', k);
  }
  await db.speichern('hefte', neu);
}
async function heftLoeschen(h) {
  const dateien = new Set();
  for (const sid of h.seiten) {
    const s = await db.holen('seiten', sid);
    if (s?.hintergrund) dateien.add(s.hintergrund.dateiId);
    for (const el of s?.elemente || []) if (el.dateiId) dateien.add(el.dateiId);
    await db.loeschen('seiten', sid);
  }
  // Dateien nur löschen, wenn kein anderes Heft sie nutzt (Duplikate teilen sich PDFs)
  const andere = (await db.alle('seiten')).flatMap((s) => [s.hintergrund?.dateiId, ...s.elemente.map((e) => e.dateiId)]);
  for (const d of dateien) if (!andere.includes(d)) await db.loeschen('dateien', d);
  await db.loeschen('hefte', h.id);
}

/* ================= Start ================= */

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
dauerhaftSpeichern();
bibliothekZeigen();
