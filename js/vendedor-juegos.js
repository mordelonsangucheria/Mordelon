// ===== RELOJ EN VIVO PANTALLA DE ESPERA =====
const _sesionInicio = Date.now();
let _waitingClockInterval = null;

function startWaitingClock() {
  if (_waitingClockInterval) clearInterval(_waitingClockInterval);
  function tick() {
    const clockEl = document.getElementById('waitingClock');
    const uptimeEl = document.getElementById('waitingUptime');
    if (!clockEl) { clearInterval(_waitingClockInterval); _waitingClockInterval = null; return; }
    clockEl.textContent = new Date().toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    const mins = Math.floor((Date.now() - _sesionInicio) / 60000);
    const hrs  = Math.floor(mins / 60);
    uptimeEl.textContent = hrs > 0
      ? `Activo hace ${hrs}h ${mins % 60}min`
      : `Activo hace ${mins} min`;
  }
  tick();
  _waitingClockInterval = setInterval(tick, 1000);
}

// ===== JUEGOS PANTALLA DE ESPERA =====
let _activeGame = null;

window.switchGame = function(name) {
  const bs = document.getElementById('btnSnake');
  const b2 = document.getElementById('btn2048');
  if (bs) bs.classList.toggle('active', name==='snake');
  if (b2) b2.classList.toggle('active', name==='2048');
  stopGame();
  const area = document.getElementById('gameArea');
  if (!area) return;
  if (name === 'snake') initSnake(area);
  else init2048(area);
}

function stopGame() {
  if (_activeGame && _activeGame.stop) _activeGame.stop();
  _activeGame = null;
  document.removeEventListener('keydown', _gameKeyHandler);
}

function _gameKeyHandler(e) {
  if (_activeGame && _activeGame.onKey) _activeGame.onKey(e);
}

function initGame(name) {
  const area = document.getElementById('gameArea');
  if (!area) return;
  if (name === 'snake') initSnake(area);
  else init2048(area);
}

// ──── SNAKE ────
function initSnake(area) {
  const SZ = 17, COLS = 15, ROWS = 15;
  const W = SZ * COLS;
  area.innerHTML = `
    <canvas id="snakeCanvas" width="${W}" height="${W}"></canvas>
    <div class="game-score">Puntos: <span id="snakeScore">0</span> &nbsp;|&nbsp; Récord: <span id="snakeHi">${localStorage.getItem('mordelon-snake-hi')||0}</span></div>
    <div class="dpad">
      <div class="dpad-row"><button class="dpad-btn" data-dir="up">▲</button></div>
      <div class="dpad-row">
        <button class="dpad-btn" data-dir="left">◀</button>
        <button class="dpad-btn dpad-center" data-dir="restart">↺</button>
        <button class="dpad-btn" data-dir="right">▶</button>
      </div>
      <div class="dpad-row"><button class="dpad-btn" data-dir="down">▼</button></div>
    </div>`;

  const canvas = document.getElementById('snakeCanvas');
  const ctx = canvas.getContext('2d');
  let snake, dir, nextDir, food, score, alive, interval;

  function reset() {
    snake = [{x:7,y:7},{x:6,y:7},{x:5,y:7}];
    dir = {x:1,y:0}; nextDir = {x:1,y:0};
    food = placeFood(); score = 0; alive = true;
    document.getElementById('snakeScore').textContent = 0;
    if (interval) clearInterval(interval);
    interval = setInterval(step, 150);
    draw();
  }

  function placeFood() {
    let f;
    do { f = {x:Math.floor(Math.random()*COLS), y:Math.floor(Math.random()*ROWS)}; }
    while (snake.some(s=>s.x===f.x&&s.y===f.y));
    return f;
  }

  function draw() {
    ctx.fillStyle = '#0a1a1a'; ctx.fillRect(0,0,W,W);
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.arc(food.x*SZ+SZ/2, food.y*SZ+SZ/2, SZ/2-2, 0, Math.PI*2);
    ctx.fill();
    snake.forEach((s,i) => {
      ctx.fillStyle = i===0 ? '#00e5cc' : `hsl(${170+i*2},75%,${38-i*0.5}%)`;
      ctx.beginPath();
      ctx.roundRect(s.x*SZ+1, s.y*SZ+1, SZ-2, SZ-2, 3);
      ctx.fill();
    });
    if (!alive) {
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0,0,W,W);
      ctx.fillStyle='#00e5cc'; ctx.font='bold 15px monospace'; ctx.textAlign='center';
      ctx.fillText('GAME OVER', W/2, W/2-10);
      ctx.fillStyle='#888'; ctx.font='11px monospace';
      ctx.fillText('↺ para reiniciar', W/2, W/2+10);
    }
  }

  function step() {
    dir = nextDir;
    const head = {x:(snake[0].x+dir.x+COLS)%COLS, y:(snake[0].y+dir.y+ROWS)%ROWS};
    if (snake.some(s=>s.x===head.x&&s.y===head.y)) { alive=false; draw(); clearInterval(interval); return; }
    snake.unshift(head);
    if (head.x===food.x && head.y===food.y) {
      score++; food = placeFood();
      document.getElementById('snakeScore').textContent = score;
      const hi = parseInt(localStorage.getItem('mordelon-snake-hi')||0);
      if (score>hi) { localStorage.setItem('mordelon-snake-hi',score); document.getElementById('snakeHi').textContent=score; }
    } else { snake.pop(); }
    draw();
  }

  function applyDir(d) {
    const map = {up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
    const nd = map[d];
    if (nd && !(nd.x===-dir.x && nd.y===-dir.y)) nextDir = nd;
  }

  function onKey(e) {
    if (!alive) { if (e.key==='Enter') reset(); return; }
    const map = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
    if (map[e.key]) { applyDir(map[e.key]); e.preventDefault(); }
  }

  // D-pad táctil
  area.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('touchstart', e => { e.preventDefault(); const d=btn.dataset.dir; if(d==='restart') reset(); else applyDir(d); }, {passive:false});
    btn.addEventListener('mousedown', e => { const d=btn.dataset.dir; if(d==='restart') reset(); else applyDir(d); });
  });

  // Swipe en canvas
  let tx=0, ty=0;
  canvas.addEventListener('touchstart', e => { tx=e.touches[0].clientX; ty=e.touches[0].clientY; e.preventDefault(); }, {passive:false});
  canvas.addEventListener('touchend', e => {
    if (!alive) { reset(); return; }
    const dx=e.changedTouches[0].clientX-tx, dy=e.changedTouches[0].clientY-ty;
    if (Math.abs(dx)<10 && Math.abs(dy)<10) return;
    if (Math.abs(dx)>Math.abs(dy)) applyDir(dx>0?'right':'left');
    else applyDir(dy>0?'down':'up');
    e.preventDefault();
  }, {passive:false});

  reset();
  _activeGame = { stop: ()=>clearInterval(interval), onKey };
  document.addEventListener('keydown', _gameKeyHandler);
}

