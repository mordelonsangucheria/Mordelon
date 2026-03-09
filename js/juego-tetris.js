// ===================== TETRIS =====================
const TC = document.getElementById('tetrisCanvas');
const TX = TC.getContext('2d');
const TW = 10, TH = 20, TSZ = 20;
const TETROMINOS = [
  [[1,1,1,1]],
  [[1,1],[1,1]],
  [[0,1,0],[1,1,1]],
  [[0,1,1],[1,1,0]],
  [[1,1,0],[0,1,1]],
  [[1,0,0],[1,1,1]],
  [[0,0,1],[1,1,1]]
];
// Ingredientes: pan, queso, lechuga, tomate, jamon, cebolla, pepino
const TCOLORS = ['pan','queso','lechuga','tomate','jamon','cebolla','pepino'];
const TCOLORS_BASE = {
  pan:     '#C8903A',
  queso:   '#FFD700',
  lechuga: '#4CAF50',
  tomate:  '#E53935',
  jamon:   '#E57373',
  cebolla: '#CE93D8',
  pepino:  '#66BB6A',
};

function tDrawCelda(cx, cy, tipo) {
  const x = cx * TSZ, y = cy * TSZ, s = TSZ - 1;
  const p = (color, rx, ry, rw, rh) => { TX.fillStyle = color; TX.fillRect(x+rx, y+ry, rw, rh); };

  if (tipo === 'pan') {
    p('#C8903A', 0, 4, s, s-4);   // base tostada
    p('#E8B76A', 1, 2, s-2, 4);   // parte superior redondeada
    p('#F5D08A', 3, 3, s-6, 2);   // brillo
    p('#A0682A', 0, s-2, s, 2);   // borde inferior oscuro
  } else if (tipo === 'queso') {
    p('#FFD700', 0, 2, s, s-2);
    p('#FFF176', 2, 3, s-8, 4);   // brillo
    p('#F9A825', 0, s-3, s, 3);   // sombra inferior
    p('#FFD700', s-5, 0, 5, 4);   // punta de queso arriba derecha
  } else if (tipo === 'lechuga') {
    p('#388E3C', 0, 3, s, s-3);
    p('#66BB6A', 2, 1, 5, 4);     // hoja izq
    p('#66BB6A', 9, 2, 5, 4);     // hoja der
    p('#A5D6A7', 3, 4, 4, 3);     // brillo
    p('#2E7D32', 0, s-2, s, 2);   // sombra
  } else if (tipo === 'tomate') {
    p('#E53935', 1, 3, s-2, s-4);
    p('#EF9A9A', 3, 4, 4, 4);     // brillo
    p('#B71C1C', 1, s-3, s-2, 3); // sombra
    p('#4CAF50', 6, 0, 3, 3);     // pedúnculo
    p('#4CAF50', 4, 1, 2, 2);
  } else if (tipo === 'jamon') {
    p('#EF9A9A', 0, 2, s, s-2);
    p('#FFCDD2', 2, 3, s-6, 4);   // veta clara
    p('#E57373', 0, 8, s, 4);     // veta media
    p('#C62828', 0, s-2, s, 2);   // borde
  } else if (tipo === 'cebolla') {
    p('#CE93D8', 0, 2, s, s-2);
    p('#F3E5F5', 2, 3, 5, 3);     // capa clara
    p('#AB47BC', 0, s-3, s, 3);   // sombra
    p('#E1BEE7', 9, 5, 4, 5);     // capa der
  } else if (tipo === 'pepino') {
    p('#558B2F', 0, 0, s, s);
    p('#8BC34A', 2, 2, s-4, s-4); // interior
    p('#F1F8E9', 4, 4, 3, 3);     // semilla
    p('#F1F8E9', 10, 7, 2, 2);
    p('#33691E', 0, 0, 2, s);     // piel izq
    p('#33691E', s-2, 0, 2, s);   // piel der
  }
}
let tBoard, tPiece, tX, tY, tScore, tLevel, tTimer, tetrisRunning=false, tPaused=false;
let tHi = parseInt(localStorage.getItem('tetrisHiC')||'0');

