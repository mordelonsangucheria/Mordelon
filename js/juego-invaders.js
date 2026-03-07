// ===================== SPACE INVADERS — MORDELÓN =====================
const IVC = document.getElementById('invadersCanvas');
const IVX = IVC.getContext('2d');
const IVW = 320, IVH = 220;

let ivPlayer, ivBullets, ivEnemies, ivParticles, ivScore, ivHi, ivLives, ivWave;
let ivRunning = false, ivOver = false, ivFrame = 0, ivAnimFrame;
let ivEnemyDir, ivEnemySpeed, ivEnemyDropTimer, ivShootCooldown;
let ivEnemyBullets;

ivHi = parseInt(localStorage.getItem('invadersHiC') || '0');

const IV_ENEMY_TYPES = [
  { emoji: '🌶️', pts: 40, color: '#FF4D4D' },
  { emoji: '🧅', pts: 30, color: '#D4831A' },
  { emoji: '🥚', pts: 20, color: '#FFD700' },
  { emoji: '🍅', pts: 10, color: '#2DC653' },
];

function ivInit() {
  ivPlayer = { x: IVW / 2 - 12, y: IVH - 28, w: 26, h: 22, speed: 3.5 };
  ivBullets = [];
  ivEnemyBullets = [];
  ivParticles = [];
  ivScore = 0;
  ivLives = 3;
  ivWave = 1;
  ivFrame = 0;
  ivShootCooldown = 0;
  ivOver = false;
  ivRunning = true;

  document.getElementById('invadersScore').textContent = '0';
  document.getElementById('invadersHi').textContent = ivHi;
  document.getElementById('invadersLives').textContent = '🔥'.repeat(ivLives);

  ivSpawnWave();

  cancelAnimationFrame(ivAnimFrame);
  ivLoop();

  ivStartKeyMovement(); // ← inicia control teclado
}

function ivSpawnWave() {
  ivEnemies = [];
  ivEnemyDir = 1;
  ivEnemySpeed = 0.4 + ivWave * 0.15;

  const cols = Math.min(8, 5 + Math.floor(ivWave / 3));
  const rows = Math.min(4, 3 + Math.floor(ivWave / 4));
  const startX = (IVW - cols * 30) / 2;

  for (let r = 0; r < rows; r++) {
    const type = IV_ENEMY_TYPES[r % IV_ENEMY_TYPES.length];
    for (let c = 0; c < cols; c++) {
      ivEnemies.push({
        x: startX + c * 30,
        y: 20 + r * 24,
        w: 22,
        h: 18,
        type: type,
        alive: true
      });
    }
  }
}

// ---------------- GAME LOOP ----------------

function ivLoop() {
  if (!ivRunning) return;

  ivFrame++;

  if (ivShootCooldown > 0) ivShootCooldown--;

  for (let i = ivBullets.length - 1; i >= 0; i--) {
    ivBullets[i].y -= 5;
    if (ivBullets[i].y < -10) ivBullets.splice(i, 1);
  }

  for (let i = ivEnemyBullets.length - 1; i >= 0; i--) {
    ivEnemyBullets[i].y += 3;

    if (ivEnemyBullets[i].y > IVH + 10) {
      ivEnemyBullets.splice(i, 1);
      continue;
    }

    const eb = ivEnemyBullets[i];

    if (
      eb.x > ivPlayer.x &&
      eb.x < ivPlayer.x + ivPlayer.w &&
      eb.y > ivPlayer.y &&
      eb.y < ivPlayer.y + ivPlayer.h
    ) {
      ivEnemyBullets.splice(i, 1);
      ivPlayerHit();
    }
  }

  let hitEdge = false;
  const aliveEnemies = ivEnemies.filter(e => e.alive);

  aliveEnemies.forEach(e => {
    e.x += ivEnemyDir * ivEnemySpeed;

    if (e.x <= 2 || e.x + e.w >= IVW - 2) hitEdge = true;
  });

  if (hitEdge) {
    ivEnemyDir *= -1;
    aliveEnemies.forEach(e => e.y += 8);

    if (aliveEnemies.some(e => e.y + e.h >= ivPlayer.y)) {
      ivGameOver();
      return;
    }
  }

  if (aliveEnemies.length > 0 && ivFrame % 50 === 0) {
    const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];

    ivEnemyBullets.push({
      x: shooter.x + shooter.w / 2,
      y: shooter.y + shooter.h,
      enemy: true
    });
  }

  for (let bi = ivBullets.length - 1; bi >= 0; bi--) {
    for (let ei = 0; ei < ivEnemies.length; ei++) {

      const e = ivEnemies[ei];
      if (!e.alive) continue;

      const b = ivBullets[bi];

      if (
        b &&
        b.x > e.x &&
        b.x < e.x + e.w &&
        b.y > e.y &&
        b.y < e.y + e.h
      ) {
        e.alive = false;
        ivBullets.splice(bi, 1);

        ivScore += e.type.pts;

        document.getElementById('invadersScore').textContent = ivScore;

        if (ivScore > ivHi) {
          ivHi = ivScore;
          localStorage.setItem('invadersHiC', ivHi);
          document.getElementById('invadersHi').textContent = ivHi;
        }

        break;
      }
    }
  }

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

  document.getElementById('invadersLives').textContent =
    '🔥'.repeat(Math.max(0, ivLives));

  if (ivLives <= 0) {
    ivGameOver();
  }
}

