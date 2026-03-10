// ===================== DINO – MORDELÓN v2 =====================
// Máquina de estados: 'inicio' | 'jugando' | 'muerto'
// Personaje: Llama de fuego turquesa (sprite original conservado + mejoras)
// Nuevas features:
//   · Fondo animado con parallax (3 capas) que evoluciona con el puntaje
//   · Ambientes: Ciudad nocturna → Desierto → Montaña → Espacio
//   · Sonidos Web Audio API: salto, muerte, récord, moneda, verdura
//   · Verduras aleatorias: +25 pts al recolectarlas
//   · Game over screen mejorada con animación
//   · window.dinoRunning como Object.defineProperty (compatibilidad juego-selector.js)

const DC = document.getElementById('dinoCanvas');
const DX = DC.getContext('2d');
const DW = 320, DH = 160;
const GROUND = DH - 28;
const TURQ   = '#3DBFB8';
const NARANJ = '#D4831A';

// ─── Estado central ────────────────────────────────────────────────────────
let dEstado = 'inicio'; // 'inicio' | 'jugando' | 'muerto'
let _dRunning = false;
Object.defineProperty(window, 'dinoRunning', {
  get: () => _dRunning,
  set: v  => { _dRunning = !!v; },
  configurable: true
});

let dino, obstacles, veggies, dScore, dHi = parseInt(localStorage.getItem('dinoHiC')||'0');
let dSpeed, dFrame, dOver, dAnimFrame;
let dinoDificultad = 0;
let deathAnimTimer  = 0; // frames de animación post-muerte
let newRecordFlash  = 0; // frames de destello al batir récord
let veggieMsgTimer  = 0; // frames mostrando "+25"
let veggieMsgX      = 0;
let veggieMsgY      = 0;

// ─── Ambiente (cambia con el puntaje) ──────────────────────────────────────
// 0=ciudad nocturna, 1=desierto, 2=montaña, 3=espacio
const AMBIENTES = [
  { score: 0,    sky1: '#080c10', sky2: '#0d1520', ground: '#1a2235', accent: '#3DBFB8', star: '#4a6080' },
  { score: 300,  sky1: '#1a0d00', sky2: '#2d1500', ground: '#3d2200', accent: '#D4831A', star: '#8b5e00' },
  { score: 700,  sky1: '#0a1208', sky2: '#0f2010', ground: '#152a10', accent: '#2DC653', star: '#3a5030' },
  { score: 1200, sky1: '#02020a', sky2: '#05051a', ground: '#080820', accent: '#9b59b6', star: '#e8e8ff' },
];

function getAmbiente() {
  let a = AMBIENTES[0];
  for (const amb of AMBIENTES) { if (dScore >= amb.score) a = amb; }
  return a;
}

// ─── Web Audio ─────────────────────────────────────────────────────────────
let audioCtx = null;
function getAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  return audioCtx;
}
function playTone(freq, type, dur, vol=0.18, attack=0.01, decay=0.08) {
  const ctx = getAudio(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + attack + decay + dur);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + attack + decay + dur + 0.05);
  } catch(e) {}
}
function sfxJump() {
  playTone(320, 'sine', 0.05, 0.15);
  setTimeout(() => playTone(520, 'sine', 0.08, 0.10), 40);
}
function sfxDead() {
  playTone(200, 'sawtooth', 0.08, 0.20, 0.01, 0.15);
  setTimeout(() => playTone(130, 'sawtooth', 0.10, 0.25, 0.01, 0.25), 100);
  setTimeout(() => playTone(80,  'square',   0.15, 0.20, 0.01, 0.30), 250);
}
function sfxRecord() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.12, 0.22), i * 80));
}
function sfxVeggie() {
  playTone(880, 'sine', 0.05, 0.20, 0.005, 0.05);
  setTimeout(() => playTone(1100, 'sine', 0.06, 0.18), 60);
  setTimeout(() => playTone(1320, 'sine', 0.07, 0.14), 120);
}
function sfxCoin() {
  playTone(660, 'triangle', 0.04, 0.14);
  setTimeout(() => playTone(880, 'triangle', 0.04, 0.10), 50);
}

// ─── Parallax background ───────────────────────────────────────────────────
const BG = {
  // 3 capas de elementos de fondo desplazándose a distintas velocidades
  layers: [
    { items: [], speed: 0.2, init: initLayerFar  },
    { items: [], speed: 0.5, init: initLayerMid  },
    { items: [], speed: 0.9, init: initLayerNear },
  ],
  stars: [], // estrellas / partículas fijas
};

