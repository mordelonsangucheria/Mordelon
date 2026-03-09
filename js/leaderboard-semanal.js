// ===================== LEADERBOARD SEMANAL =====================
// Depende de: window._fbDB, window._fbDoc, window._fbOnSnapshot
// Expone: window.abrirLeaderboard(juego), window.cerrarLeaderboard()
// Integración: llamar window.abrirLeaderboard(juego) al terminar una partida

(function () {

  // ── Utilidades de semana ────────────────────────────────────────────────────
  // Devuelve un string "YYYY-Www" (ej: "2025-W23") para la semana ISO actual
  function _semanaActual() {
    const hoy = new Date();
    // Lunes de la semana ISO
    const tmp = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
    const dia = tmp.getUTCDay() || 7; // dom=0 → 7
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dia);
    const año = tmp.getUTCFullYear();
    const semana = Math.ceil(((tmp - Date.UTC(año, 0, 1)) / 86400000 + 1) / 7);
    return año + '-W' + String(semana).padStart(2, '0');
  }

  // Lunes 00:00:00 local de la semana actual
  function _inicioSemana() {
    const hoy = new Date();
    const dia = hoy.getDay() || 7; // dom=0 → 7
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - (dia - 1));
    lunes.setHours(0, 0, 0, 0);
    return lunes;
  }

  // Domingo 23:59:59 local de la semana actual
  function _finSemana() {
    const fin = _inicioSemana();
    fin.setDate(fin.getDate() + 6);
    fin.setHours(23, 59, 59, 999);
    return fin;
  }

  function _formatFecha(date) {
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }

  // ── Firebase lazy-load ──────────────────────────────────────────────────────
  let _getDocs = null, _collection = null, _updateDoc = null;

  async function _ensureFirebase() {
    if (_getDocs && _collection && _updateDoc) return true;
    if (window._fbGetDocs && window._fbCollection && window._fbUpdateDoc) {
      _getDocs    = window._fbGetDocs;
      _collection = window._fbCollection;
      _updateDoc  = window._fbUpdateDoc;
      return true;
    }
    try {
      const mod   = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js');
      _getDocs    = mod.getDocs;
      _collection = mod.collection;
      _updateDoc  = mod.updateDoc;
      return true;
    } catch (e) {
      console.error('[Leaderboard] No se pudo cargar Firebase:', e);
      return false;
    }
  }

  function _ready(fn) {
    if (window._fbDB && window._fbDoc && window._fbOnSnapshot) fn();
    else setTimeout(() => _ready(fn), 100);
  }

  // ── Nombres visibles ────────────────────────────────────────────────────────
  const NOMBRES_JUEGO = {
    tetris:     '🧱 Tetris',
    snake:      '🔥 Snake',
    '2048':     '🔢 2048',
    dino:       '🦕 Dino',
    minas:      '💣 Minas',
    invaders:   '👾 Invaders',
    slots:      '🎰 Slots',
    run:        '🏃 Run',
    impact:     '🚀 Impact',
    battle:     '🏰 Battle',
    blockbuster:'🎬 Blockbuster',
  };

  const MEDALLAS = ['🥇', '🥈', '🥉'];

  // ── Estado ──────────────────────────────────────────────────────────────────
  let _juegoActivo = null;

  // ── Render del modal ─────────────────────────────────────────────────────────
  async function _renderLeaderboard(juego) {
    const lbBody  = document.getElementById('lbBody');
    const lbTitle = document.getElementById('lbTitle');
    if (!lbBody || !lbTitle) return;

    const nombreJuego = NOMBRES_JUEGO[juego] || juego;
    const semana      = _semanaActual();
    const inicio      = _inicioSemana();
    const fin         = _finSemana();

    lbTitle.innerHTML =
      `<span>${nombreJuego}</span>` +
      `<span style="font-size:0.72rem;color:#888;font-family:Nunito,sans-serif;font-weight:400;margin-left:8px;">` +
      `📅 ${_formatFecha(inicio)} – ${_formatFecha(fin)}</span>`;

    lbBody.innerHTML =
      '<div style="text-align:center;padding:20px;color:#555;font-size:0.82rem;">Cargando ranking...</div>';

    // Esperar a que cliente-app.js exponga window._fbDB
    await new Promise(resolve => {
      if (window._fbDB) { resolve(); return; }
      const t = setInterval(() => { if (window._fbDB) { clearInterval(t); resolve(); } }, 100);
    });

    if (!await _ensureFirebase()) {
      lbBody.innerHTML =
        '<div style="text-align:center;padding:20px;color:#c00;font-size:0.82rem;">❌ No se pudo cargar el ranking</div>';
      return;
    }

    try {
      const db   = window._fbDB;
      const snap = await _getDocs(_collection(db, 'clientes'));

      // Recolectar puntajes de la semana actual
      const jugadores = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (!data.nombre) return;

        let pts = 0;
        let semanaGuardada = null;

        if (juego === 'slots') {
          // Slots guarda en recordSlots + recordSlotsSemana
          semanaGuardada = data.recordSlotsSemana || null;
          pts = semanaGuardada === semana ? (data.recordSlotsSemanaPts ?? 0) : 0;
        } else {
          // Resto de juegos: puntosJuegosSemana.{juego}.semana + pts
          const ps = data.puntosJuegosSemana && data.puntosJuegosSemana[juego];
          if (ps) {
            semanaGuardada = ps.semana || null;
            pts = semanaGuardada === semana ? (ps.pts ?? 0) : 0;
          }
        }

        if (pts > 0) {
          jugadores.push({ nombre: data.nombre, pts });
        }
      });

      // Ordenar de mayor a menor
      jugadores.sort((a, b) => b.pts - a.pts);
      const top = jugadores.slice(0, 10);

      if (!top.length) {
        lbBody.innerHTML =
          '<div style="text-align:center;padding:24px 0;color:#555;font-size:0.85rem;">' +
          '¡Sé el primero en jugar esta semana! 🎮</div>';
        return;
      }

      // Obtener nombre del usuario logueado
      const miNombre = (typeof usuarioActual !== 'undefined' && usuarioActual?.nombre) || null;

      let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
      top.forEach((j, i) => {
        const esYo    = miNombre && j.nombre === miNombre;
        const medalla = MEDALLAS[i] || `<span style="color:#555;font-size:0.8rem;">${i + 1}</span>`;
        const bgColor = esYo ? 'rgba(61,191,184,0.12)' : 'var(--gris-dark)';
        const border  = esYo ? '1.5px solid var(--turquesa)' : '1.5px solid #222';
        const nameColor = esYo ? 'var(--turquesa)' : 'var(--blanco)';

        html +=
          `<div style="display:flex;align-items:center;gap:10px;background:${bgColor};border:${border};` +
          `border-radius:12px;padding:10px 14px;">` +
            `<div style="font-size:1.2rem;min-width:24px;text-align:center;">${medalla}</div>` +
            `<div style="flex:1;font-size:0.88rem;color:${nameColor};font-weight:${esYo ? 800 : 600};">` +
              `${j.nombre}${esYo ? ' <span style="font-size:0.7rem;color:var(--turquesa);">(vos)</span>' : ''}` +
            `</div>` +
            `<div style="font-family:'Righteous',cursive;font-size:0.95rem;color:var(--naranja);">` +
              `${j.pts.toLocaleString('es-AR')}` +
            `</div>` +
          `</div>`;
      });
      html += '</div>';

      // Si el usuario logueado no está en el top 10, mostrar su posición abajo
      if (miNombre) {
        const miPos = jugadores.findIndex(j => j.nombre === miNombre);
        if (miPos >= 10) {
          const miEntry = jugadores[miPos];
          html +=
            `<div style="margin-top:10px;border-top:1px solid #222;padding-top:10px;">` +
            `<div style="display:flex;align-items:center;gap:10px;background:rgba(61,191,184,0.08);` +
            `border:1.5px solid #2a4a49;border-radius:12px;padding:10px 14px;">` +
              `<div style="font-size:1.2rem;min-width:24px;text-align:center;color:#555;">${miPos + 1}</div>` +
              `<div style="flex:1;font-size:0.88rem;color:var(--turquesa);font-weight:800;">` +
                `${miEntry.nombre} <span style="font-size:0.7rem;">(vos)</span>` +
              `</div>` +
              `<div style="font-family:'Righteous',cursive;font-size:0.95rem;color:var(--naranja);">` +
                `${miEntry.pts.toLocaleString('es-AR')}` +
              `</div>` +
            `</div></div>`;
        }
      }

      lbBody.innerHTML = html;

    } catch (e) {
      console.error('[Leaderboard]', e);
      lbBody.innerHTML =
        '<div style="text-align:center;padding:20px;color:#c00;font-size:0.82rem;">❌ Error al cargar el ranking</div>';
    }
  }

  // ── Mapa de IDs de DOM por juego ────────────────────────────────────────────
  const SCORE_DOM_IDS = {
    dino:        'dinoScore',
    snake:       'snakeScore',
    tetris:      'tetrisScore',
    '2048':      'g2048Score',
    invaders:    'invadersScore',
    battle:      'battleScore',
    impact:      'impactScore',
    run:         'runScore',
    blockbuster: 'bbScore',
  };

  function _leerPuntajeDom(juego) {
    const id = SCORE_DOM_IDS[juego];
    if (!id) return 0;
    const el = document.getElementById(id);
    if (!el) return 0;
    return parseInt(el.textContent.replace(/[.,]/g, '')) || 0;
  }

  // ── API pública ──────────────────────────────────────────────────────────────
  window.abrirLeaderboard = async function (juego) {
    _juegoActivo = juego;
    const modal = document.getElementById('lbModal');
    if (!modal) return;

    // Mostrar modal con loading inmediatamente
    modal.style.display = 'flex';
    const lbBody = document.getElementById('lbBody');
    if (lbBody) lbBody.innerHTML = '<div style="text-align:center;padding:20px;color:#555;font-size:0.82rem;">Guardando puntaje...</div>';

    // Guardar puntaje de esta partida y ESPERAR a que termine
    const pts = _leerPuntajeDom(juego);
    if (pts > 0 && typeof window.guardarPuntajeSemanal === 'function') {
      await window.guardarPuntajeSemanal(juego, pts);
    }

    // Ahora sí renderizar — el dato ya está en Firestore
    _renderLeaderboard(juego);
  };

  window.cerrarLeaderboard = function () {
    const modal = document.getElementById('lbModal');
    if (modal) modal.style.display = 'none';
    _juegoActivo = null;
  };

  // ── Guardar puntaje semanal en Firestore ─────────────────────────────────────
  // Llamar esto cuando el jugador hace un nuevo récord.
  // Reemplaza a notificarRecordJuego o lo complementa.
  window.guardarPuntajeSemanal = async function (juego, pts) {
    // Esperar a que cliente-app.js (módulo ES diferido) exponga window._fbDB
    await new Promise(resolve => {
      if (window._fbDB) { resolve(); return; }
      const t = setInterval(() => { if (window._fbDB) { clearInterval(t); resolve(); } }, 100);
    });
    if (!await _ensureFirebase()) return;
    const db = window._fbDB;
    if (!db) return;

    // Necesitamos el nombre del usuario logueado
    const nombre = (typeof usuarioActual !== 'undefined' && usuarioActual?.nombre) || null;
    if (!nombre) return;

    const semana = _semanaActual();
    const ref    = window._fbDoc(db, 'clientes', nombre);

    try {
      if (juego === 'slots') {
        // Para slots: solo actualizar si supera el récord semanal actual
        const snap    = await (window._fbGetDoc ? window._fbGetDoc(ref) :
          (await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js')).getDoc(ref));
        const data    = snap.exists() ? snap.data() : {};
        const semAct  = data.recordSlotsSemana || null;
        const ptsAct  = semAct === semana ? (data.recordSlotsSemanaPts ?? 0) : 0;
        if (semAct !== semana || pts > ptsAct) {
          await _updateDoc(ref, {
            recordSlotsSemana:    semana,
            recordSlotsSemanaPts: pts,
          });
        }
      } else {
        // Para el resto: leer puntaje semanal anterior y actualizar si mejora
        const snap   = await (window._fbGetDoc ? window._fbGetDoc(ref) :
          (await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js')).getDoc(ref));
        const data   = snap.exists() ? snap.data() : {};
        const ps     = data.puntosJuegosSemana && data.puntosJuegosSemana[juego];
        const semAnt = ps ? ps.semana : null;
        const ptsAnt = semAnt === semana ? (ps.pts ?? 0) : 0;

        if (semAnt !== semana || pts > ptsAnt) {
          await _updateDoc(ref, {
            [`puntosJuegosSemana.${juego}`]: { semana, pts },
          });
        }
      }
    } catch (e) {
      console.error('[Leaderboard] Error guardando puntaje semanal:', e);
    }
  };

  // notificarRecordJuego llama a guardarPuntajeSemanal desde cliente-app.js
  // El guardado principal ocurre en abrirLeaderboard al terminar cada partida

  // ── Cerrar modal al tocar el fondo oscuro ────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('lbModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) window.cerrarLeaderboard();
      });
    }
  });

})();