function ivDraw() {

  IVX.fillStyle = '#0a0a0a';
  IVX.fillRect(0, 0, IVW, IVH);

  ivEnemies.forEach(e => {
    if (!e.alive) return;

    IVX.font = '14px sans-serif';
    IVX.textAlign = 'center';

    IVX.fillText(
      e.type.emoji,
      e.x + e.w / 2,
      e.y + e.h
    );
  });

  IVX.fillStyle = '#3DBFB8';
  IVX.fillRect(ivPlayer.x, ivPlayer.y, ivPlayer.w, ivPlayer.h);

  ivBullets.forEach(b => {
    IVX.fillStyle = '#FFB800';
    IVX.fillRect(b.x, b.y, 3, 8);
  });

  ivEnemyBullets.forEach(b => {
    IVX.fillStyle = '#FF4D4D';
    IVX.fillRect(b.x, b.y, 3, 6);
  });
}

function ivGameOver() {

  ivRunning = false;
  ivOver = true;

  ivStopKeyMovement(); // ← detiene teclado

  cancelAnimationFrame(ivAnimFrame);

  ivDraw();

  IVX.fillStyle = 'rgba(0,0,0,0.7)';
  IVX.fillRect(0, IVH / 2 - 40, IVW, 80);

  IVX.fillStyle = '#fff';
  IVX.font = 'bold 16px sans-serif';
  IVX.textAlign = 'center';

  IVX.fillText('GAME OVER', IVW / 2, IVH / 2);
}

// ---------------- CONTROLES ----------------

let ivKeys = {};
let ivKeyRafId = null;

document.addEventListener('keydown', e => {

  ivKeys[e.key] = true;

  if (e.code === 'Space') {
    e.preventDefault();
    ivShoot();
  }

  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
    e.preventDefault();

});

document.addEventListener('keyup', e => {
  ivKeys[e.key] = false;
});

function ivKeyMovement() {

  if (!ivRunning || ivOver) return;

  if (ivKeys['ArrowLeft'] && ivPlayer.x > 2)
    ivPlayer.x -= ivPlayer.speed;

  if (ivKeys['ArrowRight'] && ivPlayer.x + ivPlayer.w < IVW - 2)
    ivPlayer.x += ivPlayer.speed;

  ivKeyRafId = requestAnimationFrame(ivKeyMovement);
}

function ivStartKeyMovement() {

  if (ivKeyRafId)
    cancelAnimationFrame(ivKeyRafId);

  ivKeyMovement();
}

function ivStopKeyMovement() {

  if (ivKeyRafId) {
    cancelAnimationFrame(ivKeyRafId);
    ivKeyRafId = null;
  }

  ivKeys = {};
}

function ivShoot() {

  if (ivShootCooldown > 0) return;

  ivBullets.push({
    x: ivPlayer.x + ivPlayer.w / 2,
    y: ivPlayer.y - 4
  });

  ivShootCooldown = 12;
}

// ---------------- EXPORTS ----------------

window.invadersInit = ivInit;

window.invadersReset = function () {

  cancelAnimationFrame(ivAnimFrame);

  ivInit();
};
