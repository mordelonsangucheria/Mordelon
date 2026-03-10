// ===================== MORDELÓN RUN v2.0 =====================
(function () {
  'use strict';

  // ── Constantes de grilla ───────────────────────────────────────────────────
  const COLS = 20, ROWS = 28, TILE = 20;
  const VISIBLE_ROWS = 16; // filas visibles en pantalla al mismo tiempo
  const T = { VACIO: 0, SUELO: 1, ESC: 2, COCINA: 3, ESC_S: 4 };

  const ING = [
    { e: '🍞', c: '#D4A056' }, { e: '🥩', c: '#C0392B' },
    { e: '🍅', c: '#E74C3C' }, { e: '🥬', c: '#27AE60' },
  ];

  const COL = {
    BG: '#080c10', SUELO: '#17302f', SUELO_TOP: '#3dbfb8',
    ESC: '#3dbfb8', COCINA: '#d4831a', COCINA_B: '#ffaa33',
    P1: '#3dbfb8', P2: '#1a7a75', PDARK: '#0a3030',
    ENE: '#e03535', ENE2: '#8b0000',
  };

  // ── Estado global ──────────────────────────────────────────────────────────
  let canvas, ctx;
  let estado = 'parado'; // IDLE → PLAYING → PAUSED → OVER
  let score = 0, hiScore = 0, vidas = 3, nivel = 1;
  let loopId = null, lastTs = 0;
  let grid = [], items = [], enemies = [], itemsLeft = 0;
  let runDificultad = 1;
  let completando = false;
  let freezeTimer = 0;
  let FREEZE_DUR = 1500;
  let FREEZE_USOS = 0;
  let freezeUsosRestantes = 0;

  // ── Cámara ────────────────────────────────────────────────────────────────
  let camRow = ROWS - VISIBLE_ROWS; // fila del mundo en el tope del canvas
  let camRowTarget = ROWS - VISIBLE_ROWS;

  // ── Jugador ────────────────────────────────────────────────────────────────
  let P = {
    col: 5, row: 14, dx: 0, dy: 0,
    dead: false, deadTimer: 0,
    // Física real
    x: 0, y: 0, vx: 0, vy: 0,
    onGround: false, onLadder: false,
    // Mecánicas
    coyoteTime: 0,       // ms restantes de coyote time
    jumpHeld: false,     // mantiene el salto presionado
    jumpTimer: 0,        // ms desde que inició el salto
    canDoubleJump: false,
    doubleJumpUsed: false,
    dashCooldown: 0,
    dashTimer: 0,
    dashDir: 0,
    // Estado visual
    facingDir: 1,
    animState: 'idle',   // idle | run | jump | fall | death | dash
    animFrame: 0,
    animTimer: 0,
    // Squash & stretch
    scaleX: 1, scaleY: 1,
    // Power-ups activos
    powerups: {},        // { speed, invincible, doubleJump }
    // Respawn
    respawnAnim: 0,
    // Checkpoint
    checkpointCol: 5, checkpointRow: 14,
  };

  // Keys y touch
  let keysDown = {};
  let lastTapDir = { dir: null, time: 0 }; // para detectar double-tap dash
  let touchSt = null;

  // ── Partículas ─────────────────────────────────────────────────────────────
  let particles = [];

  // ── Parallax ──────────────────────────────────────────────────────────────
  const parallaxLayers = [
    { stars: [], speed: 0.1 },
    { stars: [], speed: 0.25 },
    { stars: [], speed: 0.45 },
  ];

  // ── Screen shake ──────────────────────────────────────────────────────────
  let shakeAmt = 0, shakeDecay = 0.88;

  // ── Power-up pickups en mapa ───────────────────────────────────────────────
  let powerupItems = [];

  // ── Checkpoints ───────────────────────────────────────────────────────────
  let checkpoints = [];

  // ── Pantalla de inicio ────────────────────────────────────────────────────
  let idleAnim = 0, idleAnimTimer = 0;
  let titleParticles = [];

  // ── Transición de nivel ───────────────────────────────────────────────────
  let transition = { active: false, timer: 0, duration: 600, phase: 'in' };

  // ── pTimer (legacy Lode Runner step timer) ─────────────────────────────────
  let pTimer = 0;
  const P_SPD = 135; // ms por paso (más rápido que antes)

  // ═══════════════════════════════════════════════════════════════════════════
  // WEB AUDIO
  // ═══════════════════════════════════════════════════════════════════════════
  let audioCtx = null;
  let masterGain = null;
  let bgNode = null;
  let bgGain = null;
  let reverbNode = null;

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.55;
      masterGain.connect(audioCtx.destination);
      // Reverb sintético (convolver con impulso generado)
      reverbNode = audioCtx.createConvolver();
      const rate = audioCtx.sampleRate;
      const len = rate * 1.2;
      const buf = audioCtx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
      }
      reverbNode.buffer = buf;
      reverbNode.connect(masterGain);
      startBgMusic();
    } catch (e) { /* sin audio */ }
  }

  function playTone(freq, type, duration, vol, detune = 0, useReverb = false) {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      if (detune) osc.detune.value = detune;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(useReverb && reverbNode ? reverbNode : masterGain);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function playJump(vy) {
    if (!audioCtx) return;
    const pitch = 260 + Math.abs(vy) * 18;
    playTone(pitch, 'sine', 0.12, 0.3);
    playTone(pitch * 1.5, 'triangle', 0.08, 0.15);
  }

  function playCollect() {
    if (!audioCtx) return;
    [440, 554, 659].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.12, 0.25), i * 55));
  }

  function playDeath() {
    if (!audioCtx) return;
    [300, 220, 160, 100].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.18, 0.3), i * 80));
  }

  function playLevelComplete() {
    if (!audioCtx) return;
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.2, 0.3), i * 90));
  }

  function playPowerup() {
    if (!audioCtx) return;
    [330, 440, 550, 660, 880].forEach((f, i) => setTimeout(() => playTone(f, 'triangle', 0.15, 0.25), i * 50));
  }

  function playDash() {
    if (!audioCtx) return;
    playTone(180, 'sawtooth', 0.08, 0.2);
    playTone(360, 'square', 0.06, 0.15, 200);
  }

  function startBgMusic() {
    if (!audioCtx || bgNode) return;
    bgGain = audioCtx.createGain();
    bgGain.gain.value = 0.04;
    bgGain.connect(masterGain);

    const scale = [130.81, 146.83, 164.81, 174.61, 196, 220, 246.94];
    let noteIdx = 0;
    const playNextNote = () => {
      if (!audioCtx || estado === 'parado') return;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const freq = scale[noteIdx % scale.length] * (noteIdx % 14 < 7 ? 1 : 2);
      noteIdx++;
      osc.type = 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.001, audioCtx.currentTime);
      g.gain.linearRampToValueAtTime(0.07, audioCtx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.38);
      osc.connect(g);
      g.connect(bgGain);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
      const interval = [200, 200, 300, 200, 150, 250][noteIdx % 6];
      setTimeout(playNextNote, interval);
    };
    setTimeout(playNextNote, 400);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARALLAX
  // ═══════════════════════════════════════════════════════════════════════════
  function initParallax() {
    const W = canvas.width, H = canvas.height;
    parallaxLayers.forEach((layer, li) => {
      layer.stars = [];
      const count = [60, 35, 20][li];
      for (let i = 0; i < count; i++) {
        layer.stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 0.5 + Math.random() * (li + 0.5),
          alpha: 0.15 + Math.random() * 0.5,
          // Algunas son ventanas de cocina
          type: Math.random() < 0.08 ? 'window' : 'star',
        });
      }
    });
  }

  let parallaxOffset = 0;

  function drawParallax() {
    parallaxOffset += 0.3;
    const W = canvas.width, H = canvas.height;
    parallaxLayers.forEach((layer, li) => {
      const off = (parallaxOffset * layer.speed) % W;
      layer.stars.forEach(s => {
        const sx = ((s.x - off % W + W) % W);
        if (s.type === 'window') {
          ctx.save();
          ctx.globalAlpha = s.alpha * 0.6;
          ctx.fillStyle = '#d4831a';
          ctx.fillRect(sx, s.y, 6 + li * 2, 8 + li * 2);
          ctx.fillStyle = '#ffcc66';
          ctx.fillRect(sx + 1, s.y + 1, 2, 3);
          ctx.fillRect(sx + 4, s.y + 1, 2, 3);
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalAlpha = s.alpha;
          ctx.fillStyle = li === 0 ? '#3dbfb8' : li === 1 ? '#d4831a' : '#ffffff';
          ctx.beginPath();
          ctx.arc(sx, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTÍCULAS
  // ═══════════════════════════════════════════════════════════════════════════
  function spawnParticles(x, y, color, count = 8, speed = 80, life = 500) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const spd = speed * (0.5 + Math.random());
      particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 30,
        life, maxLife: life,
        color,
        size: 2 + Math.random() * 3,
        gravity: 120,
      });
    }
  }

  function spawnDeathParticles(px, py) {
    spawnParticles(px, py, '#ff4444', 14, 120, 700);
    spawnParticles(px, py, '#ffaa44', 8, 80, 500);
  }

  function spawnCollectParticles(px, py, color) {
    spawnParticles(px, py, color, 10, 90, 400);
    spawnParticles(px, py, '#ffffff', 5, 50, 300);
  }

  function spawnLevelParticles() {
    const W = canvas.width, H = canvas.height;
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * W,
        y: H + 10,
        vx: (Math.random() - 0.5) * 80,
        vy: -150 - Math.random() * 100,
        life: 1200, maxLife: 1200,
        color: Math.random() < 0.5 ? '#3dbfb8' : '#d4831a',
        size: 3 + Math.random() * 4,
        gravity: 40,
      });
    }
  }

  function updateParticles(dt) {
    const dtS = dt / 1000;
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x += p.vx * dtS;
      p.y += p.vy * dtS;
      p.vy += p.gravity * dtS;
      p.vx *= 0.98;
      p.life -= dt;
    });
  }

  function drawParticles() {
    particles.forEach(p => {
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, p.size * alpha), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ILUMINACIÓN DINÁMICA (halo alrededor del jugador)
  // ═══════════════════════════════════════════════════════════════════════════
  function drawLightHalo() {
    const px = P.col * TILE + TILE / 2;
    const py = P.row * TILE + TILE / 2;
    const hasPowerup = P.powerups.invincible || P.powerups.speed || P.powerups.doubleJump;
    const haloColor = hasPowerup ? (P.powerups.invincible ? '#ffdd44' : P.powerups.speed ? '#44ffaa' : '#aa44ff') : '#3dbfb8';
    const r = hasPowerup ? 55 : 38;

    const grad = ctx.createRadialGradient(px, py, 2, px, py, r);
    grad.addColorStop(0, haloColor + '28');
    grad.addColorStop(0.5, haloColor + '10');
    grad.addColorStop(1, 'transparent');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS DE GRILLA
  // ═══════════════════════════════════════════════════════════════════════════
  function g(r, c) { return (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? grid[r][c] : T.SUELO; }
  function solido(r, c) { const t = g(r, c); return t === T.SUELO || t === T.COCINA; }
  function esEsc(r, c) { const t = g(r, c); return t === T.ESC || t === T.ESC_S; }
  function apoyado(r, c) {
    const abajo = g(r + 1, c);
    return abajo === T.SUELO || abajo === T.COCINA || abajo === T.ESC_S || esEsc(r, c);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERACIÓN DE NIVEL
  // ═══════════════════════════════════════════════════════════════════════════
  function genNivel(n) {
    grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(T.VACIO));

    // Suelo inferior y paredes
    for (let c = 0; c < COLS; c++) grid[ROWS - 1][c] = T.SUELO;
    for (let r = 0; r < ROWS; r++) { grid[r][0] = T.SUELO; grid[r][COLS - 1] = T.SUELO; }

    // ── Plataformas: zona baja (ROWS-4 hasta fila 16) + zona alta (fila 14 hasta fila 2)
    const platRows = [];
    // Zona baja: plataformas clásicas
    for (let r = ROWS - 4; r >= ROWS - 16; r -= 3) platRows.push(r);
    // Zona alta: plataformas adicionales (las nuevas de arriba)
    for (let r = ROWS - 19; r >= 2; r -= 3) platRows.push(r);

    platRows.forEach((r, i) => {
      const izq = (i % 2 === 0);
      const largo = 10 + Math.floor(Math.random() * 3);
      if (izq) { for (let c = 1; c <= largo; c++) grid[r][c] = T.SUELO; }
      else { for (let c = COLS - 1 - largo; c <= COLS - 2; c++) grid[r][c] = T.SUELO; }
    });

    // Cocina
    grid[ROWS - 1][2] = T.COCINA;

    // ── Escaleras mejoradas: una escalera por cada par de pisos contiguos,
    // ubicada en el borde opuesto a la plataforma superior para forzar cruzar.
    const pisos = [ROWS - 1, ...platRows].sort((a, b) => b - a);
    for (let i = 0; i < pisos.length - 1; i++) {
      const rInf = pisos[i];
      const rSup = pisos[i + 1];
      if (rInf - rSup > 6) continue; // gap demasiado grande, skip
      const idxSup = platRows.indexOf(rSup);
      const izqSup = (idxSup % 2 === 0);

      // Escalera en el borde de la plataforma superior
      let escCol = -1;
      if (izqSup) {
        // Plataforma va por izquierda → escalera en su borde derecho
        let lastC = -1;
        for (let c = 1; c < COLS - 1; c++) if (grid[rSup][c] === T.SUELO) lastC = c;
        escCol = lastC > 0 ? lastC : -1;
      } else {
        // Plataforma va por derecha → escalera en su borde izquierdo
        let firstC = -1;
        for (let c = COLS - 2; c >= 1; c--) if (grid[rSup][c] === T.SUELO) firstC = c;
        escCol = firstC > 0 ? firstC : -1;
      }

      // Asegurarse de que la columna elegida esté dentro de la plataforma inferior también,
      // si no, buscar la columna libre más cercana en rInf
      if (escCol !== -1 && grid[rInf][escCol] === T.VACIO) {
        // Buscar columna sólida cercana en rInf
        let best = escCol;
        for (let dc = 0; dc <= 3; dc++) {
          if (grid[rInf][escCol + dc] === T.SUELO || grid[rInf][escCol + dc] === T.COCINA) { best = escCol + dc; break; }
          if (grid[rInf][escCol - dc] === T.SUELO || grid[rInf][escCol - dc] === T.COCINA) { best = escCol - dc; break; }
        }
        escCol = best;
      }

      if (escCol === -1 || escCol <= 0 || escCol >= COLS - 1) continue;

      // Trazar escalera desde rSup hasta rInf
      for (let r = rSup; r <= rInf; r++) {
        if (grid[r][escCol] === T.SUELO)   grid[r][escCol] = T.ESC_S;
        else if (grid[r][escCol] === T.VACIO) grid[r][escCol] = T.ESC;
        // Asegurar que la celda encima del suelo superior también tenga escalera accesible
      }
      // Celda justo encima de rSup: si está vacía, poner ESC para que el jugador pueda salir
      if (rSup - 1 >= 0 && grid[rSup - 1][escCol] === T.VACIO) {
        grid[rSup - 1][escCol] = T.ESC;
      }
    }

    // Ingredientes
    items = [];
    const cant = Math.min(4 + Math.floor((n - 1) / 2), 6);
    let intentos = 0;
    while (items.length < cant && intentos++ < 1500) {
      const r = 1 + Math.floor(Math.random() * (ROWS - 2));
      const c = 1 + Math.floor(Math.random() * (COLS - 2));
      const t = g(r, c);
      if (t !== T.VACIO && t !== T.ESC) continue;
      if (!apoyado(r, c)) continue;
      if (c <= 5 && r >= ROWS - 3) continue;
      if (items.find(it => it.col === c && it.row === r)) continue;
      items.push({ col: c, row: r, t: Math.floor(Math.random() * ING.length), ok: false, bobTimer: Math.random() * Math.PI * 2 });
    }
    itemsLeft = items.length;

    // Power-ups en el mapa (aparecen aleatoriamente)
    powerupItems = [];
    const puTypes = ['speed', 'invincible', 'doubleJump'];
    const puCount = Math.min(1 + Math.floor(n / 3), 3);
    for (let pi = 0; pi < puCount; pi++) {
      let placed = false, att = 0;
      while (!placed && att++ < 300) {
        const r = 1 + Math.floor(Math.random() * (ROWS - 2));
        const c = 3 + Math.floor(Math.random() * (COLS - 4));
        if (g(r, c) !== T.VACIO) continue;
        if (!apoyado(r, c)) continue;
        if (items.find(it => it.col === c && it.row === r)) continue;
        powerupItems.push({ col: c, row: r, type: puTypes[pi % puTypes.length], ok: false, pulseTimer: 0 });
        placed = true;
      }
    }

    // Checkpoints
    checkpoints = [];
    platRows.forEach((r, i) => {
      if (i === Math.floor(platRows.length / 2)) {
        const izq = (i % 2 === 0);
        const cc = izq ? 3 : COLS - 4;
        checkpoints.push({ col: cc, row: r - 1, activated: false });
      }
    });

    // Enemigos
    enemies = [];
    const difMult = [0.5, 0.75, 1.0, 1.3, 1.7][runDificultad];
    const nEne = Math.min(Math.ceil((1 + Math.floor((n - 1) / 3)) * difMult), 5);
    const spd = Math.max((600 - (n - 1) * 18) / difMult, 180);
    platRows.forEach((pr, i) => {
      if (i >= nEne) return;
      const eRow = pr - 1;
      const cols = [];
      for (let c = 2; c < COLS - 2; c++) {
        const t = g(eRow, c);
        if ((t === T.VACIO || t === T.ESC) && (solido(eRow + 1, c) || g(eRow + 1, c) === T.ESC_S)) cols.push(c);
      }
      if (!cols.length) return;
      const ec = cols[Math.floor(Math.random() * cols.length)];
      enemies.push({
        col: ec, row: eRow, dir: i % 2 === 0 ? 1 : -1,
        timer: 0, spd: spd + Math.random() * 50,
        animFrame: 0, animTimer: 0,
        patrolMin: ec - 3, patrolMax: ec + 3,
        alertTimer: 0, // para "detectar" al jugador cercano
      });
    });

    // Reset jugador
    const spawnCol = P.checkpointCol || 5;
    const spawnRow = P.checkpointRow || ROWS - 2;
    camRowTarget = ROWS - VISIBLE_ROWS; // cámara empieza abajo
    P = {
      col: spawnCol, row: spawnRow, dx: 0, dy: 0,
      dead: false, deadTimer: 0,
      x: spawnCol * TILE, y: spawnRow * TILE,
      vx: 0, vy: 0,
      onGround: false, onLadder: false,
      coyoteTime: 0, jumpHeld: false, jumpTimer: 0,
      canDoubleJump: false, doubleJumpUsed: false,
      dashCooldown: 0, dashTimer: 0, dashDir: 0,
      facingDir: 1,
      animState: 'idle', animFrame: 0, animTimer: 0,
      scaleX: 1, scaleY: 1,
      powerups: {},
      respawnAnim: 0,
      checkpointCol: spawnCol, checkpointRow: spawnRow,
    };
    pTimer = 0;
    _resetFreezeUsos();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOVIMIENTO JUGADOR (tile-based Lode Runner con mejoras)
  // ═══════════════════════════════════════════════════════════════════════════
  function moverP(dt) {
    if (P.dead) {
      P.deadTimer -= dt;
      if (P.deadTimer <= 0) respawn();
      return;
    }

    // Actualizar power-ups
    const pwKeys = Object.keys(P.powerups);
    pwKeys.forEach(k => {
      P.powerups[k] -= dt;
      if (P.powerups[k] <= 0) delete P.powerups[k];
    });

    // Cooldowns
    if (P.dashCooldown > 0) P.dashCooldown -= dt;
    if (P.coyoteTime > 0) P.coyoteTime -= dt;

    // Squash & stretch decay
    P.scaleX += (1 - P.scaleX) * 0.18;
    P.scaleY += (1 - P.scaleY) * 0.18;

    // Inputs
    let dx = 0, dy = 0;
    if (keysDown['ArrowLeft'] || keysDown['a'] || keysDown['A']) dx = -1;
    if (keysDown['ArrowRight'] || keysDown['d'] || keysDown['D']) dx = 1;
    if (keysDown['ArrowUp'] || keysDown['w'] || keysDown['W']) dy = -1;
    if (keysDown['ArrowDown'] || keysDown['s'] || keysDown['S']) dy = 1;
    if (P.dx) dx = P.dx;
    if (P.dy) dy = P.dy;

    if (dx !== 0) P.facingDir = dx;

    // Velocidad con power-up
    const speedMult = P.powerups.speed ? 0.72 : 1;

    pTimer += dt;
    if (pTimer < P_SPD * speedMult) {
      // Aún no llegó el tick, actualizar animación igualmente
      updatePAnim(dt, dx, dy);
      return;
    }
    pTimer = 0;
    P.dx = 0; P.dy = 0;

    const r = P.row, c = P.col;
    const enEscalera = esEsc(r, c);
    const pisoAbajo = solido(r + 1, c);
    const escSAbajo = g(r + 1, c) === T.ESC_S;
    const apoyoAbajo = pisoAbajo || escSAbajo;

    // ── GRAVEDAD ──
    if (!apoyoAbajo && !enEscalera) {
      const nr = r + 1;
      if (nr < ROWS && !solido(nr, c)) {
        P.row = nr;
        P.coyoteTime = 0; // cayendo
        updatePAnim(dt, dx, dy);
        return;
      }
    }

    // ── ESCALERA VERTICAL ──
    if (dy !== 0 && enEscalera) {
      const nr = r + dy;
      if (nr >= 0 && nr < ROWS) {
        const tnr = g(nr, c);
        if (tnr === T.VACIO || tnr === T.ESC || tnr === T.ESC_S) {
          P.row = nr;
          updatePAnim(dt, dx, dy);
          return;
        }
      }
      updatePAnim(dt, dx, dy);
      return;
    }

    // Entrar a escalera subiendo
    if (dy === -1 && apoyoAbajo && esEsc(r - 1, c)) {
      P.row = r - 1;
      updatePAnim(dt, dx, dy);
      return;
    }
    // Entrar a escalera bajando
    if (dy === 1 && apoyoAbajo && esEsc(r + 1, c)) {
      P.row = r + 1;
      updatePAnim(dt, dx, dy);
      return;
    }

    // ── HORIZONTAL ──
    if (dx !== 0) {
      // Dash (doble tap detectado via input handlers)
      if (P.dashTimer > 0) {
        P.dashTimer -= pTimer + dt; // consumir
        // Mover 2 celdas si es posible
        const nc1 = c + dx;
        const nc2 = c + dx * 2;
        let destC = c;
        if (nc1 > 0 && nc1 < COLS - 1 && g(r, nc1) !== T.SUELO && g(r, nc1) !== T.COCINA) {
          destC = nc1;
          if (nc2 > 0 && nc2 < COLS - 1 && g(r, nc2) !== T.SUELO && g(r, nc2) !== T.COCINA) {
            destC = nc2;
          }
        }
        if (destC !== c) {
          P.col = destC;
          P.animState = 'dash';
          shakeAmt = 3;
          spawnParticles(c * TILE + TILE / 2, r * TILE + TILE / 2, '#3dbfb8', 6, 60, 200);
        }
        P.dashTimer = 0;
        updatePAnim(dt, dx, dy);
        return;
      }

      const nc = c + dx;
      if (nc > 0 && nc < COLS - 1) {
        const tnc = g(r, nc);
        if (tnc !== T.SUELO && tnc !== T.COCINA) {
          P.col = nc;
          if (!solido(r + 1, nc) && !esEsc(r, nc) && g(r + 1, nc) !== T.ESC_S) {
            let fr = r + 1;
            while (fr < ROWS - 1 && !solido(fr, nc) && !esEsc(fr, nc)) fr++;
            if (solido(fr, nc) || g(fr, nc) === T.ESC_S) P.row = fr - 1;
            else P.row = fr;
          }
          updatePAnim(dt, dx, dy);
          return;
        }
      }
    }

    updatePAnim(dt, dx, dy);
  }

  function updatePAnim(dt, dx, dy) {
    const enEsc = esEsc(P.row, P.col);
    const enSuelo = apoyado(P.row, P.col);

    if (P.animState === 'death') return;

    let newState = 'idle';
    if (enEsc) newState = 'climb';
    else if (P.animState === 'dash') newState = 'dash';
    else if (!enSuelo) newState = 'fall';
    else if (dx !== 0) newState = 'run';

    if (P.animState !== 'dash') P.animState = newState;

    P.animTimer += dt;
    const frameSpeed = P.animState === 'run' ? 120 : P.animState === 'climb' ? 180 : 200;
    if (P.animTimer > frameSpeed) {
      P.animTimer = 0;
      P.animFrame = (P.animFrame + 1) % 2;
      if (P.animState === 'dash') P.animState = 'run';
    }
  }

  function respawn() {
    spawnParticles(
      P.col * TILE + TILE / 2,
      P.row * TILE + TILE / 2,
      '#3dbfb8', 12, 80, 400
    );
    P = {
      ...P,
      col: P.checkpointCol, row: P.checkpointRow,
      dx: 0, dy: 0,
      dead: false, deadTimer: 0,
      animState: 'idle', animFrame: 0,
      scaleX: 0.1, scaleY: 2.0, // stretch desde arriba
      powerups: {},
      dashCooldown: 0, dashTimer: 0,
    };
    pTimer = 0;
    P.respawnAnim = 400; // ms de animación de aparición
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENEMIGOS CON PATHFINDING BÁSICO
  // ═══════════════════════════════════════════════════════════════════════════
  function moverEne(dt) {
    if (freezeTimer > 0) { freezeTimer -= dt; return; }

    enemies.forEach(e => {
      // Animación
      e.animTimer = (e.animTimer || 0) + dt;
      if (e.animTimer > 180) { e.animTimer = 0; e.animFrame = ((e.animFrame || 0) + 1) % 2; }

      // Detectar jugador cercano → acelerar
      const distC = Math.abs(e.col - P.col);
      const distR = Math.abs(e.row - P.row);
      const alerting = distC <= 3 && distR <= 1 && e.row === P.row;
      if (alerting) e.alertTimer = Math.min((e.alertTimer || 0) + dt, 600);
      else e.alertTimer = Math.max((e.alertTimer || 0) - dt, 0);

      const alertBoost = alerting ? 0.80 : 1;

      e.timer += dt;
      if (e.timer < e.spd * alertBoost) return;
      e.timer = 0;

      // Pathfinding simple: si mismo row que jugador → perseguir col
      // Si diferente row → seguir patrulla y usar escalera si cercano
      let targetDir = e.dir;
      if (e.row === P.row && distC <= 8) {
        targetDir = P.col > e.col ? 1 : -1;
      } else if (distC <= 3 && distR <= 4) {
        // Buscar escalera cercana
        const ladderDir = findLadderDir(e);
        if (ladderDir !== 0) targetDir = ladderDir;
      }

      const nc = e.col + targetDir;
      const tnc = g(e.row, nc);
      const tabajo = g(e.row + 1, nc);
      const puedeAndar = (tnc === T.VACIO || tnc === T.ESC) &&
        (tabajo === T.SUELO || tabajo === T.ESC_S || tabajo === T.COCINA);

      if (nc <= 0 || nc >= COLS - 1 || !puedeAndar) {
        e.dir *= -1;
      } else {
        e.col = nc;
        e.dir = targetDir;
      }

      // ¿Matar jugador?
      if (e.col === P.col && e.row === P.row && !P.dead) {
        if (P.powerups.invincible) {
          // El jugador es invencible → rebotar enemigo
          e.dir *= -1;
          spawnParticles(e.col * TILE + TILE / 2, e.row * TILE + TILE / 2, '#ffdd44', 8, 80, 300);
        } else {
          matarP();
        }
      }
    });
  }

  function findLadderDir(e) {
    // Buscar escalera en las 3 columnas cercanas
    for (let dc = -3; dc <= 3; dc++) {
      const cc = e.col + dc;
      if (esEsc(e.row, cc) || esEsc(e.row - 1, cc)) return dc > 0 ? 1 : dc < 0 ? -1 : 0;
    }
    return 0;
  }

  function matarP() {
    if (P.dead) return;
    P.dead = true; P.deadTimer = 1200; vidas--;
    P.animState = 'death';
    shakeAmt = 8;
    spawnDeathParticles(P.col * TILE + TILE / 2, P.row * TILE + TILE / 2);
    playDeath();
    hud();
    if (vidas <= 0) setTimeout(fin, 900);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ITEMS, COCINA, CHECKPOINTS, POWER-UPS
  // ═══════════════════════════════════════════════════════════════════════════
  function checkItems() {
    items.forEach(it => {
      if (it.ok) return;
      if (it.col === P.col && it.row === P.row) {
        it.ok = true; itemsLeft--;
        score += 10 * nivel; hud();
        spawnCollectParticles(it.col * TILE + TILE / 2, it.row * TILE + TILE / 2, ING[it.t].c);
        playCollect();
        toast(ING[it.t].e + ' +' + (10 * nivel) + ' pts');
      }
    });

    // Power-ups
    powerupItems.forEach(pu => {
      if (pu.ok) return;
      if (pu.col === P.col && pu.row === P.row) {
        pu.ok = true;
        P.powerups[pu.type] = 6000; // 6 segundos
        if (pu.type === 'doubleJump') P.canDoubleJump = true;
        spawnParticles(pu.col * TILE + TILE / 2, pu.row * TILE + TILE / 2, puColor(pu.type), 12, 100, 500);
        playPowerup();
        const labels = { speed: '⚡ ¡Velocidad!', invincible: '⭐ ¡Invencible!', doubleJump: '✨ ¡Doble salto!' };
        toast(labels[pu.type] || '✨ Power-up!');
      }
    });

    // Checkpoints
    checkpoints.forEach(cp => {
      if (!cp.activated && cp.col === P.col && cp.row === P.row) {
        cp.activated = true;
        P.checkpointCol = cp.col;
        P.checkpointRow = cp.row;
        spawnParticles(cp.col * TILE + TILE / 2, cp.row * TILE + TILE / 2, '#ffdd44', 10, 70, 400);
        toast('📍 Checkpoint guardado');
      }
    });
  }

  function puColor(type) {
    return { speed: '#44ffaa', invincible: '#ffdd44', doubleJump: '#aa44ff' }[type] || '#ffffff';
  }

  function checkCocina() {
    if (itemsLeft > 0 || completando) return;
    if (P.col === 2 && P.row === ROWS - 2) {
      completando = true;
      const bonus = 50 * nivel; score += bonus; nivel++; hud();
      toast('🎉 ¡Nivel completado! +' + bonus + ' pts');
      spawnLevelParticles();
      playLevelComplete();
      shakeAmt = 5;
      // Transición
      transition.active = true;
      transition.timer = 0;
      transition.phase = 'in';
      setTimeout(() => {
        genNivel(nivel); completando = false;
        freezeTimer = 0; _resetFreezeUsos();
        transition.phase = 'out';
        transition.timer = 0;
        const btn = document.getElementById('btnRunFreeze');
        if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = ''; }
      }, 700);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIBUJO DE SPRITES (canvas-drawn spritesheet)
  // ═══════════════════════════════════════════════════════════════════════════

  // Dibuja el jugador con squash & stretch y animación por estado
  function drawPlayer() {
    if (P.dead && Math.floor(Date.now() / 80) % 2 === 0 && P.deadTimer > 300) return;
    if (P.respawnAnim > 0) { P.respawnAnim -= 16; }

    const bx = P.col * TILE;
    const by = P.row * TILE;
    const cx = bx + TILE / 2;
    const cy = by + TILE / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(P.scaleX * P.facingDir, P.scaleY);

    // Invincible flash
    if (P.powerups.invincible && Math.floor(Date.now() / 100) % 2 === 0) {
      ctx.globalAlpha = 0.6;
    }

    const f = P.animFrame;
    const s = P.animState;

    // Paleta
    const bodyCol = P.powerups.invincible ? '#ffdd44' : P.powerups.speed ? '#44ffaa' : COL.P1;
    const bodyCol2 = P.powerups.invincible ? '#cc9900' : P.powerups.speed ? '#22aa77' : COL.P2;

    ctx.translate(-TILE / 2, -TILE / 2);

    if (s === 'death') {
      // Personaje cayendo/muerto
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(3, 8, 14, 7);
      ctx.fillRect(5, 3, 10, 6);
      ctx.fillStyle = '#aa0000';
      ctx.fillRect(7, 5, 2, 2); ctx.fillRect(11, 5, 2, 2);
      ctx.fillRect(5, 13, 4, 6); ctx.fillRect(11, 13, 4, 6);
    } else if (s === 'climb') {
      // Escalera
      ctx.fillStyle = bodyCol; ctx.fillRect(5, 1, 10, 8);
      ctx.fillStyle = bodyCol2; ctx.fillRect(6, 2, 8, 3);
      ctx.fillStyle = bodyCol; ctx.fillRect(3, 8, 14, 7);
      // Brazos abiertos
      ctx.fillStyle = bodyCol2;
      ctx.fillRect(0, 8, 3, 5); ctx.fillRect(17, 8, 3, 5);
      // Piernas alternando
      ctx.fillStyle = bodyCol;
      if (f === 0) { ctx.fillRect(5, 14, 4, 5); ctx.fillRect(11, 14, 4, 4); }
      else { ctx.fillRect(5, 14, 4, 4); ctx.fillRect(11, 14, 4, 5); }
    } else if (s === 'jump' || s === 'fall') {
      // Saltando / cayendo
      ctx.fillStyle = bodyCol; ctx.fillRect(5, 2, 10, 7);
      ctx.fillStyle = bodyCol2; ctx.fillRect(6, 3, 8, 3);
      ctx.fillStyle = bodyCol; ctx.fillRect(3, 9, 14, 6);
      ctx.fillStyle = bodyCol2;
      ctx.fillRect(1, 7, 3, 4); ctx.fillRect(16, 7, 3, 4);
      ctx.fillStyle = bodyCol;
      ctx.fillRect(4, 14, 5, 4); ctx.fillRect(11, 13, 5, 3);
    } else if (s === 'dash') {
      // Dash - postura agresiva
      ctx.fillStyle = bodyCol; ctx.fillRect(4, 3, 12, 7);
      ctx.fillStyle = bodyCol2; ctx.fillRect(5, 4, 10, 3);
      ctx.fillStyle = bodyCol; ctx.fillRect(2, 10, 16, 5);
      ctx.fillStyle = bodyCol2;
      ctx.fillRect(-1, 9, 3, 3); ctx.fillRect(18, 10, 3, 3);
      ctx.fillStyle = bodyCol;
      ctx.fillRect(5, 14, 4, 4); ctx.fillRect(11, 14, 4, 4);
    } else if (s === 'run') {
      // Corriendo
      ctx.fillStyle = bodyCol; ctx.fillRect(5, 1, 10, 8);
      ctx.fillStyle = bodyCol2; ctx.fillRect(6, 2, 8, 3);
      ctx.fillStyle = bodyCol; ctx.fillRect(3, 8, 14, 7);
      ctx.fillStyle = bodyCol2;
      if (f === 0) { ctx.fillRect(1, 9, 3, 5); ctx.fillRect(16, 7, 3, 5); }
      else { ctx.fillRect(1, 7, 3, 5); ctx.fillRect(16, 9, 3, 5); }
      ctx.fillStyle = bodyCol;
      if (f === 0) { ctx.fillRect(4, 14, 5, 5); ctx.fillRect(11, 14, 4, 4); }
      else { ctx.fillRect(4, 14, 4, 4); ctx.fillRect(11, 14, 5, 5); }
    } else {
      // Idle - leve bounce
      const bounce = Math.sin(Date.now() / 400) * 0.3;
      ctx.translate(0, bounce);
      ctx.fillStyle = bodyCol; ctx.fillRect(5, 1, 10, 8);
      ctx.fillStyle = bodyCol2; ctx.fillRect(6, 2, 8, 3);
      ctx.fillStyle = bodyCol; ctx.fillRect(3, 8, 14, 7);
      ctx.fillStyle = bodyCol2;
      ctx.fillRect(1, 9, 3, 5); ctx.fillRect(16, 9, 3, 5);
      ctx.fillStyle = bodyCol;
      ctx.fillRect(5, 14, 4, 5); ctx.fillRect(11, 14, 4, 5);
    }

    // Ojos (siempre)
    ctx.fillStyle = COL.PDARK;
    ctx.fillRect(7, 3, 2, 2); ctx.fillRect(11, 3, 2, 2);
    ctx.fillStyle = '#ffffff88';
    ctx.fillRect(7, 3, 1, 1); ctx.fillRect(11, 3, 1, 1);
    ctx.fillStyle = COL.PDARK; ctx.fillRect(8, 7, 4, 1);

    // Indicador power-up encima de la cabeza
    const activePU = Object.keys(P.powerups)[0];
    if (activePU) {
      ctx.font = '8px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const icons = { speed: '⚡', invincible: '⭐', doubleJump: '✨' };
      ctx.fillText(icons[activePU] || '✨', TILE / 2, 0);
    }

    ctx.restore();
  }

  // Dibuja un enemigo con animación
  function drawEnemy(e, frozen) {
    const frozenVis = frozen ? Math.floor(Date.now() / 150) % 2 === 0 : false;
    const x = e.col * TILE, y = e.row * TILE;
    const f = e.animFrame || 0;

    ctx.save();

    // Alert glow
    if ((e.alertTimer || 0) > 200) {
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur = 8;
    }

    ctx.fillStyle = frozen ? (frozenVis ? '#5599ff' : '#3377dd') : COL.ENE;
    // Torso
    ctx.fillRect(x + 3, y + 1, 14, 12);
    ctx.fillRect(x + 2, y + 12, 16, 5);
    // Piernas
    if (f === 0) { ctx.fillRect(x + 3, y + 16, 5, 4); ctx.fillRect(x + 12, y + 16, 5, 4); }
    else { ctx.fillRect(x + 3, y + 16, 5, 3); ctx.fillRect(x + 12, y + 17, 5, 3); }
    // Ojos
    ctx.fillStyle = frozen ? '#224488' : COL.ENE2;
    ctx.fillRect(x + 6, y + 4, 3, 3); ctx.fillRect(x + 11, y + 4, 3, 3);
    ctx.fillRect(x + 8, y + 9, 4, 2);
    // Alerta visual
    if ((e.alertTimer || 0) > 300) {
      ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#ff4444';
      ctx.fillText('!', x + TILE / 2, y);
    }
    if (frozen) {
      ctx.font = '9px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('❄️', x + TILE / 2, y);
    }

    ctx.restore();
  }

  // Tiles con estética de ingredientes (pan / madera / metal)
  function drawTile(r, c, t) {
    const x = c * TILE, y = r * TILE;
    const niv = nivel;

    if (t === T.SUELO) {
      // Alterna estética por nivel: pan → madera → metal
      if (niv % 3 === 1) {
        // Pan (dorado)
        ctx.fillStyle = '#4a2e08'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#D4A056'; ctx.fillRect(x, y, TILE, 3);
        ctx.fillStyle = '#8B5E1A'; ctx.fillRect(x, y + 3, TILE, TILE - 5);
        ctx.fillStyle = '#0d0a04'; ctx.fillRect(x, y + TILE - 2, TILE, 2);
        // Semillas
        ctx.fillStyle = '#c8952a';
        ctx.fillRect(x + 3, y + 6, 2, 2);
        ctx.fillRect(x + 9, y + 9, 2, 2);
        ctx.fillRect(x + 15, y + 6, 2, 2);
      } else if (niv % 3 === 2) {
        // Madera (naranja)
        ctx.fillStyle = '#2a1a08'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#d4831a'; ctx.fillRect(x, y, TILE, 3);
        ctx.fillStyle = '#5c320f'; ctx.fillRect(x, y + 3, TILE, TILE - 5);
        ctx.fillStyle = '#1a0a00'; ctx.fillRect(x, y + TILE - 2, TILE, 2);
        // Veta
        ctx.strokeStyle = '#7a4a1f'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + 4, y + TILE - 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 12, y + 4); ctx.lineTo(x + 12, y + TILE - 3); ctx.stroke();
      } else {
        // Metal (turquesa)
        ctx.fillStyle = COL.SUELO; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = COL.SUELO_TOP; ctx.fillRect(x, y, TILE, 3);
        ctx.fillStyle = '#1a4545'; ctx.fillRect(x + 1, y + 4, TILE - 2, TILE - 8);
        ctx.fillStyle = '#0d2020'; ctx.fillRect(x, y + TILE - 2, TILE, 2);
        // Remaches
        ctx.fillStyle = '#3dbfb8';
        ctx.fillRect(x + 2, y + 7, 2, 2); ctx.fillRect(x + 16, y + 7, 2, 2);
      }
    } else if (t === T.ESC || t === T.ESC_S) {
      if (t === T.ESC_S) {
        ctx.fillStyle = '#0d1f1f'; ctx.fillRect(x, y, TILE, TILE);
      }
      ctx.strokeStyle = COL.ESC; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 5, y); ctx.lineTo(x + 5, y + TILE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 15, y); ctx.lineTo(x + 15, y + TILE); ctx.stroke();
      ctx.lineWidth = 1.5;
      for (let py = 2; py < TILE; py += 5) {
        ctx.beginPath(); ctx.moveTo(x + 5, y + py); ctx.lineTo(x + 15, y + py); ctx.stroke();
      }
    } else if (t === T.COCINA) {
      ctx.fillStyle = COL.COCINA; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = COL.COCINA_B; ctx.fillRect(x, y, TILE, 3);
      ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🍔', x + TILE / 2, y + TILE / 2);
    }
  }

  // Dibuja power-up pickup con pulso
  function drawPowerups(dt) {
    powerupItems.forEach(pu => {
      if (pu.ok) return;
      pu.pulseTimer = (pu.pulseTimer || 0) + (dt || 16);
      const pulse = 0.75 + 0.25 * Math.sin(pu.pulseTimer / 180);
      const x = pu.col * TILE + TILE / 2;
      const y = pu.row * TILE + TILE / 2;
      const col = puColor(pu.type);
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 10 * pulse;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, 7 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '10px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const icons = { speed: '⚡', invincible: '⭐', doubleJump: '✨' };
      ctx.fillText(icons[pu.type] || '✨', x, y);
      ctx.restore();
    });
  }

  // Dibuja checkpoints
  function drawCheckpoints() {
    checkpoints.forEach(cp => {
      if (cp.activated) return;
      const x = cp.col * TILE + TILE / 2;
      const y = cp.row * TILE + TILE / 2;
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffdd44';
      ctx.font = '14px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('📍', x, y);
      ctx.restore();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIBUJO PRINCIPAL
  // ═══════════════════════════════════════════════════════════════════════════
  let lastDt = 16;

  function draw(dt) {
    if (!ctx) return;
    lastDt = dt || lastDt;

    const W = canvas.width, H = canvas.height;

    // Screen shake
    const shakeX = shakeAmt > 0.3 ? (Math.random() - 0.5) * shakeAmt * 2 : 0;
    const shakeY = shakeAmt > 0.3 ? (Math.random() - 0.5) * shakeAmt * 2 : 0;
    shakeAmt *= shakeDecay;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Fondo
    ctx.fillStyle = COL.BG; ctx.fillRect(0, 0, W, H);
    drawParallax();

    // Offset de cámara para todo el mundo
    const camOffsetY = -Math.round(camRow * TILE);
    ctx.save();
    ctx.translate(0, camOffsetY);

    // Tiles (solo los visibles)
    const rMin = Math.max(0, Math.floor(camRow) - 1);
    const rMax = Math.min(ROWS - 1, Math.ceil(camRow + VISIBLE_ROWS) + 1);
    for (let r = rMin; r <= rMax; r++) for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t !== T.VACIO) drawTile(r, c, t);
    }

    // Ingredientes con bob
    items.forEach(it => {
      if (it.ok) return;
      it.bobTimer = (it.bobTimer || 0) + (dt || 16) / 1000;
      const bob = Math.sin(it.bobTimer * 2.5) * 2;
      const x = it.col * TILE + TILE / 2, y = it.row * TILE + TILE / 2 + bob;
      const ing = ING[it.t];
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = ing.c + '55'; ctx.fill();
      ctx.strokeStyle = ing.c; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = '12px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ing.e, x, y);
    });

    drawCheckpoints();
    drawPowerups(dt);

    // Enemigos
    const frozen = freezeTimer > 0;
    enemies.forEach(e => drawEnemy(e, frozen));

    // Halo de luz
    if (!P.dead) drawLightHalo();

    // Jugador
    drawPlayer();

    // Partículas
    drawParticles();

    ctx.restore(); // fin offset cámara

    // Banner inferior
    ctx.font = '9px monospace';
    if (itemsLeft === 0) {
      ctx.fillStyle = 'rgba(212,131,26,0.92)';
      ctx.fillRect(W / 2 - 95, 1, 190, 15);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('¡Llevá todo a la cocina 🍔! (abajo izquierda)', W / 2, 3);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(W - 96, 1, 95, 14);
      ctx.fillStyle = '#3dbfb8'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('🍔 ×' + itemsLeft + ' pendientes', W - 2, 3);
    }

    // Pausa overlay
    if (estado === 'pausa') {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#3dbfb8'; ctx.font = 'bold 26px Righteous,cursive';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('PAUSA', W / 2, H / 2);
      ctx.font = '13px Nunito,sans-serif'; ctx.fillStyle = '#aaa';
      ctx.fillText('Presioná P o tocá Reanudar', W / 2, H / 2 + 32);
    }

    // Transición de nivel
    if (transition.active) {
      transition.timer += dt || 16;
      const prog = Math.min(transition.timer / transition.duration, 1);
      const alpha = transition.phase === 'in' ? prog : 1 - prog;
      ctx.fillStyle = `rgba(8,12,16,${alpha})`;
      ctx.fillRect(0, 0, W, H);
      if (transition.phase === 'in' && prog > 0.4) {
        ctx.fillStyle = `rgba(61,191,184,${(prog - 0.4) / 0.6})`;
        ctx.font = 'bold 30px Righteous,cursive';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('NIVEL ' + nivel, W / 2, H / 2);
      }
      if (transition.phase === 'out' && prog >= 1) transition.active = false;
      if (transition.phase === 'in' && prog >= 1) { transition.phase = 'out'; transition.timer = 0; }
    }

    if (estado === 'fin') drawFin();

    ctx.restore();
  }

  function drawFin() {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.87)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff4d4d'; ctx.font = 'bold 28px Righteous,cursive';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 54);
    ctx.fillStyle = '#3dbfb8'; ctx.font = 'bold 17px Righteous,cursive';
    ctx.fillText('Puntos: ' + score, W / 2, H / 2 - 16);
    ctx.fillStyle = '#d4831a'; ctx.font = '13px Righteous,cursive';
    ctx.fillText('Récord: ' + hiScore, W / 2, H / 2 + 10);
    ctx.fillText('Nivel: ' + nivel, W / 2, H / 2 + 30);
    ctx.fillStyle = '#555'; ctx.font = '10px monospace';
    ctx.fillText('Tocá Reiniciar para jugar de nuevo', W / 2, H / 2 + 60);
  }

  // ── Pantalla de inicio animada ─────────────────────────────────────────────
  function drawIdle() {
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const now = Date.now();

    ctx.fillStyle = COL.BG; ctx.fillRect(0, 0, W, H);
    drawParallax();

    // Partículas de título
    idleAnimTimer += 16;
    if (idleAnimTimer > 120) {
      idleAnimTimer = 0;
      titleParticles.push({
        x: W / 2 + (Math.random() - 0.5) * 160,
        y: H * 0.38,
        vx: (Math.random() - 0.5) * 40,
        vy: -40 - Math.random() * 30,
        life: 1200, maxLife: 1200,
        color: Math.random() < 0.5 ? '#3dbfb8' : '#d4831a',
        size: 2 + Math.random() * 3,
        gravity: 20,
      });
    }
    // Update & draw
    const dtS = 0.016;
    titleParticles = titleParticles.filter(p => p.life > 0);
    titleParticles.forEach(p => {
      p.x += p.vx * dtS; p.y += p.vy * dtS;
      p.vy += p.gravity * dtS; p.life -= 16;
      const a = p.life / p.maxLife;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.size * a), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // Logo
    const pulse = 1 + 0.04 * Math.sin(now / 500);
    ctx.save();
    ctx.translate(W / 2, H * 0.28);
    ctx.scale(pulse, pulse);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 38px Righteous,cursive';
    ctx.fillStyle = '#d4831a';
    ctx.shadowColor = '#d4831a'; ctx.shadowBlur = 18;
    ctx.fillText('MORDELÓN', 0, 0);
    ctx.fillStyle = '#3dbfb8';
    ctx.shadowColor = '#3dbfb8'; ctx.shadowBlur = 14;
    ctx.font = 'bold 22px Righteous,cursive';
    ctx.fillText('RUN', 0, 34);
    ctx.restore();

    // Personaje animado idle
    idleAnim = (idleAnim + 0.08) % (Math.PI * 2);
    const pX = W / 2, pY = H * 0.55 + Math.sin(idleAnim) * 5;
    ctx.save(); ctx.translate(pX, pY);
    ctx.fillStyle = COL.P1; ctx.fillRect(-10, -10, 20, 15);
    ctx.fillStyle = COL.P2; ctx.fillRect(-9, -9, 18, 6);
    ctx.fillStyle = COL.PDARK; ctx.fillRect(-4, -6, 3, 3); ctx.fillRect(1, -6, 3, 3);
    ctx.fillStyle = COL.P1; ctx.fillRect(-11, 5, 22, 8);
    ctx.fillRect(-8, 12, 5, 6); ctx.fillRect(3, 12, 5, 6);
    ctx.restore();

    // Instrucciones
    const blinkAlpha = 0.5 + 0.5 * Math.sin(now / 400);
    ctx.save();
    ctx.globalAlpha = blinkAlpha;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Nunito,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SPACE o TAP para comenzar', W / 2, H * 0.76);
    ctx.restore();

    ctx.fillStyle = '#555';
    ctx.font = '11px Nunito,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('← → para moverse   ↑ ↓ para escalar', W / 2, H * 0.84);
    ctx.fillText('Doble tap: Dash   B: Congelar enemigos', W / 2, H * 0.90);

    requestAnimationFrame(drawIdle);
    // Solo continua si sigue en parado
    if (estado !== 'parado') return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOOP PRINCIPAL
  // ═══════════════════════════════════════════════════════════════════════════
  // ── Cámara suave ──────────────────────────────────────────────────────────
  function actualizarCamara(dt) {
    // La cámara sigue al jugador verticalmente con lerp suave.
    // Queremos mostrar al jugador centrado verticalmente en el canvas.
    const playerScreenRow = P.row - camRow;
    const center = VISIBLE_ROWS / 2;
    // Si el jugador sale del tercio central, mover la cámara
    if (playerScreenRow < center - 3) camRowTarget = P.row - (center - 3);
    if (playerScreenRow > center + 3) camRowTarget = P.row - (center + 3);
    // Clamp: no mostrar fuera del mundo
    camRowTarget = Math.max(0, Math.min(ROWS - VISIBLE_ROWS, camRowTarget));
    // Lerp suave
    camRow += (camRowTarget - camRow) * Math.min(dt * 0.008, 1);
  }

  function loop(ts) {
    if (estado !== 'jugando') return;
    const dt = Math.min(ts - lastTs, 80); lastTs = ts;
    updateParticles(dt);
    moverP(dt);
    actualizarCamara(dt);
    moverEne(dt);
    checkItems();
    checkCocina();
    draw(dt);
    loopId = requestAnimationFrame(loop);
  }

  function fin() {
    estado = 'fin'; cancelAnimationFrame(loopId);
    if (score > hiScore) {
      hiScore = score;
      localStorage.setItem('runHiC', hiScore);
      if (typeof window.notificarRecordJuego === 'function') window.notificarRecordJuego('run', hiScore);
    }
    const _pts = score;
    draw(lastDt);
    score = 0; hud();
    if (typeof window.actualizarBarraRecompensa === 'function') window.actualizarBarraRecompensa();
    setTimeout(() => { if (typeof window.abrirLeaderboard === 'function') window.abrirLeaderboard('run', _pts); }, 1200);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HUD / TOAST
  // ═══════════════════════════════════════════════════════════════════════════
  function hud() {
    const upd = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    upd('runScore', score); upd('runHi', hiScore);
    upd('runLives', '❤️'.repeat(Math.max(vidas, 0))); upd('runLevel', nivel);
  }
  let _tt = null;
  function toast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    const el = document.getElementById('runToast');
    if (!el) return;
    el.textContent = msg; el.style.opacity = '1';
    clearTimeout(_tt); _tt = setTimeout(() => { if (el) el.style.opacity = '0'; }, 2000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROLES — sin input lag
  // ═══════════════════════════════════════════════════════════════════════════
  function onKD(e) {
    if (estado === 'parado') {
      if (e.key === ' ' || e.key === 'Enter') { iniciarJuego(); return; }
    }
    if (estado !== 'jugando') return;
    const wasDown = keysDown[e.key];
    keysDown[e.key] = true;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'b' || e.key === 'B') window.runFreeze();
    if (e.key === 'p' || e.key === 'P') window.runPause();

    // Solo en la primera pulsación — ignorar autorepeat del browser
    if (!wasDown) {
      // Dash: detectar doble tap
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') checkDoubleTap(-1);
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') checkDoubleTap(1);

      // Aplicar movimiento instantáneo (sin esperar pTimer)
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { P.dx = -1; P.dy = 0; pTimer = P_SPD; }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { P.dx = 1; P.dy = 0; pTimer = P_SPD; }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { P.dy = -1; P.dx = 0; pTimer = P_SPD; }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { P.dy = 1; P.dx = 0; pTimer = P_SPD; }
    }
  }

  function checkDoubleTap(dir) {
    const now = Date.now();
    if (lastTapDir.dir === dir && now - lastTapDir.time < 280) {
      // Dash!
      if (P.dashCooldown <= 0) {
        P.dashTimer = 200;
        P.dashCooldown = 800;
        playDash();
        P.scaleX = 1.5 * dir; // stretch horizontal
        P.scaleY = 0.7;
      }
      lastTapDir = { dir: null, time: 0 };
    } else {
      lastTapDir = { dir, time: now };
    }
  }

  function onKU(e) { delete keysDown[e.key]; }

  function onTS(e) {
    if (estado === 'parado') { iniciarJuego(); return; }
    if (e.touches.length) touchSt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTE(e) {
    if (!touchSt || estado !== 'jugando') { touchSt = null; return; }
    const dx = e.changedTouches[0].clientX - touchSt.x;
    const dy = e.changedTouches[0].clientY - touchSt.y;
    touchSt = null;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    if (Math.abs(dy) > Math.abs(dx)) { P.dy = dy > 0 ? 1 : -1; P.dx = 0; }
    else { P.dx = dx > 0 ? 1 : -1; P.dy = 0; }
    pTimer = P_SPD;
  }

  function iniciarJuego() {
    initAudio();
    window.runReset();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FREEZE CONFIG
  // ═══════════════════════════════════════════════════════════════════════════
  function _actualizarBtnFreeze() {
    const btn = document.getElementById('btnRunFreeze');
    if (!btn) return;
    if (FREEZE_USOS === 0) {
      btn.textContent = '❄️';
      btn.title = 'Congelar enemigos (∞)';
    } else {
      btn.textContent = '❄️ ×' + freezeUsosRestantes;
      btn.title = 'Congelar enemigos (' + freezeUsosRestantes + ' usos)';
      btn.style.opacity = freezeUsosRestantes > 0 ? '1' : '0.35';
    }
  }

  function _resetFreezeUsos() {
    freezeUsosRestantes = FREEZE_USOS === 0 ? Infinity : FREEZE_USOS;
    _actualizarBtnFreeze();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA — compatibilidad con juego-selector.js
  // ═══════════════════════════════════════════════════════════════════════════

  window.setRunFreezeConfig = function (dur, usos) {
    FREEZE_DUR = dur != null ? dur : 1500;
    FREEZE_USOS = usos != null ? usos : 0;
    _resetFreezeUsos();
    _actualizarBtnFreeze();
  };

  window.setRunDificultad = function (n) {
    runDificultad = Math.max(0, Math.min(4, n));
  };

  window.runFreeze = function () {
    if (estado !== 'jugando') return;
    if (freezeUsosRestantes <= 0) { toast('❄️ Sin usos disponibles'); return; }
    freezeTimer = FREEZE_DUR;
    if (FREEZE_USOS > 0) { freezeUsosRestantes--; }
    _actualizarBtnFreeze();
    const seg = (FREEZE_DUR / 1000).toFixed(1);
    toast('❄️ ¡Congelados! ' + seg + 's' + (FREEZE_USOS > 0 ? ' · ' + freezeUsosRestantes + ' restantes' : ''));
  };

  // Cooldown para evitar doble disparo touchstart+click en botones móviles
  let _btnCooldown = 0;
  function _btnMove(fn) {
    const now = Date.now();
    if (now - _btnCooldown < 80) return; // ignorar el click sintético
    _btnCooldown = now;
    fn();
  }

  window.runDir = function (dx, dy) {
    if (estado === 'jugando') { P.dx = dx; P.dy = dy; pTimer = P_SPD; }
  };
  window.runJump = function () {
    // En este juego tile-based "saltar" = moverse arriba en escalera
    if (estado === 'jugando') { P.dy = -1; P.dx = 0; pTimer = P_SPD; }
  };
  window.runMoverIzq    = function () { if (estado === 'jugando') { P.dx = -1; P.dy = 0; pTimer = P_SPD; } };
  window.runMoverDer    = function () { if (estado === 'jugando') { P.dx =  1; P.dy = 0; pTimer = P_SPD; } };
  window.runMoverArriba = function () { if (estado === 'jugando') { P.dy = -1; P.dx = 0; pTimer = P_SPD; } };
  window.runMoverAbajo  = function () { if (estado === 'jugando') { P.dy =  1; P.dx = 0; pTimer = P_SPD; } };

  window.runPause = function () {
    if (estado === 'jugando') { estado = 'pausa'; draw(lastDt); }
    else if (estado === 'pausa') { estado = 'jugando'; lastTs = performance.now(); loopId = requestAnimationFrame(loop); }
    const btn = document.getElementById('btnRunPausa');
    if (btn) btn.textContent = estado === 'pausa' ? '▶ Reanudar' : '⏸ Pausa';
  };

  window.runReset = function () {
    cancelAnimationFrame(loopId); keysDown = {};
    score = 0; vidas = 3; nivel = 1; estado = 'jugando'; completando = false;
    camRow = ROWS - VISIBLE_ROWS; camRowTarget = camRow;
    freezeTimer = 0; _resetFreezeUsos();
    particles = []; shakeAmt = 0;
    P.checkpointCol = 5; P.checkpointRow = ROWS - 2;
    genNivel(nivel); hud();
    const btnP = document.getElementById('btnRunPausa');
    if (btnP) btnP.textContent = '⏸ Pausa';
    const btnF = document.getElementById('btnRunFreeze');
    if (btnF) { btnF.style.opacity = '1'; btnF.style.pointerEvents = ''; }
    lastTs = performance.now();
    loopId = requestAnimationFrame(loop);
  };

  window.runInit = function () {
    canvas = document.getElementById('runCanvas');
    if (!canvas) { console.error('[runInit] #runCanvas no encontrado'); return; }
    ctx = canvas.getContext('2d');
    hiScore = parseInt(localStorage.getItem('runHiC') || '0');
    _resetFreezeUsos();
    initParallax();

    document.removeEventListener('keydown', onKD);
    document.removeEventListener('keyup', onKU);
    canvas.removeEventListener('touchstart', onTS);
    canvas.removeEventListener('touchend', onTE);
    document.addEventListener('keydown', onKD);
    document.addEventListener('keyup', onKU);
    canvas.addEventListener('touchstart', onTS, { passive: true });
    canvas.addEventListener('touchend', onTE);

    // Pantalla de inicio animada — esperar tap/Space
    camRow = ROWS - VISIBLE_ROWS; camRowTarget = camRow;
    estado = 'parado';
    drawIdle();
  };

  // Compatibilidad con juego-selector.js
  Object.defineProperty(window, 'runRunning', {
    get: () => estado === 'jugando',
    configurable: true,
    enumerable: true,
  });

})();
