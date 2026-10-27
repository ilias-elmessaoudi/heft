// Bilder bearbeiten: Hintergrund entfernen (Freistellen), Sticker-Rand, Schatten. Ergebnis ist immer ein neues PNG.

async function zuCanvas(blob, max = 1600) {
  const bmp = await createImageBitmap(blob);
  const f = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
const alsPng = (c) => new Promise((ok) => c.toBlob(ok, 'image/png'));

// Hintergrund entfernen: von allen Rändern aus gleichfarbige Flächen wegnehmen (klappt gut bei Pinterest-Bildern mit einfarbigem Grund)
export async function hintergrundEntfernen(blob, toleranz = 38) {
  const c = await zuCanvas(blob);
  const ctx = c.getContext('2d');
  const { width: w, height: h } = c;
  const bild = ctx.getImageData(0, 0, w, h), d = bild.data;
  // Grundfarbe = häufigste Randfarbe
  const zaehler = new Map();
  const rand = [];
  for (let x = 0; x < w; x++) rand.push(x, x + (h - 1) * w);
  for (let y = 0; y < h; y++) rand.push(y * w, w - 1 + y * w);
  for (const i of rand) { const k = (d[i * 4] >> 4) + ',' + (d[i * 4 + 1] >> 4) + ',' + (d[i * 4 + 2] >> 4); zaehler.set(k, (zaehler.get(k) || 0) + 1); }
  const besterTopf = [...zaehler.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map((v) => +v * 16 + 8);
  const nah = (i) => d[i * 4 + 3] > 0 && Math.abs(d[i * 4] - besterTopf[0]) + Math.abs(d[i * 4 + 1] - besterTopf[1]) + Math.abs(d[i * 4 + 2] - besterTopf[2]) < toleranz * 3;
  const weg = new Uint8Array(w * h);
  const stapel = rand.filter(nah);
  for (const i of stapel) weg[i] = 1;
  while (stapel.length) {
    const i = stapel.pop(), x = i % w, y = (i / w) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !weg[j] && nah(j)) { weg[j] = 1; stapel.push(j); }
    }
  }
  // Kanten weich machen: Pixel neben entfernten Flächen halb durchsichtig
  for (let i = 0; i < w * h; i++) {
    if (weg[i]) { d[i * 4 + 3] = 0; continue; }
    const x = i % w, y = (i / w) | 0;
    const nachbarn = (x > 0 && weg[i - 1]) + (x < w - 1 && weg[i + 1]) + (y > 0 && weg[i - w]) + (y < h - 1 && weg[i + w]);
    if (nachbarn) d[i * 4 + 3] = Math.round(d[i * 4 + 3] * (1 - nachbarn * .18));
  }
  ctx.putImageData(bild, 0, 0);
  return alsPng(zuschneidenAufInhalt(c));
}

// Leere (durchsichtige) Ränder abschneiden
function zuschneidenAufInhalt(c) {
  const ctx = c.getContext('2d');
  const { data, width: w, height: h } = ctx.getImageData(0, 0, c.width, c.height);
  let x1 = w, y1 = h, x2 = 0, y2 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 8) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
  if (x2 <= x1 || y2 <= y1) return c;
  const n = document.createElement('canvas');
  n.width = x2 - x1 + 1; n.height = y2 - y1 + 1;
  n.getContext('2d').drawImage(c, -x1, -y1);
  return n;
}

// Sticker-Effekte wie in iPadOS: weißer Rand, Schatten
export async function stickerEffekt(blob, art = 'rand') {
  const quelle = await zuCanvas(blob, 1400);
  const r = Math.max(6, Math.round(Math.max(quelle.width, quelle.height) * .02));
  const c = document.createElement('canvas');
  c.width = quelle.width + r * 4; c.height = quelle.height + r * 4;
  const ctx = c.getContext('2d');
  if (art === 'rand' || art === 'glanz') {
    // Umriss: Bild in Weiß in alle Richtungen versetzt stempeln
    const weiss = document.createElement('canvas');
    weiss.width = quelle.width; weiss.height = quelle.height;
    const wc = weiss.getContext('2d');
    wc.drawImage(quelle, 0, 0); wc.globalCompositeOperation = 'source-in'; wc.fillStyle = '#fff'; wc.fillRect(0, 0, weiss.width, weiss.height);
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = r; ctx.shadowOffsetY = r * .4;
    for (let a = 0; a < 24; a++) ctx.drawImage(weiss, r * 2 + Math.cos(a / 24 * Math.PI * 2) * r, r * 2 + Math.sin(a / 24 * Math.PI * 2) * r);
    ctx.shadowColor = 'transparent';
  }
  if (art === 'schatten') { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = r * 1.5; ctx.shadowOffsetY = r * .6; }
  ctx.drawImage(quelle, r * 2, r * 2);
  if (art === 'glanz') {
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createLinearGradient(0, 0, c.width, c.height);
    g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(.45, 'rgba(255,255,255,0)'); g.addColorStop(.55, 'rgba(255,255,255,.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
  }
  return alsPng(zuschneidenAufInhalt(c));
}

// Bild aus der Zwischenablage / Drag & Drop holen
export async function bildAusDaten(dt) {
  for (const f of dt?.files || []) if (f.type.startsWith('image/')) return f;
  for (const item of dt?.items || []) if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  // Aus dem Browser gezogenes Bild: Adresse versuchen zu laden
  const html = dt?.getData?.('text/html') || '';
  const url = (html.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || dt?.getData?.('text/uri-list') || '';
  if (/^https?:|^data:image/.test(url)) {
    try { const r = await fetch(url); const b = await r.blob(); if (b.type.startsWith('image/')) return b; } catch {}
  }
  return null;
}
