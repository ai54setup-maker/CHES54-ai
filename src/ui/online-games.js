// Finestra "Le tue partite online": ultime partite di un utente di Lichess o Chess.com (API pubbliche, senza login).
// La partita scelta passa dallo stesso percorso di un PGN incollato (startReview in app.js).

import { UI_CONFIG } from '../config/ui.js';
import { t } from '../i18n/i18n.js';
import { SOURCES, normalizeUser, recentArchives, chessComPgns, lichessPgns, summarize } from '../analysis/online-games.js';

const CFG = UI_CONFIG.onlineGames;
const RESULT_TEXT = { w: { '1-0': 'win', '0-1': 'loss' }, b: { '0-1': 'win', '1-0': 'loss' } };
const OUTCOME_LABEL = { win: 'Vinta', loss: 'Persa', draw: 'Patta' };

export class OnlineGames {
  /**
   * @param {HTMLDialogElement} dialog
   * @param {{ store: { get: (k:string, d:any)=>any, set: (k:string, v:any)=>void },
   *   onPick: (pgn: string, game: { color: 'w'|'b'|null, user: string }) => void }} deps
   */
  constructor(dialog, deps) {
    this.dialog = dialog;
    this.deps = deps;
    this.q = (sel) => dialog.querySelector(sel);
    this.source = deps.store.get('onlineSource', 'lichess') === 'chesscom' ? 'chesscom' : 'lichess';
    this.q('#on-user').value = deps.store.get('onlineUser', '');
    this.q('.on-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    this.q('#on-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.search();
    });
    for (const b of this.q('#on-source').children) {
      b.addEventListener('click', () => {
        this.source = b.dataset.source;
        this.renderSource();
        this.q('#on-list').replaceChildren();
        this.q('#on-count').textContent = '';
      });
    }
    this.renderSource();
  }

  open() {
    this.setError('');
    this.dialog.showModal();
    if (!this.q('#on-user').value) this.q('#on-user').focus();
  }

  renderSource() {
    for (const b of this.q('#on-source').children) {
      const on = b.dataset.source === this.source;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    }
  }

  setError(msg) {
    this.q('#on-error').textContent = msg;
  }

  async search() {
    const user = normalizeUser(this.q('#on-user').value);
    this.q('#on-list').replaceChildren();
    if (!user) return this.setError(t('Scrivi un nome utente valido (lettere, numeri, "_" o "-").'));
    this.setError('');
    this.deps.store.set('onlineUser', user);
    this.deps.store.set('onlineSource', this.source);
    const count = this.q('#on-count');
    count.textContent = t('Cerco le partite…');
    const btn = this.q('#on-form button');
    btn.disabled = true;
    try {
      const pgns = this.source === 'lichess' ? await this.fromLichess(user) : await this.fromChessCom(user);
      this.games = summarize(pgns.slice(0, CFG.max), user);
      count.textContent = this.games.length
        ? t('Ultime {n} partite di {user} su {site}. Tocca una partita per la revisione.', { n: this.games.length, user, site: SOURCES[this.source].label })
        : t('Nessuna partita trovata per {user}.', { user });
      this.renderList(user);
    } catch (e) {
      count.textContent = '';
      this.setError(e.message);
    } finally {
      btn.disabled = false;
    }
  }

  /** @param {{ missingOk?: boolean }} [opts] missingOk: un 404 non è un errore (restituisce null) */
  async get(url, accept, { missingOk = false } = {}) {
    let res;
    try {
      res = await fetch(url, { headers: { Accept: accept } });
    } catch {
      throw new Error(t('Non riesco a contattare {site}: controlla la connessione.', { site: SOURCES[this.source].label }));
    }
    if (res.status === 404 && missingOk) return null;
    if (res.status === 404) throw new Error(t('Utente non trovato su {site}.', { site: SOURCES[this.source].label }));
    if (res.status === 429) throw new Error(t('Troppe richieste in poco tempo: riprova tra un minuto.'));
    if (!res.ok) throw new Error(t('{site} ha risposto con un errore ({status}). Riprova più tardi.', { site: SOURCES[this.source].label, status: res.status }));
    return res;
  }

  async fromLichess(user) {
    const res = await this.get(SOURCES.lichess.gamesUrl(user, CFG.max), 'application/x-chess-pgn');
    return lichessPgns(await res.text());
  }

  async fromChessCom(user) {
    const archives = await (await this.get(SOURCES.chesscom.archivesUrl(user), 'application/json')).json();
    const pgns = [];
    // Dal mese più recente all'indietro, finché non ci sono abbastanza partite
    for (const url of recentArchives(archives.archives, CFG.chessComMonths)) {
      // Il mese in corso compare nell'elenco anche quando il suo archivio non esiste ancora (404): si salta
      const month = await this.get(url, 'application/json', { missingOk: true });
      if (month) pgns.push(...chessComPgns(await month.json()));
      if (pgns.length >= CFG.max) break;
    }
    return pgns;
  }

  renderList(user) {
    const list = this.q('#on-list');
    list.replaceChildren(...this.games.map((g) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lib-item';
      const outcome = g.color ? (RESULT_TEXT[g.color][g.result] ?? (g.result === '1/2-1/2' ? 'draw' : '')) : '';
      const line = (cls, text) => Object.assign(document.createElement('span'), { className: cls, textContent: text });
      b.append(
        line('lib-players', `${g.white}${g.whiteElo ? ` (${g.whiteElo})` : ''} – ${g.black}${g.blackElo ? ` (${g.blackElo})` : ''}`),
        line('lib-meta', [g.result, outcome && t(OUTCOME_LABEL[outcome]), g.timeControl, g.date].filter(Boolean).join(' · ')),
      );
      if (g.opening) b.append(line('lib-opening', g.opening));
      if (outcome) b.dataset.outcome = outcome;
      b.addEventListener('click', () => {
        this.dialog.close();
        this.deps.onPick(g.pgn, { color: g.color, user });
      });
      li.append(b);
      return li;
    }));
  }
}
