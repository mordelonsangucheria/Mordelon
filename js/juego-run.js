// ===================== MORDELÓN RUN =====================
// Estilo Lode Runner — ingredientes → cocina — física basada en celdas
(function () {

  // ── Constantes ─────────────────────────────────────────────────────────
  const COLS = 20, ROWS = 16, TILE = 20;

  // Tipos de celda
  const T = { VACIO: 0, SUELO: 1, ESC: 2, COCINA: 3 };

  const ING = [
    { e: '🍞', c: '#D4A056' },
    { e: '🥩', c: '#C0392B' },
    { e: '🍅', c: '#E74C3C' },
    { e: '🥬', c: '#27AE60' },
  ];

  // Paleta
  const COL = {
    BG: '#0a0a0a', SUELO: '#17302f', SUELO_TOP: '#3dbfb8',
    ESC: '#3dbfb8', COCINA: '#d4831a', COCINA_B: '#ffaa33',
    P1: '#3dbfb8', P2: '#1a7a75', PDARK: '#0a3030',
    ENE: '#e03535', ENE2: '#8b0000',
  };

  // ── Estado global ───────────────────────────────────────────────────────
  let canvas, ctx;
  let estado = 'parado'; // 'jugando' | 'pausa' | 'fin' | 'parado'
  let score = 0, hiScore = 0, vidas = 3, nivel = 1;
  let loopId = null, lastTs = 0;

  let grid = [];
  let items = [];
  let enemies = [];
  let itemsLeft = 0;

  // Jugador: posición en celdas, con subpíxel para animación suave
  let P = { col: 5, row: 14, dx: 0, dy: 0, dead: false, deadTimer: 0 };
  let pTimer = 0;
  const P_SPD = 140; // ms por celda

  let keysDown = {}, touchSt = null;
  let animFrame = 0, animTimer = 0; // para animar el personaje

  // ── Helpers ─────────────────────────────────────────────────────────────
  function g(r, c) { return (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? grid[r][c] : T.SUELO; }
  function solido(r, c) { const t = g(r, c); return t === T.SUELO || t === T.COCINA; }
  function escalera(r, c) { return g(r, c) === T.ESC; }

  // El jugador "puede pararse" en (r,c) si:
  //   - hay suelo/cocina debajo, O
  //   - está en una celda de escalera
  function parado(r, c) { return solido(r + 1, c) || escalera(r, c); }

  // ── Generación de nivel ─────────────────────────────────────────────────
  function genNivel(n) {
    grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(T.VACIO));

    // Suelo inferior y paredes
    for (let c = 0; c < COLS; c++) grid[ROWS - 1][c] = T.SUELO;
    for (let r = 0; r < ROWS; r++) { grid[r][0] = T.SUELO; grid[r][COLS - 1] = T.SUELO; }

    // Plataformas: diseño alternado izq/der estilo Lode Runner
    // Filas de plataforma: ROWS-4, ROWS-7, ROWS-10, ROWS-13 (si cabe)
    const platRows = [];
    for (let r = ROWS - 4; r >= 3; r -= 3) platRows.push(r);

    platRows.forEach((r, i) => {
      const izq = (i % 2 === 0);
      // Plataforma ocupa ~12 celdas del lado correspondiente
      const largo = 10 + Math.floor(Math.random() * 3);
      if (izq) {
        for (let c = 1; c <= largo; c++) grid[r][c] = T.SUELO;
      } else {
        for (let c = COLS - 1 - largo; c <= COLS - 2; c++) grid[r][c] = T.SUELO;
      }
    });

    // Cocina (siempre accesible en suelo izq inferior)
    grid[ROWS - 1][2] = T.COCINA;

    // ── Escaleras ──────────────────────────────────────────────────────────
    // Entre cada par de pisos adyacentes ponemos UNA escalera.
    // La escalera ocupa las celdas VACÍAS entre la plataforma superior y la inferior.
    // Para que el jugador pueda usarla:
    //   - La escalera empieza en la fila justo ENCIMA del piso inferior (row_inf - 1)
    //   - La escalera termina en la fila del piso superior (row_sup)
    //   - La columna de la escalera es una columna de suelo en el piso INFERIOR
    //     que también sea ACCESIBLE desde el lado libre del piso superior
    const pisos = [ROWS - 1, ...platRows].sort((a, b) => b - a); // de abajo a arriba

    for (let i = 0; i < pisos.length - 1; i++) {
      const rInf = pisos[i];
      const rSup = pisos[i + 1];
      const izqSup = (platRows.indexOf(rSup) % 2 === 0);

      // Elegir columna: borde del lado libre del piso superior,
      // que tenga suelo en piso inferior
      let escCol = -1;

      if (izqSup) {
        // Plataforma sup va por la izquierda → escalera en extremo derecho de plataforma
        // (última columna de suelo de rSup)
        let lastC = -1;
        for (let c = 1; c < COLS - 1; c++) if (grid[rSup][c] === T.SUELO) lastC = c;
        // Columna de la escalera: lastC (borde derecho de plataforma sup)
        // Verificar que rInf tenga suelo en esa col (o buscar la más cercana)
        if (lastC !== -1) {
          if (grid[rInf][lastC] === T.SUELO) {
            escCol = lastC;
          } else {
            // Buscar col de suelo en rInf más cercana a lastC
            let mejor = -1, dist = 999;
            for (let c = 1; c < COLS - 1; c++) {
              if (grid[rInf][c] === T.SUELO && Math.abs(c - lastC) < dist) {
                dist = Math.abs(c - lastC); mejor = c;
              }
            }
            escCol = mejor;
          }
        }
      } else {
        // Plataforma sup va por la derecha → escalera en extremo izquierdo
        let firstC = -1;
        for (let c = COLS - 2; c >= 1; c--) if (grid[rSup][c] === T.SUELO) firstC = c;
        if (firstC !== -1) {
          if (grid[rInf][firstC] === T.SUELO) {
            escCol = firstC;
          } else {
            let mejor = -1, dist = 999;
            for (let c = 1; c < COLS - 1; c++) {
              if (grid[rInf][c] === T.SUELO && Math.abs(c - firstC) < dist) {
                dist = Math.abs(c - firstC); mejor = c;
              }
            }
            escCol = mejor;
          }
        }
      }

      if (escCol === -1) continue;

      // Colocar escalera desde rSup (inclusive) hasta rInf-1 (inclusive)
      // La celda rSup[escCol] es suelo → ponemos escalera ENCIMA (rSup - 1 hacia arriba no necesario)
      // En realidad: la escalera va desde rInf-1 bajando hasta rSup
      // rSup es suelo (plataforma superior) → la escalera conecta en la celda rSup
      // Para que el jugador pueda subir, necesita pararse en rSup-1 y bajar a rSup es suelo,
      // pero podemos poner la escalera EN rSup también (el jugador se para en rSup-1 con escalera ahí)

      // Trazar: desde rSup-1 hasta rInf-1 (ambas celdas vacías)
      // rSup-1: celda encima de la plataforma superior = punto de llegada al subir
      // rInf-1: celda encima de la plataforma inferior = punto de entrada desde abajo
      for (let r = rSup - 1; r >= 1 && r <= rInf - 1; r++) {
        // Solo en celdas vacías (no sobreescribir suelo)
        if (grid[r][escCol] === T.VACIO) grid[r][escCol] = T.ESC;
      }
      // También marcar la celda ENCIMA del suelo inferior como punto de entrada
      // rInf-1 ya está cubierto arriba
    }

    // ── Ingredientes ───────────────────────────────────────────────────────
    items = [];
    const cant = 4 + (n - 1) * 2;
    let intentos = 0;
    while (items.length < cant && intentos++ < 1500) {
      const r = 1 + Math.floor(Math.random() * (ROWS - 2));
      const c = 1 + Math.floor(Math.random() * (COLS - 2));
      if (grid[r][c] !== T.VACIO) continue;
      if (!parado(r, c)) continue;
      if (c <= 5 && r >= ROWS - 3) continue; // zona spawn
      if (items.find(it => it.col === c && it.row === r)) continue;
      items.push({ col: c, row: r, t: Math.floor(Math.random() * ING.length), ok: false });
    }
    itemsLeft = items.length;

    // ── Enemigos ───────────────────────────────────────────────────────────
    enemies = [];
    const nEne = Math.min(1 + Math.floor((n - 1) / 2), 5);
    const spd  = Math.max(380 - (n - 1) * 22, 160);
    platRows.forEach((pr, i) => {
      if (i >= nEne) return;
      const eRow = pr - 1;
      const cols = [];
      for (let c = 2; c < COLS - 2; c++) {
        if (grid[eRow][c] === T.VACIO && solido(eRow + 1, c)) cols.push(c);
      }
      if (!cols.length) return;
      const ec = cols[Math.floor(Math.random() * cols.length)];
      enemies.push({ col: ec, row: eRow, dir: i % 2 === 0 ? 1 : -1, timer: 0, spd: spd + Math.random() * 50 });
    });

    // Jugador
    P = { col: 5, row: ROWS - 2, dx: 0, dy: 0, dead: false, deadTimer: 0 };
    pTimer = 0;
  }

  // ── Movimiento jugador ──────────────────────────────────────────────────
  function moverP(dt) {
    if (P.dead) {
      P.deadTimer -= dt;
      if (P.deadTimer <= 0) respawn();
      return;
    }

    let dx = 0, dy = 0;
    if (keysDown['ArrowLeft']  || keysDown['a'] || keysDown['A']) dx = -1;
    if (keysDown['ArrowRight'] || keysDown['d'] || keysDown['D']) dx =  1;
    if (keysDown['ArrowUp']    || keysDown['w'] || keysDown['W']) dy = -1;
    if (keysDown['ArrowDown']  || keysDown['s'] || keysDown['S']) dy =  1;
    if (P.dx) dx = P.dx;
    if (P.dy) dy = P.dy;

    pTimer += dt;
    if (pTimer < P_SPD) return;
    pTimer = 0;
    P.dx = 0; P.dy = 0;

    const r = P.row, c = P.col;
    const enEsc   = escalera(r, c);
    const pisoAbj = solido(r + 1, c);
    const escArr  = escalera(r - 1, c); // escalera justo encima del jugador

    // ── GRAVEDAD ──
    if (!pisoAbj && !enEsc) {
      const nr = r + 1;
      if (nr < ROWS && !solido(nr, c)) { P.row = nr; return; }
    }

    // ── SUBIR (↑) ──
    if (dy === -1) {
      if (enEsc) {
        // En escalera → subir una celda
        const nr = r - 1;
        if (nr >= 0 && !solido(nr, c)) { P.row = nr; return; }
        return; // tope de escalera
      }
      if (pisoAbj && escArr) {
        // Parado en suelo y hay escalera justo encima → entrar a la escalera
        const nr = r - 1;
        if (nr >= 0 && !solido(nr, c)) { P.row = nr; return; }
      }
      // No puede subir → intentar moverse horizontalmente (no bloquear)
    }

    // ── BAJAR (↓) ──
    if (dy === 1) {
      if (enEsc) {
        // En escalera → bajar
        const nr = r + 1;
        if (nr < ROWS && !solido(nr, c)) { P.row = nr; return; }
        return; // fondo de escalera (suelo)
      }
      // Bajar desde suelo: si la escalera termina exactamente en r
      // (el jugador está parado en el piso y hay escalera que baja desde aquí)
      // Con nuestro sistema la escalera empieza en rInf-1 (celda vacía sobre suelo)
      // El jugador parado en rInf-1 tiene pisoAbj=true y enEsc=true → caso anterior
    }

    // ── HORIZONTAL ──
    if (dx !== 0) {
      const nc = c + dx;
      if (nc > 0 && nc < COLS - 1 && !solido(r, nc)) {
        P.col = nc;
        // Caída si no hay soporte en columna nueva
        if (!solido(r + 1, nc) && !escalera(r, nc)) {
          let fr = r + 1;
          while (fr < ROWS - 1 && !solido(fr, nc) && !escalera(fr, nc)) fr++;
          if (fr > r + 1) P.row = fr - 1;
          else if (!solido(fr, nc)) P.row = fr;
        }
        animFrame = (animFrame + 1) % 2;
        return;
      }
    }
  }

  function respawn() {
    P = { col: 5, row: ROWS - 2, dx: 0, dy: 0, dead: false, deadTimer: 0 };
    pTimer = 0;
  }

  // ── Enemigos ────────────────────────────────────────────────────────────
  function moverEne(dt) {
    enemies.forEach(e => {
      e.timer += dt;
      if (e.timer < e.spd) return;
      e.timer = 0;
      const nc = e.col + e.dir;
      if (nc <= 0 || nc >= COLS - 1 || solido(e.row, nc) || !solido(e.row + 1, nc)) {
        e.dir *= -1;
      } else {
        e.col = nc;
      }
      if (e.col === P.col && e.row === P.row && !P.dead) matarP();
    });
  }

  function matarP() {
    if (P.dead) return;
    P.dead = true; P.deadTimer = 1400;
    vidas--;
    hud();
    if (vidas <= 0) setTimeout(fin, 900);
  }

  // ── Check recolección y cocina ───────────────────────────────────────────
  function checkItems() {
    items.forEach(it => {
      if (it.ok) return;
      if (it.col === P.col && it.row === P.row) {
        it.ok = true; itemsLeft--;
        score += 10 * nivel; hud();
        toast(ING[it.t].e + ' +' + (10 * nivel) + ' pts');
      }
    });
  }

  function checkCocina() {
    if (itemsLeft > 0) return;
    if (P.col === 2 && P.row === ROWS - 2) {
      const bonus = 50 * nivel;
      score += bonus; nivel++;
      hud();
      toast('🎉 Nivel completado! +' + bonus + ' pts');
      setTimeout(() => genNivel(nivel), 800);
    }
  }

  // ── HUD y toast ──────────────────────────────────────────────────────────
  function hud() {
    const s = document.getElementById('runScore');
    const h = document.getElementById('runHi');
    const l = document.getElementById('runLives');
    const v = document.getElementById('runLevel');
    if (s) s.textContent = score;
    if (h) h.textContent = hiScore;
    if (l) l.textContent = '❤️'.repeat(Math.max(vidas, 0));
    if (v) v.textContent = nivel;
  }

  let _tt = null;
  function toast(msg) {
    if (typeof window.showToast === 'function') { window.showToast(msg); return; }
    const el = document.getElementById('runToast');
    if (!el) return;
    el.textContent = msg; el.style.opacity = '1';
    clearTimeout(_tt);
    _tt = setTimeout(() => { if (el) el.style.opacity = '0'; }, 2000);
  }

  // ── Dibujo ───────────────────────────────────────────────────────────────
  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COL.BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grilla
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * TILE, y = r * TILE, t = grid[r][c];
        if (t === T.SUELO) {
          // Bloques de suelo con borde luminoso en la parte superior
          ctx.fillStyle = COL.SUELO;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = COL.SUELO_TOP;
          ctx.fillRect(x, y, TILE, 3); // borde top turquesa
          ctx.fillStyle = '#0d2020';
          ctx.fillRect(x, y + TILE - 2, TILE, 2); // sombra bottom
        } else if (t === T.ESC) {
          // Escalera: dos rieles con peldaños
          ctx.strokeStyle = COL.ESC;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x + 5, y); ctx.lineTo(x + 5, y + TILE); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 15, y); ctx.lineTo(x + 15, y + TILE); ctx.stroke();
          ctx.lineWidth = 1.5;
          for (let py = 2; py < TILE; py += 5) {
            ctx.beginPath(); ctx.moveTo(x + 5, y + py); ctx.lineTo(x + 15, y + py); ctx.stroke();
          }
        } else if (t === T.COCINA) {
          // Cocina con gradiente naranja
          ctx.fillStyle = COL.COCINA;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = COL.COCINA_B;
          ctx.fillRect(x, y, TILE, 3);
          ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('🍔', x + TILE / 2, y + TILE / 2);
        }
      }
    }

    // Ingredientes
    items.forEach(it => {
      if (it.ok) return;
      const x = it.col * TILE + TILE / 2, y = it.row * TILE + TILE / 2;
      const ing = ING[it.t];
      // Halo de color
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = ing.c + '55';
      ctx.fill();
      ctx.strokeStyle = ing.c;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = '12px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ing.e, x, y);
    });

    // Enemigos — pixel art rojo simple
    enemies.forEach(e => {
      const x = e.col * TILE, y = e.row * TILE;
      // Cuerpo
      ctx.fillStyle = COL.ENE;
      ctx.fillRect(x + 3, y + 1, 14, 13); // cabeza-cuerpo
      ctx.fillRect(x + 2, y + 13, 16, 5); // cintura
      ctx.fillRect(x + 3, y + 17, 5, 3);  // pierna izq
      ctx.fillRect(x + 12, y + 17, 5, 3); // pierna der
      // Detalle oscuro
      ctx.fillStyle = COL.ENE2;
      ctx.fillRect(x + 6, y + 4, 3, 3);   // ojo izq
      ctx.fillRect(x + 11, y + 4, 3, 3);  // ojo der
      ctx.fillRect(x + 8, y + 9, 4, 2);   // boca
    });

    // Jugador — pixel art mejorado
    if (!P.dead || Math.floor(Date.now() / 100) % 2 === 0) {
      const x = P.col * TILE, y = P.row * TILE;
      const enEsc = escalera(P.row, P.col);
      const mov   = animFrame; // 0 o 1

      // ── Cuerpo principal ──
      // Casco/cabeza con detalle
      ctx.fillStyle = COL.P1;
      ctx.fillRect(x + 5, y + 1, 10, 8);   // cabeza
      ctx.fillStyle = COL.P2;
      ctx.fillRect(x + 6, y + 2, 8, 3);    // visera/frente
      ctx.fillStyle = COL.P1;
      ctx.fillRect(x + 3, y + 8, 14, 7);   // torso

      // Brazos (alternan con animación)
      ctx.fillStyle = COL.P2;
      if (enEsc) {
        // En escalera: brazos extendidos a los lados
        ctx.fillRect(x + 0, y + 8, 3, 4);
        ctx.fillRect(x + 17, y + 8, 3, 4);
      } else if (mov === 0) {
        ctx.fillRect(x + 1, y + 9, 3, 5);
        ctx.fillRect(x + 16, y + 7, 3, 5);
      } else {
        ctx.fillRect(x + 1, y + 7, 3, 5);
        ctx.fillRect(x + 16, y + 9, 3, 5);
      }

      // Piernas (alternan con animación)
      ctx.fillStyle = COL.P1;
      if (enEsc) {
        ctx.fillRect(x + 6, y + 14, 4, 5);
        ctx.fillRect(x + 10, y + 14, 4, 5);
      } else if (mov === 0) {
        ctx.fillRect(x + 4, y + 14, 5, 5);
        ctx.fillRect(x + 11, y + 14, 4, 4);
      } else {
        ctx.fillRect(x + 4, y + 14, 4, 4);
        ctx.fillRect(x + 11, y + 14, 5, 5);
      }

      // Ojos
      ctx.fillStyle = COL.PDARK;
      ctx.fillRect(x + 7, y + 3, 2, 2);
      ctx.fillRect(x + 11, y + 3, 2, 2);

      // Brillo en ojo
      ctx.fillStyle = '#ffffff88';
      ctx.fillRect(x + 7, y + 3, 1, 1);
      ctx.fillRect(x + 11, y + 3, 1, 1);

      // Sonrisa
      ctx.fillStyle = COL.PDARK;
      ctx.fillRect(x + 8, y + 7, 4, 1);
    }

    // Banner indicador
    ctx.font = '9px monospace';
    if (itemsLeft === 0) {
      ctx.fillStyle = 'rgba(212,131,26,0.92)';
      ctx.fillRect(canvas.width / 2 - 90, 1, 180, 15);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('¡Llevá todo a la cocina 🍔! (abajo izquierda)', canvas.width / 2, 3);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(canvas.width - 96, 1, 95, 14);
      ctx.fillStyle = '#3dbfb8'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('🍔 ×' + itemsLeft + ' pendientes', canvas.width - 2, 3);
    }

    if (estado === 'pausa') {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#3dbfb8';
      ctx.font = 'bold 26px Righteous, cursive';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('PAUSA', canvas.width / 2, canvas.height / 2);
    }

    if (estado === 'fin') drawFin();
  }

  function drawFin() {
    ctx.fillStyle = 'rgba(0,0,0,0.87)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff4d4d';
    ctx.font = 'bold 28px Righteous, cursive';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 54);
    ctx.fillStyle = '#3dbfb8';
    ctx.font = 'bold 17px Righteous, cursive';
    ctx.fillText('Puntos: ' + score, canvas.width / 2, canvas.height / 2 - 16);
    ctx.fillStyle = '#d4831a';
    ctx.font = '13px Righteous, cursive';
    ctx.fillText('Récord: ' + hiScore, canvas.width / 2, canvas.height / 2 + 10);
    ctx.fillText('Nivel: ' + nivel, canvas.width / 2, canvas.height / 2 + 30);
    ctx.fillStyle = '#555';
    ctx.font = '10px monospace';
    ctx.fillText('Tocá Reiniciar para jugar de nuevo', canvas.width / 2, canvas.height / 2 + 60);
  }

  // ── Loop ─────────────────────────────────────────────────────────────────
  function loop(ts) {
    if (estado !== 'jugando') return;
    const dt = Math.min(ts - lastTs, 80);
    lastTs = ts;
    animTimer += dt;
    if (animTimer > 200) { animTimer = 0; animFrame = (animFrame + 1) % 2; }
    moverP(dt);
    moverEne(dt);
    checkItems();
    checkCocina();
    draw();
    loopId = requestAnimationFrame(loop);
  }

  function fin() {
    estado = 'fin';
    cancelAnimationFrame(loopId);
    if (score > hiScore) {
      hiScore = score;
      localStorage.setItem('runHiC', hiScore);
    }
    draw();
    if (typeof window.actualizarBarraRecompensa === 'function') window.actualizarBarraRecompensa();
  }

  // ── Controles ────────────────────────────────────────────────────────────
  function onKD(e) {
    if (estado !== 'jugando') return;
    keysDown[e.key] = true;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
  }
  function onKU(e) { delete keysDown[e.key]; }

  function onTS(e) { if (e.touches.length) touchSt = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  function onTE(e) {
    if (!touchSt || estado !== 'jugando') { touchSt = null; return; }
    const dx = e.changedTouches[0].clientX - touchSt.x;
    const dy = e.changedTouches[0].clientY - touchSt.y;
    touchSt = null;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    if (Math.abs(dy) > Math.abs(dx)) { P.dy = dy > 0 ? 1 : -1; P.dx = 0; }
    else { P.dx = dx > 0 ? 1 : -1; P.dy = 0; }
    pTimer = P_SPD; // respuesta inmediata
  }

  window.runMoverIzq    = function() { if (estado==='jugando') { P.dx=-1; P.dy=0; pTimer=P_SPD; } };
  window.runMoverDer    = function() { if (estado==='jugando') { P.dx= 1; P.dy=0; pTimer=P_SPD; } };
  window.runMoverArriba = function() { if (estado==='jugando') { P.dy=-1; P.dx=0; pTimer=P_SPD; } };
  window.runMoverAbajo  = function() { if (estado==='jugando') { P.dy= 1; P.dx=0; pTimer=P_SPD; } };

  window.runPause = function() {
    if (estado === 'jugando') { estado = 'pausa'; draw(); }
    else if (estado === 'pausa') { estado = 'jugando'; lastTs = performance.now(); loopId = requestAnimationFrame(loop); }
    const btn = document.getElementById('btnRunPausa');
    if (btn) btn.textContent = estado === 'pausa' ? '▶ Reanudar' : '⏸ Pausa';
  };

  window.runReset = function() {
    cancelAnimationFrame(loopId);
    keysDown = {};
    score = 0; vidas = 3; nivel = 1;
    estado = 'jugando';
    animFrame = 0; animTimer = 0;
    genNivel(nivel);
    hud();
    const btn = document.getElementById('btnRunPausa');
    if (btn) btn.textContent = '⏸ Pausa';
    lastTs = performance.now();
    loopId = requestAnimationFrame(loop);
  };

  window.runInit = function() {
    canvas = document.getElementById('runCanvas');
    if (!canvas) { console.error('[runInit] #runCanvas no encontrado'); return; }
    ctx = canvas.getContext('2d');
    hiScore = parseInt(localStorage.getItem('runHiC') || '0');

    document.removeEventListener('keydown', onKD);
    document.removeEventListener('keyup',   onKU);
    canvas.removeEventListener('touchstart', onTS);
    canvas.removeEventListener('touchend',   onTE);
    document.addEventListener('keydown', onKD);
    document.addEventListener('keyup',   onKU);
    canvas.addEventListener('touchstart', onTS, { passive: true });
    canvas.addEventListener('touchend',   onTE);

    window.runReset();
  };

  Object.defineProperty(window, 'runRunning', {
    get: () => estado === 'jugando',
    configurable: true,
    enumerable: true
  });

})();
