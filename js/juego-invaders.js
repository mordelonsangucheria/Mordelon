// ===================== SPACE INVADERS — MORDELÓN =====================
(function () {

const IVC = document.getElementById('invadersCanvas');
const IVX = IVC.getContext('2d');
const IVW = 320, IVH = 220;

// ── Dificultad ─────────────────────────────────────────────────────────────
let ivDificultad = 0;
window.setInvadersDificultad = function(val) { ivDificultad = parseInt(val) || 0; };

// ── Estado ─────────────────────────────────────────────────────────────────
let ivPlayer, ivBullets, ivEnemyBullets, ivEnemies, ivParticles, ivPowerups, ivShields;
let ivScore, ivHi, ivLives, ivWave, ivFrame, ivAnimFrame;
let ivRunning = false, ivOver = false, ivPaused = false;
let ivEnemyDir, ivEnemySpeed, ivShootCooldown;
let ivShieldActive = false, ivShieldTimer = 0;     // powerup escudo
let ivRapidActive = false,  ivRapidTimer  = 0;     // powerup disparo rápido
let ivTripleActive = false, ivTripleTimer = 0;     // powerup triple disparo
let ivPowerupsThisWave = 0;                        // máx 2 por oleada
let ivInvincible = false, ivInvincibleTimer = 0;   // invencibilidad tras golpe
let ivScreenFlash = 0, ivScreenFlashColor = '#fff';
let ivStars = [];

ivHi = parseInt(localStorage.getItem('invadersHiC') || '0');

// ── Tipos de enemigo ───────────────────────────────────────────────────────
const IV_ENEMY_TYPES = [
  { emoji: '🌶️', pts: 40, color: '#FF4D4D' },
  { emoji: '🧅', pts: 30, color: '#D4831A' },
  { emoji: '🥚', pts: 20, color: '#FFD700' },
  { emoji: '🍅', pts: 10, color: '#2DC653' },
];

// ── Tipos de powerup ───────────────────────────────────────────────────────
const IV_POWERUP_TYPES = [
  { id: 'vida',    emoji: '❤️',  color: '#FF4D4D', label: '+VIDA'    },
  { id: 'escudo',  emoji: '🛡️', color: '#3DBFB8', label: 'ESCUDO'   },
  { id: 'rapido',  emoji: '⚡',  color: '#FFD700', label: 'RÁPIDO'   },
  { id: 'triple',  emoji: '🔱',  color: '#B44FE8', label: 'TRIPLE'   },
  { id: 'bomba',   emoji: '💥',  color: '#FF6B35', label: 'BOMBA'    },
  { id: 'lento',   emoji: '🧊',  color: '#7EEEE9', label: 'LENTO'    },
];

// ── Web Audio API ──────────────────────────────────────────────────────────
let _ivAC = null;
function _ivGetAC() {
  if (!_ivAC) try { _ivAC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  if (_ivAC?.state === 'suspended') _ivAC.resume();
  return _ivAC;
}
function _ivTone(freq, type, vol, dur, freqEnd) {
  const ac = _ivGetAC(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.connect(g); g.connect(ac.destination);
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, ac.currentTime);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, ac.currentTime + dur);
  g.gain.setValueAtTime(vol || 0.12, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.start(); o.stop(ac.currentTime + dur + 0.01);
}
const _ivSnd = {
  shoot:     () => _ivTone(520, 'square',   0.1,  0.08, 260),
  hit:       () => _ivTone(280, 'sawtooth', 0.15, 0.1,  140),
  playerHit: () => { _ivTone(180, 'sawtooth', 0.2, 0.15, 80); setTimeout(() => _ivTone(120, 'sawtooth', 0.15, 0.2), 100); },
  powerup:   () => { [440,550,660].forEach((f,i) => setTimeout(() => _ivTone(f,'triangle',0.14,0.12), i*70)); },
  wave:      () => { [300,400,500,650].forEach((f,i) => setTimeout(() => _ivTone(f,'triangle',0.13,0.15), i*80)); },
  gameOver:  () => { [320,260,200,160,120].forEach((f,i) => setTimeout(() => _ivTone(f,'sawtooth',0.18,0.22), i*130)); },
  bomb:      () => { _ivTone(100, 'sawtooth', 0.25, 0.4, 40); },
  shield:    () => _ivTone(660, 'sine', 0.1, 0.12),
};

// ── Estrellas ──────────────────────────────────────────────────────────────
function _ivInitStars() {
  ivStars = [];
  for (let i = 0; i < 60; i++) {
    ivStars.push({
      x: Math.random() * IVW,
      y: Math.random() * IVH,
      r: Math.random() * 1.2 + 0.3,
      spd: Math.random() * 0.3 + 0.05,
      alpha: Math.random() * 0.6 + 0.2,
    });
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
function ivInit() {
  ivPlayer   = { x: IVW/2 - 13, y: IVH - 30, w: 26, h: 22, speed: 3.5 };
  ivBullets      = [];
  ivEnemyBullets = [];
  ivParticles    = [];
  ivPowerups     = [];
  ivShields      = [];
  ivScore = 0;
  const vidasPorDif = [5, 3, 3, 2, 1];
  ivLives = vidasPorDif[ivDificultad] || 3;
  ivWave  = 1;
  ivFrame = 0;
  ivShootCooldown   = 0;
  ivShieldActive    = false; ivShieldTimer  = 0;
  ivRapidActive     = false; ivRapidTimer   = 0;
  ivTripleActive    = false; ivTripleTimer  = 0;
  ivInvincible      = false; ivInvincibleTimer = 0;
  ivScreenFlash     = 0;
  ivPowerupsThisWave = 0;
  ivOver = false; ivPaused = false; ivRunning = true;
  window.ivPausedState = false;

  _ivInitStars();
  _ivSpawnShields();

  document.getElementById('invadersScore').textContent = '0';
  document.getElementById('invadersHi').textContent    = ivHi;
  document.getElementById('invadersLives').textContent = '🔥'.repeat(ivLives);

  ivSpawnWave();
  cancelAnimationFrame(ivAnimFrame);
  ivLoop();
}

// ── Shields (bunkers de protección) ───────────────────────────────────────
function _ivSpawnShields() {
  ivShields = [];
  const positions = [56, 160, 264]; // 3 bunkers más separados
  const BW = 8, BH = 7; // bloques más grandes
  positions.forEach(cx => {
    // Grilla 5 cols x 3 rows, omitir esquinas superiores para dar forma
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        if (row === 0 && (col === 0 || col === 4)) continue; // esquinas sup
        if (row === 2 && (col === 1 || col === 3)) continue; // arco inferior (hueco para nave)
        ivShields.push({
          x: cx - 20 + col * (BW + 1),
          y: IVH - 52 + row * (BH + 1),
          w: BW, h: BH,
          hp: 4, // 4 golpes para destruir
        });
      }
    }
  });
}

// ── Spawn oleada ───────────────────────────────────────────────────────────
function ivSpawnWave() {
  ivEnemies = [];
  ivEnemyDir = 1;
  ivPowerupsThisWave = 0;
  const velBasePorDif = [0.25, 0.4, 0.6, 0.85, 1.2];
  const velBase = velBasePorDif[ivDificultad] || 0.4;
  ivEnemySpeed = velBase + ivWave * 0.07;
  const cols = Math.min(8, 5 + Math.floor(ivWave / 3));
  const rows = Math.min(4, 3 + Math.floor(ivWave / 4));
  const startX = (IVW - cols * 30) / 2;
  for (let r = 0; r < rows; r++) {
    const type = IV_ENEMY_TYPES[r % IV_ENEMY_TYPES.length];
    for (let c = 0; c < cols; c++) {
      ivEnemies.push({ x: startX + c * 30, y: 18 + r * 24, w: 22, h: 18, type, alive: true, carrier: false });
    }
  }
  // Marcar 2 enemigos aleatorios como portadores
  const _ci = ivEnemies.map((_,i)=>i).sort(()=>Math.random()-0.5).slice(0,2);
  _ci.forEach(i => { ivEnemies[i].carrier = true; });
  _snd_wave_start();
}

function _snd_wave_start() { setTimeout(() => _ivSnd.wave(), 200); }

// ── Powerup spawn ──────────────────────────────────────────────────────────
function _ivMaybeSpawnPowerup(enemy) {
  // Solo los enemigos marcados como carrier sueltan powerup
  if (!enemy.carrier) return;
  if (ivPowerupsThisWave >= 2) return;
  ivPowerupsThisWave++;
  const type = IV_POWERUP_TYPES[Math.floor(Math.random() * IV_POWERUP_TYPES.length)];
  ivPowerups.push({ x: enemy.x + enemy.w/2, y: enemy.y + enemy.h/2, vy: 0.8, type, w: 16, h: 16, pulse: 0 });
}

// ── Aplicar powerup ────────────────────────────────────────────────────────
function _ivApplyPowerup(pu) {
  _ivSnd.powerup();
  _ivFlash('#FFD700');
  switch (pu.type.id) {
    case 'vida':
      ivLives = Math.min(ivLives + 1, 8);
      document.getElementById('invadersLives').textContent = '🔥'.repeat(ivLives);
      _ivToast('+1 ❤️ VIDA');
      break;
    case 'escudo':
      ivShieldActive = true; ivShieldTimer = 360; // 6s
      _ivToast('🛡️ ESCUDO');
      break;
    case 'rapido':
      ivRapidActive = true; ivRapidTimer = 420; // 7s
      _ivToast('⚡ RÁPIDO');
      break;
    case 'triple':
      ivTripleActive = true; ivTripleTimer = 360;
      _ivToast('🔱 TRIPLE');
      break;
    case 'bomba':
      _ivSnd.bomb();
      _ivFlash('#FF6B35');
      // Destruir todos los enemigos de la fila inferior
      const maxY = Math.max(...ivEnemies.filter(e => e.alive).map(e => e.y));
      ivEnemies.filter(e => e.alive && e.y === maxY).forEach(e => {
        e.alive = false;
        ivScore += e.type.pts;
        _ivSpawnExplosion(e.x + e.w/2, e.y + e.h/2, e.type.color, 14);
      });
      document.getElementById('invadersScore').textContent = ivScore;
      _ivToast('💥 ¡BOMBA!');
      break;
    case 'lento':
      ivEnemySpeed *= 0.5;
      setTimeout(() => { if (ivRunning) ivEnemySpeed *= 2; }, 5000);
      _ivToast('🧊 LENTO');
      break;
  }
}

// ── Toast de powerup ───────────────────────────────────────────────────────
let _ivToastText = '', _ivToastTimer = 0;
function _ivToast(msg) { _ivToastText = msg; _ivToastTimer = 90; }

// ── Flash de pantalla ──────────────────────────────────────────────────────
function _ivFlash(color) { ivScreenFlash = 1; ivScreenFlashColor = color; }

// ── Explosión de partículas ────────────────────────────────────────────────
function _ivSpawnExplosion(x, y, color, n) {
  n = n || 10;
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 1 + Math.random() * 3.5;
    ivParticles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      size: 1.5 + Math.random() * 3,
      color,
      life: 1,
      shape: Math.random() > 0.5 ? 'sq' : 'ci',
    });
  }
}

