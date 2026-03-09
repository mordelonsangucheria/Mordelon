// ===================== SPACE INVADERS — MORDELÓN =====================
// La llama de Mordelón defiende la cocina de ingredientes invasores
const IVC = document.getElementById('invadersCanvas');
const IVX = IVC.getContext('2d');
const IVW = 320, IVH = 220;

let ivPlayer, ivBullets, ivEnemies, ivParticles, ivScore, ivHi, ivLives, ivWave;
let ivRunning = false, ivOver = false, ivPaused = false, ivFrame = 0, ivAnimFrame;
let ivDificultad = 0; // 0=fácil, 1=normal, 2=medio-alto, 3=alto, 4=extremo
window.setInvadersDificultad = function(val) { ivDificultad = parseInt(val) || 0; };
let ivEnemyDir, ivEnemySpeed, ivEnemyDropTimer, ivShootCooldown;
let ivEnemyBullets;
ivHi = parseInt(localStorage.getItem('invadersHiC') || '0');

// Emojis de comida enemiga por fila
const IV_ENEMY_TYPES = [
  { emoji: '🌶️', pts: 40, color: '#FF4D4D' },   // fila superior — más puntos
  { emoji: '🧅', pts: 30, color: '#D4831A' },
  { emoji: '🥚', pts: 20, color: '#FFD700' },
  { emoji: '🍅', pts: 10, color: '#2DC653' },     // fila inferior — menos puntos
];

function ivInit() {
  ivPlayer = { x: IVW / 2 - 12, y: IVH - 28, w: 26, h: 22, speed: 3.5 };
  ivBullets = [];
  ivEnemyBullets = [];
  ivParticles = [];
  ivScore = 0;
  // Vidas según dificultad: fácil=5, normal=3, medio-alto=3, alto=2, extremo=1
  const vidasPorDif = [5, 3, 3, 2, 1];
  ivLives = vidasPorDif[ivDificultad] || 3;
  ivWave = 1;
  ivFrame = 0;
  ivShootCooldown = 0;
  ivOver = false;
  ivPaused = false;
  window.ivPausedState = false;
  ivRunning = true;
  document.getElementById('invadersScore').textContent = '0';
  document.getElementById('invadersHi').textContent = ivHi;
  document.getElementById('invadersLives').textContent = '🔥'.repeat(ivLives);
  ivSpawnWave();
  cancelAnimationFrame(ivAnimFrame);
  ivLoop();
}

function ivSpawnWave() {
  ivEnemies = [];
  ivEnemyDir = 1;
  // Velocidad base según dificultad: fácil=0.25, normal=0.4, medio-alto=0.6, alto=0.85, extremo=1.2
  const velBasePorDif = [0.25, 0.4, 0.6, 0.85, 1.2];
  const velBase = velBasePorDif[ivDificultad] || 0.4;
  ivEnemySpeed = velBase + ivWave * 0.15;
  ivEnemyDropTimer = 0;
  const cols = Math.min(8, 5 + Math.floor(ivWave / 3));
  const rows = Math.min(4, 3 + Math.floor(ivWave / 4));
  const startX = (IVW - cols * 30) / 2;
  for (let r = 0; r < rows; r++) {
    const type = IV_ENEMY_TYPES[r % IV_ENEMY_TYPES.length];
    for (let c = 0; c < cols; c++) {
      ivEnemies.push({
        x: startX + c * 30,
        y: 20 + r * 24,
        w: 22, h: 18,
        type: type,
        alive: true,
        frame: 0
      });
    }
  }
}

// ── Drawing helpers ──────────────────────────────────────────

function ivDrawPlayer() {
  const px = ivPlayer.x, py = ivPlayer.y;
  const T = '#3DBFB8', L = '#7EEEE9', D = '#1A8C87', W = '#FFFFFF', E = '#0a1a1a';

  // Flame body
  IVX.fillStyle = T;
  IVX.fillRect(px + 5, py + 4, 16, 14);
  IVX.fillStyle = L;
  IVX.fillRect(px + 7, py + 2, 12, 6);
  // Flame tip
  IVX.fillStyle = L;
  IVX.fillRect(px + 10, py, 6, 4);
  // Dark sides
  IVX.fillStyle = D;
  IVX.fillRect(px + 3, py + 10, 4, 8);
  IVX.fillRect(px + 19, py + 10, 4, 8);
  // Eyes
  IVX.fillStyle = W;
  IVX.fillRect(px + 7, py + 8, 5, 5);
  IVX.fillRect(px + 14, py + 8, 5, 5);
  IVX.fillStyle = E;
  IVX.fillRect(px + 9, py + 10, 2, 2);
  IVX.fillRect(px + 16, py + 10, 2, 2);
  // Mouth / smile
  IVX.fillStyle = L;
  IVX.fillRect(px + 8, py + 15, 10, 2);
  // Base / feet
  IVX.fillStyle = T;
  IVX.fillRect(px + 6, py + 18, 5, 3);
  IVX.fillRect(px + 15, py + 18, 5, 3);
}

