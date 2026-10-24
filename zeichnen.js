// Alles, was auf eine Seite gemalt wird: Papiervorlagen und Elemente.
// Koordinaten sind Seiten-Einheiten (PDF-Punkte, A4 = 595 x 842). Die gleichen Umrisse nutzt der PDF-Export.

export const A4 = { breite: 595.28, hoehe: 841.89 };

export const PAPIER = {
  weiss: { grund: '#ffffff', linie: 'rgba(60, 90, 140, .22)', rand: 'rgba(220, 70, 70, .35)' },
  creme: { grund: '#fbf6e8', linie: 'rgba(120, 100, 60, .22)', rand: 'rgba(200, 80, 60, .35)' },
  dunkel: { grund: '#1e1f24', linie: 'rgba(255, 255, 255, .13)', rand: 'rgba(255, 110, 110, .35)' },
};

export const VORLAGEN = {
  leer: 'Leer',
  liniert: 'Liniert',
  kariert: 'Kariert',
  punkte: 'Punkte',
  cornell: 'Cornell',
};

// Linien der Vorlage als einfache Liste, damit Bildschirm und PDF dasselbe zeichnen.
export function vorlagenLinien(vorlage, b, h) {
  const l = [];
  const p = (x1, y1, x2, y2, rand) => l.push({ x1, y1, x2, y2, rand });
  if (vorlage === 'liniert' || vorlage === 'cornell') {
    const oben = vorlage === 'cornell' ? 90 : 72, abstand = 24;
    for (let y = oben; y < h - 30; y += abstand) p(vorlage === 'cornell' ? 0 : 0, y, b, y);
    if (vorlage === 'liniert') p(64, 0, 64, h, true);
  }
  if (vorlage === 'cornell') {
    p(150, 60, 150, h - 150, true);
    p(0, 60, b, 60, true);
    p(0, h - 150, b, h - 150, true);
  }
  if (vorlage === 'kariert') {
    const a = 17.5;
    for (let x = a; x < b; x += a) p(x, 0, x, h);
    for (let y = a; y < h; y += a) p(0, y, b, y);
  }
  return l;
}
export function vorlagenPunkte(vorlage, b, h) {
  if (vorlage !== 'punkte') return [];
  const a = 17.5, pk = [];
  for (let x = a; x < b; x += a) for (let y = a; y < h; y += a) pk.push([x, y]);
  return pk;
}

export function zeichnePapier(ctx, seite) {
  const { breite: b, hoehe: h } = seite;
  const farben = PAPIER[seite.papier] || PAPIER.weiss;
  if (!seite.hintergrund) {
    ctx.fillStyle = farben.grund;
    ctx.fillRect(0, 0, b, h);
  }
  // Bei kleiner Darstellung (Vorschau) Linien mindestens ~1 Pixel dick halten
  const s = ctx.getTransform().a || 1;
  ctx.lineWidth = Math.max(.6, .9 / s);
  for (const z of vorlagenLinien(seite.vorlage, b, h)) {
    ctx.strokeStyle = z.rand ? farben.rand : farben.linie;
    ctx.beginPath(); ctx.moveTo(z.x1, z.y1); ctx.lineTo(z.x2, z.y2); ctx.stroke();
  }
  ctx.fillStyle = farben.linie;
  const r = Math.max(.9, .8 / s);
  for (const [x, y] of vorlagenPunkte(seite.vorlage, b, h)) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
}

/* ---------- Striche ---------- */

// Breite an einem Punkt: Druck (0..1) macht den Strich dicker oder dünner.
const dicke = (breite, druck) => breite * (0.35 + 0.95 * druck);

// Strich als Bausteine: je Abschnitt ein Viereck (Breite der beiden Endpunkte) plus ein Kreis an jedem Punkt.
// Zusammen gefüllt ergibt das eine saubere Linie ohne Kleckse an scharfen Kurven. punkte = [x, y, druck, ...]
export function strichTeile(punkte, breite, mitDruck = true) {
  const n = punkte.length / 3;
  const P = [];
  for (let i = 0; i < n; i++) P.push({ x: punkte[i * 3], y: punkte[i * 3 + 1], r: (mitDruck ? dicke(breite, punkte[i * 3 + 2]) : breite) / 2 });
  // Anfang und Ende leicht ausdünnen, wirkt wie Tinte
  if (mitDruck && n > 4) for (let i = 0; i < Math.min(3, n); i++) { P[i].r *= 0.6 + 0.13 * i; P[n - 1 - i].r *= 0.6 + 0.13 * i; }
  const vierecke = [], kreise = P.map((p) => [p.x, p.y, p.r]);
  for (let i = 1; i < n; i++) {
    const a = P[i - 1], b = P[i];
    let dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) continue;
    dx /= l; dy /= l;
    const v = [a.x - dy * a.r, a.y + dx * a.r, b.x - dy * b.r, b.y + dx * b.r, b.x + dy * b.r, b.y - dx * b.r, a.x + dy * a.r, a.y - dx * a.r];
    // Alle Teile im gleichen Drehsinn wie die Kreise, sonst entstehen beim Füllen Löcher
    const flaeche = (v[2] - v[0]) * (v[5] - v[1]) - (v[4] - v[0]) * (v[3] - v[1]);
    vierecke.push(flaeche < 0 ? [v[0], v[1], v[6], v[7], v[4], v[5], v[2], v[3]] : v);
  }
  return { vierecke, kreise };
}

