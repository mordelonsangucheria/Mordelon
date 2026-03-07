// ===================== SPACE INVADERS — MORDELÓN =====================
// La llama de Mordelón defiende la cocina de ingredientes invasores
const IVC = document.getElementById('invadersCanvas');
const IVX = IVC.getContext('2d');
const IVW = 320, IVH = 220;

let ivPlayer, ivBullets, ivEnemies, ivParticles, ivScore, ivHi, ivLives, ivWave;
let ivRunning = false, ivOver = false, ivPaused = false, ivFrame = 0, ivAnimFrame;
let ivDificultad = 1; // 0=fácil, 1=normal, 2=medio-alto, 3=alto, 4=extremo
window.setInvadersDificultad = function(val) { ivDificultad = parseInt(val) ?? 1; };
let ivEnemyDir, ivEnemySpeed, ivEnemyDropTimer, ivShootCooldown;
let ivEnemyBullets;
ivHi = parseInt(localStorage.getItem('invadersHiC') || '0');

// ── Combo score ──────────────────────────────────────────────
let ivCombo = 0, ivComboTimer = 0, ivComboPopups = [];
const IV_COMBO_TIMEOUT = 90;

// ── Screen shake ─────────────────────────────────────────────
let ivShakeAmount = 0;
function ivScreenShake(amount) { ivShakeAmount = Math.max(ivShakeAmount, amount); }

// ── Mini muros ───────────────────────────────────────────────
let ivWalls = [];
const IV_WALL_COLS = 3;
const IV_WALL_BLOCK = 5;

function ivInitWalls() {
  ivWalls = [];
  const wallW = 5, wallH = 3;
  const gap = IVW / (IV_WALL_COLS + 1);
  for (let w = 0; w < IV_WALL_COLS; w++) {
    const wx = gap * (w + 1) - (wallW * IV_WALL_BLOCK) / 2;
    const wy = IVH - 55;
    for (let r = 0; r < wallH; r++) {
      for (let c = 0; c < wallW; c++) {
        ivWalls.push({ x: wx + c * IV_WALL_BLOCK, y: wy + r * IV_WALL_BLOCK, hp: 2 });
      }
    }
  }
}

// ── Mini jefe (cada 5 oleadas) ───────────────────────────────
let ivBoss = null;
const IV_BOSS_TYPES = [
  { emoji: '🍕', pts: 500, color: '#FF6B35', hp: 15, label: '¡PIZZA BOSS!' },
  { emoji: '🌮', pts: 600, color: '#FFD700', hp: 18, label: '¡TACO BOSS!' },
  { emoji: '🍔', pts: 700, color: '#D4831A', hp: 20, label: '¡BURGER BOSS!' },
];

function ivSpawnBoss() {
  const idx = Math.floor((ivWave / 5 - 1)) % IV_BOSS_TYPES.length;
  const type = IV_BOSS_TYPES[idx];
  ivBoss = {
    x: IVW / 2 - 22, y: 18, w: 44, h: 30,
    hp: type.hp + Math.floor(ivWave / 5) * 3,
    maxHp: type.hp + Math.floor(ivWave / 5) * 3,
    type, dir: 1,
    speed: 0.8 + ivWave * 0.05,
    shootTimer: 0, hitFlash: 0, alive: true,
  };
}

