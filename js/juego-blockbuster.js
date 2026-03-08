// ===================== BLOCKBUSTER — MORDELÓN =====================
const BBC  = document.getElementById('blockCanvas');
const BBX  = BBC.getContext('2d');
const BBW  = 320, BBH = 420;
const PADDLE_W_BASE = 64, PADDLE_H = 12;
const BALL_R = 7;
const ROWS = 6, COLS = 8;
const BLOCK_W = Math.floor((BBW - 20) / COLS);
const BLOCK_H = 18;
const BLOCK_PAD = 2;
const BLOCK_TOP = 48;

let bbScore, bbHi = parseInt(localStorage.getItem('bbHiC') || '0');
let bbLives, bbLevel, bbRunning, bbPaused, bbOver, bbWaiting;
let bbBalls, bbPaddle, bbBlocks, bbPowerUps, bbAnimFrame;
let bbDificultad = 1; // 0-4

// ── Dificultad ───────────────────────────────────────────────────────────────
const BB_SPEEDS     = [3.2, 4.0, 5.0, 6.2, 7.8];
const BB_SPEED_INC  = [0.08, 0.12, 0.18, 0.25, 0.35]; // por nivel
const BB_MULTI_BALL_PROB = [0, 0, 0.15, 0.25, 0.4];   // chance bloque da multiball

window.setBlockbusterDificultad = function(v) {
  bbDificultad = Math.max(0, Math.min(4, v));
  // Solo ajustar bolas si el juego está corriendo activamente
  if (!bbRunning || bbPaused || bbOver || bbEnEspera) return;
  if (!bbBalls || !bbBalls.length) return;
  const targetSpeed = BB_SPEEDS[bbDificultad];
  bbBalls.forEach(b => {
    if (b.stuck) return;
    const cur = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
    if (cur < 0.1) return;
    const factor = targetSpeed / cur;
    b.vx *= factor;
    b.vy *= factor;
  });
};

// ── Ingredientes / bloques ───────────────────────────────────────────────────
const BB_INGREDIENTES = [
  { emoji:'🍞', color:'#C8903A', hp:1 },
  { emoji:'🧀', color:'#FFD700', hp:1 },
  { emoji:'🥬', color:'#4CAF50', hp:1 },
  { emoji:'🍅', color:'#E53935', hp:1 },
  { emoji:'🥩', color:'#E57373', hp:1 },
  { emoji:'🧅', color:'#CE93D8', hp:1 },
  { emoji:'🥒', color:'#66BB6A', hp:1 },
  { emoji:'🥓', color:'#D4831A', hp:2 }, // resistente — necesita 2 golpes
  { emoji:'🧆', color:'#8D6E63', hp:3 }, // muy resistente
];

// ── Power-ups ────────────────────────────────────────────────────────────────
// tipo: 'wide' | 'narrow' | 'multi' | 'slow' | 'fast' | 'fire' | 'sticky' | 'life'
const BB_PU_DEFS = [
  { tipo:'wide',   emoji:'🥪', label:'Paleta grande',  color:'#3DBFB8', weight:20 },
  { tipo:'multi',  emoji:'🔥', label:'Multi-bola',     color:'#FF6B35', weight:15 },
  { tipo:'slow',   emoji:'🧊', label:'Cámara lenta',   color:'#5599ff', weight:15 },
  { tipo:'fire',   emoji:'💥', label:'Bola de fuego',  color:'#FFD700', weight:12 },
  { tipo:'sticky', emoji:'🍯', label:'Paleta pegajosa',color:'#D4831A', weight:12 },
  { tipo:'life',   emoji:'❤️', label:'+1 vida',        color:'#FF4D4D', weight:8  },
  { tipo:'laser',  emoji:'⚡', label:'Láser',          color:'#FFE066', weight:10 },
  { tipo:'narrow', emoji:'🌶️', label:'Paleta chica',   color:'#888',    weight:8  },
  { tipo:'fast',   emoji:'🚀', label:'Turbo',          color:'#A855F7', weight:8  },
];

