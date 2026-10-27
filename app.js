import { db, id, dauerhaftSpeichern } from './db.js';
import { $, esc, api } from './zustand.js';
import { I } from './icons.js';
import { A4, FORMATE, VORLAGEN, PAPIER, zeichnePapier, zeichneAlle, textInhalt, textNormalisieren } from './zeichnen.js';
import { oeffneEditor } from './editor.js';
import { pdfImportieren, pdfSeiteRendern } from './pdf-werkzeug.js';
import * as abgleich from './abgleich.js';

// Umschläge (Index); -1 = "Kein Umschlag" (Bibliothek zeigt die erste Seite)
export const COVER = [
  'linear-gradient(150deg, #5b8def, #2f5bb7)', 'linear-gradient(150deg, #ff8a7a, #d9465f)', 'linear-gradient(150deg, #3cc7b0, #13817f)',
  'linear-gradient(150deg, #ffd166, #f0a020)', 'linear-gradient(150deg, #3a3f4b, #16181d)', 'linear-gradient(150deg, #b28dff, #7b4ce0)',
  'linear-gradient(150deg, #8bd17c, #3c8f3f)', 'linear-gradient(150deg, #f7c6d9, #e68fb0)', 'linear-gradient(150deg, #f4ede1, #d8c7a8)',
  'linear-gradient(150deg, #a8d8f0, #6bb1db)', 'linear-gradient(150deg, #ffb385, #f07a3a)', 'linear-gradient(150deg, #c9c9d1, #8d8d99)',
];
const MIT_GUMMI = new Set([1, 4, 6, 10]);

/* ================= Allgemeine Bausteine ================= */

export function hinweis(text, ms = 2800) {
  const h = $('#hinweis');
  h.textContent = text; h.hidden = false;
  clearTimeout(hinweis.t);
  hinweis.t = setTimeout(() => (h.hidden = true), ms);
}
export function menue(html, anker, { rechts = false } = {}) {
  const m = $('#menue');
  m.innerHTML = html; m.hidden = false;
  const r = anker.getBoundingClientRect ? anker.getBoundingClientRect() : { left: anker.x, right: anker.x, bottom: anker.y, top: anker.y };
  const b = m.offsetWidth, h = m.offsetHeight;
  let y = r.bottom + 6;
  if (y + h > innerHeight - 10) y = Math.max(10, r.top - h - 6);
  m.style.left = Math.max(10, Math.min(rechts ? r.right - b : r.left, innerWidth - b - 10)) + 'px';
  m.style.top = y + 'px';
  return m;
}
export const menueZu = () => ($('#menue').hidden = true);
addEventListener('pointerdown', (e) => { if (!$('#menue').hidden && !e.target.closest('#menue')) menueZu(); }, true);

export function dialog(html, { breit = false } = {}) {
  const d = $('#dialog'), box = $('.dialog-box', d);
  box.className = 'dialog-box' + (breit ? ' breit' : '');
  box.innerHTML = html; d.hidden = false;
  return box;
}
export const dialogZu = () => ($('#dialog').hidden = true);
$('.dialog-hinter').addEventListener('click', dialogZu);

export function frage(titel, text, jaText = 'Löschen') {
  return new Promise((ok) => {
    const box = dialog(`<h2>${esc(titel)}</h2><p style="color:var(--text-2);margin:0 0 10px">${esc(text)}</p>
      <div class="dialog-knoepfe"><button class="btn" data-n>Abbrechen</button><button class="btn haupt" data-j style="background:#ff453a">${esc(jaText)}</button></div>`);
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
    inp.onkeydown = (e) => { if (e.key === 'Enter') fertig(); e.stopPropagation(); };
    $('[data-n]', box).onclick = () => { dialogZu(); ok(null); };
  });
}
Object.assign(api, { hinweis, frage, eingabe, dialog, dialogZu });

export function vorlagenMuster(canvas, vorlage, papier, format = A4) {
  const s = canvas.width / format.breite;
  canvas.height = Math.round(format.hoehe * s);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(s, 0, 0, s, 0, 0);
  zeichnePapier(ctx, { breite: format.breite, hoehe: format.hoehe, vorlage, papier });
}