function initLayerFar() {
  // Edificios lejanos / montañas lejanas
  BG.layers[0].items = [];
  for (let i = 0; i < 8; i++) {
    BG.layers[0].items.push({
      x: (i / 8) * DW + Math.random() * 30,
      w: 18 + Math.random() * 20,
      h: 20 + Math.random() * 35,
    });
  }
}
function initLayerMid() {
  BG.layers[1].items = [];
  for (let i = 0; i < 5; i++) {
    BG.layers[1].items.push({
      x: (i / 5) * DW + Math.random() * 40,
      w: 22 + Math.random() * 18,
      h: 28 + Math.random() * 30,
    });
  }
}
function initLayerNear() {
  BG.layers[2].items = [];
  for (let i = 0; i < 4; i++) {
    BG.layers[2].items.push({
      x: (i / 4) * DW + Math.random() * 50,
      w: 10 + Math.random() * 12,
      h: 8 + Math.random() * 18,
    });
  }
}
function initStars() {
  BG.stars = [];
  for (let i = 0; i < 40; i++) {
    BG.stars.push({ x: Math.random() * DW, y: Math.random() * (GROUND - 20), r: Math.random() * 1.2 + 0.3, twinkle: Math.random() * Math.PI * 2 });
  }
}

function bgInit() {
  BG.layers.forEach(l => l.init());
  initStars();
}

function bgUpdate() {
  BG.layers.forEach(l => {
    l.items.forEach(item => {
      item.x -= l.speed * (dSpeed / 1.8);
      if (item.x + item.w < 0) {
        item.x = DW + 5;
        item.w = (l === BG.layers[0]) ? 18 + Math.random()*20 : (l === BG.layers[1]) ? 22 + Math.random()*18 : 10 + Math.random()*12;
        item.h = (l === BG.layers[0]) ? 20 + Math.random()*35 : (l === BG.layers[1]) ? 28 + Math.random()*30 : 8 + Math.random()*18;
      }
    });
  });
}