function bbRandPU() {
  const total = BB_PU_DEFS.reduce((s, d) => s + d.weight, 0);
  let r = Math.random() * total;
  for (const d of BB_PU_DEFS) { r -= d.weight; if (r <= 0) return { ...d }; }
  return { ...BB_PU_DEFS[0] };
}

// ── Estado de power-ups activos ───────────────────────────────────────────────
let bbPUActive = {};
let bbLasers   = [];
let bbStickyBall = null; // bola pegada a paleta esperando lanzamiento
let bbSpeedAntesSlow = 0; // guarda speed base antes de aplicar slow/fast

// ── Init ─────────────────────────────────────────────────────────────────────
function bbInit() {
  bbScore = 0; bbLives = 3; bbLevel = 1;
  bbRunning = true; bbPaused = false; bbOver = false; bbWaiting = false;
  bbPUActive = {};
  bbLasers   = [];
  bbStickyBall = null;
  bbSpeedAntesSlow = 0;
  document.getElementById('bbScore').textContent  = 0;
  document.getElementById('bbHi').textContent     = bbHi;
  document.getElementById('bbLevel').textContent  = 1;
  document.getElementById('bbLives').textContent  = '❤️'.repeat(bbLives);
  bbMakePaddle();
  bbBalls = [];
  bbMakeBall(true);
  bbMakeBlocks(1);
  bbPowerUps = [];
  cancelAnimationFrame(bbAnimFrame);
  bbLoop();
}

function bbMakePaddle() {
  const w = bbPUActive.wide ? PADDLE_W_BASE * 1.7
           : bbPUActive.narrow ? PADDLE_W_BASE * 0.55
           : PADDLE_W_BASE;
  bbPaddle = { x: BBW/2 - w/2, y: BBH - 30, w, h: PADDLE_H };
}

function bbMakeBall(fromPaddle = false) {
  const speed = BB_SPEEDS[bbDificultad] + (bbLevel - 1) * BB_SPEED_INC[bbDificultad];
  const ang   = -Math.PI/2 + (Math.random() - 0.5) * (Math.PI/4);
  const ball  = {
    x: fromPaddle ? bbPaddle.x + bbPaddle.w/2 : BBW/2,
    y: fromPaddle ? bbPaddle.y - BALL_R - 1    : BBH * 0.6,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    fire: !!bbPUActive.fire,
    stuck: fromPaddle,
  };
  if (!bbBalls) bbBalls = [];
  bbBalls.push(ball);
  if (fromPaddle) bbStickyBall = ball;
}

function bbMakeBlocks(level) {
  bbBlocks = [];
  // Patrones por nivel
  const patterns = [
    // nivel 1 — filas simples
    null,
    // nivel 2 — tablero
    null,
    // nivel 3 — diamante
    null,
  ];
  const rows = Math.min(ROWS, 4 + Math.floor(level / 2));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < COLS; c++) {
      // Algunos bloques resistentes en niveles altos
      let ing;
      if (level >= 4 && Math.random() < 0.2) ing = BB_INGREDIENTES[8]; // muy resist
      else if (level >= 2 && Math.random() < 0.15) ing = BB_INGREDIENTES[7]; // resist
      else ing = BB_INGREDIENTES[Math.floor(Math.random() * 7)];

      // Power-up embebido (25% chance)
      const hasPU = Math.random() < 0.25;

      bbBlocks.push({
        x: 10 + c * BLOCK_W,
        y: BLOCK_TOP + r * (BLOCK_H + BLOCK_PAD),
        w: BLOCK_W - BLOCK_PAD,
        h: BLOCK_H,
        hp: ing.hp,
        maxHp: ing.hp,
        emoji: ing.emoji,
        color: ing.color,
        pu: hasPU ? bbRandPU() : null,
        alive: true,
      });
    }
  }
}

// ── Loop principal ────────────────────────────────────────────────────────────
function bbLoop() {
  if (!bbRunning) return;
  if (!bbPaused) bbUpdate();
  bbDraw();
  bbAnimFrame = requestAnimationFrame(bbLoop);
}

