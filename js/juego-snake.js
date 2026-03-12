// ===================== SNAKE — MORDELÓN ENHANCED =====================
const SC = document.getElementById('snakeCanvas');
const SX = SC.getContext('2d');
const SCELLS = 14, SSIZ = Math.floor(280 / SCELLS);

// ── Máquina de estados: 'inicio' | 'jugando' | 'muerto' ───────────────────
let sEstado = 'inicio';

let snake, sDir, sFood, sScore, sNext;
let snakeDificultad = 1;
const SNAKE_SPEEDS = [220, 150, 100, 65, 38];
const SNAKE_ACCEL  = [0,   0,   2,   3,  4];
let sHi = parseInt(localStorage.getItem('snakeHiC') || '0');
let sTimer = null, sDeathAnim = 0, sDeathTimer = null;

// Variable global que juego-selector.js lee directamente
Object.defineProperty(window, 'snakeRunning', { get: () => sEstado === 'jugando', configurable: true });

// ── Web Audio ──────────────────────────────────────────────────────────────
let sAudioCtx = null;
function sGetAudio() {
  if (!sAudioCtx) sAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return sAudioCtx;
}
function sPlayEat() {
  try {
    const ctx = sGetAudio(), t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    const o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(520,t); o.frequency.exponentialRampToValueAtTime(780,t+0.06);
    g.gain.setValueAtTime(0.18,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.12);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t+0.13);
    o2.type = 'square'; o2.frequency.setValueAtTime(320,t+0.03); o2.frequency.exponentialRampToValueAtTime(480,t+0.09);
    g2.gain.setValueAtTime(0.09,t+0.03); g2.gain.exponentialRampToValueAtTime(0.001,t+0.14);
    o2.connect(g2); g2.connect(ctx.destination); o2.start(t+0.03); o2.stop(t+0.15);
  } catch(e) {}
}
function sPlayDeath() {
  try {
    const ctx = sGetAudio(), t = ctx.currentTime;
    [0,0.12,0.26,0.42].forEach((delay,i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = i%2===0?'sawtooth':'square';
      o.frequency.setValueAtTime([380,280,200,130][i],t+delay);
      o.frequency.exponentialRampToValueAtTime([380,280,200,130][i]*0.65,t+delay+0.1);
      g.gain.setValueAtTime(0.14,t+delay); g.gain.exponentialRampToValueAtTime(0.001,t+delay+0.18);
      o.connect(g); g.connect(ctx.destination); o.start(t+delay); o.stop(t+delay+0.2);
    });
    const sz = ctx.sampleRate*0.3, buf = ctx.createBuffer(1,sz,ctx.sampleRate), d = buf.getChannelData(0);
    for (let i=0;i<sz;i++) d[i]=(Math.random()*2-1)*(1-i/sz);
    const ns = ctx.createBufferSource(), ng = ctx.createGain();
    ns.buffer=buf; ng.gain.setValueAtTime(0.22,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.3);
    ns.connect(ng); ng.connect(ctx.destination); ns.start(t); ns.stop(t+0.3);
  } catch(e) {}
}
function sPlayRecord() {
  try {
    const ctx = sGetAudio(), t = ctx.currentTime;
    [0,0.1,0.2,0.32].forEach((d,i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type='sine'; o.frequency.setValueAtTime([523,659,784,1047][i],t+d);
      g.gain.setValueAtTime(0.15,t+d); g.gain.exponentialRampToValueAtTime(0.001,t+d+0.18);
      o.connect(g); g.connect(ctx.destination); o.start(t+d); o.stop(t+d+0.2);
    });
  } catch(e) {}
}

