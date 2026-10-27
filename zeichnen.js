// Alles, was auf eine Seite gemalt wird: Papiervorlagen und Elemente.
// Koordinaten sind Seiten-Einheiten (PDF-Punkte, A4 = 595 x 842). Die gleichen Formen nutzt der PDF-Export.

export const A4 = { breite: 595.28, hoehe: 841.89 };
export const FORMATE = {
  a4: { name: 'A4', breite: 595.28, hoehe: 841.89 },
  letter: { name: 'Letter', breite: 612, hoehe: 792 },
  a5: { name: 'A5', breite: 419.53, hoehe: 595.28 },
  quadrat: { name: 'Quadrat', breite: 600, hoehe: 600 },
  breit: { name: 'Widescreen 16:9', breite: 842, hoehe: 473.6 },
};

export const PAPIER = {
  weiss: { name: 'Weiß', grund: '#ffffff', linie: 'rgba(60, 90, 140, .22)', rand: 'rgba(220, 70, 70, .35)', text: 'rgba(40, 50, 70, .55)' },
  gelb: { name: 'Gelb', grund: '#fbf3dc', linie: 'rgba(120, 100, 60, .24)', rand: 'rgba(200, 80, 60, .35)', text: 'rgba(90, 70, 40, .6)' },
  dunkel: { name: 'Dunkel', grund: '#20242e', linie: 'rgba(255, 255, 255, .14)', rand: 'rgba(255, 120, 120, .38)', text: 'rgba(255, 255, 255, .5)' },
};
PAPIER.creme = PAPIER.gelb; // ältere Hefte

export const VORLAGEN = {
  leer: { name: 'Leer', gruppe: 'Herkömmlich' },
  punkte: { name: 'Gepunktet', gruppe: 'Herkömmlich' },
  liniert: { name: 'Liniert', gruppe: 'Herkömmlich' },
  eng: { name: 'Eng liniert', gruppe: 'Herkömmlich' },
  kariert: { name: 'Kariert', gruppe: 'Herkömmlich' },
  cornell: { name: 'Cornell', gruppe: 'Schreibpapier' },
  notizblock: { name: 'Notizblock', gruppe: 'Schreibpapier' },
  gemischt: { name: 'Eine Spalte gemischt', gruppe: 'Schreibpapier' },
  zweispaltig: { name: 'Zwei Spalten', gruppe: 'Schreibpapier' },
  todo: { name: 'To-do-Liste', gruppe: 'Planer' },
  tag: { name: 'Tagesplaner', gruppe: 'Planer' },
  woche: { name: 'Wochenplaner', gruppe: 'Planer' },
  noten: { name: 'Notenpapier', gruppe: 'Sonstiges' },
};

// Bestandteile einer Vorlage als einfache Listen, damit Bildschirm und PDF dasselbe zeichnen.
export function vorlage(name, b, h) {
  const linien = [], punkte = [], kaesten = [], texte = [];
  const L = (x1, y1, x2, y2, rand) => linien.push({ x1, y1, x2, y2, rand });
  const zeilen = (oben, unten, abstand, x1 = 0, x2 = b) => { for (let y = oben; y < unten; y += abstand) L(x1, y, x2, y); };
  const raster = (x1, y1, x2, y2, a = 17.5) => { for (let x = x1 + a; x < x2 - .1; x += a) L(x, y1, x, y2); for (let y = y1 + a; y < y2 - .1; y += a) L(x1, y, x2, y); };
  switch (name) {
    case 'punkte': for (let x = 17.5; x < b; x += 17.5) for (let y = 17.5; y < h; y += 17.5) punkte.push([x, y]); break;
    case 'liniert': zeilen(72, h - 30, 24); L(64, 0, 64, h, true); break;
    case 'eng': zeilen(60, h - 24, 18); L(52, 0, 52, h, true); break;
    case 'kariert': raster(0, 0, b, h); break;
    case 'cornell': zeilen(90, h - 150, 24); L(150, 60, 150, h - 150, true); L(0, 60, b, 60, true); L(0, h - 150, b, h - 150, true); break;
    case 'notizblock': L(0, 70, b, 70, true); zeilen(94, h - 30, 24); L(48, 70, 48, h, true); break;
    case 'gemischt': { const m = Math.round(h * .55); zeilen(60, m, 24); raster(0, m, b, h); break; }
    case 'zweispaltig': zeilen(72, h - 30, 24, 0, b / 2 - 8); zeilen(72, h - 30, 24, b / 2 + 8, b); L(b / 2, 50, b / 2, h - 30, true); break;
    case 'todo':
      texte.push({ x: 40, y: 56, t: 'To-do', g: 18 });
      for (let y = 92; y < h - 40; y += 30) { kaesten.push({ x: 40, y: y - 15, b: 12, h: 12 }); L(64, y, b - 40, y); }
      break;
    case 'tag':
      texte.push({ x: 40, y: 50, t: 'Datum:', g: 12 });
      for (let i = 0; i <= 16; i++) { const y = 80 + i * ((h - 120) / 16); L(40, y, b - 40, y); if (i < 16) texte.push({ x: 42, y: y + 14, t: `${String(6 + i).padStart(2, '0')}:00`, g: 9 }); }
      L(84, 80, 84, h - 40, true);
      break;
    case 'woche': {
      const tage = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag', 'Notizen'];
      const sw = (b - 60) / 2, sh = (h - 90) / 4;
      tage.forEach((t, i) => { const x = 30 + (i % 2) * sw, y = 60 + Math.floor(i / 2) * sh; kaesten.push({ x, y, b: sw - 8, h: sh - 8 }); texte.push({ x: x + 8, y: y + 16, t, g: 11 }); });
      break;
    }
    case 'noten': for (let y0 = 70; y0 < h - 60; y0 += 70) for (let k = 0; k < 5; k++) L(40, y0 + k * 7, b - 40, y0 + k * 7); break;
  }
  return { linien, punkte, kaesten, texte };
}