function bbUpdate() {
  // Movimiento continuo por teclado
  const KSPD = 7;
  if (bbKeys['ArrowLeft'])  bbMovePaddle(bbPaddle.x + bbPaddle.w/2 - KSPD);
  if (bbKeys['ArrowRight']) bbMovePaddle(bbPaddle.x + bbPaddle.w/2 + KSPD);

  // Timers de power-ups
  if (bbPUActive.slow)   { bbPUActive.slow--;   if (!bbPUActive.slow)   bbRestoreSpeed(); }
  if (bbPUActive.fast)   { bbPUActive.fast--;   if (!bbPUActive.fast)   bbRestoreSpeed(); }
  if (bbPUActive.fire)   { bbPUActive.fire--;   if (!bbPUActive.fire)   bbBalls.forEach(b => b.fire = false); }
  if (bbPUActive.sticky) { bbPUActive.sticky--; }
  if (bbPUActive.laser)  { bbPUActive.laser--;  }
  if (bbPUActive.wide)   { bbPUActive.wide--;   if (!bbPUActive.wide)   bbMakePaddle(); }
  if (bbPUActive.narrow) { bbPUActive.narrow--; if (!bbPUActive.narrow) bbMakePaddle(); }

  // Mover lásers
  bbLasers = bbLasers.filter(l => l.y > 0);
  bbLasers.forEach(l => l.y -= 8);
  bbLasers.forEach(l => {
    bbBlocks.forEach(b => {
      if (!b.alive) return;
      if (l.x > b.x && l.x < b.x+b.w && l.y > b.y && l.y < b.y+b.h) {
        l.dead = true;
        bbHitBlock(b);
      }
    });
  });
  bbLasers = bbLasers.filter(l => !l.dead);

  // Mover bolas
  bbBalls.forEach(ball => {
    if (ball.stuck) return;

    ball.x += ball.vx;
    ball.y += ball.vy;

    // Paredes
    if (ball.x - BALL_R < 0)   { ball.x = BALL_R;       ball.vx = Math.abs(ball.vx); }
    if (ball.x + BALL_R > BBW)  { ball.x = BBW - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y - BALL_R < 0)   { ball.y = BALL_R;        ball.vy = Math.abs(ball.vy); }

    // Paleta
    if (ball.vy > 0 &&
        ball.x > bbPaddle.x && ball.x < bbPaddle.x + bbPaddle.w &&
        ball.y + BALL_R > bbPaddle.y && ball.y + BALL_R < bbPaddle.y + bbPaddle.h + 8) {
      ball.y = bbPaddle.y - BALL_R;
      if (bbPUActive.sticky) {
        ball.stuck = true;
        bbStickyBall = ball;
      } else {
        // Ángulo según dónde golpeó la paleta
        const rel = (ball.x - (bbPaddle.x + bbPaddle.w/2)) / (bbPaddle.w/2);
        const ang = rel * (Math.PI * 0.35);
        const spd = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
        ball.vx = Math.sin(ang) * spd;
        ball.vy = -Math.abs(Math.cos(ang) * spd);
      }
    }

    // Bloques
    for (const b of bbBlocks) {
      if (!b.alive) continue;
      if (ball.x + BALL_R > b.x && ball.x - BALL_R < b.x+b.w &&
          ball.y + BALL_R > b.y && ball.y - BALL_R < b.y+b.h) {
        if (!ball.fire) {
          // Rebote — determinar lado
          const fromLeft  = ball.x < b.x;
          const fromRight = ball.x > b.x + b.w;
          if (fromLeft || fromRight) ball.vx *= -1; else ball.vy *= -1;
        }
        bbHitBlock(b, ball);
        if (!ball.fire) break;
      }
    }

    // Perdió bola
    if (ball.y - BALL_R > BBH) { ball.dead = true; }
  });

  bbBalls = bbBalls.filter(b => !b.dead);
  if (bbBalls.length === 0) bbLoseLife();

  // Power-ups cayendo
  bbPowerUps.forEach(pu => { pu.y += 2.2; });
  bbPowerUps = bbPowerUps.filter(pu => {
    if (pu.y > BBH) return false;
    // Colisión con paleta
    if (pu.y + 10 > bbPaddle.y && pu.x > bbPaddle.x && pu.x < bbPaddle.x + bbPaddle.w) {
      bbApplyPU(pu.tipo);
      return false;
    }
    return true;
  });

  // Nivel completo
  if (bbBlocks.every(b => !b.alive)) bbNextLevel();
}

