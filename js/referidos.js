// ===================== SISTEMA DE REFERIDOS =====================
// Archivo: js/referidos.js
// Depende de: Firebase expuesto como window._fbDB, window._fbDoc, etc.
//             En cliente-app.js los usa directo (mismo módulo).
//
// LADO CLIENTE  → leer ?ref= al cargar, hook en registro, UI del link
// LADO VENDEDOR → config recompensa, panel con stats de referidos
// ================================================================

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, increment, collection, getDocs }
  from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

// ── Obtener db: reutilizar la instancia global o crear una nueva ─────────
const _FIREBASE_CONFIG = {
  apiKey: "AIzaSyDom7vxzcnnkc5_y3JquIr6TjMp5GX89_0",
  authDomain: "mordelon-52e75.firebaseapp.com",
  projectId: "mordelon-52e75",
  storageBucket: "mordelon-52e75.firebasestorage.app",
  messagingSenderId: "603187538200",
  appId: "1:603187538200:web:8921a78447a2182b5a166d"
};

function _getDB() {
  if (window._fbDB) return window._fbDB;
  // Inicializar Firebase propio si no hay instancia global (panel vendedor)
  if (!window.__referidosDB) {
    const apps = getApps();
    const app = apps.find(a => a.name === 'referidos') ||
                initializeApp(_FIREBASE_CONFIG, 'referidos');
    window.__referidosDB = getFirestore(app);
  }
  return window.__referidosDB;
}

// ── Esperar a que Firebase esté disponible ───────────────────────────────
function _ready(fn) {
  if (window._fbDB) { fn(); return; }
  setTimeout(() => _ready(fn), 150);
}

// ════════════════════════════════════════════════════════════════
//  LADO CLIENTE
// ════════════════════════════════════════════════════════════════

// Leer ?ref= de la URL y guardarlo en sessionStorage para usarlo al registrar
(function _capturarRef() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) {
    sessionStorage.setItem('mordelon-ref', ref.trim().toUpperCase());
  }
})();

// Obtener el ref guardado (lo usa window.registrarse al crear la cuenta)
window.referidosGetRefParam = function() {
  return sessionStorage.getItem('mordelon-ref') || null;
};

// Limpiar el ref después de usarlo
window.referidosLimpiarRef = function() {
  sessionStorage.removeItem('mordelon-ref');
};

// Hook principal: llamar desde window.registrarse() DESPUÉS de hacer setDoc
// Recibe el nombre del nuevo usuario recién registrado
window.referidosOnRegistro = async function(nombreNuevo) {
  const refDe = window.referidosGetRefParam();
  if (!refDe || refDe === nombreNuevo) return; // no hay ref o se auto-refirió

  const db = _getDB();
  if (!db) return;

  try {
    // Verificar que el referidor existe
    const refSnap = await getDoc(doc(db, 'clientes', refDe));
    if (!refSnap.exists()) return;

    // Guardar referidoPor en el nuevo usuario (solo si no tenía uno ya)
    const nuevoSnap = await getDoc(doc(db, 'clientes', nombreNuevo));
    if (!nuevoSnap.exists()) return;
    if (nuevoSnap.data().referidoPor) return; // ya tenía uno, no sobreescribir

    await updateDoc(doc(db, 'clientes', nombreNuevo), {
      referidoPor: refDe
    });

    // Incrementar contador de referidos del referidor
    await updateDoc(doc(db, 'clientes', refDe), {
      referidosCount: increment(1)
    });

    // Acreditar la recompensa configurada por el vendedor
    await _acreditarRecompensaReferido(db, refDe);

    window.referidosLimpiarRef();

    // Notificar al nuevo usuario
    if (typeof showToast === 'function') {
      showToast('🎉 Te registraste con el link de ' + refDe);
    }
  } catch(e) {
    console.error('Referidos error:', e);
  }
};