// ── Loop principal ─────────────────────────────────────────────────────────
function ivLoop() {
  if (!ivRunning || ivPaused) return;
  ivFrame++;

  // Timers de powerups
  if (ivShieldActive)    { ivShieldTimer--;  if (ivShieldTimer  <= 0) { ivShieldActive  = false; } }
  if (ivRapidActive)     { ivRapidTimer--;   if (ivRapidTimer   <= 0) { ivRapidActive   = false; } }
  if (ivTripleActive)    { ivTripleTimer--;  if (ivTripleTimer  <= 0) { ivTripleActive  = false; } }
  if (ivInvincible)      { ivInvincibleTimer--; if (ivInvincibleTimer <= 0) ivInvincible = false; }
  if (ivShootCooldown > 0) ivShootCooldown--;
  if (ivScreenFlash > 0)   ivScreenFlash = Math.max(0, ivScreenFlash - 0.06);
  if (_ivToastTimer > 0)   _ivToastTimer--;

  // Estrellas
  ivStars.forEach(s => { s.y += s.spd; if (s.y > IVH) { s.y = 0; s.x = Math.random() * IVW; } });

  // Balas del jugador
  for (let i = ivBullets.length - 1; i >= 0; i--) {
    ivBullets[i].y -= 6;
    if (ivBullets[i].y < -10) { ivBullets.splice(i, 1); continue; }

    // Colisión bala-shield (hitbox generosa: bala tiene ancho 3px)
    let hitShield = false;
    for (let si = ivShields.length - 1; si >= 0; si--) {
      const sh = ivShields[si];
      const b  = ivBullets[i];
      if (!b) break;
      if (b.x + 2 > sh.x && b.x - 2 < sh.x + sh.w &&
          b.y + 9 > sh.y && b.y     < sh.y + sh.h) {
        sh.hp--;
        if (sh.hp <= 0) ivShields.splice(si, 1);
        ivBullets.splice(i, 1);
        hitShield = true; break;
      }
    }
    if (hitShield) continue;
  }

  // Balas enemigas
  for (let i = ivEnemyBullets.length - 1; i >= 0; i--) {
    ivEnemyBullets[i].y += 3;
    if (ivEnemyBullets[i].y > IVH + 10) { ivEnemyBullets.splice(i, 1); continue; }

    const eb = ivEnemyBullets[i];

    // Colisión bala enemiga - shield bunker
    let hitShield = false;
    for (let si = ivShields.length - 1; si >= 0; si--) {
      const sh = ivShields[si];
      if (eb.x + 2 > sh.x && eb.x - 2 < sh.x+sh.w && eb.y+7 > sh.y && eb.y < sh.y+sh.h) {
        sh.hp--;
        if (sh.hp <= 0) ivShields.splice(si, 1);
        ivEnemyBullets.splice(i, 1);
        hitShield = true; break;
      }
    }
    if (hitShield) continue;

    // Colisión bala enemiga - jugador
    if (!ivInvincible && eb &&
        eb.x > ivPlayer.x && eb.x < ivPlayer.x + ivPlayer.w &&
        eb.y > ivPlayer.y && eb.y < ivPlayer.y + ivPlayer.h) {
      ivEnemyBullets.splice(i, 1);
      _ivPlayerHit();
      if (!ivRunning) return;
    }
  }

  // Mover enemigos
  let hitEdge = false;
  const alive = ivEnemies.filter(e => e.alive);
  alive.forEach(e => {
    e.x += ivEnemyDir * ivEnemySpeed;
    if (e.x <= 2 || e.x + e.w >= IVW - 2) hitEdge = true;
  });
  if (hitEdge) {
    ivEnemyDir *= -1;
    alive.forEach(e => { e.y += 5; });
    if (alive.some(e => e.y + e.h >= ivPlayer.y - 5)) { _ivGameOver(); return; }
  }

  // IA disparo enemigo
  const shootFreqPorDif = [80, 60, 45, 35, 22];
  const shootFreqBase   = shootFreqPorDif[ivDificultad] || 60;
  const shootFreq       = Math.max(14, shootFreqBase - ivWave * 4);
  if (alive.length > 0 && ivFrame % shootFreq === 0) {
    const shooter = alive[Math.floor(Math.random() * alive.length)];
    ivEnemyBullets.push({ x: shooter.x + shooter.w/2, y: shooter.y + shooter.h, enemy: true });
  }

  // Colisión bala jugador - enemigo
  outer: for (let bi = ivBullets.length - 1; bi >= 0; bi--) {
    for (let ei = 0; ei < ivEnemies.length; ei++) {
      const e = ivEnemies[ei]; if (!e.alive) continue;
      const b = ivBullets[bi]; if (!b) break outer;
      if (b.x > e.x && b.x < e.x+e.w && b.y > e.y && b.y < e.y+e.h) {
        e.alive = false;
        ivBullets.splice(bi, 1);
        ivScore += e.type.pts;
        _ivSpawnExplosion(e.x+e.w/2, e.y+e.h/2, e.type.color, 12);
        _ivMaybeSpawnPowerup(e);
        _ivSnd.hit();
        document.getElementById('invadersScore').textContent = ivScore;
        if (ivScore > ivHi) {
          ivHi = ivScore;
          localStorage.setItem('invadersHiC', ivHi);
          document.getElementById('invadersHi').textContent = ivHi;
          if (typeof window.notificarRecordJuego === 'function') window.notificarRecordJuego('invaders', ivHi);
        }
        // Acelerar enemigos al morir
        const velBasePorDif2 = [0.25, 0.4, 0.6, 0.85, 1.2];
        const accelPorDif    = [1.0, 1.5, 1.8, 2.2, 2.8];
        const vb    = velBasePorDif2[ivDificultad] || 0.4;
        const accel = accelPorDif[ivDificultad] || 1.5;
        ivEnemySpeed = (vb + ivWave * 0.07) * (1 + (1 - alive.filter(x=>x.alive).length / ivEnemies.length) * accel * 0.7);
        break outer;
      }
    }
  }

  // Powerups
  for (let i = ivPowerups.length - 1; i >= 0; i--) {
    const pu = ivPowerups[i];
    pu.y += pu.vy;
    pu.pulse = (pu.pulse + 0.12) % (Math.PI * 2);
    if (pu.y > IVH + 20) { ivPowerups.splice(i, 1); continue; }
    // Colisión con jugador
    if (pu.x > ivPlayer.x - 8 && pu.x < ivPlayer.x + ivPlayer.w + 8 &&
        pu.y > ivPlayer.y - 8 && pu.y < ivPlayer.y + ivPlayer.h + 8) {
      _ivApplyPowerup(pu);
      ivPowerups.splice(i, 1);
    }
  }

  // Partículas
  for (let i = ivParticles.length - 1; i >= 0; i--) {
    const p = ivParticles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.92; p.vy *= 0.92;
    p.life -= 0.035;
    if (p.life <= 0) ivParticles.splice(i, 1);
  }

  // Wave complete?
  if (alive.filter(e => e.alive).length === 0) {
    ivWave++;
    ivEnemyBullets.length = 0;
    ivPowerups.length = 0;
    // Resetear efectos de powerup al cambiar oleada
    ivShieldActive = false; ivShieldTimer = 0;
    ivRapidActive  = false; ivRapidTimer  = 0;
    ivTripleActive = false; ivTripleTimer = 0;
    ivSpawnWave();
  }

  ivDraw();
  ivAnimFrame = requestAnimationFrame(ivLoop);
}