export function zeichnePapier(ctx, seite) {
  const { breite: b, hoehe: h } = seite;
  const farben = PAPIER[seite.papier] || PAPIER.weiss;
  if (!seite.hintergrund) { ctx.fillStyle = farben.grund; ctx.fillRect(0, 0, b, h); }
  const v = vorlage(seite.vorlage, b, h);
  // Bei kleiner Darstellung (Vorschau) Linien mindestens ~1 Pixel dick halten
  const s = ctx.getTransform().a || 1;
  ctx.lineWidth = Math.max(.6, .9 / s);
  for (const z of v.linien) { ctx.strokeStyle = z.rand ? farben.rand : farben.linie; ctx.beginPath(); ctx.moveTo(z.x1, z.y1); ctx.lineTo(z.x2, z.y2); ctx.stroke(); }
  ctx.strokeStyle = farben.linie;
  for (const k of v.kaesten) ctx.strokeRect(k.x, k.y, k.b, k.h);
  ctx.fillStyle = farben.linie;
  const r = Math.max(.9, .8 / s);
  for (const [x, y] of v.punkte) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  ctx.fillStyle = farben.text;
  for (const t of v.texte) { ctx.font = `600 ${t.g}px ${SYSTEM}`; ctx.fillText(t.t, t.x, t.y); }
}

/* ================= Striche ================= */

// Stifttypen wie bei GoodNotes. empf = Druckempfindlichkeit (0..1), schaerfe = Schärfe der Spitze (0..1)
export const STIFTE = {
  fueller: { name: 'Füllfederhalter' },
  kugel: { name: 'Kugelschreiber' },
  pinsel: { name: 'Pinselstift' },
};

function radien(el) {
  const p = el.punkte, n = p.length / 3, r = new Array(n);
  const b = el.breite / 2;
  if (el.werkzeug === 'marker') { r.fill(b); return r; }
  const empf = el.empf ?? .5, scharf = el.schaerfe ?? .5;
  for (let i = 0; i < n; i++) {
    const d = p[i * 3 + 2];
    if (!el.stift) { r[i] = b * (0.35 + 0.95 * d); continue; } // ältere Striche
    if (el.stift === 'kugel') r[i] = b * (1 - empf * .45 + empf * .9 * d);
    else if (el.stift === 'pinsel') r[i] = b * ((1 - empf) * .9 + empf * (0.12 + 2 * Math.pow(d, 1.3)));
    else {
      // Füller: dicker bei Druck und je nach Schreibrichtung (schräge Feder)
      const a = p[Math.min(n - 1, i + 1) * 3] - p[Math.max(0, i - 1) * 3], c = p[Math.min(n - 1, i + 1) * 3 + 1] - p[Math.max(0, i - 1) * 3 + 1];
      const richtung = (a || c) ? Math.abs(Math.sin(Math.atan2(c, a) + Math.PI / 4)) : .5;
      r[i] = b * ((1 - empf) * .9 + empf * (0.3 + 1.2 * d)) * (1 - scharf * .5 + scharf * .8 * richtung);
    }
  }
  // Enden ausdünnen, wirkt wie Tinte (Pinsel stärker)
  const enden = el.stift === 'pinsel' ? 7 : el.stift === 'kugel' ? 0 : 3;
  if (n > enden * 2) for (let i = 0; i < enden; i++) { const f = .35 + .65 * (i / enden); r[i] *= f; r[n - 1 - i] *= f; }
  return r;
}