// Kleine Vorschau einer Seite (für Hefte ohne Umschlag)
export async function vorschauErstellen(s) {
  if (!s) return null;
  const f = 260 / s.breite;
  const c = document.createElement('canvas');
  c.width = Math.round(s.breite * f); c.height = Math.round(s.hoehe * f);
  const ctx = c.getContext('2d');
  ctx.setTransform(f, 0, 0, f, 0, 0);
  zeichnePapier(ctx, s);
  if (s.hintergrund) { const b = await pdfSeiteRendern(s.hintergrund.dateiId, s.hintergrund.seite, f); if (b) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(b, 0, 0, c.width, c.height); ctx.setTransform(f, 0, 0, f, 0, 0); } }
  zeichneAlle(ctx, s.elemente);
  return c.toDataURL('image/jpeg', .82);
}

/* ================= Hefte anlegen ================= */

export function neueSeite(heftId, vorlage = 'liniert', papier = 'weiss', extra = {}) {
  return { id: id(), heftId, vorlage, papier, breite: extra.breite || A4.breite, hoehe: extra.hoehe || A4.hoehe, elemente: [], ...extra, breite: extra.breite || A4.breite, hoehe: extra.hoehe || A4.hoehe };
}

async function heftAnlegen({ titel, cover, vorlage, papier, ordner, format, quer }) {
  const f = FORMATE[format] || FORMATE.a4;
  const [b, h] = quer ? [f.hoehe, f.breite] : [f.breite, f.hoehe];
  const heft = { id: id(), titel, cover, ordner, erstellt: Date.now(), seiten: [], vorlage, papier };
  const seite = neueSeite(heft.id, vorlage, papier, { breite: b, hoehe: h });
  heft.seiten.push(seite.id);
  if (cover === -1) heft.vorschau = await vorschauErstellen(seite);
  await db.speichern('seiten', seite);
  await db.speichern('hefte', heft);
  return heft;
}

// Papier-Raster (gemeinsam für "Neues Notizbuch" und "Vorlage ändern")
function papierRaster(vorlage, papier, format) {
  const gruppen = {};
  for (const [k, v] of Object.entries(VORLAGEN)) (gruppen[v.gruppe] ||= []).push([k, v.name]);
  return `<div class="papierfarben">${['weiss', 'gelb', 'dunkel'].map((p) => `<button data-p="${p}" class="${p === papier ? 'an' : ''}" style="background:${PAPIER[p].grund}" title="${PAPIER[p].name}"></button>`).join('')}</div>`
    + Object.entries(gruppen).map(([g, l]) => `<div class="gruppe-titel">${g}</div><div class="reihe">${l.map(([k, n]) => `<button data-v="${k}" class="${k === vorlage ? 'an' : ''}"><span class="muster"><canvas width="180" data-v="${k}"></canvas></span>${n}</button>`).join('')}</div>`).join('');
}
function musterMalen(box, papier, format) {
  box.querySelectorAll('canvas[data-v]').forEach((c) => vorlagenMuster(c, c.dataset.v, papier, format));
}

