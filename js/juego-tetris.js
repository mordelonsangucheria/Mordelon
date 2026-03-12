// ===================== TETRIS — Mordelón v2 =====================

const TC = document.getElementById('tetrisCanvas');
const TX = TC.getContext('2d');
const TW = 10, TH = 20, TSZ = 20;

// ── Máquina de estados ──────────────────────────────────────────
const TSTATE = { IDLE:'idle', PLAYING:'playing', PAUSED:'paused', OVER:'over' };
let tState = TSTATE.IDLE;

Object.defineProperty(window, 'tetrisRunning', {
  get: () => tState === TSTATE.PLAYING,
  configurable: true
});

// ── Piezas e ingredientes ───────────────────────────────────────
const TETROMINOS = [
  [[1,1,1,1]],
  [[1,1],[1,1]],
  [[0,1,0],[1,1,1]],
  [[0,1,1],[1,1,0]],
  [[1,1,0],[0,1,1]],
  [[1,0,0],[1,1,1]],
  [[0,0,1],[1,1,1]]
];
const TCOLORS = ['pan','queso','lechuga','tomate','jamon','cebolla','pepino'];
const TPAL = {
  pan:'#C8903A', queso:'#FFD700', lechuga:'#4CAF50',
  tomate:'#E53935', jamon:'#E57373', cebolla:'#CE93D8', pepino:'#66BB6A'
};

// ── Web Audio API ───────────────────────────────────────────────
let tAudioCtx = null;
function tGetAudio() {
  if (!tAudioCtx) try { tAudioCtx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){}
  return tAudioCtx;
}
function tBeep(freq, dur, type='square', vol=0.15, detune=0) {
  const ctx=tGetAudio(); if(!ctx) return;
  try {
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type=type; o.frequency.value=freq; o.detune.value=detune;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
    o.start(); o.stop(ctx.currentTime+dur);
  } catch(e){}
}
function tSoundMove()   { tBeep(220,0.06,'square',0.08); }
function tSoundRotate() { tBeep(330,0.08,'triangle',0.12); }
function tSoundLock()   { tBeep(180,0.12,'sawtooth',0.15,-50); }
function tSoundLine(n) {
  [330,440,550,660].slice(0,n).forEach((f,i)=>setTimeout(()=>tBeep(f,0.18,'triangle',0.18),i*60));
  if(n>=4){ setTimeout(()=>tBeep(880,0.4,'triangle',0.25),250); setTimeout(()=>tBeep(1100,0.5,'sine',0.2),400); }
}
function tSoundOver()     { [220,196,175,147].forEach((f,i)=>setTimeout(()=>tBeep(f,0.3,'sawtooth',0.18),i*150)); }
function tSoundStart()    { [330,440,550,660].forEach((f,i)=>setTimeout(()=>tBeep(f,0.12,'triangle',0.14),i*80)); }
function tSoundHardDrop() { tBeep(150,0.1,'sawtooth',0.2,-100); setTimeout(()=>tBeep(80,0.15,'sawtooth',0.18),60); }
function tSoundMutate()   { tBeep(500,0.06,'square',0.15); setTimeout(()=>tBeep(280,0.14,'sawtooth',0.18),70); }

// ── Partículas ──────────────────────────────────────────────────
let tParticles = [];

function tSpawnParticles(row, snapshot) {
  // snapshot: copia de la fila ANTES de borrarla del tablero
  for (let x=0; x<TW; x++) {
    const tipo = snapshot && snapshot[x];
    const col = tipo ? (TPAL[tipo]||'#3DBFB8') : '#3DBFB8';
    for (let i=0; i<4; i++) {
      tParticles.push({
        x:(x+0.5)*TSZ, y:(row+0.5)*TSZ,
        vx:(Math.random()-0.5)*4, vy:(Math.random()-1.4)*4,
        life:1, col, size:2+Math.random()*3
      });
    }
  }
}

// tUpdateParticles solo DIBUJA — el movimiento lo hace el RAF loop
function tUpdateParticles() {
  tParticles.forEach(p=>{
    if(p.life<=0) return;
    const r=Math.max(0.01, p.size*p.life);
    TX.globalAlpha=Math.max(0,p.life);
    TX.fillStyle=p.col;
    TX.beginPath(); TX.arc(p.x,p.y,r,0,Math.PI*2); TX.fill();
  });
  TX.globalAlpha=1;
}