// Strich als Bausteine: je Abschnitt ein Viereck plus ein Kreis an jedem Punkt. Gemeinsam gefüllt ohne Kleckse.
export function strichTeile(el) {
  const p = el.punkte, n = p.length / 3, R = radien(el);
  const kreise = [], vierecke = [];
  for (let i = 0; i < n; i++) kreise.push([p[i * 3], p[i * 3 + 1], R[i]]);
  for (let i = 1; i < n; i++) {
    const ax = p[i * 3 - 3], ay = p[i * 3 - 2], bx = p[i * 3], by = p[i * 3 + 1], ar = R[i - 1], br = R[i];
    let dx = bx - ax, dy = by - ay;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) continue;
    dx /= l; dy /= l;
    const v = [ax - dy * ar, ay + dx * ar, bx - dy * br, by + dx * br, bx + dy * br, by - dx * br, ax + dy * ar, ay - dx * ar];
    const flaeche = (v[2] - v[0]) * (v[5] - v[1]) - (v[4] - v[0]) * (v[3] - v[1]);
    vierecke.push(flaeche < 0 ? [v[0], v[1], v[6], v[7], v[4], v[5], v[2], v[3]] : v);
  }
  return { vierecke, kreise };
}
function teileInPfad(t, pfad) {
  for (const v of t.vierecke) { pfad.moveTo(v[0], v[1]); pfad.lineTo(v[2], v[3]); pfad.lineTo(v[4], v[5]); pfad.lineTo(v[6], v[7]); pfad.closePath(); }
  for (const [x, y, r] of t.kreise) { pfad.moveTo(x + r, y); pfad.arc(x, y, r, 0, Math.PI * 2); pfad.closePath(); }
}
const rd = (v) => Math.round(v * 100) / 100;
export function strichSvg(el) {
  const t = strichTeile(el);
  let s = '';
  for (const q of t.vierecke) s += `M${rd(q[0])} ${rd(q[1])}L${rd(q[2])} ${rd(q[3])}L${rd(q[4])} ${rd(q[5])}L${rd(q[6])} ${rd(q[7])}Z`;
  for (const [x, y, k] of t.kreise) s += `M${rd(x - k)} ${rd(y)}a${rd(k)} ${rd(k)} 0 1 1 ${rd(2 * k)} 0a${rd(k)} ${rd(k)} 0 1 1 ${rd(-2 * k)} 0Z`;
  return s;
}

const pfadCache = new WeakMap();
function strichPfad(el) {
  let p = pfadCache.get(el);
  if (!p) { p = new Path2D(); teileInPfad(strichTeile(el), p); pfadCache.set(el, p); }
  return p;
}

/* ================= Formen ================= */
// form: { art: 'linie'|'pfeil' (x1,y1,x2,y2) | 'ellipse' (cx,cy,rx,ry,winkel) | 'polygon' (ecken:[[x,y]...]), farbe, fuellung, breite }

export function formNormalisieren(el) {
  if (el.typ !== 'form' || el.ecken || el.art === 'linie' || el.art === 'pfeil' || el.cx != null) return el;
  const x1 = Math.min(el.x1, el.x2), x2 = Math.max(el.x1, el.x2), y1 = Math.min(el.y1, el.y2), y2 = Math.max(el.y1, el.y2);
  if (el.art === 'ellipse') Object.assign(el, { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: (x2 - x1) / 2, ry: (y2 - y1) / 2, winkel: 0 });
  else if (el.art === 'dreieck') Object.assign(el, { art: 'polygon', ecken: [[(x1 + x2) / 2, y1], [x2, y2], [x1, y2]] });
  else Object.assign(el, { art: 'polygon', ecken: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] });
  for (const k of ['x1', 'y1', 'x2', 'y2']) delete el[k];
  return el;
}