// ── Fondo animado ──────────────────────────────────────────────────────────
const sBgParticles = [];
const sBgEmojis = ['🧀','🍅','🥬','🥓','🧅','🥒','🍞','🥩'];
for (let i=0;i<18;i++) sBgParticles.push({
  x: Math.random()*280, y: Math.random()*280,
  emoji: sBgEmojis[Math.floor(Math.random()*sBgEmojis.length)],
  speed: 0.18+Math.random()*0.28, alpha: 0.04+Math.random()*0.09,
  size: 11+Math.random()*10, phase: Math.random()*Math.PI*2,
});
let sBgTick = 0;
function sDrawBackground() {
  const gr = SX.createRadialGradient(140,140,20,140,140,200);
  gr.addColorStop(0,'#0d1a1a'); gr.addColorStop(1,'#080c10');
  SX.fillStyle=gr; SX.fillRect(0,0,SC.width,SC.height);
  SX.save(); SX.strokeStyle='rgba(61,191,184,0.07)'; SX.lineWidth=0.5;
  for (let gx=0;gx<=SCELLS;gx++){SX.beginPath();SX.moveTo(gx*SSIZ,0);SX.lineTo(gx*SSIZ,SC.height);SX.stroke();}
  for (let gy=0;gy<=SCELLS;gy++){SX.beginPath();SX.moveTo(0,gy*SSIZ);SX.lineTo(SC.width,gy*SSIZ);SX.stroke();}
  sBgTick++;
  sBgParticles.forEach(p => {
    p.y -= p.speed; if (p.y<-20){p.y=295;p.x=Math.random()*280;}
    const wb = Math.sin(sBgTick*0.018+p.phase)*6;
    SX.globalAlpha = p.alpha*(0.7+0.3*Math.sin(sBgTick*0.03+p.phase));
    SX.font=p.size+'px serif'; SX.textAlign='center'; SX.textBaseline='middle';
    SX.fillText(p.emoji, p.x+wb, p.y);
  });
  SX.globalAlpha=1; SX.restore();
}

// ── Sprites ────────────────────────────────────────────────────────────────
function sDrawLlama(cx, cy, dir) {
  const sc=0.62;
  SX.save();
  SX.translate(cx*SSIZ+SSIZ/2, cy*SSIZ+SSIZ/2);
  if(dir.x===1) SX.rotate(0); if(dir.x===-1) SX.rotate(Math.PI);
  if(dir.y===-1) SX.rotate(-Math.PI/2); if(dir.y===1) SX.rotate(Math.PI/2);
  SX.translate(-SSIZ/2,-SSIZ/2);
  SX.shadowColor='#3DBFB8'; SX.shadowBlur=8;
  const T='#3DBFB8',L='#7EEEE9',D='#1A8C87',W='#FFFFFF',E='#0a1a1a',S='#B2F5F2';
  const q=(c,x,y,w,h)=>{SX.fillStyle=c;SX.fillRect(Math.round(x*sc),Math.round(y*sc),Math.max(1,Math.round(w*sc)),Math.max(1,Math.round(h*sc)));};
  q(S,20,0,3,3);q(S,2,6,3,3);q(L,12,2,6,4);q(T,10,4,10,6);q(L,8,6,4,4);q(L,16,6,6,4);
  q(T,6,10,18,14);q(L,8,10,6,6);q(L,18,12,6,4);q(D,6,16,4,8);q(D,22,14,4,10);
  q(W,8,14,7,7);q(W,17,15,7,7);q(E,10,16,3,3);q(E,19,16,3,3);q(L,9,22,12,4);
  q(T,8,24,5,6);q(D,8,28,5,3);q(D,18,24,5,3);q(T,18,24,5,5);
  SX.shadowBlur=0; SX.restore();
}
function sDrawBodySeg(cx, cy, ratio) {
  const sc=0.62, dim=1-ratio*0.55;
  SX.shadowColor=`rgba(61,191,184,${0.4*dim})`; SX.shadowBlur=4;
  const T=`rgba(61,191,184,${dim})`,L=`rgba(126,238,233,${dim})`,D=`rgba(26,140,135,${dim})`,
        W=`rgba(255,255,255,${dim*0.9})`,E=`rgba(10,26,26,${dim})`,S=`rgba(178,245,242,${dim*0.8})`;
  const px=cx*SSIZ, py=cy*SSIZ;
  const q=(c,x,y,w,h)=>{SX.fillStyle=c;SX.fillRect(px+Math.round(x*sc),py+Math.round(y*sc),Math.max(1,Math.round(w*sc)),Math.max(1,Math.round(h*sc)));};
  q(S,20,0,3,3);q(S,2,6,3,3);q(L,12,2,6,4);q(T,10,4,10,6);q(L,8,6,4,4);q(L,16,6,6,4);
  q(T,6,10,18,14);q(L,8,10,6,6);q(L,18,12,6,4);q(D,6,16,4,8);q(D,22,14,4,10);
  q(W,8,14,7,7);q(W,17,15,7,7);q(E,10,16,3,3);q(E,19,16,3,3);q(L,9,22,12,4);
  q(T,8,24,5,6);q(D,8,28,5,3);q(D,18,24,5,3);q(T,18,24,5,5);
  SX.shadowBlur=0;
}

