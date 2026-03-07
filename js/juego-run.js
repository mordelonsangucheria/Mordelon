// ===================== MORDELÓN RUN =====================
// Estilo Lode Runner pixel art — ingredientes → cocina
// Controles: ←→↑↓ / WASD / swipe táctil

(function() {

  // ── Constantes visuales ──────────────────────────────────────────────────
  const COLS  = 20;
  const ROWS  = 16;
  const TILE  = 20; // px por celda (canvas = 400×320)

  // Tipos de celda
  const T = { VACIO: 0, SUELO: 1, ESCALERA: 2, COCINA: 3, ING: 4, ENEMIGO: 5 };

  // Ingredientes con color hex (aspecto real)
  const INGREDIENTES = [
    { emoji: '🍞', color: '#D4A056', nombre: 'Pan' },
    { emoji: '🥩', color: '#C0392B', nombre: 'Carne' },
    { emoji: '🍅', color: '#E74C3C', nombre: 'Tomate' },
    { emoji: '🥬', color: '#27AE60', nombre: 'Lechuga' },
  ];

  const C = {
    BG:       '#0a0a0a',
    SUELO:    '#1e3a3a',
    SUELO_B:  '#3dbfb8',   // borde turquesa
    ESCALERA: '#3dbfb8',
    COCINA:   '#d4831a',
    COCINA_B: '#ffaa33',
    PLAYER:   '#3dbfb8',
    ENEMY:    '#ff4d4d',
    TEXT:     '#3dbfb8',
    HUD_BG:   'rgba(0,0,0,0.7)',
  };

  // ── Estado del juego ─────────────────────────────────────────────────────
  let canvas, ctx;
  let runRunning    = false;
  let runPaused     = false;
  let runScore      = 0;
  let runHiScore    = 0;
  let runLives      = 3;
  let runLevel      = 1;
  let runLoopId     = null;
  let runLastTime   = 0;
  let runGameOver   = false;

  // Jugador
  let player = { col: 1, row: 1, dx: 0, dy: 0, onLadder: false, dead: false, respawnTimer: 0 };
  let playerMoveTimer = 0;
  const PLAYER_SPEED = 140; // ms por celda

  // Mapa y objetos
  let grid       = []; // grid[row][col] = T.*
  let items      = []; // { col, row, type: idx en INGREDIENTES, collected: bool }
  let enemies    = []; // { col, row, dir: 1|-1, moveTimer: 0, speed: ms }
  let itemsLeft  = 0;

  // Touch
  let touchStart = null;

  // ── Generación de nivel ──────────────────────────────────────────────────
  function generarNivel(nivel) {
    grid = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = new Array(COLS).fill(T.VACIO);
    }

    // Suelo en fila inferior
    for (let c = 0; c < COLS; c++) grid[ROWS - 1][c] = T.SUELO;

    // Pisos intermedios (aleatorios pero jugables)
    const pisos = Math.min(3 + Math.floor(nivel / 2), 6);
    const rowsDisponibles = [];
    for (let r = 3; r < ROWS - 2; r += 2) rowsDisponibles.push(r);

    // Shuffle rowsDisponibles
    for (let i = rowsDisponibles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rowsDisponibles[i], rowsDisponibles[j]] = [rowsDisponibles[j], rowsDisponibles[i]];
    }

    const pisosUsados = rowsDisponibles.slice(0, pisos);

    pisosUsados.forEach((r) => {
      // Piso de ancho variable, no ocupa toda la fila (deja huecos)
      const start = 1 + Math.floor(Math.random() * 4);
      const end   = COLS - 1 - Math.floor(Math.random() * 4);
      for (let c = start; c <= end; c++) grid[r][c] = T.SUELO;
    });

    // Asegurar paredes laterales (columnas 0 y COLS-1)
    for (let r = 0; r < ROWS; r++) {
      grid[r][0]       = T.SUELO;
      grid[r][COLS - 1] = T.SUELO;
    }

    // Escaleras — conectan pisos
    const allPisos = [ROWS - 1, ...pisosUsados].sort((a, b) => b - a); // de abajo a arriba
    allPisos.forEach((r, i) => {
      if (i === allPisos.length - 1) return;
      const rAbove = allPisos[i + 1];
      // Buscar columna que tenga suelo en r
      const candidatos = [];
      for (let c = 1; c < COLS - 1; c++) {
        if (grid[r][c] === T.SUELO) candidatos.push(c);
      }
      if (candidatos.length === 0) return;
      const col = candidatos[Math.floor(Math.random() * candidatos.length)];
      for (let rr = rAbove; rr <= r; rr++) {
        if (grid[rr][col] === T.VACIO) grid[rr][col] = T.ESCALERA;
      }
    });

    // Cocina en fila inferior, esquina izquierda accesible
    grid[ROWS - 1][2] = T.COCINA;

    // Ingredientes dispersos en pisos con suelo
    items = [];
    const cantIngredientes = 4 + nivel * 2;
    let intentos = 0;
    while (items.length < cantIngredientes && intentos < 500) {
      intentos++;
      const r = Math.floor(Math.random() * (ROWS - 2)) + 1;
      const c = Math.floor(Math.random() * (COLS - 2)) + 1;
      if (grid[r][c] === T.SUELO || (grid[r][c] === T.VACIO && grid[r + 1] && grid[r + 1][c] === T.SUELO)) {
        // Solo en suelo o flotando 1 celda encima de suelo
        if (grid[r][c] === T.SUELO) {
          const tipo = Math.floor(Math.random() * INGREDIENTES.length);
          // Evitar duplicar en misma celda
          if (!items.find(it => it.col === c && it.row === r)) {
            items.push({ col: c, row: r, type: tipo, collected: false });
          }
        }
      }
    }
    itemsLeft = items.filter(it => !it.collected).length;

    // Enemigos
    const cantEnemigos = Math.min(1 + Math.floor(nivel / 2), 5);
    const speedBase     = Math.max(350 - nivel * 20, 150);
    enemies = [];
    for (let i = 0; i < cantEnemigos; i++) {
      // Buscar fila de suelo aleatoria distinta de la primera
      const filaIdx = Math.floor(Math.random() * pisosUsados.length);
      const fila    = pisosUsados[filaIdx] ?? (ROWS - 2);
      // Buscar col con suelo en esa fila
      const cols = [];
      for (let c = 2; c < COLS - 2; c++) if (grid[fila][c] === T.SUELO) cols.push(c);
      if (cols.length === 0) continue;
      const col = cols[Math.floor(Math.random() * cols.length)];
      enemies.push({ col, row: fila, dir: Math.random() < 0.5 ? 1 : -1, moveTimer: 0, speed: speedBase + Math.random() * 80 });
    }

    // Posición inicial del jugador — fila inferior, col 4
    player = { col: 4, row: ROWS - 2, dx: 0, dy: 0, onLadder: false, dead: false, respawnTimer: 0 };

    // Asegurar suelo bajo el jugador
    if (grid[ROWS - 1][4] !== T.SUELO) grid[ROWS - 1][4] = T.SUELO;
    player.row = ROWS - 2;
    // Si no hay suelo inmediatamente debajo, bajar
    while (player.row < ROWS - 1 && grid[player.row + 1][player.col] === T.VACIO && grid[player.row + 1][player.col] !== T.SUELO) {
      player.row++;
    }
  }

  // ── Lógica de movimiento ─────────────────────────────────────────────────
  function celdaEs(r, c, tipo) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    return grid[r][c] === tipo;
  }

  function hayPiso(r, c) {
    return celdaEs(r, c, T.SUELO) || celdaEs(r, c, T.COCINA);
  }

  function moverJugador(dt) {
    if (player.dead) {
      player.respawnTimer -= dt;
      if (player.respawnTimer <= 0) respawnPlayer();
      return;
    }

    playerMoveTimer += dt;
    if (playerMoveTimer < PLAYER_SPEED) return;
    playerMoveTimer = 0;

    const { col, row, dx, dy } = player;
    const enEscalera = celdaEs(row, col, T.ESCALERA);

    // Gravedad: si no hay suelo debajo ni escalera, caer
    if (!hayPiso(row + 1, col) && !enEscalera && dy === 0) {
      const newRow = row + 1;
      if (newRow < ROWS) { player.row = newRow; return; }
    }

    // Intentar mover según input
    if (dy !== 0 && enEscalera) {
      const nr = row + dy;
      if (nr >= 0 && nr < ROWS) {
        if (grid[nr][col] !== T.SUELO && grid[nr][col] !== T.COCINA || dy < 0) {
          player.row = nr;
        }
      }
    } else if (dx !== 0) {
      const nc = col + dx;
      if (nc > 0 && nc < COLS - 1 && grid[row][nc] !== T.SUELO) {
        player.col = nc;
        // Aplicar gravedad si no hay soporte
        if (!hayPiso(row + 1, nc) && !celdaEs(row, nc, T.ESCALERA)) {
          let nr = row + 1;
          while (nr < ROWS - 1 && !hayPiso(nr, nc) && !celdaEs(nr, nc, T.ESCALERA)) nr++;
          player.row = nr;
        }
      }
    }

    // Recolectar ingrediente
    const itemIdx = items.findIndex(it => !it.collected && it.col === player.col && it.row === player.row);
    if (itemIdx !== -1) {
      items[itemIdx].collected = true;
      itemsLeft--;
      runScore += 10 * runLevel;
      actualizarHUD();
      showToastRun('🍔 +' + (10 * runLevel) + ' pts — ' + INGREDIENTES[items[itemIdx].type].nombre);
    }

    // Llegar a cocina con ingredientes
    if (celdaEs(player.row, player.col, T.COCINA) && itemsLeft === 0) {
      nivelCompletado();
    }

    // Colisión con enemigos
    if (enemies.some(e => e.col === player.col && e.row === player.row)) {
      matarJugador();
    }
  }

  function moverEnemigos(dt) {
    enemies.forEach(e => {
      e.moveTimer += dt;
      if (e.moveTimer < e.speed) return;
      e.moveTimer = 0;

      const nc = e.col + e.dir;
      // Rebotar en paredes o huecos
      if (nc <= 0 || nc >= COLS - 1 || grid[e.row][nc] === T.SUELO || !hayPiso(e.row + 1, nc)) {
        e.dir *= -1;
      } else {
        e.col = nc;
      }

      // Verificar colisión con jugador
      if (e.col === player.col && e.row === player.row && !player.dead) {
        matarJugador();
      }
    });
  }

  function matarJugador() {
    if (player.dead) return;
    player.dead = true;
    player.respawnTimer = 1200;
    runLives--;
    actualizarHUD();
    if (runLives <= 0) {
      setTimeout(gameOver, 800);
    }
  }

  function respawnPlayer() {
    player = { col: 4, row: ROWS - 2, dx: 0, dy: 0, onLadder: false, dead: false, respawnTimer: 0 };
    playerMoveTimer = 0;
  }

  function nivelCompletado() {
    const bonus = 50 * runLevel;
    runScore += bonus;
    runLevel++;
    actualizarHUD();
    showToastRun('🍔 ¡Nivel ' + (runLevel - 1) + ' completado! +' + bonus + ' pts bonus');
    setTimeout(() => {
      generarNivel(runLevel);
    }, 900);
  }

  function gameOver() {
    runGameOver = true;
    runRunning  = false;
    cancelAnimationFrame(runLoopId);

    // Guardar hi-score
    if (runScore > runHiScore) {
      runHiScore = runScore;
      localStorage.setItem('runHiC', runHiScore);
    }

    dibujarPantallaFin();

    // Notificar sistema de recompensas
    if (typeof window.actualizarBarraRecompensa === 'function') {
      window.actualizarBarraRecompensa();
    }
  }

  // ── Dibujo ───────────────────────────────────────────────────────────────
  function dibujar() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = C.BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * TILE;
        const y = r * TILE;
        const t = grid[r][c];

        if (t === T.SUELO) {
          ctx.fillStyle = C.SUELO;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = C.SUELO_B;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else if (t === T.ESCALERA) {
          // Escalera: dos rieles y peldaños
          ctx.strokeStyle = C.ESCALERA;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x + 5, y); ctx.lineTo(x + 5, y + TILE); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 15, y); ctx.lineTo(x + 15, y + TILE); ctx.stroke();
          ctx.lineWidth = 1;
          for (let py = 4; py < TILE; py += 6) {
            ctx.beginPath(); ctx.moveTo(x + 5, y + py); ctx.lineTo(x + 15, y + py); ctx.stroke();
          }
        } else if (t === T.COCINA) {
          ctx.fillStyle = C.COCINA;
          ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
          ctx.strokeStyle = C.COCINA_B;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
          // Ícono mini
          ctx.font = '11px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText('🍔', x + TILE / 2, y + TILE / 2);
        }
      }
    }

    // Ingredientes
    items.forEach(it => {
      if (it.collected) return;
      const x = it.col * TILE;
      const y = it.row * TILE;
      const ing = INGREDIENTES[it.type];
      // Fondo del ingrediente
      ctx.fillStyle = ing.color + '33';
      ctx.beginPath();
      ctx.arc(x + TILE / 2, y + TILE / 2, TILE / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ing.emoji, x + TILE / 2, y + TILE / 2);
    });

    // Enemigos
    enemies.forEach(e => {
      const x = e.col * TILE;
      const y = e.row * TILE;
      ctx.fillStyle = C.ENEMY;
      // Cuerpo enemigo pixel art simple
      ctx.fillRect(x + 4, y + 2, 12, 10); // cabeza/cuerpo
      ctx.fillRect(x + 2, y + 8, 16, 6);  // cuerpo inferior
      ctx.fillRect(x + 3, y + 14, 4, 4);  // pierna izq
      ctx.fillRect(x + 13, y + 14, 4, 4); // pierna der
      // Ojos
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(x + 6, y + 4, 2, 2);
      ctx.fillRect(x + 12, y + 4, 2, 2);
    });

    // Jugador
    if (!player.dead || Math.floor(Date.now() / 150) % 2 === 0) {
      const px = player.col * TILE;
      const py = player.row * TILE;
      // Pixel art personaje turquesa
      ctx.fillStyle = C.PLAYER;
      ctx.fillRect(px + 5, py + 1, 10, 9); // cabeza
      ctx.fillRect(px + 3, py + 9, 14, 7); // cuerpo
      ctx.fillRect(px + 2, py + 14, 5, 4); // pierna izq
      ctx.fillRect(px + 13, py + 14, 5, 4); // pierna der
      // Detalle cara
      ctx.fillStyle = '#0a3030';
      ctx.fillRect(px + 7, py + 3, 2, 2);
      ctx.fillRect(px + 11, py + 3, 2, 2);
      ctx.fillRect(px + 8, py + 7, 4, 1);
    }

    // HUD superpuesto (transparente)
    if (runPaused) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = C.TEXT;
      ctx.font = 'bold 22px Righteous, cursive';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PAUSA', canvas.width / 2, canvas.height / 2);
    }

    // Indicador ingredientes pendientes (mini)
    if (itemsLeft > 0 && !runGameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(canvas.width - 90, 2, 88, 16);
      ctx.fillStyle = '#3dbfb8';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('🍔 Ingredientes: ' + itemsLeft, canvas.width - 4, 4);
    } else if (itemsLeft === 0 && !runGameOver) {
      ctx.fillStyle = 'rgba(212,131,26,0.85)';
      ctx.fillRect(canvas.width / 2 - 70, 2, 140, 16);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('¡Llevá todo a la cocina! 🍔', canvas.width / 2, 4);
    }
  }

  function dibujarPantallaFin() {
    if (!ctx) return;
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#ff4d4d';
    ctx.font = 'bold 26px Righteous, cursive';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 50);

    ctx.fillStyle = '#3dbfb8';
    ctx.font = 'bold 16px Righteous, cursive';
    ctx.fillText('Puntos: ' + runScore, canvas.width / 2, canvas.height / 2 - 16);
    ctx.fillStyle = '#d4831a';
    ctx.font = '13px Righteous, cursive';
    ctx.fillText('Récord: ' + runHiScore, canvas.width / 2, canvas.height / 2 + 12);
    ctx.fillText('Nivel: ' + runLevel, canvas.width / 2, canvas.height / 2 + 32);

    ctx.fillStyle = '#3dbfb8';
    ctx.font = '11px monospace';
    ctx.fillText('Tocá Reiniciar para jugar de nuevo', canvas.width / 2, canvas.height / 2 + 60);
  }

  // ── Loop principal ───────────────────────────────────────────────────────
  function loop(ts) {
    if (!runRunning) return;
    const dt = ts - runLastTime;
    runLastTime = ts;

    if (!runPaused && !runGameOver) {
      moverJugador(Math.min(dt, 100));
      moverEnemigos(Math.min(dt, 100));
    }
    dibujar();
    runLoopId = requestAnimationFrame(loop);
  }

  // ── HUD externo ──────────────────────────────────────────────────────────
  function actualizarHUD() {
    const sEl = document.getElementById('runScore');
    const hEl = document.getElementById('runHi');
    const lEl = document.getElementById('runLives');
    const lvEl = document.getElementById('runLevel');
    if (sEl)  sEl.textContent  = runScore;
    if (hEl)  hEl.textContent  = runHiScore;
    if (lEl)  lEl.textContent  = '❤️'.repeat(Math.max(runLives, 0));
    if (lvEl) lvEl.textContent = runLevel;
  }

  // ── Toast interno ────────────────────────────────────────────────────────
  let _runToastTimer = null;
  function showToastRun(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    const el = document.getElementById('runToast');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(_runToastTimer);
    _runToastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2000);
  }

  // ── Controles teclado ────────────────────────────────────────────────────
  function _onKey(e) {
    if (!runRunning || runGameOver) return;
    switch (e.key) {
      case 'ArrowLeft':  case 'a': case 'A': player.dx = -1; player.dy = 0; break;
      case 'ArrowRight': case 'd': case 'D': player.dx =  1; player.dy = 0; break;
      case 'ArrowUp':    case 'w': case 'W': player.dx =  0; player.dy = -1; break;
      case 'ArrowDown':  case 's': case 'S': player.dx =  0; player.dy =  1; break;
    }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
  }

  // ── Controles táctiles ───────────────────────────────────────────────────
  function _onTouchStart(e) {
    if (e.touches.length === 0) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function _onTouchEnd(e) {
    if (!touchStart || !runRunning || runGameOver) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    const ab = Math.abs(dx), aby = Math.abs(dy);
    if (ab < 10 && aby < 10) { touchStart = null; return; }
    if (aby > ab) {
      player.dy = dy > 0 ? 1 : -1; player.dx = 0;
    } else {
      player.dx = dx > 0 ? 1 : -1; player.dy = 0;
    }
    touchStart = null;
  }

  // ── Botones on-screen ────────────────────────────────────────────────────
  window.runMoverIzq   = function() { if (runRunning && !runGameOver) { player.dx = -1; player.dy = 0; } };
  window.runMoverDer   = function() { if (runRunning && !runGameOver) { player.dx =  1; player.dy = 0; } };
  window.runMoverArriba = function() { if (runRunning && !runGameOver) { player.dx =  0; player.dy = -1; } };
  window.runMoverAbajo  = function() { if (runRunning && !runGameOver) { player.dx =  0; player.dy =  1; } };

  window.runPause = function() {
    if (!runRunning || runGameOver) return;
    runPaused = !runPaused;
    const btn = document.getElementById('btnRunPausa');
    if (btn) btn.textContent = runPaused ? '▶ Reanudar' : '⏸ Pausa';
  };

  window.runReset = function() {
    cancelAnimationFrame(runLoopId);
    runScore    = 0;
    runLives    = 3;
    runLevel    = 1;
    runGameOver = false;
    runPaused   = false;
    generarNivel(runLevel);
    actualizarHUD();
    runRunning  = true;
    runLastTime = performance.now();
    runLoopId   = requestAnimationFrame(loop);
    const btn = document.getElementById('btnRunPausa');
    if (btn) btn.textContent = '⏸ Pausa';
  };

  // ── Init principal ───────────────────────────────────────────────────────
  window.runInit = function() {
    canvas = document.getElementById('runCanvas');
    if (!canvas) { console.error('runCanvas no encontrado'); return; }
    ctx = canvas.getContext('2d');

    // Hi-score desde localStorage
    runHiScore = parseInt(localStorage.getItem('runHiC') || '0');

    // Limpiar listeners previos (por si se llama 2 veces)
    document.removeEventListener('keydown', _onKey);
    canvas.removeEventListener('touchstart', _onTouchStart);
    canvas.removeEventListener('touchend', _onTouchEnd);

    document.addEventListener('keydown', _onKey);
    canvas.addEventListener('touchstart', _onTouchStart, { passive: true });
    canvas.addEventListener('touchend', _onTouchEnd);

    // Arrancar
    window.runReset();
  };

  // Exponer running state para juego-selector.js
  Object.defineProperty(window, 'runRunning', {
    get: () => runRunning,
    configurable: true
  });

})();