function ivUpdateBoss() {
  if (!ivBoss || !ivBoss.alive) return;
  const b = ivBoss;
  b.x += b.dir * b.speed;
  if (b.x <= 4 || b.x + b.w >= IVW - 4) { b.dir *= -1; b.y += 6; }
  if (b.y + b.h >= ivPlayer.y) { ivGameOver(); return; }

  b.shootTimer++;
  const freq = Math.max(25, 60 - ivWave * 3);
  if (b.shootTimer >= freq) {
    b.shootTimer = 0;
    [-0.3, 0, 0.3].forEach(angle => {
      ivEnemyBullets.push({ x: b.x + b.w / 2, y: b.y + b.h, vx: Math.sin(angle) * 2.5, enemy: true, boss: true });
    });
  }

  for (let bi = ivBullets.length - 1; bi >= 0; bi--) {
    const bul = ivBullets[bi];
    if (bul.x > b.x && bul.x < b.x + b.w && bul.y > b.y && bul.y < b.y + b.h) {
      ivBullets.splice(bi, 1);
      b.hp--;
      b.hitFlash = 5;
      ivSpawnExplosionSmall(bul.x, bul.y, b.type.color);
      if (b.hp <= 0) {
        b.alive = false;
        ivSpawnExplosionBig(b.x + b.w / 2, b.y + b.h / 2, b.type.color);
        ivAddScore(b.type.pts, b.x + b.w / 2, b.y, true);
        ivScreenShake(14);
        setTimeout(() => { ivWave++; ivEnemyBullets.length = 0; ivBoss = null; ivInitWalls(); ivSpawnWave(); }, 700);
      }
      break;
    }
  }
}

function ivDrawBoss() {
  if (!ivBoss || !ivBoss.alive) return;
  const b = ivBoss;
  const wiggle = Math.sin(ivFrame * 0.1) * 2;
  if (b.hitFlash > 0) {
    IVX.fillStyle = 'rgba(255,255,255,0.6)';
    IVX.fillRect(b.x - 4, b.y - 4 + wiggle, b.w + 8, b.h + 8);
    b.hitFlash--;
  }
  const pulse = 0.3 + 0.2 * Math.sin(ivFrame * 0.15);
  IVX.fillStyle = b.type.color + Math.floor(pulse * 255).toString(16).padStart(2, '0');
  IVX.fillRect(b.x - 6, b.y - 6 + wiggle, b.w + 12, b.h + 12);
  IVX.fillStyle = b.type.color;
  IVX.fillRect(b.x, b.y + wiggle, b.w, b.h);
  IVX.font = '22px sans-serif';
  IVX.textAlign = 'center';
  IVX.fillText(b.type.emoji, b.x + b.w / 2, b.y + b.h - 4 + wiggle);
  // Barra de vida
  const barW = b.w + 10, barX = b.x - 5, barY = b.y - 8 + wiggle;
  IVX.fillStyle = '#300'; IVX.fillRect(barX, barY, barW, 4);
  const hpPct = b.hp / b.maxHp;
  IVX.fillStyle = hpPct > 0.5 ? '#2DC653' : hpPct > 0.25 ? '#FFB800' : '#FF4D4D';
  IVX.fillRect(barX, barY, barW * hpPct, 4);
}

// ── Emojis de comida enemiga ─────────────────────────────────
const IV_ENEMY_TYPES = [
  { emoji: '🌶️', pts: 40, color: '#FF4D4D' },
  { emoji: '🧅', pts: 30, color: '#D4831A' },
  { emoji: '🥚', pts: 20, color: '#FFD700' },
  { emoji: '🍅', pts: 10, color: '#2DC653' },
];

// ── Init ─────────────────────────────────────────────────────
function ivInit() {
  ivPlayer = { x: IVW / 2 - 12, y: IVH - 28, w: 26, h: 22, speed: 3.5 };
  ivBullets = []; ivEnemyBullets = []; ivParticles = []; ivComboPopups = [];
  ivBoss = null; ivCombo = 0; ivComboTimer = 0; ivShakeAmount = 0;
  ivScore = 0;
  const vidasPorDif = [5, 3, 3, 2, 1];
  ivLives = vidasPorDif[ivDificultad] || 3;
  ivWave = 1; ivFrame = 0; ivShootCooldown = 0;
  ivOver = false; ivPaused = false; window.ivPausedState = false; ivRunning = true;
  document.getElementById('invadersScore').textContent = '0';
  document.getElementById('invadersHi').textContent = ivHi;
  document.getElementById('invadersLives').textContent = '🔥'.repeat(ivLives);
  ivInitWalls();
  ivSpawnWave();
  cancelAnimationFrame(ivAnimFrame);
  ivLoop();
}