function ivDrawEnemy(e) {
  if (!e.alive) return;
  const wiggle = Math.sin(ivFrame * 0.08 + e.x * 0.1) * 1.5;

  // Body background
  IVX.fillStyle = e.type.color + '33';
  IVX.fillRect(e.x - 1, e.y - 1 + wiggle, e.w + 2, e.h + 2);
  IVX.fillStyle = e.type.color;
  IVX.fillRect(e.x + 2, e.y + 2 + wiggle, e.w - 4, e.h - 4);

  // Emoji
  IVX.font = '12px sans-serif';
  IVX.textAlign = 'center';
  IVX.fillText(e.type.emoji, e.x + e.w / 2, e.y + e.h - 3 + wiggle);
}

function ivDrawBullet(b) {
  IVX.fillStyle = b.enemy ? '#FF4D4D' : '#FFB800';
  IVX.fillRect(b.x - 1, b.y, 3, b.enemy ? 6 : 8);
  if (!b.enemy) {
    // Glow effect for player bullets
    IVX.fillStyle = 'rgba(255,184,0,0.3)';
    IVX.fillRect(b.x - 3, b.y - 2, 7, 12);
  }
}

function ivDrawParticle(p) {
  IVX.globalAlpha = p.life;
  IVX.fillStyle = p.color;
  IVX.fillRect(p.x, p.y, p.size, p.size);
  IVX.globalAlpha = 1;
}

function ivSpawnExplosion(x, y, color) {
  for (let i = 0; i < 8; i++) {
    ivParticles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      size: 2 + Math.random() * 3,
      color: color,
      life: 1
    });
  }
}

// ── Game loop ────────────────────────────────────────────────

function ivDrawPaused() {
  ivDraw();
  IVX.fillStyle = 'rgba(0,0,0,0.6)';
  IVX.fillRect(0, IVH / 2 - 30, IVW, 60);
  IVX.fillStyle = '#fff';
  IVX.font = 'bold 16px Nunito';
  IVX.textAlign = 'center';
  IVX.fillText('PAUSA', IVW / 2, IVH / 2 - 6);
  IVX.font = '10px Nunito';
  IVX.fillStyle = '#555';
  IVX.fillText('Tap o P para continuar', IVW / 2, IVH / 2 + 14);
}

function ivTogglePause() {
  if (!ivRunning || ivOver) return;
  ivPaused = !ivPaused;
  window.ivPausedState = ivPaused;
  if (ivPaused) {
    cancelAnimationFrame(ivAnimFrame);
    ivDrawPaused();
  } else {
    ivLoop();
  }
}