// Loop RAF independiente solo para mover partículas y redibujar
let tParticleRaf = null;
function tParticleLoop() {
  tParticleRaf = null;
  if(tParticles.length===0) return;
  tParticles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.vy+=0.25; p.life-=0.035; });
  tParticles = tParticles.filter(p=>p.life>0);
  if(tState===TSTATE.PLAYING||tState===TSTATE.PAUSED) tDraw();
  if(tParticles.length>0) tParticleRaf = requestAnimationFrame(tParticleLoop);
}
function tKickParticleLoop() {
  if(!tParticleRaf) tParticleRaf = requestAnimationFrame(tParticleLoop);
}

// ── Animación de fondo (ingredientes flotando) ──────────────────
const FLOAT_ITEMS = [
  {emoji:'🥬',color:'#4CAF50'},{emoji:'🧀',color:'#FFD700'},
  {emoji:'🍅',color:'#E53935'},{emoji:'🥓',color:'#E57373'},
  {emoji:'🥒',color:'#66BB6A'},{emoji:'🧅',color:'#CE93D8'},
  {emoji:'🍞',color:'#C8903A'}
];
let tFloaters = [];
let tFloatTimer = null;

function tInitFloaters() {
  tFloaters = Array.from({length:8}, (_,i) => ({
    x: Math.random() * TC.width,
    y: Math.random() * TC.height,
    vy: -0.3 - Math.random()*0.4,
    vx: (Math.random()-0.5)*0.3,
    size: 10 + Math.random()*10,
    alpha: 0.04 + Math.random()*0.08,
    rot: Math.random()*Math.PI*2,
    rotV: (Math.random()-0.5)*0.015,
    item: FLOAT_ITEMS[i % FLOAT_ITEMS.length]
  }));
}

function tDrawFloaters() {
  tFloaters.forEach(f=>{
    f.x += f.vx; f.y += f.vy; f.rot += f.rotV;
    if (f.y < -20) { f.y = TC.height+20; f.x = Math.random()*TC.width; }
    TX.save();
    TX.globalAlpha = f.alpha;
    TX.translate(f.x, f.y);
    TX.rotate(f.rot);
    TX.font = f.size+'px serif';
    TX.textAlign = 'center';
    TX.textBaseline = 'middle';
    TX.fillText(f.item.emoji, 0, 0);
    TX.restore();
  });
  TX.globalAlpha = 1;
}

// ── Pantalla inicio animada ─────────────────────────────────────
function tetrisDrawStart() {
  TX.fillStyle='#080c10'; TX.fillRect(0,0,TC.width,TC.height);
  tDrawFloaters();

  // Mini sanguche en píxeles
  const SS=12, SW=5;
  const sx0=Math.floor(TC.width/2-(SW*SS)/2), sy0=28;
  const SC={pan:'#C8903A',queso:'#FFD700',lechuga:'#4CAF50',tomate:'#E53935',jamon:'#E57373'};
  const SA={pan:'#E8B76A',queso:'#FFF176',lechuga:'#A5D6A7',tomate:'#EF9A9A',jamon:'#FFCDD2'};
  ['pan','queso','lechuga','tomate','jamon','pan'].forEach((tipo,ry)=>{
    for(let rx=0;rx<SW;rx++){
      const px=sx0+rx*SS, py=sy0+ry*SS;
      TX.fillStyle=SC[tipo]; TX.fillRect(px,py,SS-1,SS-1);
      TX.fillStyle=SA[tipo]; TX.fillRect(px+2,py+1,3,2);
    }
  });

  TX.strokeStyle='rgba(212,131,26,0.3)'; TX.lineWidth=1;
  TX.beginPath(); TX.moveTo(TC.width/2-50,110); TX.lineTo(TC.width/2+50,110); TX.stroke();

  TX.fillStyle='#D4831A'; TX.font='bold 26px Nunito,sans-serif'; TX.textAlign='center';
  TX.fillText('🥪 SANGUCHE',TC.width/2,140);
  TX.fillStyle='#3DBFB8'; TX.font='bold 15px Nunito,sans-serif';
  TX.fillText('T E T R I S',TC.width/2,160);

  TX.strokeStyle='rgba(61,191,184,0.2)';
  TX.beginPath(); TX.moveTo(TC.width/2-50,173); TX.lineTo(TC.width/2+50,173); TX.stroke();

  TX.fillStyle='#2a3040'; TX.font='10px Nunito,sans-serif';
  TX.fillText('↑ rotar  ·  ↓ bajar  ·  Espacio = drop',TC.width/2,192);
  TX.fillText('C = hold  ·  P = pausa',TC.width/2,207);

  TX.fillStyle='#3a3a4a'; TX.font='11px Nunito,sans-serif';
  TX.fillText('🏆 Récord: '+tHi.toLocaleString(),TC.width/2,228);

  TX.fillStyle='#D4831A';
  if(TX.roundRect)TX.roundRect(TC.width/2-55,242,110,36,10); else TX.rect(TC.width/2-55,242,110,36);
  TX.fill(); TX.fillStyle='#080c10'; TX.font='bold 13px Nunito,sans-serif';
  TX.fillText('▶  JUGAR',TC.width/2,265);

  TX.fillStyle='#222'; TX.font='10px Nunito,sans-serif';
  TX.fillText('Tap o Espacio para iniciar',TC.width/2,295);
}