export function strichPfadFuellen(teile, pfad) {
  for (const v of teile.vierecke) { pfad.moveTo(v[0], v[1]); pfad.lineTo(v[2], v[3]); pfad.lineTo(v[4], v[5]); pfad.lineTo(v[6], v[7]); pfad.closePath(); }
  for (const [x, y, r] of teile.kreise) { pfad.moveTo(x + r, y); pfad.arc(x, y, r, 0, Math.PI * 2); pfad.closePath(); }
}

// Gleiche Form als SVG-Pfad (für den PDF-Export).
export function strichSvg(teile) {
  const r = (v) => Math.round(v * 100) / 100;
  let s = '';
  for (const q of teile.vierecke) {
    s += `M${r(q[0])} ${r(q[1])}L${r(q[2])} ${r(q[3])}L${r(q[4])} ${r(q[5])}L${r(q[6])} ${r(q[7])}Z`;
  }
  for (const [x, y, k] of teile.kreise) s += `M${r(x - k)} ${r(y)}a${r(k)} ${r(k)} 0 1 1 ${r(2 * k)} 0a${r(k)} ${r(k)} 0 1 1 ${r(-2 * k)} 0Z`;
  return s;
}

const pfadCache = new WeakMap();
function strichPfad(el) {
  let p = pfadCache.get(el);
  if (!p) {
    p = new Path2D();
    strichPfadFuellen(strichTeile(el.punkte, el.breite, el.werkzeug !== 'marker'), p);
    pfadCache.set(el, p);
  }
  return p;
}
export const pfadVergessen = (el) => pfadCache.delete(el);

/* ---------- Formen ---------- */

export function formPfad(el) {
  const p = new Path2D();
  const { x1, y1, x2, y2 } = el;
  if (el.art === 'linie' || el.art === 'pfeil') {
    p.moveTo(x1, y1); p.lineTo(x2, y2);
    if (el.art === 'pfeil') {
      const w = Math.atan2(y2 - y1, x2 - x1), l = 10 + el.breite * 2;
      p.moveTo(x2 - l * Math.cos(w - 0.45), y2 - l * Math.sin(w - 0.45));
      p.lineTo(x2, y2);
      p.lineTo(x2 - l * Math.cos(w + 0.45), y2 - l * Math.sin(w + 0.45));
    }
  } else if (el.art === 'rechteck') {
    p.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  } else if (el.art === 'ellipse') {
    p.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2 || .1, Math.abs(y2 - y1) / 2 || .1, 0, 0, Math.PI * 2);
  }
  return p;
}

/* ---------- Text ---------- */

export const SCHRIFT = '-apple-system, "Segoe UI", system-ui, sans-serif';

export function textZeilen(ctx, el) {
  ctx.font = `${el.groesse}px ${SCHRIFT}`;
  const zeilen = [];
  for (const absatz of String(el.text).split('\n')) {
    let zeile = '';
    for (const wort of absatz.split(/(\s+)/)) {
      const probe = zeile + wort;
      if (ctx.measureText(probe).width > el.b && zeile.trim()) { zeilen.push(zeile.trimEnd()); zeile = wort.trimStart(); }
      else zeile = probe;
    }
    zeilen.push(zeile);
  }
  return zeilen;
}

/* ---------- Elemente zeichnen ---------- */

const bildCache = new Map();
export function bildLaden(dateiId, url) {
  if (!bildCache.has(dateiId)) {
    const img = new Image();
    img.src = url;
    bildCache.set(dateiId, img);
  }
  return bildCache.get(dateiId);
}
export const bildHolen = (dateiId) => bildCache.get(dateiId);

export function zeichneElement(ctx, el) {
  if (el.typ === 'strich') {
    ctx.save();
    if (el.werkzeug === 'marker') { ctx.globalAlpha = .38; ctx.globalCompositeOperation = 'multiply'; }
    ctx.fillStyle = el.farbe;
    ctx.fill(strichPfad(el));
    ctx.restore();
  } else if (el.typ === 'form') {
    ctx.save();
    ctx.strokeStyle = el.farbe; ctx.lineWidth = el.breite; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(formPfad(el));
    ctx.restore();
  } else if (el.typ === 'text') {
    ctx.save();
    ctx.fillStyle = el.farbe; ctx.textBaseline = 'top';
    textZeilen(ctx, el).forEach((z, i) => ctx.fillText(z, el.x, el.y + i * el.groesse * 1.3));
    ctx.restore();
  } else if (el.typ === 'bild') {
    const img = bildHolen(el.dateiId);
    if (img?.complete && img.naturalWidth) ctx.drawImage(img, el.x, el.y, el.b, el.h);
  }
}

