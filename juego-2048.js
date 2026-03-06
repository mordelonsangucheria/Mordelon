// ===================== 2048 =====================
let g2Board, g2Score, g2Hi=parseInt(localStorage.getItem('g2048HiC')||'0');
const G2COLORS={'0':'#1a1a1a','2':'#3DBFB8','4':'#2A9E98','8':'#D4831A','16':'#C06010','32':'#FF4D4D','64':'#CC3333','128':'#FFD700','256':'#FFC200','512':'#A855F7','1024':'#8B32E0','2048':'#2DC653'};

function g2048Init(){
  g2Board=Array.from({length:4},()=>Array(4).fill(0));
  g2Score=0;
  document.getElementById('g2048Score').textContent=0;
  document.getElementById('g2048Hi').textContent=g2Hi;
  g2Spawn();g2Spawn();g2Render();
}
function g2Spawn(){const empty=[];for(let r=0;r<4;r++)for(let c=0;c<4;c++)if(!g2Board[r][c])empty.push([r,c]);if(!empty.length)return;const[r,c]=empty[Math.floor(Math.random()*empty.length)];g2Board[r][c]=Math.random()<0.9?2:4;}
function g2Render(){const bd=document.getElementById('g2048Board');bd.innerHTML='';for(let r=0;r<4;r++)for(let c=0;c<4;c++){const v=g2Board[r][c];const d=document.createElement('div');d.style.cssText=`background:${G2COLORS[v]||'#6B21A8'};border-radius:6px;height:55px;display:flex;align-items:center;justify-content:center;font-family:Righteous,cursive;font-size:${v>=1000?'1rem':'1.2rem'};font-weight:900;color:${v>=8?'#fff':'#111'};transition:all .1s;`;d.textContent=v||'';bd.appendChild(d);}}
window.g2048Move=function(dir){
  let moved=false;
  const rotate=b=>b[0].map((_,i)=>b.map(r=>r[i]).reverse());
  let b=g2Board.map(r=>[...r]);
  if(dir==='up')b=rotate(rotate(rotate(b)));
  else if(dir==='right')b=b.map(r=>[...r].reverse());
  else if(dir==='down')b=rotate(b);
  b=b.map(row=>{const f=row.filter(v=>v);for(let i=0;i<f.length-1;i++)if(f[i]===f[i+1]){f[i]*=2;g2Score+=f[i];f.splice(i+1,1);}while(f.length<4)f.push(0);if(f.join()!==row.join())moved=true;return f;});
  if(dir==='up')b=rotate(b);
  else if(dir==='right')b=b.map(r=>[...r].reverse());
  else if(dir==='down')b=rotate(rotate(rotate(b)));
  if(moved){g2Board=b;g2Spawn();document.getElementById('g2048Score').textContent=g2Score;if(g2Score>g2Hi){g2Hi=g2Score;localStorage.setItem('g2048HiC',g2Hi);document.getElementById('g2048Hi').textContent=g2Hi;if(typeof window.notificarRecordJuego==='function')window.notificarRecordJuego('2048',g2Hi);}g2Render();}
};
window.g2048Init=g2048Init;
window.g2048Reset=async function(){
  if (typeof window.juegoRequiereFichas==='function' && window.juegoRequiereFichas('2048')) {
    if (typeof window.juegoConsumirFicha==='function') {
      var ok = await window.juegoConsumirFicha('2048');
      if (!ok) { if(typeof showToast==='function') showToast('🎟️ Sin fichas para 2048'); return; }
    }
  }
  g2048Init();
};
document.addEventListener('keydown',e=>{
  if(document.getElementById('juego2048').style.display==='none')return;
  if(e.key==='ArrowUp')window.g2048Move('up');
  else if(e.key==='ArrowDown')window.g2048Move('down');
  else if(e.key==='ArrowLeft')window.g2048Move('left');
  else if(e.key==='ArrowRight')window.g2048Move('right');
});
(()=>{let sx,sy;const bd=document.getElementById('g2048Board');bd.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});bd.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>Math.abs(dy)){window.g2048Move(dx>0?'right':'left');}else{window.g2048Move(dy>0?'down':'up');}},{passive:true});})();