function ivLoop() {
  if (!ivRunning || ivPaused) return;
  ivFrame++;
  if (ivShootCooldown > 0) ivShootCooldown--;

  // Move player bullets
  for (let i = ivBullets.length - 1; i >= 0; i--) {
    ivBullets[i].y -= 5;
    if (ivBullets[i].y < -10) ivBullets.splice(i, 1);
  }

  // Move enemy bullets
  for (let i = ivEnemyBullets.length - 1; i >= 0; i--) {
    ivEnemyBullets[i].y += 3;
    if (ivEnemyBullets[i].y > IVH + 10) { ivEnemyBullets.splice(i, 1); continue; }
    // Hit player?
    const eb = ivEnemyBullets[i];
    if (eb && eb.x > ivPlayer.x && eb.x < ivPlayer.x + ivPlayer.w &&
        eb.y > ivPlayer.y && eb.y < ivPlayer.y + ivPlayer.h) {
      ivEnemyBullets.splice(i, 1);
      ivPlayerHit();
    }
  }

  // Move enemies
  let hitEdge = false;
  const aliveEnemies = ivEnemies.filter(e => e.alive);
  aliveEnemies.forEach(e => {
    e.x += ivEnemyDir * ivEnemySpeed;
    if (e.x <= 2 || e.x + e.w >= IVW - 2) hitEdge = true;
  });
  if (hitEdge) {
    ivEnemyDir *= -1;
    aliveEnemies.forEach(e => { e.y += 8; });
    // Check if enemies reached player
    if (aliveEnemies.some(e => e.y + e.h >= ivPlayer.y)) {
      ivGameOver();
      return;
    }
  }

  // Enemy shooting
  // Frecuencia de disparo según dificultad: fácil=80, normal=60, medio-alto=45, alto=35, extremo=22
  const shootFreqPorDif = [80, 60, 45, 35, 22];
  const shootFreqBase = shootFreqPorDif[ivDificultad] || 60;
  if (aliveEnemies.length > 0 && ivFrame % Math.max(14, shootFreqBase - ivWave * 5) === 0) {
    const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
    ivEnemyBullets.push({ x: shooter.x + shooter.w / 2, y: shooter.y + shooter.h, enemy: true });
  }

  // Bullet-enemy collision
  for (let bi = ivBullets.length - 1; bi >= 0; bi--) {
    for (let ei = 0; ei < ivEnemies.length; ei++) {
      const e = ivEnemies[ei];
      if (!e.alive) continue;
      const b = ivBullets[bi];
      if (b && b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
        e.alive = false;
        ivBullets.splice(bi, 1);
        ivScore += e.type.pts;
        ivSpawnExplosion(e.x + e.w / 2, e.y + e.h / 2, e.type.color);
        document.getElementById('invadersScore').textContent = ivScore;
        if (ivScore > ivHi) {
          ivHi = ivScore;
          localStorage.setItem('invadersHiC', ivHi);
          document.getElementById('invadersHi').textContent = ivHi;
          if (typeof window.notificarRecordJuego === 'function') window.notificarRecordJuego('invaders', ivHi);
        }
        // Speed up as enemies die — más agresivo en dificultades altas
        const velBasePorDif2 = [0.25, 0.4, 0.6, 0.85, 1.2];
        const vb = velBasePorDif2[ivDificultad] || 0.4;
        const accelPorDif = [1.0, 1.5, 1.8, 2.2, 2.8];
        const accel = accelPorDif[ivDificultad] || 1.5;
        ivEnemySpeed = (vb + ivWave * 0.15) * (1 + (1 - aliveEnemies.filter(x=>x.alive).length / ivEnemies.length) * accel);
        break;
      }
    }
  }

  // Update particles
  for (let i = ivParticles.length - 1; i >= 0; i--) {
    const p = ivParticles[i];
    p.x += p.vx; p.y += p.vy;
    p.life -= 0.03;
    if (p.life <= 0) ivParticles.splice(i, 1);
  }

  // Wave complete?
  if (aliveEnemies.filter(e => e.alive).length === 0) {
    ivWave++;
    ivEnemyBullets.length = 0;
    ivSpawnWave();
  }

  ivDraw();
  ivAnimFrame = requestAnimationFrame(ivLoop);
}

function ivPlayerHit() {
  ivLives--;
  ivSpawnExplosion(ivPlayer.x + ivPlayer.w / 2, ivPlayer.y + ivPlayer.h / 2, '#3DBFB8');
  document.getElementById('invadersLives').textContent = '🔥'.repeat(Math.max(0, ivLives));
  if (ivLives <= 0) {
    ivGameOver();
  }
}

function ivDraw() {
  // Background
  IVX.fillStyle = '#0a0a0a';
  IVX.fillRect(0, 0, IVW, IVH);

  // Stars (subtle)
  IVX.fillStyle = '#1a1a1a';
  for (let i = 0; i < 30; i++) {
    const sx = (i * 37 + ivFrame * 0.05) % IVW;
    const sy = (i * 53 + 10) % (IVH - 40);
    IVX.fillRect(sx, sy, 1, 1);
  }

  // Ground line
  IVX.strokeStyle = '#222';
  IVX.lineWidth = 1;
  IVX.beginPath();
  IVX.moveTo(0, IVH - 6);
  IVX.lineTo(IVW, IVH - 6);
  IVX.stroke();

  // Enemies
  ivEnemies.forEach(e => ivDrawEnemy(e));

  // Player
  ivDrawPlayer();

  // Bullets
  ivBullets.forEach(b => ivDrawBullet(b));
  ivEnemyBullets.forEach(b => ivDrawBullet(b));

  // Particles
  ivParticles.forEach(p => ivDrawParticle(p));

  // Wave indicator
  IVX.fillStyle = '#333';
  IVX.font = '9px Nunito';
  IVX.textAlign = 'right';
  IVX.fillText('Oleada ' + ivWave, IVW - 6, IVH - 9);
}

