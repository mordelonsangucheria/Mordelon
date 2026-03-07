// ===== CONFIGURACIÓN DE JUEGOS =====
// Depende de: window._fbDB, window._fbDoc, window._fbSetDoc, window._fbGetDoc, window._fbOnSnapshot, window._fbUpdateDoc, window._fbGetDocs, window._fbCollection
// Usa: window.showNotif(), registrarActividad() — definidas en vendedor-app.js

(function() {
  // Esperar a que Firebase esté listo
  function _ready(fn) {
    if (window._fbDB && window._fbDoc && window._fbSetDoc && window._fbGetDoc && window._fbOnSnapshot) {
      fn();
    } else {
      setTimeout(() => _ready(fn), 100);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  TOGGLE JUEGOS INDIVIDUALES + FICHAS POR JUEGO
  // ═══════════════════════════════════════════════════════

  const JUEGOS_TOGGLE_INFO = [
    { id: 'tetris',   label: 'Tetris',   emoji: '🧱' },
    { id: 'snake',    label: 'Snake',    emoji: '🐍' },
    { id: '2048',     label: '2048',     emoji: '🔢' },
    { id: 'dino',     label: 'Dino',     emoji: '🦕' },
    { id: 'minas',    label: 'Minas',    emoji: '💣' },
    { id: 'invaders', label: 'Invaders', emoji: '👾' },
    { id: 'slots',    label: 'Slots',    emoji: '🎰' },
    { id: 'run',      label: 'Mordelón Run', emoji: '🏃' },
  ];

  let juegosEstado = {}; // { tetris: true, snake: false, fichasReq_tetris: true, ... }

  function renderJuegosToggles() {
    const grid = document.getElementById('juegosToggleGrid');
    if (!grid) return;
    grid.innerHTML = JUEGOS_TOGGLE_INFO.map(j => {
      const activo    = juegosEstado[j.id] !== false;
      const fichasReq = j.id === 'slots' ? true : (juegosEstado['fichasReq_' + j.id] === true);
      const esSlots   = j.id === 'slots';
      return `
      <div style="display:flex;flex-direction:column;gap:6px;background:var(--gris-mid);border:1.5px solid ${activo ? 'rgba(61,191,184,.3)' : 'var(--gris-light)'};border-radius:12px;padding:10px 14px;transition:all .2s;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:1.2rem;">${j.emoji}</span>
            <div>
              <div style="font-weight:800;font-size:0.8rem;">${j.label}</div>
              <div style="font-size:0.62rem;color:${activo ? 'var(--turquesa)' : '#555'};">${activo ? 'Visible' : 'Oculto'}</div>
            </div>
          </div>
          <button data-jid="${j.id}"
            style="width:44px;height:24px;border-radius:12px;border:none;cursor:pointer;position:relative;transition:background .2s;background:${activo ? 'var(--turquesa)' : '#333'};"
            onclick="window.toggleJuegoIndividual(this.dataset.jid)">
            <span style="position:absolute;top:3px;width:18px;height:18px;border-radius:50%;background:white;transition:left .2s;left:${activo ? '23px' : '3px'};display:block;box-shadow:0 1px 4px rgba(0,0,0,.4);"></span>
          </button>
        </div>
        ${activo ? `
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:6px;border-top:1px solid #222;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.75rem;">🎟️</span>
            <div>
              <div style="font-weight:700;font-size:0.68rem;color:${fichasReq ? 'var(--naranja)' : '#555'};">Fichas</div>
              <div style="font-size:0.55rem;color:#444;">${esSlots ? 'Siempre activo' : (fichasReq ? '3 gratis/día + compradas' : 'Juego libre')}</div>
            </div>
          </div>
          ${esSlots ? `
            <span style="font-size:0.6rem;color:var(--naranja);font-weight:700;padding:2px 8px;background:rgba(255,152,0,.1);border-radius:6px;">SIEMPRE</span>
          ` : `
            <button data-jid="${j.id}"
              style="width:38px;height:20px;border-radius:10px;border:none;cursor:pointer;position:relative;transition:background .2s;background:${fichasReq ? 'var(--naranja)' : '#333'};"
              onclick="window.toggleFichasJuego(this.dataset.jid)">
              <span style="position:absolute;top:2px;width:16px;height:16px;border-radius:50%;background:white;transition:left .2s;left:${fichasReq ? '19px' : '3px'};display:block;box-shadow:0 1px 3px rgba(0,0,0,.4);"></span>
            </button>
          `}
        </div>` : ''}
      </div>`;
    }).join('');

    // Actualizar botón "apagar todos"
    const btnTodos = document.getElementById('btnToggleTodosJuegos');
    if (!btnTodos) return;
    const algunoActivo = JUEGOS_TOGGLE_INFO.some(j => juegosEstado[j.id] !== false);
    btnTodos.textContent  = algunoActivo ? 'APAGAR TODOS' : 'ACTIVAR TODOS';
    btnTodos.style.borderColor = algunoActivo ? 'var(--rojo)' : 'var(--verde)';
    btnTodos.style.color       = algunoActivo ? 'var(--rojo)' : 'var(--verde)';
  }

  window.renderJuegosToggles = renderJuegosToggles;

  window.toggleJuegoIndividual = async function(id) {
    const db = window._fbDB, doc = window._fbDoc, setDoc = window._fbSetDoc;
    juegosEstado[id] = juegosEstado[id] === false ? true : false;
    await setDoc(doc(db, 'config', 'juegos'), juegosEstado);
    const info   = JUEGOS_TOGGLE_INFO.find(j => j.id === id);
    const activo = juegosEstado[id] !== false;
    window.showNotif(`${info.emoji} ${info.label} ${activo ? 'activado' : 'desactivado'}`);
    if (typeof registrarActividad === 'function') registrarActividad(`🕹️ ${info.label} ${activo ? 'activado' : 'desactivado'}`);
    renderJuegosToggles();
  };

  window.toggleTodosJuegos = async function() {
    const db = window._fbDB, doc = window._fbDoc, setDoc = window._fbSetDoc;
    const algunoActivo = JUEGOS_TOGGLE_INFO.some(j => juegosEstado[j.id] !== false);
    JUEGOS_TOGGLE_INFO.forEach(j => { juegosEstado[j.id] = algunoActivo ? false : true; });
    await setDoc(doc(db, 'config', 'juegos'), juegosEstado);
    window.showNotif(algunoActivo ? '🔴 Todos los juegos desactivados' : '🟢 Todos los juegos activados');
    if (typeof registrarActividad === 'function') registrarActividad(`🕹️ Todos los juegos ${algunoActivo ? 'desactivados' : 'activados'}`);
    renderJuegosToggles();
  };

  // Toggle fichas requeridas por juego (excepto Slots que siempre las requiere)
  window.toggleFichasJuego = async function(id) {
    if (id === 'slots') return; // Slots siempre requiere fichas
    const db = window._fbDB, doc = window._fbDoc, setDoc = window._fbSetDoc;
    const key  = 'fichasReq_' + id;
    juegosEstado[key] = juegosEstado[key] === true ? false : true;
    await setDoc(doc(db, 'config', 'juegos'), juegosEstado);
    const info   = JUEGOS_TOGGLE_INFO.find(j => j.id === id);
    const activo = juegosEstado[key] === true;
    window.showNotif(`🎟️ Fichas en ${info.emoji} ${info.label}: ${activo ? 'ACTIVADAS' : 'DESACTIVADAS'}`);
    if (typeof registrarActividad === 'function') registrarActividad(`🎟️ Fichas ${info.label} ${activo ? 'activadas' : 'desactivadas'}`);
    renderJuegosToggles();
  };

  // ═══════════════════════════════════════════════════════
  //  DIFICULTAD LLAMA RUNNER (DINO)
  // ═══════════════════════════════════════════════════════

  function _dinoDifLabelText(val) {
    const v = parseInt(val);
    if (v === 0)  return 'Normal';
    if (v <= 20)  return 'Un poco más difícil';
    if (v <= 40)  return 'Difícil';
    if (v <= 60)  return 'Muy difícil';
    return '🔥 Al límite';
  }

  function _dinoDifLabelColor(val) {
    const v = parseInt(val);
    if (v === 0)  return 'var(--verde)';
    if (v <= 30)  return 'var(--naranja)';
    return 'var(--rojo)';
  }

  window.previewDinoDif = function(val) {
    const label = document.getElementById('dinoDifLabel');
    if (label) {
      label.textContent = _dinoDifLabelText(val);
      label.style.color = _dinoDifLabelColor(val);
    }
  };

  window.guardarDinoDif = async function() {
    const db = window._fbDB, doc = window._fbDoc, setDoc = window._fbSetDoc;
    const slider = document.getElementById('dinoDifSlider');
    const msgEl  = document.getElementById('dinoDifMsg');
    if (!slider) return;
    const val = parseInt(slider.value) || 0;
    try {
      await setDoc(doc(db, 'config', 'dinoDificultad'), { valor: val });
      if (msgEl) { msgEl.style.color = 'var(--verde)'; msgEl.textContent = '✅ Dificultad guardada'; }
      if (typeof registrarActividad === 'function') registrarActividad('🦕 Dificultad Dino → ' + _dinoDifLabelText(val));
      setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
    } catch(e) {
      if (msgEl) { msgEl.style.color = 'var(--rojo)'; msgEl.textContent = '❌ Error al guardar'; }
    }
  };

  window.resetDinoDif = async function() {
    const slider = document.getElementById('dinoDifSlider');
    if (slider) slider.value = 0;
    window.previewDinoDif(0);
    await window.guardarDinoDif();
  };

  // ═══════════════════════════════════════════════════════
  //  FICHAS DE SLOTS
  // ═══════════════════════════════════════════════════════

  let _fichasUsuarioActual = null;

  window.buscarUsuarioSlots = async function() {
    const db = window._fbDB, doc = window._fbDoc, getDoc = window._fbGetDoc;
    const nombre = document.getElementById('fichasNombreCliente').value.trim().toUpperCase();
    const msgEl  = document.getElementById('fichasMensaje');
    const infoEl = document.getElementById('fichasUsuarioInfo');

    if (!nombre || nombre.length < 2) {
      msgEl.style.color = 'var(--rojo)'; msgEl.textContent = '⚠️ Ingresá un nombre'; return;
    }
    msgEl.style.color = 'var(--turquesa)'; msgEl.textContent = 'Buscando...';
    infoEl.style.display = 'none';

    try {
      const snap = await getDoc(doc(db, 'clientes', nombre));
      if (!snap.exists()) {
        msgEl.style.color = 'var(--rojo)';
        msgEl.textContent = '❌ No existe el usuario "' + nombre + '"';
        _fichasUsuarioActual = null;
        return;
      }
      const data = snap.data();
      _fichasUsuarioActual = { nombre, ...data };

      document.getElementById('fichasNombreConfirm').textContent   = nombre;
      document.getElementById('fichasActualesConfirm').textContent = data.fichasSlots ?? 0;
      document.getElementById('fichasRecordConfirm').textContent   = (data.recordSlots ?? 0) + ' pts';
      infoEl.style.display = 'block';
      msgEl.textContent = '';
    } catch(e) {
      msgEl.style.color = 'var(--rojo)'; msgEl.textContent = '❌ Error al buscar';
    }
  };

  window.cargarFichas = async function() {
    const db = window._fbDB, doc = window._fbDoc, updateDoc = window._fbUpdateDoc;
    const cant  = parseInt(document.getElementById('fichasCantidad').value) || 0;
    const msgEl = document.getElementById('fichasMensaje');

    if (!_fichasUsuarioActual) { msgEl.style.color='var(--rojo)'; msgEl.textContent='⚠️ Buscá un usuario primero'; return; }
    if (cant < 1)              { msgEl.style.color='var(--rojo)'; msgEl.textContent='⚠️ Ingresá una cantidad válida'; return; }

    try {
      const nombre  = _fichasUsuarioActual.nombre;
      const actual  = _fichasUsuarioActual.fichasSlots ?? 0;
      const nuevas  = actual + cant;
      await updateDoc(doc(db, 'clientes', nombre), { fichasSlots: nuevas });

      document.getElementById('fichasActualesConfirm').textContent = nuevas;
      _fichasUsuarioActual.fichasSlots = nuevas;

      msgEl.style.color = 'var(--verde)';
      msgEl.textContent = '✅ ' + cant + ' ficha' + (cant>1?'s':'') + ' cargada' + (cant>1?'s':'') + ' a ' + nombre + ' (total: ' + nuevas + ')';
      if (typeof registrarActividad === 'function') registrarActividad('🎰 ' + cant + ' fichas cargadas a ' + nombre);
      document.getElementById('fichasCantidad').value = '3';
      setTimeout(() => { msgEl.textContent = ''; }, 4000);
    } catch(e) {
      msgEl.style.color = 'var(--rojo)'; msgEl.textContent = '❌ Error al cargar fichas';
    }
  };

  window.verTodosUsuariosSlots = async function() {
    const db = window._fbDB, getDocs = window._fbGetDocs, collection = window._fbCollection;
    const listaEl = document.getElementById('fichasUsuariosLista');
    const gridEl  = document.getElementById('fichasUsuariosGrid');
    if (!gridEl) return;

    listaEl.style.display = 'block';
    gridEl.innerHTML = '<div style="color:#555;font-size:0.7rem;">Cargando...</div>';

    try {
      const snap = await getDocs(collection(db, 'clientes'));
      if (snap.empty) { gridEl.innerHTML = '<div style="color:#555;font-size:0.7rem;">No hay usuarios aún</div>'; return; }

      const usuarios = [];
      snap.forEach(d => usuarios.push({ nombre: d.id, ...d.data() }));
      usuarios.sort((a,b) => (b.recordSlots||0) - (a.recordSlots||0));

      gridEl.innerHTML = usuarios.map(u => {
        const n = u.nombre;
        return `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--gris-dark);border-radius:8px;padding:8px 12px;cursor:pointer;"
          onclick="document.getElementById('fichasNombreCliente').value='${n}';window.buscarUsuarioSlots();">
          <div>
            <span style="font-size:0.82rem;color:var(--blanco);font-weight:bold;">${n}</span>
            <span style="font-size:0.65rem;color:#555;margin-left:8px;">🎰 ${u.fichasSlots??0} fichas</span>
          </div>
          <span style="font-size:0.65rem;color:var(--verde);">🏆 ${u.recordSlots??0} pts</span>
        </div>`;
      }).join('');
    } catch(e) {
      gridEl.innerHTML = '<div style="color:var(--rojo);font-size:0.7rem;">Error al cargar</div>';
    }
  };

  // ═══════════════════════════════════════════════════════
  //  DIFICULTAD INVADERS
  // ═══════════════════════════════════════════════════════

  const _invadersDifLabels = ['😊 Fácil', '🙂 Normal', '😐 Medio Alto', '😬 Alto', '💀 Extremo'];
  const _invadersDifColors = ['var(--verde)', 'var(--turquesa)', 'var(--naranja)', '#FF6B35', 'var(--rojo)'];
  let _invadersDifActual = 1; // default Normal

  window.selInvadersDif = function(nivel) {
    _invadersDifActual = nivel;
    const label = document.getElementById('invadersDifLabel');
    if (label) { label.textContent = _invadersDifLabels[nivel]; label.style.color = _invadersDifColors[nivel]; }
    for (let i = 0; i < 5; i++) {
      const btn = document.getElementById('invDif' + i);
      if (!btn) continue;
      if (i === nivel) {
        btn.style.borderColor = _invadersDifColors[nivel];
        btn.style.background  = 'rgba(61,191,184,.15)';
        btn.style.color       = _invadersDifColors[nivel];
      } else {
        btn.style.borderColor = '#444';
        btn.style.background  = 'transparent';
        btn.style.color       = '#666';
      }
    }
  };

  window.guardarInvadersDif = async function() {
    const db = window._fbDB, doc = window._fbDoc, setDoc = window._fbSetDoc;
    const msgEl = document.getElementById('invadersDifMsg');
    try {
      await setDoc(doc(db, 'config', 'invadersDificultad'), { valor: _invadersDifActual });
      if (typeof window.setInvadersDificultad === 'function') window.setInvadersDificultad(_invadersDifActual);
      if (msgEl) { msgEl.style.color = 'var(--verde)'; msgEl.textContent = '✅ Dificultad guardada'; }
      if (typeof registrarActividad === 'function') registrarActividad('👾 Dificultad Invaders → ' + _invadersDifLabels[_invadersDifActual]);
      setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
    } catch(e) {
      if (msgEl) { msgEl.style.color = 'var(--rojo)'; msgEl.textContent = '❌ Error al guardar'; }
    }
  };

  window.resetInvadersDif = async function() {
    window.selInvadersDif(1); // volver a Normal
    await window.guardarInvadersDif();
  };

  // ── Inicialización vía Firebase ──────────────────────────────────────────
  _ready(function() {
    const db = window._fbDB, doc = window._fbDoc;
    const getDoc = window._fbGetDoc, onSnapshot = window._fbOnSnapshot;

    // Escuchar estado de juegos en tiempo real
    onSnapshot(doc(db, 'config', 'juegos'), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      // Asegurar que juegos nuevos arranquen como activos
      JUEGOS_TOGGLE_INFO.forEach(j => {
        if (data[j.id] === undefined) data[j.id] = true;
        // Asegurar campo fichasReq_ existe (false por defecto, excepto slots)
        if (j.id !== 'slots' && data['fichasReq_' + j.id] === undefined) {
          data['fichasReq_' + j.id] = false;
        }
      });
      juegosEstado = data;
      renderJuegosToggles();
    });

    // Cargar dificultad Dino actual
    getDoc(doc(db, 'config', 'dinoDificultad')).then(snap => {
      const val = snap.exists() ? (snap.data().valor || 0) : 0;
      const slider = document.getElementById('dinoDifSlider');
      if (slider) slider.value = val;
      window.previewDinoDif(val);
    }).catch(() => {});

    // Cargar dificultad Invaders actual
    getDoc(doc(db, 'config', 'invadersDificultad')).then(snap => {
      const val = snap.exists() ? (snap.data().valor ?? 1) : 1;
      _invadersDifActual = val;
      window.selInvadersDif(val);
    }).catch(() => {});

    // Cargar dificultad Run actual
    getDoc(doc(db, 'config', 'runDificultad')).then(snap => {
      const val = snap.exists() ? (snap.data().valor ?? 1) : 1;
      _runDifActual = val;
      window.selRunDif(val);
    }).catch(() => {});
  });

  // ── DIFICULTAD RUN ────────────────────────────────────────────────────────
  const _runDifLabels = ['😊 Fácil', '🙂 Normal', '😐 Medio', '😬 Alto', '💀 Extremo'];
  const _runDifColors = ['var(--verde)', 'var(--turquesa)', 'var(--naranja)', '#FF6B35', 'var(--rojo)'];
  let _runDifActual = 1;

  window.selRunDif = function(nivel) {
    _runDifActual = nivel;
    const label = document.getElementById('runDifLabel');
    if (label) { label.textContent = _runDifLabels[nivel]; label.style.color = _runDifColors[nivel]; }
    for (let i = 0; i < 5; i++) {
      const btn = document.getElementById('runDif' + i);
      if (!btn) continue;
      if (i === nivel) {
        btn.style.borderColor = _runDifColors[nivel];
        btn.style.color       = _runDifColors[nivel];
        btn.style.background  = _runDifColors[nivel] + '22';
      } else {
        btn.style.borderColor = '#555';
        btn.style.color       = '#888';
        btn.style.background  = 'var(--gris-mid)';
      }
    }
  };

  window.guardarRunDif = async function() {
    const db = window._fbDB, doc = window._fbDoc, setDoc = window._fbSetDoc;
    const msgEl = document.getElementById('runDifMsg');
    try {
      await setDoc(doc(db, 'config', 'runDificultad'), { valor: _runDifActual });
      if (typeof window.setRunDificultad === 'function') window.setRunDificultad(_runDifActual);
      if (typeof registrarActividad === 'function') registrarActividad('🏃 Dificultad Run → ' + _runDifLabels[_runDifActual]);
      if (msgEl) { msgEl.textContent = '✅ Guardado'; msgEl.style.color = 'var(--verde)'; }
    } catch(e) {
      if (msgEl) { msgEl.textContent = '❌ Error al guardar'; msgEl.style.color = 'var(--rojo)'; }
    }
    if (msgEl) setTimeout(() => { if(msgEl) msgEl.textContent = ''; }, 3000);
  };

  window.resetRunDif = async function() {
    const db = window._fbDB, doc = window._fbDoc, setDoc = window._fbSetDoc;
    _runDifActual = 1;
    window.selRunDif(1);
    const msgEl = document.getElementById('runDifMsg');
    try {
      await setDoc(doc(db, 'config', 'runDificultad'), { valor: 1 });
      if (typeof window.setRunDificultad === 'function') window.setRunDificultad(1);
      if (msgEl) { msgEl.textContent = '↺ Reseteado a Normal'; msgEl.style.color = 'var(--turquesa)'; }
    } catch(e) {
      if (msgEl) { msgEl.textContent = '❌ Error'; msgEl.style.color = 'var(--rojo)'; }
    }
    if (msgEl) setTimeout(() => { if(msgEl) msgEl.textContent = ''; }, 3000);
  };

  // ── ❄️ CONFIG FREEZE RUN ──────────────────────────────────────────────────
  const FREEZE_DUR_DEFAULT  = 1500;
  const FREEZE_USOS_DEFAULT = 0; // 0 = infinito

  let _freezeDur  = FREEZE_DUR_DEFAULT;
  let _freezeUsos = FREEZE_USOS_DEFAULT;

  // Cargar valores guardados de Firebase al iniciar (dentro de _ready via llamada diferida)
  function _cargarFreezeConfig() {
    const db = window._fbDB, doc = window._fbDoc, getDoc = window._fbGetDoc;
    if (!db || !doc || !getDoc) { setTimeout(_cargarFreezeConfig, 100); return; }
    getDoc(doc(db, 'config', 'runFreezeConfig')).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.duracion  != null) _freezeDur  = d.duracion;
        if (d.usos      != null) _freezeUsos = d.usos;
      }
      _aplicarFreezeUI();
    }).catch(() => _aplicarFreezeUI());
  }
  _cargarFreezeConfig();

  function _aplicarFreezeUI() {
    const slider = document.getElementById('freezeDurSlider');
    if (slider) slider.value = _freezeDur;
    window.onFreezeDurChange(_freezeDur);
    window.selFreezeUsos(_freezeUsos);
    // Propagar al juego si ya está cargado
    _propagarFreeze();
  }

  function _propagarFreeze() {
    if (typeof window.setRunFreezeConfig === 'function') {
      window.setRunFreezeConfig(_freezeDur, _freezeUsos);
    }
  }

  window.onFreezeDurChange = function(val) {
    _freezeDur = parseInt(val);
    const label = document.getElementById('freezeDurLabel');
    if (label) label.textContent = (_freezeDur / 1000).toFixed(1) + ' s';
  };

  window.selFreezeUsos = function(usos) {
    _freezeUsos = usos;
    const label = document.getElementById('freezeUsosLabel');
    if (label) label.textContent = usos === 0 ? '∞' : usos + '×';
    // Resaltar botón activo
    [0,1,2,3,5].forEach(u => {
      const btn = document.getElementById('fuBtn' + u);
      if (!btn) return;
      const activo = u === usos;
      btn.style.borderColor = activo ? '#5599ff' : '#555';
      btn.style.color        = activo ? '#5599ff' : '#888';
    });
  };

  window.guardarFreezeConfig = async function() {
    const db = window._fbDB, doc = window._fbDoc, setDoc = window._fbSetDoc;
    const msgEl = document.getElementById('freezeConfigMsg');
    try {
      await setDoc(doc(db, 'config', 'runFreezeConfig'), { duracion: _freezeDur, usos: _freezeUsos });
      _propagarFreeze();
      if (msgEl) { msgEl.textContent = '✅ Guardado'; msgEl.style.color = 'var(--verde)'; }
    } catch(e) {
      if (msgEl) { msgEl.textContent = '❌ Error al guardar'; msgEl.style.color = 'var(--rojo)'; }
    }
    if (msgEl) setTimeout(() => { if(msgEl) msgEl.textContent = ''; }, 3000);
  };

  window.resetFreezeConfig = async function() {
    const db = window._fbDB, doc = window._fbDoc, setDoc = window._fbSetDoc;
    _freezeDur  = FREEZE_DUR_DEFAULT;
    _freezeUsos = FREEZE_USOS_DEFAULT;
    _aplicarFreezeUI();
    const msgEl = document.getElementById('freezeConfigMsg');
    try {
      await setDoc(doc(db, 'config', 'runFreezeConfig'), { duracion: _freezeDur, usos: _freezeUsos });
      if (msgEl) { msgEl.textContent = '↺ Reseteado'; msgEl.style.color = 'var(--turquesa)'; }
    } catch(e) {
      if (msgEl) { msgEl.textContent = '❌ Error'; msgEl.style.color = 'var(--rojo)'; }
    }
    if (msgEl) setTimeout(() => { if(msgEl) msgEl.textContent = ''; }, 3000);
  };

  // Render inicial con defaults (sin esperar Firebase)
  renderJuegosToggles();

})();