function bgDraw() {
  const amb = getAmbiente();

  // Sky gradient
  const skyGrad = DX.createLinearGradient(0, 0, 0, GROUND);
  skyGrad.addColorStop(0, amb.sky1);
  skyGrad.addColorStop(1, amb.sky2);
  DX.fillStyle = skyGrad;
  DX.fillRect(0, 0, DW, GROUND);

  // Stars / particles
  BG.stars.forEach(s => {
    s.twinkle += 0.04;
    const alpha = 0.3 + 0.5 * Math.abs(Math.sin(s.twinkle));
    DX.fillStyle = `rgba(${hexToRgb(amb.star)},${alpha.toFixed(2)})`;
    DX.beginPath(); DX.arc(s.x, s.y, s.r, 0, Math.PI*2); DX.fill();
  });

  // Moon / sun (ambiente-specific)
  const moonX = 260, moonY = 22;
  if (dScore < 300) {
    // Luna – ciudad nocturna
    DX.fillStyle = 'rgba(200,220,255,0.55)';
    DX.beginPath(); DX.arc(moonX, moonY, 10, 0, Math.PI*2); DX.fill();
    DX.fillStyle = amb.sky1;
    DX.beginPath(); DX.arc(moonX+4, moonY-2, 8, 0, Math.PI*2); DX.fill();
  } else if (dScore < 700) {
    // Sol – desierto
    DX.fillStyle = 'rgba(255,180,40,0.70)';
    DX.beginPath(); DX.arc(moonX, moonY, 12, 0, Math.PI*2); DX.fill();
    DX.strokeStyle = 'rgba(255,200,60,0.4)'; DX.lineWidth = 2;
    for (let r = 0; r < 8; r++) {
      const a = (r/8)*Math.PI*2 + dFrame*0.01;
      DX.beginPath();
      DX.moveTo(moonX+Math.cos(a)*14, moonY+Math.sin(a)*14);
      DX.lineTo(moonX+Math.cos(a)*20, moonY+Math.sin(a)*20);
      DX.stroke();
    }
  } else if (dScore < 1200) {
    // Luna llena – montaña
    DX.fillStyle = 'rgba(210,240,200,0.50)';
    DX.beginPath(); DX.arc(moonX, moonY, 11, 0, Math.PI*2); DX.fill();
  } else {
    // Planetas – espacio
    DX.fillStyle = 'rgba(155,89,182,0.60)';
    DX.beginPath(); DX.arc(moonX, moonY, 14, 0, Math.PI*2); DX.fill();
    DX.strokeStyle = 'rgba(180,120,220,0.40)'; DX.lineWidth = 3;
    DX.beginPath(); DX.ellipse(moonX, moonY, 22, 6, 0.4, 0, Math.PI*2); DX.stroke();
  }

  // Far layer – edificios/siluetas
  const farAlpha = dScore < 300 ? 0.55 : dScore < 700 ? 0.35 : 0.25;
  DX.fillStyle = `rgba(${hexToRgb(amb.sky1)},${farAlpha})`;
  DX.fillStyle = adjustHex(amb.sky1, 20);
  BG.layers[0].items.forEach(item => {
    // Edificio con ventanitas
    DX.fillStyle = adjustHex(amb.sky1, 25);
    DX.fillRect(item.x, GROUND - item.h, item.w, item.h);
    if (dScore < 300) {
      // Ventanillas iluminadas
      DX.fillStyle = 'rgba(255,220,80,0.45)';
      for (let wy = GROUND-item.h+4; wy < GROUND-6; wy += 8) {
        for (let wx = item.x+3; wx < item.x+item.w-3; wx += 6) {
          if (Math.random() > 0.45) DX.fillRect(wx, wy, 3, 3);
        }
      }
    }
  });

  // Mid layer
  BG.layers[1].items.forEach(item => {
    DX.fillStyle = adjustHex(amb.sky2, 40);
    DX.fillRect(item.x, GROUND - item.h, item.w, item.h);
  });

  // Ground strip
  const gndGrad = DX.createLinearGradient(0, GROUND, 0, DH);
  gndGrad.addColorStop(0, amb.ground);
  gndGrad.addColorStop(1, darkenHex(amb.ground, 30));
  DX.fillStyle = gndGrad;
  DX.fillRect(0, GROUND, DW, DH - GROUND);

  // Ground line
  DX.strokeStyle = amb.accent + '55';
  DX.lineWidth = 1;
  DX.beginPath(); DX.moveTo(0, GROUND+1); DX.lineTo(DW, GROUND+1); DX.stroke();

  // Near layer – detalles de suelo (piedras, hierbas)
  BG.layers[2].items.forEach(item => {
    DX.fillStyle = adjustHex(amb.ground, 60);
    DX.fillRect(item.x, GROUND - item.h, item.w, item.h);
  });

  // Ambient overlay (transición de ambiente)
  const t = (dScore % 300) / 300;
  if (t < 0.1 && dScore > 0) {
    DX.fillStyle = `rgba(255,255,255,${0.04 * (1 - t / 0.1)})`;
    DX.fillRect(0, 0, DW, DH);
  }
}

