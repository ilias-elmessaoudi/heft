// Werkzeugreihe (wie GoodNotes 6): Werkzeuge, drei Schnell-Stärken, drei Schnell-Farben und die Einstellungs-Popover.

import { ws, merken, aktFarbe, z, api, $, esc, PALETTE, MARKER_PALETTE } from './zustand.js';
import { I } from './icons.js';
import { STIFTE, zeichneElement } from './zeichnen.js';

const WERKZEUGE = [
  ['zoomfenster', 'Zoom-Fenster'], ['stift', 'Stift (P)'], ['radierer', 'Radierer (E)'], ['marker', 'Textmarker (H)'],
  ['form', 'Formen (S)'], ['lasso', 'Lasso (L)'], ['elemente', 'Elemente'], ['bild', 'Bild'], ['text', 'Text (T)'], ['laser', 'Laserpointer'],
];
const ICON = { stift: I.w_stift, radierer: I.w_radierer, marker: I.w_marker, form: I.w_formen, lasso: I.w_lasso, elemente: I.w_elemente, bild: I.w_bild, text: I.w_text, laser: I.w_laser, zoomfenster: I.zoomfenster };

/* ================= Popover ================= */

export function popover(html, anker, { breite } = {}) {
  const p = $('#popover');
  p.innerHTML = html; p.hidden = false;
  p.style.width = breite ? breite + 'px' : '';
  const r = anker.getBoundingClientRect();
  const b = p.offsetWidth;
  p.style.left = Math.max(8, Math.min(r.left + r.width / 2 - b / 2, innerWidth - b - 8)) + 'px';
  p.style.top = Math.min(r.bottom + 8, innerHeight - p.offsetHeight - 8) + 'px';
  return p;
}
export const popoverZu = () => { $('#popover').hidden = true; };
addEventListener('pointerdown', (e) => {
  if (!$('#popover').hidden && !e.target.closest('#popover') && !e.target.closest('[data-popover-anker]')) popoverZu();
}, true);

/* ================= Werkzeugreihe ================= */

export function werkzeugleisteZeigen() {
  const w = $('#werkzeuge');
  w.innerHTML = WERKZEUGE.map(([k, t]) => {
    const an = k === ws.werkzeug || (k === 'zoomfenster' && api.zoomfensterOffen?.());
    return `<button class="werkzeug ${an ? 'an' : ''}" data-werkzeug="${k}" title="${t}" data-popover-anker>${ICON[k]}</button>`;
  }).join('');
  document.documentElement.style.setProperty('--marker', ws.marker.farben[ws.marker.farbe]);
  schnellZeigen();
}

function schnellZeigen() {
  const s = $('#schnell');
  const w = ws.werkzeug;
  if (w === 'text') return api.textleisteZeigen(s);
  const o = ws[w];
  if (!o?.breiten && !o?.farben) { s.innerHTML = ''; return; }
  const faktor = w === 'marker' ? .22 : w === 'radierer' ? .14 : 1.3;
  s.innerHTML = '<span class="trenner"></span>'
    + (o.breiten || []).map((b, i) => `<button class="schnell-breite ${i === o.breite ? 'an' : ''}" data-breite="${i}" data-popover-anker title="Stärke ${i + 1}"><i style="height:${Math.max(1.5, Math.min(9, b * faktor))}px"></i></button>`).join('')
    + (o.farben ? '<span class="trenner"></span>' + o.farben.map((f, i) => `<button class="schnell-farbe ${i === o.farbe ? 'an' : ''}" data-farbe="${i}" data-popover-anker style="color:${f}" title="${f}"><i style="background:${f}"></i></button>`).join('') : '');
}

$('#werkzeugreihe').addEventListener('click', (e) => {
  const wk = e.target.closest('[data-werkzeug]');
  if (wk) {
    const k = wk.dataset.werkzeug;
    if (k === 'zoomfenster') { api.zoomfensterUmschalten(); return werkzeugleisteZeigen(); }
    if (k === 'bild') return bildMenue(wk);
    if (k === 'elemente') return api.elementePopover(wk);
    // Zweites Antippen öffnet die Einstellungen (wie GoodNotes)
    if (k === ws.werkzeug && $('#popover').hidden) return einstellungen(k, wk);
    api.werkzeugWechsel?.(k);
    ws.werkzeug = k; merken(); popoverZu(); werkzeugleisteZeigen();
    return;
  }
  const o = ws[ws.werkzeug];
  const b = e.target.closest('[data-breite]');
  if (b) {
    const i = +b.dataset.breite;
    if (i === o.breite && $('#popover').hidden) return breitePopover(b, i);
    o.breite = i; merken(); schnellZeigen(); popoverZu(); return;
  }
  const f = e.target.closest('[data-farbe]');
  if (f) {
    const i = +f.dataset.farbe;
    if (i === o.farbe && $('#popover').hidden) return farbSlotPopover(f, i);
    o.farbe = i; merken(); schnellZeigen(); popoverZu();
    api.auswahlEinfaerben?.(o.farben[i]);
  }
});

