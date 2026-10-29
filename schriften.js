// Schriften: System, Google Fonts (bei Bedarf geladen) und eigene Schriftdateien (TTF/OTF/WOFF, z. B. von dafont).

import { db, id } from './db.js';
import { schriftCss } from './zeichnen.js';

const SYSTEM = [
  'Helvetica Neue', 'Arial', 'Avenir Next', 'Georgia', 'Times New Roman', 'Palatino', 'Courier New', 'Verdana',
  'Trebuchet MS', 'Futura', 'Gill Sans', 'Optima', 'Didot', 'Baskerville', 'American Typewriter', 'Marker Felt',
  'Noteworthy', 'Chalkboard SE', 'Bradley Hand', 'Snell Roundhand', 'Savoye LET', 'Segoe UI', 'Segoe Print', 'Segoe Script',
  'Comic Sans MS', 'Calibri', 'Cambria', 'Candara', 'Ink Free',
];

// Google Fonts: [Name, Gruppe]
const GOOGLE = [
  ['Caveat', 'Handschrift'], ['Dancing Script', 'Handschrift'], ['Pacifico', 'Handschrift'], ['Satisfy', 'Handschrift'],
  ['Great Vibes', 'Handschrift'], ['Sacramento', 'Handschrift'], ['Allura', 'Handschrift'], ['Parisienne', 'Handschrift'],
  ['Alex Brush', 'Handschrift'], ['Yellowtail', 'Handschrift'], ['Kaushan Script', 'Handschrift'], ['Cookie', 'Handschrift'],
  ['Courgette', 'Handschrift'], ['Lobster', 'Handschrift'], ['Homemade Apple', 'Handschrift'], ['Mrs Saint Delafield', 'Handschrift'],
  ['Shadows Into Light', 'Handschrift'], ['Indie Flower', 'Handschrift'], ['Patrick Hand', 'Handschrift'], ['Kalam', 'Handschrift'],
  ['Gloria Hallelujah', 'Handschrift'], ['Architects Daughter', 'Handschrift'], ['Covered By Your Grace', 'Handschrift'],
  ['Reenie Beanie', 'Handschrift'], ['Nanum Pen Script', 'Handschrift'], ['Gaegu', 'Handschrift'], ['Delius', 'Handschrift'],
  ['Schoolbell', 'Handschrift'], ['Sriracha', 'Handschrift'], ['Itim', 'Handschrift'],
  ['Permanent Marker', 'Deko'], ['Amatic SC', 'Deko'], ['Rock Salt', 'Deko'], ['Bungee', 'Deko'], ['Righteous', 'Deko'],
  ['Fredoka', 'Deko'], ['Baloo 2', 'Deko'], ['Comfortaa', 'Deko'], ['Abril Fatface', 'Deko'], ['Monoton', 'Deko'],
  ['Poppins', 'Klassisch'], ['Montserrat', 'Klassisch'], ['Quicksand', 'Klassisch'], ['Nunito', 'Klassisch'], ['Inter', 'Klassisch'],
  ['Roboto', 'Klassisch'], ['Open Sans', 'Klassisch'], ['Lato', 'Klassisch'], ['Raleway', 'Klassisch'], ['DM Sans', 'Klassisch'],
  ['Playfair Display', 'Klassisch'], ['Lora', 'Klassisch'], ['Merriweather', 'Klassisch'], ['Cormorant Garamond', 'Klassisch'],
  ['Libre Baskerville', 'Klassisch'], ['Space Mono', 'Klassisch'], ['JetBrains Mono', 'Klassisch'],
];

const eigene = new Map(); // name -> FontFace
const geladen = new Set();

// Ist eine Systemschrift auf diesem Gerät vorhanden? (Breite gegen Ersatzschrift vergleichen)
const probe = document.createElement('canvas').getContext('2d');
function vorhanden(name) {
  const text = 'mmmmmmmmmlliWW@#';
  return ['monospace', 'serif', 'sans-serif'].some((ersatz) => {
    probe.font = `40px ${ersatz}`; const a = probe.measureText(text).width;
    probe.font = `40px "${name}", ${ersatz}`; return probe.measureText(text).width !== a;
  });
}

let systemListe;
export function alleSchriften() {
  systemListe ||= SYSTEM.filter(vorhanden);
  const liste = [];
  for (const n of eigene.keys()) liste.push({ name: n, gruppe: 'Eigene Schriften' });
  for (const [n, g] of GOOGLE) liste.push({ name: n, gruppe: g, google: true });
  for (const n of systemListe) liste.push({ name: n, gruppe: 'Auf diesem Gerät' });
  return liste;
}

// Google-Schrift bei Bedarf laden (normal, fett, kursiv)
export function schriftLaden(name) {
  if (geladen.has(name) || eigene.has(name)) return Promise.resolve();
  const g = GOOGLE.find(([n]) => n === name);
  if (!g) return Promise.resolve();
  geladen.add(name);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
  document.head.append(link);
  // Alle vier Varianten laden – Canvas nutzt sonst für Fett/Kursiv eine Ersatzschrift
  const varianten = () => Promise.all(['400', '700', 'italic 400', 'italic 700'].map((v) => document.fonts.load(`${v} 16px "${name}"`).catch(() => {})));
  return new Promise((ok) => { link.onload = () => varianten().then(ok, ok); link.onerror = ok; setTimeout(ok, 5000); });
}
// Nur die Vorschau-Buchstaben laden (für die Liste), spart Datenvolumen
const vorschau = new Set();
export function vorschauLaden(name) {
  if (vorschau.has(name) || geladen.has(name) || !GOOGLE.some(([n]) => n === name)) return;
  vorschau.add(name);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}&text=${encodeURIComponent(name)}&display=swap`;
  document.head.append(link);
}

export async function eigeneLaden() {
  for (const s of await db.alle('schriften').catch(() => [])) await registrieren(s);
}
async function registrieren(s) {
  if (eigene.has(s.name)) return;
  try {
    const f = new FontFace(s.name, await s.blob.arrayBuffer());
    await f.load();
    document.fonts.add(f);
    eigene.set(s.name, f);
  } catch (e) { console.warn('Schrift', s.name, e); }
}
export async function schriftHinzufuegen(datei) {
  const name = datei.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ').trim();
  const s = { id: id(), name, blob: datei };
  await registrieren(s);
  if (!eigene.has(name)) throw new Error('Diese Datei ist keine lesbare Schrift.');
  await db.speichern('schriften', s);
  return name;
}

// Alle in einem Heft benutzten Schriften (genau in der benutzten Stärke/Kursiv) laden, bevor gezeichnet wird
export async function schriftenFuer(seiten) {
  const laeufe = new Map();
  for (const s of seiten) for (const el of s.elemente) if (el.typ === 'text') for (const a of el.absaetze || []) for (const r of a) laeufe.set(schriftCss(r), r.f);
  for (const s of seiten) for (const el of s.elemente) if (el.typ === 'tabelle') for (const b of [false, true]) laeufe.set(schriftCss({ f: el.f, g: el.g, b }), el.f);
  await Promise.all([...new Set(laeufe.values())].map(schriftLaden));
  await Promise.all([...laeufe.keys()].map((css) => document.fonts.load(css).catch(() => {})));
}

addEventListener('heft-remote', (e) => { if (e.detail.schriften) eigeneLaden(); });
