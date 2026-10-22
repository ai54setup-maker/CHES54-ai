// Audio: suoni dei pezzi e musica lofi di sottofondo, generati in tempo reale con la Web Audio API.
// Nessun file audio: niente copyright di terzi, niente download, funziona anche offline.
// Il browser permette di avviare l'audio solo dopo un gesto dell'utente: il contesto si crea al primo uso.

const AC = typeof window !== 'undefined' ? (window.AudioContext ?? window.webkitAudioContext) : null;
let ctx = null;
let sfxBus = null;

/** Contatori letti dai test dell'interfaccia (anche da window: dopo un ricaricamento il test vede la stessa copia). */
export const audioStats = { moveSounds: 0, musicSteps: 0 };
if (typeof window !== 'undefined') window.__ches54Audio = audioStats;

function audio() {
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.6;
    sfxBus.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Rumore bianco riutilizzabile (1 s). */
let noiseBuf = null;
function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

/** Inviluppo rapido: sale in `a` secondi e scende in `d` secondi fino a quasi zero. */
function env(param, t, peak, a, d) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + a);
  param.exponentialRampToValueAtTime(0.0001, t + a + d);
}

// ---------- suoni dei pezzi ----------
let sfxOn = true;
export const setSoundEffects = (on) => { sfxOn = !!on; };

/** "Toc" di legno: rumore filtrato (attacco) + tono basso smorzato (corpo). */
function knock(c, t, { freq = 1700, body = 190, gain = 0.5 } = {}) {
  const n = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 3;
  const ng = c.createGain();
  env(ng.gain, t, gain, 0.002, 0.045);
  n.connect(bp).connect(ng).connect(sfxBus);
  n.start(t, Math.random() * 0.5, 0.08);
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(body * 1.4, t);
  o.frequency.exponentialRampToValueAtTime(body, t + 0.05);
  const og = c.createGain();
  env(og.gain, t, gain * 0.7, 0.003, 0.09);
  o.connect(og).connect(sfxBus);
  o.start(t);
  o.stop(t + 0.15);
}

/**
 * Suono di una mossa sulla scacchiera.
 * @param {{ capture?: boolean, check?: boolean }} [m]
 */
export function playMoveSound({ capture = false, check = false } = {}) {
  if (!sfxOn) return;
  const c = audio();
  if (!c) return;
  audioStats.moveSounds++;
  const t = c.currentTime + 0.005;
  if (capture) {
    knock(c, t, { freq: 1300, body: 150, gain: 0.6 });
    knock(c, t + 0.035, { freq: 2100, body: 230, gain: 0.35 });
  } else {
    knock(c, t);
  }
  if (check) {
    // Piccolo segnale cristallino, nei toni del sito
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1318.5, t + 0.06); // Mi6
    o.frequency.setValueAtTime(1046.5, t + 0.14); // Do6
    const g = c.createGain();
    env(g.gain, t + 0.06, 0.12, 0.01, 0.3);
    o.connect(g).connect(sfxBus);
    o.start(t + 0.06);
    o.stop(t + 0.45);
  }
}

// ---------- musica lofi ----------
const BPM = 72;
const STEP = 60 / BPM / 2; // una croma
const SWING = 0.18; //        le crome in levare arrivano un po' dopo
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
// Giro "blu": Rem9 – Sol13 – Domaj9 – Lam9 (accordi aperti, morbidi), 2 battute ciascuno
const CHORDS = [
  { bass: 38, notes: [53, 57, 60, 64] }, // Re: Fa La Do Mi
  { bass: 43, notes: [53, 59, 64, 69] }, // Sol: Fa Si Mi La
  { bass: 36, notes: [52, 55, 59, 62] }, // Do: Mi Sol Si Re
  { bass: 45, notes: [55, 60, 64, 71] }, // La: Sol Do Mi Si
];
const PENTA = [69, 72, 74, 76, 79, 81]; // La minore pentatonica, ottava media

let music = null; // { master, verb, timer, nextTime, step, crackle }
let musicVolume = 0.5;

function makeReverb(c) {
  const len = Math.floor(c.sampleRate * 2.6);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  return conv;
}

/** Nota di piano elettrico: due oscillatori leggermente stonati, attacco morbido, filtro passa-basso. */
function epiano(c, out, t, note, dur, vel) {
  const g = c.createGain();
  env(g.gain, t, vel, 0.02, dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1500;
  lp.connect(g).connect(out);
  for (const [type, detune, level] of [['sine', -6, 1], ['triangle', 7, 0.35]]) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = midi(note);
    o.detune.value = detune;
    const og = c.createGain();
    og.gain.value = level;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}

function kick(c, out, t, vel) {
  const o = c.createOscillator();
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  const g = c.createGain();
  env(g.gain, t, vel, 0.005, 0.32);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.4);
}