function ivSpawnWave() {
  ivEnemies = [];
  ivEnemyDir = 1;
  const velBasePorDif = [0.25, 0.4, 0.6, 0.85, 1.2];
  const velBase = velBasePorDif[ivDificultad] || 0.4;
  ivEnemySpeed = velBase + ivWave * 0.15;
  ivEnemyDropTimer = 0;

  if (ivWave % 5 === 0) { ivSpawnBoss(); return; }

  const cols = Math.min(8, 5 + Math.floor(ivWave / 3));
  const rows = Math.min(4, 3 + Math.floor(ivWave / 4));
  const startX = (IVW - cols * 30) / 2;
  for (let r = 0; r < rows; r++) {
    const type = IV_ENEMY_TYPES[r % IV_ENEMY_TYPES.length];
    for (let c = 0; c < cols; c++) {
      ivEnemies.push({ x: startX + c * 30, y: 20 + r * 24, w: 22, h: 18, type, alive: true, frame: 0 });
    }
  }
}

// ── Score con combo ──────────────────────────────────────────
function ivAddScore(basePts, x, y, isBoss = false) {
  ivCombo++;
  ivComboTimer = IV_COMBO_TIMEOUT;
  const multiplier = Math.min(ivCombo, 8);
  const pts = basePts * multiplier;
  ivScore += pts;
  document.getElementById('invadersScore').textContent = ivScore;

  let label = '+' + pts;
  if (multiplier >= 2) label += ' x' + multiplier + '!';
  if (isBoss) label = '🔥 BOSS! +' + pts;
  const colors = ['#FFD700','#FFB800','#D4831A','#FF6B35','#FF4D4D'];
  ivComboPopups.push({
    x, y, text: label, life: 1,
    color: isBoss ? '#FFB800' : colors[Math.min(multiplier - 1, colors.length - 1)],
    vy: -1.2,
  });

  if (ivScore > ivHi) {
    ivHi = ivScore;
    localStorage.setItem('invadersHiC', ivHi);
    document.getElementById('invadersHi').textContent = ivHi;
    if (typeof window.notificarRecordJuego === 'function') window.notificarRecordJuego('invaders', ivHi);
  }
}

// ── Explosiones ──────────────────────────────────────────────
function ivSpawnExplosionSmall(x, y, color) {
  for (let i = 0; i < 8; i++) {
    ivParticles.push({ x, y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, size: 2 + Math.random() * 3, color, life: 1 });
  }
}

function ivSpawnExplosion(x, y, color) {
  ivParticles.push({ x, y, vx: 0, vy: 0, size: 2, color, life: 1, ring: true, ringR: 2 });
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3.5;
    ivParticles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 2 + Math.random() * 4, color: i % 3 === 0 ? '#FFD700' : color, life: 1 });
  }
  for (let i = 0; i < 6; i++) {
    ivParticles.push({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 4, size: 1.5, color: '#fff', life: 0.8 });
  }
  ivScreenShake(4);
}

function ivSpawnExplosionBig(x, y, color) {
  ivScreenShake(14);
  ivParticles.push({ x, y, vx: 0, vy: 0, size: 4, color, life: 1, ring: true, ringR: 3 });
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    ivParticles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 3 + Math.random() * 6, color: [color, '#FFD700', '#FF4D4D', '#fff'][Math.floor(Math.random() * 4)], life: 1 });
  }
  for (let i = 0; i < 12; i++) {
    ivParticles.push({ x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 6 - 1, size: 2 + Math.random() * 3, color: '#FFB800', life: 1.2 });
  }
}