function neuDialog() {
  let reiter = 'papier', cover = -1, vorlage = 'punkte', papier = 'weiss', format = 'a4', quer = false;
  const box = dialog(`
    <div class="nb-kopf"><button data-a="ab">Abbrechen</button><b>Neues Notizbuch</b><span></span></div>
    <div class="nb-oben">
      <div class="nb-wahl">
        <button data-r="umschlag"><span>Umschlag</span><b id="nb-cover-name"></b><span class="mini" id="nb-cover-mini"></span></button>
        <button data-r="papier"><span>Papier</span><b id="nb-papier-name"></b><span class="mini"><canvas id="nb-papier-mini" width="132"></canvas></span></button>
      </div>
      <div class="nb-titel">
        <label>Titel <input id="nb-titel" placeholder="Unbenanntes Notizbuch"></label>
        <button class="btn haupt" data-a="erstellen">Erstellen</button>
      </div>
    </div>
    <div class="nb-filter">
      <select id="nb-format">${Object.entries(FORMATE).map(([k, f]) => `<option value="${k}">${f.name}-Format</option>`).join('')}</select>
      <select id="nb-quer"><option value="0">Hochformat</option><option value="1">Querformat</option></select>
    </div>
    <div class="nb-raster" id="nb-raster"></div>`, { breit: true });
  const fmt = () => { const f = FORMATE[format]; return quer ? { breite: f.hoehe, hoehe: f.breite } : f; };
  const zeigen = () => {
    box.querySelectorAll('[data-r]').forEach((b) => b.classList.toggle('an', b.dataset.r === reiter));
    $('#nb-cover-name', box).textContent = cover === -1 ? 'Kein Umschlag' : 'Umschlag ' + (cover + 1);
    const cm = $('#nb-cover-mini', box);
    cm.className = 'mini' + (cover === -1 ? ' ohne' : ''); cm.style.background = cover === -1 ? '' : COVER[cover];
    $('#nb-papier-name', box).textContent = VORLAGEN[vorlage].name;
    vorlagenMuster($('#nb-papier-mini', box), vorlage, papier, fmt());
    const r = $('#nb-raster', box);
    if (reiter === 'umschlag') {
      r.innerHTML = `<div class="gruppe-titel">Einfach</div><div class="reihe"><button data-c="-1" class="${cover === -1 ? 'an' : ''}"><span class="muster ohne"></span>Kein Umschlag</button>${COVER.map((c, i) => `<button data-c="${i}" class="${i === cover ? 'an' : ''}"><span class="muster cover" style="background:${c}">${MIT_GUMMI.has(i) ? '<i style="position:absolute;right:14%;top:0;bottom:0;width:6%;background:rgba(0,0,0,.25)"></i>' : ''}</span>Farbe ${i + 1}</button>`).join('')}</div>`;
    } else { r.innerHTML = papierRaster(vorlage, papier, fmt()); musterMalen(r, papier, fmt()); }
  };
  zeigen();
  box.onclick = async (e) => {
    const r = e.target.closest('[data-r]'); if (r) { reiter = r.dataset.r; return zeigen(); }
    const c = e.target.closest('[data-c]'); if (c) { cover = +c.dataset.c; return zeigen(); }
    const v = e.target.closest('button[data-v]'); if (v) { vorlage = v.dataset.v; return zeigen(); }
    const p = e.target.closest('[data-p]'); if (p) { papier = p.dataset.p; return zeigen(); }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'ab') dialogZu();
    if (a === 'erstellen') {
      const heft = await heftAnlegen({ titel: $('#nb-titel', box).value.trim() || 'Unbenanntes Notizbuch', cover, vorlage, papier, ordner: aktOrdner, format, quer });
      dialogZu(); oeffneEditor(heft.id);
    }
  };
  $('#nb-format', box).onchange = (e) => { format = e.target.value; zeigen(); };
  $('#nb-quer', box).onchange = (e) => { quer = e.target.value === '1'; zeigen(); };
  $('#nb-titel', box).onkeydown = (e) => e.stopPropagation();
}

export function papierDialog({ titel, vorlage, papier, alleMoeglich }) {
  return new Promise((ok) => {
    const box = dialog(`<div class="nb-kopf"><button data-a="ab">Abbrechen</button><b>${esc(titel)}</b><button data-a="ok" style="justify-self:end;font-weight:600">Fertig</button></div>
      ${alleMoeglich ? '<label class="schalter" style="margin:0 18px;border-top:0">Für alle Seiten übernehmen<input type="checkbox" id="pd-alle"></label>' : ''}
      <div class="nb-raster" id="pd-raster"></div>`, { breit: true });
    const zeigen = () => { const r = $('#pd-raster', box); r.innerHTML = papierRaster(vorlage, papier, A4); musterMalen(r, papier, A4); };
    zeigen();
    box.onclick = (e) => {
      const v = e.target.closest('button[data-v]'); if (v) { vorlage = v.dataset.v; return zeigen(); }
      const p = e.target.closest('[data-p]'); if (p) { papier = p.dataset.p; return zeigen(); }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'ab') { dialogZu(); ok(null); }
      if (a === 'ok') { const alle = !!$('#pd-alle', box)?.checked; dialogZu(); ok({ vorlage, papier, alle }); }
    };
  });
}

/* ================= Bibliothek ================= */

let aktOrdner = null;
let tab = 'dokumente';
let sortierung = localStorage.getItem('heft.sortierung2') || 'datum';
let auswahlModus = false;
const gewaehlt = new Set();

const ORDNER_SVG = (stern) => `<svg viewBox="0 0 120 92"><path d="M4 14a8 8 0 0 1 8-8h30l9 9h57a8 8 0 0 1 8 8v57a8 8 0 0 1-8 8H12a8 8 0 0 1-8-8z" fill="var(--ordner)" opacity=".75"/><path d="M4 28a8 8 0 0 1 8-8h96a8 8 0 0 1 8 8v52a8 8 0 0 1-8 8H12a8 8 0 0 1-8-8z" fill="var(--ordner)"/>${stern ? '<path d="m96 32 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="#fff" opacity=".9"/>' : ''}</svg>`;

