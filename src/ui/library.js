// Finestra "Libreria partite": elenco delle partite di data/examples/index.json, con filtro per
// categoria e ricerca per nome. Scegliendo una partita ne scarica il PGN e lo passa a onPick.
// L'indice si scarica alla prima apertura; i PGN solo quando servono.

import { UI_CONFIG } from '../config/ui.js';

const ALL = '';
/** Testo confrontabile: minuscolo e senza accenti (Réti = reti, Polgár = polgar). */
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const RESULT_TEXT = { '1-0': '1–0', '0-1': '0–1', '1/2-1/2': '½–½' };

/**
 * @typedef {Object} LibraryGame  voce di data/examples/index.json
 * @property {string} id
 * @property {string} white
 * @property {string} black
 * @property {number} year
 * @property {string} event
 * @property {string} result
 * @property {number} moves
 * @property {string[]} categories
 * @property {{ eco: string, name: string }|null} opening
 * @property {string} famous
 * @property {string} pgn  percorso relativo a UI_CONFIG.examples.baseUrl
 */

export class Library {
  /**
   * @param {HTMLDialogElement} dialog
   * @param {(pgnText: string, game: LibraryGame) => void} onPick
   */
  constructor(dialog, onPick) {
    this.dialog = dialog;
    this.onPick = onPick;
    /** @type {LibraryGame[]|null} */
    this.games = null;
    this.category = ALL;
    this.q = (sel) => dialog.querySelector(sel);
    this.q('.lib-search').addEventListener('input', () => this.renderList());
    this.q('.lib-close').addEventListener('click', () => dialog.close());
    // Tocco sullo sfondo fuori dalla finestra: chiude.
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    this.renderFilters();
  }

  async open() {
    this.setError('');
    this.dialog.showModal();
    if (this.games) return this.renderList();
    this.q('.lib-count').textContent = 'Caricamento…';
    try {
      const res = await fetch(UI_CONFIG.examples.indexUrl);
      if (!res.ok) throw new Error(String(res.status));
      this.games = (await res.json()).games;
      this.renderList();
    } catch {
      this.q('.lib-count').textContent = '';
      this.setError('Libreria non disponibile: serve la connessione la prima volta che la apri.');
    }
  }

  setError(msg) {
    this.q('.lib-error').textContent = msg;
  }

  renderFilters() {
    const box = this.q('.lib-filters');
    const options = [{ id: ALL, label: 'Tutte' }, ...UI_CONFIG.examples.categories];
    box.replaceChildren(...options.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (c.id === this.category ? ' active' : '');
      b.textContent = c.label;
      b.dataset.category = c.id;
      b.setAttribute('aria-pressed', String(c.id === this.category));
      b.addEventListener('click', () => {
        this.category = c.id;
        this.renderFilters();
        this.renderList();
      });
      return b;
    }));
  }

  /** Partite che rispettano categoria e ricerca. */
  visible() {
    const words = fold(this.q('.lib-search').value).split(/\s+/).filter(Boolean);
    return (this.games ?? []).filter((g) => {
      if (this.category !== ALL && !g.categories.includes(this.category)) return false;
      const names = fold(`${g.white} ${g.black}`);
      return words.every((w) => names.includes(w));
    });
  }

  renderList() {
    if (!this.games) return;
    const list = this.visible();
    this.q('.lib-count').textContent = list.length === 1 ? '1 partita' : `${list.length} partite`;
    this.q('.lib-list').replaceChildren(...list.map((g) => this.item(g)));
  }

  /** @param {LibraryGame} g */
  item(g) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lib-item';
    b.dataset.id = g.id;
    const line = (cls, text) => {
      const el = document.createElement('span');
      el.className = cls;
      el.textContent = text;
      b.append(el);
    };
    line('lib-players', `${g.white} – ${g.black}`);
    line('lib-meta', `${g.year} · ${g.event} · ${RESULT_TEXT[g.result] ?? g.result} · ${g.moves} mosse`);
    if (g.opening) line('lib-opening', `${g.opening.eco} · ${g.opening.name}`);
    line('lib-famous', g.famous);
    b.addEventListener('click', () => this.pick(g, b));
    li.append(b);
    return li;
  }

  /** @param {LibraryGame} g @param {HTMLButtonElement} button */
  async pick(g, button) {
    this.setError('');
    button.disabled = true;
    try {
      const res = await fetch(UI_CONFIG.examples.baseUrl + g.pgn);
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      this.dialog.close();
      this.q('.lib-search').value = ''; // alla prossima apertura si rivede tutto l'elenco
      this.renderList();
      this.onPick(text, g);
    } catch {
      this.setError('Partita non disponibile: controlla la connessione.');
    } finally {
      button.disabled = false;
    }
  }
}