function bbHitBlock(b, ball) {
  b.hp--;
  if (b.hp <= 0) {
    b.alive = false;
    const pts = b.maxHp * 10 * bbLevel;
    bbScore += pts;
    document.getElementById('bbScore').textContent = bbScore;
    if (bbScore > bbHi) {
      bbHi = bbScore;
      localStorage.setItem('bbHiC', bbHi);
      document.getElementById('bbHi').textContent = bbHi;
      if (typeof window.notificarRecordJuego === 'function') window.notificarRecordJuego('blockbuster', bbHi);
    }
    if (typeof window.actualizarBarraRecompensa === 'function') window.actualizarBarraRecompensa();
    // Soltar power-up
    if (b.pu) bbPowerUps.push({ x: b.x + b.w/2, y: b.y + b.h, ...b.pu });
    // Multiball en dificultades altas
    if (ball && Math.random() < BB_MULTI_BALL_PROB[bbDificultad]) bbSpawnExtraBall();
  }
}

function bbSpawnExtraBall() {
  if (bbBalls.length >= 5) return;
  const ref = bbBalls[0];
  if (!ref) return;
  const speed = Math.sqrt(ref.vx*ref.vx + ref.vy*ref.vy);
  const ang = Math.atan2(ref.vy, ref.vx) + (Math.random()-0.5)*0.8;
  bbBalls.push({ x:ref.x, y:ref.y, vx:Math.cos(ang)*speed, vy:Math.sin(ang)*speed, fire:ref.fire, stuck:false });
}

function bbApplyPU(tipo) {
  const DUR = 420; // ~7s a 60fps
  bbShowToast(BB_PU_DEFS.find(d=>d.tipo===tipo)?.emoji + ' ' + BB_PU_DEFS.find(d=>d.tipo===tipo)?.label);
  switch(tipo) {
    case 'wide':
      bbPUActive.narrow = 0;
      bbPUActive.wide   = DUR;
      bbMakePaddle();
      break;
    case 'narrow':
      bbPUActive.wide   = 0;
      bbPUActive.narrow = DUR;
      bbMakePaddle();
      break;
    case 'multi':
      for (let i=0; i<2; i++) bbSpawnExtraBall();
      break;
    case 'slow':
      if (!bbPUActive.slow && !bbPUActive.fast) bbSpeedAntesSlow = _bbGetSpeed();
      bbPUActive.fast = 0;
      bbPUActive.slow = DUR;
      bbAdjustSpeed(0.55);
      break;
    case 'fast':
      if (!bbPUActive.slow && !bbPUActive.fast) bbSpeedAntesSlow = _bbGetSpeed();
      bbPUActive.slow = 0;
      bbPUActive.fast = DUR;
      bbAdjustSpeed(1.55);
      break;
    case 'fire':
      bbPUActive.fire = DUR;
      bbBalls.forEach(b => b.fire = true);
      break;
    case 'sticky':
      bbPUActive.sticky = DUR;
      break;
    case 'life':
      bbLives = Math.min(5, bbLives + 1);
      document.getElementById('bbLives').textContent = '❤️'.repeat(bbLives);
      break;
    case 'laser':
      bbPUActive.laser = DUR;
      break;
  }
}

function _bbGetSpeed() {
  const b = bbBalls && bbBalls.find(b => !b.stuck);
  return b ? Math.sqrt(b.vx*b.vx + b.vy*b.vy) : BB_SPEEDS[bbDificultad];
}

function bbRestoreSpeed() {
  const target = bbSpeedAntesSlow > 0 ? bbSpeedAntesSlow : BB_SPEEDS[bbDificultad];
  bbBalls && bbBalls.forEach(b => {
    if (b.stuck) return;
    const cur = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
    if (cur < 0.1) return;
    b.vx = (b.vx / cur) * target;
    b.vy = (b.vy / cur) * target;
  });
  bbSpeedAntesSlow = 0;
}