// ──── 2048 ────
function init2048(area) {
  const hiVal = localStorage.getItem('mordelon-2048-hi')||0;
  area.innerHTML = `
    <div class="g2048-wrapper" id="g2048wrapper">
      <div class="g2048-header">
        <div style="font-size:.8rem;color:#00e5cc;font-weight:900;">2048</div>
        <div class="g2048-score-box"><div class="label">puntos</div><div class="val" id="g2048score">0</div></div>
        <div class="g2048-score-box"><div class="label">récord</div><div class="val" id="g2048hi">${hiVal}</div></div>
      </div>
      <div class="g2048-grid" id="g2048grid"></div>
      <div class="dpad" style="margin-top:8px;">
        <div class="dpad-row"><button class="dpad-btn" id="d2up">▲</button></div>
        <div class="dpad-row">
          <button class="dpad-btn" id="d2left">◀</button>
          <button class="dpad-btn dpad-center" id="d2restart">↺</button>
          <button class="dpad-btn" id="d2right">▶</button>
        </div>
        <div class="dpad-row"><button class="dpad-btn" id="d2down">▼</button></div>
      </div>
    </div>`;

  let board = [], score2048 = 0;

  function newBoard() {
    board = Array(4).fill(null).map(()=>Array(4).fill(0));
    score2048 = 0;
    addTile(); addTile(); render2048();
  }

  function addTile() {
    const empty = [];
    for(let r=0;r<4;r++) for(let c=0;c<4;c++) if(!board[r][c]) empty.push([r,c]);
    if(!empty.length) return;
    const [r,c] = empty[Math.floor(Math.random()*empty.length)];
    board[r][c] = Math.random()<0.9?2:4;
  }

  const colors = {0:'#111',2:'#1a2e2e',4:'#1e3535',8:'#00e5cc',16:'#00ccb3',32:'#ff7043',64:'#ff4500',
    128:'#ffc107',256:'#ffb300',512:'#ff9800',1024:'#ff6f00',2048:'#e65100'};
  const textColors = {0:'transparent',2:'#555',4:'#666',8:'#0a1a1a',16:'#0a1a1a',32:'#fff',64:'#fff',
    128:'#1a1a0a',256:'#1a1a0a',512:'#fff',1024:'#fff',2048:'#fff'};

  function render2048() {
    const grid = document.getElementById('g2048grid');
    if (!grid) return;
    grid.innerHTML = '';
    for(let r=0;r<4;r++) for(let c=0;c<4;c++) {
      const v = board[r][c];
      const cell = document.createElement('div');
      cell.className = 'g2048-cell';
      cell.style.background = colors[v]||'#333';
      cell.style.color = textColors[v]||'#fff';
      cell.style.fontSize = v>=1024?'.65rem':v>=128?'.78rem':'.9rem';
      cell.textContent = v||'';
      grid.appendChild(cell);
    }
    const sc = document.getElementById('g2048score');
    if (sc) sc.textContent = score2048;
    const hi = parseInt(localStorage.getItem('mordelon-2048-hi')||0);
    if(score2048>hi) {
      localStorage.setItem('mordelon-2048-hi', score2048);
      const hiel = document.getElementById('g2048hi');
      if (hiel) hiel.textContent = score2048;
    }
  }

  function slide(row) {
    let arr = row.filter(v=>v), gained = 0;
    for(let i=0;i<arr.length-1;i++) {
      if(arr[i]===arr[i+1]) { arr[i]*=2; gained+=arr[i]; arr.splice(i+1,1); }
    }
    score2048 += gained;
    while(arr.length<4) arr.push(0);
    return arr;
  }

  function transpose(b) { return b[0].map((_,c)=>b.map(r=>r[c])); }

  function move(d) {
    const prev = JSON.stringify(board);
    if(d==='left')  board = board.map(r=>slide(r));
    if(d==='right') board = board.map(r=>slide([...r].reverse()).reverse());
    if(d==='up')    { board = transpose(board).map(r=>slide(r)); board=transpose(board); }
    if(d==='down')  { board = transpose(board).map(r=>slide([...r].reverse()).reverse()); board=transpose(board); }
    if(JSON.stringify(board)!==prev) { addTile(); render2048(); }
  }

  function onKey(e) {
    const map = {ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};
    if(map[e.key]) { move(map[e.key]); e.preventDefault(); }
  }

  // Botones por ID para evitar conflictos
  function bindBtn(id, action) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => { e.preventDefault(); action(); }, {passive:false});
    el.addEventListener('mousedown', () => action());
  }
  bindBtn('d2up',      () => move('up'));
  bindBtn('d2down',    () => move('down'));
  bindBtn('d2left',    () => move('left'));
  bindBtn('d2right',   () => move('right'));
  bindBtn('d2restart', () => newBoard());

  // Swipe en grilla
  let tx=0, ty=0;
  const grid2 = document.getElementById('g2048grid');
  grid2.addEventListener('touchstart', e=>{ tx=e.touches[0].clientX; ty=e.touches[0].clientY; e.preventDefault(); },{passive:false});
  grid2.addEventListener('touchend', e=>{
    const dx=e.changedTouches[0].clientX-tx, dy=e.changedTouches[0].clientY-ty;
    if(Math.abs(dx)<10&&Math.abs(dy)<10) return;
    if(Math.abs(dx)>Math.abs(dy)) move(dx>0?'right':'left');
    else move(dy>0?'down':'up');
    e.preventDefault();
  },{passive:false});

  window.g2048Restart = () => newBoard();
  newBoard();
  _activeGame = { stop: ()=>{}, onKey };
  document.addEventListener('keydown', _gameKeyHandler);
}