/* ---------- Treffer, Rahmen, Verschieben ---------- */

export function rahmen(el, ctx) {
  if (el._rahmen) return el._rahmen;
  let r;
  if (el.typ === 'strich') {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let i = 0; i < el.punkte.length; i += 3) {
      const x = el.punkte[i], y = el.punkte[i + 1];
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
    }
    const w = el.breite;
    r = { x1: x1 - w, y1: y1 - w, x2: x2 + w, y2: y2 + w };
  } else if (el.typ === 'form') {
    const w = el.breite + 6;
    r = { x1: Math.min(el.x1, el.x2) - w, y1: Math.min(el.y1, el.y2) - w, x2: Math.max(el.x1, el.x2) + w, y2: Math.max(el.y1, el.y2) + w };
  } else if (el.typ === 'text') {
    const n = ctx ? textZeilen(ctx, el).length : String(el.text).split('\n').length;
    r = { x1: el.x, y1: el.y, x2: el.x + el.b, y2: el.y + n * el.groesse * 1.3 };
  } else {
    r = { x1: el.x, y1: el.y, x2: el.x + el.b, y2: el.y + el.h };
  }
  Object.defineProperty(el, '_rahmen', { value: r, configurable: true, enumerable: false, writable: true });
  return r;
}
export const rahmenVergessen = (el) => { el._rahmen = undefined; pfadVergessen(el); };

const abstandStrecke = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};

// Trifft der Radierer (Kreis um x,y) dieses Element?
export function trifft(el, x, y, radius, ctx) {
  const r = rahmen(el, ctx);
  if (x < r.x1 - radius || x > r.x2 + radius || y < r.y1 - radius || y > r.y2 + radius) return false;
  if (el.typ === 'strich') {
    const p = el.punkte, grenze = radius + el.breite / 2;
    if (p.length === 3) return Math.hypot(p[0] - x, p[1] - y) < grenze;
    for (let i = 3; i < p.length; i += 3) if (abstandStrecke(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) < grenze) return true;
    return false;
  }
  if (el.typ === 'form') {
    const g = radius + el.breite;
    const { x1, y1, x2, y2 } = el;
    if (el.art === 'linie' || el.art === 'pfeil') return abstandStrecke(x, y, x1, y1, x2, y2) < g;
    if (el.art === 'rechteck') {
      return [[x1, y1, x2, y1], [x2, y1, x2, y2], [x2, y2, x1, y2], [x1, y2, x1, y1]].some(([a, b, c, d]) => abstandStrecke(x, y, a, b, c, d) < g);
    }
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2 || 1, ry = Math.abs(y2 - y1) / 2 || 1;
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    return Math.abs(d - 1) * Math.min(rx, ry) < g;
  }
  return true; // Text und Bild: Rahmen reicht
}

// Punkt-in-Polygon (Lasso)
export function imPolygon(x, y, poly) {
  let drin = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) drin = !drin;
  }
  return drin;
}
export function imLasso(el, poly, ctx) {
  if (el.typ === 'strich') {
    let drin = 0, n = 0;
    for (let i = 0; i < el.punkte.length; i += 9) { n++; if (imPolygon(el.punkte[i], el.punkte[i + 1], poly)) drin++; }
    return n && drin / n > 0.6;
  }
  const r = rahmen(el, ctx);
  return imPolygon((r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2, poly);
}

export function verschieben(el, dx, dy) {
  if (el.typ === 'strich') for (let i = 0; i < el.punkte.length; i += 3) { el.punkte[i] += dx; el.punkte[i + 1] += dy; }
  else if (el.typ === 'form') { el.x1 += dx; el.x2 += dx; el.y1 += dy; el.y2 += dy; }
  else { el.x += dx; el.y += dy; }
  rahmenVergessen(el);
}

// Skalieren um einen Ankerpunkt (Lasso-Griff)
export function skalieren(el, fx, fy, ax, ay) {
  const sx = (x) => ax + (x - ax) * fx, sy = (y) => ay + (y - ay) * fy;
  if (el.typ === 'strich') {
    for (let i = 0; i < el.punkte.length; i += 3) { el.punkte[i] = sx(el.punkte[i]); el.punkte[i + 1] = sy(el.punkte[i + 1]); }
    el.breite *= Math.sqrt(Math.abs(fx * fy));
  } else if (el.typ === 'form') { el.x1 = sx(el.x1); el.x2 = sx(el.x2); el.y1 = sy(el.y1); el.y2 = sy(el.y2); }
  else if (el.typ === 'text') { el.x = sx(el.x); el.y = sy(el.y); el.b *= fx; el.groesse *= fy; }
  else { el.x = sx(el.x); el.y = sy(el.y); el.b *= fx; el.h *= fy; }
  rahmenVergessen(el);
}

export const kopie = (el) => JSON.parse(JSON.stringify(el));