function bbAdjustSpeed(factor) {
  bbBalls.forEach(b => {
    if (b.stuck) return;
    const spd = Math.sqrt(b.vx*b.vx + b.vy*b.vy) * factor;
    const ang = Math.atan2(b.vy, b.vx);
    b.vx = Math.cos(ang) * spd;
    b.vy = Math.sin(ang) * spd;
  });
}

function bbLoseLife() {
  bbLives--;
  document.getElementById('bbLives').textContent = '❤️'.repeat(Math.max(0, bbLives));
  if (bbLives <= 0) { bbGameOver(); return; }
  bbPUActive = {};
  bbLasers   = [];
  bbStickyBall = null;
  bbSpeedAntesSlow = 0;
  bbMakePaddle();
  bbBalls = [];
  bbMakeBall(true);
  bbPowerUps = [];
}

function bbNextLevel() {
  bbLevel++;
  document.getElementById('bbLevel').textContent = bbLevel;
  bbShowToast('🎉 Nivel ' + bbLevel);
  bbPUActive = {};
  bbLasers   = [];
  bbStickyBall = null;
  bbSpeedAntesSlow = 0;
  bbBalls = [];
  bbMakePaddle();
  bbMakeBall(true);
  bbMakeBlocks(bbLevel);
  bbPowerUps = [];
}

function bbGameOver() {
  bbRunning = false; bbOver = true;
  cancelAnimationFrame(bbAnimFrame);
  bbDraw();
  BBX.fillStyle = 'rgba(0,0,0,0.78)'; BBX.fillRect(0, BBH/2 - 50, BBW, 100);
  BBX.fillStyle = '#C8903A'; BBX.font = 'bold 17px Nunito'; BBX.textAlign = 'center';
  BBX.fillText('🥪 ¡Se deshizo el sanguche!', BBW/2, BBH/2 - 18);
  BBX.fillStyle = '#aaa'; BBX.font = '12px Nunito';
  BBX.fillText('Puntos: ' + bbScore + '  ·  Récord: ' + bbHi, BBW/2, BBH/2 + 4);
  BBX.fillStyle = '#555'; BBX.font = '10px Nunito';
  BBX.fillText('Tap o Espacio para reiniciar', BBW/2, BBH/2 + 22);
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function bbDraw() {
  BBX.fillStyle = '#0a0a0a'; BBX.fillRect(0, 0, BBW, BBH);

  // Bloques
  if (!bbBlocks) return;
  bbBlocks.forEach(b => {
    if (!b.alive) return;
    // Fondo del bloque con brillo según HP restante
    const alpha = 0.4 + (b.hp / b.maxHp) * 0.6;
    BBX.fillStyle = b.color + Math.round(alpha * 255).toString(16).padStart(2,'0');
    BBX.beginPath(); BBX.roundRect(b.x, b.y, b.w, b.h, 4); BBX.fill();
    // Borde
    BBX.strokeStyle = b.color; BBX.lineWidth = 1;
    BBX.beginPath(); BBX.roundRect(b.x, b.y, b.w, b.h, 4); BBX.stroke();
    // Emoji
    BBX.font = '11px serif'; BBX.textAlign = 'center'; BBX.textBaseline = 'middle';
    BBX.fillText(b.emoji, b.x + b.w/2, b.y + b.h/2);
    // Indicador de power-up
    if (b.pu) {
      BBX.font = '7px serif';
      BBX.fillText(b.pu.emoji, b.x + b.w - 5, b.y + 5);
    }
    // Crack en bloques dañados
    if (b.hp < b.maxHp) {
      BBX.strokeStyle = 'rgba(0,0,0,0.5)'; BBX.lineWidth = 1.5;
      BBX.beginPath();
      BBX.moveTo(b.x + b.w*0.3, b.y + 2);
      BBX.lineTo(b.x + b.w*0.5, b.y + b.h*0.6);
      BBX.lineTo(b.x + b.w*0.7, b.y + b.h - 2);
      BBX.stroke();
    }
  });

  // Power-ups cayendo
  bbPowerUps.forEach(pu => {
    BBX.font = '16px serif'; BBX.textAlign = 'center'; BBX.textBaseline = 'middle';
    BBX.fillText(pu.emoji, pu.x, pu.y);
  });

  // Lásers
  BBX.strokeStyle = '#FFE066'; BBX.lineWidth = 2;
  bbLasers.forEach(l => {
    BBX.beginPath(); BBX.moveTo(l.x, l.y); BBX.lineTo(l.x, l.y - 14); BBX.stroke();
    BBX.fillStyle = '#FFE066'; BBX.beginPath(); BBX.arc(l.x, l.y - 14, 2, 0, Math.PI*2); BBX.fill();
  });

  // Bolas
  if (!bbBalls) return;
  bbBalls.forEach(ball => {
    if (ball.fire) {
      // Bola de fuego con halo
      const grad = BBX.createRadialGradient(ball.x, ball.y, 1, ball.x, ball.y, BALL_R + 4);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.4, '#FFD700');
      grad.addColorStop(1, 'rgba(255,100,0,0)');
      BBX.fillStyle = grad;
      BBX.beginPath(); BBX.arc(ball.x, ball.y, BALL_R + 4, 0, Math.PI*2); BBX.fill();
    }
    const grad2 = BBX.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, BALL_R);
    grad2.addColorStop(0, '#fff');
    grad2.addColorStop(0.5, ball.fire ? '#FFD700' : '#3DBFB8');
    grad2.addColorStop(1, ball.fire ? '#FF4500' : '#1A8C87');
    BBX.fillStyle = grad2;
    BBX.beginPath(); BBX.arc(ball.x, ball.y, BALL_R, 0, Math.PI*2); BBX.fill();
  });

  // Paleta — sanguche pixel-art
  bbDrawPaddle();

  // HUD de power-ups activos
  bbDrawPUHud();

  // Pantalla de espera (bola pegada)
  if (bbStickyBall && bbStickyBall.stuck) {
    BBX.fillStyle = 'rgba(61,191,184,0.18)';
    BBX.fillRect(0, BBH - 18, BBW, 18);
    BBX.fillStyle = '#3DBFB8'; BBX.font = 'bold 10px Nunito'; BBX.textAlign = 'center'; BBX.textBaseline = 'middle';
    BBX.fillText('TAP / ESPACIO para lanzar', BBW/2, BBH - 9);
  }
}