// ── Drawing ──────────────────────────────────────────────────
function ivDrawPlayer() {
  const px = ivPlayer.x, py = ivPlayer.y;
  const T = '#3DBFB8', L = '#7EEEE9', D = '#1A8C87', W = '#FFFFFF', E = '#0a1a1a';
  IVX.fillStyle = T; IVX.fillRect(px + 5, py + 4, 16, 14);
  IVX.fillStyle = L; IVX.fillRect(px + 7, py + 2, 12, 6);
  IVX.fillStyle = L; IVX.fillRect(px + 10, py, 6, 4);
  IVX.fillStyle = D; IVX.fillRect(px + 3, py + 10, 4, 8);
  IVX.fillStyle = D; IVX.fillRect(px + 19, py + 10, 4, 8);
  IVX.fillStyle = W; IVX.fillRect(px + 7, py + 8, 5, 5);
  IVX.fillStyle = W; IVX.fillRect(px + 14, py + 8, 5, 5);
  IVX.fillStyle = E; IVX.fillRect(px + 9, py + 10, 2, 2);
  IVX.fillStyle = E; IVX.fillRect(px + 16, py + 10, 2, 2);
  IVX.fillStyle = L; IVX.fillRect(px + 8, py + 15, 10, 2);
  IVX.fillStyle = T; IVX.fillRect(px + 6, py + 18, 5, 3);
  IVX.fillStyle = T; IVX.fillRect(px + 15, py + 18, 5, 3);
}

function ivDrawWalls() {
  ivWalls.forEach(bl => {
    if (bl.hp <= 0) return;
    const alpha = 0.3 + (bl.hp / 3) * 0.5;
    IVX.fillStyle = `rgba(61,191,184,${alpha})`;
    IVX.fillRect(bl.x, bl.y, IV_WALL_BLOCK - 1, IV_WALL_BLOCK - 1);
    if (bl.hp === 2) {
      IVX.fillStyle = 'rgba(126,238,233,0.5)';
      IVX.fillRect(bl.x, bl.y, IV_WALL_BLOCK - 1, 1);
    }
  });
}

function ivDrawEnemy(e) {
  if (!e.alive) return;
  const wiggle = Math.sin(ivFrame * 0.08 + e.x * 0.1) * 1.5;
  IVX.fillStyle = e.type.color + '33';
  IVX.fillRect(e.x - 1, e.y - 1 + wiggle, e.w + 2, e.h + 2);
  IVX.fillStyle = e.type.color;
  IVX.fillRect(e.x + 2, e.y + 2 + wiggle, e.w - 4, e.h - 4);
  IVX.font = '12px sans-serif';
  IVX.textAlign = 'center';
  IVX.fillText(e.type.emoji, e.x + e.w / 2, e.y + e.h - 3 + wiggle);
}

function ivDrawBullet(b) {
  IVX.fillStyle = b.boss ? '#FF6B35' : b.enemy ? '#FF4D4D' : '#FFB800';
  IVX.fillRect(b.x - 1, b.y, 3, b.enemy ? 6 : 8);
  if (!b.enemy) { IVX.fillStyle = 'rgba(255,184,0,0.3)'; IVX.fillRect(b.x - 3, b.y - 2, 7, 12); }
  if (b.boss) { IVX.fillStyle = 'rgba(255,107,53,0.4)'; IVX.fillRect(b.x - 4, b.y - 2, 9, 14); }
}

function ivDrawParticle(p) {
  IVX.globalAlpha = Math.max(0, p.life);
  if (p.ring) {
    IVX.strokeStyle = p.color; IVX.lineWidth = 1.5;
    IVX.globalAlpha = p.life * 0.7;
    IVX.beginPath(); IVX.arc(p.x, p.y, p.ringR, 0, Math.PI * 2); IVX.stroke();
  } else {
    IVX.fillStyle = p.color;
    IVX.fillRect(p.x, p.y, p.size, p.size);
  }
  IVX.globalAlpha = 1;
}

function ivDrawComboPopups() {
  ivComboPopups.forEach(p => {
    IVX.globalAlpha = p.life;
    IVX.fillStyle = p.color;
    IVX.font = `bold ${p.life > 0.7 ? 11 : 9}px Nunito`;
    IVX.textAlign = 'center';
    IVX.fillText(p.text, p.x, p.y);
    IVX.globalAlpha = 1;
  });
}