export async function bibliothekZeigen() {
  $('#editor').hidden = true;
  $('#bibliothek').hidden = false;
  document.querySelectorAll('#tableiste button').forEach((b) => b.classList.toggle('an', b.dataset.tab === tab));
  $('#raster').hidden = tab === 'suche';
  $('#suchseite').hidden = tab !== 'suche';
  $('#sortierung').hidden = tab === 'suche';
  document.querySelectorAll('#sortierung button').forEach((b) => b.classList.toggle('an', b.dataset.s === sortierung));
  if (tab === 'suche') { $('#bib-titel').textContent = 'Suche'; $('#ordner-zurueck').hidden = true; return; }
  const [hefte, ordner] = await Promise.all([db.alle('hefte'), db.alle('ordner')]);
  const o = ordner.find((x) => x.id === aktOrdner);
  if (aktOrdner && !o) aktOrdner = null;
  $('#bib-titel').textContent = tab === 'favoriten' ? 'Favoriten' : o ? o.name : 'Dokumente';
  $('#ordner-zurueck').hidden = !aktOrdner || tab !== 'dokumente';
  $('#auswahl-modus').textContent = auswahlModus ? 'Fertig' : 'Auswählen';
  const sort = (a, b) => sortierung === 'titel' ? (a.titel || a.name).localeCompare(b.titel || b.name, 'de') : sortierung === 'art' ? (a.vorschau && !a.cover ? 1 : 0) - (b.vorschau && !b.cover ? 1 : 0) || (b.geaendert - a.geaendert) : b.geaendert - a.geaendert;
  const sichtbar = hefte.filter((h) => tab === 'favoriten' ? h.favorit : (h.ordner || null) === aktOrdner).sort(sort);
  const ordnerSichtbar = (tab === 'favoriten' ? ordner.filter((x) => x.favorit) : aktOrdner ? [] : ordner).sort(sort);
  const zahl = (oid) => hefte.filter((h) => h.ordner === oid).length;
  const name = (t) => `<span class="name"><span>${esc(t)}</span>${auswahlModus ? '' : I.pfeilRunter}</span>`;
  $('#raster').innerHTML = (tab === 'dokumente' && !auswahlModus ? `<div class="eintrag neu-kachel" data-neu><div class="bildbox">${I.plus}</div><span class="name"><span>Neu …</span></span></div>` : '')
    + ordnerSichtbar.map((x) => `<div class="eintrag ${gewaehlt.has(x.id) ? 'gewaehlt' : ''}" data-ordner="${x.id}"><div class="bildbox"><div class="ordner-bild">${ORDNER_SVG(x.favorit)}</div></div>${name(x.name)}<small>${datum(x.geaendert)} · ${zahl(x.id)}</small></div>`).join('')
    + sichtbar.map((h) => {
      // Erste Seite zeigen: ohne Umschlag oder PDF (ältere PDFs erkennt man am fehlenden Papier-Eintrag)
      const bild = h.vorschau && (h.cover === -1 || h.cover == null || !COVER[h.cover] || h.pdf || !h.vorlage);
      return `<div class="eintrag ${gewaehlt.has(h.id) ? 'gewaehlt' : ''}" data-heft="${h.id}"><div class="bildbox">
        ${bild ? `<div class="huelle ohne"><img src="${h.vorschau}" alt=""></div>` : `<div class="huelle" style="background:${COVER[h.cover] || COVER[0]}">${MIT_GUMMI.has(h.cover) ? '<i class="gummi"></i>' : ''}</div>`}
        </div>${h.favorit ? `<span class="fav">${I.sternVoll}</span>` : ''}${name(h.titel)}<small>${datum(h.geaendert)}</small></div>`;
    }).join('')
    + (!sichtbar.length && !ordnerSichtbar.length && tab === 'favoriten' ? '<div class="leer-hinweis"><b>Keine Favoriten</b>Markiere Notizbücher oder Ordner über den kleinen Pfeil als Favorit.</div>' : '');
}

const datum = (t) => {
  if (!t) return '';
  const d = new Date(t);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
};