export function formPfad(el) {
  const p = new Path2D();
  if (el.art === 'linie' || el.art === 'pfeil') {
    const { x1, y1, x2, y2 } = el;
    p.moveTo(x1, y1); p.lineTo(x2, y2);
    if (el.art === 'pfeil') {
      const w = Math.atan2(y2 - y1, x2 - x1), l = 10 + el.breite * 2;
      p.moveTo(x2 - l * Math.cos(w - .45), y2 - l * Math.sin(w - .45)); p.lineTo(x2, y2); p.lineTo(x2 - l * Math.cos(w + .45), y2 - l * Math.sin(w + .45));
    }
  } else if (el.art === 'ellipse') {
    p.ellipse(el.cx, el.cy, Math.max(.1, el.rx), Math.max(.1, el.ry), el.winkel || 0, 0, Math.PI * 2);
  } else if (el.ecken?.length) {
    el.ecken.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
  }
  return p;
}
export function formSvg(el) {
  if (el.art === 'linie' || el.art === 'pfeil') {
    const { x1, y1, x2, y2 } = el;
    let s = `M${rd(x1)} ${rd(y1)}L${rd(x2)} ${rd(y2)}`;
    if (el.art === 'pfeil') {
      const w = Math.atan2(y2 - y1, x2 - x1), l = 10 + el.breite * 2;
      s += `M${rd(x2 - l * Math.cos(w - .45))} ${rd(y2 - l * Math.sin(w - .45))}L${rd(x2)} ${rd(y2)}L${rd(x2 - l * Math.cos(w + .45))} ${rd(y2 - l * Math.sin(w + .45))}`;
    }
    return s;
  }
  if (el.art === 'ellipse') {
    // Ellipse als Vieleck (für gedrehte Ellipsen im PDF)
    let s = '';
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2, c = Math.cos(el.winkel || 0), sn = Math.sin(el.winkel || 0);
      const x = el.rx * Math.cos(t), y = el.ry * Math.sin(t);
      s += `${i ? 'L' : 'M'}${rd(el.cx + x * c - y * sn)} ${rd(el.cy + x * sn + y * c)}`;
    }
    return s + 'Z';
  }
  return el.ecken.map(([x, y], i) => `${i ? 'L' : 'M'}${rd(x)} ${rd(y)}`).join('') + 'Z';
}