// ── Comida ─────────────────────────────────────────────────────────────────
const S_FOODS=['🥪','🧀','🥬','🍅','🥩','🧅','🥒','🍞','🥓'];
let sFoodEmoji=S_FOODS[0], sFoodPulse=0, sFoodSpawn=0;
function sPlaceFood() {
  do { sFood={x:Math.floor(Math.random()*SCELLS),y:Math.floor(Math.random()*SCELLS)}; }
  while (snake.some(s=>s.x===sFood.x&&s.y===sFood.y));
  sFoodEmoji=S_FOODS[Math.floor(Math.random()*S_FOODS.length)]; sFoodSpawn=0;
}
function sDrawFood() {
  sFoodPulse+=0.1; sFoodSpawn=Math.min(sFoodSpawn+0.18,1);
  const scale=sFoodSpawn*(1+0.08*Math.sin(sFoodPulse));
  const cx=sFood.x*SSIZ+SSIZ/2, cy=sFood.y*SSIZ+SSIZ/2;
  SX.save();
  const ha=0.25+0.15*Math.sin(sFoodPulse), hr=SSIZ/2*scale*(1.3+0.2*Math.sin(sFoodPulse));
  const hg=SX.createRadialGradient(cx,cy,0,cx,cy,hr);
  hg.addColorStop(0,`rgba(212,131,26,${ha})`); hg.addColorStop(1,'rgba(212,131,26,0)');
  SX.fillStyle=hg; SX.beginPath(); SX.arc(cx,cy,hr,0,Math.PI*2); SX.fill();
  SX.translate(cx,cy); SX.scale(scale,scale);
  SX.font=(SSIZ-2)+'px serif'; SX.textAlign='center'; SX.textBaseline='middle';
  SX.fillText(sFoodEmoji,0,1); SX.restore();
}

// ── Lógica ─────────────────────────────────────────────────────────────────
function sIniciarPartida() {
  snake=[{x:7,y:7},{x:6,y:7},{x:5,y:7}];
  sDir={x:1,y:0}; sNext={x:1,y:0}; sScore=0; sEstado='jugando';
  document.getElementById('snakeScore').textContent=0;
  document.getElementById('snakeHi').textContent=sHi;
  sPlaceFood(); clearInterval(sTimer);
  sTimer=setInterval(sStep, SNAKE_SPEEDS[snakeDificultad]);
}
function sStep() {
  if (sEstado!=='jugando') return;
  sDir=sNext;
  const head={x:snake[0].x+sDir.x, y:snake[0].y+sDir.y};
  if (head.x<0||head.x>=SCELLS||head.y<0||head.y>=SCELLS||snake.some(s=>s.x===head.x&&s.y===head.y)) {
    sGameOver(); return;
  }
  snake.unshift(head);
  if (head.x===sFood.x&&head.y===sFood.y) {
    sScore+=10; document.getElementById('snakeScore').textContent=sScore; sPlayEat();
    if (sScore>sHi) {
      sHi=sScore; localStorage.setItem('snakeHiC',sHi);
      document.getElementById('snakeHi').textContent=sHi; sPlayRecord();
      if (typeof window.notificarRecordJuego==='function') window.notificarRecordJuego('snake',sHi);
    }
    sPlaceFood();
    if (SNAKE_ACCEL[snakeDificultad]>0&&sScore%50===0) {
      clearInterval(sTimer);
      sTimer=setInterval(sStep, Math.max(25, SNAKE_SPEEDS[snakeDificultad]-Math.floor(sScore/50)*SNAKE_ACCEL[snakeDificultad]));
    }
  } else { snake.pop(); }
}
function sGameOver() {
  clearInterval(sTimer); sTimer=null; sEstado='muerto'; sDeathAnim=0; sPlayDeath();
  clearInterval(sDeathTimer);
  sDeathTimer=setInterval(()=>{
    sDeathAnim++;
    if (sDeathAnim>=30) {
      clearInterval(sDeathTimer); sDeathTimer=null;
      setTimeout(()=>{ if(typeof window.abrirLeaderboard==='function') window.abrirLeaderboard('snake',sScore); },900);
    }
  },24);
}