// ─── Color utils ───────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
function adjustHex(hex, amt) {
  let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  r=Math.min(255,Math.max(0,r+amt)); g=Math.min(255,Math.max(0,g+amt)); b=Math.min(255,Math.max(0,b+amt));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
function darkenHex(hex, amt) { return adjustHex(hex, -amt); }

// ─── Verduras (power-up +25) ───────────────────────────────────────────────
const VEGGIES = ['🥕','🥦','🧅','🌽','🫑','🥬','🍅','🧄'];
// Dibujamos con emoji en canvas
function spawnVeggie() {
  if (Math.random() > 0.004) return; // probabilidad baja por frame
  const emoji = VEGGIES[Math.floor(Math.random() * VEGGIES.length)];
  veggies.push({ x: DW + 10, y: GROUND - 14 - Math.random() * 20, emoji, w: 14, h: 14, collected: false });
}

function updateVeggies() {
  for (let i = veggies.length - 1; i >= 0; i--) {
    const v = veggies[i];
    v.x -= dSpeed * 0.95;
    if (v.x + v.w < 0) { veggies.splice(i, 1); continue; }
    // Colisión con llama
    const pad = 3;
    const dinoH = dino.ducking ? 22 : dino.h;
    const dinoY = dino.ducking ? GROUND+4 : dino.y;
    if (!v.collected &&
        dino.x+pad < v.x+v.w && dino.x+dino.w-pad > v.x &&
        dinoY-dinoH+pad < v.y+v.h && dinoY > v.y-pad) {
      v.collected = true;
      dScore += 25;
      sfxVeggie();
      veggieMsgTimer = 45;
      veggieMsgX = v.x;
      veggieMsgY = v.y - 10;
      veggies.splice(i, 1);
    }
  }
}

function drawVeggies() {
  DX.font = '12px serif';
  DX.textAlign = 'center';
  veggies.forEach(v => {
    // Pequeño halo
    DX.shadowColor = '#2DC653';
    DX.shadowBlur = 6;
    DX.fillText(v.emoji, v.x + v.w/2, v.y + v.h);
    DX.shadowBlur = 0;
  });
  // Mensaje +25
  if (veggieMsgTimer > 0) {
    const alpha = Math.min(1, veggieMsgTimer / 20);
    DX.fillStyle = `rgba(61,255,120,${alpha.toFixed(2)})`;
    DX.font = 'bold 11px Nunito, sans-serif';
    DX.textAlign = 'center';
    DX.shadowColor = '#2DC653'; DX.shadowBlur = 8;
    DX.fillText('+25 🥗', veggieMsgX, veggieMsgY - (45 - veggieMsgTimer) * 0.5);
    DX.shadowBlur = 0;
    veggieMsgTimer--;
  }
}

// ─── Firebase ──────────────────────────────────────────────────────────────
window.setDinoDificultad = function(val) { dinoDificultad = parseInt(val) || 0; };

// ─── Init ──────────────────────────────────────────────────────────────────
function dinoInit() {
  dino = { x:40, y:GROUND, w:26, h:32, vy:0, onGround:true, ducking:false, frame:0, fastFall:false };
  obstacles = [];
  veggies   = [];
  dScore = 0; dSpeed = 1.8; dFrame = 0;
  _dRunning = true; dOver = false;
  dEstado = 'jugando';
  deathAnimTimer = 0; newRecordFlash = 0;
  document.getElementById('dinoScore').textContent = 0;
  document.getElementById('dinoHi').textContent = dHi;
  bgInit();
  cancelAnimationFrame(dAnimFrame);
  dAnimFrame = requestAnimationFrame(dinoLoop);
}

// ─── Loop principal ────────────────────────────────────────────────────────
function dinoLoop() {
  if (dEstado === 'muerto') {
    // Continúa animando la pantalla de muerte
    deathAnimTimer++;
    dinoDraw();
    drawDeathScreen();
    dAnimFrame = requestAnimationFrame(dinoLoop);
    return;
  }
  if (dEstado === 'inicio') {
    drawIntroScreen();
    dAnimFrame = requestAnimationFrame(dinoLoop);
    return;
  }
  if (!_dRunning) return;

  dFrame++;

  const difRatio = dinoDificultad / 80;
  const velocidadInicial = 1.8 + difRatio * 3.2;
  const velocidadMax     = 7   + difRatio * 5;
  const aceleracion      = 0.6 + difRatio * 1.2;
  dSpeed = Math.min(velocidadInicial + (dScore / 80) * aceleracion, velocidadMax);

  // Física
  if (!dino.onGround) {
    const gravedad = dino.fastFall ? 2.4 : 0.7;
    dino.vy += gravedad;
    dino.y  += dino.vy;
    if (dino.y >= GROUND) { dino.y = GROUND; dino.vy = 0; dino.onGround = true; dino.fastFall = false; }
  }
  dino.frame = Math.floor(dFrame / 6) % 2;

  // Spawn obstáculos
  const gapMin = 180 - (dinoDificultad / 80) * 80;
  const gapMax = 120 - (dinoDificultad / 80) * 40;
  if (obstacles.length === 0 || obstacles[obstacles.length-1].x < DW - (gapMin + Math.random()*gapMax)) {
    const h = 20 + Math.floor(Math.random()*22);
    const w = 12 + Math.floor(Math.random()*10);
    const birdThreshold = Math.max(50, 400 - (dinoDificultad / 80) * 350);
    const isBird = dScore > birdThreshold && Math.random() < (0.3 + (dinoDificultad / 80) * 0.25);
    obstacles.push({ x:DW+10, y: isBird ? GROUND-30 : GROUND, w, h: isBird ? 14 : h, bird:isBird, frame:0 });
  }

  // Mover obstáculos y colisión
  for (let i = obstacles.length-1; i >= 0; i--) {
    obstacles[i].x -= dSpeed;
    obstacles[i].frame = Math.floor(dFrame / 8) % 2;
    if (obstacles[i].x + obstacles[i].w < 0) { obstacles.splice(i,1); continue; }
    const dinoH = dino.ducking ? 22 : dino.h;
    const dinoY = dino.ducking ? GROUND+4 : dino.y;
    const pad = 4;
    if (dino.x+pad < obstacles[i].x+obstacles[i].w-pad &&
        dino.x+dino.w-pad > obstacles[i].x+pad &&
        dinoY-dinoH+pad < obstacles[i].y &&
        dinoY > obstacles[i].y-obstacles[i].h+pad) {
      dinoDead(); return;
    }
  }

  // Verduras
  spawnVeggie();
  updateVeggies();

  dScore++;
  document.getElementById('dinoScore').textContent = dScore;
  const wasRecord = dScore > dHi;
  if (wasRecord) {
    dHi = dScore;
    localStorage.setItem('dinoHiC', dHi);
    document.getElementById('dinoHi').textContent = dHi;
    if (newRecordFlash === 0) { sfxRecord(); newRecordFlash = 80; }
    if (typeof window.notificarRecordJuego === 'function') window.notificarRecordJuego('dino', dHi);
  }
  if (newRecordFlash > 0) newRecordFlash--;
  if (typeof window.actualizarBarraRecompensa === 'function') window.actualizarBarraRecompensa();

  bgUpdate();
  dinoDraw();
  dAnimFrame = requestAnimationFrame(dinoLoop);
}

// ─── Sprites Llama (originales conservados, sin cambios) ──────────────────
function drawLlamaRun1(px0, py0) {
  const T='#3DBFB8', L='#7EEEE9', D='#1A8C87', W='#FFFFFF', E='#0a1a1a', S='#B2F5F2';
  const p=(c,x,y,w,h)=>{ DX.fillStyle=c; DX.fillRect(px0+x,py0+y,w,h); };
  p(S,20,0,3,3); p(S,2,6,3,3); p(S,28,10,3,3);
  p(L,12,2,6,4); p(T,10,4,10,6); p(L,8,6,4,4); p(L,16,6,6,4);
  p(T,6,10,18,14); p(L,8,10,6,6); p(L,18,12,6,4); p(D,6,16,4,8); p(D,22,14,4,10);
  p(W,8,14,7,7); p(W,17,15,7,7); p(E,10,16,3,3); p(E,19,16,3,3); p(L,9,22,12,4);
  p(T,8,24,5,6); p(D,8,28,5,3); p(D,18,24,5,3); p(T,18,24,5,5);
  p(S,4,28,2,2); p(S,24,30,2,2);
}
function drawLlamaRun2(px0, py0) {
  const T='#3DBFB8', L='#7EEEE9', D='#1A8C87', W='#FFFFFF', E='#0a1a1a', S='#B2F5F2';
  const p=(c,x,y,w,h)=>{ DX.fillStyle=c; DX.fillRect(px0+x,py0+y,w,h); };
  p(S,2,4,3,3); p(S,26,8,3,3); p(S,18,0,2,2);
  p(L,10,2,8,4); p(T,8,4,12,8); p(L,6,8,5,5); p(L,18,6,6,4);
  p(T,5,12,20,12); p(L,7,12,7,6); p(L,17,14,6,4); p(D,5,18,4,6); p(D,22,16,4,8);
  p(W,8,14,7,7); p(W,17,15,7,7); p(E,10,16,3,3); p(E,19,16,3,3); p(L,9,22,12,4);
  p(D,8,24,5,3); p(T,8,24,5,5); p(T,18,24,5,6); p(D,18,28,5,3);
  p(S,6,30,2,2); p(S,22,28,2,2);
}
function drawLlamaJump(px0, py0) {
  const T='#3DBFB8', L='#7EEEE9', D='#1A8C87', W='#FFFFFF', E='#0a1a1a', S='#B2F5F2';
  const p=(c,x,y,w,h)=>{ DX.fillStyle=c; DX.fillRect(px0+x,py0+y,w,h); };
  p(S,0,2,2,2); p(S,26,0,3,3); p(S,30,14,2,2); p(S,4,20,2,2);
  p(L,14,0,6,3); p(T,12,2,10,6); p(L,10,4,5,6); p(L,20,4,6,6); p(T,8,8,16,8); p(D,24,8,4,10);
  p(T,6,14,20,12); p(L,8,14,8,6); p(D,6,20,4,6);
  p(W,9,15,7,7); p(W,18,16,6,6); p(E,11,17,3,3); p(E,20,17,2,3); p(L,10,22,11,3);
  p(T,9,26,4,4); p(D,9,28,4,2); p(T,18,26,4,4); p(D,18,28,4,2);
  p(S,12,32,3,2); p(S,18,34,2,2);
}
function drawLlamaDuck(px0, py0) {
  const T='#3DBFB8', L='#7EEEE9', D='#1A8C87', W='#FFFFFF', E='#0a1a1a', S='#B2F5F2';
  const p=(c,x,y,w,h)=>{ DX.fillStyle=c; DX.fillRect(px0+x,py0+y,w,h); };
  p(S,0,6,2,2); p(S,36,4,2,2); p(S,4,18,2,2);
  p(L,8,0,8,4); p(L,22,2,6,4); p(T,4,4,30,6); p(L,6,4,10,4); p(L,22,4,8,4); p(D,0,8,4,8); p(D,34,8,4,8);
  p(T,2,8,34,10); p(L,4,8,12,6); p(D,28,10,6,6);
  p(W,7,9,7,7); p(W,22,9,7,7); p(E,9,11,3,3); p(E,24,11,3,3); p(L,8,16,20,3);
  p(T,4,18,6,4); p(D,4,20,6,2); p(T,28,18,6,4); p(D,28,20,6,2);
  p(S,10,22,2,2); p(S,26,22,2,2);
}

// ─── Draw principal ────────────────────────────────────────────────────────
function dinoDraw() {
  bgDraw();

  // Llama
  DX.save();
  if (dino.ducking) {
    drawLlamaDuck(dino.x - 6, dino.y - 22);
  } else if (!dino.onGround) {
    drawLlamaJump(dino.x - 3, dino.y - 36);
  } else if (dino.frame === 0) {
    drawLlamaRun1(dino.x - 2, dino.y - 32);
  } else {
    drawLlamaRun2(dino.x - 2, dino.y - 32);
  }
  DX.restore();

  // Obstáculos (mejorados visualmente)
  obstacles.forEach(ob => {
    if (ob.bird) {
      // Pájaro – naranja con alas animadas y beak
      DX.fillStyle = NARANJ;
      // cuerpo
      DX.beginPath();
      DX.ellipse(ob.x + ob.w/2, ob.y - ob.h/2, ob.w/2, ob.h/2, 0, 0, Math.PI*2);
      DX.fill();
      // alas
      DX.fillStyle = '#E8962A';
      const wingY = ob.frame === 0 ? -8 : 2;
      DX.beginPath();
      DX.ellipse(ob.x - 4, ob.y - ob.h/2 + wingY/2, ob.w/2+3, 4, -0.3, 0, Math.PI*2);
      DX.fill();
      DX.beginPath();
      DX.ellipse(ob.x + ob.w + 4, ob.y - ob.h/2 + wingY/2, ob.w/2+3, 4, 0.3, 0, Math.PI*2);
      DX.fill();
      // pico
      DX.fillStyle = '#F5C842';
      DX.beginPath();
      DX.moveTo(ob.x + ob.w + 1, ob.y - ob.h/2);
      DX.lineTo(ob.x + ob.w + 7, ob.y - ob.h/2 + 2);
      DX.lineTo(ob.x + ob.w + 1, ob.y - ob.h/2 + 4);
      DX.fill();
      // ojo
      DX.fillStyle = '#0a0a0a';
      DX.beginPath(); DX.arc(ob.x + ob.w - 4, ob.y - ob.h/2 - 1, 2, 0, Math.PI*2); DX.fill();
    } else {
      // Cactus verde mejorado
      const cx = ob.x, cy = ob.y, cw = ob.w, ch = ob.h;
      // Sombra
      DX.fillStyle = 'rgba(0,0,0,0.25)';
      DX.fillRect(cx+3, cy-ch+2, cw-6, ch);
      // Tronco
      DX.fillStyle = '#1fa83e';
      DX.fillRect(cx+3, cy-ch, cw-6, ch);
      // Brazos
      DX.fillStyle = '#25c44a';
      DX.fillRect(cx, cy-ch+6, cw, 5);
      DX.fillRect(cx, cy-ch+6, 4, -7);
      DX.fillRect(cx+cw-4, cy-ch+6, 4, -9);
      // Highlight
      DX.fillStyle = '#45e870';
      DX.fillRect(cx+5, cy-ch, 3, ch-4);
    }
  });

  // Verduras
  drawVeggies();



  // HUD: indicador de ambiente
  const amb = getAmbiente();
  const ambNames = ['🌃 Ciudad', '🏜️ Desierto', '⛰️ Montaña', '🚀 Espacio'];
  const ambIdx = AMBIENTES.reduce((acc, a, i) => dScore >= a.score ? i : acc, 0);
  DX.fillStyle = 'rgba(255,255,255,0.20)';
  DX.font = '7px Nunito, sans-serif';
  DX.textAlign = 'right';
  DX.fillText(ambNames[ambIdx], DW - 4, 10);
  DX.textAlign = 'left';
}

// ─── Pantalla de Inicio ────────────────────────────────────────────────────
function drawIntroScreen() {
  // Fondo
  const skyGrad = DX.createLinearGradient(0, 0, 0, DH);
  skyGrad.addColorStop(0, '#080c10');
  skyGrad.addColorStop(1, '#0d1520');
  DX.fillStyle = skyGrad; DX.fillRect(0,0,DW,DH);

  // Título Mordelón
  DX.textAlign = 'center';
  DX.font = 'bold 18px Righteous, Nunito, sans-serif';
  DX.fillStyle = '#D4831A';
  DX.shadowColor = '#D4831A'; DX.shadowBlur = 10;
  DX.fillText('🔥 MORDELÓN', DW/2, 38);
  DX.shadowBlur = 0;

  DX.font = 'bold 10px Nunito, sans-serif';
  DX.fillStyle = '#3DBFB8';
  DX.fillText('DINO RUN', DW/2, 52);

  // Llama estática (idle – frame alternante lento)
  const idleFrame = Math.floor(Date.now() / 500) % 2;
  if (idleFrame === 0) drawLlamaRun1(DW/2 - 16, GROUND - 32);
  else drawLlamaRun2(DW/2 - 16, GROUND - 32);

  // Ground
  DX.strokeStyle = '#3DBFB8AA'; DX.lineWidth = 1;
  DX.beginPath(); DX.moveTo(0,GROUND+1); DX.lineTo(DW,GROUND+1); DX.stroke();

  DX.fillStyle = '#aaa';
  DX.font = '9px Nunito, sans-serif';
  DX.textAlign = 'center';
  const blink = Math.floor(Date.now() / 600) % 2;
  if (blink) {
    DX.fillStyle = '#fff';
    DX.fillText('Tap · Espacio · ↑ para comenzar', DW/2, GROUND + 18);
  }

  if (dHi > 0) {
    DX.fillStyle = '#D4831A88';
    DX.font = '8px Nunito, sans-serif';
    DX.fillText('Récord: ' + dHi, DW/2, DH - 6);
  }
}

// ─── Death screen ──────────────────────────────────────────────────────────
function drawDeathScreen() {
  const t = Math.min(deathAnimTimer / 30, 1); // 0→1 en 30 frames
  const alpha = t * 0.78;

  // Overlay oscuro animado
  DX.fillStyle = `rgba(4,4,12,${alpha.toFixed(2)})`;
  DX.fillRect(0, 0, DW, DH);

  if (t < 0.5) return; // espera antes de mostrar texto

  const textAlpha = Math.min((t - 0.5) / 0.5, 1);

  // Panel central
  const panW = 210, panH = 72;
  const px = (DW - panW) / 2, py = (DH - panH) / 2 - 6;
  DX.fillStyle = `rgba(8,12,20,${(textAlpha * 0.92).toFixed(2)})`;
  roundRect(DX, px, py, panW, panH, 6);
  DX.fill();

  // Borde turquesa
  DX.strokeStyle = `rgba(61,191,184,${textAlpha.toFixed(2)})`;
  DX.lineWidth = 1.5;
  roundRect(DX, px, py, panW, panH, 6);
  DX.stroke();

  // GAME OVER
  DX.textAlign = 'center';
  DX.font = `bold 16px Righteous, Nunito, sans-serif`;
  DX.fillStyle = `rgba(255,80,60,${textAlpha.toFixed(2)})`;
  DX.shadowColor = '#ff4030'; DX.shadowBlur = 8 * textAlpha;
  DX.fillText('GAME OVER', DW/2, py + 22);
  DX.shadowBlur = 0;

  // Puntos
  DX.font = `11px Nunito, sans-serif`;
  DX.fillStyle = `rgba(200,200,220,${textAlpha.toFixed(2)})`;
  DX.fillText(`Puntos: ${dScore}`, DW/2 - 40, py + 40);

  // Récord (con color especial si es nuevo)
  const isNew = dScore >= dHi;
  DX.fillStyle = isNew
    ? `rgba(212,131,26,${textAlpha.toFixed(2)})`
    : `rgba(160,160,180,${textAlpha.toFixed(2)})`;
  DX.fillText((isNew ? '🏆 ' : '') + `Récord: ${dHi}`, DW/2 + 42, py + 40);

  // Separador
  DX.strokeStyle = `rgba(61,191,184,${(textAlpha*0.3).toFixed(2)})`;
  DX.lineWidth = 1;
  DX.beginPath(); DX.moveTo(px+12, py+46); DX.lineTo(px+panW-12, py+46); DX.stroke();

  // Hint de reinicio (parpadeo tardío)
  if (deathAnimTimer > 60) {
    const blinkOn = Math.floor(deathAnimTimer / 25) % 2;
    if (blinkOn) {
      DX.fillStyle = `rgba(61,191,184,${textAlpha.toFixed(2)})`;
      DX.font = '9px Nunito, sans-serif';
      DX.fillText('Tap · Espacio para reiniciar', DW/2, py + 62);
    }
  }

  DX.textAlign = 'left';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}

// ─── Muerte ────────────────────────────────────────────────────────────────
function dinoDead() {
  _dRunning = false; dOver = true; dEstado = 'muerto';
  deathAnimTimer = 0;
  sfxDead();
  cancelAnimationFrame(dAnimFrame);
  dAnimFrame = requestAnimationFrame(dinoLoop);
  setTimeout(() => {
    if (typeof window.abrirLeaderboard === 'function') window.abrirLeaderboard('dino', dScore);
  }, 2200);
}

// ─── Controles expuestos ───────────────────────────────────────────────────
window.dinoJump = async function() {
  // Desde intro: iniciar
  if (dEstado === 'inicio') {
    getAudio(); // desbloquear contexto de audio
    dinoInit(); return;
  }
  if (dEstado === 'muerto' && deathAnimTimer > 40) {
    if (typeof window.juegoRequiereFichas === 'function' && window.juegoRequiereFichas('dino')) {
      if (typeof window.juegoConsumirFicha === 'function') {
        const ok = await window.juegoConsumirFicha('dino');
        if (!ok) { if (typeof showToast === 'function') showToast('🎟️ Sin fichas para Dino'); return; }
      }
    }
    dinoInit(); return;
  }
  if (!_dRunning) return;
  if (dino.onGround) { dino.vy = -12; dino.onGround = false; dino.fastFall = false; sfxJump(); }
};

window.dinoFastFall = function() {
  if (!_dRunning) return;
  if (!dino.onGround) { dino.fastFall = true; }
  else { dino.ducking = true; }
};
window.dinoDuck = function(on) { if (_dRunning) dino.ducking = on; };
window.dinoInit  = dinoInit;
window.dinoReset = async function() {
  if (typeof window.juegoRequiereFichas === 'function' && window.juegoRequiereFichas('dino')) {
    if (typeof window.juegoConsumirFicha === 'function') {
      const ok = await window.juegoConsumirFicha('dino');
      if (!ok) { if (typeof showToast === 'function') showToast('🎟️ Sin fichas para Dino'); return; }
    }
  }
  cancelAnimationFrame(dAnimFrame); dinoInit();
};

// ─── Arrancar en pantalla de inicio ───────────────────────────────────────
bgInit();
dEstado = 'inicio';
dAnimFrame = requestAnimationFrame(dinoLoop);

// ─── Eventos ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (document.getElementById('juegoDino').style.display === 'none') return;
  if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); window.dinoJump(); }
  if (e.key === 'ArrowDown') { e.preventDefault(); window.dinoFastFall(); }
});
document.addEventListener('keyup', e => {
  if (e.key === 'ArrowDown') { if (dino && dino.onGround) dino.ducking = false; }
});
DC.addEventListener('pointerdown', () => window.dinoJump(), { passive: true });
(() => {
  let sy;
  DC.addEventListener('touchstart', e => { sy = e.touches[0].clientY; }, { passive: true });
  DC.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - sy;
    if (dy > 20) { window.dinoFastFall(); setTimeout(() => { if (dino && dino.onGround) dino.ducking = false; }, 300); }
    else window.dinoJump();
  }, { passive: true });
})();
