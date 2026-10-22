// Lingua dell'interfaccia: italiano (testo originale, usato come chiave) o inglese (dizionario in en.js).
// t('Tocca al {color}', { color }) → testo nella lingua attiva con i parametri sostituiti.
// Il modulo non tocca DOM né localStorage quando viene importato: in Node (test, script) la lingua resta l'italiano.

import { EN } from './en.js';

export const LANGS = Object.freeze(['it', 'en']);
let lang = 'it';

/** Lingua attiva. */
export const getLang = () => lang;

/** Imposta la lingua (chiamata da app.js all'avvio, prima di disegnare l'interfaccia). */
export function setLang(l) {
  lang = LANGS.includes(l) ? l : 'it';
}

/** Lingua preferita: quella scelta dall'utente, altrimenti italiano se il browser è in italiano, altrimenti inglese. */
export function detectLang(saved, navigatorLanguages = []) {
  if (LANGS.includes(saved)) return saved;
  return navigatorLanguages.some((l) => String(l).toLowerCase().startsWith('it')) ? 'it' : 'en';
}

/**
 * Traduce un testo italiano. Se manca la traduzione inglese si mostra l'italiano (il test i18n lo segnala).
 * @param {string} it testo originale, con eventuali segnaposto {nome}
 * @param {Record<string, string|number>} [params]
 */
export function t(it, params) {
  const s = lang === 'en' ? (EN[it] ?? it) : it;
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
}

/** Numero con una cifra decimale: virgola in italiano, punto in inglese. */
export const fmtNum = (v, digits = 1) => {
  const s = v.toFixed(digits);
  return lang === 'it' ? s.replace('.', ',') : s;
};

/** Codice per le date (toLocaleDateString). */
export const locale = () => (lang === 'it' ? 'it-IT' : 'en-GB');

/**
 * Traduce l'HTML statico: testi e attributi (placeholder, aria-label, title, data-sub, data-short) che compaiono
 * nel dizionario. I testi italiani dell'HTML sono le chiavi, quindi l'HTML resta in italiano.
 * @param {ParentNode} root
 */
export function translateDom(root) {
  if (lang === 'it') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const raw = n.nodeValue;
    const key = raw.replace(/\s+/g, ' ').trim();
    if (key && EN[key] != null) n.nodeValue = raw.replace(raw.trim(), EN[key]);
  }
  for (const el of root.querySelectorAll('[placeholder], [aria-label], [title], [data-sub], [data-short]')) {
    for (const attr of ['placeholder', 'aria-label', 'title', 'data-sub', 'data-short']) {
      const v = el.getAttribute(attr);
      const key = v?.replace(/\s+/g, ' ').trim();
      if (key && EN[key] != null) el.setAttribute(attr, EN[key]);
    }
  }
}
