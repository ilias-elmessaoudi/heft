// Text-Werkzeug: Textfelder anlegen und bearbeiten, Schrift/Größe/Stil/Farbe für markierten Text oder ganze Felder.

import { ws, merken, z, api, $, esc, massstab, PALETTE } from './zustand.js';
import { I } from './icons.js';
import { rahmen, rahmenVergessen, kopie, textNormalisieren, textMasse, messCtx, RASTER, SYSTEM, zeilenhoehe, aufLinieSetzen, textTeilen, textPolster, schriftCss } from './zeichnen.js';
import { alleSchriften, schriftLaden, vorschauLaden, schriftHinzufuegen } from './schriften.js';
import { popover, popoverZu, farbwaehler } from './werkzeugleiste.js';

let edit = null; // { feld, el, s, vorher, neu, griff }

const GROESSEN = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 60, 72, 96];

/* ================= Umwandeln: Textabsätze <-> HTML ================= */

const hex = (rgb) => {
  const m = rgb.match(/\d+(\.\d+)?/g); if (!m) return '#000000';
  return '#' + m.slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('');
};
const ersteSchrift = (f) => f.split(',')[0].trim().replace(/^["']|["']$/g, '');

function laufZuHtml(r, m) {
  const deko = [r.u && 'underline', r.s && 'line-through'].filter(Boolean).join(' ') || 'none';
  return `<span style="font-family:'${r.f.replace(/'/g, '')}', ${SYSTEM.replace(/"/g, "'")};font-size:${r.g * m}px;color:${r.c};font-weight:${r.b ? 700 : 400};font-style:${r.i ? 'italic' : 'normal'};text-decoration:${deko}">${esc(r.t)}</span>`;
}
function absaetzeZuHtml(el, m) {
  return el.absaetze.map((a) => `<div>${a.filter((r) => r.t).map((r) => laufZuHtml(r, m)).join('') || `<span style="font-family:'${a[0]?.f || ws.text.schrift}', ${SYSTEM.replace(/"/g, "'")};font-size:${(a[0]?.g || ws.text.groesse) * m}px;color:${a[0]?.c || ws.text.farbe}"><br></span>`}</div>`).join('');
}

function domZuAbsaetze(feld, m) {
  const absaetze = [[]];
  let neu = false;
  const block = (n) => n.nodeType === 1 && /^(DIV|P|LI|H\d)$/.test(n.nodeName);
  const deko = (el) => { let u = false, s = false; for (let e = el; e && e !== feld.parentNode; e = e.parentElement) { const d = getComputedStyle(e).textDecorationLine; if (d.includes('underline') || e.nodeName === 'U') u = true; if (d.includes('line-through') || /^(S|STRIKE)$/.test(e.nodeName)) s = true; } return { u, s }; };
  const lauf = (text, el) => {
    const cs = getComputedStyle(el);
    const { u, s } = deko(el);
    return { t: text, f: ersteSchrift(cs.fontFamily), g: Math.round((parseFloat(cs.fontSize) / m) * 10) / 10, c: hex(cs.color), b: +cs.fontWeight >= 600, i: cs.fontStyle === 'italic', u, s };
  };
  const gehen = (n) => {
    for (const k of n.childNodes) {
      if (k.nodeType === 3) {
        if (!k.textContent) continue;
        if (neu) { absaetze.push([]); neu = false; }
        absaetze.at(-1).push(lauf(k.textContent.replace(/​/g, ''), k.parentElement));
      } else if (k.nodeName === 'BR') {
        if (neu) absaetze.push([]);
        neu = true;
        // Leerer Absatz merkt sich trotzdem seine Größe
        if (!absaetze.at(-1).length) absaetze.at(-1).push({ ...lauf('', k.parentElement) });
      } else if (k.nodeType === 1) {
        if (block(k) && (absaetze.at(-1).length || absaetze.length > 1)) neu = true;
        gehen(k);
        if (block(k)) neu = true;
      }
    }
  };
  gehen(feld);
  // Gleiche Läufe zusammenfassen
  return absaetze.map((a) => {
    const zus = [];
    for (const r of a) {
      const l = zus.at(-1);
      if (l && ['f', 'g', 'c', 'b', 'i', 'u', 's'].every((k) => l[k] === r[k])) l.t += r.t; else zus.push({ ...r });
    }
    const voll = zus.filter((r) => r.t);
    return voll.length ? voll : [{ ...(zus[0] || standardLauf()), t: '' }];
  });
}
const standardLauf = () => ({ t: '', f: ws.text.schrift, g: ws.text.groesse, c: ws.text.farbe, b: ws.text.b, i: ws.text.i, u: ws.text.u, s: ws.text.s });

/* ================= Anlegen und Bearbeiten ================= */

export function textBearbeitet() { return !!edit; }

export function textAnlegen(s, x, y, vorhanden) {
  textFertig();
  api.auswahlAufheben();
  if (!vorhanden) vorhanden = textAn(s, x, y);
  const raster = !s.hintergrund && RASTER[s.vorlage] ? { ...RASTER[s.vorlage] } : null;
  const el = vorhanden || {
    typ: 'text', x, y: y - ws.text.groesse * .7, b: s.breite - x - RAND, drehung: 0, ausrichtung: ws.text.ausrichtung,
    hintergrund: ws.text.hintergrund, absaetze: [[standardLauf()]], raster,
  };
  textNormalisieren(el);
  // Alte Felder auf liniertem Papier rasten beim ersten Bearbeiten ebenfalls auf die Linien ein
  if (!vorhanden || el.raster === undefined) { el.raster = raster; aufLinieSetzen(el); }
  imBlatt(el, s);
  const vorher = vorhanden ? kopie(vorhanden) : null;
  if (vorhanden) { vorhanden._versteckt = true; api.tinteRendern(s); }
  const feld = document.createElement('div');
  feld.className = 'textfeld';
  feld.contentEditable = 'true';
  feld.spellcheck = true;
  z.dom.get(s.id).el.append(feld);
  const griff = document.createElement('div');
  griff.className = 'textfeld-breite';
  const schieber = document.createElement('div');
  schieber.className = 'textfeld-schieben';
  schieber.title = 'Textfeld verschieben';
  schieber.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>';
  z.dom.get(s.id).el.append(griff, schieber);
  edit = { feld, el, s, vorher, neu: !vorhanden, griff, schieber };
  feldAnpassen();
  feld.innerHTML = absaetzeZuHtml(el, massstab());
  setTimeout(() => {
    feld.focus();
    const sel = getSelection(); sel.selectAllChildren(feld); if (!vorhanden) sel.collapseToEnd(); else sel.collapseToEnd();
    document.execCommand('styleWithCSS', false, true);
  }, 0);
  feld.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); textFertig(); } e.stopPropagation(); });
  feld.addEventListener('blur', () => setTimeout(() => { if (edit?.feld === feld && !document.activeElement?.closest?.('#popover, #werkzeugreihe') && !$('#popover').contains(document.activeElement)) textFertig(); }, 150));
  feld.addEventListener('input', () => {
    if (!edit) return;
    griffPosition();
    clearTimeout(edit.nachziehen);
    edit.nachziehen = setTimeout(nachziehen, 120);
  });
  // Ziehen am Verschiebe-Griff: Feld wandert mit, rastet beim Loslassen auf die nächste Linie ein
  schieber.addEventListener('mousedown', (e) => e.preventDefault());
  schieber.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, x0 = edit.el.x, y0 = edit.el.y, b0 = edit.el.b, m = massstab();
    // Nach rechts gezogen wird das Feld schmaler (Text bricht neu um), statt über den Blattrand zu ragen
    const bew = (ev) => { edit.el.x = Math.min(x0 + (ev.clientX - sx) / m, edit.s.breite - 68); edit.el.y = y0 + (ev.clientY - sy) / m; edit.el.b = b0; imBlatt(edit.el, edit.s); feldAnpassen(); };
    const los = () => { removeEventListener('pointermove', bew); removeEventListener('pointerup', los); aufLinieSetzen(edit.el); imBlatt(edit.el, edit.s); feldAnpassen(); feld.focus(); };
    addEventListener('pointermove', bew); addEventListener('pointerup', los);
  });
  // Breite des Textfelds ziehen
  griff.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const start = e.clientX, b0 = edit.el.b, m = massstab();
    const bew = (ev) => { edit.el.b = Math.max(40, Math.min(edit.s.breite - RAND - edit.el.x, b0 + (ev.clientX - start) / m)); feldAnpassen(); };
    const los = () => { removeEventListener('pointermove', bew); removeEventListener('pointerup', los); feld.focus(); };
    addEventListener('pointermove', bew); addEventListener('pointerup', los);
  });
  textleisteZeigen($('#schnell'));
}