// ── Golpe al jugador ───────────────────────────────────────────────────────
function _ivPlayerHit() {
  if (ivShieldActive) {
    // Escudo absorbe el golpe
    _ivSnd.shield();
    _ivFlash('#3DBFB8');
    ivShieldActive = false; ivShieldTimer = 0;
    _ivSpawnExplosion(ivPlayer.x+ivPlayer.w/2, ivPlayer.y, '#3DBFB8', 14);
    return;
  }
  ivLives--;
  _ivSnd.playerHit();
  _ivFlash('#FF4D4D');
  _ivSpawnExplosion(ivPlayer.x+ivPlayer.w/2, ivPlayer.y+ivPlayer.h/2, '#3DBFB8', 18);
  ivInvincible = true; ivInvincibleTimer = 120; // 2s de invencibilidad
  document.getElementById('invadersLives').textContent = '🔥'.repeat(Math.max(0, ivLives));
  if (ivLives <= 0) { _ivGameOver(); }
}

// ── Dibujo ─────────────────────────────────────────────────────────────────
function ivDraw() {
  // Fondo
  const bgGrad = IVX.createLinearGradient(0, 0, 0, IVH);
  bgGrad.addColorStop(0, '#05080f');
  bgGrad.addColorStop(1, '#080c10');
  IVX.fillStyle = bgGrad;
  IVX.fillRect(0, 0, IVW, IVH);

  // Estrellas
  ivStars.forEach(s => {
    IVX.globalAlpha = s.alpha * (0.7 + Math.sin(ivFrame * 0.04 + s.x) * 0.3);
    IVX.fillStyle = '#fff';
    IVX.beginPath(); IVX.arc(s.x, s.y, s.r, 0, Math.PI*2); IVX.fill();
  });
  IVX.globalAlpha = 1;

  // Nebulosa de fondo sutil
  const neb = IVX.createRadialGradient(IVW*0.3, IVH*0.4, 0, IVW*0.3, IVH*0.4, 100);
  neb.addColorStop(0, 'rgba(61,191,184,0.04)');
  neb.addColorStop(1, 'rgba(0,0,0,0)');
  IVX.fillStyle = neb; IVX.fillRect(0, 0, IVW, IVH);

  // Línea de suelo con glow
  IVX.save();
  IVX.shadowColor = '#3DBFB8'; IVX.shadowBlur = 6;
  IVX.strokeStyle = 'rgba(61,191,184,0.4)'; IVX.lineWidth = 1;
  IVX.beginPath(); IVX.moveTo(0, IVH - 7); IVX.lineTo(IVW, IVH - 7); IVX.stroke();
  IVX.restore();

  // Shields (bunkers)
  _ivDrawShields();

  // Enemigos
  ivEnemies.forEach(e => _ivDrawEnemy(e));

  // Jugador
  _ivDrawPlayer();

  // Powerups
  ivPowerups.forEach(p => _ivDrawPowerup(p));

  // Balas jugador
  ivBullets.forEach(b => _ivDrawBullet(b, false));
  // Balas enemigas
  ivEnemyBullets.forEach(b => _ivDrawBullet(b, true));

  // Partículas
  ivParticles.forEach(p => _ivDrawParticle(p));

  // Oleada
  IVX.fillStyle = 'rgba(61,191,184,0.35)';
  IVX.font = '8px Nunito, sans-serif';
  IVX.textAlign = 'right'; IVX.textBaseline = 'bottom';
  IVX.fillText('OLEADA ' + ivWave, IVW - 5, IVH - 9);

  // Toast powerup
  if (_ivToastTimer > 0) {
    const alpha = Math.min(1, _ivToastTimer / 20);
    IVX.globalAlpha = alpha;
    IVX.fillStyle = '#FFD700';
    IVX.font = 'bold 11px Nunito, sans-serif';
    IVX.textAlign = 'center'; IVX.textBaseline = 'middle';
    IVX.fillText(_ivToastText, IVW/2, IVH/2 - 30);
    IVX.globalAlpha = 1;
  }

  // Indicadores de powerup activos
  _ivDrawPowerupHUD();

  // Flash de pantalla
  if (ivScreenFlash > 0) {
    IVX.globalAlpha = ivScreenFlash * 0.28;
    IVX.fillStyle = ivScreenFlashColor;
    IVX.fillRect(0, 0, IVW, IVH);
    IVX.globalAlpha = 1;
  }
}

