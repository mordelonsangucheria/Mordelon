// ===================== SNAKE =====================
const SC=document.getElementById('snakeCanvas');
const SX=SC.getContext('2d');
const SCELLS=14, SSIZ=Math.floor(280/SCELLS);
let snake,sDir,sFood,sScore,sTimer,snakeRunning=false,sNext;
let sHi=parseInt(localStorage.getItem('snakeHiC')||'0');

function snakeInit(){
  snake=[{x:7,y:7},{x:6,y:7},{x:5,y:7}];
  sDir={x:1,y:0};sNext={x:1,y:0};sScore=0;snakeRunning=true;
  document.getElementById('snakeScore').textContent=0;
  document.getElementById('snakeHi').textContent=sHi;
  sPlaceFood();clearInterval(sTimer);sTimer=setInterval(sStep,150);
}
// ── Ingredientes que come la llama ──────────────────────────────────────────
const S_FOODS = ['🥪','🧀','🥬','🍅','🥩','🧅','🥒','🍞','🥓'];
let sFoodEmoji = S_FOODS[0];

function sPlaceFoodEmoji() {
  sFoodEmoji = S_FOODS[Math.floor(Math.random() * S_FOODS.length)];
}

function sPlaceFood(){do{sFood={x:Math.floor(Math.random()*SCELLS),y:Math.floor(Math.random()*SCELLS)};}while(snake.some(s=>s.x===sFood.x&&s.y===sFood.y));sPlaceFoodEmoji();}
function sStep(){
  sDir=sNext;
  const head={x:snake[0].x+sDir.x,y:snake[0].y+sDir.y};
  if(head.x<0||head.x>=SCELLS||head.y<0||head.y>=SCELLS||snake.some(s=>s.x===head.x&&s.y===head.y)){snakeOver();return;}
  snake.unshift(head);
  if(head.x===sFood.x&&head.y===sFood.y){sScore+=10;document.getElementById('snakeScore').textContent=sScore;if(sScore>sHi){sHi=sScore;localStorage.setItem('snakeHiC',sHi);document.getElementById('snakeHi').textContent=sHi;if(typeof window.notificarRecordJuego==='function')window.notificarRecordJuego('snake',sHi);}sPlaceFood();}else snake.pop();
  sDraw();
}
// ── Sprite llama (escala 0.6 sobre grilla de 20px) ──────────────────────────
function sDrawLlama(cx, cy, dir) {
  const px0 = cx * SSIZ, py0 = cy * SSIZ;
  // Escala: cada "pixel" del sprite original (2px en dino) → ~1.2px aquí
  const sc = 0.62;
  const p = (color, x, y, w, h) => {
    SX.fillStyle = color;
    SX.fillRect(px0 + Math.round(x*sc), py0 + Math.round(y*sc), Math.max(1,Math.round(w*sc)), Math.max(1,Math.round(h*sc)));
  };
  const T='#3DBFB8', L='#7EEEE9', D='#1A8C87', W='#FFFFFF', E='#0a1a1a', S='#B2F5F2';

  // Rotar contexto según dirección
  SX.save();
  SX.translate(px0 + SSIZ/2, py0 + SSIZ/2);
  if (dir.x === 1)  SX.rotate(0);
  if (dir.x === -1) SX.rotate(Math.PI);
  if (dir.y === -1) SX.rotate(-Math.PI/2);
  if (dir.y === 1)  SX.rotate(Math.PI/2);
  SX.translate(-(SSIZ/2), -(SSIZ/2));

  // Sprite llama compacto (basado en drawLlamaRun1, ajustado a 20px)
  const q = (color, x, y, w, h) => {
    SX.fillStyle = color;
    SX.fillRect(Math.round(x*sc), Math.round(y*sc), Math.max(1,Math.round(w*sc)), Math.max(1,Math.round(h*sc)));
  };
  // sparks
  q(S, 20,0, 3,3); q(S, 2,6, 3,3);
  // flame tip
  q(L, 12,2, 6,4); q(T, 10,4, 10,6);
  q(L, 8,6, 4,4);  q(L, 16,6, 6,4);
  // flame body
  q(T, 6,10, 18,14);
  q(L, 8,10, 6,6);  q(L, 18,12, 6,4);
  q(D, 6,16, 4,8);  q(D, 22,14, 4,10);
  // face
  q(W, 8,14, 7,7);  q(W, 17,15, 7,7);
  q(E, 10,16, 3,3); q(E, 19,16, 3,3);
  q(L, 9,22, 12,4);
  // legs
  q(T, 8,24, 5,6);  q(D, 8,28, 5,3);
  q(D, 18,24, 5,3); q(T, 18,24, 5,5);

  SX.restore();
}