function tStartIdleLoop() {
  if (tState !== TSTATE.IDLE) return;
  tInitFloaters();
  function loop() {
    if (tState !== TSTATE.IDLE) return;
    tetrisDrawStart();
    tFloatTimer = requestAnimationFrame(loop);
  }
  tFloatTimer = requestAnimationFrame(loop);
}
function tStopIdleLoop() {
  if (tFloatTimer) { cancelAnimationFrame(tFloatTimer); tFloatTimer=null; }
}

// ── Dibujo de celdas ───────────────────────────────────────────
function tDrawCelda(cx, cy, tipo) {
  const x=cx*TSZ, y=cy*TSZ, s=TSZ-1;
  const p=(c,rx,ry,rw,rh)=>{ TX.fillStyle=c; TX.fillRect(x+rx,y+ry,rw,rh); };
  if(tipo==='pan'){
    p('#C8903A',0,4,s,s-4); p('#E8B76A',1,2,s-2,4); p('#F5D08A',3,3,s-6,2); p('#A0682A',0,s-2,s,2);
  } else if(tipo==='queso'){
    p('#FFD700',0,2,s,s-2); p('#FFF176',2,3,s-8,4); p('#F9A825',0,s-3,s,3); p('#FFD700',s-5,0,5,4);
  } else if(tipo==='lechuga'){
    p('#388E3C',0,3,s,s-3); p('#66BB6A',2,1,5,4); p('#66BB6A',9,2,5,4); p('#A5D6A7',3,4,4,3); p('#2E7D32',0,s-2,s,2);
  } else if(tipo==='tomate'){
    p('#E53935',1,3,s-2,s-4); p('#EF9A9A',3,4,4,4); p('#B71C1C',1,s-3,s-2,3); p('#4CAF50',6,0,3,3); p('#4CAF50',4,1,2,2);
  } else if(tipo==='jamon'){
    p('#EF9A9A',0,2,s,s-2); p('#FFCDD2',2,3,s-6,4); p('#E57373',0,8,s,4); p('#C62828',0,s-2,s,2);
  } else if(tipo==='cebolla'){
    p('#CE93D8',0,2,s,s-2); p('#F3E5F5',2,3,5,3); p('#AB47BC',0,s-3,s,3); p('#E1BEE7',9,5,4,5);
  } else if(tipo==='pepino'){
    p('#558B2F',0,0,s,s); p('#8BC34A',2,2,s-4,s-4); p('#F1F8E9',4,4,3,3); p('#F1F8E9',10,7,2,2);
    p('#33691E',0,0,2,s); p('#33691E',s-2,0,2,s);
  }
}

function tDrawBomba(cx, cy) {
  const x=cx*TSZ, y=cy*TSZ, s=TSZ-1;
  TX.fillStyle='#1a1a1a'; TX.fillRect(x,y,s,s);
  TX.beginPath(); TX.arc(x+s/2,y+s/2+2,s/2-2,0,Math.PI*2);
  TX.fillStyle='#222'; TX.fill(); TX.strokeStyle='#555'; TX.lineWidth=1; TX.stroke();
  TX.strokeStyle='#D4831A'; TX.lineWidth=1.5;
  TX.beginPath(); TX.moveTo(x+s/2,y+3); TX.lineTo(x+s/2+3,y); TX.stroke();
  TX.fillStyle='#FFD700'; TX.beginPath(); TX.arc(x+s/2+3,y,2,0,Math.PI*2); TX.fill();
}

// ── Estado del juego ────────────────────────────────────────────
let tBoard, tPiece, tX, tY, tScore, tLevel, tTimer;
let tNextPiece = null;
let tHoldPiece = null;
let tHoldUsed = false;
let tHi = parseInt(localStorage.getItem('tetrisHiC')||'0');
let tCombo = 0;
let tLockDelay = 0;
let tMutateFlash = 0;

// ── Piezas especiales ───────────────────────────────────────────
let tPiecesUntilSpecial = 3;
let tMutateTimer = null;

function tRandSpecialCooldown() { return 4+Math.floor(Math.random()*5); }

const TMUTATIONS = [[0,2],[0,4],[1,3],[2,5],[3,6],[4,2],[5,0],[6,3]];