// ── Draw: jugador ──────────────────────────────────────────────────────────
function _ivDrawPlayer() {
  const px = ivPlayer.x, py = ivPlayer.y;
  const blink = ivInvincible && Math.floor(ivFrame / 5) % 2 === 0;
  if (blink) return; // parpadeo durante invencibilidad

  IVX.save();

  // Escudo visual
  if (ivShieldActive) {
    IVX.save();
    IVX.shadowColor = '#3DBFB8'; IVX.shadowBlur = 18;
    IVX.strokeStyle = `rgba(61,191,184,${0.5 + Math.sin(ivFrame*0.15)*0.3})`;
    IVX.lineWidth = 2;
    IVX.beginPath();
    IVX.ellipse(px + 13, py + 11, 18, 16, 0, 0, Math.PI*2);
    IVX.stroke();
    IVX.restore();
  }

  // Glow de la nave
  IVX.shadowColor = '#3DBFB8'; IVX.shadowBlur = 10;

  // Cañón central
  IVX.fillStyle = '#1A8C87';
  IVX.fillRect(px + 11, py - 4, 4, 8);

  // Cuerpo principal
  const bodyGrad = IVX.createLinearGradient(px, py, px, py + 22);
  bodyGrad.addColorStop(0, '#7EEEE9');
  bodyGrad.addColorStop(0.5, '#3DBFB8');
  bodyGrad.addColorStop(1, '#1A8C87');
  IVX.fillStyle = bodyGrad;
  IVX.beginPath();
  IVX.roundRect(px + 4, py + 2, 18, 14, 4);
  IVX.fill();

  // Cockpit / ventana
  IVX.shadowBlur = 0;
  IVX.fillStyle = 'rgba(255,255,255,0.85)';
  IVX.beginPath(); IVX.ellipse(px + 13, py + 8, 4, 3, 0, 0, Math.PI*2); IVX.fill();
  IVX.fillStyle = '#0a2a3a';
  IVX.beginPath(); IVX.ellipse(px + 13, py + 9, 2.5, 2, 0, 0, Math.PI*2); IVX.fill();

  // Alas
  IVX.fillStyle = '#1A8C87';
  // Ala izquierda
  IVX.beginPath();
  IVX.moveTo(px + 4, py + 10); IVX.lineTo(px - 2, py + 20); IVX.lineTo(px + 8, py + 18);
  IVX.closePath(); IVX.fill();
  // Ala derecha
  IVX.beginPath();
  IVX.moveTo(px + 22, py + 10); IVX.lineTo(px + 28, py + 20); IVX.lineTo(px + 18, py + 18);
  IVX.closePath(); IVX.fill();

  // Motor / exhaust con glow animado
  IVX.shadowColor = '#D4831A'; IVX.shadowBlur = 8 + Math.sin(ivFrame*0.3)*4;
  IVX.fillStyle = `rgba(212,131,26,${0.7 + Math.sin(ivFrame*0.3)*0.3})`;
  IVX.beginPath(); IVX.ellipse(px + 13, py + 18, 4, 3, 0, 0, Math.PI*2); IVX.fill();

  // Llama del motor
  IVX.fillStyle = `rgba(255,200,50,${0.5 + Math.sin(ivFrame*0.4)*0.5})`;
  IVX.beginPath(); IVX.ellipse(px + 13, py + 21, 2, 2, 0, 0, Math.PI*2); IVX.fill();

  IVX.restore();
}