$('#ordner-zurueck').innerHTML = I.zurueck;
$('#wolke').innerHTML = I.wolke;
document.querySelectorAll('#tableiste .ic').forEach((s, i) => (s.innerHTML = [I.raster, I.lupe, I.stern][i]));
$('.suchfeld .lupe').innerHTML = I.lupe;
$('#ordner-zurueck').onclick = () => { aktOrdner = null; bibliothekZeigen(); };
$('#sortierung').onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) return; sortierung = b.dataset.s; localStorage.setItem('heft.sortierung2', sortierung); bibliothekZeigen(); };
$('#tableiste').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; auswahlModus = false; gewaehlt.clear(); bibliothekZeigen(); if (tab === 'suche') setTimeout(() => $('#suche').focus(), 50); };
$('#auswahl-modus').onclick = () => {
  if (auswahlModus && gewaehlt.size) return mehrfachMenue($('#auswahl-modus'));
  auswahlModus = !auswahlModus; gewaehlt.clear(); bibliothekZeigen();
};

function neuMenue(anker) {
  const m = menue(`<button data-n="heft">Notizbuch ${I.heft}</button><button data-n="ordner">Ordner ${I.ordner}</button><hr>
    <button data-n="pdf">Importieren (PDF) ${I.dokument}</button><button data-n="bild">Bild als Notiz ${I.bild}</button>`, anker);
  m.onclick = async (ev) => {
    const n = ev.target.closest('[data-n]')?.dataset.n; if (!n) return;
    menueZu();
    if (n === 'heft') neuDialog();
    if (n === 'pdf') $('#datei-pdf').click();
    if (n === 'bild') bildNotiz();
    if (n === 'ordner') { const name = await eingabe('Neuer Ordner', 'Neuer Ordner', 'Erstellen'); if (name) { await db.speichern('ordner', { id: id(), name, eltern: aktOrdner }); bibliothekZeigen(); } }
  };
}

function bildNotiz() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const d = inp.files[0]; if (!d) return;
    const heft = await heftAnlegen({ titel: d.name.replace(/\.[^.]+$/, ''), cover: -1, vorlage: 'leer', papier: 'weiss', ordner: aktOrdner, format: 'a4' });
    const dateiId = id();
    await db.speichern('dateien', { id: dateiId, blob: d, typ: d.type });
    const bmp = await createImageBitmap(d);
    const s = await db.holen('seiten', heft.seiten[0]);
    const b = s.breite - 60, h = Math.min(s.hoehe - 60, b * (bmp.height / bmp.width)), bb = h * (bmp.width / bmp.height);
    s.elemente.push({ typ: 'bild', dateiId, x: (s.breite - bb) / 2, y: 30, b: bb, h, drehung: 0 });
    await db.speichern('seiten', s);
    oeffneEditor(heft.id);
  };
  inp.click();
}

$('#datei-pdf').onchange = async (e) => {
  const datei = e.target.files[0]; e.target.value = '';
  if (!datei) return;
  hinweis('PDF wird geöffnet …', 30000);
  try { const heft = await pdfImportieren(datei, aktOrdner); $('#hinweis').hidden = true; oeffneEditor(heft.id); }
  catch (err) { console.error(err); hinweis('PDF konnte nicht geöffnet werden.'); }
};

// Klick: öffnen; Pfeil am Namen, Rechtsklick oder langes Drücken: Menü
let druckTimer, langGedrueckt = false;
const raster = $('#raster');
raster.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.eintrag:not(.neu-kachel)'); if (!el || auswahlModus) return;
  langGedrueckt = false;
  druckTimer = setTimeout(() => { langGedrueckt = true; eintragMenue(el, $('.bildbox', el)); }, 520);
});
raster.addEventListener('pointerup', () => clearTimeout(druckTimer));
raster.addEventListener('pointercancel', () => clearTimeout(druckTimer));
raster.addEventListener('contextmenu', (e) => { const el = e.target.closest('.eintrag:not(.neu-kachel)'); if (!el) return; e.preventDefault(); clearTimeout(druckTimer); eintragMenue(el, $('.bildbox', el)); });
raster.addEventListener('click', (e) => {
  if (e.target.closest('[data-neu]')) return neuMenue(e.target.closest('[data-neu]'));
  const el = e.target.closest('.eintrag'); if (!el || langGedrueckt) return;
  const eid = el.dataset.ordner || el.dataset.heft;
  if (auswahlModus) { gewaehlt.has(eid) ? gewaehlt.delete(eid) : gewaehlt.add(eid); $('#auswahl-modus').textContent = gewaehlt.size ? `${gewaehlt.size} ausgewählt …` : 'Fertig'; el.classList.toggle('gewaehlt'); return; }
  if (e.target.closest('.name')) return eintragMenue(el, e.target.closest('.name'));
  if (el.dataset.ordner) { aktOrdner = el.dataset.ordner; tab = 'dokumente'; bibliothekZeigen(); }
  else oeffneEditor(el.dataset.heft);
});