function tRandPiece() {
  const i=Math.floor(Math.random()*7);
  return { shape:TETROMINOS[i].map(r=>[...r]), color:TCOLORS[i] };
}

function tRandTrapPiece() {
  const pair=TMUTATIONS[Math.floor(Math.random()*TMUTATIONS.length)];
  const [fromI, toI] = pair;
  return {
    shape: TETROMINOS[fromI].map(r=>[...r]),
    color: TCOLORS[fromI],
    special: 'trap',
    mutatesTo: {
      shape: TETROMINOS[toI].map(r=>[...r]),
      color: TCOLORS[toI]
    },
    mutateIn: 700 + Math.random()*800
  };
}

function tRandBombPiece() {
  return { shape:[[1,1],[1,1]], color:'bomba', special:'bomb' };
}

function tMaybeSpecial() {
  tPiecesUntilSpecial--;
  if (tPiecesUntilSpecial > 0) return tRandPiece();
  tPiecesUntilSpecial = tRandSpecialCooldown();
  return tRandBombPiece(); // solo bomba, trampa desactivada
}

// ── Mutación (encadenada — muta varias veces) ───────────────────
function tScheduleMutate(piece) {
  if (tMutateTimer) { clearTimeout(tMutateTimer); tMutateTimer=null; }
  if (!piece || piece.special !== 'trap') return;

  tMutateTimer = setTimeout(() => {
    tMutateTimer = null;
    if (tState !== TSTATE.PLAYING) return;
    if (!tPiece || tPiece.special !== 'trap' || !tPiece.mutatesTo) return;

    tSoundMutate();
    // Sin destello — la sorpresa es visual en la forma

    tPiece.shape = tPiece.mutatesTo.shape.map(r=>[...r]);
    tPiece.color = tPiece.mutatesTo.color;

    // Preparar la siguiente mutación (elige una forma distinta a la actual)
    const currentIdx = TCOLORS.indexOf(tPiece.color);
    const candidates = TMUTATIONS.filter(([f])=> f !== currentIdx);
    const next = candidates[Math.floor(Math.random()*candidates.length)];
    tPiece.mutatesTo = {
      shape: TETROMINOS[next[1]].map(r=>[...r]),
      color: TCOLORS[next[1]]
    };
    // Sigue siendo 'trap' para que vuelva a flotar si llega al piso
    // tPiece.special permanece 'trap'

    // Clamp X/Y
    tX = Math.max(0, Math.min(tX, TW - tPiece.shape[0].length));
    let tries = 4;
    while (tCollide() && tries-- > 0) tY--;
    if (tY < 0) tY = 0;

    tDraw();

    // Schedular la próxima mutación — intervalo un poco menor para acelerar el caos
    tScheduleMutate(tPiece);
  }, piece.mutateIn);
}

function tBombExplode() {
  const cx = tX + Math.floor(tPiece.shape[0].length/2);
  const cy = tY + Math.floor(tPiece.shape.length/2);
  const R=2; let destroyed=0;
  for(let ry=cy-R; ry<=cy+R; ry++) {
    for(let rx=cx-R; rx<=cx+R; rx++) {
      if(ry>=0&&ry<TH&&rx>=0&&rx<TW&&tBoard[ry][rx]) {
        // Partícula por cada celda destruida
        const col = TPAL[tBoard[ry][rx]] || '#FF6600';
        for(let i=0;i<3;i++) tParticles.push({
          x:(rx+0.5)*TSZ, y:(ry+0.5)*TSZ,
          vx:(Math.random()-0.5)*7, vy:(Math.random()-0.5)*7,
          life:1, col, size:2+Math.random()*4
        });
        tBoard[ry][rx]=0; destroyed++;
      }
    }
  }
  // Partículas de fuego del centro
  for(let i=0;i<15;i++) tParticles.push({
    x:cx*TSZ, y:cy*TSZ,
    vx:(Math.random()-0.5)*9, vy:(Math.random()-0.5)*9,
    life:1, col:i%2?'#FF6600':'#FFD700', size:3+Math.random()*4
  });
  tBeep(120,0.3,'sawtooth',0.3,-200);
  setTimeout(()=>tBeep(80,0.4,'sawtooth',0.25,-300),80);
  tScore += destroyed*20*tLevel;
  document.getElementById('tetrisScore').textContent = tScore;
  tKickParticleLoop();
}

// ── Spawn / Colisión ────────────────────────────────────────────
function tSpawn() {
  tPiece = tNextPiece || tMaybeSpecial();
  // tNextPiece se genera SOLO cuando spawneamos — 1 pieza por turno consume el cooldown
  tNextPiece = tMaybeSpecial();
  tX = Math.floor(TW/2) - Math.floor(tPiece.shape[0].length/2);
  tY = 0;
  tHoldUsed = false;
  tLockDelay = 0;
  tScheduleMutate(tPiece);
  if (tCollide()) tetrisOver();
}

