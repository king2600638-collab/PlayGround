/* NINE — nine lives, nine skies.
   A self-contained canvas climbing game. No external assets. */
(() => {
  'use strict';

  // ---------------------------------------------------------------- utilities
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hexRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } }
  };

  // ---------------------------------------------------------------- constants
  const H = 900;                 // logical height of the world
  const GOAL = 9000;             // metres to the summit
  const GRAV = 2500;
  const JUMP = 960;
  const MAXV = 545;
  const ACCEL = 3100;
  const START_LIVES = 9;
  const PLAYER = { w: 46, h: 44 };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

  const SECTORS = [
    { name: 'EMBER',   colors: { top: '#140a24', bottom: '#3b0f2c', accent: '#ffb26b', glow: '#ff4d6d', star: '#ffe3c9' } },
    { name: 'TIDE',    colors: { top: '#061826', bottom: '#0a3550', accent: '#6ff0ff', glow: '#2f7dff', star: '#d7fbff' } },
    { name: 'BLOOM',   colors: { top: '#1b0a2c', bottom: '#3d1240', accent: '#ff9ee0', glow: '#c44dff', star: '#ffe1f5' } },
    { name: 'VERDANT', colors: { top: '#051a19', bottom: '#0d3a2a', accent: '#7dffc4', glow: '#1fd98a', star: '#ddffef' } },
    { name: 'SOLAR',   colors: { top: '#201004', bottom: '#3f2107', accent: '#ffd479', glow: '#ff9a1f', star: '#fff2c9' } },
    { name: 'FROST',   colors: { top: '#0a1626', bottom: '#163a55', accent: '#c4f6ff', glow: '#58d8ff', star: '#eafcff' } },
    { name: 'VOID',    colors: { top: '#100a20', bottom: '#26103f', accent: '#c7a6ff', glow: '#7c4dff', star: '#eee4ff' } },
    { name: 'BLOOD',   colors: { top: '#1a0710', bottom: '#390d1b', accent: '#ff9a9a', glow: '#ff2f5e', star: '#ffe0e0' } },
    { name: 'CROWN',   colors: { top: '#1c1608', bottom: '#3e2f0a', accent: '#ffe89a', glow: '#ffcf3f', star: '#fffbe0' } }
  ];
  const PAL_KEYS = ['top', 'bottom', 'accent', 'glow', 'star'];

  // ---------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const dom = {
    hud: $('hud'), lives: $('lives'), sectorChip: $('sectorChip'),
    heightVal: $('heightVal'), shardVal: $('shardVal'),
    railFill: $('railFill'), railDot: $('railDot'),
    banner: $('banner'), scoreFloat: $('scoreFloat'), hintToast: $('hintToast'),
    menu: $('menu'), menuBest: $('menuBest'), playBtn: $('playBtn'),
    pauseScr: $('pauseScr'), pauseBtn: $('pauseBtn'), resumeBtn: $('resumeBtn'),
    muteBtn: $('muteBtn'),
    overScr: $('overScr'), overKicker: $('overKicker'), overTitle: $('overTitle'),
    overSub: $('overSub'), overHint: $('overHint'), stats: $('stats'), retryBtn: $('retryBtn')
  };

  // ---------------------------------------------------------------- view
  const view = { cssW: 1, cssH: 1, dpr: 1, scale: 1, worldW: 540, offset: 0 };

  function resize() {
    const cw = Math.max(1, window.innerWidth);
    const ch = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    view.cssW = cw;
    view.cssH = ch;
    view.dpr = dpr;
    view.scale = ch / H;
    const fullW = cw / view.scale;
    view.worldW = Math.min(fullW, 860);
    view.offset = (fullW - view.worldW) / 2;
    layoutHud();
    if (game.player) {
      game.player.x = clamp(game.player.x, PLAYER.w / 2 + 10, view.worldW - PLAYER.w / 2 - 10);
      for (const p of game.platforms) {
        p.baseX = clamp(p.baseX, 20 + p.w / 2, view.worldW - 20 - p.w / 2);
        p.x = clamp(p.x, 20 + p.w / 2, view.worldW - 20 - p.w / 2);
      }
      for (const s of game.shards) s.x = clamp(s.x, 20, view.worldW - 20);
      for (const o of game.orbs) {
        o.baseX = clamp(o.baseX, 34, view.worldW - 34);
        o.x = clamp(o.x, 34, view.worldW - 34);
      }
    }
  }

  function layoutHud() {
    const w = view.worldW * view.scale;
    const left = view.offset * view.scale;
    dom.hud.style.left = left + 'px';
    dom.hud.style.width = w + 'px';
  }

  // ---------------------------------------------------------------- palette
  const pal = {};
  for (const k of PAL_KEYS) pal[k] = hexRgb(SECTORS[0].colors[k]);

  function setPaletteInstant(index) {
    const c = SECTORS[index].colors;
    for (const k of PAL_KEYS) pal[k] = hexRgb(c[k]);
  }

  function updatePalette(dt) {
    const c = SECTORS[game.sector].colors;
    const t = 1 - Math.exp(-dt * 1.7);
    for (const k of PAL_KEYS) {
      const target = hexRgb(c[k]);
      pal[k][0] = lerp(pal[k][0], target[0], t);
      pal[k][1] = lerp(pal[k][1], target[1], t);
      pal[k][2] = lerp(pal[k][2], target[2], t);
    }
  }

  // ---------------------------------------------------------------- stars
  const stars = Array.from({ length: 150 }, () => ({
    x: Math.random(),
    y: Math.random(),
    depth: rand(0.12, 0.62),
    size: rand(0.6, 2.1),
    alpha: rand(0.18, 0.8),
    twinkle: rand(0.6, 2.2),
    phase: rand(0, TAU)
  }));

  // ---------------------------------------------------------------- glow sprites
  function makeGlow(rgb, size = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.32, `rgba(${rgb},0.42)`);
    grad.addColorStop(0.68, `rgba(${rgb},0.1)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }
  const glowWhite = makeGlow('255,248,235');
  const glowRed = makeGlow('255,70,105');
  const glowGold = makeGlow('255,226,160');

  // ---------------------------------------------------------------- sound
  class Sound {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.delay = null;
      this.muted = store.get('nine.muted', '0') === '1';
      this.musicOn = false;
      this.nextNote = 0;
      this.noteIndex = 0;
      this.root = 110;
      this.padOsc = [];
      this.padGain = null;
      this.buffer = null;
    }

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);

        this.delay = this.ctx.createDelay(1);
        this.delay.delayTime.value = 0.27;
        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.26;
        const wet = this.ctx.createGain();
        wet.gain.value = 0.22;
        this.delay.connect(feedback).connect(this.delay);
        this.delay.connect(wet).connect(this.master);

        const len = Math.floor(this.ctx.sampleRate * 0.4);
        this.buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.buffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.updateMuteButton();
      } catch { this.ctx = null; }
    }

    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

    setMuted(m) {
      this.muted = m;
      store.set('nine.muted', m ? '1' : '0');
      if (this.master && this.ctx) {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.06);
      }
      this.updateMuteButton();
    }

    updateMuteButton() {
      dom.muteBtn.classList.toggle('muted', this.muted);
      dom.muteBtn.setAttribute('aria-label', this.muted ? 'Unmute sound' : 'Mute sound');
    }

    tone(freq, dur, type = 'sine', gain = 0.15, opts = {}) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime + (opts.when || 0);
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), t0);
      if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
      const g = this.ctx.createGain();
      const attack = opts.attack ?? 0.005;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const dest = opts.delay ? this.delay : this.master;
      osc.connect(g);
      g.connect(dest);
      if (opts.delay) g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    }

    noise(dur = 0.2, gain = 0.1, freq = 900) {
      if (!this.ctx || this.muted || !this.buffer) return;
      const t0 = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = 0.7;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(g).connect(this.master);
      src.start(t0);
      src.stop(t0 + dur);
    }

    jump(step) {
      const notes = [0, 2, 4, 7, 9, 12, 14, 16, 19];
      const f = 220 * Math.pow(2, notes[step % 9] / 12);
      this.tone(f, 0.12, 'triangle', 0.13, { slideTo: f * 1.55, delay: true });
      this.tone(f * 2, 0.05, 'sine', 0.03);
    }

    spring() {
      this.tone(300, 0.22, 'sine', 0.12, { slideTo: 1400 });
      this.tone(450, 0.26, 'triangle', 0.06, { slideTo: 1800, delay: true });
    }

    shard(n) {
      const f = 784 * Math.pow(2, (n % 7) / 12);
      this.tone(f, 0.2, 'triangle', 0.1, { delay: true });
      this.tone(f * 1.5, 0.14, 'sine', 0.045, { delay: true });
    }

    hurt() {
      this.tone(260, 0.34, 'sawtooth', 0.11, { slideTo: 55 });
      this.noise(0.26, 0.13, 500);
    }

    sector() {
      [0, 7, 12].forEach((n, i) => {
        this.tone(329.63 * Math.pow(2, n / 12), 0.7, 'sine', 0.05, { when: i * 0.07, delay: true });
      });
    }

    win() {
      [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => {
        this.tone(261.63 * Math.pow(2, n / 12), 0.55, 'triangle', 0.09, { when: i * 0.11, delay: true });
      });
      this.noise(1.2, 0.05, 2200);
    }

    over() {
      [0, -2, -5, -9].forEach((n, i) => {
        this.tone(220 * Math.pow(2, n / 12), 0.6, 'sine', 0.09, { when: i * 0.16, delay: true });
      });
    }

    startMusic() {
      this.init();
      if (!this.ctx || this.musicOn) return;
      this.musicOn = true;
      this.nextNote = this.ctx.currentTime + 0.1;
      this.noteIndex = 0;
      if (!this.padGain) {
        this.padGain = this.ctx.createGain();
        this.padGain.gain.value = 0.0001;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        this.padGain.connect(this.master);
        filter.connect(this.padGain);
        for (const detune of [-7, 7]) {
          const o = this.ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = this.root;
          o.detune.value = detune;
          o.connect(filter);
          o.start();
          this.padOsc.push(o);
        }
        this.padGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 1.2);
      }
    }

    setMusicRoot(sector) {
      this.root = [110, 123.47, 98, 130.81, 146.83, 116.54, 103.83, 92.5, 164.81][sector] || 110;
      if (!this.ctx || !this.padOsc.length) return;
      const t = this.ctx.currentTime;
      this.padOsc.forEach((o) => o.frequency.setTargetAtTime(this.root, t, 0.8));
    }

    update() {
      if (!this.ctx || !this.musicOn) return;
      const now = this.ctx.currentTime;
      if (this.nextNote < now - 0.4) this.nextNote = now + 0.08;
      while (this.nextNote < now + 0.25) {
        const scale = [0, 3, 5, 7, 10, 12, 15, 10, 7, 5, 3, 0];
        const step = scale[this.noteIndex % scale.length];
        const octave = this.noteIndex % 8 === 0 ? 1 : 2;
        const f = this.root * octave * Math.pow(2, step / 12);
        this.tone(f, 0.42, 'triangle', 0.028, { when: Math.max(0, this.nextNote - now), delay: true, attack: 0.02 });
        if (this.noteIndex % 4 === 0) {
          this.tone(this.root / 2, 0.9, 'sine', 0.022, { when: Math.max(0, this.nextNote - now) });
        }
        this.nextNote += 0.46;
        this.noteIndex++;
      }
    }
  }

  const sound = new Sound();

  // ---------------------------------------------------------------- game state
  const game = {
    state: 'menu',
    player: {
      x: 200, y: -22, vx: 0, vy: 0, squash: 1, face: 1, invuln: 0,
      blink: 0, blinkTimer: 2, trail: []
    },
    platforms: [], shards: [], orbs: [], parts: [], rings: [], texts: [],
    camY: 0, topY: 0, genX: 0, genY: 0, genCount: 0, summitPlaced: false,
    lastSafe: null, lives: START_LIVES, shardsGot: 0,
    progress: 0, maxProgress: 0, sector: 0,
    time: 0, runTime: 0, bounceStep: 0,
    shake: 0, shakeX: 0, shakeY: 0, flash: 0, flashColor: [255, 90, 120],
    overlayTimer: 0, pendingWin: false,
    best: Math.min(GOAL, parseInt(store.get('nine.best', '0'), 10) || 0),
    hitStop: 0
  };
  game.player.x = view.worldW / 2;

  // ---------------------------------------------------------------- helpers
  function isVisible(y, pad = 80) {
    return y > game.camY - pad && y < game.camY + H + pad;
  }

  function addParticle(x, y, opts = {}) {
    if (game.parts.length > 240) game.parts.shift();
    game.parts.push({
      x, y,
      vx: opts.vx ?? rand(-60, 60),
      vy: opts.vy ?? rand(-140, 20),
      life: opts.life ?? rand(0.4, 0.9),
      maxLife: 0,
      size: opts.size ?? rand(2, 5),
      color: opts.color || pal.accent,
      grav: opts.grav ?? 900,
      drag: opts.drag ?? 0.985,
      type: opts.type || 'spark',
      spin: rand(0, TAU),
      spinV: rand(-8, 8)
    });
    const p = game.parts[game.parts.length - 1];
    p.maxLife = p.life;
  }

  function burst(x, y, count, color, power = 1, type = 'spark') {
    const n = reducedMotion ? Math.ceil(count * 0.4) : count;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(40, 260) * power;
      addParticle(x, y, {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        color,
        life: rand(0.35, 0.85),
        size: rand(1.6, 4.6) * (type === 'confetti' ? 1.4 : 1),
        type
      });
    }
  }

  function ring(x, y, color, maxR = 90, life = 0.55, width = 3) {
    game.rings.push({ x, y, r: 6, maxR, life, maxLife: life, color, width });
    if (game.rings.length > 24) game.rings.shift();
  }

  function floatText(x, y, text, color = pal.accent, size = 20) {
    game.texts.push({ x, y, text, color, size, life: 1.1, maxLife: 1.1 });
    if (game.texts.length > 16) game.texts.shift();
  }

  // expose a few things for debugging / capture
  window.__nine = {
    game, view, sound,
    warp(height) {
      const P = game.player;
      const target = -height;
      game.progress = height;
      game.maxProgress = height;
      generateTo(target - 900);
      let best = null;
      for (const p of game.platforms) {
        if (p.y > target + 40 || p.y < target - 430) continue;
        if (!best || Math.abs(p.y - target) < Math.abs(best.y - target)) best = p;
      }
      if (!best) best = { x: view.worldW / 2, y: target, w: 200, h: 18, type: 'normal', bounce: 0, dead: false };
      game.camY = best.y - H * 0.62;
      P.x = best.x;
      P.y = best.y - PLAYER.h / 2 - 2;
      P.vx = 0;
      P.vy = -JUMP;
      P.invuln = 2;
      game.lastSafe = { platform: best, x: best.x, y: best.y };
      const s = Math.min(8, Math.floor(height / 1000));
      setPaletteInstant(s);
      setSectorVisuals(s, true);
      updateHud(true);
    }
  };

  // ---------------------------------------------------------------- world build
  function resetRun() {
    const P = game.player;
    game.platforms = [];
    game.shards = [];
    game.orbs = [];
    game.parts = [];
    game.rings = [];
    game.texts = [];
    game.lives = START_LIVES;
    game.shardsGot = 0;
    game.progress = 0;
    game.maxProgress = 0;
    game.runTime = 0;
    game.bounceStep = 0;
    game.summitPlaced = false;
    game.shake = 0;
    game.flash = 0;
    game.shakeX = game.shakeY = 0;
    game.overlayTimer = 0;
    game.pendingWin = false;
    game.sector = 0;
    game.player.invuln = 0;
    game.player.blink = 0;
    game.player.blinkTimer = 2.2;
    game.player.trail = [];
    game.player.vx = 0;
    game.player.vy = 0;
    game.player.squash = 1;
    game.player.face = 1;

    const startW = Math.min(300, view.worldW - 54);
    const ground = {
      x: view.worldW / 2, baseX: view.worldW / 2, y: 0, w: startW, h: 18,
      type: 'start', amp: 0, speed: 1, phase: 0, bounce: 0, breakTimer: 0, dead: false
    };
    game.platforms.push(ground);
    game.genX = ground.x;
    game.genY = ground.y;
    game.genCount = 0;
    game.topY = 0;
    game.lastSafe = { platform: ground };

    P.x = ground.x;
    P.y = ground.y - PLAYER.h / 2 - 1;
    game.camY = P.y - H * 0.62;

    setSectorVisuals(0, true);
    generateTo(game.camY - 760);
    updateHearts();
    updateHud(true);
  }

  function addSummit() {
    if (game.summitPlaced) return;
    game.summitPlaced = true;
    const w = Math.min(370, view.worldW - 60);
    game.platforms.push({
      x: view.worldW / 2, baseX: view.worldW / 2, y: -GOAL, w, h: 22,
      type: 'summit', amp: 0, speed: 1, phase: 0, bounce: 0, breakTimer: 0, dead: false
    });
    game.topY = -GOAL - 30;
  }

  function generateTo(targetY) {
    let guard = 0;
    while (!game.summitPlaced && game.genY > targetY && guard++ < 140) {
      const climbed = -game.genY;
      if (climbed >= GOAL - 155) { addSummit(); break; }

      const t = clamp(climbed / GOAL, 0, 1);
      const sector = Math.min(8, Math.floor(climbed / 1000));
      const diff = 0.15 + t * 0.85;

      const gap = rand(lerp(96, 122, t), lerp(120, 150, t));
      const y = game.genY - gap;
      let width = lerp(196, 108, diff) + rand(-14, 18);
      width = Math.min(width, view.worldW - 60);
      width = Math.max(78, width);

      const span = Math.min(285, 170 + t * 140);
      let x = game.genX + rand(-span, span);
      x = lerp(x, view.worldW / 2, 0.16);
      x = clamp(x, 26 + width / 2, view.worldW - 26 - width / 2);

      let type = 'normal';
      const r = Math.random();
      const springChance = sector >= 2 ? 0.05 + t * 0.045 : 0;
      const fragileChance = sector >= 3 ? 0.05 + t * 0.12 : 0;
      const movingChance = sector >= 1 ? 0.07 + t * 0.2 : 0;
      if (r < springChance) type = 'spring';
      else if (r < springChance + fragileChance) type = 'fragile';
      else if (r < springChance + fragileChance + movingChance) type = 'moving';

      if (type === 'spring') width = Math.max(width, 100);

      const p = {
        x, baseX: x, y, w: width, h: 18, type,
        amp: 0, speed: rand(0.55, 1.25), phase: rand(0, TAU),
        bounce: 0, breakTimer: 0, dead: false
      };

      if (type === 'moving') {
        const room = Math.min(x - 26 - width / 2, view.worldW - 26 - width / 2 - x);
        p.amp = Math.max(24, Math.min(rand(45, 120), room * 0.8));
        p.baseX = clamp(x, 26 + width / 2 + p.amp, view.worldW - 26 - width / 2 - p.amp);
        p.x = p.baseX;
      }

      game.platforms.push(p);
      game.genX = x;
      game.genY = y;
      game.genCount++;

      // shards float in the gap
      if (Math.random() < 0.62) {
        const n = Math.random() < 0.22 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const sx = clamp(lerp(game.platforms[game.platforms.length - 2].x, x, 0.5) + rand(-34, 34) + i * 26, 24, view.worldW - 24);
          game.shards.push({ x: sx, y: y + gap * 0.46 + i * 22, got: false, phase: rand(0, TAU) });
        }
      }

      // drifting hazards appear from the third sector
      if (sector >= 2 && Math.random() < 0.18 + t * 0.3) {
        let ox = rand(40, view.worldW - 40);
        for (let attempt = 0; attempt < 4; attempt++) {
          if (Math.abs(ox - x) > 62 && Math.abs(ox - game.platforms[game.platforms.length - 2].x) > 62) break;
          ox = rand(40, view.worldW - 40);
        }
        game.orbs.push({
          x: ox, baseX: ox, y: y + gap * 0.5, r: 17,
          amp: rand(18, 62), speed: rand(0.4, 0.9), phase: rand(0, TAU), spin: rand(0, TAU)
        });
      }
    }
  }

  function prune() {
    const bottom = game.camY + H + 480;
    game.platforms = game.platforms.filter((p) => p.y < bottom && !p.dead);
    game.shards = game.shards.filter((s) => !s.got && s.y < game.camY + H + 220);
    game.orbs = game.orbs.filter((o) => o.y < game.camY + H + 220);
  }

  function setSectorVisuals(sector, quiet) {
    game.sector = sector;
    const c = SECTORS[sector].colors;
    document.documentElement.style.setProperty('--accent', c.accent);
    document.documentElement.style.setProperty('--glow', c.glow);
    dom.sectorChip.textContent = `${ROMAN[sector]} · ${SECTORS[sector].name}`;
    sound.setMusicRoot(sector);
    if (!quiet && game.state === 'playing') {
      showBanner(`SECTOR ${ROMAN[sector]}`, SECTORS[sector].name);
      sound.sector();
      game.flash = 0.35;
      game.flashColor = hexRgb(c.accent);
      const P = game.player;
      ring(P.x, P.y, c.accent, 170, 0.8, 4);
      ring(P.x, P.y, c.glow, 120, 0.6, 2);
      for (let i = 0; i < 16; i++) {
        addParticle(P.x, P.y, { vx: rand(-260, 260), vy: rand(-220, 140), color: hexRgb(c.accent), life: rand(0.5, 1), size: rand(2, 4) });
      }
    }
  }

  // ---------------------------------------------------------------- run control
  function startGame() {
    if (game.state !== 'menu') return;
    sound.init();
    sound.resume();
    sound.startMusic();
    game.state = 'playing';
    game.runTime = 0;
    game.player.vy = -JUMP * 0.96;
    game.player.squash = 1.22;
    game.player.trail = [];
    burst(game.player.x, game.player.y + PLAYER.h / 2, 10, pal.accent, 0.6);
    sound.jump(0);
    dom.menu.classList.add('is-hidden');
    dom.menu.setAttribute('aria-hidden', 'true');
    setHudVisible(true);
    updateHearts();
    updateHud(true);
    showHint('DRAG OR ← → TO STEER · AUTO-JUMP');
  }

  function newRun() {
    resetRun();
    hidePanel(dom.overScr);
    dom.overScr.setAttribute('aria-hidden', 'true');
    setHudVisible(true);
    game.state = 'playing';
    game.player.vy = -JUMP * 0.96;
    sound.init();
    sound.resume();
    sound.startMusic();
    sound.jump(0);
    dom.retryBtn.textContent = 'Retry';
    showHint('DRAG OR ← → TO STEER · AUTO-JUMP');
  }

  function setHudVisible(visible) {
    dom.hud.classList.toggle('is-hidden', !visible);
    dom.hud.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function hidePanel(el) { el.classList.add('is-hidden'); }

  function presentEnd(win) {
    const height = Math.min(GOAL, Math.floor(game.maxProgress));
    const newBest = height > game.best;
    if (newBest) {
      game.best = height;
      store.set('nine.best', String(height));
    }
    dom.menuBest.textContent = game.best.toLocaleString('en-US') + ' m';
    const stat = (label, value) => `<div><span>${label}</span><b>${value}</b></div>`;
    const time = formatTime(game.runTime);

    if (win) {
      dom.overKicker.textContent = 'NINE SKIES CLEARED';
      dom.overTitle.textContent = 'Summit reached.';
      dom.overSub.textContent = newBest ? 'A new personal best. The tower remembers.' : 'Nine lives. One tower. You won.';
      dom.stats.innerHTML = stat('METRES', '9,000') + stat('SHARDS', game.shardsGot) + stat('LIVES', game.lives) + stat('TIME', time);
      dom.stats.style.gridTemplateColumns = 'repeat(4, 1fr)';
      dom.retryBtn.textContent = 'Climb again';
      dom.overHint.textContent = 'R / ENTER to climb again';
    } else {
      dom.overKicker.textContent = newBest ? 'NEW BEST · RUN OVER' : 'RUN OVER';
      dom.overTitle.textContent = 'Out of lives.';
      dom.overSub.textContent = `Fell at ${height.toLocaleString('en-US')} m. The tower keeps your highest mark.`;
      dom.stats.innerHTML = stat('HEIGHT', height.toLocaleString('en-US') + ' m') + stat('SHARDS', game.shardsGot) + stat('TIME', time);
      dom.stats.style.gridTemplateColumns = 'repeat(3, 1fr)';
      dom.retryBtn.textContent = 'Retry';
      dom.overHint.textContent = 'R / ENTER to retry';
    }
    dom.overScr.classList.remove('is-hidden');
    dom.overScr.setAttribute('aria-hidden', 'false');
    dom.retryBtn.focus({ preventScroll: true });
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ---------------------------------------------------------------- HUD
  const hudCache = { height: -1, shards: -1, lives: -1 };
  const heartSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.7 4.6 13.3a4.7 4.7 0 1 1 6.6-6.6l.8.8.8-.8a4.7 4.7 0 1 1 6.6 6.6Z"/></svg>';

  function buildHearts() {
    dom.lives.innerHTML = '';
    for (let i = 0; i < START_LIVES; i++) {
      const el = document.createElement('span');
      el.className = 'life';
      el.innerHTML = heartSVG;
      dom.lives.appendChild(el);
    }
  }

  function updateHearts() {
    const hearts = dom.lives.children;
    for (let i = 0; i < hearts.length; i++) {
      const lost = i >= game.lives;
      if (hearts[i].classList.contains('lost') !== lost) {
        hearts[i].classList.toggle('lost', lost);
        if (lost) {
          hearts[i].classList.remove('pop');
          void hearts[i].offsetWidth;
          hearts[i].classList.add('pop');
        }
      }
    }
    dom.lives.classList.toggle('low', game.lives > 0 && game.lives <= 3);
    hudCache.lives = game.lives;
  }

  function updateHud(force) {
    const h = Math.min(GOAL, Math.floor(game.maxProgress));
    if (force || h !== hudCache.height) {
      hudCache.height = h;
      dom.heightVal.textContent = h.toLocaleString('en-US');
    }
    if (force || game.shardsGot !== hudCache.shards) {
      hudCache.shards = game.shardsGot;
      dom.shardVal.textContent = String(game.shardsGot);
    }
    const pct = clamp(game.maxProgress / GOAL, 0, 1) * 100;
    dom.railFill.style.height = pct.toFixed(2) + '%';
    dom.railDot.style.bottom = pct.toFixed(2) + '%';
  }

  let bannerTimer = 0;
  function showBanner(kicker, title) {
    dom.banner.innerHTML = `<span>${kicker}</span><strong>${title}</strong>`;
    dom.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => dom.banner.classList.remove('show'), 2100);
  }

  let hintTimer = 0;
  function showHint(text) {
    dom.hintToast.textContent = text;
    dom.hintToast.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => dom.hintToast.classList.remove('show'), 3800);
  }

  // ---------------------------------------------------------------- update
  function updatePlaying(dt) {
    const P = game.player;
    game.runTime += dt;
    game.player.blinkTimer -= dt;
    if (P.blinkTimer <= 0) { P.blink = 0.12; P.blinkTimer = rand(2.4, 5.6); }
    P.blink = Math.max(0, P.blink - dt);

    // steer
    if (steer.active && steer.targetX !== null) {
      const desired = clamp((steer.targetX - P.x) * 8.5, -MAXV, MAXV);
      P.vx += (desired - P.vx) * Math.min(1, dt * 16);
    } else {
      const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (dir !== 0) {
        P.vx += dir * ACCEL * dt;
        P.vx = clamp(P.vx, -MAXV, MAXV);
      } else {
        P.vx *= Math.pow(0.0004, dt);
      }
    }
    if (P.invuln > 0) P.invuln -= dt;

    // vertical motion
    const prevY = P.y;
    P.vy += GRAV * dt;
    P.y += P.vy * dt;
    P.x += P.vx * dt;

    const minX = PLAYER.w / 2 + 8;
    const maxX = view.worldW - PLAYER.w / 2 - 8;
    if (P.x < minX) { P.x = minX; P.vx = Math.max(0, P.vx); }
    if (P.x > maxX) { P.x = maxX; P.vx = Math.min(0, P.vx); }

    P.face = P.vx > 24 ? 1 : P.vx < -24 ? -1 : P.face;
    P.squash += (1 - P.squash) * Math.min(1, dt * 11);

    if (!reducedMotion) {
      if (P.trail.length === 0 || Math.hypot(P.x - P.trail[0].x, P.y - P.trail[0].y) > 9) {
        P.trail.unshift({ x: P.x, y: P.y, t: 0 });
        if (P.trail.length > 9) P.trail.pop();
      }
      for (const t of P.trail) t.t += dt;
    }

    for (const p of game.platforms) {
      if (p.type === 'moving' && !p.dead) {
        p.x = clamp(p.baseX + Math.sin(game.time * p.speed + p.phase) * p.amp, 24 + p.w / 2, view.worldW - 24 - p.w / 2);
      }
      if (p.bounce > 0) p.bounce = Math.max(0, p.bounce - dt * 4.2);
      if (p.breakTimer > 0) {
        p.breakTimer -= dt;
        if (p.breakTimer <= 0 && !p.dead) {
          p.dead = true;
          burst(p.x, p.y + 6, 14, hexRgb(SECTORS[game.sector].colors.accent), 0.8, 'debris');
          sound.noise(0.14, 0.06, 700);
        }
      }
    }

    collide(prevY);

    // camera only climbs
    const target = P.y - H * 0.62;
    if (target < game.camY) game.camY = lerp(game.camY, target, 1 - Math.exp(-dt * 9));

    if (!game.summitPlaced) generateTo(game.camY - 760);
    else generateTo(game.camY - 760);
    prune();

    // progress
    const feet = -(P.y + PLAYER.h / 2);
    if (feet > game.progress) game.progress = feet;
    if (game.progress > game.maxProgress) game.maxProgress = game.progress;
    const sector = Math.min(8, Math.floor(game.maxProgress / 1000));
    if (sector !== game.sector) setSectorVisuals(sector, false);

    updateShards(dt);
    updateOrbs(dt);

    if (Math.random() < dt * 2.2) {
      addParticle(rand(6, view.worldW - 6), game.camY + H + 20, {
        vx: rand(-16, 16), vy: rand(-90, -40), life: rand(2.2, 4.5), size: rand(1, 2.8),
        color: pal.accent, grav: 0, drag: 0.999, type: 'mote'
      });
    }

    updateHud(false);

    if (P.y > game.camY + H + 160) { hurt(); return; }
    if (game.progress >= GOAL - 0.5 && game.state === 'playing') triggerWin();
  }

  function collide(prevY) {
    const P = game.player;
    if (P.vy <= 0) return;
    const prevBottom = prevY + PLAYER.h / 2;
    const bottom = P.y + PLAYER.h / 2;
    for (const p of game.platforms) {
      if (p.dead) continue;
      if (prevBottom <= p.y + 6 && bottom >= p.y) {
        const half = PLAYER.w / 2 - 5;
        if (P.x + half > p.x - p.w / 2 + 2 && P.x - half < p.x + p.w / 2 - 2) {
          landOn(p);
          return;
        }
      }
    }
  }

  function landOn(p) {
    const P = game.player;
    const spring = p.type === 'spring';
    P.y = p.y - PLAYER.h / 2 - 0.1;
    P.vy = spring ? -JUMP * 1.4 : -JUMP;
    P.squash = 0.7;
    p.bounce = 1;
    game.bounceStep = (game.bounceStep + 1) % 9;

    if (p.type !== 'fragile' && p.type !== 'summit') {
      game.lastSafe = { platform: p, x: p.x, y: p.y };
    }

    const foot = p.y + 2;
    if (spring) {
      sound.spring();
      ring(p.x, p.y, hexRgb('#ffffff'), 70, 0.4, 2);
      ring(p.x, p.y, pal.accent, 110, 0.55, 3);
      burst(p.x, foot, 12, pal.accent, 0.9);
      game.shake = Math.max(game.shake, 5);
    } else {
      sound.jump(game.bounceStep);
      burst(p.x, foot, 5, pal.accent, 0.35, 'puff');
      ring(p.x, p.y, pal.accent, 34, 0.32, 2);
    }

    if (p.type === 'fragile') {
      p.breakTimer = 0.2;
      burst(p.x, foot, 5, [255, 220, 180], 0.4, 'debris');
    }
    if (p.type === 'summit') triggerWin();
  }

  function updateShards(dt) {
    const P = game.player;
    for (const s of game.shards) {
      if (s.got) continue;
      if (!isVisible(s.y, 120)) continue;
      const dx = P.x - s.x;
      const dy = P.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d < 96 && d > 0.001) {
        const pull = (1 - d / 96) * 260 * dt;
        s.x += (dx / d) * pull;
        s.y += (dy / d) * pull;
      }
      if (d < 34) {
        s.got = true;
        game.shardsGot++;
        sound.shard(game.shardsGot);
        burst(s.x, s.y, 12, pal.accent, 0.7);
        ring(s.x, s.y, pal.accent, 46, 0.4, 2);
        floatText(s.x, s.y - 16, '+1', pal.accent, 18);
        if (game.shardsGot % 10 === 0 && game.lives < START_LIVES) {
          game.lives++;
          updateHearts();
          floatText(s.x, s.y - 46, '+1 LIFE', [255, 120, 160], 20);
          burst(s.x, s.y, 18, [255, 120, 160], 1);
          ring(s.x, s.y, [255, 120, 160], 90, 0.6, 3);
          sound.sector();
        }
        updateHud(false);
      }
    }
  }

  function updateOrbs(dt) {
    const P = game.player;
    for (const o of game.orbs) {
      o.spin += dt * 1.6;
      o.x = clamp(o.baseX + Math.sin(game.time * o.speed + o.phase) * o.amp, 30, view.worldW - 30);
      if (!isVisible(o.y, 120)) continue;
      if (P.invuln <= 0 && game.state === 'playing') {
        if (Math.hypot(P.x - o.x, P.y - o.y) < o.r + 17) { hurt(); return; }
      }
    }
  }

  function hurt() {
    const P = game.player;
    if (game.state !== 'playing' || P.invuln > 0) return;
    game.lives--;
    updateHearts();
    sound.hurt();
    game.flash = 0.9;
    game.flashColor = [255, 60, 96];
    game.shake = reducedMotion ? 0 : 17;
    burst(P.x, P.y, 22, [255, 90, 120], 1.1);
    ring(P.x, P.y, [255, 70, 110], 120, 0.5, 3);
    floatText(P.x, P.y - 34, '-1 LIFE', [255, 105, 135], 17);

    if (game.lives <= 0) {
      game.state = 'dead';
      game.pendingWin = false;
      game.overlayTimer = 1.2;
      P.invuln = 999;
      P.vy = -JUMP * 0.5;
      burst(P.x, P.y, 46, [255, 80, 115], 1.6);
      ring(P.x, P.y, [255, 70, 110], 220, 0.9, 5);
      sound.over();
      return;
    }
    respawn();
  }

  function respawn() {
    const P = game.player;
    let x = view.worldW / 2;
    let y = 0;
    const safe = game.lastSafe;
    if (safe) {
      if (safe.platform && !safe.platform.dead) {
        x = safe.platform.x;
        y = safe.platform.y;
      } else if (typeof safe.x === 'number') {
        x = safe.x;
        y = safe.y;
      }
    }
    P.x = clamp(x, PLAYER.w / 2 + 10, view.worldW - PLAYER.w / 2 - 10);
    P.y = y - PLAYER.h / 2 - 3;
    P.vx = 0;
    P.vy = -JUMP * 0.85;
    P.invuln = 2.5;
    P.trail = [];
    game.camY = P.y - H * 0.62;
    ring(P.x, P.y, [255, 255, 255], 90, 0.5, 3);
    ring(P.x, P.y, pal.accent, 54, 0.4, 2);
    burst(P.x, P.y + 20, 10, pal.accent, 0.6);
  }

  function triggerWin() {
    if (game.state !== 'playing') return;
    const P = game.player;
    game.state = 'won';
    game.pendingWin = true;
    game.overlayTimer = 1.5;
    P.invuln = 999;
    P.vy = -JUMP * 0.62;
    P.vx = 0;
    sound.win();
    game.flash = 0.9;
    game.flashColor = [255, 248, 220];
    game.shake = reducedMotion ? 0 : 12;
    dom.hintToast.classList.remove('show');
    showBanner('9,000 M', 'SUMMIT');
    for (let i = 0; i < 90; i++) {
      addParticle(P.x + rand(-160, 160), P.y - rand(0, 80), {
        vx: rand(-200, 200), vy: rand(-360, -60), life: rand(1, 2.4),
        size: rand(2, 5), color: hexRgb(pick(SECTORS).colors.accent), grav: 260, type: 'confetti'
      });
    }
    ring(P.x, P.y, [255, 250, 230], 260, 1.1, 5);
    ring(P.x, P.y, pal.accent, 180, 0.9, 3);
  }

  function updateMenu(dt) {
    const P = game.player;
    P.blinkTimer -= dt;
    if (P.blinkTimer <= 0) { P.blink = 0.12; P.blinkTimer = rand(2.2, 5); }
    P.blink = Math.max(0, P.blink - dt);
    if (Math.random() < dt * 3) {
      addParticle(rand(0, view.worldW), game.camY + rand(H * 0.55, H + 40), {
        vx: rand(-12, 12), vy: rand(-45, -14), life: rand(2.5, 5), size: rand(0.8, 2.2),
        color: pal.accent, grav: -4, drag: 0.999, type: 'mote'
      });
    }
  }

  function updateEnd(dt) {
    if (game.overlayTimer > 0) {
      game.overlayTimer -= dt;
      if (game.overlayTimer <= 0) {
        game.overlayTimer = 0;
        presentEnd(game.pendingWin);
      }
    }
  }

  function updateEffects(dt) {
    for (let i = game.parts.length - 1; i >= 0; i--) {
      const p = game.parts[i];
      p.life -= dt;
      if (p.life <= 0) { game.parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += p.spinV * dt;
    }
    for (let i = game.rings.length - 1; i >= 0; i--) {
      const r = game.rings[i];
      r.life -= dt;
      r.r += (r.maxR - r.r) * Math.min(1, dt * 7);
      if (r.life <= 0) game.rings.splice(i, 1);
    }
    for (let i = game.texts.length - 1; i >= 0; i--) {
      const t = game.texts[i];
      t.life -= dt;
      t.y -= 34 * dt;
      if (t.life <= 0) game.texts.splice(i, 1);
    }
    if (game.flash > 0) game.flash = Math.max(0, game.flash - dt * 2.4);
    game.shake = Math.max(0, game.shake - dt * (game.shake * 7 + 6));
    if (game.shake > 0.3 && !reducedMotion) {
      game.shakeX = (Math.random() * 2 - 1) * game.shake;
      game.shakeY = (Math.random() * 2 - 1) * game.shake;
    } else {
      game.shakeX = 0;
      game.shakeY = 0;
    }
  }

  function update(dt) {
    if (game.state === 'paused') return;
    game.time += dt;
    updatePalette(dt);
    sound.update();
    updateEffects(dt);
    if (game.state === 'menu') updateMenu(dt);
    else if (game.state === 'playing') updatePlaying(dt);
    else if (game.state === 'dead' || game.state === 'won') updateEnd(dt);
  }

  // ---------------------------------------------------------------- keys / pointer
  const keys = { left: false, right: false };
  const steer = { active: false, id: null, startX: 0, startPlayerX: 0, targetX: null };

  function togglePause() {
    if (game.state === 'playing') {
      game.state = 'paused';
      dom.pauseScr.classList.remove('is-hidden');
      dom.pauseScr.setAttribute('aria-hidden', 'false');
      dom.resumeBtn.focus({ preventScroll: true });
      keys.left = keys.right = false;
      steer.active = false;
      steer.targetX = null;
    } else if (game.state === 'paused') {
      game.state = 'playing';
      dom.pauseScr.classList.add('is-hidden');
      dom.pauseScr.setAttribute('aria-hidden', 'true');
      sound.resume();
    }
  }

  function toggleMute() {
    sound.init();
    sound.resume();
    sound.setMuted(!sound.muted);
  }

  function retry() {
    if (game.state === 'dead' || game.state === 'won') newRun();
  }

  // ---------------------------------------------------------------- render
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const bgCache = { canvas: document.createElement('canvas'), ctx: null, w: 0, h: 0, last: -10 };

  function buildBackdrop(w, h) {
    const cw = Math.max(2, Math.ceil(w / 2));
    const ch = Math.max(2, Math.ceil(h / 2));
    if (bgCache.w !== cw || bgCache.h !== ch) {
      bgCache.canvas.width = cw;
      bgCache.canvas.height = ch;
      bgCache.ctx = bgCache.canvas.getContext('2d');
      bgCache.w = cw;
      bgCache.h = ch;
      bgCache.last = -10;
    }
    const g = bgCache.ctx;
    const time = game.time;
    const grd = g.createLinearGradient(0, 0, 0, ch);
    grd.addColorStop(0, rgba(pal.top));
    grd.addColorStop(0.62, rgba(mix(pal.top, pal.bottom, 0.6)));
    grd.addColorStop(1, rgba(pal.bottom));
    g.fillStyle = grd;
    g.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 2; i++) {
      const cx = cw * (0.5 + Math.sin(time * 0.045 + i * 2.1) * 0.28);
      const cy = ch * (0.26 + i * 0.34) + Math.sin(time * 0.07 + i * 1.4) * 12;
      const rad = Math.max(cw, ch) * (0.5 + i * 0.14);
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      rg.addColorStop(0, rgba(pal.glow, i === 0 ? 0.17 : 0.1));
      rg.addColorStop(0.45, rgba(pal.glow, 0.045));
      rg.addColorStop(1, rgba(pal.glow, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, cw, ch);
    }
    bgCache.last = time;
  }

  function drawBackground() {
    const w = view.cssW;
    const h = view.cssH;
    if (!bgCache.ctx || bgCache.w !== Math.ceil(w / 2) || bgCache.h !== Math.ceil(h / 2) || game.time - bgCache.last > 0.14) {
      buildBackdrop(w, h);
    }
    ctx.drawImage(bgCache.canvas, 0, 0, w, h);
    drawStars(w, h);
    drawTowerSides(w, h);
    drawGrid(w, h);

    // focus the play column on wide screens
    if (view.offset > 4) {
      const left = view.offset * view.scale;
      const right = left + view.worldW * view.scale;
      const side = ctx.createLinearGradient(0, 0, left, 0);
      side.addColorStop(0, 'rgba(2,2,8,0.6)');
      side.addColorStop(1, 'rgba(2,2,8,0)');
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, left, h);
      const side2 = ctx.createLinearGradient(right, 0, w, 0);
      side2.addColorStop(0, 'rgba(2,2,8,0)');
      side2.addColorStop(1, 'rgba(2,2,8,0.6)');
      ctx.fillStyle = side2;
      ctx.fillRect(right, 0, w - right, h);
      ctx.strokeStyle = rgba(pal.accent, 0.1);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left + 0.5, 0); ctx.lineTo(left + 0.5, h);
      ctx.moveTo(right - 0.5, 0); ctx.lineTo(right - 0.5, h);
      ctx.stroke();
    }
  }

  function drawStars(w, h) {
    const camH = -game.camY;
    const time = game.time;
    ctx.save();
    for (const s of stars) {
      let y = (s.y * h + camH * s.depth * 0.34) % h;
      if (y < 0) y += h;
      const x = s.x * w + Math.sin(time * 0.16 + s.phase) * 6 * s.depth;
      const a = s.alpha * (0.55 + 0.45 * Math.sin(time * s.twinkle + s.phase));
      const ss = s.size * (0.7 + s.depth);
      ctx.fillStyle = rgba(pal.star, a * 0.75);
      ctx.fillRect(x - ss / 2, y - ss / 2, ss, ss);
    }
    ctx.restore();
  }

  function drawTowerSides(w, h) {
    const camH = -game.camY;
    const scale = view.scale;
    ctx.save();
    for (let i = 0; i < 2; i++) {
      const x = (i === 0 ? 0.075 : 0.925) * w;
      ctx.strokeStyle = rgba(pal.accent, 0.07);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
      const spacing = 210 * scale;
      const off = ((camH * scale * 0.55) % spacing + spacing) % spacing;
      ctx.strokeStyle = rgba(pal.accent, 0.045);
      ctx.beginPath();
      for (let y = off; y < h; y += spacing) {
        ctx.moveTo(x - 16 * scale, y + 0.5);
        ctx.lineTo(x + 16 * scale, y + 0.5);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGrid(w, h) {
    const scale = view.scale;
    const spacing = 150 * scale;
    const offset = ((-game.camY * scale * 0.82) % spacing + spacing) % spacing;
    ctx.save();
    ctx.strokeStyle = rgba(pal.star, 0.035);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = offset; y < h; y += spacing) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawWorld() {
    drawSummitBeam();

    for (const p of game.platforms) {
      if (!isVisible(p.y, 90)) continue;
      if (game.state === 'menu' && p.type !== 'start') continue;
      drawPlatform(p);
    }
    if (game.state !== 'menu') {
      for (const s of game.shards) {
        if (s.got || !isVisible(s.y, 60)) continue;
        drawShard(s);
      }
      for (const o of game.orbs) {
        if (!isVisible(o.y, 70)) continue;
        drawOrb(o);
      }
    }

    if (game.state !== 'dead') drawCat(game.player.x, game.player.y, game.player.face, game.player.squash, 1);
    drawParticles();
    drawRings();
    drawTexts();
  }

  function drawSummitBeam() {
    if (!game.summitPlaced) return;
    if (game.camY > -GOAL + H + 500) return;
    const top = -GOAL - 620;
    const yTop = top;
    const h = 680;
    const cx = view.worldW / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, yTop, 0, -GOAL + 60);
    g.addColorStop(0, rgba(pal.accent, 0));
    g.addColorStop(0.5, rgba(pal.accent, 0.14));
    g.addColorStop(1, rgba(pal.glow, 0.34));
    ctx.fillStyle = g;
    for (let i = 0; i < 6; i++) {
      ctx.globalAlpha = 0.55 / (i + 1);
      const bw = 70 + i * 62;
      ctx.fillRect(cx - bw / 2, yTop + i * 30, bw, h - i * 30);
    }
    ctx.globalAlpha = 1;
    const halo = ctx.createRadialGradient(cx, -GOAL + 30, 0, cx, -GOAL + 30, 440);
    halo.addColorStop(0, rgba([255, 246, 215], 0.3));
    halo.addColorStop(0.5, rgba(pal.glow, 0.12));
    halo.addColorStop(1, rgba(pal.glow, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(cx - 460, -GOAL - 460, 920, 920);
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = rgba([255, 250, 225], 0.5);
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, -GOAL + 46 - i * 30, 118 + i * 30, 13 + i * 3, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlatform(p) {
    const bounce = p.bounce;
    const x = p.x - p.w / 2;
    const y = p.y + bounce * 3.5;
    const w = p.w;
    const h = p.h;
    const isSpring = p.type === 'spring';
    const isFragile = p.type === 'fragile';
    const isSummit = p.type === 'summit';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 + bounce * 0.2;
    ctx.drawImage(glowWhite, x - 14, y - 16, w + 28, h + 34);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (isSummit) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4;
      ctx.drawImage(glowGold, x - 60, y - 64, w + 120, 150);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    const rim = isFragile ? [255, 168, 118] : isSummit ? [255, 226, 160] : pal.accent;
    const topColor = mix([22, 17, 38], rim, isSpring ? 0.72 : isSummit ? 0.68 : 0.52);
    const midColor = mix([12, 10, 26], rim, isSpring ? 0.34 : 0.2);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, rgba(topColor, 0.99));
    g.addColorStop(0.28, rgba(midColor, 0.99));
    g.addColorStop(0.72, rgba(mix([8, 6, 18], rim, 0.08), 0.99));
    g.addColorStop(1, 'rgba(5,4,12,0.99)');
    rr(x, y, w, h, isSummit ? 12 : 9);
    ctx.fillStyle = g;
    if (isFragile) ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(rim, isFragile ? 0.7 : 0.9);
    ctx.stroke();

    rr(x + 2.2, y + 2.2, w - 4.4, h - 4.4, isSummit ? 8 : 6);
    ctx.strokeStyle = rgba(rim, 0.22);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 12, y + 1.7);
    ctx.lineTo(x + w - 12, y + 1.7);
    ctx.strokeStyle = `rgba(255,255,255,${0.45 + bounce * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (isSpring) {
      const pulse = 0.65 + Math.sin(game.time * 5 + p.phase) * 0.25;
      ctx.fillStyle = rgba([255, 255, 255], 0.12 * pulse);
      rr(x + 8, y + 4, w - 16, h - 8, 5);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
      ctx.lineWidth = 2;
      const cx = x + w / 2;
      for (let i = 0; i < 2; i++) {
        const yy = y + h / 2 + 6 - i * 5;
        ctx.beginPath();
        ctx.moveTo(cx - 11, yy);
        ctx.lineTo(cx, yy - 6);
        ctx.lineTo(cx + 11, yy);
        ctx.stroke();
      }
    } else if (isFragile) {
      ctx.strokeStyle = 'rgba(255,190,150,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.28, y + 2);
      ctx.lineTo(x + w * 0.34, y + 9);
      ctx.lineTo(x + w * 0.26, y + h - 2);
      ctx.moveTo(x + w * 0.63, y + 1);
      ctx.lineTo(x + w * 0.58, y + 8);
      ctx.lineTo(x + w * 0.68, y + h - 3);
      ctx.stroke();
    } else if (p.type === 'moving') {
      ctx.fillStyle = rgba(pal.accent, 0.95);
      const my = y + h / 2;
      ctx.beginPath();
      ctx.moveTo(x + 7, my - 3.5);
      ctx.lineTo(x + 7, my + 3.5);
      ctx.lineTo(x + 2.5, my);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + w - 7, my - 3.5);
      ctx.lineTo(x + w - 7, my + 3.5);
      ctx.lineTo(x + w - 2.5, my);
      ctx.closePath();
      ctx.fill();
    } else if (isSummit) {
      drawCrown(x + w / 2, y - 24, 1.35, pal.accent);
      ctx.strokeStyle = rgba([255, 250, 225], 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 20, y + h - 4);
      ctx.lineTo(x + w - 20, y + h - 4);
      ctx.stroke();
    } else if (p.type === 'start') {
      const cx = x + w / 2;
      ctx.strokeStyle = rgba(pal.star, 0.42);
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 2; i++) {
        const yy = y + h / 2 + 4.5 - i * 4.5;
        ctx.beginPath();
        ctx.moveTo(cx - 5.5, yy);
        ctx.lineTo(cx, yy - 4.5);
        ctx.lineTo(cx + 5.5, yy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawCrown(cx, cy, scale, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(glowGold, -34, -28, 68, 68);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba([255, 245, 205], 0.98);
    ctx.beginPath();
    ctx.moveTo(-15, 6);
    ctx.lineTo(-17, -9);
    ctx.lineTo(-7, -1);
    ctx.lineTo(0, -13);
    ctx.lineTo(7, -1);
    ctx.lineTo(17, -9);
    ctx.lineTo(15, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(color, 1);
    ctx.fillRect(-15, 6, 30, 3);
    ctx.restore();
  }

  function drawShard(s) {
    const bob = Math.sin(game.time * 2.2 + s.phase) * 4;
    const x = s.x;
    const y = s.y + bob;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45;
    ctx.drawImage(glowWhite, x - 27, y - 27, 54, 54);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y);
    ctx.rotate(game.time * 1.3 + s.phase);
    const g = ctx.createLinearGradient(0, -12, 0, 12);
    g.addColorStop(0, 'rgba(255,255,255,0.98)');
    g.addColorStop(0.5, rgba(pal.accent, 1));
    g.addColorStop(1, rgba(pal.glow, 0.95));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(7.5, 0);
    ctx.lineTo(0, 12);
    ctx.lineTo(-7.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, 7);
    ctx.stroke();
    ctx.restore();
  }

  function drawOrb(o) {
    const bob = Math.sin(game.time * 1.8 + o.phase) * 4;
    const x = o.x;
    const y = o.y + bob;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(glowRed, x - 38, y - 38, 76, 76);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y);
    ctx.rotate(o.spin);
    ctx.fillStyle = 'rgba(60,4,18,0.95)';
    for (let i = 0; i < 8; i++) {
      ctx.rotate(TAU / 8);
      ctx.beginPath();
      ctx.moveTo(o.r - 2, 0);
      ctx.lineTo(o.r + 9, -4.5);
      ctx.lineTo(o.r + 9, 4.5);
      ctx.closePath();
      ctx.fill();
    }
    const core = ctx.createRadialGradient(-3, -3, 1, 0, 0, o.r);
    core.addColorStop(0, 'rgba(255,220,220,1)');
    core.addColorStop(0.35, 'rgba(255,70,110,1)');
    core.addColorStop(1, 'rgba(90,0,25,1)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, o.r, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,80,120,0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, o.r + 13 + Math.sin(game.time * 4 + o.phase) * 2, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawCat(cx, cy, face, squash, alpha) {
    const P = game.player;
    const menuIdle = game.state === 'menu';
    const bob = menuIdle ? Math.sin(game.time * 2.1) * 2.5 : 0;
    const sy = clamp(squash, 0.66, 1.3);
    const sx = 1 / Math.sqrt(sy);
    const rot = menuIdle ? Math.sin(game.time * 1.4) * 0.02 : clamp(P.vx / 1300, -0.22, 0.22) + (P.vy < -100 ? -0.06 : 0.03);
    const invulnFlicker = P.invuln > 0 && game.state === 'playing' ? 0.82 + 0.18 * Math.sin(game.time * 22) : 1;

    ctx.save();
    ctx.globalAlpha = alpha * invulnFlicker;
    ctx.translate(cx, cy + bob);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * invulnFlicker * 0.3;
    ctx.drawImage(glowWhite, -38, -36, 76, 76);
    ctx.globalAlpha = alpha * invulnFlicker;
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(rot);
    ctx.scale(face * sx, sy);

    // tail
    const wag = Math.sin(game.time * (menuIdle ? 2.4 : 5.2)) * 5;
    ctx.strokeStyle = '#f6ecdd';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-16, 8);
    ctx.bezierCurveTo(-30, 12, -36, 4 + wag, -31, -8 + wag);
    ctx.stroke();

    // ears
    ctx.fillStyle = '#f8efe1';
    ctx.beginPath();
    ctx.moveTo(-16, -11); ctx.lineTo(-20, -29); ctx.lineTo(-3, -16); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(4, -16); ctx.lineTo(14, -29); ctx.lineTo(20, -8); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffa9c0';
    ctx.beginPath();
    ctx.moveTo(-14, -13); ctx.lineTo(-16.5, -23); ctx.lineTo(-7, -16); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, -15); ctx.lineTo(13, -23); ctx.lineTo(16.5, -10); ctx.closePath();
    ctx.fill();

    // head / body
    const bodyG = ctx.createLinearGradient(0, -18, 0, 19);
    bodyG.addColorStop(0, '#fffaf0');
    bodyG.addColorStop(0.6, '#f4e6d3');
    bodyG.addColorStop(1, '#e4cbb4');
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 18.5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(36,22,50,0.55)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // belly tint
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(-2, 6, 13, 8, 0, 0, TAU);
    ctx.fill();

    // eyes
    const blinking = P.blink > 0;
    ctx.fillStyle = '#231a2e';
    if (blinking) {
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#231a2e';
      ctx.beginPath();
      ctx.moveTo(3, -4); ctx.lineTo(9, -4);
      ctx.moveTo(12, -4); ctx.lineTo(18, -4);
      ctx.stroke();
    } else {
      for (const ex of [6, 15]) {
        ctx.beginPath();
        ctx.ellipse(ex, -4, 2.9, 3.7, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(5, -5.4, 0.85, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(14, -5.4, 0.85, 0, TAU); ctx.fill();
    }

    // nose + mouth
    ctx.fillStyle = '#ff8fac';
    ctx.beginPath();
    ctx.moveTo(20, 2.2); ctx.lineTo(23, 4); ctx.lineTo(20, 5.2); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,35,50,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, 6);
    ctx.quadraticCurveTo(17.5, 8.6, 15.5, 6.6);
    ctx.stroke();

    // whiskers
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(20, 4); ctx.lineTo(31, 1.5);
    ctx.moveTo(20, 5.4); ctx.lineTo(31, 6.5);
    ctx.stroke();

    // collar gem
    ctx.strokeStyle = rgba(pal.accent, 0.95);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-1, 11, 15, 0.25, Math.PI - 0.25);
    ctx.stroke();
    ctx.fillStyle = rgba(pal.accent, 1);
    ctx.beginPath();
    ctx.arc(2, 16, 2.8, 0, TAU);
    ctx.fill();

    ctx.restore();

    if (P.invuln > 0 && game.state === 'playing') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 10);
      ctx.globalAlpha = 0.1 + pulse * 0.08;
      ctx.drawImage(glowWhite, cx - 40, cy + bob - 40, 80, 80);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rgba(pal.accent, 0.5 + pulse * 0.25);
      ctx.lineWidth = 2;
      if (!reducedMotion) ctx.setLineDash([7, 9]);
      ctx.lineDashOffset = -game.time * 40;
      ctx.beginPath();
      ctx.arc(cx, cy + bob, 34, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles() {
    ctx.save();
    for (const p of game.parts) {
      if (!isVisible(p.y, 260)) continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.type === 'puff') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = rgba(p.color, a * 0.22);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2.4 - a), 0, TAU);
        ctx.fill();
      } else if (p.type === 'debris' || p.type === 'confetti') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = rgba(p.color, a * (p.type === 'confetti' ? 1 : 0.8));
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        ctx.restore();
      } else if (p.type === 'mote') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(p.color, a * 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'lighter';
        const rr = p.size * (0.4 + a * 0.8);
        ctx.fillStyle = rgba(p.color, a * 0.22);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr * 2.1, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgba(p.color, a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawRings() {
    if (!game.rings.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of game.rings) {
      const a = clamp(r.life / r.maxLife, 0, 1);
      ctx.strokeStyle = rgba(r.color, a * 0.75);
      ctx.lineWidth = r.width * a;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTexts() {
    if (!game.texts.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of game.texts) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      ctx.font = `800 ${t.size}px "Trebuchet MS", sans-serif`;
      ctx.fillStyle = rgba(t.color, a);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  function render() {
    const dpr = view.dpr;
    const scale = view.scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();

    const ox = (view.offset * scale + game.shakeX) * dpr;
    const oy = game.shakeY * dpr;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox, oy);
    ctx.translate(0, -game.camY);
    drawWorld();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (game.flash > 0.002) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(game.flashColor, game.flash * 0.32);
      ctx.fillRect(0, 0, view.cssW, view.cssH);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- input
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
    if (k === 'arrowleft' || k === 'a') keys.left = true;
    if (k === 'arrowright' || k === 'd') keys.right = true;

    if ((k === ' ' || k === 'enter') && game.state === 'menu') {
      e.preventDefault();
      startGame();
      return;
    }
    if ((k === 'enter' || k === 'r') && (game.state === 'dead' || game.state === 'won')) {
      e.preventDefault();
      retry();
      return;
    }
    if (k === 'p' || k === 'escape') {
      if (game.state === 'playing' || game.state === 'paused') { e.preventDefault(); togglePause(); }
      return;
    }
    if (k === 'm') toggleMute();
  });

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') keys.left = false;
    if (k === 'arrowright' || k === 'd') keys.right = false;
  });

  window.addEventListener('blur', () => {
    keys.left = keys.right = false;
    steer.active = false;
    steer.targetX = null;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') togglePause();
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (game.state !== 'playing') return;
    sound.init();
    sound.resume();
    steer.active = true;
    steer.id = e.pointerId;
    steer.startX = e.clientX;
    steer.startPlayerX = game.player.x;
    steer.targetX = game.player.x;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!steer.active || e.pointerId !== steer.id || game.state !== 'playing') return;
    const worldDx = (e.clientX - steer.startX) / view.scale;
    steer.targetX = clamp(steer.startPlayerX + worldDx * 1.9, PLAYER.w / 2 + 6, view.worldW - PLAYER.w / 2 - 6);
    e.preventDefault();
  });

  function endPointer(e) {
    if (e.pointerId !== steer.id) return;
    steer.active = false;
    steer.targetX = null;
    steer.id = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', (e) => {
    if (steer.active && e.pointerId === steer.id) {
      steer.active = false;
      steer.targetX = null;
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function blurButton(el) { el.addEventListener('click', () => setTimeout(() => el.blur(), 0)); }

  dom.playBtn.addEventListener('click', () => { startGame(); dom.playBtn.blur(); });
  dom.resumeBtn.addEventListener('click', () => { togglePause(); dom.resumeBtn.blur(); });
  dom.retryBtn.addEventListener('click', () => { retry(); dom.retryBtn.blur(); });
  dom.pauseBtn.addEventListener('click', () => { togglePause(); dom.pauseBtn.blur(); });
  dom.muteBtn.addEventListener('click', () => { toggleMute(); dom.muteBtn.blur(); });
  blurButton(dom.playBtn);
  blurButton(dom.resumeBtn);
  blurButton(dom.retryBtn);

  // ---------------------------------------------------------------- boot
  window.addEventListener('resize', () => {
    const wasMenu = game.state === 'menu';
    resize();
    if (wasMenu) {
      resetRun();
      game.state = 'menu';
    }
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (game.state !== 'playing') resize();
    });
  }

  buildHearts();
  resize();
  resetRun();
  sound.updateMuteButton();
  dom.menuBest.textContent = game.best > 0 ? game.best.toLocaleString('en-US') + ' m' : '0 m';

  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0.016;
    dt = Math.min(dt, 0.05);
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