// ── Draw por estado ────────────────────────────────────────────────────────
let sStartAnim=0;
function sDrawInicio() {
  sStartAnim++;
  sDrawBackground(); SX.save();
  ['🥪','🧀','🍅','🥬','🥓'].forEach((e,i)=>{
    const b=Math.sin(sStartAnim*0.06+i*1.1)*3;
    SX.font='20px serif'; SX.textAlign='center'; SX.textBaseline='middle'; SX.globalAlpha=0.9;
    SX.fillText(e,30+i*55,42+b);
  }); SX.globalAlpha=1;
  SX.shadowColor='#D4831A'; SX.shadowBlur=18; SX.fillStyle='#D4831A';
  SX.font='bold 22px Righteous,Nunito,sans-serif'; SX.textAlign='center'; SX.textBaseline='alphabetic';
  SX.fillText('🔥 MORDELÓN',SC.width/2,120); SX.shadowBlur=0;
  SX.shadowColor='#3DBFB8'; SX.shadowBlur=8; SX.fillStyle='#3DBFB8';
  SX.font='bold 12px Nunito,sans-serif'; SX.fillText('SNAKE EDITION',SC.width/2,138); SX.shadowBlur=0;
  SX.fillStyle='#555'; SX.font='11px Nunito,sans-serif'; SX.fillText('🏆  Récord: '+sHi,SC.width/2,160);
  SX.save(); SX.translate(SC.width/2,205); SX.scale(1+0.04*Math.sin(sStartAnim*0.08),1+0.04*Math.sin(sStartAnim*0.08));
  SX.shadowColor='#3DBFB8'; SX.shadowBlur=14;
  const bg=SX.createLinearGradient(-55,-18,55,18); bg.addColorStop(0,'#1A8C87'); bg.addColorStop(1,'#3DBFB8');
  SX.fillStyle=bg; SX.beginPath(); SX.roundRect(-55,-18,110,36,10); SX.fill(); SX.shadowBlur=0;
  SX.fillStyle='#080c10'; SX.font='bold 13px Nunito,sans-serif'; SX.textAlign='center'; SX.textBaseline='middle';
  SX.fillText('▶  JUGAR',0,1); SX.restore();
  SX.fillStyle='rgba(61,191,184,0.4)'; SX.font='10px Nunito,sans-serif'; SX.textAlign='center'; SX.textBaseline='alphabetic';
  SX.fillText('Tap o Espacio para iniciar'+'.'.repeat(Math.floor(sStartAnim/18)%4),SC.width/2,248);
  SX.restore();
}
function sDrawJugando() {
  sDrawBackground();
  for (let i=snake.length-1;i>=1;i--) sDrawBodySeg(snake[i].x,snake[i].y,i/snake.length);
  sDrawLlama(snake[0].x,snake[0].y,sDir);
  sDrawFood();
}
function sDrawMuerto() {
  sDrawJugando();
  const progress=Math.min(sDeathAnim/28,1), eased=1-Math.pow(1-progress,3);
  SX.save();
  const vig=SX.createRadialGradient(140,140,40,140,140,200);
  vig.addColorStop(0,`rgba(0,0,0,${0.55*eased})`); vig.addColorStop(1,`rgba(180,20,20,${0.45*eased})`);
  SX.fillStyle=vig; SX.fillRect(0,0,SC.width,SC.height);
  if (progress<0.3){SX.restore();return;}
  const ep2=Math.min((progress-0.3)/0.7,1), panelY=82, panelH=116;
  SX.globalAlpha=ep2;
  SX.shadowColor='#D4831A'; SX.shadowBlur=20;
  SX.fillStyle='rgba(8,12,16,0.94)'; SX.beginPath(); SX.roundRect(22,panelY,SC.width-44,panelH,14); SX.fill();
  SX.shadowBlur=0;
  const bg=SX.createLinearGradient(22,panelY,SC.width-22,panelY+panelH);
  bg.addColorStop(0,'#D4831A'); bg.addColorStop(0.5,'#3DBFB8'); bg.addColorStop(1,'#D4831A');
  SX.strokeStyle=bg; SX.lineWidth=2; SX.beginPath(); SX.roundRect(22,panelY,SC.width-44,panelH,14); SX.stroke();
  SX.font='22px serif'; SX.textAlign='center'; SX.textBaseline='middle'; SX.fillText('🔥',SC.width/2,panelY+22);
  SX.shadowColor='#D4831A'; SX.shadowBlur=12; SX.fillStyle='#D4831A';
  SX.font='bold 15px Nunito,sans-serif'; SX.textBaseline='alphabetic';
  SX.fillText('¡LA LLAMA SE QUEMÓ!',SC.width/2,panelY+47); SX.shadowBlur=0;
  SX.strokeStyle='rgba(61,191,184,0.3)'; SX.lineWidth=1;
  SX.beginPath(); SX.moveTo(50,panelY+57); SX.lineTo(SC.width-50,panelY+57); SX.stroke();
  SX.fillStyle='#aaa'; SX.font='11px Nunito,sans-serif';
  SX.fillText('PUNTOS',SC.width/2-42,panelY+75); SX.fillText('RÉCORD',SC.width/2+42,panelY+75);
  SX.fillStyle='#3DBFB8'; SX.font='bold 18px Nunito,sans-serif'; SX.fillText(sScore,SC.width/2-42,panelY+93);
  SX.fillStyle='#D4831A'; SX.fillText(sHi,SC.width/2+42,panelY+93);
  SX.strokeStyle='rgba(255,255,255,0.12)'; SX.lineWidth=1;
  SX.beginPath(); SX.moveTo(SC.width/2,panelY+64); SX.lineTo(SC.width/2,panelY+100); SX.stroke();
  SX.fillStyle='rgba(61,191,184,0.6)'; SX.font='10px Nunito,sans-serif';
  SX.fillText('Tap o reiniciar para volver',SC.width/2,panelY+113);
  SX.restore();
}