function ivDrawComboBar() {
  if (ivCombo < 2) return;
  const barW = Math.min(ivCombo * 14, IVW - 20);
  const clrs = ['#FFD700','#FFB800','#D4831A','#FF6B35','#FF4D4D','#CC3333'];
  const ci = Math.min(ivCombo - 2, clrs.length - 1);
  IVX.fillStyle = clrs[ci] + '33'; IVX.fillRect(10, IVH - 18, IVW - 20, 4);
  IVX.fillStyle = clrs[ci]; IVX.fillRect(10, IVH - 18, barW, 4);
  IVX.font = 'bold 8px Nunito'; IVX.textAlign = 'left';
  IVX.fillStyle = clrs[ci];
  IVX.fillText('COMBO x' + ivCombo, 10, IVH - 21);
}

// ── Pause screen ─────────────────────────────────────────────
function ivDrawPaused() {
  ivDraw();
  IVX.fillStyle = 'rgba(0,0,0,0.6)'; IVX.fillRect(0, IVH / 2 - 30, IVW, 60);
  IVX.fillStyle = '#fff'; IVX.font = 'bold 16px Nunito'; IVX.textAlign = 'center';
  IVX.fillText('PAUSA', IVW / 2, IVH / 2 - 6);
  IVX.font = '10px Nunito'; IVX.fillStyle = '#555';
  IVX.fillText('Tap o P para continuar', IVW / 2, IVH / 2 + 14);
}

function ivTogglePause() {
  if (!ivRunning || ivOver) return;
  ivPaused = !ivPaused; window.ivPausedState = ivPaused;
  if (ivPaused) { cancelAnimationFrame(ivAnimFrame); ivDrawPaused(); } else ivLoop();
}

// ── Game loop ────────────────────────────────────────────────
function ivLoop() {
  if (!ivRunning || ivPaused) return;
  ivFrame++;
  if (ivShootCooldown > 0) ivShootCooldown--;

  // Combo timer
  if (ivComboTimer > 0) { ivComboTimer--; if (ivComboTimer === 0) ivCombo = 0; }

  // Screen shake decay
  if (ivShakeAmount > 0.3) ivShakeAmount *= 0.75; else ivShakeAmount = 0;

  // Player bullets — movimiento y colisión con muros
  for (let i = ivBullets.length - 1; i >= 0; i--) {
    ivBullets[i].y -= 5;
    if (ivBullets[i].y < -10) { ivBullets.splice(i, 1); continue; }
    const bulp = ivBullets[i];
    if (!bulp) continue;
    let hitWallP = false;
    for (let wi = ivWalls.length - 1; wi >= 0; wi--) {
      const bl = ivWalls[wi];
      if (bl.hp <= 0) continue;
      if (bulp.x > bl.x && bulp.x < bl.x + IV_WALL_BLOCK && bulp.y > bl.y && bulp.y < bl.y + IV_WALL_BLOCK) {
        bl.hp--;
        ivSpawnExplosionSmall(bulp.x, bulp.y, '#3DBFB8');
        ivBullets.splice(i, 1);
        hitWallP = true;
        break;
      }
    }
  }

  // Enemy bullets
  for (let i = ivEnemyBullets.length - 1; i >= 0; i--) {
    const eb = ivEnemyBullets[i];
    eb.y += 3;
    if (eb.vx) eb.x += eb.vx;
    if (eb.y > IVH + 10 || eb.x < -10 || eb.x > IVW + 10) { ivEnemyBullets.splice(i, 1); continue; }

    // Colisión con muros
    let hitWall = false;
    for (let wi = ivWalls.length - 1; wi >= 0; wi--) {
      const bl = ivWalls[wi];
      if (bl.hp <= 0) continue;
      if (eb.x > bl.x && eb.x < bl.x + IV_WALL_BLOCK && eb.y > bl.y && eb.y < bl.y + IV_WALL_BLOCK) {
        bl.hp--;
        ivEnemyBullets.splice(i, 1);
        ivSpawnExplosionSmall(eb.x, eb.y, '#3DBFB8');
        hitWall = true;
        break;
      }
    }
    if (hitWall) continue;

    // Hit player
    if (eb.x > ivPlayer.x && eb.x < ivPlayer.x + ivPlayer.w &&
        eb.y > ivPlayer.y && eb.y < ivPlayer.y + ivPlayer.h) {
      ivEnemyBullets.splice(i, 1);
      ivPlayerHit();
    }
  }

  // Boss o enemigos normales
  if (ivBoss && ivBoss.alive) {
    ivUpdateBoss();
  } else if (!ivBoss || !ivBoss.alive) {
    const aliveEnemies = ivEnemies.filter(e => e.alive);

    // Move enemies
    let hitEdge = false;
    aliveEnemies.forEach(e => {
      e.x += ivEnemyDir * ivEnemySpeed;
      if (e.x <= 2 || e.x + e.w >= IVW - 2) hitEdge = true;
    });
    if (hitEdge) {
      ivEnemyDir *= -1;
      aliveEnemies.forEach(e => { e.y += 8; });
      if (aliveEnemies.some(e => e.y + e.h >= ivPlayer.y)) { ivGameOver(); return; }
    }

    // Enemy shooting
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
          ivSpawnExplosion(e.x + e.w / 2, e.y + e.h / 2, e.type.color);
          ivAddScore(e.type.pts, e.x + e.w / 2, e.y);
          const velBasePorDif2 = [0.25, 0.4, 0.6, 0.85, 1.2];
          const vb = velBasePorDif2[ivDificultad] || 0.4;
          const accelPorDif = [1.0, 1.5, 1.8, 2.2, 2.8];
          const accel = accelPorDif[ivDificultad] || 1.5;
          ivEnemySpeed = (vb + ivWave * 0.15) * (1 + (1 - aliveEnemies.filter(x => x.alive).length / ivEnemies.length) * accel);
          break;
        }
      }
    }

    // Wave complete
    if (aliveEnemies.filter(e => e.alive).length === 0) {
      ivWave++;
      ivEnemyBullets.length = 0;
      ivInitWalls();
      ivSpawnWave();
    }
  }

  // Update particles
  for (let i = ivParticles.length - 1; i >= 0; i--) {
    const p = ivParticles[i];
    p.x += p.vx; p.y += p.vy;
    if (p.ring) { p.ringR += 2.5; p.life -= 0.06; } else p.life -= 0.025;
    if (p.life <= 0) ivParticles.splice(i, 1);
  }

  // Update combo popups
  for (let i = ivComboPopups.length - 1; i >= 0; i--) {
    const p = ivComboPopups[i];
    p.y += p.vy; p.life -= 0.025;
    if (p.life <= 0) ivComboPopups.splice(i, 1);
  }

  ivDraw();
  ivAnimFrame = requestAnimationFrame(ivLoop);
}