function tCollide(ox=0, oy=0, sh=tPiece.shape) {
  return sh.some((r,y)=>r.some((v,x)=>
    v && (tY+y+oy>=TH || tX+x+ox<0 || tX+x+ox>=TW ||
      (tBoard[tY+y+oy] && tBoard[tY+y+oy][tX+x+ox]))));
}

function tGhostY() {
  let gy=tY; while(!tCollide(0,gy-tY+1)) gy++; return gy;
}

// ── Hold ────────────────────────────────────────────────────────
window.tetrisHold = function() {
  if(tState!==TSTATE.PLAYING||tHoldUsed) return;
  tHoldUsed = true;
  if(tMutateTimer){ clearTimeout(tMutateTimer); tMutateTimer=null; }
  if(!tHoldPiece) {
    tHoldPiece = { shape:tPiece.shape.map(r=>[...r]), color:tPiece.color, special:tPiece.special, mutatesTo:tPiece.mutatesTo };
    tSpawn();
  } else {
    const tmp = { shape:tPiece.shape.map(r=>[...r]), color:tPiece.color, special:tPiece.special, mutatesTo:tPiece.mutatesTo };
    tPiece = { shape:tHoldPiece.shape.map(r=>[...r]), color:tHoldPiece.color, special:tHoldPiece.special, mutatesTo:tHoldPiece.mutatesTo };
    tHoldPiece = tmp;
    tX = Math.floor(TW/2)-Math.floor(tPiece.shape[0].length/2); tY=0;
    tScheduleMutate(tPiece);
  }
  tBeep(440,0.1,'sine',0.12); tDraw();
};

// ── Hard drop ───────────────────────────────────────────────────
window.tetrisHardDrop = function() {
  if(tState!==TSTATE.PLAYING) return;
  const gy=tGhostY(); tScore+=(gy-tY)*2; tY=gy;
  tSoundHardDrop(); tLock(); tDraw();
};

// ── Lock & Clear ────────────────────────────────────────────────
function tLock() {
  // Cancelar el timer de mutación de la pieza que se está lockeando
  if(tMutateTimer){ clearTimeout(tMutateTimer); tMutateTimer=null; }
  if(tPiece.special==='bomb') { tBombExplode(); tClear(); tSpawn(); return; }
  tPiece.shape.forEach((r,y)=>r.forEach((v,x)=>{ if(v) tBoard[tY+y][tX+x]=tPiece.color; }));
  tSoundLock(); tClear(); tSpawn();
}

function tClear() {
  let lines=0;
  for(let y=TH-1; y>=0;) {
    if(tBoard[y].every(c=>c)) {
      // ── FIX: snapshot ANTES de borrar la fila ──
      const snapshot = [...tBoard[y]];
      tSpawnParticles(y, snapshot);
      tKickParticleLoop();
      tBoard.splice(y,1); tBoard.unshift(Array(TW).fill(0));
      lines++;
    } else y--;
  }
  if(lines) {
    tCombo++;
    const pts=[0,100,300,500,800][lines]*tLevel;
    const bonus=tCombo>1?(tCombo-1)*50*tLevel:0;
    tScore+=pts+bonus; tLevel=Math.floor(tScore/1000)+1;
    document.getElementById('tetrisScore').textContent=tScore;
    document.getElementById('tetrisLevel').textContent=tLevel;
    clearInterval(tTimer); tTimer=setInterval(tTick,Math.max(80,600-tLevel*50));
    tSoundLine(lines);
    if(tScore>tHi){
      tHi=tScore; localStorage.setItem('tetrisHiC',tHi);
      document.getElementById('tetrisHi').textContent=tHi;
      if(typeof window.notificarRecordJuego==='function') window.notificarRecordJuego('tetris',tHi);
    }
    if(typeof window.actualizarBarraRecompensa==='function') window.actualizarBarraRecompensa('tetris',tScore);
  } else { tCombo=0; }
}

// ── Game loop ───────────────────────────────────────────────────
function tTick() {
  if(tState!==TSTATE.PLAYING) return;
  if(!tCollide(0,1)) {
    tY++; tLockDelay=0;
  } else {
    // Tocó el piso — lockear siempre, cancelar mutación pendiente
    if(tMutateTimer){ clearTimeout(tMutateTimer); tMutateTimer=null; }
    tLockDelay++;
    if(tLockDelay>=1){tLockDelay=0;tLock();}
  }
  tDraw();
}