async function eintragMenue(el, anker) {
  if (el.dataset.ordner) {
    const o = await db.holen('ordner', el.dataset.ordner);
    const m = menue(`<button data-a="umbenennen">Umbenennen ${I.stift}</button><button data-a="fav">${o.favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten'} ${I.stern}</button><hr><button class="gefahr" data-a="loeschen">Ordner löschen ${I.muell}</button>`, anker);
    m.onclick = async (ev) => {
      const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return; menueZu();
      if (a === 'umbenennen') { const n = await eingabe('Ordner umbenennen', o.name); if (n) { o.name = n; await db.speichern('ordner', o); } }
      if (a === 'fav') { o.favorit = !o.favorit; await db.speichern('ordner', o); }
      if (a === 'loeschen' && await frage('Ordner löschen?', 'Die Notizbücher darin bleiben erhalten und wandern zurück in „Dokumente“.')) {
        for (const h of await db.alle('hefte')) if (h.ordner === o.id) { h.ordner = null; await db.speichern('hefte', h); }
        await db.loeschen('ordner', o.id);
      }
      bibliothekZeigen();
    };
    return;
  }
  const h = await db.holen('hefte', el.dataset.heft);
  const m = menue(`<button data-a="umbenennen">Umbenennen ${I.stift}</button>
    ${h.pdf || (h.vorschau && !h.vorlage) ? '' : `<button data-a="cover">Umschlag ändern ${I.heft}</button>`}
    <button data-a="fav">${h.favorit ? 'Aus Favoriten entfernen' : 'Zu Favoriten'} ${I.stern}</button>
    <button data-a="duplizieren">Duplizieren ${I.kopie}</button>
    <button data-a="verschieben">Verschieben ${I.ordner}</button>
    <hr><button class="gefahr" data-a="loeschen">Löschen ${I.muell}</button>`, anker);
  m.onclick = async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return; menueZu();
    if (a === 'umbenennen') { const n = await eingabe('Umbenennen', h.titel); if (n) { h.titel = n; await db.speichern('hefte', h); } }
    if (a === 'fav') { h.favorit = !h.favorit; await db.speichern('hefte', h); }
    if (a === 'cover') return coverWahl(h);
    if (a === 'duplizieren') await duplizieren(h);
    if (a === 'verschieben') return ordnerWahl([h]);
    if (a === 'loeschen' && await frage(`„${h.titel}“ löschen?`, 'Das kann nicht rückgängig gemacht werden.')) await heftLoeschen(h);
    bibliothekZeigen();
  };
}

async function mehrfachMenue(anker) {
  const m = menue(`<button data-a="verschieben">Verschieben ${I.ordner}</button><button data-a="duplizieren">Duplizieren ${I.kopie}</button><hr><button class="gefahr" data-a="loeschen">Löschen ${I.muell}</button><hr><button data-a="fertig">Fertig</button>`, anker, { rechts: true });
  m.onclick = async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return; menueZu();
    const hefte = (await Promise.all([...gewaehlt].map((g) => db.holen('hefte', g)))).filter(Boolean);
    if (a === 'verschieben') return ordnerWahl(hefte);
    if (a === 'duplizieren') for (const h of hefte) await duplizieren(h);
    if (a === 'loeschen' && await frage(`${gewaehlt.size} Elemente löschen?`, 'Das kann nicht rückgängig gemacht werden.')) {
      for (const h of hefte) await heftLoeschen(h);
      for (const g of gewaehlt) if (await db.holen('ordner', g)) { for (const h of await db.alle('hefte')) if (h.ordner === g) { h.ordner = null; await db.speichern('hefte', h); } await db.loeschen('ordner', g); }
    }
    auswahlModus = false; gewaehlt.clear(); bibliothekZeigen();
  };
}