function breitePopover(anker, i) {
  const o = ws[ws.werkzeug];
  const [min, max, schritt] = ws.werkzeug === 'marker' ? [3, 40, 1] : ws.werkzeug === 'radierer' ? [3, 60, 1] : [.3, 12, .1];
  const p = popover(`<h3>Stärke</h3><div class="regler"><input type="range" min="${min}" max="${max}" step="${schritt}" value="${o.breiten[i]}"><b>${(+o.breiten[i]).toFixed(1)}</b></div>`, anker, { breite: 260 });
  const r = $('input', p);
  r.oninput = () => { o.breiten[i] = +r.value; $('b', p).textContent = (+r.value).toFixed(1); merken(); schnellZeigen(); };
}

function farbSlotPopover(anker, i) {
  const o = ws[ws.werkzeug];
  farbwaehler(anker, {
    titel: { stift: 'Stiftfarbe', marker: 'Textmarker-Farbe', form: 'Formfarbe' }[ws.werkzeug] || 'Farbe',
    farbe: o.farben[i],
    palette: ws.werkzeug === 'marker' ? MARKER_PALETTE : PALETTE,
    gewaehlt: (f) => { o.farben[i] = f; merken(); schnellZeigen(); api.auswahlEinfaerben?.(f); },
  });
}

/* ================= Farbwähler (Voreinstellung / Angepasst + HEX) ================= */

function spektrum() {
  const f = [];
  for (let i = 0; i < 12; i++) { const l = Math.round(100 - i * (100 / 11)); f.push(`hsl(0,0%,${l}%)`); }
  const hues = [200, 220, 250, 280, 320, 350, 10, 30, 45, 60, 90, 140];
  for (const l of [20, 30, 40, 50, 60, 70, 80, 88]) for (const h of hues) f.push(`hsl(${h},${l > 80 ? 70 : 85}%,${l}%)`);
  return f.map(cssHex);
}
function cssHex(c) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = c; return ctx.fillStyle;
}
export function farbwaehler(anker, { titel, farbe, palette = PALETTE, gewaehlt, mitKeine = false }) {
  let reiter = 'voreinstellung';
  const p = popover('', anker, { breite: 310 });
  const zeigen = () => {
    const eigene = ws.eigeneFarben;
    p.innerHTML = `<h3>${esc(titel)}</h3>
      <div class="wahlzeile" style="margin-bottom:12px"><button data-r="voreinstellung" class="${reiter === 'voreinstellung' ? 'an' : ''}">Voreinstellung</button><button data-r="angepasst" class="${reiter === 'angepasst' ? 'an' : ''}">Angepasst</button></div>
      ${reiter === 'voreinstellung' ? `
        <div class="farbraster">${mitKeine ? `<button class="keine ${!farbe ? 'an' : ''}" data-f="" title="Keine"></button>` : ''}${palette.map((f) => `<button data-f="${f}" class="${f === farbe ? 'an' : ''}" style="background:${f}"></button>`).join('')}</div>
        ${eigene.length ? `<div class="abschnitt">Eigene Farben</div><div class="farbraster">${eigene.map((f) => `<button data-f="${f}" class="${f === farbe ? 'an' : ''}" style="background:${f}"></button>`).join('')}</div>` : ''}`
      : `<div class="spektrum">${spektrum().map((f) => `<i data-f="${f}" style="background:${f}" class="${f === farbe ? 'an' : ''}"></i>`).join('')}</div>
        <div class="hexzeile"><span class="muster" style="background:${farbe || 'transparent'}"></span><span style="font-size:12px;color:var(--text-2)">HEX</span><input id="hex" value="${(farbe || '').replace('#', '')}" maxlength="7" spellcheck="false" autocomplete="off"></div>
        <div class="knopfzeile"><button data-a="merken">＋ Zu Voreinstellung</button>${eigene.includes(farbe) ? '<button class="gefahr" data-a="entfernen">Farbe entfernen</button>' : ''}</div>`}`;
    const hex = $('#hex', p);
    if (hex) hex.oninput = () => { const v = hex.value.replace(/[^0-9a-f]/gi, ''); if (v.length === 6 || v.length === 3) setze('#' + (v.length === 3 ? v.replace(/./g, '$&$&') : v).toLowerCase(), false); };
  };
  const setze = (f, neuZeichnen = true) => { farbe = f; gewaehlt(f); if (neuZeichnen) zeigen(); else { const m = $('.muster', p); if (m) m.style.background = f; } };
  p.onclick = (e) => {
    const r = e.target.closest('[data-r]'); if (r) { reiter = r.dataset.r; return zeigen(); }
    const f = e.target.closest('[data-f]'); if (f) return setze(f.dataset.f || null);
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'merken' && farbe && !ws.eigeneFarben.includes(farbe)) { ws.eigeneFarben.push(farbe); merken(); reiter = 'voreinstellung'; zeigen(); }
    if (a === 'entfernen') { ws.eigeneFarben = ws.eigeneFarben.filter((x) => x !== farbe); merken(); zeigen(); }
  };
  zeigen();
  return p;
}

