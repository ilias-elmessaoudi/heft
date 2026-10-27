// Gemeinsamer Zustand des Editors und Werkzeug-Einstellungen (pro Gerät gespeichert).

// GoodNotes-ähnliche Standardpalette (Voreinstellung)
export const PALETTE = [
  '#000000', '#3a3a3c', '#8e8e93', '#c7c7cc', '#ffffff', '#5b2c0f',
  '#1f3a93', '#2a5bd7', '#3aa0ff', '#7fd3ff', '#0f6e74', '#22c1a6',
  '#1f9d55', '#7ed957', '#d4e157', '#ffd84d', '#f0a020', '#ff7a2f',
  '#d9342b', '#ff5a6e', '#ff8fc7', '#c084fc', '#8a3ffc', '#5b2a86',
];
export const MARKER_PALETTE = ['#ffd84d', '#ffe680', '#b8f28a', '#7ee08a', '#9ee7ff', '#7cc6ff', '#ffb3d9', '#ff8fc7', '#ffb35c', '#d8b4fe', '#e0e0e0', '#c9a27a'];

const STANDARD = {
  werkzeug: 'stift',
  stift: { farben: ['#000000', '#2a5bd7', '#d9342b'], farbe: 0, breiten: [1, 1.8, 3], breite: 1, stift: 'fueller', schaerfe: .5, empf: .6, halten: true },
  marker: { farben: ['#ffd84d', '#7ee08a', '#ff8fc7'], farbe: 0, breiten: [8, 14, 22], breite: 1, gerade: true },
  radierer: { breiten: [6, 14, 28], breite: 1, modus: 'ganz', nurMarker: false, zurueck: false },
  form: { farben: ['#000000', '#2a5bd7', '#d9342b'], farbe: 0, breiten: [1, 2, 4], breite: 1, fuellung: null, art: 'auto' },
  lasso: { filter: { strich: true, marker: true, form: true, bild: true, text: true } },
  text: { schrift: 'Helvetica Neue', groesse: 16, farbe: '#000000', b: false, i: false, u: false, s: false, ausrichtung: 'links', hintergrund: null },
  laser: { farbe: '#ff3b30' },
  eigeneFarben: [],
  zuletztSchriften: [],
};

function laden() {
  try {
    const s = JSON.parse(localStorage.getItem('heft.ws2')) || {};
    const e = structuredClone(STANDARD);
    for (const k of Object.keys(e)) if (s[k] !== undefined) e[k] = typeof e[k] === 'object' && !Array.isArray(e[k]) && e[k] ? { ...e[k], ...s[k] } : s[k];
    return e;
  } catch { return structuredClone(STANDARD); }
}
export const ws = laden();
export const merken = () => { try { localStorage.setItem('heft.ws2', JSON.stringify(ws)); } catch {} };

// Aktuelle Farbe/Breite des gewählten Werkzeugs
export const aktFarbe = (w = ws.werkzeug) => ws[w]?.farben?.[ws[w].farbe];
export const aktBreite = (w = ws.werkzeug) => ws[w]?.breiten?.[ws[w].breite];

export const z = {
  heft: null,
  seiten: [],
  dom: new Map(),
  zoom: 1,
  basis: 1,
  aktuell: 0,
  rueck: [], vor: [],
  auswahl: null,
  ablage: null,
  nurStift: localStorage.getItem('heft.nurStift') === '1',
};
export const massstab = () => z.basis * z.zoom;

// Funktionen, die Module untereinander brauchen (werden im Editor eingetragen)
export const api = {};

export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