// Acreditar la recompensa al referidor según config del vendedor
async function _acreditarRecompensaReferido(db, nombreReferidor) {
  try {
    const configSnap = await getDoc(doc(db, 'config', 'referidos'));
    if (!configSnap.exists()) return;
    const config = configSnap.data();
    if (!config.activo) return;

    if (config.tipo === 'fichas') {
      const cantidad = config.cantidad || 1;
      await updateDoc(doc(db, 'clientes', nombreReferidor), {
        fichasSlots: increment(cantidad)
      });
    } else if (config.tipo === 'cupon') {
      // Crear un cupón único para el referidor
      const codigo = 'REF-' + nombreReferidor + '-' + Date.now().toString(36).toUpperCase();
      const cupones = (await getDoc(doc(db, 'config', 'cupones'))).data()?.lista || [];
      cupones.push({
        id: Date.now(),
        codigo,
        tipo: config.cuponTipo || 'pct',
        pct:  config.cuponTipo === 'pct'  ? (config.cuponValor || 10) : 0,
        item: config.cuponTipo === 'item' ? (config.cuponItem  || '')  : '',
        activo: true,
        usado: false,
        usadoPor: null,
        creadoEn: Date.now(),
        generadoPor: 'referido',
        para: nombreReferidor,
      });
      await setDoc(doc(db, 'config', 'cupones'), { lista: cupones });
    }
  } catch(e) {
    console.error('Error acreditando recompensa referido:', e);
  }
}

// Generar el link de referido para el usuario logueado
window.referidosGetLink = function(nombreUsuario) {
  const base = window.location.origin + window.location.pathname;
  return base + '?ref=' + encodeURIComponent(nombreUsuario);
};

// Copiar link al portapapeles
window.referidosCopiarLink = async function() {
  const usuario = window.usuarioActual?.nombre;
  if (!usuario) return;
  const link = window.referidosGetLink(usuario);
  try {
    await navigator.clipboard.writeText(link);
    if (typeof showToast === 'function') showToast('🔗 Link copiado al portapapeles');
  } catch(e) {
    // Fallback para móviles
    const ta = document.createElement('textarea');
    ta.value = link;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (typeof showToast === 'function') showToast('🔗 Link copiado');
  }
};

// Compartir por WhatsApp
window.referidosCompartirWA = function() {
  const usuario = window.usuarioActual?.nombre;
  if (!usuario) return;
  const link = window.referidosGetLink(usuario);
  const texto = encodeURIComponent('🔥 Pedí en Mordelón con mi link y conseguís una recompensa: ' + link);
  window.open('https://wa.me/?text=' + texto, '_blank');
};

// Renderizar el bloque de referidos en el perfil del cliente
window.referidosRenderBloque = function() {
  const cont = document.getElementById('referidosBloqueCliente');
  if (!cont) return;
  const usuario = window.usuarioActual;
  if (!usuario) {
    cont.style.display = 'none';
    const wrapper = document.getElementById('acordRefWrapper');
    if (wrapper) wrapper.style.display = 'none';
    return;
  }
  // Mostrar el wrapper del acordeón (el div interno se llena abajo)
  const wrapper = document.getElementById('acordRefWrapper');
  if (wrapper) wrapper.style.display = 'block';

  const link = window.referidosGetLink(usuario.nombre);
  const count = usuario.referidosCount || 0;

  cont.innerHTML = `
    <div style="padding:4px 0 8px;">
      <div style="font-family:'Righteous',cursive;font-size:0.85rem;color:var(--turquesa);letter-spacing:1px;margin-bottom:6px;">
        🔗 COMPARTÍ Y GANÁ
      </div>
      <div style="font-size:0.75rem;color:#888;margin-bottom:12px;line-height:1.4;">
        Cada amigo que se registre con tu link te da una recompensa.
        Ya referiste <strong style="color:var(--turquesa);">${count}</strong> ${count === 1 ? 'persona' : 'personas'}.
      </div>
      <div style="background:var(--gris-mid);border:1px solid #333;border-radius:10px;padding:10px 12px;font-size:0.7rem;color:#aaa;word-break:break-all;margin-bottom:10px;font-family:monospace;">
        ${link}
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="window.referidosCopiarLink()"
          style="flex:1;background:rgba(61,191,184,.12);border:1.5px solid var(--turquesa);color:var(--turquesa);border-radius:10px;padding:9px;font-size:0.78rem;font-weight:800;cursor:pointer;font-family:inherit;">
          📋 Copiar link
        </button>
        <button onclick="window.referidosCompartirWA()"
          style="flex:1;background:rgba(37,211,102,.12);border:1.5px solid #25d366;color:#25d366;border-radius:10px;padding:9px;font-size:0.78rem;font-weight:800;cursor:pointer;font-family:inherit;">
          💬 WhatsApp
        </button>
      </div>
    </div>`;
};