function bbDrawPaddle() {
  const p = bbPaddle;
  // Base del sanguche
  BBX.fillStyle = '#C8903A';
  BBX.beginPath(); BBX.roundRect(p.x, p.y, p.w, p.h, 5); BBX.fill();
  // Capa de queso
  BBX.fillStyle = '#FFD700';
  BBX.fillRect(p.x + 2, p.y + 2, p.w - 4, 3);
  // Capa de lechuga
  BBX.fillStyle = '#4CAF50';
  BBX.fillRect(p.x + 1, p.y + 5, p.w - 2, 2);
  // Capa de tomate
  BBX.fillStyle = '#E53935';
  BBX.fillRect(p.x + 3, p.y + 7, p.w - 6, 2);
  // Brillo superior
  BBX.fillStyle = 'rgba(255,255,255,0.18)';
  BBX.fillRect(p.x + 4, p.y + 1, p.w - 8, 2);
  // Borde
  BBX.strokeStyle = '#E8B76A'; BBX.lineWidth = 1;
  BBX.beginPath(); BBX.roundRect(p.x, p.y, p.w, p.h, 5); BBX.stroke();

  // Si tiene láser: cañoncitos en los extremos
  if (bbPUActive.laser) {
    BBX.fillStyle = '#FFE066';
    BBX.fillRect(p.x + 2, p.y - 6, 5, 7);
    BBX.fillRect(p.x + p.w - 7, p.y - 6, 5, 7);
  }
}

function bbDrawPUHud() {
  const activos = Object.entries(bbPUActive).filter(([,v]) => v > 0);
  if (!activos.length) return;
  let ox = 6;
  BBX.font = '11px serif'; BBX.textBaseline = 'middle';
  activos.forEach(([tipo, frames]) => {
    const def = BB_PU_DEFS.find(d => d.tipo === tipo);
    if (!def) return;
    // Barra de tiempo
    const maxF = 420;
    const ratio = frames / maxF;
    BBX.fillStyle = 'rgba(0,0,0,0.5)';
    BBX.fillRect(ox, 6, 22, 6);
    BBX.fillStyle = def.color;
    BBX.fillRect(ox, 6, Math.round(22 * ratio), 6);
    BBX.textAlign = 'center';
    BBX.fillText(def.emoji, ox + 11, 20);
    ox += 26;
  });
}