// ── Draw: enemigo ──────────────────────────────────────────────────────────
function _ivDrawEnemy(e) {
  if (!e.alive) return;
  const wiggle = Math.sin(ivFrame * 0.07 + e.x * 0.08) * 1.2;
  const cx = e.x + e.w/2, cy = e.y + e.h/2 + wiggle;

  IVX.save();

  // Glow
  IVX.shadowColor = e.type.color; IVX.shadowBlur = 8;

  // Cuerpo
  const bgrad = IVX.createRadialGradient(cx, cy - 2, 0, cx, cy, e.w * 0.7);
  bgrad.addColorStop(0, e.type.color + 'cc');
  bgrad.addColorStop(1, e.type.color + '44');
  IVX.fillStyle = bgrad;
  IVX.beginPath(); IVX.roundRect(e.x + 1, e.y + 1 + wiggle, e.w - 2, e.h - 2, 5); IVX.fill();

  // Borde
  IVX.shadowBlur = 0;
  IVX.strokeStyle = e.type.color + 'aa'; IVX.lineWidth = 1;
  IVX.beginPath(); IVX.roundRect(e.x + 1, e.y + 1 + wiggle, e.w - 2, e.h - 2, 5); IVX.stroke();

  // Borde especial para carriers (portadores de powerup)
  if (e.carrier) {
    IVX.shadowBlur = 0;
    IVX.strokeStyle = '#FFD700';
    IVX.lineWidth = 1.5;
    IVX.setLineDash([3, 2]);
    IVX.beginPath(); IVX.roundRect(e.x + 1, e.y + 1 + wiggle, e.w - 2, e.h - 2, 5); IVX.stroke();
    IVX.setLineDash([]);
    // Ícono pequeño de powerup
    IVX.font = '6px serif'; IVX.textAlign = 'right'; IVX.textBaseline = 'top';
    IVX.fillText('✦', e.x + e.w - 1, e.y + wiggle + 1);
  }

  // Emoji
  IVX.font = '11px serif'; IVX.textAlign = 'center'; IVX.textBaseline = 'middle';
  IVX.fillText(e.type.emoji, cx, cy + 1);

  IVX.restore();
}