// ── Segmento de cuerpo: mismo sprite llama, más oscuro según posición ──────
function sDrawBodySeg(cx, cy, ratio) {
  const px0 = cx * SSIZ, py0 = cy * SSIZ;
  const sc = 0.62;
  // ratio: 0=cerca cabeza, 1=cola — va oscureciendo
  const dim = 1 - ratio * 0.55;
  const T=`rgba(61,191,184,${dim})`, L=`rgba(126,238,233,${dim})`,
        D=`rgba(26,140,135,${dim})`, W=`rgba(255,255,255,${dim*0.9})`,
        E=`rgba(10,26,26,${dim})`,   S=`rgba(178,245,242,${dim*0.8})`;

  const q = (color, x, y, w, h) => {
    SX.fillStyle = color;
    SX.fillRect(px0 + Math.round(x*sc), py0 + Math.round(y*sc), Math.max(1,Math.round(w*sc)), Math.max(1,Math.round(h*sc)));
  };
  q(S, 20,0, 3,3); q(S, 2,6, 3,3);
  q(L, 12,2, 6,4); q(T, 10,4, 10,6);
  q(L, 8,6, 4,4);  q(L, 16,6, 6,4);
  q(T, 6,10, 18,14);
  q(L, 8,10, 6,6);  q(L, 18,12, 6,4);
  q(D, 6,16, 4,8);  q(D, 22,14, 4,10);
  q(W, 8,14, 7,7);  q(W, 17,15, 7,7);
  q(E, 10,16, 3,3); q(E, 19,16, 3,3);
  q(L, 9,22, 12,4);
  q(T, 8,24, 5,6);  q(D, 8,28, 5,3);
  q(D, 18,24, 5,3); q(T, 18,24, 5,5);
}

function sDraw(){
  SX.fillStyle='#0a0a0a'; SX.fillRect(0,0,SC.width,SC.height);

  // Grilla sutil
  SX.strokeStyle='#111'; SX.lineWidth=0.5;
  for(let gx=0;gx<=SCELLS;gx++){SX.beginPath();SX.moveTo(gx*SSIZ,0);SX.lineTo(gx*SSIZ,SC.height);SX.stroke();}
  for(let gy=0;gy<=SCELLS;gy++){SX.beginPath();SX.moveTo(0,gy*SSIZ);SX.lineTo(SC.width,gy*SSIZ);SX.stroke();}

  // Cuerpo (de cola a cabeza para que cabeza quede encima)
  for(let i = snake.length-1; i >= 1; i--) {
    sDrawBodySeg(snake[i].x, snake[i].y, i / snake.length);
  }

  // Cabeza: sprite llama orientada según dirección
  sDrawLlama(snake[0].x, snake[0].y, sDir);

  // Comida: emoji ingrediente
  SX.font = (SSIZ - 2) + 'px serif';
  SX.textAlign = 'center';
  SX.textBaseline = 'middle';
  SX.fillText(sFoodEmoji, sFood.x * SSIZ + SSIZ/2, sFood.y * SSIZ + SSIZ/2 + 1);
}
function snakeOver(){
  clearInterval(sTimer); snakeRunning=false;
  SX.fillStyle='rgba(0,0,0,0.78)'; SX.fillRect(0,95,SC.width,70);
  SX.fillStyle='#3DBFB8'; SX.font='bold 16px Nunito'; SX.textAlign='center';
  SX.fillText('🔥 ¡La llama se quemó!', SC.width/2, 120);
  SX.fillStyle='#aaa'; SX.font='12px Nunito';
  SX.fillText('Puntos: '+sScore+'  ·  Récord: '+sHi, SC.width/2, 140);
  SX.fillStyle='#555'; SX.font='10px Nunito';
  SX.fillText('Tap o reiniciar para volver', SC.width/2, 158);
}
window.snakeDir=function(dx,dy){if(!snakeRunning)return;if(dx!==0&&sDir.x!==0)return;if(dy!==0&&sDir.y!==0)return;sNext={x:dx,y:dy};};
window.snakeInit=snakeInit;