let bbToastMsg = '', bbToastTimer = 0;
function bbShowToast(msg) { bbToastMsg = msg; bbToastTimer = 120; }

// ── Controles ─────────────────────────────────────────────────────────────────
function bbMovePaddle(x) {
  bbPaddle.x = Math.max(0, Math.min(BBW - bbPaddle.w, x - bbPaddle.w/2));
  // Mover bola pegada con la paleta
  if (bbStickyBall && bbStickyBall.stuck) {
    bbStickyBall.x = bbPaddle.x + bbPaddle.w/2;
  }
}

function bbLaunch() {
  if (bbStickyBall && bbStickyBall.stuck) {
    bbStickyBall.stuck = false;
    bbStickyBall.vy = -Math.abs(bbStickyBall.vy || 4);
    if (!bbStickyBall.vy) bbStickyBall.vy = -BB_SPEEDS[bbDificultad];
    bbStickyBall = null;
    return true;
  }
  return false;
}

function bbFireLaser() {
  if (!bbPUActive.laser) return;
  bbLasers.push({ x: bbPaddle.x + 4, y: bbPaddle.y });
  bbLasers.push({ x: bbPaddle.x + bbPaddle.w - 4, y: bbPaddle.y });
}

// Mouse / touch
BBC.addEventListener('mousemove', e => {
  if (!bbRunning || bbPaused) return;
  const r = BBC.getBoundingClientRect();
  bbMovePaddle(e.clientX - r.left);
}, { passive: true });

BBC.addEventListener('touchmove', e => {
  if (!bbRunning || bbPaused) return;
  e.preventDefault();
  const r = BBC.getBoundingClientRect();
  const scaleX = BBW / r.width;
  bbMovePaddle((e.touches[0].clientX - r.left) * scaleX);
}, { passive: false });

BBC.addEventListener('click', e => {
  if (bbOver) { window.blockbusterReset(); return; }
  if (!bbRunning || bbPaused) return;
  if (!bbLaunch()) bbFireLaser();
});

BBC.addEventListener('touchend', e => {
  if (bbOver) { window.blockbusterReset(); return; }
  if (!bbRunning || bbPaused) return;
  if (!bbLaunch()) bbFireLaser();
}, { passive: true });

// ── Teclado: movimiento continuo en el loop ──────────────────────────────────
const bbKeys = {};
document.addEventListener('keydown', e => {
  if (document.getElementById('juegoBlockbuster').style.display === 'none') return;
  if (['ArrowLeft','ArrowRight','Space'].includes(e.key) || e.code === 'Space') e.preventDefault();
  bbKeys[e.key] = true;
  if (e.code === 'Space' || e.key === ' ') {
    if (bbOver) { window.blockbusterReset(); return; }
    if (!bbLaunch()) bbFireLaser();
  }
});
document.addEventListener('keyup', e => { bbKeys[e.key] = false; });

// ── API pública ───────────────────────────────────────────────────────────────
let _bbFichaOk = false; // true solo cuando el selector ya consumió la ficha

window.blockbusterInit = function() {
  // Llamado desde el selector (ficha ya consumida) — muestra pantalla de inicio
  _bbFichaOk = true;
  bbEnEspera = true;
  cancelAnimationFrame(bbAnimFrame);
  bbOver = false; bbRunning = false;
  bbBalls = []; bbBlocks = []; bbPowerUps = []; bbLasers = [];
  bbPUActive = {}; bbSpeedAntesSlow = 0;
  document.getElementById('bbScore').textContent = 0;
  document.getElementById('bbHi').textContent    = bbHi;
  document.getElementById('bbLevel').textContent = 1;
  document.getElementById('bbLives').textContent = '❤️❤️❤️';
  bbDrawStart();
};

