// ===================== PONG — MORDELÓN =====================
(function () {

const PW = 280, PH = 400;
let PC, PX;

function _initCanvas() {
  if (PC) return true;
  PC = document.getElementById('pongCanvas');
  if (!PC) return false;
  PX = PC.getContext('2d');
  return true;
}

const PONG_TURQ   = '#3DBFB8';
const PONG_NARANJ = '#D4831A';
const PONG_LIGHT  = '#7EEEE9';
const PONG_DARK   = '#1A8C87';

let pScore, pHi = parseInt(localStorage.getItem('pongHiC') || '0');
let pRunning = false, pOver = false, pAnimFrame;
let pEnEspera = true;
let pPaused = false;
let rallyHits = 0; // golpes desde el último reset de pelota
let pDificultad = 0;
window.setPongDificultad = function(val) { pDificultad = Math.max(0, Math.min(4, parseInt(val) || 0)); };

// ── Objetos del juego ──────────────────────────────────────────────────────
const PADDLE_W = 54, PADDLE_H = 10, BALL_R = 7;
let player, enemy, ball, particles;

// Trail
let ballTrail = [];
const TRAIL_MAX = 14;

// Squish
let playerSquish = 0, enemySquish = 0;

// Vidas
let pLives, eLives;
const MAX_LIVES = 3;

// Flash de pantalla
let screenFlash = 0, screenFlashColor = '#fff';

// Pulso de fondo animado
let bgPulse = 0;

const ENEMIGOS = ['🧅','🌶️','🥚','🍅','🧀','🥓'];
let enemyEmoji = ENEMIGOS[0];

// ── Web Audio API ──────────────────────────────────────────────────────────
let _audioCtx = null;
function _getAC() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
function _sndHitPlayer() {
  const ac = _getAC(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.connect(g); g.connect(ac.destination);
  o.type = 'square';
  o.frequency.setValueAtTime(380, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.07);
  g.gain.setValueAtTime(0.18, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1);
  o.start(); o.stop(ac.currentTime + 0.11);
}
function _sndHitEnemy() {
  const ac = _getAC(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.connect(g); g.connect(ac.destination);
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(260, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(160, ac.currentTime + 0.07);
  g.gain.setValueAtTime(0.14, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.09);
  o.start(); o.stop(ac.currentTime + 0.1);
}
function _sndWall() {
  const ac = _getAC(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.connect(g); g.connect(ac.destination);
  o.type = 'sine';
  o.frequency.setValueAtTime(180, ac.currentTime);
  g.gain.setValueAtTime(0.08, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.06);
  o.start(); o.stop(ac.currentTime + 0.07);
}
function _sndPoint() {
  const ac = _getAC(); if (!ac) return;
  [480, 600, 720].forEach((f, i) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'triangle';
    o.frequency.value = f;
    const t = ac.currentTime + i * 0.09;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.start(t); o.stop(t + 0.2);
  });
}
function _sndLoseLife() {
  const ac = _getAC(); if (!ac) return;
  [300, 220].forEach((f, i) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sawtooth';
    const t = ac.currentTime + i * 0.12;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.start(t); o.stop(t + 0.22);
  });
}
function _sndGameOver() {
  const ac = _getAC(); if (!ac) return;
  [320, 260, 200, 140].forEach((f, i) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sawtooth';
    const t = ac.currentTime + i * 0.14;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.start(t); o.stop(t + 0.24);
  });
}

// ── Controles ─────────────────────────────────────────────────────────────
let _btnLeft = false, _btnRight = false;
let _keyLeft = false, _keyRight = false;
const PLAYER_SPD = 4.5;

function _applyPlayerMove() {
  if (!pRunning || !player) return;
  if (_btnLeft  || _keyLeft)  player.x = Math.max(0, player.x - PLAYER_SPD);
  if (_btnRight || _keyRight) player.x = Math.min(PW - player.w, player.x + PLAYER_SPD);
  window._pongHostPaddleX = player.x; // usado por pong-multi.js
}

// ── Partículas ─────────────────────────────────────────────────────────────
function _spawnParticles(x, y, color, count) {
  count = count || 18;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color,
      size: 1.5 + Math.random() * 4,
      shape: Math.random() > 0.5 ? 'circle' : 'square',
    });
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
function pInit() {
  player    = { x: PW / 2 - PADDLE_W / 2, y: PH - 28, w: PADDLE_W, h: PADDLE_H };
  enemy     = { x: PW / 2 - PADDLE_W / 2, y: 18,      w: PADDLE_W, h: PADDLE_H };
  particles = [];
  ballTrail = [];
  playerSquish = 0; enemySquish = 0;
  screenFlash  = 0; bgPulse = 0;
  pLives = MAX_LIVES; eLives = MAX_LIVES;
  pScore = 0; pOver = false; pRunning = true; pPaused = false; rallyHits = 0;
  enemyEmoji = ENEMIGOS[Math.floor(Math.random() * ENEMIGOS.length)];
  _resetBall(1);
  document.getElementById('pongScore').textContent = 0;
  document.getElementById('pongHi').textContent    = pHi;
  cancelAnimationFrame(pAnimFrame);
  pLoop();
}

function _resetBall(vyDir) {
  rallyHits = 0;
  ball = {
    x: PW / 2, y: PH / 2, r: BALL_R,
    vx: (Math.random() > 0.5 ? 1 : -1) * 1.6,
    vy: vyDir * 2.2
  };
  ballTrail = [];
}

// ── Pausa ──────────────────────────────────────────────────────────────────
function _togglePause() {
  if (!pRunning || pOver || pEnEspera) return;
  pPaused = !pPaused;
  if (pPaused) {
    // Dibujar overlay de pausa
    pDraw();
    PX.fillStyle = 'rgba(8,12,16,0.82)';
    PX.fillRect(0, 0, PW, PH);
    PX.save();
    PX.shadowColor = PONG_TURQ; PX.shadowBlur = 14;
    PX.fillStyle = PONG_TURQ; PX.font = 'bold 20px Nunito, sans-serif';
    PX.textAlign = 'center'; PX.textBaseline = 'middle';
    PX.fillText('⏸ PAUSA', PW/2, PH/2 - 12);
    PX.restore();
    PX.fillStyle = '#333'; PX.font = '10px Nunito, sans-serif';
    PX.textAlign = 'center'; PX.textBaseline = 'middle';
    PX.fillText('Tap ⏸ o P para continuar', PW/2, PH/2 + 14);
  } else {
    pAnimFrame = requestAnimationFrame(pLoop);
  }
}

// ── Dificultad ─────────────────────────────────────────────────────────────
function _enemySpeed()    { return 2.2 + pDificultad * 0.85; }
function _ballSpeedMult() { return 1   + pDificultad * 0.15; }

// ── Loop ───────────────────────────────────────────────────────────────────
function pLoop() {
  if (!pRunning) return;
  if (pPaused) return;

  _applyPlayerMove();
  bgPulse += 0.025;

  // Trail
  ballTrail.push({ x: ball.x, y: ball.y });
  if (ballTrail.length > TRAIL_MAX) ballTrail.shift();

  ball.x += ball.vx;
  ball.y += ball.vy;

  // Paredes laterales
  if (ball.x - ball.r <= 0)  { ball.x = ball.r;      ball.vx *= -1; _sndWall(); }
  if (ball.x + ball.r >= PW) { ball.x = PW - ball.r; ball.vx *= -1; _sndWall(); }

  // IA enemigo
  const es = _enemySpeed();
  const enemyCX = enemy.x + enemy.w / 2;
  if (ball.x < enemyCX - 4) enemy.x -= es;
  else if (ball.x > enemyCX + 4) enemy.x += es;
  enemy.x = Math.max(0, Math.min(PW - enemy.w, enemy.x));

  // Decay animaciones
  playerSquish = Math.max(0, playerSquish - 0.08);
  enemySquish  = Math.max(0, enemySquish  - 0.08);
  screenFlash  = Math.max(0, screenFlash  - 0.07);

  // ── Colisión paleta JUGADOR ──────────────────────────────────────────────
  if (
    ball.vy > 0 &&
    ball.y + ball.r >= player.y &&
    ball.y + ball.r <= player.y + player.h + 5 &&
    ball.x >= player.x - 2 &&
    ball.x <= player.x + player.w + 2
  ) {
    rallyHits++;
    // Escala velocidad: arranque suave, normal a partir del golpe 2
    const rampP = Math.min(rallyHits / 2, 1); // 0→1 en 2 golpes
    const targetVy = 2.2 + rampP * 2.3;       // 2.2 → 4.5
    const curSpeed = Math.abs(ball.vy);
    const newVy = Math.max(curSpeed + 0.08, targetVy);
    ball.vy = -Math.min(newVy, 15);
    const hit = (ball.x - (player.x + player.w / 2)) / (player.w / 2);
    const minVx = 1.5 + rampP * 1.0;
    ball.vx = hit * 4.5;
    if (Math.abs(ball.vx) < minVx) ball.vx = (ball.vx >= 0 ? 1 : -1) * minVx;
    ball.y  = player.y - ball.r;
    playerSquish = 1;
    pScore++;
    document.getElementById('pongScore').textContent = pScore;
    if (pScore > pHi) {
      pHi = pScore;
      localStorage.setItem('pongHiC', pHi);
      document.getElementById('pongHi').textContent = pHi;
      if (typeof window.notificarRecordJuego === 'function') window.notificarRecordJuego('pong', pHi);
    }
    _spawnParticles(ball.x, ball.y, PONG_TURQ, 22);
    _sndHitPlayer(); _sndPoint();
    ballTrail = [];
  }

  // ── Colisión paleta ENEMIGO ──────────────────────────────────────────────
  if (
    ball.vy < 0 &&
    ball.y - ball.r <= enemy.y + enemy.h &&
    ball.y - ball.r >= enemy.y - 5 &&
    ball.x >= enemy.x - 2 &&
    ball.x <= enemy.x + enemy.w + 2
  ) {
    rallyHits++;
    const rampP = Math.min(rallyHits / 2, 1);
    const targetVy = 2.2 + rampP * 2.3;
    const curSpeed = Math.abs(ball.vy);
    const newVy = Math.max(curSpeed + 0.08, targetVy);
    ball.vy = Math.min(newVy, 15);
    const hit = (ball.x - (enemy.x + enemy.w / 2)) / (enemy.w / 2);
    const minVx = 1.5 + rampP * 1.0;
    ball.vx = hit * 4;
    if (Math.abs(ball.vx) < minVx) ball.vx = (ball.vx >= 0 ? 1 : -1) * minVx;
    ball.y  = enemy.y + enemy.h + ball.r;
    enemySquish = 1;
    _spawnParticles(ball.x, ball.y, PONG_NARANJ, 22);
    _sndHitEnemy();
    ballTrail = [];
  }

  // ── Pelota sale por ABAJO → jugador pierde vida ──────────────────────────
  if (ball.y - ball.r > PH) {
    pLives--;
    _sndLoseLife();
    screenFlash = 1; screenFlashColor = '#ff3333';
    _spawnParticles(PW / 2, PH - 10, '#ff4444', 30);
    if (pLives <= 0) { pGameOver(false); return; }
    _resetBall(1);
  }

  // ── Pelota sale por ARRIBA → enemigo pierde vida ─────────────────────────
  if (ball.y + ball.r < 0) {
    eLives--;
    _sndPoint();
    screenFlash = 1; screenFlashColor = PONG_TURQ;
    _spawnParticles(PW / 2, 10, PONG_TURQ, 30);
    if (eLives <= 0) { pGameOver(true); return; }
    _resetBall(-1);
  }

  // Partículas
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.92; p.vy *= 0.92;
    p.life -= 0.04;
    if (p.life <= 0) particles.splice(i, 1);
  }

  pDraw();
  pAnimFrame = requestAnimationFrame(pLoop);
}

// ── Dibujo ─────────────────────────────────────────────────────────────────
function pDraw() {
  if (!_initCanvas()) return;

  // Fondo oscuro
  PX.fillStyle = '#080c10';
  PX.fillRect(0, 0, PW, PH);

  // Resplandor central que pulsa
  const pulse = (Math.sin(bgPulse) + 1) / 2;
  const bgGlow = PX.createRadialGradient(PW/2, PH/2, 10, PW/2, PH/2, 180);
  bgGlow.addColorStop(0, `rgba(61,191,184,${0.04 + pulse * 0.04})`);
  bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
  PX.fillStyle = bgGlow;
  PX.fillRect(0, 0, PW, PH);

  // Grid
  _drawGrid();
  // Línea central
  _drawCenterLine();
  // Vidas
  _drawLives();
  // Trail
  _drawTrail();
  // Paletas
  _drawPaddleLlama(player.x, player.y, player.w, player.h, playerSquish);
  _drawPaddleEnemigo(enemy.x, enemy.y, enemy.w, enemy.h, enemySquish);
  // Pelota
  _drawBall(ball.x, ball.y, ball.r);
  // Partículas
  _drawParticles();

  // Botón pausa (arriba derecha)
  _drawPauseBtn();

  // Flash
  if (screenFlash > 0) {
    PX.globalAlpha = screenFlash * 0.22;
    PX.fillStyle   = screenFlashColor;
    PX.fillRect(0, 0, PW, PH);
    PX.globalAlpha = 1;
  }
}

function _drawPauseBtn() {
  const bx = PW - 26, by = 4, bw = 22, bh = 22, br = 5;
  // Fondo semitransparente
  PX.fillStyle = pPaused ? 'rgba(61,191,184,0.25)' : 'rgba(255,255,255,0.06)';
  PX.beginPath(); PX.roundRect(bx, by, bw, bh, br); PX.fill();
  PX.strokeStyle = pPaused ? PONG_TURQ : 'rgba(255,255,255,0.15)';
  PX.lineWidth = 1;
  PX.beginPath(); PX.roundRect(bx, by, bw, bh, br); PX.stroke();
  // Icono ⏸ o ▶
  PX.fillStyle = pPaused ? PONG_TURQ : 'rgba(255,255,255,0.5)';
  PX.font = '12px serif'; PX.textAlign = 'center'; PX.textBaseline = 'middle';
  PX.fillText(pPaused ? '▶' : '⏸', bx + bw/2, by + bh/2 + 1);
}

function _drawGrid() {
  PX.strokeStyle = 'rgba(61,191,184,0.045)';
  PX.lineWidth = 0.5;
  const step = 28;
  for (let x = 0; x <= PW; x += step) { PX.beginPath(); PX.moveTo(x,0); PX.lineTo(x,PH); PX.stroke(); }
  for (let y = 0; y <= PH; y += step) { PX.beginPath(); PX.moveTo(0,y); PX.lineTo(PW,y); PX.stroke(); }
}

function _drawCenterLine() {
  PX.save();
  PX.shadowColor = PONG_TURQ; PX.shadowBlur = 6;
  PX.setLineDash([5, 7]);
  PX.strokeStyle = 'rgba(61,191,184,0.35)';
  PX.lineWidth   = 1.2;
  PX.beginPath(); PX.moveTo(0, PH/2); PX.lineTo(PW, PH/2); PX.stroke();
  PX.setLineDash([]);
  PX.restore();
}

function _drawLives() {
  PX.font = '9px serif'; PX.textBaseline = 'middle';
  // Vidas jugador (abajo izquierda) — llamas
  for (let i = 0; i < MAX_LIVES; i++) {
    PX.globalAlpha = i < pLives ? 1 : 0.18;
    PX.fillText('🔥', 5 + i * 14, PH - 10);
  }
  // Vidas enemigo (arriba derecha)
  for (let i = 0; i < MAX_LIVES; i++) {
    PX.globalAlpha = i < eLives ? 1 : 0.18;
    PX.fillText(enemyEmoji, PW - 8 - (MAX_LIVES - 1 - i) * 14, 10);
  }
  PX.globalAlpha = 1;
}

function _drawTrail() {
  for (let i = 0; i < ballTrail.length; i++) {
    const t = ballTrail[i];
    const progress = (i + 1) / ballTrail.length;
    const alpha    = progress * 0.6;
    const radius   = ball.r * (0.2 + progress * 0.8);
    const r = Math.round(61  + (212 - 61)  * (1 - progress));
    const g = Math.round(191 + (131 - 191) * (1 - progress));
    const b = Math.round(184 + (26  - 184) * (1 - progress));
    PX.globalAlpha = alpha;
    PX.fillStyle   = `rgb(${r},${g},${b})`;
    PX.beginPath(); PX.arc(t.x, t.y, radius, 0, Math.PI * 2); PX.fill();
  }
  PX.globalAlpha = 1;
}

function _drawParticles() {
  particles.forEach(p => {
    PX.save();
    PX.globalAlpha = p.life * 0.9;
    PX.fillStyle   = p.color;
    if (p.shape === 'square') {
      PX.translate(p.x, p.y); PX.rotate((1 - p.life) * 8);
      PX.fillRect(-p.size/2, -p.size/2, p.size, p.size);
    } else {
      PX.beginPath(); PX.arc(p.x, p.y, p.size, 0, Math.PI*2); PX.fill();
    }
    PX.restore();
  });
  PX.globalAlpha = 1;
}

function _drawPaddleLlama(x, y, w, h, squish) {
  PX.save();
  const sx = 1 + squish * 0.3, sy = 1 - squish * 0.38;
  const cx = x + w/2, cy = y + h/2;
  PX.translate(cx, cy); PX.scale(sx, sy); PX.translate(-cx, -cy);

  PX.shadowColor = squish > 0.05 ? `rgba(61,191,184,${squish * 0.9})` : 'rgba(61,191,184,0.45)';
  PX.shadowBlur  = squish > 0.05 ? 20 * squish : 9;

  const grad = PX.createLinearGradient(x, y, x, y+h);
  grad.addColorStop(0, '#aaf5ef');
  grad.addColorStop(0.45, PONG_TURQ);
  grad.addColorStop(1, PONG_DARK);
  PX.fillStyle = grad;
  PX.beginPath(); PX.roundRect(x, y, w, h, 5); PX.fill();
  PX.shadowBlur = 0;

  // Borde luminoso
  PX.strokeStyle = 'rgba(255,255,255,0.45)'; PX.lineWidth = 1;
  PX.beginPath(); PX.roundRect(x+0.5, y+0.5, w-1, h-1, 5); PX.stroke();

  // Brillo interno
  PX.fillStyle = 'rgba(255,255,255,0.22)';
  PX.beginPath(); PX.roundRect(x+4, y+2, w-8, 3, 2); PX.fill();

  PX.font = '11px serif'; PX.textAlign = 'center'; PX.textBaseline = 'middle';
  PX.fillText('🔥', cx, cy + 0.5);
  PX.restore();
}

function _drawPaddleEnemigo(x, y, w, h, squish) {
  PX.save();
  const sx = 1 + squish * 0.3, sy = 1 - squish * 0.38;
  const cx = x + w/2, cy = y + h/2;
  PX.translate(cx, cy); PX.scale(sx, sy); PX.translate(-cx, -cy);

  PX.shadowColor = squish > 0.05 ? `rgba(212,131,26,${squish * 0.9})` : 'rgba(212,131,26,0.45)';
  PX.shadowBlur  = squish > 0.05 ? 20 * squish : 9;

  const grad = PX.createLinearGradient(x, y, x, y+h);
  grad.addColorStop(0, '#ffbc55');
  grad.addColorStop(0.45, PONG_NARANJ);
  grad.addColorStop(1, '#7a3800');
  PX.fillStyle = grad;
  PX.beginPath(); PX.roundRect(x, y, w, h, 5); PX.fill();
  PX.shadowBlur = 0;

  PX.strokeStyle = 'rgba(255,200,100,0.4)'; PX.lineWidth = 1;
  PX.beginPath(); PX.roundRect(x+0.5, y+0.5, w-1, h-1, 5); PX.stroke();

  PX.fillStyle = 'rgba(255,255,255,0.16)';
  PX.beginPath(); PX.roundRect(x+4, y+2, w-8, 3, 2); PX.fill();

  PX.font = '11px serif'; PX.textAlign = 'center'; PX.textBaseline = 'middle';
  PX.fillText(enemyEmoji, cx, cy + 0.5);
  PX.restore();
}

function _drawBall(x, y, r) {
  // Glow exterior
  const glow = PX.createRadialGradient(x, y, 0, x, y, r * 3.2);
  glow.addColorStop(0, 'rgba(61,191,184,0.5)');
  glow.addColorStop(0.5, 'rgba(61,191,184,0.12)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  PX.fillStyle = glow;
  PX.beginPath(); PX.arc(x, y, r*3.2, 0, Math.PI*2); PX.fill();

  // Sombra con profundidad
  PX.save();
  PX.shadowColor = 'rgba(0,0,0,0.7)'; PX.shadowBlur = 6; PX.shadowOffsetY = 2;
  PX.fillStyle = '#fff';
  PX.beginPath(); PX.arc(x, y, r, 0, Math.PI*2); PX.fill();
  PX.restore();

  // Highlight
  PX.fillStyle = 'rgba(255,255,255,0.75)';
  PX.beginPath(); PX.arc(x - r*0.28, y - r*0.28, r*0.35, 0, Math.PI*2); PX.fill();

  PX.font = (r * 1.65) + 'px serif';
  PX.textAlign = 'center'; PX.textBaseline = 'middle';
  PX.fillText('🥪', x, y + 1);
}

// ── Game Over ───────────────────────────────────────────────────────────────
function pGameOver(playerWon) {
  pRunning = false; pOver = true;
  cancelAnimationFrame(pAnimFrame);
  _sndGameOver();
  pDraw();

  var _pts = pScore;

  // Panel
  PX.fillStyle = 'rgba(8,12,16,0.93)';
  _rrect(18, PH/2 - 72, PW - 36, 144, 14); PX.fill();
  PX.strokeStyle = playerWon ? PONG_TURQ : PONG_NARANJ; PX.lineWidth = 1.5;
  _rrect(18, PH/2 - 72, PW - 36, 144, 14); PX.stroke();

  // Título
  PX.fillStyle = playerWon ? PONG_TURQ : PONG_NARANJ;
  PX.font = 'bold 14px Nunito, sans-serif';
  PX.textAlign = 'center'; PX.textBaseline = 'alphabetic';
  PX.fillText(playerWon ? '🏆 ¡GANASTE!' : '🥪 ¡EL SANGUCHE SE CAYÓ!', PW/2, PH/2 - 38);

  // Puntos
  PX.fillStyle = '#e8e8e8'; PX.font = 'bold 28px Nunito, sans-serif';
  PX.fillText('' + _pts, PW/2, PH/2 - 8);
  PX.fillStyle = '#555'; PX.font = '10px Nunito, sans-serif';
  PX.fillText('GOLPES', PW/2, PH/2 + 7);

  // Separador
  PX.strokeStyle = 'rgba(255,255,255,0.08)'; PX.lineWidth = 1;
  PX.beginPath(); PX.moveTo(40, PH/2 + 16); PX.lineTo(PW - 40, PH/2 + 16); PX.stroke();

  // Récord
  if (_pts >= pHi && _pts > 0) {
    PX.fillStyle = PONG_TURQ; PX.font = 'bold 10px Nunito, sans-serif';
    PX.fillText('✦ NUEVO RÉCORD ✦', PW/2, PH/2 + 30);
  } else {
    PX.fillStyle = '#3a3a3a'; PX.font = '10px Nunito, sans-serif';
    PX.fillText('Récord: ' + pHi, PW/2, PH/2 + 30);
  }

  PX.fillStyle = '#2e2e2e'; PX.font = '9px Nunito, sans-serif';
  PX.fillText('Tap o Espacio para reiniciar', PW/2, PH/2 + 52);

  if (typeof window.actualizarBarraRecompensa === 'function') window.actualizarBarraRecompensa();
  setTimeout(function () {
    if (typeof window.abrirLeaderboard === 'function') window.abrirLeaderboard('pong', _pts);
  }, 1200);
}

// roundRect compatible
function _rrect(x, y, w, h, r) {
  PX.beginPath();
  PX.moveTo(x+r, y);
  PX.lineTo(x+w-r, y); PX.quadraticCurveTo(x+w, y, x+w, y+r);
  PX.lineTo(x+w, y+h-r); PX.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  PX.lineTo(x+r, y+h); PX.quadraticCurveTo(x, y+h, x, y+h-r);
  PX.lineTo(x, y+r); PX.quadraticCurveTo(x, y, x+r, y);
  PX.closePath();
}

// ── Pantalla de inicio ──────────────────────────────────────────────────────
function pDrawStart() {
  if (!_initCanvas()) return;
  PX.fillStyle = '#080c10'; PX.fillRect(0, 0, PW, PH);

  // Grid
  PX.strokeStyle = 'rgba(61,191,184,0.05)'; PX.lineWidth = 0.5;
  for (let x = 0; x <= PW; x += 28) { PX.beginPath(); PX.moveTo(x,0); PX.lineTo(x,PH); PX.stroke(); }
  for (let y = 0; y <= PH; y += 28) { PX.beginPath(); PX.moveTo(0,y); PX.lineTo(PW,y); PX.stroke(); }

  // Glow central
  const bg = PX.createRadialGradient(PW/2, PH/2, 0, PW/2, PH/2, 160);
  bg.addColorStop(0, 'rgba(61,191,184,0.08)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
  PX.fillStyle = bg; PX.fillRect(0, 0, PW, PH);

  // Emojis
  PX.font = '36px serif'; PX.textAlign = 'center'; PX.textBaseline = 'middle';
  PX.fillText('🥪', PW/2, 70);
  PX.font = '20px serif';
  PX.fillText('🔥', PW/2 - 50, 108);
  PX.fillText('🧅', PW/2 + 50, 108);
  PX.fillStyle = '#2a2a2a'; PX.font = 'bold 10px Nunito'; PX.textBaseline = 'middle';
  PX.fillText('VS', PW/2, 108);

  // Título con glow
  PX.save();
  PX.shadowColor = PONG_TURQ; PX.shadowBlur = 18;
  PX.fillStyle = PONG_TURQ; PX.font = 'bold 20px Nunito'; PX.textBaseline = 'alphabetic';
  PX.fillText('MORDELÓN PONG', PW/2, 152);
  PX.restore();
  PX.fillStyle = PONG_LIGHT; PX.font = '10px Nunito';
  PX.fillText('¡Defendé el sanguche!', PW/2, 169);

  // Separador
  PX.strokeStyle = 'rgba(61,191,184,0.18)'; PX.lineWidth = 1;
  PX.beginPath(); PX.moveTo(45, 180); PX.lineTo(PW-45, 180); PX.stroke();

  PX.fillStyle = '#383838'; PX.font = '10px Nunito';
  PX.fillText('Récord: ' + pHi, PW/2, 195);

  // Botón con glow
  PX.save();
  PX.shadowColor = PONG_TURQ; PX.shadowBlur = 20;
  const bgrad = PX.createLinearGradient(PW/2-62, 210, PW/2+62, 248);
  bgrad.addColorStop(0, PONG_LIGHT); bgrad.addColorStop(1, PONG_DARK);
  PX.fillStyle = bgrad;
  _rrect(PW/2-62, 210, 124, 38, 10); PX.fill();
  PX.restore();
  PX.fillStyle = '#051a19'; PX.font = 'bold 14px Nunito'; PX.textBaseline = 'middle';
  PX.fillText('▶  JUGAR', PW/2, 229);

  // Info vidas
  PX.fillStyle = '#1e1e1e'; PX.font = '9px Nunito'; PX.textBaseline = 'alphabetic';
  PX.fillText('🔥🔥🔥  vs  🧅🧅🧅', PW/2, 272);
  PX.fillStyle = '#252525'; PX.font = '9px Nunito';
  PX.fillText('Primero en perder 3 vidas, pierde', PW/2, 286);
  PX.fillStyle = '#1e1e1e';
  PX.fillText('Mové con el dedo · ← → · mouse', PW/2, 304);
}

// ── Controles ──────────────────────────────────────────────────────────────
function _arrancar() {
  if (!pEnEspera) return;
  pEnEspera = false; pInit();
}

function _bindPongEvents() {
  const canvas = document.getElementById('pongCanvas');
  if (!canvas) return;

  canvas.addEventListener('pointerdown', function (e) {
    _getAC();
    // Detectar click en botón pausa (arriba derecha)
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (PW / rect.width);
    const cy = (e.clientY - rect.top)  * (PH / rect.height);
    if (pRunning && !pOver && !pEnEspera && cx >= PW-26 && cx <= PW-4 && cy >= 4 && cy <= 26) {
      _togglePause(); return;
    }
    if (pPaused) { _togglePause(); return; }
    if (pEnEspera) { _arrancar(); return; }
    if (pOver)     { _reiniciar(); }
  }, { passive: true });

  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (!pRunning) return;
    const rect = canvas.getBoundingClientRect();
    const tx = (e.touches[0].clientX - rect.left) * (PW / rect.width);
    player.x = Math.max(0, Math.min(PW - player.w, tx - player.w / 2));
  }, { passive: false });

  canvas.addEventListener('mousemove', function (e) {
    if (!pRunning) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (PW / rect.width);
    player.x = Math.max(0, Math.min(PW - player.w, mx - player.w / 2));
  });

  function _bindBtn(id, setter) {
    const btn = document.getElementById(id); if (!btn) return;
    btn.addEventListener('pointerdown', function(e) { e.preventDefault(); _getAC(); setter(true); }, { passive: false });
    const stop = () => setter(false);
    btn.addEventListener('pointerup',     stop, { passive: true });
    btn.addEventListener('pointercancel', stop, { passive: true });
    btn.addEventListener('pointerleave',  stop, { passive: true });
  }
  _bindBtn('pongBtnLeft',  function(v) { _btnLeft  = v; });
  _bindBtn('pongBtnRight', function(v) { _btnRight = v; });
}

document.addEventListener('keydown', function (e) {
  const panel = document.getElementById('juegoPong');
  if (panel && panel.style.display === 'none') return;
  if (e.code === 'Space') {
    e.preventDefault(); _getAC();
    if (pEnEspera) { _arrancar(); return; }
    if (pOver)     { _reiniciar(); return; }
  }
  if (e.key === 'ArrowLeft')  { e.preventDefault(); _keyLeft  = true; }
  if (e.key === 'ArrowRight') { e.preventDefault(); _keyRight = true; }
  if (e.key === 'p' || e.key === 'P') { _togglePause(); }
});

document.addEventListener('keyup', function (e) {
  if (e.key === 'ArrowLeft')  _keyLeft  = false;
  if (e.key === 'ArrowRight') _keyRight = false;
});

async function _reiniciar() {
  if (typeof window.juegoRequiereFichas === 'function' && window.juegoRequiereFichas('pong')) {
    if (typeof window.juegoConsumirFicha === 'function') {
      var ok = await window.juegoConsumirFicha('pong');
      if (!ok) { if (typeof showToast === 'function') showToast('🎟️ Sin fichas para Pong'); return; }
    }
  }
  pOver = false; pEnEspera = false;
  pInit();
}

// ── Exports ────────────────────────────────────────────────────────────────
window.pongInit  = pInit;
window.pongReset = _reiniciar;

// ── Inicialización ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  if (_initCanvas()) { pDrawStart(); _bindPongEvents(); }
});
if (document.readyState !== 'loading') {
  if (_initCanvas()) { pDrawStart(); _bindPongEvents(); }
}

})();