function ivGameOver() {
  ivRunning = false;
  ivOver = true;
  cancelAnimationFrame(ivAnimFrame);
  ivDraw();
  IVX.fillStyle = 'rgba(0,0,0,0.7)';
  IVX.fillRect(0, IVH / 2 - 40, IVW, 80);
  IVX.fillStyle = '#fff';
  IVX.font = 'bold 16px Nunito';
  IVX.textAlign = 'center';
  IVX.fillText('GAME OVER', IVW / 2, IVH / 2 - 12);
  IVX.font = '11px Nunito';
  IVX.fillStyle = '#aaa';
  IVX.fillText('Puntos: ' + ivScore + '  |  Récord: ' + ivHi + '  |  Oleada: ' + ivWave, IVW / 2, IVH / 2 + 8);
  IVX.font = '10px Nunito';
  IVX.fillStyle = '#555';
  IVX.fillText('Tap o Espacio para reiniciar', IVW / 2, IVH / 2 + 28);
  setTimeout(function(){ if(typeof window.abrirLeaderboard==='function') window.abrirLeaderboard('invaders', ivScore); }, 1200);
}

// ── Controls ─────────────────────────────────────────────────

let ivKeys = {};
document.addEventListener('keydown', e => {
  if (document.getElementById('juegoInvaders').style.display === 'none') return;
  ivKeys[e.key] = true;
  if (e.code === 'Space') { e.preventDefault(); ivHandleAction(); }
  if (e.key === 'p' || e.key === 'P') ivTogglePause();
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
});
document.addEventListener('keyup', e => { ivKeys[e.key] = false; });

// Continuous movement via keys
function ivKeyMovement() {
  if (ivRunning && !ivOver) {
    if (ivKeys['ArrowLeft'] && ivPlayer.x > 2) ivPlayer.x -= ivPlayer.speed;
    if (ivKeys['ArrowRight'] && ivPlayer.x + ivPlayer.w < IVW - 2) ivPlayer.x += ivPlayer.speed;
  }
  requestAnimationFrame(ivKeyMovement);
}

function ivShoot() {
  if (ivShootCooldown > 0) return;
  ivBullets.push({ x: ivPlayer.x + ivPlayer.w / 2, y: ivPlayer.y - 4 });
  ivShootCooldown = 12;
}

async function ivHandleAction() {
  if (ivOver) {
    // Restart — check fichas
    if (typeof window.juegoRequiereFichas === 'function' && window.juegoRequiereFichas('invaders')) {
      if (typeof window.juegoConsumirFicha === 'function') {
        var ok = await window.juegoConsumirFicha('invaders');
        if (!ok) { if (typeof showToast === 'function') showToast('🎟️ Sin fichas para Invaders'); return; }
      }
    }
    ivInit();
    return;
  }
  ivShoot();
}

// Touch controls
(function () {
  let touchX = null, isShooting = false;

  IVC.addEventListener('touchstart', function (e) {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = IVC.getBoundingClientRect();
    touchX = touch.clientX - rect.left;

    if (ivOver) {
      ivHandleAction();
      return;
    }
    // Shoot on tap
    ivShoot();
    isShooting = true;
  }, { passive: false });

  IVC.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (ivOver || !ivRunning) return;
    const touch = e.touches[0];
    const rect = IVC.getBoundingClientRect();
    const newX = touch.clientX - rect.left;
    const scale = IVW / rect.width;
    if (touchX !== null) {
      ivPlayer.x += (newX - touchX) * scale;
      ivPlayer.x = Math.max(2, Math.min(IVW - ivPlayer.w - 2, ivPlayer.x));
    }
    touchX = newX;
  }, { passive: false });

  IVC.addEventListener('touchend', function () {
    touchX = null;
    isShooting = false;
  }, { passive: true });

  // Click for desktop
  IVC.addEventListener('click', function (e) {
    if (ivOver) { ivHandleAction(); return; }
    ivShoot();
  });
})();

// Auto-shoot while holding space
setInterval(function () {
  if (ivRunning && !ivOver && ivKeys[' ']) ivShoot();
}, 120);

// ── Exports ──────────────────────────────────────────────────

window.invadersInit = ivInit;
window.invadersPause = ivTogglePause;
window.invadersReset = async function () {
  if (typeof window.juegoRequiereFichas === 'function' && window.juegoRequiereFichas('invaders')) {
    if (typeof window.juegoConsumirFicha === 'function') {
      var ok = await window.juegoConsumirFicha('invaders');
      if (!ok) { if (typeof showToast === 'function') showToast('🎟️ Sin fichas para Invaders'); return; }
    }
  }
  cancelAnimationFrame(ivAnimFrame);
  ivInit();
};

// Start key movement loop
ivKeyMovement();