// ── Pantalla de inicio ────────────────────────────────────────────────────────
let snakeEnEspera = true;

function snakeDrawStart() {
  SX.fillStyle='#0a0a0a'; SX.fillRect(0,0,SC.width,SC.height);
  // Emoji decorativos
  SX.font='22px serif'; SX.textAlign='center'; SX.textBaseline='middle';
  ['🥪','🧀','🍅','🥬','🥓'].forEach((e,i) => {
    SX.fillText(e, 40 + i*50, 60);
  });
  SX.fillStyle='#3DBFB8'; SX.font='bold 20px Nunito'; SX.textAlign='center'; SX.textBaseline='alphabetic';
  SX.fillText('🔥 MORDELÓN', SC.width/2, 130);
  SX.fillStyle='#7EEEE9'; SX.font='bold 12px Nunito';
  SX.fillText('SNAKE', SC.width/2, 150);
  SX.fillStyle='#555'; SX.font='11px Nunito';
  SX.fillText('Récord: '+sHi, SC.width/2, 172);
  SX.fillStyle='#3DBFB8';
  SX.beginPath(); SX.roundRect(SC.width/2-55, 188, 110, 36, 10); SX.fill();
  SX.fillStyle='#0a0a0a'; SX.font='bold 13px Nunito';
  SX.fillText('▶  JUGAR', SC.width/2, 211);
  SX.fillStyle='#333'; SX.font='10px Nunito';
  SX.fillText('Tap o Espacio para iniciar', SC.width/2, 248);
}

function _snakeArrancar() {
  if (!snakeEnEspera) return;
  snakeEnEspera = false;
  snakeInit(); sDraw();
}

SC.addEventListener('pointerdown', () => { if(snakeEnEspera) _snakeArrancar(); }, {passive:true});
document.addEventListener('keydown', e => {
  if (snakeEnEspera && e.code==='Space' && document.getElementById('juegoSnake').style.display!=='none') {
    e.preventDefault(); _snakeArrancar();
  }
});

snakeDrawStart();
window.snakeReset=async function(){
  snakeEnEspera = false; // reset directo, sin pantalla de inicio
  if (typeof window.juegoRequiereFichas==='function' && window.juegoRequiereFichas('snake')) {
    if (typeof window.juegoConsumirFicha==='function') {
      var ok = await window.juegoConsumirFicha('snake');
      if (!ok) { if(typeof showToast==='function') showToast('🎟️ Sin fichas para Snake'); return; }
    }
  }
  clearInterval(sTimer);snakeInit();sDraw();
};
document.addEventListener('keydown',e=>{
  if(document.getElementById('juegoSnake').style.display==='none')return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.key||e.code)){e.preventDefault();}
  if(e.key==='ArrowUp')window.snakeDir(0,-1);
  else if(e.key==='ArrowDown')window.snakeDir(0,1);
  else if(e.key==='ArrowLeft')window.snakeDir(-1,0);
  else if(e.key==='ArrowRight')window.snakeDir(1,0);
});
(()=>{let sx,sy;SC.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});SC.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>Math.abs(dy)){window.snakeDir(dx>0?1:-1,0);}else{window.snakeDir(0,dy>0?1:-1);}},{passive:true});})();