function feldAnpassen() {
  const { feld, el } = edit, m = massstab();
  const pad = textPolster(el), r = el.absaetze[0]?.[0];
  Object.assign(feld.style, {
    left: el.x * m + 'px', top: el.y * m + 'px', width: el.b * m + 'px', padding: pad * m + 'px',
    font: r ? schriftCss({ ...r, g: r.g * m }) : '', lineHeight: zeilenhoehe(el) * m + 'px',
    background: el.hintergrund || 'transparent', border: el.rand ? `${1.2 * m}px solid ${el.rand}` : '0', borderRadius: 6 * m + 'px',
    textAlign: { links: 'left', mitte: 'center', rechts: 'right' }[el.ausrichtung || 'links'],
    transform: el.drehung ? `rotate(${el.drehung}rad)` : '', transformOrigin: 'center',
  });
  griffPosition();
}
function griffPosition() {
  if (!edit) return;
  const { feld, griff, schieber } = edit;
  griff.style.left = feld.offsetLeft + feld.offsetWidth - 6 + 'px';
  griff.style.top = feld.offsetTop + feld.offsetHeight / 2 - 13 + 'px';
  schieber.style.left = feld.offsetLeft - 30 + 'px';
  schieber.style.top = feld.offsetTop - 4 + 'px';
}

