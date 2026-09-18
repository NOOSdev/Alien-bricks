'use strict';
(function () {
  // ==================================================================
  // Константы и утилиты
  // ==================================================================
  const N = 8;                                   // поле 8×8
  const T = { EMPTY: -1, FIXED: 0, ALIEN: 1, BOMB: 2, SAW: 3, TRAP: 4, AV: 5, AH: 6, AU: 7, AR: 8, AD: 9, AL: 10 };
  // Направления: y растёт вверх (как в оригинале). angle — поворот спрайта на canvas (по умолчанию «смотрит» вверх)
  const DIR = {
    L: { dx: -1, dy: 0, name: 'L', angle: -Math.PI / 2 },
    R: { dx: 1, dy: 0, name: 'R', angle: Math.PI / 2 },
    U: { dx: 0, dy: 1, name: 'U', angle: 0 },
    D: { dx: 0, dy: -1, name: 'D', angle: Math.PI },
  };
  const DIRS8 = [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  const SLOW_DURATION = 20, SLOW_MULT = 3, SLOW_RAMP = 1.5;
  const MAX_BOOSTERS = 5;
  const MAX_LEVEL_NO_FAST_SWIPE = 4;             // на первых уровнях между свайпами пауза 0.6 с
  const isArrow = (t) => t >= T.AV && t <= T.AL;
  const inField = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function arrowPassable(type, dir) {
    switch (type) {
      case T.AV: return dir.dy !== 0;
      case T.AH: return dir.dx !== 0;
      case T.AU: return dir.name === 'U';
      case T.AR: return dir.name === 'R';
      case T.AD: return dir.name === 'D';
      case T.AL: return dir.name === 'L';
      default: return true;
    }
  }

  // Туториалы (из оригинала): уровень → шаги {x, y, dir} либо free
  const TUTORIALS = {
    0: [{ x: 4, y: 3, dir: 'D' }, { x: 4, y: 5, dir: 'R' }, { free: true }],
    1: [{ x: 4, y: 3, dir: 'D' }, { x: 3, y: 3, dir: 'R' }, { x: 3, y: 4, dir: 'D' }],
    3: [{ x: 2, y: 4, dir: 'L' }, { x: 5, y: 2, dir: 'R' }],
    15: [{ free: true, text: 'Оранжевые плиты с черепом — неподвижные. Их нельзя сдвинуть или уничтожить.' }],
  };
  const DIR_WORDS = { L: 'влево', R: 'вправо', U: 'вверх', D: 'вниз' };

  // Планеты: цвет сферы (материалы Sphere-*) и градиент фона (BgGradientChanger.gArray) из оригинала
  const PLANETS = [
    { color: '#009aff', grad: [['#000400', 0], ['#0a1d35', 0.2], ['#002714', 1]] },
    { color: '#ffd100', grad: [['#000400', 0], ['#362b00', 0.2], ['#103600', 1]] },
    { color: '#8b00ff', grad: [['#000400', 0], ['#340047', 0.2], ['#171422', 1]] },
    { color: '#ff0000', grad: [['#040000', 0], ['#3c0101', 0.2], ['#332b00', 0.591], ['#2b0015', 1]] },
    { color: '#ff00d5', grad: [['#000000', 0], ['#38001f', 0.2], ['#300025', 0.618], ['#24172d', 1]] },
    { color: '#ff8400', grad: [['#000400', 0], ['#452100', 0.2], ['#394500', 1]] },
    { color: '#47ff00', grad: [['#000400', 0], ['#0c2b00', 0.2], ['#003b3e', 0.568], ['#082600', 1]] },
    { color: '#00ff56', grad: [['#000400', 0], ['#075a00', 0.224], ['#000000', 0.8], ['#360000', 1]], octa: true },
  ];
  const FAIL_GRAD = [['#000000', 0], ['#6d0000', 0.038], ['#a54f00', 0.112], ['#671800', 0.253], ['#830000', 0.421], ['#9a4d00', 0.676], ['#580000', 1]];
  const BG_CYCLE = 30; // секунд на цикл градиента (PingPong)

  const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function evalGradient(keys, t) {
    t = clamp(t, 0, 1);
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i][1] && t <= keys[i + 1][1]) { a = keys[i]; b = keys[i + 1]; break; }
    const span = b[1] - a[1];
    const k = span > 0 ? (t - a[1]) / span : 0;
    const ca = hexToRgb(a[0]), cb = hexToRgb(b[0]);
    return `rgb(${Math.round(lerp(ca[0], cb[0], k))},${Math.round(lerp(ca[1], cb[1], k))},${Math.round(lerp(ca[2], cb[2], k))})`;
  }
  const pingpong = (t, len) => { const m = t % (2 * len); return m <= len ? m : 2 * len - m; };

  // ==================================================================
  // Звук
  // ==================================================================
  const SOUND_FILES = {
    appear1: 'new-123', appear2: 'new-4', away: 'score', stop: 'stop',
    throwL: 'throw-1', throwR: 'throw-2', throwU: 'throw-3', throwD: 'throw-4',
    bang: 'bang', laser: 'laser', click: 'click', start: 'announce', finish: 'menu',
    bangmini: 'bangmini', aliens: 'aliens', beep1: 'beep_1', beep2: 'beep_2', beep3: 'beep_3',
    monster1: 'monster_1', monster2: 'monster_2', win: 'progression', winShort: 'progression-short', popup: 'popup',
  };
  const sound = {
    enabled: true,
    music: null,
    ctx: null,          // Web Audio: декодированные буферы играют без задержки
    buffers: {},
    base: {},           // запасной вариант: заранее загруженные <audio> (нужен для file://)
    init() {
      for (const key in SOUND_FILES) {
        const a = new Audio('assets/sounds/' + SOUND_FILES[key] + '.ogg');
        a.preload = 'auto';
        try { a.load(); } catch (e) { /* ignore */ }
        this.base[key] = a;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || typeof fetch !== 'function' || location.protocol === 'file:') return;
      try { this.ctx = new AC(); } catch (e) { return; }
      for (const key in SOUND_FILES) {
        fetch('assets/sounds/' + SOUND_FILES[key] + '.ogg')
          .then((r) => r.arrayBuffer())
          .then((buf) => this.ctx.decodeAudioData(buf))
          .then((decoded) => { this.buffers[key] = decoded; })
          .catch(() => {});
      }
    },
    unlock() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    },
    play(key, vol) {
      if (!this.enabled || !SOUND_FILES[key]) return;
      const volume = vol === undefined ? 0.8 : vol;
      try {
        if (this.ctx && this.buffers[key] && this.ctx.state === 'running') {
          const src = this.ctx.createBufferSource();
          src.buffer = this.buffers[key];
          const gain = this.ctx.createGain();
          gain.gain.value = volume;
          src.connect(gain); gain.connect(this.ctx.destination);
          src.start(0);
          return;
        }
        const base = this.base[key];
        const a = base ? base.cloneNode() : new Audio('assets/sounds/' + SOUND_FILES[key] + '.ogg');
        a.volume = volume;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* игнорируем */ }
    },
    startMusic() {
      if (!this.enabled) return;
      if (!this.music) {
        this.music = new Audio('assets/sounds/Music Native.ogg');
        this.music.loop = true;
        this.music.volume = 0.35;
      }
      const p = this.music.play();
      if (p && p.catch) p.catch(() => {});
    },
    stopMusic() { if (this.music) this.music.pause(); },
    setEnabled(v) { this.enabled = v; if (!v) this.stopMusic(); },
  };

  // ==================================================================
  // Сохранения
  // ==================================================================
  const SAVE_KEY = 'alienBricksSave';
  const save = {
    data: null,
    load() {
      try { this.data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { this.data = null; }
      if (!this.data || !this.data.levels) this.data = { levels: {}, unlocked: 0, bombs: 3, slows: 3, sound: true };
      return this.data;
    },
    write() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* нет localStorage */ } },
    level(i) { return this.data.levels[i] || { stars: 0, best: 0, hi: 0 }; },
    complete(i, time, score, stars) {
      const cur = this.level(i);
      const first = !this.data.levels[i];
      const rec = { stars: Math.max(cur.stars, stars), best: cur.best ? Math.min(cur.best, time) : time, hi: Math.max(cur.hi, score) };
      this.data.levels[i] = rec;
      if (i + 1 > this.data.unlocked) this.data.unlocked = i + 1;
      if (first) { this.data.bombs = Math.min(MAX_BOOSTERS, this.data.bombs + 1); this.data.slows = Math.min(MAX_BOOSTERS, this.data.slows + 1); }
      this.write();
      return rec;
    },
    totalScore() { let s = 0; for (const k in this.data.levels) s += this.data.levels[k].hi; return s; },
    totalStars() { let s = 0; for (const k in this.data.levels) s += this.data.levels[k].stars; return s; },
    reset() { this.data = { levels: {}, unlocked: 0, bombs: 3, slows: 3, sound: this.data.sound }; this.write(); },
  };

  // ==================================================================
  // Спрайты (оригинальные, извлечённые из APK)
  // ==================================================================
  const SPR_DIR = 'assets/sprites/';
  const BLOCK_SPRITES = ['inv_bg', 'inv_01', 'inv_01_wink', 'inv_02', 'inv_02_smile_01', 'inv_02_smile_02', 'inv_02_smile_03',
    'inv_02_smile_04', 'inv_02_smile_05', 'bomb_bg', 'bomb_fg', 'saw_bg', 'saw_fg', 'fix_bg', 'fix_fg', 'fail_bg', 'fail_fg',
    'arrow_bg', 'arrow_single', 'arrow_double', 'booster_bomb_bg', 'booster_bomb_fg', 'outline'];
  const SPRITE_FILES = {
    trap: 'bg/tex_blk_trap.png', bgOver: 'bg/bg_over_uni.png', map: 'bg/map-gray-01.png', star: 'bg/star01.png',
    planetOn: 'levels/planet_on.png', planetOff: 'levels/planet_off.png', planetDis: 'levels/planet_dis.png',
    bossOn: 'levels/boss_on.png', bossOff: 'levels/boss_off.png', bossDis: 'levels/boss_dis.png',
    satOn: 'levels/satellite_1.png', satOff: 'levels/satellite_0.png', tutHand: 'ui/tut_hand.png',
    boosterOff: 'ui/but_booster_off.png', boosterOn: 'ui/but_booster_on.png', boosterAmount: 'ui/but_booster_amount.png',
    icoBomb: 'ui/buticon_explosive.png', icoSlow: 'ui/buticon_slowmo.png', hexBlue: 'ui/bg_hex_blue.png',
  };
  // Тонирование белых спрайтов интерфейса (в оригинале — цвет tk2dSprite).
  // Возвращает canvas, который вставляется в DOM как есть: экспорт (toDataURL) при запуске
  // с диска (file://) запрещён браузером, поэтому картинки не конвертируются в URL.
  const tintCache = {};
  function tintCanvas(name, color) {
    const key = name + color;
    if (tintCache[key]) return tintCache[key];
    const img = SPR[name];
    const c = document.createElement('canvas');
    if (!img || !img.width) { c.width = c.height = 1; return c; }
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, 0);
    tintCache[key] = c;
    return c;
  }
  // Вставляет (или заменяет) тонированный canvas в контейнер
  function setTinted(container, cls, name, color) {
    const src = tintCanvas(name, color);
    let cv = container.querySelector('canvas.' + cls);
    if (cv && cv.dataset.key === name + color) return;
    if (!cv) { cv = document.createElement('canvas'); cv.className = cls; container.appendChild(cv); }
    cv.width = src.width; cv.height = src.height;
    cv.getContext('2d').drawImage(src, 0, 0);
    cv.dataset.key = name + color;
  }
  for (const n of BLOCK_SPRITES) SPRITE_FILES[n] = 'blocks/blk_' + n + '.png';
  // Квады спрайтов в единицах поля (клетка = 72): большинство 72×72 по центру
  const BLOCK_META = { inv_02: { qx: -28, qy: -27, qw: 56, qh: 54 }, outline: { qx: -44, qy: -44, qw: 88, qh: 88 } };
  const DEFAULT_META = { qx: -36, qy: -36, qw: 72, qh: 72 };
  const SPR = {};
  function loadSprites() {
    return Promise.all(Object.keys(SPRITE_FILES).map((k) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res(); im.onerror = () => res();
      im.src = SPR_DIR + SPRITE_FILES[k];
      SPR[k] = im;
    }))).then(() => {
      // Ловушка: белая текстура, в оригинале — аддитивные частицы с оттенком #73baff
      const c = document.createElement('canvas');
      c.width = SPR.trap.width || 128; c.height = SPR.trap.height || 128;
      const g = c.getContext('2d');
      g.drawImage(SPR.trap, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#73baff';
      g.fillRect(0, 0, c.width, c.height);
      SPR.trapTinted = c;
    });
  }

  // Планета для меню: сфера с картой-текстурой, окрашенной в цвет материала (или октаэдр для последней планеты)
  function makePlanet(color, size, octa) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    g.save();
    if (octa) {
      g.beginPath(); g.moveTo(r, 2); g.lineTo(size - 2, r); g.lineTo(r, size - 2); g.lineTo(2, r); g.closePath();
    } else {
      g.beginPath(); g.arc(r, r, r - 1, 0, Math.PI * 2);
    }
    g.clip();
    g.fillStyle = color; g.fillRect(0, 0, size, size);
    if (SPR.map && SPR.map.width) {
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = 0.9;
      g.drawImage(SPR.map, 0, 0, SPR.map.width / 2, SPR.map.height, -size * 0.2, -size * 0.1, size * 1.4, size * 1.2);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    const sh = g.createRadialGradient(r * 0.7, r * 0.7, r * 0.1, r, r, r);
    sh.addColorStop(0, 'rgba(255,255,255,0.45)'); sh.addColorStop(0.55, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = sh; g.fillRect(0, 0, size, size);
    if (octa) {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.moveTo(r, 2); g.lineTo(size - 2, r); g.lineTo(2, r); g.closePath(); g.fill();
    }
    g.restore();
    return c;
  }

  // ==================================================================
  // Движок
  // ==================================================================
  class Game {
    constructor(index) {
      this.index = index;
      this.level = LEVELS[index];
      this.planet = clamp(this.level.planet - 1, 0, PLANETS.length - 1);
      this.boss = this.level.bossType > 0;
      this.speed = this.level.speed;         // секунд на пролёт всего поля
      this.slowFactor = 1;                   // >1 — замедление
      this.slow = null;                      // { t }
      this.grid = []; this.extras = [];
      for (let x = 0; x < N; x++) { this.grid.push(new Array(N).fill(null)); this.extras.push(new Array(N).fill(null)); }
      this.movers = [];
      this.fx = [];
      this.nextId = 1;
      this.time = 0;
      this.status = 'ready';                 // ready | playing | won | lost
      this.loseReason = '';
      this.genEnabled = false;
      this.genTimer = 0;
      this.failCheck = 0;
      this.appearCount = 0;
      this.freeCache = [];
      this.lastSwipe = -10;
      this.events = [];                      // события для UI/звука
      this.boosterMode = null;               // 'bomb' | null
      this.boosterLock = 0;                  // сек. до разблокировки кнопок
      this.bossBeeps = {};
      this.crashPos = null;
      this.endTime = 0;                      // время окончания (для анимации фона)
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          const v = this.level.grid[x][y];
          if (v === T.FIXED || v === T.ALIEN || v === T.BOMB || v === T.SAW) {
            this.grid[x][y] = { id: this.nextId++, type: v, x, y, appear: rnd(0.2, 1.2) };
          } else if (v === T.TRAP || isArrow(v)) {
            this.extras[x][y] = v;
          }
        }
      }
      const tut = TUTORIALS[index];
      this.tutorial = tut ? { steps: tut, i: 0 } : null;
      this.updateBounds();
    }

    // ---------- вспомогательное ----------
    emit(type, data) { this.events.push(Object.assign({ type }, data || {})); }
    counts() {
      let stat = 0, all = 0;
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
        const b = this.grid[x][y];
        if (b) { all++; if (b.type !== T.FIXED) stat++; }
      }
      return { stat, all };
    }
    axisToXY(m, c) { return m.axis === 'x' ? [c, m.lane] : [m.lane, c]; }
    moverXY(m) { return this.axisToXY(m, m.pos); }

    // Свободные позиции на границе (внутри ограничивающего прямоугольника блоков и стрелок)
    updateBounds() {
      let xl = 100, xr = -100, yb = 100, yt = -100, any = false;
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
        if (this.grid[x][y] || isArrow(this.extras[x][y])) {
          any = true;
          if (x < xl) xl = x; if (x > xr) xr = x; if (y < yb) yb = y; if (y > yt) yt = y;
        }
      }
      if (!any || this.counts().stat === 0) return; // как в оригинале: список остаётся прежним
      const free = [];
      const isFree = (x, y) => !this.grid[x][y] && !isArrow(this.extras[x][y]);
      for (let x = xl; x <= xr; x++) {
        if (isFree(x, 0)) free.push({ pos: x, dir: DIR.U });
        if (isFree(x, N - 1)) free.push({ pos: x, dir: DIR.D });
      }
      for (let y = yb; y <= yt; y++) {
        if (isFree(0, y)) free.push({ pos: y, dir: DIR.R });
        if (isFree(N - 1, y)) free.push({ pos: y, dir: DIR.L });
      }
      this.freeCache = free;
    }

    start() {
      this.status = 'playing';
      if (!this.tutorial) this.genEnabled = this.level.freq > 0;
      this.lockBoosters(4);                  // в оригинале кнопки бустеров «прогреваются» 4 с после старта
      this.emit('start');
    }
    lockBoosters(sec) { this.boosterLock = sec; this.boosterLockTotal = sec; }

    // ---------- туториал ----------
    tutorialStep() {
      if (!this.tutorial) return null;
      const st = this.tutorial.steps[this.tutorial.i];
      return st || null;
    }
    tutorialAllows(x, y, dir) {
      const st = this.tutorialStep();
      if (!st || st.free) return true;
      return st.x === x && st.y === y && st.dir === dir.name;
    }
    tutorialAdvance() {
      if (!this.tutorial) return;
      this.tutorial.i++;
      if (this.tutorial.i >= this.tutorial.steps.length) {
        this.tutorial = null;
        this.genEnabled = this.level.freq > 0;
      }
    }

    // ---------- ввод ----------
    canSwipeNow() {
      if (this.status !== 'playing' || this.boosterMode) return false;
      if (this.index <= MAX_LEVEL_NO_FAST_SWIPE && this.time - this.lastSwipe < 0.6) return false;
      return true;
    }

    swipeAllowed(x, y, dir) {
      const b = this.grid[x][y];
      if (!b || b.type === T.FIXED) return false;
      const nx = x + dir.dx, ny = y + dir.dy;
      if (inField(nx, ny)) {
        if (this.grid[nx][ny]) return false;
        const ex = this.extras[nx][ny];
        if (isArrow(ex)) {
          if (!arrowPassable(ex, dir)) return false;
          const nx2 = nx + dir.dx, ny2 = ny + dir.dy;
          if (inField(nx2, ny2) && this.grid[nx2][ny2]) return false;
        }
      }
      return true;
    }

    // Свайп блока в клетке (x, y)
    swipe(x, y, dir) {
      if (!this.canSwipeNow()) return false;
      if (!this.swipeAllowed(x, y, dir)) return false;
      if (!this.tutorialAllows(x, y, dir)) return false;
      const b = this.grid[x][y];
      this.grid[x][y] = null;
      const m = {
        id: b.id, type: b.type, dir, state: 'dynamic',
        axis: dir.dx ? 'x' : 'y', lane: dir.dx ? y : x, pos: dir.dx ? x : y,
        needSound: true, spin: 0,
      };
      this.movers.push(m);
      this.lastSwipe = this.time;
      this.emit('sound', { key: 'throw' + dir.name });
      this.updateBounds();
      this.tutorialAdvance();
      return true;
    }

    // Свайп рядом с блоком (палец не попал по блоку): ищем ближайший подходящий
    swipeNear(px, py, dir) {
      if (!this.canSwipeNow()) return false;
      const cx = Math.floor(px), cy = Math.floor(py);
      const cands = [];
      const consider = (x, y, diag) => {
        if (!inField(x, y)) return;
        const b = this.grid[x][y];
        if (!b || b.type === T.FIXED) return;
        const d = Math.hypot(px - (x + 0.5), py - (y + 0.5));
        const tol = diag ? 2.6 * Math.SQRT1_2 : 2;
        if (d <= tol) cands.push({ x, y, d });
      };
      consider(cx, cy, false);
      for (const [ox, oy] of DIRS8) consider(cx + ox, cy + oy, ox !== 0 && oy !== 0);
      cands.sort((a, b) => a.d - b.d);
      for (const c of cands) if (this.swipe(c.x, c.y, dir)) return true;
      return false;
    }

    // ---------- бустеры ----------
    useBomb(x, y) {
      if (!inField(x, y) || this.status !== 'playing') return false;
      this.fx.push({ kind: 'boosterBomb', x, y, t: 0, dur: 0.2 });
      this.boosterMode = null;
      this.lockBoosters(0.6);
      this.emit('boosterUsed', { kind: 'bomb' });
      return true;
    }
    useSlow() {
      if (this.status !== 'playing' || this.slow) return false;
      this.slow = { t: 0 };
      this.lockBoosters(SLOW_DURATION - 2);
      this.emit('boosterUsed', { kind: 'slow' });
      return true;
    }

    // ---------- симуляция ----------
    scan(m) {
      const d = m.dir.dx || m.dir.dy;
      const exitCell = d > 0 ? N : -1;
      if (m.type === T.SAW && m.state !== 'new') return { target: exitCell, kind: 'exit' };
      let c = d > 0 ? Math.floor(m.pos + 1e-6) : Math.ceil(m.pos - 1e-6);
      let stop = null;
      for (let guard = 0; guard < N + 4; guard++) {
        c += d;
        if (c === exitCell) return { target: exitCell, kind: 'exit' };
        if (c < 0 || c >= N) continue;
        const [bx, by] = this.axisToXY(m, c);
        if (this.grid[bx][by]) { stop = c - d; break; }
        const ex = this.extras[bx][by];
        if (ex === T.TRAP) { stop = c; break; }
        if (isArrow(ex) && !arrowPassable(ex, m.dir)) { stop = c - d; break; }
      }
      if (stop === null) return { target: exitCell, kind: 'exit' };
      // на стрелке останавливаться нельзя — откатываемся
      for (let guard = 0; guard < N; guard++) {
        if (stop < 0 || stop >= N) break;
        const [bx, by] = this.axisToXY(m, stop);
        if (!isArrow(this.extras[bx][by])) break;
        stop -= d;
      }
      if (stop < 0 || stop >= N) return { target: stop, kind: 'blocked' };
      return { target: stop, kind: 'stop' };
    }

    removeMover(m) {
      const i = this.movers.indexOf(m);
      if (i >= 0) this.movers.splice(i, 1);
    }

    destroyBlock(b, cause) {
      if (!b || b.type === T.FIXED) return false;
      if (this.grid[b.x][b.y] === b) this.grid[b.x][b.y] = null;
      this.fx.push({ kind: 'die', block: b, cause, t: 0, dur: 0.4 });
      this.updateBounds();
      return true;
    }

    explode(x, y, fromMover) {
      if (fromMover) this.removeMover(fromMover);
      this.emit('sound', { key: 'bang' });
      this.fx.push({ kind: 'explosion', x, y, t: 0, dur: 0.6 });
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const bx = x + ox, by = y + oy;
        if (!inField(bx, by)) continue;
        const b = this.grid[bx][by];
        if (b) this.destroyBlock(b, 'bomb');
      }
    }

    crash(m) {
      const [x, y] = this.axisToXY(m, Math.round(m.pos));
      this.crashPos = { x, y, type: m.type, dir: m.dir };
      this.removeMover(m);
      this.fx.push({ kind: 'crash', x, y, t: 0, dur: 1.0 });
      this.emit('sound', { key: 'bangmini' });
      this.lose('crash');
    }

    lose(reason) {
      if (this.status !== 'playing') return;
      this.status = 'lost';
      this.loseReason = reason;
      this.genEnabled = false;
      this.endTime = this.time;
      for (const m of this.movers) m.frozen = true;
      this.emit('lost', { reason });
    }

    win() {
      if (this.status !== 'playing') return;
      this.status = 'won';
      this.genEnabled = false;
      this.endTime = this.time;
      this.emit('won');
    }

    arrive(m, kind) {
      const d = m.dir.dx || m.dir.dy;
      if (kind === 'exit') {
        if (m.state === 'dynamic') {
          m.state = 'free';
          m.pos = d > 0 ? -2 : N + 1;
        } else {
          this.removeMover(m);
          this.emit('sound', { key: 'away' });
          const [x, y] = this.axisToXY(m, m.pos);
          this.fx.push({ kind: 'away', x, y, type: m.type, t: 0, dur: 0.25 });
        }
        return;
      }
      const [x, y] = this.axisToXY(m, Math.round(m.pos));
      if (kind === 'blocked') {
        if (m.state === 'new') {
          this.removeMover(m);
          this.emit('sound', { key: 'away' });
          return;
        }
        if (m.type === T.BOMB) { this.explode(x, y, m); return; }
        this.crash(m);
        return;
      }
      // остановка внутри поля
      if (m.type === T.BOMB && m.state !== 'new') { this.explode(x, y, m); return; }
      this.removeMover(m);
      if (this.grid[x][y]) { // наложение (не должно случаться) — блок теряется
        this.emit('sound', { key: 'away' });
        return;
      }
      this.grid[x][y] = { id: m.id, type: m.type, x, y, arrival: 0.25 };
      this.emit('sound', { key: 'stop', vol: 0.5 });
      this.updateBounds();
    }

    sawCut(m, from, to) {
      const d = m.dir.dx || m.dir.dy;
      // клетки, центр которых пройден на этом шаге: (from, to] по направлению движения
      let c0, c1;
      if (d > 0) { c0 = Math.floor(from + 1e-6) + 1; c1 = Math.floor(to + 1e-6); }
      else { c0 = Math.ceil(to - 1e-6); c1 = Math.ceil(from - 1e-6) - 1; }
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || c >= N) continue;
        const [bx, by] = this.axisToXY(m, c);
        const blk = this.grid[bx][by];
        if (blk && blk.type !== T.FIXED) {
          this.destroyBlock(blk, 'saw');
          this.fx.push({ kind: 'sparks', x: bx, y: by, t: 0, dur: 0.4 });
          if (m.needSound) { this.emit('sound', { key: 'laser' }); m.needSound = false; }
        }
      }
    }

    updateMover(m, dt) {
      if (m.frozen) return;
      const sc = this.scan(m);
      const v = N / (this.speed * this.slowFactor);
      const sign = Math.sign(sc.target - m.pos);
      let np = m.pos + sign * v * dt;
      let arrived = sign === 0;
      if ((sign > 0 && np >= sc.target) || (sign < 0 && np <= sc.target)) { np = sc.target; arrived = true; }
      const old = m.pos;
      m.pos = np;
      if (m.type === T.SAW) {
        m.spin += dt * 25;
        if (m.state !== 'new') this.sawCut(m, old, np);
      }
      if (arrived) this.arrive(m, sc.kind);
    }

    // ---------- генерация новых блоков ----------
    chanceType() {
      const { all } = this.counts();
      const p = this.level.chance0 + ((this.level.chance100 - this.level.chance0) * all) / 64;
      if (Math.random() * 1000 <= p * 10) return Math.random() < 0.5 ? T.BOMB : T.SAW;
      return T.ALIEN;
    }
    spawn(type, fp) {
      const d = fp.dir.dx || fp.dir.dy;
      const m = {
        id: this.nextId++, type, dir: fp.dir, state: 'new',
        axis: fp.dir.dx ? 'x' : 'y', lane: fp.pos, pos: d > 0 ? -2 : N + 1,
        needSound: true, spin: 0,
      };
      this.movers.push(m);
      this.appearCount++;
      this.emit('sound', { key: this.appearCount % 4 === 0 ? 'appear2' : 'appear1', vol: 0.6 });
    }
    generate() {
      const free = this.freeCache;
      if (!free.length) return;
      const first = free[Math.floor(Math.random() * free.length)];
      if (this.boss && this.level.bossType === 1) {
        // двойная генерация: с противоположной стороны той же линии или из другого места
        const rev = { L: DIR.R, R: DIR.L, U: DIR.D, D: DIR.U }[first.dir.name];
        const oppFree = (() => {
          const x = rev.dx ? (rev.dx > 0 ? 0 : N - 1) : first.pos;
          const y = rev.dy ? (rev.dy > 0 ? 0 : N - 1) : first.pos;
          return !this.grid[x][y] && !isArrow(this.extras[x][y]);
        })();
        let second = null;
        if (oppFree) second = { pos: first.pos, dir: rev };
        else {
          const others = free.filter((f) => !(f.dir === first.dir && f.pos === first.pos));
          if (others.length) second = others[Math.floor(Math.random() * others.length)];
        }
        this.spawn(this.chanceType(), first);
        if (second) this.spawn(this.chanceType(), second);
      } else {
        this.spawn(this.chanceType(), first);
      }
    }

    // ---------- главный цикл ----------
    update(dt) {
      if (this.status !== 'playing') {
        this.updateFx(dt);
        for (const m of this.movers) if (m.type === T.SAW) m.spin += dt * 25;
        return;
      }
      // замедление
      if (this.slow) {
        this.slow.t += dt;
        const t = this.slow.t;
        if (t < SLOW_RAMP) this.slowFactor = lerp(1, SLOW_MULT, t / SLOW_RAMP);
        else if (t < SLOW_DURATION - SLOW_RAMP) this.slowFactor = SLOW_MULT;
        else if (t < SLOW_DURATION) this.slowFactor = lerp(SLOW_MULT, 1, (t - (SLOW_DURATION - SLOW_RAMP)) / SLOW_RAMP);
        else { this.slowFactor = 1; this.slow = null; }
      }
      this.time += dt / this.slowFactor;
      if (this.boosterLock > 0) this.boosterLock -= dt;

      // босс: обратный отсчёт
      if (this.boss) {
        const left = this.level.bossTime - this.time;
        for (const mark of [30, 15, 5]) {
          if (left <= mark && !this.bossBeeps[mark]) { this.bossBeeps[mark] = true; this.emit('bossCount', { value: mark }); }
        }
        if (left <= 0) { this.time = this.level.bossTime; this.lose('time'); return; }
      }

      // движение
      for (const m of this.movers.slice()) this.updateMover(m, dt);

      // генерация
      if (this.genEnabled && this.level.freq > 0) {
        this.genTimer += dt / this.slowFactor;
        if (this.genTimer >= this.level.freq) { this.genTimer = 0; this.generate(); }
        this.failCheck += dt;
        if (this.failCheck >= 0.5) {
          this.failCheck = 0;
          if (!this.freeCache.length) { this.lose('full'); return; }
        }
      }

      this.updateFx(dt);

      // победа
      if (this.counts().stat === 0 && this.movers.length === 0 && !this.fx.some((f) => f.kind === 'die' || f.kind === 'boosterBomb')) {
        this.win();
      }
    }

    updateFx(dt) {
      for (const f of this.fx.slice()) {
        f.t += dt;
        if (f.kind === 'boosterBomb' && f.t >= f.dur && !f.done) {
          f.done = true;
          this.explode(f.x, f.y, null);
          this.fx.splice(this.fx.indexOf(f), 1);
          continue;
        }
        if (f.t >= f.dur) this.fx.splice(this.fx.indexOf(f), 1);
      }
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
        const b = this.grid[x][y];
        if (b && b.arrival > 0) b.arrival -= dt;
      }
    }

    score() {
      const L = this.level, time = this.time;
      const ratio = time / L.maxTime;
      const val = (1 - (1 - L.minScore / L.maxScore) * ratio * (1 + L.curveK) / (2 * L.curveK * ratio - L.curveK + 1)) * L.maxScore;
      const score = Math.max(0, Math.round(val));
      const stars = time < L.kStar3 + 1 ? 3 : time < L.kStar2 + 1 ? 2 : 1;
      return { score, stars };
    }
  }

  // ==================================================================
  // Отрисовка
  // ==================================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const view = { size: 0, cs: 0, dpr: 1, stars: [] };

  function resizeCanvas() {
    const wrap = document.getElementById('canvas-wrap');
    const size = Math.max(200, Math.min(wrap.clientWidth, wrap.clientHeight) - 8);
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    view.size = size;
    view.cs = size / (N + 2);
    canvas.width = Math.round(size * view.dpr);
    canvas.height = Math.round(size * view.dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    if (!view.stars.length) {
      for (let i = 0; i < 70; i++) view.stars.push({ x: Math.random(), y: Math.random(), r: rnd(0.6, 2.2), p: Math.random() * 6 });
    }
  }
  // Клетка → экранные координаты центра
  const cellX = (x) => (x + 1.5) * view.cs;
  const cellY = (y) => (N - y + 0.5) * view.cs;

  // Спрайт блока: квад в единицах поля (клетка = 72) масштабируется к размеру клетки
  function drawSpr(name, cx, cy, angle, alpha, scale) {
    const img = SPR[name];
    if (!img || !img.width) return;
    const m = BLOCK_META[name] || DEFAULT_META;
    const k = (view.cs / 72) * (scale || 1);
    ctx.save();
    ctx.translate(cx, cy);
    if (angle) ctx.rotate(angle);
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(img, m.qx * k, -(m.qy + m.qh) * k, m.qw * k, m.qh * k);
    ctx.restore();
  }
  // Пара спрайтов «подложка + рисунок» по типу блока
  function blockLayers(type, game) {
    switch (type) {
      case T.ALIEN: return { bg: 'inv_bg', fg: game.boss ? 'inv_02' : 'inv_01' };
      case T.BOMB: return { bg: 'bomb_bg', fg: 'bomb_fg' };
      case T.SAW: return { bg: 'saw_bg', fg: 'saw_fg' };
      case T.FIXED: return { bg: 'fix_bg', fg: 'fix_fg' };
      default: return { bg: 'fix_bg', fg: 'fix_fg' };
    }
  }
  // Мимика: пришелец подмигивает, босс улыбается (случайно раз в 5–15 с, как в оригинале)
  function faceSprite(b, layers, game, now) {
    if (b.type !== T.ALIEN) return layers.fg;
    if (!b.nextFace) b.nextFace = now + rnd(5000, 15000);
    if (now >= b.nextFace) { b.faceStart = now; b.nextFace = now + rnd(5000, 15000) + 600; }
    if (b.faceStart !== undefined) {
      const dt = now - b.faceStart;
      if (game.boss) {
        if (dt < 500) return 'inv_02_smile_0' + (Math.floor(dt / 100) + 1);
      } else if (dt < 120) return 'inv_01_wink';
    }
    return layers.fg;
  }
  // Блок целиком: подложка (всегда вертикально) + рисунок (с поворотом по направлению полёта)
  function drawBlock(type, cx, cy, o, game, now, b) {
    const L = blockLayers(type, game);
    drawSpr(L.bg, cx, cy, 0, o.alpha, o.scale);
    drawSpr(b ? faceSprite(b, L, game, now) : L.fg, cx, cy, o.angle || 0, o.alpha, o.scale);
  }
  function drawExtra(ex, cx, cy, now) {
    if (ex === T.TRAP) {
      // ловушка: аддитивные пульсирующие кольца
      const img = SPR.trapTinted;
      if (!img) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const s0 = view.cs * 0.96;
      ctx.globalAlpha = 0.35;
      ctx.drawImage(img, cx - s0 / 2, cy - s0 / 2, s0, s0);
      for (let i = 0; i < 2; i++) {
        const p = ((now / 1400) + i * 0.5) % 1;
        const s = s0 * (1.05 - 0.45 * p);
        ctx.globalAlpha = 0.55 * (1 - p);
        ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s);
      }
      ctx.restore();
      return;
    }
    if (!isArrow(ex)) return;
    drawSpr('arrow_bg', cx, cy);
    const dbl = ex === T.AV || ex === T.AH;
    const angle = ex === T.AH ? Math.PI / 2 : ex === T.AR ? Math.PI / 2 : ex === T.AD ? Math.PI : ex === T.AL ? -Math.PI / 2 : 0;
    drawSpr(dbl ? 'arrow_double' : 'arrow_single', cx, cy, angle);
  }

  function render(game, now) {
    const cs = view.cs, size = view.size;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const planet = PLANETS[game ? game.planet : 0];
    // Фон: сверху — цвет планеты (медленный PingPong по градиенту), снизу — чёрный
    let top;
    if (game && game.status === 'lost') top = evalGradient(FAIL_GRAD, Math.min(1, (game.time - game.endTime + 0.001) / 1.2 * 0.3 + 0.05));
    else if (game && game.status === 'won') top = '#000000';
    else top = evalGradient(planet.grad, pingpong(game ? game.time : now / 1000, BG_CYCLE) / BG_CYCLE);
    const bg = ctx.createLinearGradient(0, 0, 0, size);
    bg.addColorStop(0, top); bg.addColorStop(1, '#000000');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    // звёзды
    ctx.fillStyle = '#cfe9ff';
    for (const s of view.stars) {
      const tw = 0.5 + 0.5 * Math.sin(now * 0.002 + s.p);
      ctx.globalAlpha = 0.25 + 0.6 * tw;
      ctx.beginPath(); ctx.arc(s.x * size, s.y * size, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // декоративный оверлей из оригинала (гексагон и линии в левом нижнем углу)
    if (SPR.bgOver && SPR.bgOver.width) {
      const u = size / 584;
      ctx.save(); ctx.globalAlpha = 0.45; ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(SPR.bgOver, size / 2 - 512 * u, size / 2, 512 * u, 360 * u);
      ctx.restore();
    }
    if (!game) return;

    // едва заметная сетка
    ctx.strokeStyle = 'rgba(120,200,255,0.07)'; ctx.lineWidth = 1;
    for (let i = 0; i <= N; i++) {
      ctx.beginPath(); ctx.moveTo(cs + i * cs, cs); ctx.lineTo(cs + i * cs, cs + N * cs); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cs, cs + i * cs); ctx.lineTo(cs + N * cs, cs + i * cs); ctx.stroke();
    }

    // замедление — синяя вуаль
    if (game.slowFactor > 1.01) {
      ctx.fillStyle = `rgba(90,160,255,${0.12 * (game.slowFactor - 1) / (SLOW_MULT - 1)})`;
      ctx.fillRect(0, 0, size, size);
    }

    // дополнительные элементы
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
      const ex = game.extras[x][y];
      if (ex) drawExtra(ex, cellX(x), cellY(y), now);
    }

    // подсказка туториала: рамка и рука
    const st = game.tutorialStep();
    if (st && !st.free && game.status === 'playing') {
      const px = cellX(st.x), py = cellY(st.y);
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
      drawSpr('outline', px, py, 0, 0.4 + 0.6 * pulse);
      const d = DIR[st.dir];
      const ph = (now / 1200) % 1;
      const off = (0.1 + 0.9 * ph) * cs;
      if (SPR.tutHand && SPR.tutHand.width) {
        const hw = cs * 1.1, hh = hw * SPR.tutHand.height / SPR.tutHand.width;
        ctx.save(); ctx.globalAlpha = 1 - Math.max(0, ph - 0.7) / 0.3;
        ctx.drawImage(SPR.tutHand, px + d.dx * off - hw * 0.15, py - d.dy * off - hh * 0.1, hw, hh);
        ctx.restore();
      }
    }

    // статичные блоки
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
      const b = game.grid[x][y];
      if (!b) continue;
      let scale = 1;
      if (b.appear > 0) { b.appear -= 1 / 60; scale *= Math.min(1, 1.6 - b.appear); }
      if (b.arrival > 0) scale *= 1 + 0.12 * Math.sin((0.25 - b.arrival) / 0.25 * Math.PI);
      drawBlock(b.type, cellX(x), cellY(y), { scale }, game, now, b);
    }

    // летящие блоки
    for (const m of game.movers) {
      const [x, y] = game.moverXY(m);
      const sx = cellX(x), sy = cellY(y);
      const outside = x < -0.5 || y < -0.5 || x > N - 0.5 || y > N - 0.5;
      const angle = m.type === T.SAW ? m.spin : m.type === T.BOMB ? 0 : m.dir.angle;
      drawBlock(m.type, sx, sy, { angle, alpha: outside ? 0.75 : 1 }, game, now, null);
    }

    // эффекты
    for (const f of game.fx) {
      const p = clamp(f.t / f.dur, 0, 1);
      if (f.kind === 'die') {
        const b = f.block;
        if (f.cause === 'saw') {
          // разрезанный блок: половинки разъезжаются
          const L = blockLayers(b.type, game);
          const sx = cellX(b.x), sy = cellY(b.y);
          for (const name of [L.bg, L.fg]) {
            const img = SPR[name]; if (!img || !img.width) continue;
            const half = cs * 0.5;
            ctx.save(); ctx.globalAlpha = 1 - p;
            ctx.drawImage(img, 0, 0, img.width / 2, img.height, sx - half - p * cs * 0.4, sy - half + p * cs * 0.3, half, half * 2);
            ctx.drawImage(img, img.width / 2, 0, img.width / 2, img.height, sx + p * cs * 0.4, sy - half - p * cs * 0.3, half, half * 2);
            ctx.restore();
          }
        } else {
          drawBlock(b.type, cellX(b.x), cellY(b.y), { scale: 1 - p * 0.6, angle: p * 2, alpha: 1 - p }, game, now, null);
        }
      } else if (f.kind === 'explosion') {
        const sx = cellX(f.x), sy = cellY(f.y);
        const r = cs * (0.4 + 1.4 * p);
        const grad = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r);
        grad.addColorStop(0, `rgba(255,250,200,${0.9 * (1 - p)})`);
        grad.addColorStop(0.5, `rgba(255,140,40,${0.7 * (1 - p)})`);
        grad.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,220,120,${1 - p})`; ctx.lineWidth = 4 * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(sx, sy, cs * 1.5 * p, 0, Math.PI * 2); ctx.stroke();
        if (!f.parts) { f.parts = []; for (let i = 0; i < 14; i++) f.parts.push({ a: Math.random() * Math.PI * 2, v: rnd(0.8, 2.2), r: rnd(2, 5) }); }
        ctx.fillStyle = `rgba(255,200,80,${1 - p})`;
        for (const q of f.parts) {
          ctx.beginPath(); ctx.arc(sx + Math.cos(q.a) * q.v * p * cs, sy + Math.sin(q.a) * q.v * p * cs, q.r * (1 - p * 0.5), 0, Math.PI * 2); ctx.fill();
        }
      } else if (f.kind === 'sparks') {
        const sx = cellX(f.x), sy = cellY(f.y);
        if (!f.parts) { f.parts = []; for (let i = 0; i < 10; i++) f.parts.push({ a: Math.random() * Math.PI * 2, v: rnd(0.5, 1.5) }); }
        ctx.strokeStyle = `rgba(150,220,255,${1 - p})`; ctx.lineWidth = 2;
        for (const q of f.parts) {
          const d0 = q.v * p * cs, d1 = d0 + cs * 0.12;
          ctx.beginPath(); ctx.moveTo(sx + Math.cos(q.a) * d0, sy + Math.sin(q.a) * d0); ctx.lineTo(sx + Math.cos(q.a) * d1, sy + Math.sin(q.a) * d1); ctx.stroke();
        }
      } else if (f.kind === 'away') {
        drawBlock(f.type, cellX(f.x), cellY(f.y), { scale: 1 - p, alpha: 0.6 * (1 - p) }, game, now, null);
      } else if (f.kind === 'boosterBomb') {
        drawSpr('booster_bomb_bg', cellX(f.x), cellY(f.y), 0, 1, 0.9 + 0.2 * p);
        drawSpr('booster_bomb_fg', cellX(f.x), cellY(f.y), 0, 1, 0.9 + 0.2 * p);
      } else if (f.kind === 'crash') {
        ctx.fillStyle = `rgba(255,40,60,${0.45 * (1 - p)})`;
        ctx.fillRect(0, 0, size, size);
      }
    }
    // разбившийся блок — спрайт «fail» из оригинала
    if (game.crashPos) {
      const c = game.crashPos;
      drawSpr('fail_bg', cellX(c.x), cellY(c.y));
      drawSpr('fail_fg', cellX(c.x), cellY(c.y), 0, 1, 1 + 0.06 * Math.sin(now * 0.01));
    }
    // затемнение вне поля
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, size, cs); ctx.fillRect(0, size - cs, size, cs);
    ctx.fillRect(0, cs, cs, size - 2 * cs); ctx.fillRect(size - cs, cs, cs, size - 2 * cs);
  }

  // ==================================================================
  // UI
  // ==================================================================
  const $ = (id) => document.getElementById(id);
  const ui = {
    game: null,
    levelIndex: 0,
    planetSel: 0,
    lastFrame: 0,
    paused: false,
    pointer: null,
    raf: 0,
    ready: false,
  };

  const GROUPS = 'ABCDEFGH'.split('').map((letter) => {
    const idx = [];
    LEVELS.forEach((l, i) => { if (l.name[0] === letter) idx.push(i); });
    return { letter, idx, planet: clamp(LEVELS[idx[0]].planet - 1, 0, 7) };
  });

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  }
  function satsHtml(n) {
    let s = '';
    for (let i = 0; i < 3; i++) s += `<img src="${SPR_DIR}levels/${i < n ? 'satellite_1' : 'satellite_0'}.png" alt="${i < n ? '★' : '☆'}">`;
    return s;
  }
  function fmtTime(t) {
    const s = Math.floor(t), c = Math.floor((t % 1) * 100);
    return (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  }
  function sprBtn(cls, off, on, extra) {
    return `<span class="sprbtn ${cls}" style="--off:url(${SPR_DIR}ui/${off}.png);--on:url(${SPR_DIR}ui/${on}.png)">${extra || ''}</span>`;
  }

  // ---------- меню ----------
  const planetCache = {};
  function renderMenu() {
    const d = save.data;
    $('menu-score').textContent = 'Очки: ' + save.totalScore();
    $('menu-stars').innerHTML = `<img src="${SPR_DIR}levels/satellite_1.png" alt="★" class="sat-ico"> ${save.totalStars()} / ${LEVELS.length * 3}`;
    $('menu-bombs').textContent = d.bombs;
    $('menu-slows').textContent = d.slows;
    $('btn-sound').style.setProperty('--off', `url(${SPR_DIR}ui/${d.sound ? 'butsmall_sfx_on' : 'butsmall_sfx_off'}.png)`);
    $('btn-sound').style.setProperty('--on', `url(${SPR_DIR}ui/${d.sound ? 'butsmall_sfx_off' : 'butsmall_sfx_on'}.png)`);
    const planets = $('planets');
    planets.innerHTML = '';
    GROUPS.forEach((gr, gi) => {
      const locked = gr.idx[0] > d.unlocked;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'planet-btn' + (gi === ui.planetSel ? ' current' : '') + (locked ? ' locked' : '');
      const pal = PLANETS[gr.planet];
      const orb = document.createElement('div');
      orb.className = 'orb';
      const frame = document.createElement('div');
      frame.className = 'frame';
      const hasBoss = gr.idx.some((i) => LEVELS[i].bossType);
      const fname = (hasBoss && gi === GROUPS.length - 1 ? 'boss' : 'planet') + (locked ? '_dis' : gi === ui.planetSel ? '_on' : '_off');
      frame.style.backgroundImage = `url(${SPR_DIR}levels/${fname}.png)`;
      orb.appendChild(frame);
      if (!planetCache[gr.planet]) planetCache[gr.planet] = makePlanet(pal.color, 92, pal.octa);
      const cv = planetCache[gr.planet].cloneNode(true);
      cv.getContext('2d').drawImage(planetCache[gr.planet], 0, 0);
      if (locked) cv.style.opacity = '0.35';
      orb.appendChild(cv);
      b.appendChild(orb);
      const lbl = document.createElement('span');
      lbl.textContent = gr.letter;
      b.appendChild(lbl);
      b.addEventListener('click', () => { ui.planetSel = gi; sound.play('click', 0.5); renderMenu(); });
      planets.appendChild(b);
    });
    const gr = GROUPS[ui.planetSel];
    $('planet-title').textContent = 'Планета ' + gr.letter + ' · уровней: ' + gr.idx.length;
    const levels = $('levels');
    levels.innerHTML = '';
    for (const i of gr.idx) {
      const L = LEVELS[i];
      const rec = save.level(i);
      const locked = i > d.unlocked;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level-btn' + (locked ? ' locked' : '') + (L.bossType ? ' boss' : '');
      b.innerHTML = `<span class="num">${locked ? '🔒' : L.name}</span><span class="sats">${satsHtml(rec.stars)}</span>` +
        (rec.best ? `<span class="best">${fmtTime(rec.best)} с · ${rec.hi}</span>` : `<span class="best">${L.bossType ? 'босс' : ''}</span>`);
      b.disabled = locked;
      b.addEventListener('click', () => startLevel(i));
      levels.appendChild(b);
    }
  }

  // ---------- игра ----------
  function startLevel(i) {
    ui.levelIndex = i;
    ui.game = new Game(i);
    ui.paused = false;
    showScreen('screen-game');
    resizeCanvas();
    $('hud-level').textContent = LEVELS[i].name + (LEVELS[i].bossType ? ' · БОСС' : '');
    $('hud-timer').classList.toggle('warn', false);
    $('hud-msg').textContent = '';
    updateBoosterButtons();
    hidePopup();
    sound.play('start', 0.6);
    sound.startMusic();
    clearTimeout(ui.countdownTimer);
    $('countdown').classList.add('hidden');
    if (LEVELS[i].bossType) {
      showPopup({
        title: 'Босс!', cls: 'fail',
        body: `<div class="popup-sub">Пришельцы прибывают парами, а времени всего <b>${LEVELS[i].bossTime}</b> секунд.<br>Очистите поле, пока не истёк таймер.</div>`,
        buttons: [{ text: 'В бой', spr: ['but_game_forward_off', 'but_game_forward_on'], onClick: () => { hidePopup(); runCountdown(beginPlay); } }],
      });
    } else {
      runCountdown(beginPlay);
    }
  }
  function beginPlay() {
    ui.game.start();
    updateTutorialHint();
    updateBoosterButtons();
    ui.lastFrame = null;
  }

  function updateTutorialHint() {
    const g = ui.game;
    const el = $('tutorial-hint');
    const st = g && g.tutorialStep();
    if (!st) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (st.free) el.textContent = st.text || 'Теперь смахните любой блок так, чтобы на его пути никого не было — он улетит с поля.';
    else el.textContent = `Смахните подсвеченный блок ${DIR_WORDS[st.dir]}.`;
  }

  // Цвета состояний кнопки бустера из оригинальной сцены (BoosterDisabled / BoosterlButton / BoosterlButtonActive)
  const BOOSTER_COLORS = {
    disabled: { bgOff: '#005c50', bgOn: '#005c50', ico: '#005c50', badge: '#005c50' },
    enabled: { bgOff: '#00c0a8', bgOn: '#00ffde', ico: '#00ffde', badge: '#00ffde' },
    active: { bgOff: '#bf6300', bgOn: '#ff8400', ico: '#ff8400', badge: '#ff8400' },
  };
  // Кольцо таймера перезарядки: 12 сегментов вокруг счётчика (SimpleTimerController)
  function ringSvg(fraction) {
    const n = Math.ceil(clamp(fraction, 0, 1) * 12);
    let s = '<svg viewBox="-39.5 -39 79 78">';
    for (let i = 0; i < n; i++) {
      s += `<rect x="-4" y="-32" width="8" height="16" rx="1.5" fill="#00ffde" fill-opacity="0.69" transform="rotate(${i * 30})"/>`;
    }
    return s + '</svg>';
  }
  function styleBooster(btn, state, count, icoName, ringFraction) {
    const c = BOOSTER_COLORS[state];
    const bg = btn.querySelector('.booster-bg');
    setTinted(bg, 'off', 'boosterOff', c.bgOff);
    setTinted(bg, 'on', 'boosterOn', c.bgOn);
    setTinted(btn.querySelector('.booster-ico'), 'ico', icoName, c.ico);
    setTinted(btn.querySelector('.booster-badge'), 'badge', 'boosterAmount', c.badge);
    btn.querySelector('.booster-cnt').textContent = count;
    const ring = btn.querySelector('.booster-ring');
    const html = ringFraction > 0 ? ringSvg(ringFraction) : '';
    if (ring.innerHTML !== html) ring.innerHTML = html;
  }
  function updateBoosterButtons() {
    const g = ui.game, d = save.data;
    if (!g) return;
    const allowBomb = (g.level.boosters & 1) === 1, allowSlow = (g.level.boosters & 2) === 2;
    const locked = g.boosterLock > 0 || g.status !== 'playing';
    const ring = g.boosterLock > 0 && g.boosterLockTotal > 0 ? g.boosterLock / g.boosterLockTotal : 0;
    const bombState = !allowBomb || d.bombs <= 0 || locked ? 'disabled' : g.boosterMode === 'bomb' ? 'active' : 'enabled';
    const slowState = !allowSlow || d.slows <= 0 || locked || g.slow ? 'disabled' : 'enabled';
    styleBooster($('btn-bomb'), bombState, allowBomb ? d.bombs : 0, 'icoBomb', allowBomb ? ring : 0);
    styleBooster($('btn-slow'), slowState, allowSlow ? d.slows : 0, 'icoSlow', allowSlow ? ring : 0);
    $('btn-bomb').disabled = bombState === 'disabled';
    $('btn-slow').disabled = slowState === 'disabled';
  }
  function styleHexLabels() {
    document.querySelectorAll('.hexlabel').forEach((el) => setTinted(el, 'hex', 'hexBlue', '#00717f'));
  }
  // Отсчёт перед стартом уровня, как в оригинале (CountDown: 3, 2, 1, Go)
  function runCountdown(done) {
    const el = $('countdown');
    const steps = ['3', '2', '1', 'Go!'];
    let i = 0;
    const next = () => {
      if (!ui.game) return;
      if (i >= steps.length) { el.classList.add('hidden'); done(); return; }
      el.textContent = steps[i];
      el.classList.remove('hidden');
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      if (i === steps.length - 1) sound.play('finish', 0.6);
      i++;
      ui.countdownTimer = setTimeout(next, 500);
    };
    next();
  }

  function handleEvents(g) {
    for (const e of g.events) {
      switch (e.type) {
        case 'sound': sound.play(e.key, e.vol); break;
        case 'bossCount': {
          const el = $('boss-counter');
          el.textContent = e.value;
          el.classList.remove('hidden');
          el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
          sound.play(e.value <= 5 ? 'beep3' : e.value <= 15 ? 'beep2' : 'beep1', 0.7);
          setTimeout(() => el.classList.add('hidden'), 1200);
          break;
        }
        case 'boosterUsed':
          if (e.kind === 'bomb') save.data.bombs--; else save.data.slows--;
          save.write();
          updateBoosterButtons();
          break;
        case 'won': setTimeout(() => onWin(g), 400); break;
        case 'lost': setTimeout(() => onLose(g), 700); break;
      }
    }
    g.events.length = 0;
  }

  function onWin(g) {
    if (ui.game !== g) return;
    $('tutorial-hint').classList.add('hidden');
    sound.stopMusic();
    sound.play('win', 0.8);
    const { score, stars } = g.score();
    const rec = save.complete(g.index, g.time, score, stars);
    updateBoosterButtons();
    const next = g.index + 1 < LEVELS.length ? g.index + 1 : null;
    showPopup({
      title: 'Уровень пройден!', cls: 'win',
      body: `<div class="popup-sats">${satsHtml(stars)}</div>` +
        `<div class="popup-score">${score} очков</div>` +
        `<div class="popup-sub">Время: ${fmtTime(g.time)} с · рекорд ${fmtTime(rec.best)} с · лучший счёт ${rec.hi}<br>` +
        `3★ — быстрее ${g.level.kStar3 + 1} с, 2★ — быстрее ${g.level.kStar2 + 1} с</div>`,
      buttons: [
        { text: 'Уровни', spr: ['but_levels_off', 'but_levels_on'], onClick: () => goMenu() },
        { text: 'Ещё раз', spr: ['but_restart_off', 'but_restart_on'], onClick: () => startLevel(g.index) },
        next !== null ? { text: 'Дальше', spr: ['but_game_forward_off', 'but_game_forward_on'], onClick: () => startLevel(next) } : null,
      ].filter(Boolean),
    });
  }

  function onLose(g) {
    if (ui.game !== g) return;
    $('tutorial-hint').classList.add('hidden');
    sound.stopMusic();
    sound.play('monster2', 0.7);
    const reasons = {
      crash: 'Блок влетел с другой стороны и разбился о стену.',
      full: 'Новым блокам некуда влетать — поле заблокировано.',
      time: 'Время вышло.',
    };
    showPopup({
      title: 'Неудача', cls: 'fail',
      body: `<div class="popup-sub">${reasons[g.loseReason] || ''}</div>`,
      buttons: [
        { text: 'Уровни', spr: ['but_levels_off', 'but_levels_on'], onClick: () => goMenu() },
        { text: 'Заново', spr: ['but_restart_off', 'but_restart_on'], onClick: () => startLevel(g.index) },
      ],
    });
  }

  function goMenu() {
    ui.game = null;
    ui.paused = false;
    clearTimeout(ui.countdownTimer);
    $('countdown').classList.add('hidden');
    sound.stopMusic();
    hidePopup();
    showScreen('screen-menu');
    renderMenu();
  }

  function showPopup(o) {
    const p = $('popup');
    $('popup-title').textContent = o.title;
    $('popup-title').className = o.cls || '';
    $('popup-body').innerHTML = o.body || '';
    const bt = $('popup-buttons');
    bt.innerHTML = '';
    for (const b of o.buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'popup-btn';
      el.innerHTML = sprBtn('hex', b.spr[0], b.spr[1]) + `<span>${b.text}</span>`;
      el.addEventListener('click', () => { sound.play('click', 0.5); b.onClick(); });
      bt.appendChild(el);
    }
    p.classList.remove('hidden');
    sound.play('popup', 0.5);
  }
  function hidePopup() { $('popup').classList.add('hidden'); }

  function pauseGame() {
    if (!ui.game || ui.game.status !== 'playing' || ui.paused) return;
    ui.paused = true;
    showPopup({
      title: 'Пауза',
      body: `<div class="popup-sub">${LEVELS[ui.levelIndex].name} · ${fmtTime(ui.game.time)} с</div>`,
      buttons: [
        { text: 'Уровни', spr: ['but_levels_off', 'but_levels_on'], onClick: () => goMenu() },
        { text: 'Заново', spr: ['but_restart_off', 'but_restart_on'], onClick: () => startLevel(ui.levelIndex) },
        { text: 'Продолжить', spr: ['but_resume_off', 'but_resume_on'], onClick: () => { ui.paused = false; hidePopup(); ui.lastFrame = null; } },
      ],
    });
  }

  // ---------- ввод на поле ----------
  function pointerToCell(e) {
    const r = canvas.getBoundingClientRect();
    // клетка x занимает экран [(x+1)cs, (x+2)cs], клетка y — [(N-y)cs, (N-y+1)cs]
    const px = (e.clientX - r.left) / view.cs - 1;
    const py = N + 1 - (e.clientY - r.top) / view.cs;
    return { px, py, x: Math.floor(px), y: Math.floor(py), sx: e.clientX, sy: e.clientY };
  }
  canvas.addEventListener('pointerdown', (e) => {
    const g = ui.game;
    if (!g || g.status !== 'playing' || ui.paused) return;
    e.preventDefault();
    const c = pointerToCell(e);
    if (g.boosterMode === 'bomb') {
      if (inField(c.x, c.y)) { g.useBomb(c.x, c.y); updateBoosterButtons(); }
      return;
    }
    const onBlock = inField(c.x, c.y) && g.grid[c.x][c.y] && g.grid[c.x][c.y].type !== T.FIXED;
    ui.pointer = { start: c, onBlock, done: false };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    const g = ui.game, p = ui.pointer;
    if (!g || !p || p.done || g.status !== 'playing' || ui.paused) return;
    const dx = e.clientX - p.start.sx, dy = e.clientY - p.start.sy;
    const thr = view.size * 0.03;
    if (Math.abs(dx) < thr && Math.abs(dy) < thr) return;
    p.done = true;
    let dir;
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? DIR.R : DIR.L;
    else dir = dy > 0 ? DIR.D : DIR.U;  // экранный y вниз
    if (p.onBlock) g.swipe(p.start.x, p.start.y, dir);
    else g.swipeNear(p.start.px, p.start.py, dir);
    updateTutorialHint();
  });
  const endPointer = () => { ui.pointer = null; };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // ---------- кнопки ----------
  $('btn-pause').addEventListener('click', () => { sound.play('click', 0.5); pauseGame(); });
  $('btn-bomb').addEventListener('click', () => {
    const g = ui.game; if (!g || g.status !== 'playing') return;
    sound.play('click', 0.5);
    g.boosterMode = g.boosterMode === 'bomb' ? null : 'bomb';
    $('hud-msg').textContent = g.boosterMode === 'bomb' ? 'Выберите клетку для взрыва' : '';
    updateBoosterButtons();
  });
  $('btn-slow').addEventListener('click', () => {
    const g = ui.game; if (!g || g.status !== 'playing') return;
    sound.play('click', 0.5);
    g.boosterMode = null;
    if (g.useSlow()) $('hud-msg').textContent = 'Замедление времени!';
    updateBoosterButtons();
  });
  $('btn-sound').addEventListener('click', () => {
    save.data.sound = !save.data.sound;
    save.write();
    sound.setEnabled(save.data.sound);
    renderMenu();
  });
  $('btn-reset').addEventListener('click', () => {
    if (confirm('Сбросить весь прогресс?')) { save.reset(); ui.planetSel = 0; renderMenu(); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.game) { if (ui.paused) { ui.paused = false; hidePopup(); ui.lastFrame = null; } else pauseGame(); }
  });
  window.addEventListener('resize', () => { if (ui.game) resizeCanvas(); });

  // ---------- цикл ----------
  function frame(now) {
    ui.raf = requestAnimationFrame(frame);
    const g = ui.game;
    if (!g) return;
    // lastFrame === null — первый кадр после старта/паузы: dt = 0 (часы rAF и performance.now() могут расходиться)
    let dt = ui.lastFrame === null ? 0 : (now - ui.lastFrame) / 1000;
    ui.lastFrame = now;
    dt = clamp(dt, 0, 0.05);
    if (!ui.paused && g.status !== 'ready') {
      g.update(dt);
      handleEvents(g);
    }
    render(g, now);
    // HUD
    const timer = $('hud-timer');
    if (g.boss) {
      const left = Math.max(0, g.level.bossTime - g.time);
      timer.textContent = fmtTime(left);
      timer.classList.toggle('warn', left <= 10);
    } else {
      timer.textContent = fmtTime(g.time);
    }
    if (g.boosterLock > 0 || g.slow || ui.boosterWasLocked) {
      if (!ui.boosterTick || now - ui.boosterTick > 120) { ui.boosterTick = now; updateBoosterButtons(); }
      ui.boosterWasLocked = g.boosterLock > 0 || !!g.slow;
      if (!g.slow && g.boosterLock <= 0 && $('hud-msg').textContent === 'Замедление времени!') $('hud-msg').textContent = '';
    }
  }

  // ---------- старт ----------
  // Для отладки и тестов движка
  window.AlienBricks = {
    Game, T, DIR, LEVELS, ui, startLevel,
    step(dt) { const g = ui.game; if (!g) return; g.update(dt); handleEvents(g); render(g, performance.now()); },
  };
  if (window.__ALIEN_BRICKS_HEADLESS__) return;
  // Любая ошибка выводится на экран, а не только в консоль
  const showError = (msg) => {
    let el = document.getElementById('error-banner');
    if (!el) { el = document.createElement('div'); el.id = 'error-banner'; el.className = 'error-banner'; document.body.appendChild(el); }
    el.textContent = 'Ошибка: ' + msg;
  };
  window.addEventListener('error', (e) => showError(e.message + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '')));
  window.addEventListener('unhandledrejection', (e) => showError(e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  save.load();
  sound.setEnabled(save.data.sound);
  sound.init();
  // Web Audio разрешается после первого жеста пользователя
  const unlockOnce = () => { sound.unlock(); document.removeEventListener('pointerdown', unlockOnce); document.removeEventListener('keydown', unlockOnce); };
  document.addEventListener('pointerdown', unlockOnce);
  document.addEventListener('keydown', unlockOnce);
  resizeCanvas();
  loadSprites().then(() => {
    ui.ready = true;
    $('loading').classList.add('hidden');
    try { styleHexLabels(); } catch (e) { showError(e.message); }
    renderMenu();
    requestAnimationFrame((t) => { ui.lastFrame = null; frame(t); });
    const m = /#level=(\d+)/.exec(location.hash);   // отладка: index.html#level=3
    if (m && LEVELS[+m[1]]) startLevel(+m[1]);
  }).catch((e) => showError(e && e.message ? e.message : String(e)));
})();