window.blockbusterReset = async function() {
  if (typeof window.juegoRequiereFichas === 'function' && window.juegoRequiereFichas('blockbuster')) {
    if (typeof window.juegoConsumirFicha === 'function') {
      const ok = await window.juegoConsumirFicha('blockbuster');
      if (!ok) { if (typeof showToast === 'function') showToast('🎟️ Sin fichas para Blockbuster'); return; }
    }
  }
  _bbFichaOk = false; // reset directo, no pasa por pantalla inicio
  cancelAnimationFrame(bbAnimFrame);
  bbInit();
};

window.blockbusterPause = function() {
  if (!bbRunning) return;
  bbPaused = !bbPaused;
  const btn = document.getElementById('btnBBPausa');
  if (btn) btn.textContent = bbPaused ? '▶ Reanudar' : '⏸ Pausa';
};

// ── Pantalla de inicio ─────────────────────────────────────────────────────────
let bbEnEspera = true;

function bbDrawStart() {
  BBX.fillStyle = '#0a0a0a'; BBX.fillRect(0, 0, BBW, BBH);
  // Mini bloques decorativos
  const demos = ['🍞','🧀','🥬','🍅','🥩','🧅','🥒','🥓'];
  demos.forEach((em, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const bx = 10 + col * BLOCK_W, by = 30 + row * (BLOCK_H + BLOCK_PAD);
    const colors = ['#C8903A','#FFD700','#4CAF50','#E53935','#E57373','#CE93D8','#66BB6A','#D4831A'];
    BBX.fillStyle = colors[i] + '99';
    BBX.beginPath(); BBX.roundRect(bx, by, BLOCK_W - BLOCK_PAD, BLOCK_H, 4); BBX.fill();
    BBX.strokeStyle = colors[i]; BBX.lineWidth = 1;
    BBX.beginPath(); BBX.roundRect(bx, by, BLOCK_W - BLOCK_PAD, BLOCK_H, 4); BBX.stroke();
    BBX.font = '11px serif'; BBX.textAlign = 'center'; BBX.textBaseline = 'middle';
    BBX.fillText(em, bx + (BLOCK_W - BLOCK_PAD)/2, by + BLOCK_H/2);
  });

  // Título
  BBX.fillStyle = '#C8903A'; BBX.font = 'bold 22px Nunito'; BBX.textAlign = 'center'; BBX.textBaseline = 'alphabetic';
  BBX.fillText('🥪 BLOCK', BBW/2, 130);
  BBX.fillStyle = '#FFD700'; BBX.font = 'bold 22px Nunito';
  BBX.fillText('BURGUER', BBW/2, 156);
  BBX.fillStyle = '#555'; BBX.font = '11px Nunito';
  BBX.fillText('Récord: ' + bbHi, BBW/2, 178);

  // Power-ups preview
  BBX.fillStyle = '#333'; BBX.font = '9px Nunito';
  BBX.fillText('🥪 Grande  🔥 Multi-bola  🧊 Lento  💥 Fuego  ⚡ Láser', BBW/2, 200);

  // Botón
  BBX.fillStyle = '#C8903A';
  BBX.beginPath(); BBX.roundRect(BBW/2 - 60, 215, 120, 38, 10); BBX.fill();
  BBX.fillStyle = '#0a0a0a'; BBX.font = 'bold 14px Nunito';
  BBX.fillText('▶  JUGAR', BBW/2, 239);

  BBX.fillStyle = '#333'; BBX.font = '10px Nunito';
  BBX.fillText('Mové el mouse · Touch · ← →', BBW/2, 278);
  BBX.fillText('Tap / Espacio para lanzar y láser', BBW/2, 294);
}

function _bbArrancar() {
  if (!bbEnEspera || !_bbFichaOk) return;
  _bbFichaOk  = false;
  bbEnEspera  = false;
  cancelAnimationFrame(bbAnimFrame);
  bbInit();
}

BBC.addEventListener('pointerdown', () => { if (bbEnEspera) _bbArrancar(); }, { passive: true });
document.addEventListener('keydown', e => {
  if (bbEnEspera && e.code === 'Space' && document.getElementById('juegoBlockbuster').style.display !== 'none') {
    e.preventDefault(); _bbArrancar();
  }
});

bbDrawStart();