function ivPlayerHit() {
  ivLives--;
  ivCombo = 0; ivComboTimer = 0;
  ivSpawnExplosion(ivPlayer.x + ivPlayer.w / 2, ivPlayer.y + ivPlayer.h / 2, '#3DBFB8');
  ivScreenShake(8);
  document.getElementById('invadersLives').textContent = '🔥'.repeat(Math.max(0, ivLives));
  if (ivLives <= 0) {
    // Detener loop y mostrar game over tras breve pausa para ver la explosión
    ivRunning = false;
    cancelAnimationFrame(ivAnimFrame);
    setTimeout(() => {
      ivOver = true;
      ivDraw();
      IVX.fillStyle = 'rgba(0,0,0,0.75)'; IVX.fillRect(0, IVH / 2 - 40, IVW, 80);
      IVX.fillStyle = '#fff'; IVX.font = 'bold 16px Nunito'; IVX.textAlign = 'center';
      IVX.fillText('GAME OVER', IVW / 2, IVH / 2 - 12);
      IVX.font = '11px Nunito'; IVX.fillStyle = '#aaa';
      IVX.fillText('Puntos: ' + ivScore + '  |  Récord: ' + ivHi + '  |  Oleada: ' + ivWave, IVW / 2, IVH / 2 + 8);
      IVX.font = '10px Nunito'; IVX.fillStyle = '#555';
      IVX.fillText('Tap o Espacio para reiniciar', IVW / 2, IVH / 2 + 28);
    }, 600);
  }
}