// Feld bleibt im Blatt: nie links/rechts heraus; ist es zu breit, wird es schmaler statt zu überstehen
const RAND = 24;
function imBlatt(el, s, nurVerschieben = false) {
  el.x = Math.max(8, el.x);
  if (!nurVerschieben && el.x + el.b > s.breite - 8) el.b = Math.max(60, s.breite - 8 - el.x);
  if (el.x + el.b > s.breite - 8) el.x = Math.max(8, s.breite - 8 - el.b);
  el.y = Math.max(4, Math.min(el.y, s.hoehe - zeilenhoehe(el) - 8));
  rahmenVergessen(el);
}

// Beim Tippen: Größe/Linie nachziehen; läuft der Text unten über die Seite, geht es auf der nächsten weiter
let teilen = false;
async function nachziehen() {
  if (!edit || teilen) return;
  const m = edit.alteM || massstab();
  edit.el.absaetze = domZuAbsaetze(edit.feld, m);
  aufLinieSetzen(edit.el);
  feldAnpassen();
  const probe = kopie(edit.el);
  if (!textTeilen(probe, edit.s.hoehe)) return;
  teilen = true;
  try {
    const { s } = edit;
    const rest = textFertig();
    if (!rest) return;
    const naechste = await api.naechsteSeite(s);
    const fortsetzung = { ...rest, y: 0 };
    fortsetzung.raster = !naechste.hintergrund && RASTER[naechste.vorlage] ? { ...RASTER[naechste.vorlage] } : null;
    fortsetzung.y = (fortsetzung.raster ? fortsetzung.raster.oben : 40) - 10;
    aufLinieSetzen(fortsetzung);
    naechste.elemente.push(fortsetzung);
    api.aktion({ typ: 'hinzu', seite: naechste, elemente: [fortsetzung] });
    api.seiteGeaendert(naechste);
    api.zuSeite(z.seiten.indexOf(naechste));
    setTimeout(() => textAnlegen(naechste, fortsetzung.x, fortsetzung.y, fortsetzung), 250);
  } finally { setTimeout(() => (teilen = false), 400); }
}
export function textNeuPositionieren() { if (edit) { const html = edit.feld.innerHTML; const alt = edit.alteM || massstab(); edit.el.absaetze = domZuAbsaetze(edit.feld, alt); edit.feld.innerHTML = absaetzeZuHtml(edit.el, massstab()); edit.alteM = massstab(); feldAnpassen(); void html; } }

// Textfeld an einer Stelle der Seite?
export function textAn(s, x, y) {
  return [...s.elemente].reverse().find((t) => t.typ === 'text' && (() => { const r = rahmen(t); return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2; })());
}