// Escuchar cambios del usuario para actualizar el contador en tiempo real
window.referidosIniciarEscucha = function() {
  _ready(() => {
    const db = _getDB();
    const usuario = window.usuarioActual;
    if (!db || !usuario) return;
    onSnapshot(doc(db, 'clientes', usuario.nombre), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (window.usuarioActual) window.usuarioActual.referidosCount = data.referidosCount || 0;
      window.referidosRenderBloque();
    });
  });
};


// ════════════════════════════════════════════════════════════════
//  LADO VENDEDOR
// ════════════════════════════════════════════════════════════════

let _refConfig = { activo: false, tipo: 'fichas', cantidad: 1, cuponTipo: 'pct', cuponValor: 10, cuponItem: '' };

// Escuchar config de referidos en tiempo real
function _escucharConfigReferidos(db) {
  onSnapshot(doc(db, 'config', 'referidos'), (snap) => {
    if (snap.exists()) _refConfig = { ..._refConfig, ...snap.data() };
    _renderConfigReferidos();
  });
}

function _renderConfigReferidos() {
  // Toggle activo/inactivo
  const toggleEl = document.getElementById('refToggleActivo');
  if (toggleEl) {
    toggleEl.style.background = _refConfig.activo ? 'var(--turquesa)' : '#333';
    const knob = toggleEl.querySelector('span');
    if (knob) knob.style.left = _refConfig.activo ? '23px' : '3px';
  }
  const estadoEl = document.getElementById('refEstadoLabel');
  if (estadoEl) {
    estadoEl.textContent = _refConfig.activo ? 'Activo' : 'Inactivo';
    estadoEl.style.color = _refConfig.activo ? 'var(--turquesa)' : '#555';
  }

  // Tipo de recompensa
  const btnFichas = document.getElementById('refBtnFichas');
  const btnCupon  = document.getElementById('refBtnCupon');
  if (btnFichas) {
    btnFichas.style.borderColor = _refConfig.tipo === 'fichas' ? 'var(--naranja)' : '#444';
    btnFichas.style.color       = _refConfig.tipo === 'fichas' ? 'var(--naranja)' : '#666';
    btnFichas.style.background  = _refConfig.tipo === 'fichas' ? 'rgba(255,152,0,.1)' : 'transparent';
  }
  if (btnCupon) {
    btnCupon.style.borderColor = _refConfig.tipo === 'cupon' ? 'var(--turquesa)' : '#444';
    btnCupon.style.color       = _refConfig.tipo === 'cupon' ? 'var(--turquesa)' : '#666';
    btnCupon.style.background  = _refConfig.tipo === 'cupon' ? 'rgba(61,191,184,.1)' : 'transparent';
  }

  // Secciones
  const secFichas = document.getElementById('refSeccionFichas');
  const secCupon  = document.getElementById('refSeccionCupon');
  if (secFichas) secFichas.style.display = _refConfig.tipo === 'fichas' ? 'block' : 'none';
  if (secCupon)  secCupon.style.display  = _refConfig.tipo === 'cupon'  ? 'block' : 'none';

  // Valores actuales
  const cantEl = document.getElementById('refCantidadFichas');
  if (cantEl) cantEl.value = _refConfig.cantidad || 1;
}

