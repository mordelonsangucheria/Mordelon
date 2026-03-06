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
function sPlaceFood(){do{sFood={x:Math.floor(Math.random()*SCELLS),y:Math.floor(Math.random()*SCELLS)};}while(snake.some(s=>s.x===sFood.x&&s.y===sFood.y));}
function sStep(){
  sDir=sNext;
  const head={x:snake[0].x+sDir.x,y:snake[0].y+sDir.y};
  if(head.x<0||head.x>=SCELLS||head.y<0||head.y>=SCELLS||snake.some(s=>s.x===head.x&&s.y===head.y)){snakeOver();return;}
  snake.unshift(head);
  if(head.x===sFood.x&&head.y===sFood.y){sScore+=10;document.getElementById('snakeScore').textContent=sScore;if(sScore>sHi){sHi=sScore;localStorage.setItem('snakeHiC',sHi);document.getElementById('snakeHi').textContent=sHi;if(typeof window.notificarRecordJuego==='function')window.notificarRecordJuego('snake',sHi);}sPlaceFood();}else snake.pop();
  sDraw();
}
function sDraw(){
  SX.fillStyle='#0a0a0a';SX.fillRect(0,0,SC.width,SC.height);
  snake.forEach((s,i)=>{SX.fillStyle=i===0?'#3DBFB8':'#2A9E98';SX.fillRect(s.x*SSIZ,s.y*SSIZ,SSIZ-1,SSIZ-1);});
  SX.fillStyle='#FF4D4D';SX.beginPath();SX.arc(sFood.x*SSIZ+SSIZ/2,sFood.y*SSIZ+SSIZ/2,SSIZ/2-1,0,Math.PI*2);SX.fill();
}
function snakeOver(){clearInterval(sTimer);snakeRunning=false;SX.fillStyle='rgba(0,0,0,0.7)';SX.fillRect(0,100,280,60);SX.fillStyle='#fff';SX.font='bold 16px Nunito';SX.textAlign='center';SX.fillText('GAME OVER',140,125);SX.font='12px Nunito';SX.fillText('Puntos: '+sScore,140,145);}
window.snakeDir=function(dx,dy){if(!snakeRunning)return;if(dx!==0&&sDir.x!==0)return;if(dy!==0&&sDir.y!==0)return;sNext={x:dx,y:dy};};
window.snakeInit=snakeInit;
window.snakeReset=function(){clearInterval(sTimer);snakeInit();sDraw();};
document.addEventListener('keydown',e=>{
  if(document.getElementById('juegoSnake').style.display==='none')return;
  if(e.key==='ArrowUp')window.snakeDir(0,-1);
  else if(e.key==='ArrowDown')window.snakeDir(0,1);
  else if(e.key==='ArrowLeft')window.snakeDir(-1,0);
  else if(e.key==='ArrowRight')window.snakeDir(1,0);
});
(()=>{let sx,sy;SC.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});SC.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>Math.abs(dy)){window.snakeDir(dx>0?1:-1,0);}else{window.snakeDir(0,dy>0?1:-1);}},{passive:true});})();
