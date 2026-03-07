// ===================== MORDELÓN RUN =====================
// Estilo Lode Runner pixel art — ingredientes → cocina
// Controles: ←→↑↓ / WASD / swipe táctil / botones on-screen

(function() {

  // ── Constantes ───────────────────────────────────────────────────────────
  const COLS = 20;
  const ROWS = 16;
  const TILE = 20; // canvas = 400×320

  // Tipos de celda
  const T = { VACIO: 0, SUELO: 1, ESCALERA: 2, COCINA: 3 };

  // Ingredientes
  const INGREDIENTES = [
    { emoji: '🍞', color: '#D4A056' },
    { emoji: '🥩', color: '#C0392B' },
    { emoji: '🍅', color: '#E74C3C' },
    { emoji: '🥬', color: '#27AE60' },
  ];

  const C = {
    BG:       '#0a0a0a',
    SUELO:    '#1e3a3a',
    SUELO_B:  '#3dbfb8',
    ESCALERA: '#3dbfb8',
    COCINA:   '#d4831a',
    COCINA_B: '#ffaa33',
    PLAYER:   '#3dbfb8',
    ENEMY:    '#ff4d4d',
  };

  // ── Estado ───────────────────────────────────────────────────────────────
  let canvas, ctx;
  let runRunning  = false;
  let runPaused   = false;
  let runScore    = 0;
  let runHiScore  = 0;
  let runLives    = 3;
  let runLevel    = 1;
  let runLoopId   = null;
  let runLastTime = 0;
  let runGameOver = false;

  // El jugador ocupa UNA celda. Está "parado" cuando hay suelo en (row+1, col).
  let player = { col: 2, row: 1, dx: 0, dy: 0, dead: false, respawnTimer: 0 };
  let playerMoveTimer = 0;
  const PLAYER_SPEED = 150; // ms por paso

  let grid    = []; // grid[row][col] = T.*
  let items   = []; // { col, row, type, collected }
  let enemies = []; // { col, row, dir, timer, speed }
  let itemsLeft = 0;

  let touchStart = null;
  let keysDown   = {};

  // ── Helpers de grilla ────────────────────────────────────────────────────
  function celda(r, c)       { return (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? grid[r][c] : T.SUELO; }
  function esSolido(r, c)    { const t = celda(r, c); return t === T.SUELO || t === T.COCINA; }
  function esEscalera(r, c)  { return celda(r, c) === T.ESCALERA; }
  function puedeParar(r, c)  { return esSolido(r + 1, c) || esEscalera(r, c) || esEscalera(r + 1, c); }

  // ── Generación de nivel ──────────────────────────────────────────────────
  function generarNivel(nivel) {
    // Inicializar grilla vacía
    grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(T.VACIO));

    // Suelo inferior completo
    for (let c = 0; c < COLS; c++) grid[ROWS - 1][c] = T.SUELO;

    // Paredes laterales
    for (let r = 0; r < ROWS; r++) {
      grid[r][0]        = T.SUELO;
      grid[r][COLS - 1] = T.SUELO;
    }

    // ── Plataformas con diseño garantizado ──────────────────────────────
    // Cada plataforma ocupa MEDIO ancho y alterna lado izq/der.
    // Esto garantiza que siempre hay un pasaje abierto en el lado opuesto.
    // Layout de columnas jugables: 1..COLS-2 (18 cols)
    // Mitad izquierda:  cols 1..10   Mitad derecha: cols 9..18
    // El hueco de paso queda en cols 11-18 (izq) o cols 1-8 (der)
    const filasPlataforma = [];
    for (let r = ROWS - 4; r >= 3; r -= 3) filasPlataforma.push(r);

    filasPlataforma.forEach((r, i) => {
      const ladoIzq = (i % 2 === 0); // alternar lado cada fila
      // La plataforma va de un extremo hasta ~60% del ancho, dejando ~40% libre
      const anchoPlat = 10 + Math.floor(Math.random() * 3); // 10-12 celdas
      if (ladoIzq) {
        // Plataforma pegada a la pared izquierda, hueco a la derecha
        for (let c = 1; c <= anchoPlat; c++) grid[r][c] = T.SUELO;
      } else {
        // Plataforma pegada a la pared derecha, hueco a la izquierda
        for (let c = COLS - 1 - anchoPlat; c <= COLS - 2; c++) grid[r][c] = T.SUELO;
      }
    });

    // ── Escaleras garantizadas ───────────────────────────────────────────
    // Entre cada par de pisos adyacentes colocamos UNA escalera en el extremo
    // de la plataforma (donde termina), garantizando siempre acceso.
    const todasFilas = [ROWS - 1, ...filasPlataforma].sort((a, b) => b - a);

    for (let i = 0; i < todasFilas.length - 1; i++) {
      const rAbajo  = todasFilas[i];
      const rArriba = todasFilas[i + 1];
      const ladoIzq = ((filasPlataforma.indexOf(rArriba)) % 2 === 0);

      // La escalera va en el extremo libre de la plataforma superior
      // (donde NO está la pared) para no obstruir el paso horizontal
      let escCol;
      if (ladoIzq) {
        // Plataforma izq → escalera en el borde derecho de la plataforma (col ~anchoPlat)
        // Buscar la última col de suelo en rArriba
        let lastSuelo = 1;
        for (let c = 1; c < COLS - 1; c++) { if (grid[rArriba][c] === T.SUELO) lastSuelo = c; }
        escCol = Math.max(2, lastSuelo - 1 - Math.floor(Math.random() * 2));
      } else {
        // Plataforma der → escalera en el borde izquierdo de la plataforma
        let firstSuelo = COLS - 2;
        for (let c = COLS - 2; c >= 1; c--) { if (grid[rArriba][c] === T.SUELO) firstSuelo = c; }
        escCol = Math.min(COLS - 3, firstSuelo + 1 + Math.floor(Math.random() * 2));
      }

      // Asegurar que escCol tenga suelo en rAbajo (para que la escalera llegue al piso inferior)
      if (grid[rAbajo][escCol] !== T.SUELO) {
        // Buscar la col de suelo más cercana en rAbajo
        let mejor = escCol, menorDist = 999;
        for (let c = 1; c < COLS - 1; c++) {
          if (grid[rAbajo][c] === T.SUELO && Math.abs(c - escCol) < menorDist) {
            menorDist = Math.abs(c - escCol);
            mejor = c;
          }
        }
        escCol = mejor;
      }

      // Trazar escalera desde justo encima de rAbajo hasta rArriba (inclusive)
      for (let r = rArriba; r < rAbajo; r++) {
        if (grid[r][escCol] === T.VACIO) grid[r][escCol] = T.ESCALERA;
      }
    }

    // Cocina en suelo inferior col 2
    grid[ROWS - 1][2] = T.COCINA;

    // Ingredientes en celdas vacías donde el jugador puede pararse
    items = [];
    const cantIngredientes = 4 + (nivel - 1) * 2;
    let intentos = 0;
    while (items.length < cantIngredientes && intentos < 1000) {
      intentos++;
      const r = 1 + Math.floor(Math.random() * (ROWS - 2));
      const c = 1 + Math.floor(Math.random() * (COLS - 2));
      if (grid[r][c] !== T.VACIO) continue;
      if (!puedeParar(r, c)) continue;
      // Evitar zona de spawn y cocina
      if (c <= 4 && r >= ROWS - 3) continue;
      if (c === 2 && r === ROWS - 2) continue;
      if (items.find(it => it.col === c && it.row === r)) continue;
      items.push({ col: c, row: r, type: Math.floor(Math.random() * INGREDIENTES.length), collected: false });
    }
    itemsLeft = items.length;

    // Enemigos
    enemies = [];
    const cantEnemigos = Math.min(1 + Math.floor((nivel - 1) / 2), 5);
    const baseSpeed    = Math.max(400 - (nivel - 1) * 25, 180);
    for (let i = 0; i < cantEnemigos; i++) {
      const r = filasPlataforma.length > 0
        ? filasPlataforma[Math.floor(Math.random() * filasPlataforma.length)] - 1
        : ROWS - 2;
      const cols = [];
      for (let c = 2; c < COLS - 2; c++) {
        if (grid[r][c] === T.VACIO && esSolido(r + 1, c)) cols.push(c);
      }
      if (cols.length === 0) continue;
      const c = cols[Math.floor(Math.random() * cols.length)];
      enemies.push({ col: c, row: r, dir: Math.random() < 0.5 ? 1 : -1, timer: 0, speed: baseSpeed + Math.random() * 60 });
    }

    // Jugador en fila ROWS-2, col 5
    player = { col: 5, row: ROWS - 2, dx: 0, dy: 0, dead: false, respawnTimer: 0 };
    playerMoveTimer = 0;
  }

  // ── Movimiento jugador ───────────────────────────────────────────────────
  function moverJugador(dt) {
    if (player.dead) {
      player.respawnTimer -= dt;
      if (player.respawnTimer <= 0) respawnPlayer();
      return;
    }

    // Leer input
    let dx = 0, dy = 0;
    if (keysDown['ArrowLeft']  || keysDown['a'] || keysDown['A']) dx = -1;
    if (keysDown['ArrowRight'] || keysDown['d'] || keysDown['D']) dx =  1;
    if (keysDown['ArrowUp']    || keysDown['w'] || keysDown['W']) dy = -1;
    if (keysDown['ArrowDown']  || keysDown['s'] || keysDown['S']) dy =  1;
    if (player.dx !== 0) { dx = player.dx; }
    if (player.dy !== 0) { dy = player.dy; }
    if (dy !== 0) dx = 0; // dy tiene prioridad

    playerMoveTimer += dt;
    if (playerMoveTimer < PLAYER_SPEED) return;
    playerMoveTimer = 0;
    player.dx = 0;
    player.dy = 0;

    const { col, row } = player;
    const enEscalera = esEscalera(row, col);

    // Gravedad: si no puede pararse y no está en escalera → caer
    if (!puedeParar(row, col) && !enEscalera) {
      const nr = row + 1;
      if (nr < ROWS - 1 && !esSolido(nr, col)) {
        player.row = nr;
        return;
      }
    }

    // Movimiento vertical en escalera
    if (dy !== 0 && enEscalera) {
      const nr = row + dy;
      if (nr >= 0 && nr < ROWS && !esSolido(nr, col)) {
        player.row = nr;
        return;
      }
    }

    // Subir a escalera desde suelo
    if (dy === -1 && esSolido(row + 1, col) && esEscalera(row, col)) {
      const nr = row - 1;
      if (nr >= 0 && !esSolido(nr, col)) {
        player.row = nr;
        return;
      }
    }

    // Bajar a escalera desde suelo
    if (dy === 1 && esSolido(row + 1, col) && esEscalera(row + 1, col)) {
      player.row = row + 1;
      return;
    }

    // Movimiento horizontal
    if (dx !== 0 && dy === 0) {
      const nc = col + dx;
      if (nc > 0 && nc < COLS - 1 && !esSolido(row, nc)) {
        player.col = nc;
        // Caída inmediata si no hay soporte
        let r2 = row;
        while (r2 + 1 < ROWS - 1 && !esSolido(r2 + 1, nc) && !esEscalera(r2, nc)) r2++;
        if (r2 !== row) player.row = r2;
      }
    }
  }

  // ── Recolectar y cocina ───────────────────────────────────────────────────
  function checkRecolectar() {
    const idx = items.findIndex(it => !it.collected && it.col === player.col && it.row === player.row);
    if (idx === -1) return;
    items[idx].collected = true;
    itemsLeft--;
    runScore += 10 * runLevel;
    actualizarHUD();
    showToastRun(INGREDIENTES[items[idx].type].emoji + ' +' + (10 * runLevel) + ' pts');
  }

  function checkCocina() {
    if (itemsLeft > 0) return;
    // Jugador en la celda encima de la cocina (ROWS-2, col 2)
    if (player.col === 2 && player.row === ROWS - 2) nivelCompletado();
  }

  // ── Enemigos ──────────────────────────────────────────────────────────────
  function moverEnemigos(dt) {
    enemies.forEach(e => {
      e.timer += dt;
      if (e.timer < e.speed) return;
      e.timer = 0;
      const nc = e.col + e.dir;
      if (nc <= 0 || nc >= COLS - 1 || esSolido(e.row, nc) || !esSolido(e.row + 1, nc)) {
        e.dir *= -1;
      } else {
        e.col = nc;
      }
      if (e.col === player.col && e.row === player.row && !player.dead) matarJugador();
    });
  }

  // ── Vida / nivel ──────────────────────────────────────────────────────────
  function matarJugador() {
    if (player.dead) return;
    player.dead = true;
    player.respawnTimer = 1500;
    runLives--;
    actualizarHUD();
    if (runLives <= 0) setTimeout(gameOver, 900);
  }

  function respawnPlayer() {
    player = { col: 5, row: ROWS - 2, dx: 0, dy: 0, dead: false, respawnTimer: 0 };
    playerMoveTimer = 0;
  }

  function nivelCompletado() {
    const bonus = 50 * runLevel;
    runScore += bonus;
    runLevel++;
    actualizarHUD();
    showToastRun('🎉 ¡Nivel ' + (runLevel - 1) + ' completado! +' + bonus + ' pts');
    setTimeout(() => generarNivel(runLevel), 800);
  }

  function gameOver() {
    runGameOver = true;
    runRunning  = false;
    cancelAnimationFrame(runLoopId);
    if (runScore > runHiScore) {
      runHiScore = runScore;
      localStorage.setItem('runHiC', runHiScore);
    }
    dibujarPantallaFin();
    if (typeof window.actualizarBarraRecompensa === 'function') window.actualizarBarraRecompensa();
  }

  // ── Dibujo ────────────────────────────────────────────────────────────────
  function dibujar() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = C.BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * TILE, y = r * TILE, t = grid[r][c];
        if (t === T.SUELO) {
          ctx.fillStyle = C.SUELO;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = C.SUELO_B;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else if (t === T.ESCALERA) {
          ctx.strokeStyle = C.ESCALERA;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x + 5, y); ctx.lineTo(x + 5, y + TILE); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 15, y); ctx.lineTo(x + 15, y + TILE); ctx.stroke();
          ctx.lineWidth = 1;
          for (let py = 3; py < TILE; py += 5) {
            ctx.beginPath(); ctx.moveTo(x + 5, y + py); ctx.lineTo(x + 15, y + py); ctx.stroke();
          }
        } else if (t === T.COCINA) {
          ctx.fillStyle = C.COCINA;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = C.COCINA_B;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
          ctx.font = '12px serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText('🍔', x + TILE / 2, y + TILE / 2);
        }
      }
    }

    // Ingredientes
    items.forEach(it => {
      if (it.collected) return;
      const x = it.col * TILE, y = it.row * TILE, ing = INGREDIENTES[it.type];
      ctx.fillStyle = ing.color + '44';
      ctx.beginPath();
      ctx.arc(x + TILE / 2, y + TILE / 2, TILE / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '13px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ing.emoji, x + TILE / 2, y + TILE / 2);
    });

    // Enemigos
    enemies.forEach(e => {
      const x = e.col * TILE, y = e.row * TILE;
      ctx.fillStyle = C.ENEMY;
      ctx.fillRect(x + 4, y + 1, 12, 9);
      ctx.fillRect(x + 2, y + 9, 16, 7);
      ctx.fillRect(x + 3, y + 15, 4, 4);
      ctx.fillRect(x + 13, y + 15, 4, 4);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(x + 6, y + 3, 2, 2);
      ctx.fillRect(x + 12, y + 3, 2, 2);
    });

    // Jugador (parpadea al morir)
    if (!player.dead || Math.floor(Date.now() / 120) % 2 === 0) {
      const px = player.col * TILE, py = player.row * TILE;
      ctx.fillStyle = player.dead ? '#888' : C.PLAYER;
      ctx.fillRect(px + 5, py + 1, 10, 8);
      ctx.fillRect(px + 3, py + 8, 14, 7);
      ctx.fillRect(px + 2, py + 14, 5, 5);
      ctx.fillRect(px + 13, py + 14, 5, 5);
      ctx.fillStyle = '#0a3030';
      ctx.fillRect(px + 7, py + 3, 2, 2);
      ctx.fillRect(px + 11, py + 3, 2, 2);
      ctx.fillRect(px + 8, py + 7, 4, 1);
    }

    // Banner estado
    ctx.font = '8px monospace';
    if (itemsLeft === 0 && !runGameOver) {
      ctx.fillStyle = 'rgba(212,131,26,0.92)';
      ctx.fillRect(canvas.width / 2 - 82, 1, 164, 14);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('¡Llevá todo a la cocina 🍔! (col izq, abajo)', canvas.width / 2, 3);
    } else if (itemsLeft > 0 && !runGameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(canvas.width - 90, 1, 89, 13);
      ctx.fillStyle = '#3dbfb8'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('🍔 x' + itemsLeft + ' pendientes', canvas.width - 2, 3);
    }

    if (runPaused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#3dbfb8';
      ctx.font = 'bold 24px Righteous, cursive';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('PAUSA', canvas.width / 2, canvas.height / 2);
    }
  }

  function dibujarPantallaFin() {
    if (!ctx) return;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff4d4d';
    ctx.font = 'bold 26px Righteous, cursive';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 52);
    ctx.fillStyle = '#3dbfb8';
    ctx.font = 'bold 16px Righteous, cursive';
    ctx.fillText('Puntos: ' + runScore, canvas.width / 2, canvas.height / 2 - 18);
    ctx.fillStyle = '#d4831a';
    ctx.font = '13px Righteous, cursive';
    ctx.fillText('Récord: ' + runHiScore, canvas.width / 2, canvas.height / 2 + 10);
    ctx.fillText('Nivel alcanzado: ' + runLevel, canvas.width / 2, canvas.height / 2 + 30);
    ctx.fillStyle = '#555';
    ctx.font = '10px monospace';
    ctx.fillText('Tocá Reiniciar para jugar de nuevo', canvas.width / 2, canvas.height / 2 + 58);
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  function loop(ts) {
    if (!runRunning) return;
    const dt = Math.min(ts - runLastTime, 100);
    runLastTime = ts;
    if (!runPaused && !runGameOver) {
      moverJugador(dt);
      moverEnemigos(dt);
      checkRecolectar();
      checkCocina();
    }
    dibujar();
    runLoopId = requestAnimationFrame(loop);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  function actualizarHUD() {
    const s = document.getElementById('runScore');
    const h = document.getElementById('runHi');
    const l = document.getElementById('runLives');
    const v = document.getElementById('runLevel');
    if (s) s.textContent = runScore;
    if (h) h.textContent = runHiScore;
    if (l) l.textContent = '❤️'.repeat(Math.max(runLives, 0));
    if (v) v.textContent = runLevel;
  }

  let _toastTimer = null;
  function showToastRun(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    const el = document.getElementById('runToast');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { if (el) el.style.opacity = '0'; }, 2000);
  }

  // ── Controles ─────────────────────────────────────────────────────────────
  function _onKeyDown(e) {
    if (!runRunning || runGameOver) return;
    keysDown[e.key] = true;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
  }
  function _onKeyUp(e) { delete keysDown[e.key]; }

  function _onTouchStart(e) {
    if (e.touches.length === 0) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function _onTouchEnd(e) {
    if (!touchStart || !runRunning || runGameOver) { touchStart = null; return; }
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
    if (Math.abs(dy) > Math.abs(dx)) { player.dy = dy > 0 ? 1 : -1; player.dx = 0; }
    else { player.dx = dx > 0 ? 1 : -1; player.dy = 0; }
  }

  window.runMoverIzq    = function() { if (runRunning && !runGameOver) { player.dx = -1; player.dy = 0; playerMoveTimer = PLAYER_SPEED; } };
  window.runMoverDer    = function() { if (runRunning && !runGameOver) { player.dx =  1; player.dy = 0; playerMoveTimer = PLAYER_SPEED; } };
  window.runMoverArriba = function() { if (runRunning && !runGameOver) { player.dy = -1; player.dx = 0; playerMoveTimer = PLAYER_SPEED; } };
  window.runMoverAbajo  = function() { if (runRunning && !runGameOver) { player.dy =  1; player.dx = 0; playerMoveTimer = PLAYER_SPEED; } };

  window.runPause = function() {
    if (!runRunning || runGameOver) return;
    runPaused = !runPaused;
    const btn = document.getElementById('btnRunPausa');
    if (btn) btn.textContent = runPaused ? '▶ Reanudar' : '⏸ Pausa';
  };

  window.runReset = function() {
    cancelAnimationFrame(runLoopId);
    keysDown    = {};
    runScore    = 0;
    runLives    = 3;
    runLevel    = 1;
    runGameOver = false;
    runPaused   = false;
    generarNivel(runLevel);
    actualizarHUD();
    const btn = document.getElementById('btnRunPausa');
    if (btn) btn.textContent = '⏸ Pausa';
    runRunning  = true;
    runLastTime = performance.now();
    runLoopId   = requestAnimationFrame(loop);
  };

  window.runInit = function() {
    canvas = document.getElementById('runCanvas');
    if (!canvas) { console.error('[runInit] #runCanvas no encontrado'); return; }
    ctx = canvas.getContext('2d');
    runHiScore = parseInt(localStorage.getItem('runHiC') || '0');

    document.removeEventListener('keydown', _onKeyDown);
    document.removeEventListener('keyup',   _onKeyUp);
    canvas.removeEventListener('touchstart', _onTouchStart);
    canvas.removeEventListener('touchend',   _onTouchEnd);
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup',   _onKeyUp);
    canvas.addEventListener('touchstart', _onTouchStart, { passive: true });
    canvas.addEventListener('touchend',   _onTouchEnd);

    window.runReset();
  };

  Object.defineProperty(window, 'runRunning', {
    get: () => runRunning,
    configurable: true,
    enumerable: true
  });

})();