// ── Draw: shields ──────────────────────────────────────────────────────────
function _ivDrawShields() {
  ivShields.forEach(sh => {
    const dmg   = (4 - sh.hp) / 4; // 0=intacto, 1=destruido
    const alpha = 0.95 - dmg * 0.55;
    const color = sh.hp >= 3 ? '#3DBFB8' : sh.hp === 2 ? '#7EEEE9' : '#1A5C58';
    IVX.save();
    IVX.shadowColor = '#3DBFB8'; IVX.shadowBlur = sh.hp === 3 ? 5 : 2;
    IVX.globalAlpha = alpha;
    IVX.fillStyle = color;
    IVX.fillRect(sh.x, sh.y, sh.w, sh.h);
    // Grietas en hp bajo
    if (sh.hp < 4) {
      IVX.strokeStyle = 'rgba(0,0,0,0.5)'; IVX.lineWidth = 0.5;
      IVX.beginPath();
      IVX.moveTo(sh.x, sh.y); IVX.lineTo(sh.x + sh.w, sh.y + sh.h);
      IVX.stroke();
    }
    IVX.restore();
  });
}

// ── Draw: bala ────────────────────────────────────────────────────────────
function _ivDrawBullet(b, enemy) {
  IVX.save();
  if (enemy) {
    IVX.shadowColor = '#FF4D4D'; IVX.shadowBlur = 6;
    IVX.fillStyle = '#FF4D4D';
    IVX.fillRect(b.x - 1.5, b.y, 3, 7);
    // Punta
    IVX.fillStyle = '#FF8080';
    IVX.fillRect(b.x - 0.5, b.y, 1, 2);
  } else {
    IVX.shadowColor = '#FFD700'; IVX.shadowBlur = 10;
    IVX.fillStyle = ivTripleActive ? '#B44FE8' : '#FFD700';
    IVX.fillRect(b.x - 1.5, b.y, 3, 9);
    IVX.fillStyle = '#fff';
    IVX.fillRect(b.x - 0.5, b.y, 1, 3);
  }
  IVX.restore();
}

// ── Draw: powerup ─────────────────────────────────────────────────────────
function _ivDrawPowerup(pu) {
  const pulse = Math.sin(pu.pulse) * 3;
  IVX.save();
  IVX.shadowColor = pu.type.color; IVX.shadowBlur = 14 + pulse;

  // Fondo
  IVX.fillStyle = pu.type.color + '33';
  IVX.beginPath(); IVX.roundRect(pu.x - 8, pu.y - 8, 16, 16, 4); IVX.fill();

  // Borde pulsante
  IVX.strokeStyle = pu.type.color;
  IVX.lineWidth = 1.5;
  IVX.beginPath(); IVX.roundRect(pu.x - 8, pu.y - 8, 16, 16, 4); IVX.stroke();

  // Emoji
  IVX.font = '10px serif'; IVX.textAlign = 'center'; IVX.textBaseline = 'middle';
  IVX.fillText(pu.type.emoji, pu.x, pu.y);

  IVX.restore();
}

