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
const TCOLORS = ['#3DBFB8','#FFD700','#D4831A','#2DC653','#FF4D4D','#A855F7','#3B82F6'];
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
  tBoard.forEach((r,y)=>r.forEach((c,x)=>{if(c){TX.fillStyle=c;TX.fillRect(x*TSZ,y*TSZ,TSZ-1,TSZ-1);}}));
  if(tPiece) tPiece.shape.forEach((r,y)=>r.forEach((v,x)=>{if(v){TX.fillStyle=tPiece.color;TX.fillRect((tX+x)*TSZ,(tY+y)*TSZ,TSZ-1,TSZ-1);}}));
}
function tetrisOver(){ clearInterval(tTimer); tetrisRunning=false; TX.fillStyle='rgba(0,0,0,0.7)'; TX.fillRect(0,150,200,60); TX.fillStyle='#fff'; TX.font='bold 16px Nunito'; TX.textAlign='center'; TX.fillText('GAME OVER',100,175); TX.font='12px Nunito'; TX.fillText('Puntos: '+tScore,100,195); }
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
  if(e.key==='ArrowLeft')window.tetrisDir('left');
  else if(e.key==='ArrowRight')window.tetrisDir('right');
  else if(e.key==='ArrowDown')window.tetrisDir('down');
  else if(e.key==='ArrowUp')window.tetrisDir('up');
});
// Swipe Tetris
(()=>{let sx,sy;TC.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});TC.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>Math.abs(dy)){window.tetrisDir(dx>0?'right':'left');}else{window.tetrisDir(dy>0?'down':'up');}},{passive:true});})();
// Init on load
tetrisInit(); tDraw();