// Aus einer gekritzelten Linie eine saubere Form machen ("Zeichnen und halten", Formen-Werkzeug)
export function formErkennen(punkte, farbe, breite) {
  const P = [];
  for (let i = 0; i < punkte.length; i += 3) P.push([punkte[i], punkte[i + 1]]);
  if (P.length < 4) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, laenge = 0;
  P.forEach(([x, y], i) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); if (i) laenge += Math.hypot(x - P[i - 1][0], y - P[i - 1][1]); });
  const diag = Math.hypot(x2 - x1, y2 - y1);
  if (diag < 8) return null;
  const a = P[0], e = P[P.length - 1];
  const geschlossen = Math.hypot(a[0] - e[0], a[1] - e[1]) < Math.max(18, diag * .22);
  const basis = { typ: 'form', farbe, breite, fuellung: null };
  if (!geschlossen) {
    // Gerade? (Weg kaum länger als die direkte Strecke)
    if (laenge < Math.hypot(e[0] - a[0], e[1] - a[1]) * 1.12) {
      let [ax, ay] = a, [ex, ey] = e;
      const w = Math.atan2(ey - ay, ex - ax), ger = Math.round(w / (Math.PI / 4)) * (Math.PI / 4);
      if (Math.abs(w - ger) < .09) { const l = Math.hypot(ex - ax, ey - ay); ex = ax + Math.cos(ger) * l; ey = ay + Math.sin(ger) * l; }
      return { ...basis, art: 'linie', x1: ax, y1: ay, x2: ex, y2: ey };
    }
    return null;
  }
  // Ecken finden (Douglas-Peucker auf der geschlossenen Linie)
  const ecken = vereinfachen(P, Math.max(6, diag * .09));
  if (ecken.length > 1 && Math.hypot(ecken[0][0] - ecken.at(-1)[0], ecken[0][1] - ecken.at(-1)[1]) < diag * .25) ecken.pop();
  const n = ecken.length;
  // Rundheit: wie gleichmäßig ist der Abstand zur Mitte?
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = (x2 - x1) / 2, ry = (y2 - y1) / 2;
  const abw = P.reduce((s, [x, y]) => s + Math.abs(Math.hypot((x - cx) / (rx || 1), (y - cy) / (ry || 1)) - 1), 0) / P.length;
  if (abw < .13 && n > 4) {
    if (Math.abs(rx - ry) < Math.max(rx, ry) * .15) { const r = (rx + ry) / 2; return { ...basis, art: 'ellipse', cx, cy, rx: r, ry: r, winkel: 0 }; }
    return { ...basis, art: 'ellipse', cx, cy, rx, ry, winkel: 0 };
  }
  if (n === 3) return { ...basis, art: 'polygon', ecken };
  if (n === 4) {
    // Füllt das Viereck seinen Rahmen fast ganz aus (oder sind die Kanten fast gerade)? Dann sauberes Rechteck
    const flaeche = Math.abs(ecken.reduce((s, p, i) => { const q = ecken[(i + 1) % 4]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    const winkel = ecken.map((p, i) => { const q = ecken[(i + 1) % 4]; return Math.atan2(q[1] - p[1], q[0] - p[0]); });
    const gerade = winkel.every((w) => Math.abs(Math.sin(2 * w)) < .3);
    if (gerade || flaeche / ((x2 - x1) * (y2 - y1) || 1) > .8) return { ...basis, art: 'polygon', ecken: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]] };
    return { ...basis, art: 'polygon', ecken };
  }
  if (n >= 5 && n <= 8) return { ...basis, art: 'polygon', ecken };
  return { ...basis, art: 'ellipse', cx, cy, rx, ry, winkel: 0 };
}
function vereinfachen(P, eps) {
  if (P.length < 3) return P.slice();
  let max = 0, idx = 0;
  const [a, b] = [P[0], P[P.length - 1]];
  for (let i = 1; i < P.length - 1; i++) { const d = abstandStrecke(P[i][0], P[i][1], a[0], a[1], b[0], b[1]); if (d > max) { max = d; idx = i; } }
  // Geschlossene Linie: Anfang = Ende, daher weitesten Punkt vom Start als Teiler nehmen
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < eps) {
    let w = 0;
    for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - a[0], P[i][1] - a[1]); if (d > w) { w = d; idx = i; } }
    const l = vereinfachen(P.slice(0, idx + 1), eps), r = vereinfachen(P.slice(idx), eps);
    return [...l.slice(0, -1), ...r];
  }
  if (max <= eps) return [a, b];
  const l = vereinfachen(P.slice(0, idx + 1), eps), r = vereinfachen(P.slice(idx), eps);
  return [...l.slice(0, -1), ...r];
}

/* ================= Text ================= */
// text: { x, y, b, drehung, ausrichtung, hintergrund, rand, absaetze: [[{t, f, g, c, b, i, u, s}]] }

export const SYSTEM = '-apple-system, "Segoe UI", system-ui, sans-serif';
export const STANDARD_SCHRIFT = 'Helvetica Neue';

export function textNormalisieren(el) {
  if (el.typ !== 'text' || el.absaetze) return el;
  el.absaetze = String(el.text || '').split('\n').map((t) => [{ t, f: STANDARD_SCHRIFT, g: el.groesse || 16, c: el.farbe || '#1b1b1f' }]);
  el.ausrichtung = 'links';
  delete el.text; delete el.groesse; delete el.farbe;
  return el;
}
export const textInhalt = (el) => (el.absaetze || []).map((a) => a.map((r) => r.t).join('')).join('\n');

export const schriftCss = (r) => `${r.i ? 'italic ' : ''}${r.b ? '700 ' : '400 '}${r.g}px "${r.f}", ${SYSTEM}`;

// Text in Zeilen umbrechen. Ergebnis: [{ teile: [{t, r, x, w}], hoehe, grund }]
export function textLayout(ctx, el) {
  const zeilen = [];
  const breite = Math.max(10, el.b - (el.hintergrund || el.rand ? 16 : 0));
  for (const absatz of el.absaetze) {
    let zeile = { teile: [], w: 0, g: 0 };
    const neueZeile = () => { zeilen.push(zeile); zeile = { teile: [], w: 0, g: 0 }; };
    const leer = !absatz.some((r) => r.t);
    if (leer) { zeile.g = absatz[0]?.g || 16; neueZeile(); continue; }
    for (const r of absatz) {
      ctx.font = schriftCss(r);
      for (const wort of r.t.split(/(\s+)/)) {
        if (!wort) continue;
        let w = ctx.measureText(wort).width;
        if (zeile.w + w > breite && zeile.teile.length && wort.trim()) neueZeile();
        if (!zeile.teile.length && !wort.trim()) continue; // Leerzeichen am Zeilenanfang
        // Sehr lange Wörter hart umbrechen
        let rest = wort;
        while (w > breite && rest.length > 1) {
          let k = rest.length - 1;
          while (k > 1 && ctx.measureText(rest.slice(0, k)).width > breite - zeile.w) k--;
          zeile.teile.push({ t: rest.slice(0, k), r, x: zeile.w, w: ctx.measureText(rest.slice(0, k)).width });
          zeile.g = Math.max(zeile.g, r.g);
          neueZeile();
          rest = rest.slice(k); w = ctx.measureText(rest).width;
        }
        zeile.teile.push({ t: rest, r, x: zeile.w, w });
        zeile.w += w; zeile.g = Math.max(zeile.g, r.g);
      }
    }
    neueZeile();
  }
  return zeilen;
}