// ── Draw: partícula ───────────────────────────────────────────────────────
function _ivDrawParticle(p) {
  IVX.save();
  IVX.globalAlpha = p.life * 0.9;
  IVX.fillStyle   = p.color;
  if (p.shape === 'sq') {
    IVX.translate(p.x, p.y); IVX.rotate((1 - p.life) * 5);
    IVX.fillRect(-p.size/2, -p.size/2, p.size, p.size);
  } else {
    IVX.beginPath(); IVX.arc(p.x, p.y, p.size, 0, Math.PI*2); IVX.fill();
  }
  IVX.restore();
}

// ── Draw: HUD powerups activos ────────────────────────────────────────────
function _ivDrawPowerupHUD() {
  let xOff = 4;
  const drawBadge = (emoji, timer, max, color) => {
    const pct = timer / max;
    IVX.save();
    IVX.globalAlpha = 0.85;
    IVX.fillStyle = color + '33';
    IVX.beginPath(); IVX.roundRect(xOff, 2, 20, 12, 3); IVX.fill();
    IVX.fillStyle = color;
    IVX.beginPath(); IVX.roundRect(xOff, 2, 20 * pct, 12, 3); IVX.fill();
    IVX.font = '8px serif'; IVX.textAlign = 'center'; IVX.textBaseline = 'middle';
    IVX.fillText(emoji, xOff + 10, 8);
    IVX.restore();
    xOff += 24;
  };
  if (ivShieldActive)  drawBadge('🛡️', ivShieldTimer,  360, '#3DBFB8');
  if (ivRapidActive)   drawBadge('⚡',  ivRapidTimer,   420, '#FFD700');
  if (ivTripleActive)  drawBadge('🔱',  ivTripleTimer,  360, '#B44FE8');
}

// ── Pausa ─────────────────────────────────────────────────────────────────
function ivDrawPaused() {
  ivDraw();
  IVX.fillStyle = 'rgba(5,8,15,0.75)';
  IVX.fillRect(0, 0, IVW, IVH);

  IVX.save();
  IVX.shadowColor = '#3DBFB8'; IVX.shadowBlur = 20;
  IVX.fillStyle = '#3DBFB8';
  IVX.font = 'bold 18px Nunito, sans-serif';
  IVX.textAlign = 'center'; IVX.textBaseline = 'middle';
  IVX.fillText('⏸ PAUSA', IVW/2, IVH/2 - 10);
  IVX.restore();

  IVX.fillStyle = '#444';
  IVX.font = '10px Nunito, sans-serif';
  IVX.fillText('Tap o P para continuar', IVW/2, IVH/2 + 12);
}

function ivTogglePause() {
  if (!ivRunning || ivOver) return;
  ivPaused = !ivPaused;
  window.ivPausedState = ivPaused;
  if (ivPaused) { cancelAnimationFrame(ivAnimFrame); ivDrawPaused(); }
  else { ivLoop(); }
}

// ── Game Over ─────────────────────────────────────────────────────────────
function _ivGameOver() {
  ivRunning = false; ivOver = true;
  cancelAnimationFrame(ivAnimFrame);
  _ivSnd.gameOver();

  // Fondo
  ivDraw();

  // Overlay animado con intervalo
  let goFrame = 0;
  const goAnim = setInterval(() => {
    goFrame++;
    // Panel principal
    IVX.fillStyle = 'rgba(5,8,15,0.92)';
    IVX.fillRect(0, 0, IVW, IVH);

    // Borde pulsante
    IVX.save();
    const pulse = Math.sin(goFrame * 0.08) * 0.3 + 0.7;
    IVX.shadowColor = '#D4831A'; IVX.shadowBlur = 20 * pulse;
    IVX.strokeStyle = `rgba(212,131,26,${pulse})`;
    IVX.lineWidth = 2;
    IVX.beginPath(); IVX.roundRect(10, IVH/2 - 70, IVW - 20, 140, 12); IVX.stroke();
    IVX.restore();

    // Título
    IVX.save();
    IVX.shadowColor = '#D4831A'; IVX.shadowBlur = 18;
    IVX.fillStyle = '#D4831A';
    IVX.font = 'bold 20px Nunito, sans-serif';
    IVX.textAlign = 'center'; IVX.textBaseline = 'middle';
    IVX.fillText('GAME OVER', IVW/2, IVH/2 - 44);
    IVX.restore();

    // Emoji grande
    IVX.font = '26px serif'; IVX.textAlign = 'center'; IVX.textBaseline = 'middle';
    IVX.fillText('🔥', IVW/2, IVH/2 - 16);

    // Separador
    IVX.strokeStyle = 'rgba(212,131,26,0.3)'; IVX.lineWidth = 1;
    IVX.beginPath(); IVX.moveTo(40, IVH/2 + 4); IVX.lineTo(IVW - 40, IVH/2 + 4); IVX.stroke();

    // Stats
    IVX.fillStyle = '#e0e0e0';
    IVX.font = 'bold 16px Nunito, sans-serif';
    IVX.fillText(ivScore, IVW/2, IVH/2 + 24);
    IVX.fillStyle = '#555';
    IVX.font = '9px Nunito, sans-serif';
    IVX.fillText('PUNTOS', IVW/2, IVH/2 + 36);

    // Record
    if (ivScore >= ivHi && ivScore > 0) {
      IVX.fillStyle = '#FFD700';
      IVX.font = 'bold 9px Nunito, sans-serif';
      IVX.fillText('✦ NUEVO RÉCORD ✦', IVW/2, IVH/2 + 50);
    } else {
      IVX.fillStyle = '#333';
      IVX.font = '9px Nunito, sans-serif';
      IVX.fillText('Récord: ' + ivHi + '  ·  Oleada: ' + ivWave, IVW/2, IVH/2 + 50);
    }

    // Instrucción parpadeante
    if (Math.floor(goFrame / 20) % 2 === 0) {
      IVX.fillStyle = '#444';
      IVX.font = '8px Nunito, sans-serif';
      IVX.fillText('Tap o Espacio para reiniciar', IVW/2, IVH/2 + 66);
    }
  }, 1000 / 30);

  // Parar animación de game over al reiniciar
  window._ivGoAnimInterval = goAnim;

  setTimeout(() => {
    if (typeof window.abrirLeaderboard === 'function') window.abrirLeaderboard('invaders', ivScore);
  }, 1200);
}

