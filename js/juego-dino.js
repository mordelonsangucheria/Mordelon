// ===================== DINO =====================
const DC = document.getElementById('dinoCanvas');
const DX = DC.getContext('2d');
const DW = 320, DH = 160;
const GROUND = DH - 28;
const TURQ = '#3DBFB8';
const NARANJ = '#D4831A';

let dino, obstacles, dScore, dHi = parseInt(localStorage.getItem('dinoHiC')||'0');
let dSpeed, dFrame, dRunning, dOver, dAnimFrame;
let dinoDificultad = 0; // 0 = normal, valor de Firebase (0-80)

// Escuchar dificultad desde Firebase
try {
  import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').then(({getDoc, doc}) => {
    // Se intenta leer desde la instancia global de db si existe
  });
} catch(e) {}
// Función para que el sistema Firebase la llame al cargar config
window.setDinoDificultad = function(val) { dinoDificultad = parseInt(val) || 0; };

function dinoInit() {
  dino = { x:40, y:GROUND, w:26, h:32, vy:0, onGround:true, ducking:false, frame:0 };
  obstacles = [];
  dScore = 0; dSpeed = 1.8; dFrame = 0; dRunning = true; dOver = false;
  document.getElementById('dinoScore').textContent = 0;
  document.getElementById('dinoHi').textContent = dHi;
  cancelAnimationFrame(dAnimFrame);
  dinoLoop();
}

function dinoLoop() {
  if(!dRunning) return;
  dFrame++;
  // dinoDificultad (0-80): 0 = normal, 80 = muy difícil
  // Afecta: velocidad inicial, velocidad máxima, y ritmo de aceleración
  const difRatio = dinoDificultad / 80;           // 0.0 → 1.0
  const velocidadInicial = 1.8 + difRatio * 3.2;  // rango: 1.8 → 5.0
  const velocidadMax     = 7   + difRatio * 5;    // rango: 7   → 12
  const aceleracion      = 0.6 + difRatio * 1.2;  // rango: 0.6 → 1.8
  dSpeed = Math.min(velocidadInicial + (dScore / 80) * aceleracion, velocidadMax);

  // Physics — fast fall: si está en el aire y apretó abajo, cae más rápido
  if(!dino.onGround) {
    const gravedad = dino.fastFall ? 2.4 : 0.7;
    dino.vy += gravedad;
    dino.y += dino.vy;
    if(dino.y >= GROUND) { dino.y = GROUND; dino.vy = 0; dino.onGround = true; dino.fastFall = false; }
  }
  dino.frame = Math.floor(dFrame / 6) % 2;

  // Spawn obstacles — con dificultad alta, el gap mínimo es menor (más frecuentes)
  const gapMin = 180 - (dinoDificultad / 80) * 80;  // 180 → 100 según dificultad
  const gapMax = 120 - (dinoDificultad / 80) * 40;  // 120 → 80 según dificultad
  if(obstacles.length === 0 || obstacles[obstacles.length-1].x < DW - (gapMin + Math.random()*gapMax)) {
    const h = 20 + Math.floor(Math.random()*22);
    const w = 12 + Math.floor(Math.random()*10);
    const birdThreshold = Math.max(50, 400 - (dinoDificultad / 80) * 350); // aparecen antes con más dificultad
    const isBird = dScore > birdThreshold && Math.random() < (0.3 + (dinoDificultad / 80) * 0.25);
    obstacles.push({ x:DW+10, y: isBird ? GROUND-30 : GROUND, w, h: isBird ? 14 : h, bird:isBird, frame:0 });
  }

  // Move obstacles & collision
  for(let i = obstacles.length-1; i >= 0; i--) {
    obstacles[i].x -= dSpeed;
    obstacles[i].frame = Math.floor(dFrame / 8) % 2;
    if(obstacles[i].x + obstacles[i].w < 0) { obstacles.splice(i,1); continue; }
    const dinoH = dino.ducking ? 22 : dino.h;
    const dinoY = dino.ducking ? GROUND+4 : dino.y;
    const pad = 4;
    if(dino.x+pad < obstacles[i].x+obstacles[i].w-pad &&
       dino.x+dino.w-pad > obstacles[i].x+pad &&
       dinoY-dinoH+pad < obstacles[i].y &&
       dinoY > obstacles[i].y-obstacles[i].h+pad) {
      dinoDead(); return;
    }
  }

  dScore++;
  document.getElementById('dinoScore').textContent = dScore;
  if(dScore > dHi) { dHi = dScore; localStorage.setItem('dinoHiC', dHi); document.getElementById('dinoHi').textContent = dHi; if(typeof window.notificarRecordJuego==='function')window.notificarRecordJuego('dino',dHi); }
  if(typeof window.actualizarBarraRecompensa==="function") window.actualizarBarraRecompensa();

  dinoDraw();
  dAnimFrame = requestAnimationFrame(dinoLoop);
}