// ── Dibujo ──────────────────────────────────────────────────────
function tDraw() {
  TX.fillStyle='#080c10'; TX.fillRect(0,0,TC.width,TC.height);

  // Grilla
  TX.strokeStyle='#111820'; TX.lineWidth=0.5;
  for(let gx=0;gx<=TW;gx++){TX.beginPath();TX.moveTo(gx*TSZ,0);TX.lineTo(gx*TSZ,TH*TSZ);TX.stroke();}
  for(let gy=0;gy<=TH;gy++){TX.beginPath();TX.moveTo(0,gy*TSZ);TX.lineTo(TW*TSZ,gy*TSZ);TX.stroke();}

  // Tablero
  tBoard.forEach((r,y)=>r.forEach((tipo,x)=>{
    if(!tipo) return;
    if(tipo==='bomba') tDrawBomba(x,y); else tDrawCelda(x,y,tipo);
  }));

  if(tPiece && tState===TSTATE.PLAYING) {
    // Ghost
    if(tPiece.special!=='bomb') {
      const gy=tGhostY();
      if(gy!==tY) {
        const ghostCol = tPiece.special==='trap' ? '#FF6B6B' : '#3DBFB8';
        tPiece.shape.forEach((r,y)=>r.forEach((v,x)=>{
          if(!v) return;
          TX.globalAlpha=0.15; TX.fillStyle=ghostCol;
          TX.fillRect((tX+x)*TSZ,(gy+y)*TSZ,TSZ-1,TSZ-1);
          TX.strokeStyle=ghostCol; TX.lineWidth=1;
          TX.strokeRect((tX+x)*TSZ,(gy+y)*TSZ,TSZ-1,TSZ-1);
          TX.globalAlpha=1;
        }));
      }
    }

    // Pieza activa
    tPiece.shape.forEach((r,y)=>r.forEach((v,x)=>{
      if(!v) return;
      if(tPiece.special==='bomb') tDrawBomba(tX+x,tY+y);
      else tDrawCelda(tX+x,tY+y,tPiece.color);
    }));

    // Aura de trampa — pulsa sin texto (es una SORPRESA)
    if(tPiece.special==='trap') {
      const t=Date.now();
      const pulse=0.25+0.25*Math.sin(t/150);
      tPiece.shape.forEach((r,y)=>r.forEach((v,x)=>{
        if(!v) return;
        TX.globalAlpha=pulse; TX.strokeStyle='#FF4444'; TX.lineWidth=2;
        TX.strokeRect((tX+x)*TSZ+1,(tY+y)*TSZ+1,TSZ-3,TSZ-3); TX.globalAlpha=1;
      }));
      // Signo de interrogación pulsando — NO dice "trampa"
      TX.globalAlpha=0.6+0.4*Math.sin(t/220);
      TX.fillStyle='#FF4444'; TX.font='bold 11px Nunito,sans-serif'; TX.textAlign='center';
      TX.fillText('?', (tX+tPiece.shape[0].length/2)*TSZ, Math.max(8,(tY-0.2)*TSZ));
      TX.globalAlpha=1;
    }

    // Aura de bomba
    if(tPiece.special==='bomb') {
      const pulse=0.35+0.3*Math.sin(Date.now()/120);
      TX.globalAlpha=pulse; TX.strokeStyle='#FF6600'; TX.lineWidth=2;
      TX.strokeRect(tX*TSZ-3,tY*TSZ-3,tPiece.shape[0].length*TSZ+5,tPiece.shape.length*TSZ+5);
      TX.globalAlpha=1;
      TX.fillStyle='#FF6600'; TX.font='bold 9px Nunito,sans-serif'; TX.textAlign='center';
      TX.fillText('💥',(tX+tPiece.shape[0].length/2)*TSZ, Math.max(8,(tY-0.2)*TSZ));
    }
  }

  // Flash mutación — eliminado, la sorpresa es la forma
  // (tMutateFlash ya no se usa)

  tUpdateParticles();

  // Overlay pausa
  if(tState===TSTATE.PAUSED) {
    TX.fillStyle='rgba(8,12,16,0.82)'; TX.fillRect(0,0,TC.width,TC.height);
    TX.fillStyle='#3DBFB8'; TX.font='bold 18px Nunito,sans-serif'; TX.textAlign='center';
    TX.fillText('⏸ PAUSA',TC.width/2,TC.height/2-10);
    TX.fillStyle='#555'; TX.font='11px Nunito,sans-serif';
    TX.fillText('Presioná P para continuar',TC.width/2,TC.height/2+14);
  }
}