/* ================= Einstellungen je Werkzeug ================= */

function einstellungen(k, anker) {
  if (k === 'stift') return stiftPopover(anker);
  if (k === 'radierer') {
    const o = ws.radierer;
    const p = popover(`<h3>Radierer</h3>
      <div class="wahlzeile"><button data-m="praezision" class="${o.modus === 'praezision' ? 'an' : ''}">Präzisionsradierer</button><button data-m="ganz" class="${o.modus === 'ganz' ? 'an' : ''}">Ganze Striche</button></div>
      <label class="schalter" style="margin-top:12px">Nur Textmarker radieren<input type="checkbox" data-s="nurMarker" ${o.nurMarker ? 'checked' : ''}></label>
      <label class="schalter">Radierer automatisch abwählen<input type="checkbox" data-s="zurueck" ${o.zurueck ? 'checked' : ''}></label>`, anker);
    p.onclick = (e) => { const m = e.target.closest('[data-m]'); if (m) { o.modus = m.dataset.m; merken(); einstellungen(k, anker); } };
    p.onchange = (e) => { const s = e.target.dataset.s; if (s) { o[s] = e.target.checked; merken(); } };
    return;
  }
  if (k === 'marker') {
    const o = ws.marker;
    const p = popover(`<h3>Textmarker</h3><label class="schalter" style="border:0">Gerade Linie<input type="checkbox" ${o.gerade ? 'checked' : ''}></label>
      <p style="font-size:12.5px;color:var(--text-2);margin:4px 2px 0">Gezeichnete Linien werden automatisch gerade. Der Textmarker liegt immer unter der Schrift.</p>`, anker);
    $('input', p).onchange = (e) => { o.gerade = e.target.checked; merken(); };
    return;
  }
  if (k === 'form') {
    const o = ws.form;
    const arten = [['auto', 'Freihand'], ['rechteck', '▭'], ['ellipse', '◯'], ['dreieck', '△'], ['linie', '╱'], ['pfeil', '↗']];
    const p = popover(`<h3>Formen</h3>
      <div class="wahlzeile">${arten.map(([a, n]) => `<button data-art="${a}" class="${o.art === a ? 'an' : ''}" title="${a}">${n}</button>`).join('')}</div>
      <p style="font-size:12.5px;color:var(--text-2);margin:8px 2px">${o.art === 'auto' ? 'Zeichne eine Form – sie wird automatisch begradigt.' : 'Ziehe die Form auf der Seite auf.'}</p>
      <div class="schalter" style="cursor:pointer" data-fuellung>Füllfarbe <span style="display:flex;align-items:center;gap:6px">${o.fuellung ? `<i style="width:22px;height:22px;border-radius:50%;background:${o.fuellung};display:inline-block;box-shadow:inset 0 0 0 1px rgba(127,127,127,.4)"></i>` : 'Keine'} ›</span></div>`, anker);
    p.onclick = (e) => {
      const a = e.target.closest('[data-art]'); if (a) { o.art = a.dataset.art; merken(); return einstellungen(k, anker); }
      if (e.target.closest('[data-fuellung]')) farbwaehler(anker, { titel: 'Füllfarbe', farbe: o.fuellung, mitKeine: true, gewaehlt: (f) => { o.fuellung = f; merken(); api.auswahlFuellen?.(f); } });
    };
    return;
  }
  if (k === 'lasso') {
    const f = ws.lasso.filter;
    const namen = { strich: 'Handschrift', marker: 'Textmarker', form: 'Formen', bild: 'Bilder', text: 'Textfelder' };
    const p = popover(`<h3>Lasso-Werkzeug</h3><div class="abschnitt">Auswählen</div>
      ${Object.entries(namen).map(([k2, n]) => `<label class="schalter">${n}<input type="checkbox" data-f="${k2}" ${f[k2] ? 'checked' : ''}></label>`).join('')}`, anker);
    p.onchange = (e) => { f[e.target.dataset.f] = e.target.checked; merken(); };
    return;
  }
  if (k === 'laser') {
    const p = popover('<h3>Laserpointer</h3><p style="font-size:13px;color:var(--text-2);margin:0">Zum Zeigen: Linien verschwinden nach kurzer Zeit wieder.</p>', anker);
    return p;
  }
  if (k === 'text') return api.textEinstellungen?.(anker);
}