// ── Shoot ─────────────────────────────────────────────────────────────────
function ivShoot() {
  if (!ivRunning || ivOver || ivPaused) return;
  const cooldown = ivRapidActive ? 5 : 12;
  if (ivShootCooldown > 0) return;
  const cx = ivPlayer.x + ivPlayer.w/2;
  const by = ivPlayer.y - 4;
  if (ivTripleActive) {
    ivBullets.push({ x: cx - 7, y: by });
    ivBullets.push({ x: cx,     y: by });
    ivBullets.push({ x: cx + 7, y: by });
  } else {
    ivBullets.push({ x: cx, y: by });
  }
  ivShootCooldown = cooldown;
  _ivSnd.shoot();
}

// ── Controls ──────────────────────────────────────────────────────────────
let ivKeys = {};
document.addEventListener('keydown', e => {
  if (document.getElementById('juegoInvaders')?.style.display === 'none') return;
  ivKeys[e.key] = true;
  if (e.code === 'Space') { e.preventDefault(); _ivHandleAction(); }
  if (e.key === 'p' || e.key === 'P') ivTogglePause();
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
});
document.addEventListener('keyup', e => { ivKeys[e.key] = false; });

function ivKeyMovement() {
  if (ivRunning && !ivOver && !ivPaused) {
    if (ivKeys['ArrowLeft']  && ivPlayer.x > 2)                   ivPlayer.x -= ivPlayer.speed;
    if (ivKeys['ArrowRight'] && ivPlayer.x + ivPlayer.w < IVW - 2) ivPlayer.x += ivPlayer.speed;
  }
  requestAnimationFrame(ivKeyMovement);
}

async function _ivHandleAction() {
  if (ivOver) {
    if (window._ivGoAnimInterval) { clearInterval(window._ivGoAnimInterval); window._ivGoAnimInterval = null; }
    if (typeof window.juegoRequiereFichas === 'function' && window.juegoRequiereFichas('invaders')) {
      if (typeof window.juegoConsumirFicha === 'function') {
        const ok = await window.juegoConsumirFicha('invaders');
        if (!ok) { if (typeof showToast === 'function') showToast('🎟️ Sin fichas para Invaders'); return; }
      }
    }
    ivInit(); return;
  }
  ivShoot();
}

// Touch
(function () {
  let touchX = null;
  IVC.addEventListener('touchstart', e => {
    e.preventDefault();
    _ivGetAC(); // desbloquear audio en gesto
    const rect = IVC.getBoundingClientRect();
    touchX = e.touches[0].clientX - rect.left;
    if (ivOver) { _ivHandleAction(); return; }
    ivShoot();
  }, { passive: false });

  IVC.addEventListener('touchmove', e => {
    e.preventDefault();
    if (ivOver || !ivRunning || ivPaused) return;
    const rect = IVC.getBoundingClientRect();
    const newX = e.touches[0].clientX - rect.left;
    const scale = IVW / rect.width;
    if (touchX !== null) {
      ivPlayer.x += (newX - touchX) * scale;
      ivPlayer.x = Math.max(2, Math.min(IVW - ivPlayer.w - 2, ivPlayer.x));
    }
    touchX = newX;
  }, { passive: false });

  IVC.addEventListener('touchend', () => { touchX = null; }, { passive: true });

  IVC.addEventListener('click', () => {
    _ivGetAC();
    if (ivOver) { _ivHandleAction(); return; }
    ivShoot();
  });
})();

// Auto-shoot espacio
setInterval(() => { if (ivRunning && !ivOver && !ivPaused && ivKeys[' ']) ivShoot(); }, 100);

// ── Exports ────────────────────────────────────────────────────────────────
window.invadersInit  = ivInit;
window.invadersPause = ivTogglePause;
window.invadersReset = async function () {
  if (window._ivGoAnimInterval) { clearInterval(window._ivGoAnimInterval); window._ivGoAnimInterval = null; }
  if (typeof window.juegoRequiereFichas === 'function' && window.juegoRequiereFichas('invaders')) {
    if (typeof window.juegoConsumirFicha === 'function') {
      const ok = await window.juegoConsumirFicha('invaders');
      if (!ok) { if (typeof showToast === 'function') showToast('🎟️ Sin fichas para Invaders'); return; }
    }
  }
  cancelAnimationFrame(ivAnimFrame);
  ivInit();
};

ivKeyMovement();

})();