function tetrisInit() {
  tBoard = Array.from({length:TH},()=>Array(TW).fill(0));
  tScore=0; tLevel=1; tetrisRunning=true; tPaused=false;
  document.getElementById('tetrisScore').textContent=0;
  document.getElementById('tetrisHi').textContent=tHi;
  document.getElementById('tetrisLevel').textContent=1;
  tSpawn(); clearInterval(tTimer); tTimer=setInterval(tTick,600);
}
function tRandPiece(){ const i=Math.floor(Math.random()*7); return {shape:TETROMINOS[i].map(r=>[...r]),color:TCOLORS[i]}; }
function tSpawn(){ tPiece=tRandPiece(); tX=Math.floor(TW/2)-Math.floor(tPiece.shape[0].length/2); tY=0; if(tCollide())tetrisOver(); }
function tCollide(ox=0,oy=0,sh=tPiece.shape){ return sh.some((r,y)=>r.some((v,x)=>v&&(tY+y+oy>=TH||tX+x+ox<0||tX+x+ox>=TW||(tBoard[tY+y+oy]&&tBoard[tY+y+oy][tX+x+ox])))); }
function tLock(){ tPiece.shape.forEach((r,y)=>r.forEach((v,x)=>{if(v)tBoard[tY+y][tX+x]=tPiece.color;})); tClear(); tSpawn(); }
function tClear(){ let lines=0; for(let y=TH-1;y>=0;){ if(tBoard[y].every(c=>c)){tBoard.splice(y,1);tBoard.unshift(Array(TW).fill(0));lines++;}else y--;} if(lines){tScore+=[0,100,300,500,800][lines]*tLevel;tLevel=Math.floor(tScore/1000)+1;document.getElementById('tetrisScore').textContent=tScore;document.getElementById('tetrisLevel').textContent=tLevel;clearInterval(tTimer);tTimer=setInterval(tTick,Math.max(100,600-tLevel*50));if(tScore>tHi){tHi=tScore;localStorage.setItem('tetrisHiC',tHi);document.getElementById('tetrisHi').textContent=tHi;if(typeof window.notificarRecordJuego==='function')window.notificarRecordJuego('tetris',tHi);}}}
function tTick(){ if(tPaused)return; if(!tCollide(0,1))tY++;else tLock(); tDraw(); }
function tDraw(){
  TX.fillStyle='#0a0a0a'; TX.fillRect(0,0,TC.width,TC.height);
  // Líneas de grilla sutiles
  TX.strokeStyle='#1a1a1a'; TX.lineWidth=0.5;
  for(let gx=0;gx<=TW;gx++){TX.beginPath();TX.moveTo(gx*TSZ,0);TX.lineTo(gx*TSZ,TH*TSZ);TX.stroke();}
  for(let gy=0;gy<=TH;gy++){TX.beginPath();TX.moveTo(0,gy*TSZ);TX.lineTo(TW*TSZ,gy*TSZ);TX.stroke();}
  // Tablero
  tBoard.forEach((r,y)=>r.forEach((tipo,x)=>{if(tipo) tDrawCelda(x,y,tipo);}));
  // Pieza activa
  if(tPiece) tPiece.shape.forEach((r,y)=>r.forEach((v,x)=>{if(v) tDrawCelda(tX+x,tY+y,tPiece.color);}));
}
function tetrisOver(){
  clearInterval(tTimer); tetrisRunning=false;
  TX.fillStyle='rgba(0,0,0,0.78)'; TX.fillRect(0,140,TC.width,80);
  TX.fillStyle='#C8903A'; TX.font='bold 17px Nunito'; TX.textAlign='center';
  TX.fillText('🥪 ¡SE CAYÓ EL SANGUCHE!', TC.width/2, 168);
  TX.fillStyle='#aaa'; TX.font='12px Nunito';
  TX.fillText('Puntos: '+tScore+'  ·  Récord: '+tHi, TC.width/2, 188);
  TX.fillStyle='#555'; TX.font='10px Nunito';
  TX.fillText('Tap o Espacio para reiniciar', TC.width/2, 208);
  setTimeout(function(){ if(typeof window.abrirLeaderboard==='function') window.abrirLeaderboard('tetris'); }, 1200);
}
window.tetrisPause=function(){tPaused=!tPaused;};
window.tetrisInit=tetrisInit;
window.tetrisReset=async function(){
  // Si requiere fichas, consumir una antes de reiniciar
  if (typeof window.juegoRequiereFichas==='function' && window.juegoRequiereFichas('tetris')) {
    if (typeof window.juegoConsumirFicha==='function') {
      var ok = await window.juegoConsumirFicha('tetris');
      if (!ok) { if(typeof showToast==='function') showToast('🎟️ Sin fichas para Tetris'); return; }
    }
  }
  clearInterval(tTimer);tetrisInit();tDraw();
};
window.tetrisDir=function(d){
  if(!tetrisRunning||tPaused)return;
  if(d==='left'&&!tCollide(-1,0))tX--;
  else if(d==='right'&&!tCollide(1,0))tX++;
  else if(d==='down'&&!tCollide(0,1))tY++;
  else if(d==='up'){const rot=tPiece.shape[0].map((_,i)=>tPiece.shape.map(r=>r[i]).reverse());if(!tCollide(0,0,rot))tPiece.shape=rot;}
  tDraw();
};
document.addEventListener('keydown',e=>{
  if(document.getElementById('juegoTetris').style.display==='none')return;
  if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Space'].includes(e.key||e.code)){e.preventDefault();}
  if(e.key==='ArrowLeft')window.tetrisDir('left');
  else if(e.key==='ArrowRight')window.tetrisDir('right');
  else if(e.key==='ArrowDown')window.tetrisDir('down');
  else if(e.key==='ArrowUp')window.tetrisDir('up');
});
// Swipe Tetris
(()=>{let sx,sy;TC.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});TC.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>Math.abs(dy)){window.tetrisDir(dx>0?'right':'left');}else{window.tetrisDir(dy>0?'down':'up');}},{passive:true});})();
// --- PANTALLA DE INICIO ---
function tetrisDrawStart() {
  TX.fillStyle='#0a0a0a'; TX.fillRect(0,0,TC.width,TC.height);
  // Mini sanguche decorativo
  const cx = TC.width/2;
  tDrawCelda(3,3,'pan');    tDrawCelda(4,3,'pan');    tDrawCelda(5,3,'pan');    tDrawCelda(6,3,'pan');
  tDrawCelda(3,4,'queso');  tDrawCelda(4,4,'queso');  tDrawCelda(5,4,'queso');  tDrawCelda(6,4,'queso');
  tDrawCelda(3,5,'lechuga');tDrawCelda(4,5,'lechuga');tDrawCelda(5,5,'lechuga');tDrawCelda(6,5,'lechuga');
  tDrawCelda(3,6,'tomate'); tDrawCelda(4,6,'tomate'); tDrawCelda(5,6,'tomate'); tDrawCelda(6,6,'tomate');
  tDrawCelda(3,7,'jamon');  tDrawCelda(4,7,'jamon');  tDrawCelda(5,7,'jamon');  tDrawCelda(6,7,'jamon');
  tDrawCelda(3,8,'pan');    tDrawCelda(4,8,'pan');    tDrawCelda(5,8,'pan');    tDrawCelda(6,8,'pan');
  // Título
  TX.fillStyle='#C8903A'; TX.font='bold 20px Nunito'; TX.textAlign='center';
  TX.fillText('🥪 SANGUCHE', cx, 210);
  TX.fillStyle='#FFD700'; TX.font='bold 13px Nunito';
  TX.fillText('TETRIS', cx, 228);
  TX.fillStyle='#555'; TX.font='11px Nunito';
  TX.fillText('Récord: '+tHi, cx, 248);
  // Botón
  TX.fillStyle='#C8903A';
  TX.beginPath(); TX.roundRect(cx-55, 262, 110, 36, 10); TX.fill();
  TX.fillStyle='#0a0a0a'; TX.font='bold 13px Nunito';
  TX.fillText('▶  JUGAR', cx, 285);
  TX.fillStyle='#333'; TX.font='10px Nunito';
  TX.fillText('Tap o Espacio para iniciar', cx, 320);
}

// Pantalla de inicio — no arranca solo
let tetrisEnEspera = true;

function _tetrisArrancar() {
  if (!tetrisEnEspera) return;
  tetrisEnEspera = false;
  tetrisInit(); tDraw();
}

TC.addEventListener('pointerdown', () => { if(tetrisEnEspera) _tetrisArrancar(); }, {passive:true});
document.addEventListener('keydown', e => {
  if (tetrisEnEspera && e.code==='Space' && document.getElementById('juegoTetris').style.display!=='none') {
    e.preventDefault(); _tetrisArrancar();
  }
});

// Mostrar pantalla de inicio al cargar
tetrisDrawStart();