// ── Llama de Mordelón – pixel-art sprite ──────────────────────────────────
// Each sprite is drawn on a 2px pixel grid relative to (px, py) = top-left corner.
// Colors from the reference image:
//   TURQ      = '#3DBFB8'  (mid flame)
//   LIGHT     = '#7EEEE9'  (highlight / bright flame tips)
//   DARK      = '#1A8C87'  (shadow / depth)
//   WHITE     = '#FFFFFF'  (eye whites)
//   EYEDARK   = '#0a1a1a'  (pupils)
//   SPARK     = '#B2F5F2'  (tiny sparks around flame)

function px(ctx, color, x, y, w, h) {
  // draw a pixel block scaled ×2
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawLlamaRun1(px0, py0) {
  // CORRIENDO 1 — flame leans right, left leg forward
  const T='#3DBFB8', L='#7EEEE9', D='#1A8C87', W='#FFFFFF', E='#0a1a1a', S='#B2F5F2';
  const p=(c,x,y,w,h)=>{ DX.fillStyle=c; DX.fillRect(px0+x,py0+y,w,h); };

  // sparks
  p(S, 20,0, 3,3);  p(S, 2,6, 3,3);  p(S, 28,10, 3,3);

  // flame tip (top)
  p(L, 12,2, 6,4);
  p(T, 10,4, 10,6);
  p(L, 8,6, 4,4);   p(L, 16,6, 6,4);

  // flame body
  p(T, 6,10, 18,14);
  p(L, 8,10, 6,6);   p(L, 18,12, 6,4);
  p(D, 6,16, 4,8);   p(D, 22,14, 4,10);

  // face area
  p(W, 8,14, 7,7);   p(W, 17,15, 7,7);   // eye whites
  p(E, 10,16, 3,3);  p(E, 19,16, 3,3);   // pupils
  p(L, 9,22, 12,4);                        // smile

  // legs (frame 1: left forward, right back)
  p(T, 8,24, 5,6);   p(D, 8,28, 5,3);    // left leg
  p(D, 18,24, 5,3);  p(T, 18,24, 5,5);   // right leg (back, shorter)

  // bottom sparks
  p(S, 4,28, 2,2);  p(S, 24,30, 2,2);
}

function drawLlamaRun2(px0, py0) {
  // CORRIENDO 2 — flame centered, right leg forward
  const T='#3DBFB8', L='#7EEEE9', D='#1A8C87', W='#FFFFFF', E='#0a1a1a', S='#B2F5F2';
  const p=(c,x,y,w,h)=>{ DX.fillStyle=c; DX.fillRect(px0+x,py0+y,w,h); };

  // sparks
  p(S, 2,4, 3,3);  p(S, 26,8, 3,3);  p(S, 18,0, 2,2);

  // flame tip
  p(L, 10,2, 8,4);
  p(T, 8,4, 12,8);
  p(L, 6,8, 5,5);   p(L, 18,6, 6,4);

  // flame body
  p(T, 5,12, 20,12);
  p(L, 7,12, 7,6);   p(L, 17,14, 6,4);
  p(D, 5,18, 4,6);   p(D, 22,16, 4,8);

  // face
  p(W, 8,14, 7,7);   p(W, 17,15, 7,7);
  p(E, 10,16, 3,3);  p(E, 19,16, 3,3);
  p(L, 9,22, 12,4);

  // legs (frame 2: right forward, left back)
  p(D, 8,24, 5,3);   p(T, 8,24, 5,5);    // left leg (back)
  p(T, 18,24, 5,6);  p(D, 18,28, 5,3);   // right leg (forward)

  // bottom sparks
  p(S, 6,30, 2,2);  p(S, 22,28, 2,2);
}

function drawLlamaJump(px0, py0) {
  // SALTANDO — flame tall, stretched up, legs tucked
  const T='#3DBFB8', L='#7EEEE9', D='#1A8C87', W='#FFFFFF', E='#0a1a1a', S='#B2F5F2';
  const p=(c,x,y,w,h)=>{ DX.fillStyle=c; DX.fillRect(px0+x,py0+y,w,h); };

  // sparks (more scattered, sense of height)
  p(S, 0,2, 2,2);  p(S, 26,0, 3,3);  p(S, 30,14, 2,2);  p(S, 4,20, 2,2);

  // tall flame tip
  p(L, 14,0, 6,3);
  p(T, 12,2, 10,6);
  p(L, 10,4, 5,6);  p(L, 20,4, 6,6);
  p(T, 8,8, 16,8);
  p(D, 24,8, 4,10);

  // flame body (taller / stretched)
  p(T, 6,14, 20,12);
  p(L, 8,14, 8,6);
  p(D, 6,20, 4,6);

  // face
  p(W, 9,15, 7,7);   p(W, 18,16, 6,6);
  p(E, 11,17, 3,3);  p(E, 20,17, 2,3);
  p(L, 10,22, 11,3);

  // legs tucked up (both bent inward)
  p(T, 9,26, 4,4);   p(D, 9,28, 4,2);
  p(T, 18,26, 4,4);  p(D, 18,28, 4,2);

  // trail sparks below
  p(S, 12,32, 3,2);  p(S, 18,34, 2,2);
}

function drawLlamaDuck(px0, py0) {
  // AGACHADO — flat & wide, flame compressed
  const T='#3DBFB8', L='#7EEEE9', D='#1A8C87', W='#FFFFFF', E='#0a1a1a', S='#B2F5F2';
  const p=(c,x,y,w,h)=>{ DX.fillStyle=c; DX.fillRect(px0+x,py0+y,w,h); };

  // sparks (side)
  p(S, 0,6, 2,2);  p(S, 36,4, 2,2);  p(S, 4,18, 2,2);

  // flat flame (wide, low)
  p(L, 8,0, 8,4);   p(L, 22,2, 6,4);    // flame tips low
  p(T, 4,4, 30,6);
  p(L, 6,4, 10,4);  p(L, 22,4, 8,4);
  p(D, 0,8, 4,8);   p(D, 34,8, 4,8);

  // body (squashed)
  p(T, 2,8, 34,10);
  p(L, 4,8, 12,6);
  p(D, 28,10, 6,6);

  // face (wider apart, lower)
  p(W, 7,9, 7,7);   p(W, 22,9, 7,7);
  p(E, 9,11, 3,3);  p(E, 24,11, 3,3);
  p(L, 8,16, 20,3);   // wide smile

  // tiny legs flat outward
  p(T, 4,18, 6,4);   p(D, 4,20, 6,2);
  p(T, 28,18, 6,4);  p(D, 28,20, 6,2);

  // ground sparks
  p(S, 10,22, 2,2);  p(S, 26,22, 2,2);
}

function dinoDraw() {
  DX.fillStyle = '#0a0a0a'; DX.fillRect(0,0,DW,DH);

  // Ground line
  DX.strokeStyle = '#333'; DX.lineWidth = 1;
  DX.beginPath(); DX.moveTo(0,GROUND+2); DX.lineTo(DW,GROUND+2); DX.stroke();

  // Draw llama sprite based on state
  // sprite anchor: bottom of sprite = GROUND (feet touching ground)
  if(dino.ducking) {
    // Duck sprite: 38px wide, 24px tall
    drawLlamaDuck(dino.x - 6, dino.y - 22);
  } else if(!dino.onGround) {
    // Jump sprite: 32px wide, 36px tall
    drawLlamaJump(dino.x - 3, dino.y - 36);
  } else if(dino.frame === 0) {
    // Run frame 1: 32px wide, 32px tall
    drawLlamaRun1(dino.x - 2, dino.y - 32);
  } else {
    // Run frame 2
    drawLlamaRun2(dino.x - 2, dino.y - 32);
  }

  // Obstacles
  obstacles.forEach(ob => {
    if(ob.bird) {
      DX.fillStyle = NARANJ;
      DX.fillRect(ob.x, ob.y-ob.h, ob.w, ob.h);
      DX.fillRect(ob.x-4, ob.y-ob.h+(ob.frame===0?-6:4), ob.w+8, 5);
      DX.fillRect(ob.x+ob.w, ob.y-ob.h+3, 6, 3);
    } else {
      DX.fillStyle = '#2DC653';
      DX.fillRect(ob.x+3, ob.y-ob.h, ob.w-6, ob.h);
      DX.fillRect(ob.x, ob.y-ob.h+6, ob.w, 5);
      DX.fillRect(ob.x, ob.y-ob.h+6, 4, -6);
      DX.fillRect(ob.x+ob.w-4, ob.y-ob.h+6, 4, -8);
    }
  });

  if(dScore>0 && dScore%100===0 && dFrame%20<10) {
    DX.fillStyle='rgba(61,191,184,0.12)'; DX.fillRect(0,0,DW,DH);
  }
}

function dinoDead() {
  dRunning=false; dOver=true; cancelAnimationFrame(dAnimFrame);
  dinoDraw();
  DX.fillStyle='rgba(0,0,0,0.65)'; DX.fillRect(0,50,DW,60);
  DX.fillStyle='#fff'; DX.font='bold 15px Nunito'; DX.textAlign='center';
  DX.fillText('GAME OVER',DW/2,74);
  DX.font='11px Nunito'; DX.fillStyle='#aaa';
  DX.fillText('Puntos: '+dScore+'  |  Récord: '+dHi,DW/2,94);
  DX.font='10px Nunito'; DX.fillStyle='#555';
  DX.fillText('Tap o Espacio para reiniciar',DW/2,110);
  setTimeout(function(){ if(typeof window.abrirLeaderboard==='function') window.abrirLeaderboard('dino'); }, 1200);
}

window.dinoJump = async function() {
  if(dOver){
    // Reiniciar después de game over — verificar fichas
    if (typeof window.juegoRequiereFichas==='function' && window.juegoRequiereFichas('dino')) {
      if (typeof window.juegoConsumirFicha==='function') {
        var ok = await window.juegoConsumirFicha('dino');
        if (!ok) { if(typeof showToast==='function') showToast('🎟️ Sin fichas para Dino'); return; }
      }
    }
    dinoInit();return;
  }
  if(!dRunning)return; if(dino.onGround){dino.vy=-12;dino.onGround=false;dino.fastFall=false;}
};
// Fast fall: en el aire cae rápido, en el piso se agacha
window.dinoFastFall = function() {
  if(!dRunning) return;
  if(!dino.onGround) { dino.fastFall = true; }
  else { dino.ducking = true; }
};
window.dinoDuck = function(on) { if(dRunning) dino.ducking=on; };
window.dinoInit  = dinoInit;
window.dinoReset = async function() {
  if (typeof window.juegoRequiereFichas==='function' && window.juegoRequiereFichas('dino')) {
    if (typeof window.juegoConsumirFicha==='function') {
      var ok = await window.juegoConsumirFicha('dino');
      if (!ok) { if(typeof showToast==='function') showToast('🎟️ Sin fichas para Dino'); return; }
    }
  }
  cancelAnimationFrame(dAnimFrame); dinoInit();
};

document.addEventListener('keydown', e=>{
  if(document.getElementById('juegoDino').style.display==='none') return;
  if(e.code==='Space'||e.key==='ArrowUp'){e.preventDefault();window.dinoJump();}
  if(e.key==='ArrowDown'){e.preventDefault();window.dinoFastFall();}
});
document.addEventListener('keyup', e=>{ if(e.key==='ArrowDown'){ if(dino&&dino.onGround) dino.ducking=false; } });
DC.addEventListener('pointerdown', ()=>window.dinoJump(), {passive:true});
(()=>{
  let sy;
  DC.addEventListener('touchstart',e=>{sy=e.touches[0].clientY;},{passive:true});
  DC.addEventListener('touchend',e=>{
    const dy=e.changedTouches[0].clientY-sy;
    if(dy>20){ window.dinoFastFall(); setTimeout(()=>{ if(dino&&dino.onGround) dino.ducking=false; },300); }
    else window.dinoJump();
  },{passive:true});
})();