// ── Game Over ───────────────────────────────────────────────────
function tetrisOver() {
  clearInterval(tTimer);
  if(tMutateTimer){ clearTimeout(tMutateTimer); tMutateTimer=null; }
  tState=TSTATE.OVER; tSoundOver();
  let fa=0;
  const anim=setInterval(()=>{
    TX.fillStyle='#080c10'; TX.fillRect(0,0,TC.width,TC.height);
    TX.save(); TX.translate(0,fa*3); TX.globalAlpha=1-fa/30;
    tBoard.forEach((r,y)=>r.forEach((tipo,x)=>{if(tipo)tDrawCelda(x,y,tipo);}));
    TX.restore(); fa++;
    if(fa>30){clearInterval(anim); tDrawGameOver();}
  },25);
}

function tDrawGameOver() {
  TX.fillStyle='#080c10'; TX.fillRect(0,0,TC.width,TC.height);
  TX.strokeStyle='#111820'; TX.lineWidth=1;
  for(let i=-TC.height;i<TC.width+TC.height;i+=22){
    TX.beginPath();TX.moveTo(i,0);TX.lineTo(i+TC.height,TC.height);TX.stroke();
  }
  TX.fillStyle='#D4831A'; TX.fillRect(0,0,TC.width,3);

  const cY=110, cH=170;
  TX.fillStyle='rgba(12,18,28,0.97)'; TX.strokeStyle='#D4831A'; TX.lineWidth=1.5;
  if(TX.roundRect)TX.roundRect(14,cY,TC.width-28,cH,14); else TX.rect(14,cY,TC.width-28,cH);
  TX.fill(); TX.stroke();

  TX.fillStyle='#D4831A'; TX.font='bold 15px Nunito,sans-serif'; TX.textAlign='center';
  TX.fillText('🥪 ¡SE CAYÓ EL SANGUCHE!',TC.width/2,cY+28);

  TX.strokeStyle='rgba(212,131,26,0.25)'; TX.lineWidth=1;
  TX.beginPath(); TX.moveTo(TC.width/2-60,cY+38); TX.lineTo(TC.width/2+60,cY+38); TX.stroke();

  TX.fillStyle='#3DBFB8'; TX.font='bold 30px Nunito,sans-serif';
  TX.fillText(tScore.toLocaleString(),TC.width/2,cY+76);
  TX.fillStyle='#444'; TX.font='10px Nunito,sans-serif';
  TX.fillText('P U N T O S',TC.width/2,cY+92);
  TX.fillStyle='#555'; TX.font='11px Nunito,sans-serif';
  TX.fillText('🏆 Récord: '+tHi.toLocaleString(),TC.width/2,cY+114);

  if(tScore>0&&tScore>=tHi) {
    TX.fillStyle='rgba(255,215,0,0.12)';
    if(TX.roundRect)TX.roundRect(TC.width/2-55,cY+120,110,18,6); else TX.rect(TC.width/2-55,cY+120,110,18);
    TX.fill(); TX.fillStyle='#FFD700'; TX.font='bold 10px Nunito,sans-serif';
    TX.fillText('✨ ¡NUEVO RÉCORD!',TC.width/2,cY+132);
  }

  TX.fillStyle='#D4831A';
  if(TX.roundRect)TX.roundRect(TC.width/2-58,cY+142,116,32,8); else TX.rect(TC.width/2-58,cY+142,116,32);
  TX.fill(); TX.fillStyle='#080c10'; TX.font='bold 12px Nunito,sans-serif';
  TX.fillText('▶  JUGAR DE NUEVO',TC.width/2,cY+163);

  setTimeout(()=>{ if(typeof window.abrirLeaderboard==='function') window.abrirLeaderboard('tetris',tScore); },1200);
}

// ── Init ────────────────────────────────────────────────────────
function tetrisInit() {
  tBoard = Array.from({length:TH},()=>Array(TW).fill(0));
  tScore=0; tLevel=1; tCombo=0; tParticles=[]; tMutateFlash=0;
  tHoldPiece=null; tHoldUsed=false;
  tPiecesUntilSpecial = tRandSpecialCooldown();
  if(tMutateTimer){ clearTimeout(tMutateTimer); tMutateTimer=null; }
  tNextPiece = tRandPiece();
  tState = TSTATE.PLAYING;
  document.getElementById('tetrisScore').textContent=0;
  document.getElementById('tetrisHi').textContent=tHi;
  document.getElementById('tetrisLevel').textContent=1;
  tSpawn();
  clearInterval(tTimer); tTimer=setInterval(tTick,600);
  tSoundStart();
}