function snare(c, out, t, vel) {
  const n = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700;
  bp.Q.value = 0.8;
  const g = c.createGain();
  env(g.gain, t, vel, 0.004, 0.16);
  n.connect(bp).connect(g).connect(out);
  n.start(t, Math.random() * 0.5, 0.25);
}

function hat(c, out, t, vel) {
  const n = noise(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const g = c.createGain();
  env(g.gain, t, vel, 0.002, 0.04);
  n.connect(hp).connect(g).connect(out);
  n.start(t, Math.random() * 0.5, 0.08);
}

/** Fruscio continuo del vinile (rumore filtrato) con qualche crepitio. */
function startCrackle(c, out) {
  const n = noise(c);
  n.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2500;
  const g = c.createGain();
  g.gain.value = 0.012;
  n.connect(lp).connect(g).connect(out);
  n.start();
  return n;
}

/** Programma una croma (step) della musica al tempo t. */
function scheduleStep(c, m, step, t) {
  audioStats.musicSteps++;
  const bar = Math.floor(step / 8);
  const pos = step % 8; // 8 crome per battuta (4/4)
  const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
  const human = () => (Math.random() - 0.5) * 0.012;
  if (pos % 2 === 1) t += STEP * SWING;
  // Accordi: a inizio battuta e, a volte, un richiamo sul levare del 3
  if (pos === 0 || (pos === 5 && Math.random() < 0.45)) {
    const len = pos === 0 ? STEP * 7 : STEP * 3;
    chord.notes.forEach((n, i) => epiano(c, m.keys, t + i * 0.012 + human(), n, len, pos === 0 ? 0.07 : 0.045));
  }
  // Basso: sul primo tempo e sul levare del terzo
  if (pos === 0 || pos === 5) epiano(c, m.bass, t + human(), chord.bass, STEP * (pos === 0 ? 4 : 2.5), 0.22);
  // Batteria
  if (pos === 0 || (pos === 3 && Math.random() < 0.3) || pos === 5) kick(c, m.drums, t + human(), pos === 0 ? 0.55 : 0.4);
  if (pos === 2 || pos === 6) snare(c, m.drums, t + human(), 0.11);
  hat(c, m.drums, t + human(), pos % 2 ? 0.025 : 0.045);
  // Melodia rada, pentatonica, con eco nel riverbero
  if (pos % 2 === 0 && Math.random() < 0.16) {
    const n = PENTA[Math.floor(Math.random() * PENTA.length)];
    epiano(c, m.lead, t + human(), n, STEP * 3, 0.05);
  }
}

/** Avvia la musica (dopo un gesto dell'utente). */
export function startMusic() {
  const c = audio();
  if (!c || music) return;
  const master = c.createGain();
  master.gain.value = 0.0001;
  master.gain.exponentialRampToValueAtTime(Math.max(0.0001, musicVolume), c.currentTime + 2.5);
  // Suono "nastro": un leggero passa-basso su tutto
  const tape = c.createBiquadFilter();
  tape.type = 'lowpass';
  tape.frequency.value = 4200;
  tape.connect(master).connect(c.destination);
  const verb = makeReverb(c);
  const verbGain = c.createGain();
  verbGain.gain.value = 0.35;
  verb.connect(verbGain).connect(tape);
  const bus = (level, wet) => {
    const g = c.createGain();
    g.gain.value = level;
    g.connect(tape);
    if (wet) {
      const s = c.createGain();
      s.gain.value = wet;
      g.connect(s).connect(verb);
    }
    return g;
  };
  music = {
    master,
    keys: bus(1, 0.6), bass: bus(0.9, 0), drums: bus(0.8, 0.15), lead: bus(1, 1),
    step: 0, nextTime: c.currentTime + 0.15,
  };
  music.crackle = startCrackle(c, tape);
  // Programmazione in anticipo (lookahead): ogni 100 ms si preparano le note dei prossimi 300 ms
  music.timer = setInterval(() => {
    while (music && music.nextTime < c.currentTime + 0.3) {
      scheduleStep(c, music, music.step, music.nextTime);
      music.step++;
      music.nextTime += STEP;
    }
  }, 100);
}

/** Ferma la musica con una breve dissolvenza. */
export function stopMusic() {
  if (!music || !ctx) return;
  const m = music;
  music = null;
  clearInterval(m.timer);
  const t = ctx.currentTime;
  m.master.gain.cancelScheduledValues(t);
  m.master.gain.setValueAtTime(Math.max(0.0001, m.master.gain.value), t);
  m.master.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  setTimeout(() => {
    m.crackle.stop();
    m.master.disconnect();
  }, 1400);
}

export const isMusicPlaying = () => !!music;

/** Volume della musica, 0–1. */
export function setMusicVolume(v) {
  musicVolume = Math.min(1, Math.max(0, v));
  if (music && ctx) music.master.gain.setTargetAtTime(Math.max(0.0001, musicVolume), ctx.currentTime, 0.1);
}