export function textFertig() {
  if (!edit) return;
  const { feld, el, s, vorher, neu, griff, schieber } = edit;
  const m = edit.alteM || massstab();
  clearTimeout(edit.nachziehen);
  el.absaetze = domZuAbsaetze(feld, m);
  edit = null;
  feld.remove(); griff.remove(); schieber.remove();
  delete el._versteckt;
  aufLinieSetzen(el);
  imBlatt(el, s);
  const rest = textTeilen(el, s.hoehe);
  const leer = !el.absaetze.some((a) => a.some((r) => r.t.trim()));
  if (neu && !leer) { s.elemente.push(el); api.aktion({ typ: 'hinzu', seite: s, elemente: [el] }); }
  else if (!neu && leer) { const i = s.elemente.indexOf(el); s.elemente.splice(i, 1); api.aktion({ typ: 'weg', seite: s, elemente: [el], indizes: [i] }); }
  else if (!neu && JSON.stringify(vorher) !== JSON.stringify(kopie(el))) api.aktion({ typ: 'aendern', seite: s, paare: [[el, vorher, kopie(el)]] });
  rahmenVergessen(el);
  api.tinteRendern(s);
  api.seiteGeaendert(s);
  textleisteZeigen($('#schnell'));
  return rest;
}

/* ================= Formatieren ================= */

// Ziel einer Formatierung: markierter Text im offenen Feld, sonst ausgewählte Textfelder, sonst Standard für neue Felder
function formatieren({ befehl, wert, lauf, feld: feldFn }) {
  if (edit) {
    edit.feld.focus();
    const sel = getSelection();
    // Markierung wiederherstellen, falls ein Popover sie weggenommen hat
    if (edit.bereich && !(sel.rangeCount && edit.feld.contains(sel.getRangeAt(0).commonAncestorContainer))) { sel.removeAllRanges(); sel.addRange(edit.bereich); }
    if (befehl === 'groesse') {
      // fontSize kennt nur 1–7: erst 7 setzen, dann durch echte Pixel ersetzen
      document.execCommand('fontSize', false, '7');
      for (const f of edit.feld.querySelectorAll('font[size="7"]')) { const sp = document.createElement('span'); sp.style.fontSize = wert * massstab() + 'px'; sp.innerHTML = f.innerHTML; f.replaceWith(sp); }
      for (const sp of edit.feld.querySelectorAll('span[style*="xxx-large"]')) sp.style.fontSize = wert * massstab() + 'px';
    } else if (befehl) document.execCommand(befehl, false, wert);
    if (feldFn) { feldFn(edit.el); feldAnpassen(); }
    if (sel.isCollapsed && lauf) Object.assign(ws.text, lauf), merken();
    textleisteZeigen($('#schnell'));
    return;
  }
  const texte = (z.auswahl?.elemente || []).filter((e) => e.typ === 'text');
  if (texte.length) {
    api.auswahlAendern((el) => {
      if (el.typ !== 'text') return;
      if (lauf) for (const a of el.absaetze) for (const r of a) Object.assign(r, lauf);
      if (feldFn) feldFn(el);
    });
  }
  if (lauf) Object.assign(ws.text, lauf);
  if (feldFn) feldFn(ws.text);
  merken();
  textleisteZeigen($('#schnell'));
}

// Aktueller Stil an der Schreibmarke (für die Anzeige in der Leiste)
function aktStil() {
  if (edit) {
    const sel = getSelection();
    const n = sel.anchorNode && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode);
    if (n && edit.feld.contains(n)) {
      const cs = getComputedStyle(n);
      return { f: ersteSchrift(cs.fontFamily), g: Math.round(parseFloat(cs.fontSize) / massstab()), c: hex(cs.color), b: +cs.fontWeight >= 600, i: cs.fontStyle === 'italic', u: document.queryCommandState('underline'), s: document.queryCommandState('strikeThrough'), ausrichtung: edit.el.ausrichtung, hintergrund: edit.el.hintergrund };
    }
  }
  const t = (z.auswahl?.elemente || []).find((e) => e.typ === 'text');
  if (t) { const r = t.absaetze[0][0]; return { ...r, ausrichtung: t.ausrichtung, hintergrund: t.hintergrund }; }
  return { f: ws.text.schrift, g: ws.text.groesse, c: ws.text.farbe, b: ws.text.b, i: ws.text.i, u: ws.text.u, s: ws.text.s, ausrichtung: ws.text.ausrichtung, hintergrund: ws.text.hintergrund };
}
document.addEventListener('selectionchange', () => {
  const sel = getSelection();
  if (edit && sel.rangeCount && edit.feld.contains(sel.getRangeAt(0).commonAncestorContainer)) edit.bereich = sel.getRangeAt(0).cloneRange();
  if (edit && ws.werkzeug === 'text') { clearTimeout(aktStil.t); aktStil.t = setTimeout(() => textleisteZeigen($('#schnell')), 120); } });