function coverWahl(h) {
  const box = dialog(`<div class="nb-kopf"><button data-a="ab">Abbrechen</button><b>Umschlag</b><span></span></div><div class="nb-raster"><div class="reihe">
    <button data-c="-1" class="${h.cover === -1 ? 'an' : ''}"><span class="muster ohne"></span>Kein Umschlag</button>
    ${COVER.map((c, i) => `<button data-c="${i}" class="${i === h.cover ? 'an' : ''}"><span class="muster cover" style="background:${c}"></span>Farbe ${i + 1}</button>`).join('')}</div></div>`, { breit: true });
  box.onclick = async (e) => {
    if (e.target.closest('[data-a]')) return dialogZu();
    const b = e.target.closest('[data-c]'); if (!b) return;
    h.cover = +b.dataset.c;
    if (h.cover === -1) h.vorschau = await vorschauErstellen(await db.holen('seiten', h.seiten[0]));
    await db.speichern('hefte', h); dialogZu(); bibliothekZeigen();
  };
}
async function ordnerWahl(hefte) {
  const ordner = await db.alle('ordner');
  const box = dialog(`<h2>Verschieben nach</h2><div class="menue" style="position:static;box-shadow:none;border:0;padding:0;animation:none;background:none">
    <button data-o="">Dokumente (oberste Ebene) ${I.raster}</button>
    ${ordner.map((o) => `<button data-o="${o.id}">${esc(o.name)} ${I.ordner}</button>`).join('')}
    <button data-o="neu">Neuer Ordner … ${I.plus}</button></div>`);
  box.onclick = async (e) => {
    const b = e.target.closest('[data-o]'); if (!b) return;
    let ziel = b.dataset.o || null;
    if (ziel === 'neu') { dialogZu(); const n = await eingabe('Neuer Ordner', 'Neuer Ordner', 'Erstellen'); if (!n) return; ziel = id(); await db.speichern('ordner', { id: ziel, name: n }); }
    for (const h of hefte) { h.ordner = ziel; await db.speichern('hefte', h); }
    dialogZu(); auswahlModus = false; gewaehlt.clear(); bibliothekZeigen();
  };
}
async function duplizieren(h) {
  const neu = { ...h, id: id(), titel: h.titel + ' (Kopie)', erstellt: Date.now(), seiten: [], favorit: false };
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
  const andere = (await db.alle('seiten')).flatMap((s) => [s.hintergrund?.dateiId, ...s.elemente.map((e) => e.dateiId)]);
  for (const d of dateien) if (!andere.includes(d)) await db.loeschen('dateien', d);
  await db.loeschen('hefte', h.id);
}

/* ================= Suche über alles ================= */

let suchTimer;
$('#suche').addEventListener('input', () => { clearTimeout(suchTimer); suchTimer = setTimeout(suchen, 200); });
$('#suche').addEventListener('keydown', (e) => e.stopPropagation());
async function suchen() {
  const q = $('#suche').value.trim().toLowerCase();
  const ziel = $('#suchergebnisse');
  if (!q) { ziel.innerHTML = ''; return; }
  const [hefte, seiten] = await Promise.all([db.alle('hefte'), db.alle('seiten')]);
  const nachHeft = new Map(hefte.map((h) => [h.id, h]));
  const treffer = hefte.filter((h) => h.titel.toLowerCase().includes(q)).map((h) => ({ h, text: null }));
  for (const s of seiten) for (const el of s.elemente) if (el.typ === 'text') {
    textNormalisieren(el);
    const t = textInhalt(el), k = t.toLowerCase().indexOf(q);
    if (k >= 0 && nachHeft.has(s.heftId)) treffer.push({ h: nachHeft.get(s.heftId), text: t, k, seite: nachHeft.get(s.heftId).seiten.indexOf(s.id) + 1 });
  }
  ziel.innerHTML = treffer.slice(0, 60).map((t, i) => `<div class="treffer" data-i="${i}">${I.heft}<div><b>${esc(t.h.titel)}</b>${t.text ? `<small>Seite ${t.seite}: ${esc(t.text.slice(Math.max(0, t.k - 30), t.k))}<mark>${esc(t.text.substr(t.k, q.length))}</mark>${esc(t.text.slice(t.k + q.length, t.k + q.length + 50))}</small>` : '<small>Titel</small>'}</div></div>`).join('') || '<p style="color:var(--text-2);text-align:center">Nichts gefunden.</p>';
  ziel.onclick = (e) => { const d = e.target.closest('[data-i]'); if (d) oeffneEditor(treffer[+d.dataset.i].h.id); };
}