window.refToggleActivo = async function() {
  const db = _getDB(); if (!db) return;
  _refConfig.activo = !_refConfig.activo;
  await setDoc(doc(db, 'config', 'referidos'), _refConfig);
  if (typeof window.showNotif === 'function')
    window.showNotif(_refConfig.activo ? '✅ Sistema de referidos activado' : '⏸ Sistema de referidos pausado');
};

window.refSelTipo = function(tipo) {
  _refConfig.tipo = tipo;
  _renderConfigReferidos();
};

window.refGuardar = async function() {
  const db = _getDB(); if (!db) return;
  const msgEl = document.getElementById('refMsg');

  const cantEl = document.getElementById('refCantidadFichas');
  if (cantEl) _refConfig.cantidad = parseInt(cantEl.value) || 1;

  // Config cupón
  const cuponTipoEl = document.getElementById('refCuponTipo');
  const cuponValEl  = document.getElementById('refCuponValor');
  const cuponItemEl = document.getElementById('refCuponItem');
  if (cuponTipoEl) _refConfig.cuponTipo  = cuponTipoEl.value;
  if (cuponValEl)  _refConfig.cuponValor = parseInt(cuponValEl.value) || 10;
  if (cuponItemEl) _refConfig.cuponItem  = cuponItemEl.value.trim();

  try {
    await setDoc(doc(db, 'config', 'referidos'), _refConfig);
    if (msgEl) { msgEl.style.color = 'var(--verde)'; msgEl.textContent = '✅ Configuración guardada'; }
    if (typeof registrarActividad === 'function') registrarActividad('🔗 Config referidos actualizada');
    setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
  } catch(e) {
    if (msgEl) { msgEl.style.color = 'var(--rojo)'; msgEl.textContent = '❌ Error al guardar'; }
  }
};