function stiftPopover(anker) {
  const o = ws.stift;
  const p = popover(`<h3>${STIFTE[o.stift].name}</h3>
    <canvas class="vorschau" width="560" height="128"></canvas>
    <div class="abschnitt">Stifttyp</div>
    <div class="stifttypen">${Object.entries(STIFTE).map(([k, v]) => `<button data-stift="${k}" class="${o.stift === k ? 'an' : ''}">${stiftIcon(k)}${v.name}</button>`).join('')}</div>
    ${o.stift === 'fueller' ? `<div class="abschnitt">Schärfe der Spitze</div><div class="regler"><input type="range" min="0" max="100" data-r="schaerfe" value="${Math.round(o.schaerfe * 100)}"><b>${Math.round(o.schaerfe * 100)} %</b></div>` : ''}
    <div class="abschnitt">Druckempfindlichkeit</div><div class="regler"><input type="range" min="0" max="100" data-r="empf" value="${Math.round(o.empf * 100)}"><b>${Math.round(o.empf * 100)} %</b></div>
    <div class="abschnitt">Einstellungen</div>
    <label class="schalter">Zeichnen und halten<input type="checkbox" data-s="halten" ${o.halten ? 'checked' : ''}></label>
    <label class="schalter">Nur mit Stift zeichnen<input type="checkbox" data-s="nurStift" ${z.nurStift ? 'checked' : ''}></label>`, anker, { breite: 320 });
  const vorschau = () => {
    const c = $('canvas', p), ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    const punkte = [];
    for (let i = 0; i <= 80; i++) { const t = i / 80; punkte.push(40 + t * 480, 64 - Math.sin(t * Math.PI * 1.6) * 34, .15 + .85 * Math.sin(t * Math.PI)); }
    ctx.scale(1, 1);
    zeichneElement(ctx, { typ: 'strich', werkzeug: 'stift', stift: o.stift, schaerfe: o.schaerfe, empf: o.empf, farbe: getComputedStyle(document.body).color, breite: Math.max(5, o.breiten[o.breite] * 4), punkte });
  };
  vorschau();
  p.onclick = (e) => { const s = e.target.closest('[data-stift]'); if (s) { o.stift = s.dataset.stift; merken(); stiftPopover(anker); } };
  p.oninput = (e) => { const r = e.target.dataset.r; if (r) { o[r] = e.target.value / 100; e.target.nextElementSibling.textContent = e.target.value + ' %'; merken(); vorschau(); } };
  p.onchange = (e) => {
    const s = e.target.dataset.s;
    if (s === 'halten') { o.halten = e.target.checked; merken(); }
    if (s === 'nurStift') api.setzeNurStift(e.target.checked);
  };
}
function stiftIcon(k) {
  if (k === 'kugel') return '<svg viewBox="0 0 24 24"><path d="M6 18 16.5 7.5a2 2 0 0 0-2.8-2.8L3.2 15.2 3 18z"/><path d="m3 18 1.8-.2"/></svg>';
  if (k === 'pinsel') return '<svg viewBox="0 0 24 24"><path d="M14 10 20 4"/><path d="M14 10c-1.5-1.5-4-1.2-5 .5-1.4 2.4-1 4-4 6 3 1 7.5.4 9-1.5 1.3-1.6 1.5-3.5 0-5z"/></svg>';
  return '<svg viewBox="0 0 24 24"><path d="M5 19 9 9l6-5 5 5-5 6z"/><path d="M5 19l5-5"/><circle cx="11.5" cy="12.5" r="1.3"/></svg>';
}

/* ================= Bild-Menü ================= */

function bildMenue(anker) {
  const p = popover(`<h3>Bild einfügen</h3><div class="liste-knoepfe">
    <button data-b="datei">${I.bild}Foto oder Datei auswählen</button>
    <button data-b="ablage">${I.kopie}Aus Zwischenablage einfügen</button></div>
    <p style="font-size:12.5px;color:var(--text-2);margin:8px 4px 0">Tipp: Bilder aus Safari, Pinterest oder Fotos einfach auf die Seite ziehen. Danach im Bild-Menü „Freistellen“ für Sticker ohne Hintergrund.</p>`, anker);
  p.onclick = async (e) => {
    const b = e.target.closest('[data-b]')?.dataset.b; if (!b) return;
    popoverZu();
    if (b === 'datei') $('#datei-bild').click();
    if (b === 'ablage') api.ausZwischenablage();
  };
}