/* ================= Abgleich zwischen Geräten ================= */

function wolkeZeigen(st) {
  const w = $('#wolke');
  w.hidden = !st.eingerichtet;
  w.classList.toggle('an', st.angemeldet && !st.fehler);
  w.classList.toggle('fehler', !!st.fehler);
  w.classList.toggle('laeuft', st.laeuft);
  $('.wolke-zeichen', w)?.setAttribute('d', st.fehler ? 'M12 10v3M12 15.5v.1' : st.angemeldet ? 'm9.5 13 2 2 3.5-3.5' : '');
  w.title = st.fehler ? 'Abgleich-Fehler: ' + st.fehler : st.angemeldet ? 'Abgeglichen' : 'Abgleich einrichten';
}
addEventListener('heft-abgleich', (e) => wolkeZeigen(e.detail));
addEventListener('heft-remote', () => { if (!$('#bibliothek').hidden) bibliothekZeigen(); });

$('#wolke').onclick = () => {
  const st = abgleich.zustand;
  if (st.angemeldet) {
    const box = dialog(`<h2>Abgleich</h2>
      <p style="color:var(--text-2);margin:0 0 6px">Angemeldet als <b style="color:var(--text)">${esc(st.email)}</b></p>
      <p style="color:var(--text-2);margin:0 0 16px">${st.fehler ? 'Fehler: ' + esc(st.fehler) : st.letzter ? 'Zuletzt abgeglichen: ' + new Date(st.letzter).toLocaleString('de-DE') : 'Noch nicht abgeglichen.'}</p>
      <div class="dialog-knoepfe"><button class="btn" data-a="ab">Abmelden</button><button class="btn haupt" data-a="jetzt">Jetzt abgleichen</button></div>`);
    box.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'jetzt') { dialogZu(); await abgleich.abgleichen(); hinweis(abgleich.zustand.fehler ? 'Fehler: ' + abgleich.zustand.fehler : 'Abgeglichen'); }
      if (a === 'ab' && await frage('Abmelden?', 'Deine Notizen bleiben auf diesem Gerät, werden aber nicht mehr abgeglichen.', 'Abmelden')) { await abgleich.abmelden(); hinweis('Abgemeldet'); }
    };
    return;
  }
  const box = dialog(`<h2>Abgleich einrichten</h2>
    <p style="color:var(--text-2);margin:0 0 16px;font-size:14px">Mit einem Konto landen deine Notizen automatisch auf allen Geräten. Nimm auf jedem Gerät dieselbe E-Mail und dasselbe Passwort.</p>
    <label class="feld">E-Mail<input type="text" id="a-mail" inputmode="email" autocomplete="username" autocapitalize="off"></label>
    <label class="feld">Passwort<input type="password" id="a-pw" autocomplete="current-password"></label>
    <p id="a-fehler" style="color:#ff453a;margin:0 0 10px;font-size:14px" hidden></p>
    <div class="dialog-knoepfe"><button class="btn" data-a="neu">Konto erstellen</button><button class="btn haupt" data-a="an">Anmelden</button></div>`);
  box.onclick = async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    const mail = $('#a-mail', box).value.trim(), pw = $('#a-pw', box).value;
    const f = $('#a-fehler', box);
    f.hidden = true;
    try {
      if (a === 'an') { await abgleich.anmelden(mail, pw); dialogZu(); hinweis('Angemeldet – Abgleich läuft'); }
      else {
        const bestaetigen = await abgleich.registrieren(mail, pw);
        if (bestaetigen) { f.style.color = 'var(--text-2)'; f.textContent = 'Fast fertig: Öffne den Link in der E-Mail, die gerade kam. Danach hier auf „Anmelden“ tippen.'; f.hidden = false; }
        else { dialogZu(); hinweis('Konto erstellt – Abgleich läuft'); }
      }
    } catch (err) { f.style.color = '#ff453a'; f.textContent = err.message; f.hidden = false; }
  };
};

/* ================= Start ================= */

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
dauerhaftSpeichern();
bibliothekZeigen();
wolkeZeigen(abgleich.zustand);
abgleich.starten().catch((e) => console.warn('Abgleich nicht gestartet', e));