export function textleisteZeigen(ziel) {
  if (ws.werkzeug !== 'text' && !edit && !(z.auswahl?.elemente || []).some((e) => e.typ === 'text')) return;
  const st = aktStil();
  ziel.innerHTML = `<span class="trenner"></span>
    <button class="chip schrift" data-t="schrift" data-popover-anker title="Schriftart"><span style="font-family:'${esc(st.f)}'">${esc(st.f)}</span>${I.pfeilRunter}</button>
    <span class="groesse"><button data-t="kleiner" title="Kleiner">${I.minus}</button><input data-t="g" value="${st.g}" inputmode="decimal"><button data-t="groesser" title="Größer">${I.plus}</button></span>
    <button class="chip ${st.b ? 'an' : ''}" data-t="fett" title="Fett">${I.fett}</button>
    <button class="chip ${st.i ? 'an' : ''}" data-t="kursiv" title="Kursiv">${I.kursiv}</button>
    <button class="chip ${st.u ? 'an' : ''}" data-t="unter" title="Unterstrichen">${I.unter}</button>
    <button class="chip ${st.s ? 'an' : ''}" data-t="durch" title="Durchgestrichen">${I.durch}</button>
    <button class="chip" data-t="ausrichtung" title="Ausrichtung">${I[st.ausrichtung || 'links']}</button>
    <span class="trenner"></span>
    <button class="schnell-farbe an" data-t="farbe" data-popover-anker title="Textfarbe" style="color:${st.c}"><i style="background:${st.c}"></i></button>
    <button class="chip" data-t="box" data-popover-anker title="Hintergrund des Textfelds"><i style="width:18px;height:18px;border-radius:4px;display:inline-block;background:${st.hintergrund || 'transparent'};box-shadow:inset 0 0 0 1.5px currentColor"></i></button>`;
}

$('#werkzeugreihe').addEventListener('pointerdown', (e) => { if (edit && e.target.closest('[data-t]') && !e.target.closest('input')) e.preventDefault(); }); // Markierung im Feld behalten
$('#popover').addEventListener('pointerdown', (e) => { if (edit && !e.target.closest('input')) e.preventDefault(); });
$('#werkzeugreihe').addEventListener('click', (e) => {
  const t = e.target.closest('[data-t]')?.dataset.t; if (!t || t === 'g') return;
  const st = aktStil();
  if (t === 'schrift') return schriftPopover(e.target.closest('[data-t]'));
  if (t === 'kleiner' || t === 'groesser') {
    const g = t === 'groesser' ? (GROESSEN.find((x) => x > st.g) || st.g + 8) : ([...GROESSEN].reverse().find((x) => x < st.g) || Math.max(4, st.g - 2));
    return formatieren({ befehl: 'groesse', wert: g, lauf: { g }, groesse: g });
  }
  if (t === 'fett') return formatieren({ befehl: 'bold', lauf: { b: !st.b } });
  if (t === 'kursiv') return formatieren({ befehl: 'italic', lauf: { i: !st.i } });
  if (t === 'unter') return formatieren({ befehl: 'underline', lauf: { u: !st.u } });
  if (t === 'durch') return formatieren({ befehl: 'strikeThrough', lauf: { s: !st.s } });
  if (t === 'ausrichtung') {
    const n = { links: 'mitte', mitte: 'rechts', rechts: 'links' }[st.ausrichtung || 'links'];
    return formatieren({ feld: (el) => { el.ausrichtung = n; } });
  }
  if (t === 'farbe') return farbwaehler(e.target.closest('[data-t]'), { titel: 'Textfarbe', farbe: st.c, gewaehlt: (f) => formatieren({ befehl: 'foreColor', wert: f, lauf: { c: f } }) });
  if (t === 'box') return farbwaehler(e.target.closest('[data-t]'), { titel: 'Hintergrund', farbe: st.hintergrund, mitKeine: true, palette: ['#fde2e4', '#fad2e1', '#e2ece9', '#bee1e6', '#dfe7fd', '#cddafd', '#fff1c1', '#ffe5b4', '#e8e8e8', '#d0f4de', '#f1c0e8', '#ffffff', ...PALETTE.slice(0, 12)], gewaehlt: (f) => formatieren({ feld: (el) => { el.hintergrund = f; } }) });
});
$('#werkzeugreihe').addEventListener('change', (e) => {
  if (e.target.dataset.t !== 'g') return;
  const g = Math.max(4, Math.min(300, parseFloat(e.target.value.replace(',', '.')) || 16));
  formatieren({ befehl: 'groesse', wert: g, lauf: { g } });
});
$('#werkzeugreihe').addEventListener('keydown', (e) => { if (e.target.dataset.t === 'g') { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); } });

