// Pagina "Sostieni CHES54": perché il sito è gratis, link per le donazioni, schede degli sponsor.
// Gli sponsor vengono da data/sponsors/sponsors.json (si aggiungono senza toccare il codice). Solo link normali verso
// siti esterni (rel="sponsored noopener noreferrer"): nessuno script o widget di terzi, nessun tracciamento.

import { UI_CONFIG } from '../config/ui.js';
import { t, getLang } from '../i18n/i18n.js';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE = /^[A-Za-z0-9._-]+\.(?:webp|png|jpe?g|svg)$/;

/**
 * Controlla sponsors.json. Per gli sponsor nascosti bastano id e nome; per quelli visibili servono anche città,
 * descrizione in italiano e inglese e link https; logo e foto sono facoltativi ma, se indicati, devono essere file validi.
 * @param {any} data contenuto di sponsors.json
 * @param {(file: string) => boolean} [exists] il file esiste nella cartella degli sponsor? (solo nei test)
 * @returns {string[]} errori (vuoto = tutto a posto)
 */
export function validateSponsors(data, exists = () => true) {
  const errors = [];
  if (!data || !Array.isArray(data.sponsors)) return ['manca l\'elenco "sponsors"'];
  const ids = new Set();
  data.sponsors.forEach((s, i) => {
    const at = `sponsor ${i + 1}${s?.id ? ` (${s.id})` : ''}`;
    if (!s || typeof s !== 'object') return errors.push(`${at}: non è un oggetto`);
    if (typeof s.id !== 'string' || !ID.test(s.id)) errors.push(`${at}: id non valido`);
    else if (ids.has(s.id)) errors.push(`${at}: id ripetuto`);
    ids.add(s.id);
    if (typeof s.name !== 'string' || !s.name.trim()) errors.push(`${at}: manca il nome`);
    for (const key of ['logo', 'photo']) {
      if (s[key] == null) continue;
      if (typeof s[key] !== 'string' || !IMAGE.test(s[key])) errors.push(`${at}: ${key} non valido`);
      else if (!exists(s[key])) errors.push(`${at}: il file ${s[key]} non esiste`);
    }
    if (s.hidden === true) return;
    if (typeof s.city !== 'string' || !s.city.trim()) errors.push(`${at}: manca la città`);
    for (const lang of ['it', 'en']) {
      if (typeof s.description?.[lang] !== 'string' || !s.description[lang].trim()) errors.push(`${at}: manca la descrizione (${lang})`);
    }
    let url = null;
    try { url = new URL(s.url); } catch { /* sotto */ }
    if (url?.protocol !== 'https:') errors.push(`${at}: il link deve iniziare con https://`);
  });
  return errors;
}

/** Sponsor da mostrare: quelli non nascosti e validi, nell'ordine del file. */
export function visibleSponsors(data) {
  return (data?.sponsors ?? []).filter((s) => s && s.hidden !== true && !validateSponsors({ sponsors: [s] }).length);
}

const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children.filter((c) => c != null && c !== false && c !== ''));
  return e;
};

/** Link esterno: nuova scheda, nessun referrer, segnalato come sponsorizzato. */
export function externalLink(href, ...children) {
  const a = el('a', { href, target: '_blank' }, ...children);
  a.rel = 'sponsored noopener noreferrer';
  return a;
}

export class SupportPage {
  /** @param {HTMLElement} root vista #view-support */
  constructor(root) {
    this.root = root;
    this.$ = (sel) => root.querySelector(sel);
    this.loaded = null;
    const donate = this.$('#sp-donate');
    donate.href = UI_CONFIG.support.donateUrl;
    donate.target = '_blank';
    donate.rel = 'sponsored noopener noreferrer';
  }

  async show() {
    this.loaded ??= fetch(UI_CONFIG.support.sponsorsUrl)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => this.renderSponsors(data));
    await this.loaded;
  }

  renderSponsors(data) {
    const list = visibleSponsors(data);
    this.$('#sp-sponsors').hidden = !list.length;
    const lang = getLang() === 'en' ? 'en' : 'it';
    const dir = UI_CONFIG.support.sponsorsUrl.replace(/[^/]*$/, '');
    this.$('#sp-grid').replaceChildren(...list.map((s) => {
      const media = s.logo
        ? el('div', { className: 'sp-logo' }, el('img', { src: dir + s.logo, alt: t('Logo di {name}', { name: s.name }), loading: 'lazy' }))
        : el('div', { className: 'sp-logo sp-nologo' }, el('span', { textContent: s.name }));
      const card = el('article', { className: 'card sp-card' },
        s.photo && el('img', { className: 'sp-photo', src: dir + s.photo, alt: '', loading: 'lazy' }),
        media,
        el('h3', { className: 'sp-name', textContent: s.name }),
        el('p', { className: 'sp-city', textContent: s.city }),
        el('p', { className: 'sp-desc', textContent: s.description[lang] }),
        externalLink(s.url, `${t('Visita')} ↗`));
      card.querySelector('a').className = 'btn sp-visit';
      card.dataset.id = s.id;
      return card;
    }));
  }
}