// Cargar stats de referidos en el panel vendedor
window.refCargarStats = async function() {
  const db = _getDB(); if (!db) return;
  const cont = document.getElementById('refStatsGrid');
  if (!cont) return;
  cont.innerHTML = '<div style="color:#555;font-size:0.75rem;">Cargando...</div>';

  try {
    const snap = await getDocs(collection(db, 'clientes'));

    // Mapa referidoPor (relación exacta)
    const arbol = {};        // { JUAN: ['PEDRO','MARIA'] }
    const conContador = {};  // { JUAN: 3 } — de referidosCount (datos viejos sin referidoPor)

    snap.forEach(d => {
      const data = d.data();
      const nombre = d.id;
      // Relación exacta guardada en el referido
      if (data.referidoPor) {
        const ref = data.referidoPor;
        if (!arbol[ref]) arbol[ref] = [];
        arbol[ref].push(nombre);
      }
      // Contador en el referidor (puede haber datos de antes del fix)
      if ((data.referidosCount || 0) > 0) {
        conContador[nombre] = data.referidosCount;
      }
    });

    // Unir ambas fuentes: referidores conocidos + referidores con contador pero sin árbol
    const todosReferidores = new Set([...Object.keys(arbol), ...Object.keys(conContador)]);

    if (!todosReferidores.size) {
      cont.innerHTML = '<div style="font-size:0.75rem;color:#555;text-align:center;padding:12px;">Aún no hay referidos registrados</div>';
      return;
    }

    // Ordenar por cantidad desc
    const referidores = [...todosReferidores].sort((a, b) => {
      const ca = (arbol[a] || []).length || conContador[a] || 0;
      const cb = (arbol[b] || []).length || conContador[b] || 0;
      return cb - ca;
    });

    cont.innerHTML = referidores.map(ref => {
      const hijos  = arbol[ref] || [];
      const countFB = conContador[ref] || 0;
      // Si hay árbol usamos eso; si no, mostramos el contador con aviso
      const sinDetalle = !hijos.length && countFB > 0;
      return `
      <div style="background:#111;border:1px solid #222;border-radius:12px;padding:10px 12px;margin-bottom:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${hijos.length ? '8px' : '0'};">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.95rem;">👤</span>
            <span style="font-family:'Righteous',cursive;font-size:0.85rem;color:var(--turquesa);">${ref}</span>
          </div>
          <span style="font-size:0.7rem;color:#555;background:#1a1a1a;border-radius:20px;padding:3px 10px;">
            🔗 ${hijos.length || countFB} referido${(hijos.length || countFB) !== 1 ? 's' : ''}
          </span>
        </div>
        ${hijos.map(h => `
          <div style="display:flex;align-items:center;gap:6px;padding:5px 0 5px 14px;border-left:2px solid #2a2a2a;">
            <span style="font-size:0.7rem;color:#444;">└</span>
            <span style="font-size:0.8rem;color:#aaa;font-weight:800;">${h}</span>
          </div>`).join('')}
        ${sinDetalle ? `
          <div style="padding:4px 0 2px 14px;border-left:2px solid #2a2a2a;">
            <span style="font-size:0.68rem;color:#444;font-style:italic;">└ detalle no disponible (registros anteriores)</span>
          </div>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    cont.innerHTML = '<div style="color:var(--rojo);font-size:0.75rem;">Error al cargar</div>';
  }
};

// HTML del panel vendedor — se inyecta dinámicamente
window.referidosRenderPanelVendedor = function() {
  const cont = document.getElementById('referidosPanelVendedor');
  if (!cont) return;

  cont.innerHTML = `
    <div style="background:var(--gris-dark);border:1.5px solid var(--gris-light);border-radius:16px;padding:16px 18px;margin-bottom:20px;">

      <!-- Encabezado -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-family:'Righteous',cursive;font-size:0.85rem;color:var(--blanco);letter-spacing:1px;margin-bottom:2px;">🔗 SISTEMA DE REFERIDOS</div>
          <div style="font-size:0.72rem;color:#666;">Recompensá a clientes que traen amigos nuevos.</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div>
            <div id="refEstadoLabel" style="font-size:0.65rem;font-weight:800;color:#555;text-align:right;">Inactivo</div>
          </div>
          <button id="refToggleActivo" onclick="window.refToggleActivo()"
            style="width:44px;height:24px;border-radius:12px;border:none;cursor:pointer;position:relative;transition:background .2s;background:#333;">
            <span style="position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:white;transition:left .2s;display:block;box-shadow:0 1px 4px rgba(0,0,0,.4);"></span>
          </button>
        </div>
      </div>

      <!-- Tipo de recompensa -->
      <div style="font-size:0.7rem;font-weight:800;color:#666;letter-spacing:1px;margin-bottom:8px;">RECOMPENSA POR REFERIDO</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <button id="refBtnFichas" onclick="window.refSelTipo('fichas')"
          style="flex:1;padding:9px;border-radius:10px;border:1.5px solid #444;background:transparent;color:#666;cursor:pointer;font-family:inherit;font-weight:800;font-size:0.78rem;transition:all .2s;">
          🎟️ Fichas
        </button>
        <button id="refBtnCupon" onclick="window.refSelTipo('cupon')"
          style="flex:1;padding:9px;border-radius:10px;border:1.5px solid #444;background:transparent;color:#666;cursor:pointer;font-family:inherit;font-weight:800;font-size:0.78rem;transition:all .2s;">
          🎁 Cupón
        </button>
      </div>

      <!-- Sección fichas -->
      <div id="refSeccionFichas" style="display:none;margin-bottom:14px;">
        <div style="font-size:0.7rem;color:#666;margin-bottom:6px;">Fichas a acreditar por cada referido:</div>
        <div style="display:flex;align-items:center;gap:10px;">
          <input id="refCantidadFichas" type="number" min="1" max="20" value="1"
            style="width:70px;background:var(--gris-mid);border:1.5px solid var(--gris-light);color:var(--blanco);border-radius:10px;padding:9px 12px;font-size:1rem;font-family:'Righteous',cursive;text-align:center;outline:none;"/>
          <span style="font-size:0.75rem;color:#555;">ficha(s) de slots</span>
        </div>
      </div>

      <!-- Sección cupón -->
      <div id="refSeccionCupon" style="display:none;margin-bottom:14px;">
        <div style="font-size:0.7rem;color:#666;margin-bottom:8px;">Tipo de cupón:</div>
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <select id="refCuponTipo"
            style="flex:1;background:var(--gris-mid);border:1.5px solid var(--gris-light);color:var(--blanco);border-radius:10px;padding:9px 12px;font-size:0.8rem;font-family:inherit;outline:none;cursor:pointer;"
            onchange="document.getElementById('refCuponSecPct').style.display=this.value==='pct'?'block':'none';document.getElementById('refCuponSecItem').style.display=this.value==='item'?'block':'none';">
            <option value="pct">% de descuento</option>
            <option value="item">🎁 Ítem gratis</option>
          </select>
        </div>
        <div id="refCuponSecPct">
          <div style="font-size:0.7rem;color:#666;margin-bottom:6px;">Porcentaje de descuento:</div>
          <input id="refCuponValor" type="number" min="5" max="100" value="10"
            style="width:70px;background:var(--gris-mid);border:1.5px solid var(--gris-light);color:var(--blanco);border-radius:10px;padding:9px 12px;font-size:1rem;font-family:'Righteous',cursive;text-align:center;outline:none;"/>
          <span style="font-size:0.75rem;color:#555;margin-left:8px;">%</span>
        </div>
        <div id="refCuponSecItem" style="display:none;">
          <div style="font-size:0.7rem;color:#666;margin-bottom:6px;">Ítem gratis (ej: "Papas medianas"):</div>
          <input id="refCuponItem" type="text" maxlength="40" placeholder="Nombre del ítem..."
            style="width:100%;box-sizing:border-box;background:var(--gris-mid);border:1.5px solid var(--gris-light);color:var(--blanco);border-radius:10px;padding:9px 12px;font-size:0.85rem;font-family:inherit;outline:none;"/>
        </div>
      </div>

      <!-- Botón guardar -->
      <button onclick="window.refGuardar()"
        style="width:100%;padding:11px;border-radius:12px;border:none;background:var(--turquesa);color:#111;font-family:'Righteous',cursive;font-size:0.85rem;letter-spacing:1px;cursor:pointer;font-weight:800;margin-bottom:6px;">
        💾 GUARDAR CONFIG
      </button>
      <div id="refMsg" style="font-size:0.7rem;min-height:14px;text-align:center;"></div>

      <!-- Stats árbol referidos -->
      <div style="margin-top:16px;border-top:1px solid var(--gris-light);padding-top:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-size:0.7rem;font-weight:800;color:#666;letter-spacing:1px;">🌳 ÁRBOL DE REFERIDOS</div>
          <button onclick="window.refCargarStats()"
            style="background:transparent;border:1px solid #333;color:#666;border-radius:8px;padding:4px 10px;font-size:0.68rem;cursor:pointer;">
            🔄 Actualizar
          </button>
        </div>
        <div id="refStatsGrid" style="display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:0.75rem;color:#555;text-align:center;padding:10px;">
            Tocá "Actualizar" para ver el árbol
          </div>
        </div>
      </div>

    </div>`;

  // Aplicar estado actual
  _renderConfigReferidos();
};

// ── Inicialización automática ─────────────────────────────────────────────
_ready(function() {
  const db = window._fbDB;

  // Si estamos en el vendedor, renderizar panel y escuchar config
  if (document.getElementById('referidosPanelVendedor')) {
    window.referidosRenderPanelVendedor();
    _escucharConfigReferidos(db);
  }

  // Si estamos en el cliente, escuchar usuario para actualizar bloque
  // (referidosIniciarEscucha se llama desde loginExitoso)
});