// ── Un único loop rAF para todo ────────────────────────────────────────────
function sLoop() {
  if      (sEstado==='inicio')  sDrawInicio();
  else if (sEstado==='jugando') sDrawJugando();
  else if (sEstado==='muerto')  sDrawMuerto();
  requestAnimationFrame(sLoop);
}
requestAnimationFrame(sLoop);

// ── Inputs ─────────────────────────────────────────────────────────────────
SC.addEventListener('pointerdown', ()=>{
  if (sEstado==='inicio') sIniciarPartida();
  else if (sEstado==='muerto') window.snakeReset();
}, {passive:true});

document.addEventListener('keydown', e=>{
  if (document.activeElement && (document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA')) return;
  if (document.getElementById('juegoSnake').style.display==='none') return;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.key||e.code)) e.preventDefault();
  if (e.code==='Space') {
    if (sEstado==='inicio') { sIniciarPartida(); return; }
    if (sEstado==='muerto') { window.snakeReset(); return; }
  }
  if (sEstado!=='jugando') return;
  if      (e.key==='ArrowUp'    && sDir.y===0) sNext={x:0,y:-1};
  else if (e.key==='ArrowDown'  && sDir.y===0) sNext={x:0,y:1};
  else if (e.key==='ArrowLeft'  && sDir.x===0) sNext={x:-1,y:0};
  else if (e.key==='ArrowRight' && sDir.x===0) sNext={x:1,y:0};
});

(()=>{
  let sx,sy;
  SC.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
  SC.addEventListener('touchend',e=>{
    if (sEstado!=='jugando') return;
    const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy;
    if (Math.abs(dx)>Math.abs(dy)){if(sDir.x===0) sNext={x:dx>0?1:-1,y:0};}
    else {if(sDir.y===0) sNext={x:0,y:dy>0?1:-1};}
  },{passive:true});
})();

// ── API pública ────────────────────────────────────────────────────────────
window.setSnakeDificultad = n => { snakeDificultad=Math.max(0,Math.min(4,n)); };
window.snakeDir = (dx,dy) => {
  if (sEstado!=='jugando') return;
  if (dx!==0&&sDir.x!==0) return;
  if (dy!==0&&sDir.y!==0) return;
  sNext={x:dx,y:dy};
};
// Llamado por el HTML al abrir el panel: siempre vuelve a la pantalla de inicio
window.snakeInit = ()=>{
  clearInterval(sTimer); sTimer=null;
  clearInterval(sDeathTimer); sDeathTimer=null;
  sEstado='inicio'; sStartAnim=0;
};
// Llamado por botón reiniciar o tap en game over
window.snakeReset = async ()=>{
  clearInterval(sDeathTimer); sDeathTimer=null;
  if (typeof window.juegoRequiereFichas==='function'&&window.juegoRequiereFichas('snake')) {
    if (typeof window.juegoConsumirFicha==='function') {
      const ok=await window.juegoConsumirFicha('snake');
      if (!ok){if(typeof showToast==='function') showToast('🎟️ Sin fichas para Snake');return;}
    }
  }
  sIniciarPartida();
};