// ── Teclado ─────────────────────────────────────────────────────
const TKEYS_BLOCKED=new Set(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Space']);
document.addEventListener('keydown',e=>{
  if(document.activeElement&&(document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA')) return;
  const el=document.getElementById('juegoTetris');
  if(!el||el.style.display==='none') return;
  if(TKEYS_BLOCKED.has(e.key)||TKEYS_BLOCKED.has(e.code)){e.preventDefault();e.stopPropagation();}
  if(tState===TSTATE.IDLE&&(e.code==='Space'||e.key===' ')){_tetrisArrancar();return;}
  if(tState===TSTATE.OVER&&(e.code==='Space'||e.key===' ')){window.tetrisReset();return;}
  if(tState!==TSTATE.PLAYING&&tState!==TSTATE.PAUSED) return;
  if(e.key==='p'||e.key==='P'){window.tetrisPause();return;}
  if(e.key==='c'||e.key==='C'){window.tetrisHold();return;}
  if(tState!==TSTATE.PLAYING) return;
  if(e.key==='ArrowLeft')       window.tetrisDir('left');
  else if(e.key==='ArrowRight') window.tetrisDir('right');
  else if(e.key==='ArrowDown')  window.tetrisDir('down');
  else if(e.key==='ArrowUp')    window.tetrisDir('up');
  else if(e.code==='Space')     window.tetrisHardDrop();
},{capture:true});

// ── Touch ───────────────────────────────────────────────────────
(()=>{
  let sx,sy,moved=false;
  TC.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;moved=false;},{passive:true});
  TC.addEventListener('touchmove',()=>{moved=true;},{passive:true});
  TC.addEventListener('touchend',e=>{
    if(tState===TSTATE.IDLE){_tetrisArrancar();return;}
    if(tState===TSTATE.OVER){window.tetrisReset();return;}
    if(tState!==TSTATE.PLAYING) return;
    const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy;
    const adx=Math.abs(dx),ady=Math.abs(dy);
    if(!moved&&adx<10&&ady<10){window.tetrisDir('up');return;}
    if(adx>ady){window.tetrisDir(dx>0?'right':'left');}
    else{if(dy>60)window.tetrisHardDrop();else window.tetrisDir('down');}
  },{passive:true});
})();

// ── Globales ────────────────────────────────────────────────────
window.tetrisInit = tetrisInit;

window.tetrisPause = function() {
  if(tState===TSTATE.PLAYING)     tState=TSTATE.PAUSED;
  else if(tState===TSTATE.PAUSED) tState=TSTATE.PLAYING;
  tBeep(tState===TSTATE.PAUSED?330:440,0.1,'sine',0.12); tDraw();
};

window.tetrisReset = async function() {
  if(typeof window.juegoRequiereFichas==='function'&&window.juegoRequiereFichas('tetris')) {
    if(typeof window.juegoConsumirFicha==='function') {
      const ok=await window.juegoConsumirFicha('tetris');
      if(!ok){if(typeof showToast==='function')showToast('🎟️ Sin fichas para Tetris');return;}
    }
  }
  tStopIdleLoop();
  clearInterval(tTimer); tState=TSTATE.IDLE; tParticles=[];
  tetrisInit(); tDraw();
};

window.tetrisDir = function(d) {
  if(tState!==TSTATE.PLAYING) return;
  if(d==='left'&&!tCollide(-1,0)){tX--;tSoundMove();}
  else if(d==='right'&&!tCollide(1,0)){tX++;tSoundMove();}
  else if(d==='down'&&!tCollide(0,1)){tY++;}
  else if(d==='up'){
    const rot=tPiece.shape[0].map((_,i)=>tPiece.shape.map(r=>r[i]).reverse());
    let kicked=false;
    for(const ox of[0,-1,1,-2,2]){if(!tCollide(ox,0,rot)){tPiece.shape=rot;tX+=ox;kicked=true;break;}}
    if(kicked)tSoundRotate();
  }
  tDraw();
};

window.setTetrisDificultad = function(dif) {
  if(!dif) return;
  const speeds={facil:800,normal:600,dificil:350,extremo:150};
  if(tState===TSTATE.PLAYING){clearInterval(tTimer);tTimer=setInterval(tTick,speeds[dif]||600);}
};

// ── Arranque ────────────────────────────────────────────────────
let tetrisEnEspera = true;

function _tetrisArrancar() {
  if(tState!==TSTATE.IDLE) return;
  tStopIdleLoop();
  tState = TSTATE.PLAYING;
  setTimeout(()=>{ tState=TSTATE.IDLE; tetrisInit(); tDraw(); }, 0);
}

TC.addEventListener('pointerdown',()=>{
  if(tState===TSTATE.IDLE) _tetrisArrancar();
  else if(tState===TSTATE.OVER) window.tetrisReset();
},{passive:true});

// Arrancar la pantalla de inicio animada
tStartIdleLoop();
