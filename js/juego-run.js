// ===================== MORDELÓN RUN =====================
(function () {

  const COLS = 20, ROWS = 16, TILE = 20;

  // Tipos de celda
  // SUELO  = bloque sólido (no se puede atravesar)
  // ESC    = escalera en celda vacía (se puede subir/bajar)
  // ESC_S  = escalera que pasa por suelo (la plataforma tiene agujero para la escalera)
  const T = { VACIO: 0, SUELO: 1, ESC: 2, COCINA: 3, ESC_S: 4 };

  const ING = [
    { e: '🍞', c: '#D4A056' }, { e: '🥩', c: '#C0392B' },
    { e: '🍅', c: '#E74C3C' }, { e: '🥬', c: '#27AE60' },
  ];

  const COL = {
    BG: '#0a0a0a', SUELO: '#17302f', SUELO_TOP: '#3dbfb8',
    ESC: '#3dbfb8', COCINA: '#d4831a', COCINA_B: '#ffaa33',
    P1: '#3dbfb8', P2: '#1a7a75', PDARK: '#0a3030',
    ENE: '#e03535', ENE2: '#8b0000',
  };

  let canvas, ctx;
  let estado = 'parado';
  let score = 0, hiScore = 0, vidas = 3, nivel = 1;
  let loopId = null, lastTs = 0;
  let grid = [], items = [], enemies = [], itemsLeft = 0;
  let runDificultad = 1; // 0=Fácil 1=Normal 2=Difícil 3=Muy difícil 4=Extremo
  let P = { col: 5, row: 14, dx: 0, dy: 0, dead: false, deadTimer: 0 };
  let pTimer = 0;
  const P_SPD = 150;
  let keysDown = {}, touchSt = null;
  let animFrame = 0, animTimer = 0;
  let freezeTimer = 0;
  let FREEZE_DUR  = 1500;   // configurable por vendedor
  let FREEZE_USOS = 0;      // 0 = infinito; >0 = límite por nivel
  let freezeUsosRestantes = 0; // usos disponibles en el nivel actual

  // Llamado por el panel vendedor para actualizar la config en caliente
  window.setRunFreezeConfig = function(dur, usos) {
    FREEZE_DUR  = dur  != null ? dur  : 1500;
    FREEZE_USOS = usos != null ? usos : 0;
    _resetFreezeUsos();
    _actualizarBtnFreeze();
  };

  function _actualizarBtnFreeze() {
    const btn = document.getElementById('btnRunFreeze');
    if (!btn) return;
    if (FREEZE_USOS === 0) {
      btn.textContent = '❄️';
      btn.title = 'Congelar enemigos (∞)';
    } else {
      btn.textContent = '❄️ ×' + freezeUsosRestantes;
      btn.title = 'Congelar enemigos (' + freezeUsosRestantes + ' usos)';
      btn.style.opacity = freezeUsosRestantes > 0 ? '1' : '0.35';
    }
  }

  function _resetFreezeUsos() {
    freezeUsosRestantes = FREEZE_USOS === 0 ? Infinity : FREEZE_USOS;
    _actualizarBtnFreeze();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  function g(r, c)      { return (r>=0&&r<ROWS&&c>=0&&c<COLS) ? grid[r][c] : T.SUELO; }
  function solido(r, c) { const t=g(r,c); return t===T.SUELO||t===T.COCINA; }
  function esEsc(r, c)  { const t=g(r,c); return t===T.ESC||t===T.ESC_S; }
  // ¿Puede el jugador pararse en (r,c)?
  // Sí si: hay suelo/cocina/ESC_S debajo, o está en escalera
  function apoyado(r, c) {
    const abajo = g(r+1, c);
    return abajo===T.SUELO || abajo===T.COCINA || abajo===T.ESC_S || esEsc(r,c);
  }

  // ── Generación de nivel ─────────────────────────────────────────────────
  function genNivel(n) {
    grid = Array.from({length:ROWS}, () => new Array(COLS).fill(T.VACIO));

    // Suelo inferior y paredes
    for (let c=0;c<COLS;c++) grid[ROWS-1][c]=T.SUELO;
    for (let r=0;r<ROWS;r++) { grid[r][0]=T.SUELO; grid[r][COLS-1]=T.SUELO; }

    // Plataformas alternadas izq/der
    const platRows = [];
    for (let r=ROWS-4; r>=3; r-=3) platRows.push(r);

    platRows.forEach((r, i) => {
      const izq = (i%2===0);
      const largo = 10 + Math.floor(Math.random()*3);
      if (izq) { for (let c=1; c<=largo; c++) grid[r][c]=T.SUELO; }
      else     { for (let c=COLS-1-largo; c<=COLS-2; c++) grid[r][c]=T.SUELO; }
    });

    // Cocina
    grid[ROWS-1][2] = T.COCINA;

    // ── Escaleras ──────────────────────────────────────────────────────────
    // La escalera va desde la plataforma inferior hasta la superior,
    // PASANDO A TRAVÉS de ambas plataformas (tipo ESC_S en las celdas de suelo).
    // Así el jugador puede atravesar verticalmente por la columna de la escalera.
    const pisos = [ROWS-1, ...platRows].sort((a,b) => b-a);

    for (let i=0; i<pisos.length-1; i++) {
      const rInf = pisos[i];    // plataforma inferior (número de fila mayor)
      const rSup = pisos[i+1];  // plataforma superior (número de fila menor)
      const izqSup = (platRows.indexOf(rSup)%2===0);

      // Elegir columna: borde de la plataforma superior
      let escCol = -1;
      if (izqSup) {
        // Plataforma sup va por la izquierda → escalera en borde derecho
        let lastC = -1;
        for (let c=1;c<COLS-1;c++) if (grid[rSup][c]===T.SUELO) lastC=c;
        escCol = lastC > 0 ? lastC : -1;
      } else {
        // Plataforma sup va por la derecha → escalera en borde izquierdo
        let firstC = -1;
        for (let c=COLS-2;c>=1;c--) if (grid[rSup][c]===T.SUELO) firstC=c;
        escCol = firstC > 0 ? firstC : -1;
      }
      if (escCol === -1) continue;

      // Trazar escalera desde rSup hasta rInf (ambas inclusive)
      // - En celdas de suelo: poner ESC_S (escalera dentro del suelo = agujero)
      // - En celdas vacías:   poner ESC
      for (let r=rSup; r<=rInf; r++) {
        if (grid[r][escCol]===T.SUELO)   grid[r][escCol]=T.ESC_S;
        else if (grid[r][escCol]===T.VACIO) grid[r][escCol]=T.ESC;
        // Mantener COCINA si ya está
      }
    }

    // ── Ingredientes ──────────────────────────────────────────────────────
    items = [];
    const cant = Math.min(4 + Math.floor((n-1)/2), 6);
    let intentos=0;
    while (items.length<cant && intentos++<1500) {
      const r=1+Math.floor(Math.random()*(ROWS-2));
      const c=1+Math.floor(Math.random()*(COLS-2));
      const t=g(r,c);
      if (t!==T.VACIO && t!==T.ESC) continue;
      if (!apoyado(r,c)) continue;
      if (c<=5&&r>=ROWS-3) continue;
      if (items.find(it=>it.col===c&&it.row===r)) continue;
      items.push({col:c, row:r, t:Math.floor(Math.random()*ING.length), ok:false});
    }
    itemsLeft = items.length;

    // ── Enemigos ──────────────────────────────────────────────────────────
    enemies = [];
    // Dificultad: 0=Fácil, 1=Normal, 2=Medio, 3=Alto, 4=Extremo
    const difMult   = [0.6, 1.0, 1.35, 1.7, 2.2][runDificultad];
    const nEne = Math.min(Math.ceil((1 + Math.floor((n-1)/2)) * difMult), 6);
    const spd  = Math.max((380 - (n-1)*22) / difMult, 100);
    platRows.forEach((pr,i) => {
      if (i>=nEne) return;
      const eRow = pr-1;
      const cols=[];
      for (let c=2;c<COLS-2;c++) {
        const t=g(eRow,c);
        if ((t===T.VACIO||t===T.ESC) && (solido(eRow+1,c)||g(eRow+1,c)===T.ESC_S)) cols.push(c);
      }
      if (!cols.length) return;
      const ec=cols[Math.floor(Math.random()*cols.length)];
      enemies.push({col:ec, row:eRow, dir:i%2===0?1:-1, timer:0, spd:spd+Math.random()*50});
    });

    P={col:5, row:ROWS-2, dx:0, dy:0, dead:false, deadTimer:0};
    pTimer=0;
  }

  // ── Movimiento jugador ──────────────────────────────────────────────────
  function moverP(dt) {
    if (P.dead) { P.deadTimer-=dt; if(P.deadTimer<=0) respawn(); return; }

    let dx=0, dy=0;
    if (keysDown['ArrowLeft'] ||keysDown['a']||keysDown['A']) dx=-1;
    if (keysDown['ArrowRight']||keysDown['d']||keysDown['D']) dx= 1;
    if (keysDown['ArrowUp']   ||keysDown['w']||keysDown['W']) dy=-1;
    if (keysDown['ArrowDown'] ||keysDown['s']||keysDown['S']) dy= 1;
    if (P.dx) dx=P.dx;
    if (P.dy) dy=P.dy;

    pTimer+=dt;
    if (pTimer<P_SPD) return;
    pTimer=0; P.dx=0; P.dy=0;

    const r=P.row, c=P.col;
    const enEscalera = esEsc(r,c);
    const pisoAbajo  = solido(r+1,c);        // suelo sólido debajo
    const escSAbajo  = g(r+1,c)===T.ESC_S;  // plataforma-agujero debajo
    const apoyoAbajo = pisoAbajo || escSAbajo;

    // ── GRAVEDAD ──
    if (!apoyoAbajo && !enEscalera) {
      const nr=r+1;
      if (nr<ROWS && !solido(nr,c)) { P.row=nr; return; }
    }

    // ── VERTICAL EN ESCALERA ──
    if (dy!==0 && enEscalera) {
      const nr=r+dy;
      if (nr>=0 && nr<ROWS) {
        const tnr=g(nr,c);
        if (tnr===T.VACIO||tnr===T.ESC||tnr===T.ESC_S) { P.row=nr; return; }
      }
      return;
    }

    // Entrar a escalera subiendo: hay ESC/ESC_S encima
    if (dy===-1 && apoyoAbajo && esEsc(r-1,c)) {
      P.row=r-1; return;
    }
    // Entrar a escalera bajando: ESC_S debajo (techo de la escalera)
    if (dy===1 && apoyoAbajo && esEsc(r+1,c)) {
      P.row=r+1; return;
    }

    // ── HORIZONTAL ──
    if (dx!==0) {
      const nc=c+dx;
      if (nc>0 && nc<COLS-1) {
        const tnc=g(r,nc);
        // No entrar a celdas sólidas normales
        if (tnc!==T.SUELO && tnc!==T.COCINA) {
          P.col=nc;
          // Gravedad en columna nueva
          if (!solido(r+1,nc) && !esEsc(r,nc) && g(r+1,nc)!==T.ESC_S) {
            let fr=r+1;
            while (fr<ROWS-1 && !solido(fr,nc) && !esEsc(fr,nc)) fr++;
            if (solido(fr,nc)||g(fr,nc)===T.ESC_S) P.row=fr-1;
            else P.row=fr;
          }
          animFrame=(animFrame+1)%2;
          return;
        }
      }
    }
  }

  function respawn() {
    P={col:5, row:ROWS-2, dx:0, dy:0, dead:false, deadTimer:0};
    pTimer=0;
  }

  // ── Enemigos ────────────────────────────────────────────────────────────
  function moverEne(dt) {
    if (freezeTimer > 0) { freezeTimer -= dt; return; } // enemigos congelados
    enemies.forEach(e => {
      e.timer+=dt; if(e.timer<e.spd) return; e.timer=0;
      const nc=e.col+e.dir;
      const tnc=g(e.row,nc);
      const tabajo=g(e.row+1,nc);
      const puedeAndar = (tnc===T.VACIO||tnc===T.ESC) &&
                         (tabajo===T.SUELO||tabajo===T.ESC_S||tabajo===T.COCINA);
      if (nc<=0||nc>=COLS-1||!puedeAndar) { e.dir*=-1; }
      else { e.col=nc; }
      if (e.col===P.col&&e.row===P.row&&!P.dead) matarP();
    });
  }

  function matarP() {
    if(P.dead) return;
    P.dead=true; P.deadTimer=1400; vidas--;
    hud(); if(vidas<=0) setTimeout(fin,900);
  }

  function checkItems() {
    items.forEach(it=>{
      if(it.ok) return;
      if(it.col===P.col&&it.row===P.row){
        it.ok=true; itemsLeft--; score+=10*nivel; hud();
        toast(ING[it.t].e+' +'+( 10*nivel)+' pts');
      }
    });
  }

  let completando = false; // evita que checkCocina dispare varias veces por frame

  function checkCocina() {
    if(itemsLeft>0 || completando) return;
    if(P.col===2 && P.row===ROWS-2) {
      completando = true;
      const bonus=50*nivel; score+=bonus; nivel++; hud();
      toast('🎉 Nivel completado! +'+bonus+' pts');
      setTimeout(()=>{
        genNivel(nivel); completando=false;
        freezeTimer=0; _resetFreezeUsos();
        const btn=document.getElementById('btnRunFreeze');
        if(btn){btn.style.opacity='1';btn.style.pointerEvents='';}
      }, 800);
    }
  }

  // ── Dibujo ───────────────────────────────────────────────────────────────
  function draw() {
    if(!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle=COL.BG; ctx.fillRect(0,0,canvas.width,canvas.height);

    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
      const x=c*TILE, y=r*TILE, t=grid[r][c];
      if (t===T.SUELO) {
        ctx.fillStyle=COL.SUELO; ctx.fillRect(x,y,TILE,TILE);
        ctx.fillStyle=COL.SUELO_TOP; ctx.fillRect(x,y,TILE,3);
        ctx.fillStyle='#0d2020'; ctx.fillRect(x,y+TILE-2,TILE,2);
      } else if (t===T.ESC||t===T.ESC_S) {
        if (t===T.ESC_S) {
          // Fondo oscuro para el agujero en la plataforma
          ctx.fillStyle='#0d1f1f'; ctx.fillRect(x,y,TILE,TILE);
        }
        ctx.strokeStyle=COL.ESC; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(x+5,y); ctx.lineTo(x+5,y+TILE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+15,y); ctx.lineTo(x+15,y+TILE); ctx.stroke();
        ctx.lineWidth=1.5;
        for (let py=2;py<TILE;py+=5) {
          ctx.beginPath(); ctx.moveTo(x+5,y+py); ctx.lineTo(x+15,y+py); ctx.stroke();
        }
      } else if (t===T.COCINA) {
        ctx.fillStyle=COL.COCINA; ctx.fillRect(x,y,TILE,TILE);
        ctx.fillStyle=COL.COCINA_B; ctx.fillRect(x,y,TILE,3);
        ctx.font='13px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('🍔',x+TILE/2,y+TILE/2);
      }
    }

    // Ingredientes
    items.forEach(it=>{
      if(it.ok) return;
      const x=it.col*TILE+TILE/2, y=it.row*TILE+TILE/2, ing=ING[it.t];
      ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2);
      ctx.fillStyle=ing.c+'55'; ctx.fill();
      ctx.strokeStyle=ing.c; ctx.lineWidth=1; ctx.stroke();
      ctx.font='12px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(ing.e,x,y);
    });

    // Enemigos (azul parpadeante si están congelados)
    const frozen = freezeTimer > 0;
    const frozenVis = frozen ? Math.floor(Date.now()/150)%2===0 : false;
    enemies.forEach(e=>{
      const x=e.col*TILE, y=e.row*TILE;
      ctx.fillStyle = frozen ? (frozenVis ? '#5599ff' : '#3377dd') : COL.ENE;
      ctx.fillRect(x+3,y+1,14,12); ctx.fillRect(x+2,y+12,16,5);
      ctx.fillRect(x+3,y+16,5,4); ctx.fillRect(x+12,y+16,5,4);
      ctx.fillStyle = frozen ? '#224488' : COL.ENE2;
      ctx.fillRect(x+6,y+4,3,3); ctx.fillRect(x+11,y+4,3,3);
      ctx.fillRect(x+8,y+9,4,2);
      // Icono de hielo encima
      if (frozen) {
        ctx.font='9px serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.fillText('❄️', x+TILE/2, y);
      }
    });

    // Jugador
    if (!P.dead || Math.floor(Date.now()/100)%2===0) {
      const x=P.col*TILE, y=P.row*TILE;
      const enE=esEsc(P.row,P.col), m=animFrame;
      // Torso
      ctx.fillStyle=COL.P1; ctx.fillRect(x+5,y+1,10,8);
      ctx.fillStyle=COL.P2; ctx.fillRect(x+6,y+2,8,3);
      ctx.fillStyle=COL.P1; ctx.fillRect(x+3,y+8,14,7);
      // Brazos
      ctx.fillStyle=COL.P2;
      if (enE) { ctx.fillRect(x,y+8,3,4); ctx.fillRect(x+17,y+8,3,4); }
      else if (m===0) { ctx.fillRect(x+1,y+9,3,5); ctx.fillRect(x+16,y+7,3,5); }
      else            { ctx.fillRect(x+1,y+7,3,5); ctx.fillRect(x+16,y+9,3,5); }
      // Piernas
      ctx.fillStyle=COL.P1;
      if (enE) { ctx.fillRect(x+6,y+14,4,5); ctx.fillRect(x+10,y+14,4,5); }
      else if (m===0) { ctx.fillRect(x+4,y+14,5,5); ctx.fillRect(x+11,y+14,4,4); }
      else            { ctx.fillRect(x+4,y+14,4,4); ctx.fillRect(x+11,y+14,5,5); }
      // Ojos
      ctx.fillStyle=COL.PDARK;
      ctx.fillRect(x+7,y+3,2,2); ctx.fillRect(x+11,y+3,2,2);
      ctx.fillStyle='#ffffff88';
      ctx.fillRect(x+7,y+3,1,1); ctx.fillRect(x+11,y+3,1,1);
      ctx.fillStyle=COL.PDARK; ctx.fillRect(x+8,y+7,4,1);
    }

    // Banner
    ctx.font='9px monospace';
    if (itemsLeft===0) {
      ctx.fillStyle='rgba(212,131,26,0.92)';
      ctx.fillRect(canvas.width/2-95,1,190,15);
      ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.fillText('¡Llevá todo a la cocina 🍔! (abajo izquierda)',canvas.width/2,3);
    } else {
      ctx.fillStyle='rgba(0,0,0,0.6)';
      ctx.fillRect(canvas.width-96,1,95,14);
      ctx.fillStyle='#3dbfb8'; ctx.textAlign='right'; ctx.textBaseline='top';
      ctx.fillText('🍔 ×'+itemsLeft+' pendientes',canvas.width-2,3);
    }

    if (estado==='pausa') {
      ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#3dbfb8'; ctx.font='bold 26px Righteous,cursive';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('PAUSA',canvas.width/2,canvas.height/2);
    }
    if (estado==='fin') drawFin();
  }

  function drawFin() {
    ctx.fillStyle='rgba(0,0,0,0.87)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#ff4d4d'; ctx.font='bold 28px Righteous,cursive';
    ctx.fillText('GAME OVER',canvas.width/2,canvas.height/2-54);
    ctx.fillStyle='#3dbfb8'; ctx.font='bold 17px Righteous,cursive';
    ctx.fillText('Puntos: '+score,canvas.width/2,canvas.height/2-16);
    ctx.fillStyle='#d4831a'; ctx.font='13px Righteous,cursive';
    ctx.fillText('Récord: '+hiScore,canvas.width/2,canvas.height/2+10);
    ctx.fillText('Nivel: '+nivel,canvas.width/2,canvas.height/2+30);
    ctx.fillStyle='#555'; ctx.font='10px monospace';
    ctx.fillText('Tocá Reiniciar para jugar de nuevo',canvas.width/2,canvas.height/2+60);
  }

  // ── Loop ─────────────────────────────────────────────────────────────────
  function loop(ts) {
    if (estado!=='jugando') return;
    const dt=Math.min(ts-lastTs,80); lastTs=ts;
    animTimer+=dt; if(animTimer>200){animTimer=0;animFrame=(animFrame+1)%2;}
    moverP(dt); moverEne(dt); checkItems(); checkCocina(); draw();
    loopId=requestAnimationFrame(loop);
  }

  function fin() {
    estado='fin'; cancelAnimationFrame(loopId);
    if(score>hiScore){ hiScore=score; localStorage.setItem('runHiC',hiScore); }
    draw();
    // Limpiar puntaje de sesión (no el récord)
    score=0; hud();
    if(typeof window.actualizarBarraRecompensa==='function') window.actualizarBarraRecompensa();
  }

  // ── HUD / Toast ──────────────────────────────────────────────────────────
  function hud() {
    const upd=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    upd('runScore',score); upd('runHi',hiScore);
    upd('runLives','❤️'.repeat(Math.max(vidas,0))); upd('runLevel',nivel);
  }
  let _tt=null;
  function toast(msg) {
    if(typeof window.showToast==='function'){window.showToast(msg);return;}
    const el=document.getElementById('runToast');
    if(!el) return;
    el.textContent=msg; el.style.opacity='1';
    clearTimeout(_tt); _tt=setTimeout(()=>{if(el)el.style.opacity='0';},2000);
  }

  // ── Controles ────────────────────────────────────────────────────────────
  function onKD(e){
    if(estado!=='jugando') return;
    keysDown[e.key]=true;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
    if(e.key==='b'||e.key==='B') window.runFreeze();
  }
  function onKU(e){delete keysDown[e.key];}
  function onTS(e){if(e.touches.length)touchSt={x:e.touches[0].clientX,y:e.touches[0].clientY};}
  function onTE(e){
    if(!touchSt||estado!=='jugando'){touchSt=null;return;}
    const dx=e.changedTouches[0].clientX-touchSt.x, dy=e.changedTouches[0].clientY-touchSt.y;
    touchSt=null;
    if(Math.abs(dx)<10&&Math.abs(dy)<10) return;
    if(Math.abs(dy)>Math.abs(dx)){P.dy=dy>0?1:-1;P.dx=0;}
    else{P.dx=dx>0?1:-1;P.dy=0;}
    pTimer=P_SPD;
  }

  window.setRunDificultad = function(nivel) {
    runDificultad = Math.max(0, Math.min(4, nivel));
  };

  window.runFreeze = function() {
    if (estado !== 'jugando') return;
    if (freezeUsosRestantes <= 0) { toast('❄️ Sin usos disponibles'); return; }
    freezeTimer = FREEZE_DUR;
    if (FREEZE_USOS > 0) { freezeUsosRestantes--; }
    _actualizarBtnFreeze();
    const seg = (FREEZE_DUR / 1000).toFixed(1);
    toast('❄️ ¡Congelados! ' + seg + 's' + (FREEZE_USOS > 0 ? ' · ' + freezeUsosRestantes + ' restantes' : ''));
  };

  window.runMoverIzq    =function(){if(estado==='jugando'){P.dx=-1;P.dy=0;pTimer=P_SPD;}};
  window.runMoverDer    =function(){if(estado==='jugando'){P.dx= 1;P.dy=0;pTimer=P_SPD;}};
  window.runMoverArriba =function(){if(estado==='jugando'){P.dy=-1;P.dx=0;pTimer=P_SPD;}};
  window.runMoverAbajo  =function(){if(estado==='jugando'){P.dy= 1;P.dx=0;pTimer=P_SPD;}};

  window.runPause=function(){
    if(estado==='jugando'){estado='pausa';draw();}
    else if(estado==='pausa'){estado='jugando';lastTs=performance.now();loopId=requestAnimationFrame(loop);}
    const btn=document.getElementById('btnRunPausa');
    if(btn)btn.textContent=estado==='pausa'?'▶ Reanudar':'⏸ Pausa';
  };

  window.runReset=function(){
    cancelAnimationFrame(loopId); keysDown={};
    score=0;vidas=3;nivel=1;estado='jugando';completando=false;freezeTimer=0;_resetFreezeUsos();
    animFrame=0;animTimer=0;
    genNivel(nivel); hud();
    const btnP=document.getElementById('btnRunPausa');
    if(btnP) btnP.textContent='⏸ Pausa';
    const btnF=document.getElementById('btnRunFreeze');
    if(btnF){btnF.style.opacity='1';btnF.style.pointerEvents='';}
    lastTs=performance.now(); loopId=requestAnimationFrame(loop);
  };

  window.runInit=function(){
    canvas=document.getElementById('runCanvas');
    if(!canvas){console.error('[runInit] #runCanvas no encontrado');return;}
    ctx=canvas.getContext('2d');
    hiScore=parseInt(localStorage.getItem('runHiC')||'0');
    // Cargar config freeze si fue seteada por el vendedor antes del init
    // (window.setRunFreezeConfig ya pudo haber sido llamado por vendedor-juegos-config.js)
    _resetFreezeUsos();
    document.removeEventListener('keydown',onKD);
    document.removeEventListener('keyup',onKU);
    canvas.removeEventListener('touchstart',onTS);
    canvas.removeEventListener('touchend',onTE);
    document.addEventListener('keydown',onKD);
    document.addEventListener('keyup',onKU);
    canvas.addEventListener('touchstart',onTS,{passive:true});
    canvas.addEventListener('touchend',onTE);
    window.runReset();
  };

  Object.defineProperty(window,'runRunning',{get:()=>estado==='jugando',configurable:true,enumerable:true});

})();