function ivDraw() {
  const sx = ivShakeAmount > 0.5 ? (Math.random() - 0.5) * ivShakeAmount : 0;
  const sy = ivShakeAmount > 0.5 ? (Math.random() - 0.5) * ivShakeAmount : 0;
  IVX.save();
  IVX.translate(sx, sy);

  IVX.fillStyle = '#0a0a0a'; IVX.fillRect(-10, -10, IVW + 20, IVH + 20);

  // Stars
  IVX.fillStyle = '#1a1a1a';
  for (let i = 0; i < 30; i++) {
    IVX.fillRect((i * 37 + ivFrame * 0.05) % IVW, (i * 53 + 10) % (IVH - 40), 1, 1);
  }

  // Boss warning flicker
  if (ivBoss && ivBoss.alive && ivFrame % 40 < 20) {
    IVX.fillStyle = 'rgba(255,107,53,0.06)'; IVX.fillRect(0, 0, IVW, IVH);
  }

  IVX.strokeStyle = '#222'; IVX.lineWidth = 1;
  IVX.beginPath(); IVX.moveTo(0, IVH - 6); IVX.lineTo(IVW, IVH - 6); IVX.stroke();

  ivDrawWalls();
  ivEnemies.forEach(e => ivDrawEnemy(e));
  ivDrawBoss();
  ivDrawPlayer();
  ivBullets.forEach(b => ivDrawBullet(b));
  ivEnemyBullets.forEach(b => ivDrawBullet(b));
  ivParticles.forEach(p => ivDrawParticle(p));
  ivDrawComboPopups();
  ivDrawComboBar();

  // Wave label
  IVX.font = '9px Nunito'; IVX.textAlign = 'right';
  IVX.fillStyle = ivBoss && ivBoss.alive ? '#FF6B35' : '#333';
  IVX.fillText(ivBoss && ivBoss.alive ? '👾 ¡JEFE! Oleada ' + ivWave : 'Oleada ' + ivWave, IVW - 6, IVH - 9);

  IVX.restore();
}

function ivGameOver() {
  ivRunning = false; ivOver = true;
  cancelAnimationFrame(ivAnimFrame);
  ivDraw();
  IVX.fillStyle = 'rgba(0,0,0,0.7)'; IVX.fillRect(0, IVH / 2 - 40, IVW, 80);
  IVX.fillStyle = '#fff'; IVX.font = 'bold 16px Nunito'; IVX.textAlign = 'center';
  IVX.fillText('GAME OVER', IVW / 2, IVH / 2 - 12);
  IVX.font = '11px Nunito'; IVX.fillStyle = '#aaa';
  IVX.fillText('Puntos: ' + ivScore + '  |  Récord: ' + ivHi + '  |  Oleada: ' + ivWave, IVW / 2, IVH / 2 + 8);
  IVX.font = '10px Nunito'; IVX.fillStyle = '#555';
  IVX.fillText('Tap o Espacio para reiniciar', IVW / 2, IVH / 2 + 28);
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

function ivKeyMovement() {
  if (ivRunning && !ivOver && !ivPaused) {
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
    if (typeof window.juegoRequiereFichas === 'function' && window.juegoRequiereFichas('invaders')) {
      if (typeof window.juegoConsumirFicha === 'function') {
        var ok = await window.juegoConsumirFicha('invaders');
        if (!ok) { if (typeof showToast === 'function') showToast('🎟️ Sin fichas para Invaders'); return; }
      }
    }
    ivInit(); return;
  }
  ivShoot();
}

(function () {
  let touchX = null;
  IVC.addEventListener('touchstart', function (e) {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = IVC.getBoundingClientRect();
    touchX = touch.clientX - rect.left;
    if (ivOver) { ivHandleAction(); return; }
    ivShoot();
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

  IVC.addEventListener('touchend', function () { touchX = null; }, { passive: true });
  IVC.addEventListener('click', function () { if (ivOver) { ivHandleAction(); return; } ivShoot(); });
})();

setInterval(function () { if (ivRunning && !ivOver && !ivPaused && ivKeys[' ']) ivShoot(); }, 120);

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
  cancelAnimationFrame(ivAnimFrame); ivInit();
};

ivKeyMovement();