/* ================= Schriftauswahl ================= */

export function schriftPopover(anker) {
  let filter = '';
  const st = aktStil();
  const p = popover('', anker, { breite: 320 });
  const zeigen = () => {
    const alle = alleSchriften().filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()));
    const gruppen = {};
    for (const s of alle) (gruppen[s.gruppe] ||= []).push(s);
    p.innerHTML = `<div class="kopfzeile"><button data-a="hinzu" title="Eigene Schrift (TTF/OTF) hinzufügen">＋ Datei</button><h3>Schriften</h3><span style="min-width:50px"></span></div>
      <label class="suchfeld" style="height:34px;margin-bottom:8px">${I.lupe}<input id="schrift-suche" placeholder="Suchen" value="${esc(filter)}"></label>
      ${!filter && ws.zuletztSchriften.length ? `<div class="abschnitt">Zuletzt</div><div class="zuletzt">${ws.zuletztSchriften.map((n) => `<button data-s="${esc(n)}" style="font-family:'${esc(n)}'">${esc(n)}</button>`).join('')}</div>` : ''}
      <div class="schriftliste">${Object.entries(gruppen).map(([g, l]) => `<div class="abschnitt">${esc(g)}</div>${l.map((s) => `<button data-s="${esc(s.name)}" class="${s.name === st.f ? 'an' : ''}" style="font-family:'${esc(s.name)}', system-ui">${esc(s.name)}</button>`).join('')}`).join('') || '<p style="color:var(--text-2);text-align:center">Keine Schrift gefunden.</p>'}</div>`;
    for (const s of alle) if (s.google) vorschauLaden(s.name);
    const inp = $('#schrift-suche', p);
    inp.oninput = () => { filter = inp.value; const pos = inp.selectionStart; zeigen(); const n = $('#schrift-suche', p); n.focus(); n.setSelectionRange(pos, pos); };
    inp.onkeydown = (e) => e.stopPropagation();
  };
  zeigen();
  p.onpointerdown = (e) => { if (edit && e.target.closest('[data-s]')) e.preventDefault(); };
  p.onclick = async (e) => {
    if (e.target.closest('[data-a=hinzu]')) { $('#datei-schrift').click(); return; }
    const b = e.target.closest('[data-s]'); if (!b) return;
    const name = b.dataset.s;
    await schriftLaden(name);
    ws.zuletztSchriften = [name, ...ws.zuletztSchriften.filter((n) => n !== name)].slice(0, 8);
    formatieren({ befehl: 'fontName', wert: name, lauf: { f: name } });
    popoverZu();
    api.alleTinteRendern?.();
  };
}

$('#datei-schrift').onchange = async (e) => {
  const d = e.target.files[0]; e.target.value = '';
  if (!d) return;
  try {
    const name = await schriftHinzufuegen(d);
    api.hinweis(`Schrift „${name}“ hinzugefügt`);
    ws.zuletztSchriften = [name, ...ws.zuletztSchriften.filter((n) => n !== name)].slice(0, 8); merken();
    formatieren({ befehl: 'fontName', wert: name, lauf: { f: name } });
  } catch (err) { api.hinweis(err.message); }
};

export function textEinstellungen(anker) {
  const p = popover(`<h3>Text</h3><div class="liste-knoepfe">
    <button data-a="schrift">${I.w_text}Schriftart wählen …</button>
    <button data-a="datei">${I.plus}Eigene Schrift hinzufügen (TTF/OTF)</button></div>
    <p style="font-size:12.5px;color:var(--text-2);margin:8px 4px 0">Schriften z. B. von dafont.com herunterladen und hier hinzufügen. Sie stehen dann auf allen Geräten bereit.</p>`, anker);
  p.onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'schrift') schriftPopover(anker);
    if (a === 'datei') $('#datei-schrift').click();
  };
}

// Maße eines Textfelds (für Auswahlrahmen)
export const textHoehe = (el) => textMasse(messCtx, el).h;