export function textMasse(ctx, el) {
  const zeilen = textLayout(ctx, el);
  const pad = el.hintergrund || el.rand ? 8 : 0;
  const h = zeilen.reduce((s, z) => s + z.g * 1.3, 0) + pad * 2;
  return { zeilen, h: Math.max(h, (el.absaetze[0]?.[0]?.g || 16) * 1.3), pad };
}

function zeichneText(ctx, el) {
  const { zeilen, h, pad } = textMasse(ctx, el);
  if (el.hintergrund) { ctx.fillStyle = el.hintergrund; rundesRechteck(ctx, el.x, el.y, el.b, h, 6); ctx.fill(); }
  if (el.rand) { ctx.strokeStyle = el.rand; ctx.lineWidth = 1.2; rundesRechteck(ctx, el.x, el.y, el.b, h, 6); ctx.stroke(); }
  let y = el.y + pad;
  const innen = el.b - pad * 2;
  for (const z of zeilen) {
    const versatz = el.ausrichtung === 'mitte' ? (innen - z.w) / 2 : el.ausrichtung === 'rechts' ? innen - z.w : 0;
    const grund = y + z.g * 1.02;
    for (const t of z.teile) {
      ctx.font = schriftCss(t.r); ctx.fillStyle = t.r.c; ctx.textBaseline = 'alphabetic';
      const x = el.x + pad + versatz + t.x;
      ctx.fillText(t.t, x, grund);
      if (t.r.u || t.r.s) {
        ctx.fillRect(x, t.r.u ? grund + t.r.g * .1 : grund - t.r.g * .3, t.w, Math.max(.8, t.r.g / 14));
      }
    }
    y += z.g * 1.3;
  }
}
function rundesRechteck(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* ================= Bilder ================= */
// bild: { dateiId, x, y, b, h, drehung, zuschnitt?: {x, y, w, h} (Anteile 0..1 vom Original) }

const bildCache = new Map();
export function bildLaden(dateiId, url) {
  if (!bildCache.has(dateiId)) { const img = new Image(); img.src = url; bildCache.set(dateiId, img); }
  return bildCache.get(dateiId);
}
export const bildHolen = (dateiId) => bildCache.get(dateiId);

/* ================= Zeichnen ================= */

const messCtx = document.createElement('canvas').getContext('2d');
export { messCtx };

// Mittelpunkt + Drehung für Text und Bild
function mitDrehung(ctx, el, h, fn) {
  if (!el.drehung) return fn();
  const cx = el.x + el.b / 2, cy = el.y + h / 2;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(el.drehung); ctx.translate(-cx, -cy); fn(); ctx.restore();
}

export function zeichneElement(ctx, el) {
  if (el.typ === 'strich') {
    ctx.save();
    if (el.werkzeug === 'marker') { ctx.globalAlpha = el.deckkraft ?? .38; ctx.globalCompositeOperation = 'multiply'; }
    ctx.fillStyle = el.farbe;
    ctx.fill(strichPfad(el));
    ctx.restore();
  } else if (el.typ === 'form') {
    formNormalisieren(el);
    const pf = formPfad(el);
    ctx.save();
    if (el.fuellung && el.art !== 'linie' && el.art !== 'pfeil') { ctx.fillStyle = el.fuellung; ctx.fill(pf); }
    if (el.farbe && el.breite > 0) { ctx.strokeStyle = el.farbe; ctx.lineWidth = el.breite; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(pf); }
    ctx.restore();
  } else if (el.typ === 'text') {
    textNormalisieren(el);
    ctx.save();
    mitDrehung(ctx, el, textMasse(ctx, el).h, () => zeichneText(ctx, el));
    ctx.restore();
  } else if (el.typ === 'bild') {
    const img = bildHolen(el.dateiId);
    if (!(img?.complete && img.naturalWidth)) return;
    mitDrehung(ctx, el, el.h, () => {
      const z = el.zuschnitt || { x: 0, y: 0, w: 1, h: 1 };
      ctx.drawImage(img, z.x * img.naturalWidth, z.y * img.naturalHeight, z.w * img.naturalWidth, z.h * img.naturalHeight, el.x, el.y, el.b, el.h);
    });
  }
}

// Reihenfolge: Textmarker liegen unter der Schrift (wie bei GoodNotes)
export function zeichneAlle(ctx, elemente) {
  for (const el of elemente) if (!el._versteckt && el.typ === 'strich' && el.werkzeug === 'marker') zeichneElement(ctx, el);
  for (const el of elemente) if (!el._versteckt && !(el.typ === 'strich' && el.werkzeug === 'marker')) zeichneElement(ctx, el);
}

/* ================= Rahmen, Treffer, Bearbeiten ================= */

const ecken4 = (el, h) => {
  const pk = [[el.x, el.y], [el.x + el.b, el.y], [el.x + el.b, el.y + h], [el.x, el.y + h]];
  if (!el.drehung) return pk;
  const cx = el.x + el.b / 2, cy = el.y + h / 2, c = Math.cos(el.drehung), s = Math.sin(el.drehung);
  return pk.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};

export function rahmen(el) {
  if (el._rahmen) return el._rahmen;
  let pk, w = 0;
  if (el.typ === 'strich') {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let i = 0; i < el.punkte.length; i += 3) { const x = el.punkte[i], y = el.punkte[i + 1]; if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    pk = [[x1, y1], [x2, y2]]; w = el.breite;
  } else if (el.typ === 'form') {
    formNormalisieren(el);
    if (el.art === 'linie' || el.art === 'pfeil') pk = [[el.x1, el.y1], [el.x2, el.y2]];
    else if (el.art === 'ellipse') { const c = Math.cos(el.winkel || 0), s = Math.sin(el.winkel || 0); const ex = Math.hypot(el.rx * c, el.ry * s), ey = Math.hypot(el.rx * s, el.ry * c); pk = [[el.cx - ex, el.cy - ey], [el.cx + ex, el.cy + ey]]; }
    else pk = el.ecken;
    w = el.breite + 4;
  } else if (el.typ === 'text') { textNormalisieren(el); pk = ecken4(el, textMasse(messCtx, el).h); }
  else pk = ecken4(el, el.h);
  const xs = pk.map((p) => p[0]), ys = pk.map((p) => p[1]);
  const r = { x1: Math.min(...xs) - w, y1: Math.min(...ys) - w, x2: Math.max(...xs) + w, y2: Math.max(...ys) + w };
  Object.defineProperty(el, '_rahmen', { value: r, configurable: true, enumerable: false, writable: true });
  return r;
}
export const rahmenVergessen = (el) => { el._rahmen = undefined; pfadCache.delete(el); };

function abstandStrecke(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

export function trifft(el, x, y, radius) {
  const r = rahmen(el);
  if (x < r.x1 - radius || x > r.x2 + radius || y < r.y1 - radius || y > r.y2 + radius) return false;
  if (el.typ === 'strich') {
    const p = el.punkte, grenze = radius + el.breite / 2;
    if (p.length === 3) return Math.hypot(p[0] - x, p[1] - y) < grenze;
    for (let i = 3; i < p.length; i += 3) if (abstandStrecke(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) < grenze) return true;
    return false;
  }
  if (el.typ === 'form') {
    const g = radius + el.breite;
    if (el.art === 'linie' || el.art === 'pfeil') return abstandStrecke(x, y, el.x1, el.y1, el.x2, el.y2) < g;
    if (el.fuellung && messCtx.isPointInPath(formPfad(el), x, y)) return true;
    if (el.art === 'ellipse') {
      const c = Math.cos(-(el.winkel || 0)), s = Math.sin(-(el.winkel || 0)), dx = x - el.cx, dy = y - el.cy;
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      return Math.abs(Math.hypot(lx / (el.rx || 1), ly / (el.ry || 1)) - 1) * Math.min(el.rx, el.ry) < g;
    }
    return el.ecken.some((p, i) => { const q = el.ecken[(i + 1) % el.ecken.length]; return abstandStrecke(x, y, p[0], p[1], q[0], q[1]) < g; });
  }
  return true;
}

// Präzisionsradierer: Teile eines Strichs entfernen. Liefert neue Teil-Striche oder null (nicht getroffen).
export function teilRadieren(el, x, y, radius) {
  if (el.typ !== 'strich' || !trifft(el, x, y, radius)) return null;
  const p = el.punkte, grenze = radius + el.breite / 2, teile = [];
  let akt = [];
  for (let i = 0; i < p.length; i += 3) {
    if (Math.hypot(p[i] - x, p[i + 1] - y) < grenze) { if (akt.length >= 6) teile.push(akt); akt = []; }
    else akt.push(p[i], p[i + 1], p[i + 2]);
  }
  if (akt.length >= 6) teile.push(akt);
  return teile.map((punkte) => ({ ...el, punkte }));
}

export function imPolygon(x, y, poly) {
  let drin = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) drin = !drin;
  }
  return drin;
}
export function imLasso(el, poly) {
  if (el.typ === 'strich') {
    let drin = 0, n = 0;
    for (let i = 0; i < el.punkte.length; i += 9) { n++; if (imPolygon(el.punkte[i], el.punkte[i + 1], poly)) drin++; }
    return n && drin / n > .6;
  }
  const r = rahmen(el);
  return imPolygon((r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2, poly);
}

// Punkt-Transformation auf alle Arten anwenden
function punkteAbbilden(el, f) {
  if (el.typ === 'strich') for (let i = 0; i < el.punkte.length; i += 3) { const [x, y] = f(el.punkte[i], el.punkte[i + 1]); el.punkte[i] = x; el.punkte[i + 1] = y; }
  else if (el.typ === 'form') {
    formNormalisieren(el);
    if (el.art === 'linie' || el.art === 'pfeil') { [el.x1, el.y1] = f(el.x1, el.y1); [el.x2, el.y2] = f(el.x2, el.y2); }
    else if (el.art === 'ellipse') [el.cx, el.cy] = f(el.cx, el.cy);
    else el.ecken = el.ecken.map(([x, y]) => f(x, y));
  }
}

export function verschieben(el, dx, dy) {
  if (el.typ === 'strich' || el.typ === 'form') punkteAbbilden(el, (x, y) => [x + dx, y + dy]);
  else { el.x += dx; el.y += dy; }
  rahmenVergessen(el);
}

export function skalieren(el, fx, fy, ax, ay) {
  const sx = (x) => ax + (x - ax) * fx, sy = (y) => ay + (y - ay) * fy;
  if (el.typ === 'strich') { punkteAbbilden(el, (x, y) => [sx(x), sy(y)]); el.breite *= Math.sqrt(Math.abs(fx * fy)); }
  else if (el.typ === 'form') { punkteAbbilden(el, (x, y) => [sx(x), sy(y)]); if (el.art === 'ellipse') { el.rx *= fx; el.ry *= fy; } }
  else if (el.typ === 'text') {
    el.x = sx(el.x); el.y = sy(el.y); el.b *= fx;
    for (const a of el.absaetze) for (const r of a) r.g = Math.max(4, r.g * fy);
  } else { el.x = sx(el.x); el.y = sy(el.y); el.b *= fx; el.h *= fy; }
  rahmenVergessen(el);
}

export function drehen(el, winkel, cx, cy) {
  const c = Math.cos(winkel), s = Math.sin(winkel);
  const rot = (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  if (el.typ === 'strich') punkteAbbilden(el, rot);
  else if (el.typ === 'form') { punkteAbbilden(el, rot); if (el.art === 'ellipse') el.winkel = (el.winkel || 0) + winkel; }
  else {
    const h = el.typ === 'text' ? textMasse(messCtx, el).h : el.h;
    const [mx, my] = rot(el.x + el.b / 2, el.y + h / 2);
    el.x = mx - el.b / 2; el.y = my - h / 2; el.drehung = (el.drehung || 0) + winkel;
  }
  rahmenVergessen(el);
}

// Farbe ändern: Striche, Formlinien, Textfarbe
export function einfaerben(el, farbe) {
  if (el.typ === 'strich') el.farbe = farbe;
  else if (el.typ === 'form') el.farbe = farbe;
  else if (el.typ === 'text') for (const a of el.absaetze) for (const r of a) r.c = farbe;
}

export const kopie = (el) => JSON.parse(JSON.stringify(el));