// CERRAR SESIÓN
window.cerrarSesion = function() {
  if (!confirm('¿Cerrar sesión de ' + (usuarioActual || 'usuario') + '?')) return;
  registrarActividad('🚪 Cerró sesión');
  localStorage.removeItem('mordelon-sesion');
  usuarioActual = null;
  pinIngresado = '';
  document.getElementById('pinOverlay').classList.remove('hidden');
  // Reset dots
  for (let i = 0; i < 4; i++) {
    const d = document.getElementById('dot' + i);
    if (d) { d.classList.remove('filled','error'); }
  }
  document.getElementById('pinError').textContent = '';
  document.getElementById('usuarioActualLabel').textContent = '';
};

// Registrar actividad
async function registrarActividad(accion) {
  if (!usuarioActual) return;
  try {
    await addDoc(collection(db,'actividad'), {
      usuario: usuarioActual,
      accion,
      timestamp: serverTimestamp()
    });
  } catch(e) {}
}
window.registrarActividad = registrarActividad;



// CONTADOR DE VISITAS
onSnapshot(doc(db,'config','stats'), (snap) => {
  const visitas = snap.exists() ? (snap.data().visitas || 0) : 0;
  const el = document.getElementById('cajaVisitas');
  if (el) el.textContent = visitas.toLocaleString('es-AR');
});
