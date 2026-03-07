// ===== SISTEMA DE CUPONES =====
// Depende de: window._fbDB, window._fbDoc, window._fbSetDoc, window._fbOnSnapshot
// Usa: window.showNotif(), registrarActividad() — definidas en vendedor-app.js

(function() {
  // Esperar a que Firebase esté listo
  function _ready(fn) {
    if (window._fbDB && window._fbDoc && window._fbSetDoc && window._fbOnSnapshot) {
      fn();
    } else {
      setTimeout(() => _ready(fn), 100);
    }
  }

  let cuponesData = [];
  let cuponPctActual = null;
  let cuponTipoActual = 'pct'; // 'pct' o 'item'
  let cuponItemActual = null;

  window.selCuponTipo = function(tipo) {
    cuponTipoActual = tipo;
    cuponPctActual = null;
    cuponItemActual = null;
    document.getElementById('btnTipoPct').classList.toggle('sel', tipo === 'pct');
    document.getElementById('btnTipoItem').classList.toggle('sel', tipo === 'item');
    document.getElementById('cuponSeccionPct').style.display  = tipo === 'pct'  ? 'block' : 'none';
    document.getElementById('cuponSeccionItem').style.display = tipo === 'item' ? 'block' : 'none';
    document.querySelectorAll('#cuponPctSelector .btn-billete').forEach(b => b.classList.remove('sel'));
    document.querySelectorAll('#cuponItemSelector .btn-billete').forEach(b => b.classList.remove('sel'));
    const customEl = document.getElementById('cuponItemCustom');
    if (customEl) customEl.value = '';
  };

  window.selCuponPct = function(pct, el) {
    cuponPctActual = pct;
    document.querySelectorAll('#cuponPctSelector .btn-billete').forEach(b => b.classList.remove('sel'));
    el.classList.add('sel');
  };

  window.selCuponItem = function(item, el) {
    cuponItemActual = item;
    document.querySelectorAll('#cuponItemSelector .btn-billete').forEach(b => b.classList.remove('sel'));
    el.classList.add('sel');
    const customEl = document.getElementById('cuponItemCustom');
    if (customEl) customEl.value = '';
  };

  window.selCuponItemCustom = function(val) {
    cuponItemActual = val.trim() || null;
    document.querySelectorAll('#cuponItemSelector .btn-billete').forEach(b => b.classList.remove('sel'));
  };

  window.crearCupon = async function() {
    const db = window._fbDB, doc = window._fbDoc, setDoc = window._fbSetDoc;
    const codigo = document.getElementById('cuponCodigo').value.trim().toUpperCase();
    if (!codigo) { window.showNotif('⚠️ Ingresá un código'); return; }

    if (cuponTipoActual === 'pct') {
      if (!cuponPctActual) { window.showNotif('⚠️ Elegí el % de descuento'); return; }
    } else {
      if (!cuponItemActual) { window.showNotif('⚠️ Elegí o escribí un ítem gratis'); return; }
    }

    if (cuponesData.find(c => c.codigo === codigo)) { window.showNotif('⚠️ Ese código ya existe'); return; }

    const cupon = {
      id: Date.now(),
      codigo,
      tipo: cuponTipoActual,
      pct:  cuponTipoActual === 'pct'  ? cuponPctActual  : 0,
      item: cuponTipoActual === 'item' ? cuponItemActual : '',
      activo: true,
      usado: false,
      usadoPor: null,
      creadoEn: Date.now(),
    };
    cuponesData.push(cupon);
    await setDoc(doc(db, 'config', 'cupones'), { lista: cuponesData });

    const logTxt = cuponTipoActual === 'pct'
      ? `🎟️ Creó cupón: ${codigo} (${cuponPctActual}% off)`
      : `🎟️ Creó cupón: ${codigo} (🎁 ${cuponItemActual})`;
    if (typeof registrarActividad === 'function') registrarActividad(logTxt);

    document.getElementById('cuponCodigo').value = '';
    document.querySelectorAll('#cuponPctSelector .btn-billete').forEach(b => b.classList.remove('sel'));
    document.querySelectorAll('#cuponItemSelector .btn-billete').forEach(b => b.classList.remove('sel'));
    const customEl = document.getElementById('cuponItemCustom');
    if (customEl) customEl.value = '';
    cuponPctActual = null;
    cuponItemActual = null;
    window.showNotif('✅ Cupón creado');
  };

  window.toggleCupon = async function(id) {
    const db = window._fbDB, doc = window._fbDoc, setDoc = window._fbSetDoc;
    const c = cuponesData.find(x => x.id === id);
    if (!c || c.usado) return;
    c.activo = !c.activo;
    await setDoc(doc(db, 'config', 'cupones'), { lista: cuponesData });
    window.showNotif(c.activo ? '✅ Cupón activado' : '⏸ Cupón pausado');
  };

  window.eliminarCupon = async function(id) {
    const db = window._fbDB, doc = window._fbDoc, setDoc = window._fbSetDoc;
    const c = cuponesData.find(x => x.id === id);
    if (!confirm('¿Eliminar cupón "' + (c ? c.codigo : '') + '"?')) return;
    cuponesData = cuponesData.filter(x => x.id !== id);
    await setDoc(doc(db, 'config', 'cupones'), { lista: cuponesData });
    window.showNotif('✅ Cupón eliminado');
  };

  function renderCupones() {
    const cont = document.getElementById('cuponesLista');
    if (!cont) return;
    if (!cuponesData.length) {
      cont.innerHTML = '<div style="font-size:0.8rem;color:#555;text-align:center;padding:14px;">No hay cupones creados todavía</div>';
      return;
    }
    cont.innerHTML = '';
    const sorted = [...cuponesData].sort((a, b) => {
      if (a.usado && !b.usado) return 1;
      if (!a.usado && b.usado) return -1;
      return b.creadoEn - a.creadoEn;
    });
    sorted.forEach(c => {
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--gris-dark);border:1.5px solid ' +
        (c.usado ? '#333' : c.activo ? 'var(--turquesa)' : 'var(--gris-light)') +
        ';border-radius:14px;padding:14px;opacity:' + (c.usado ? '0.5' : '1') + ';';
      const estado = c.usado
        ? '<span style="background:#33333388;color:#666;padding:3px 10px;border-radius:20px;font-size:0.7rem;font-weight:800;">✅ USADO</span>'
        : c.activo
          ? '<span style="background:rgba(61,191,184,.15);color:var(--turquesa);border:1px solid var(--turquesa);padding:3px 10px;border-radius:20px;font-size:0.7rem;font-weight:800;">ACTIVO</span>'
          : '<span style="background:#33333388;color:#666;padding:3px 10px;border-radius:20px;font-size:0.7rem;font-weight:800;">PAUSADO</span>';
      const usadoPorTxt = c.usado && c.usadoPor
        ? '<div style="font-size:0.7rem;color:#555;margin-top:4px;">Usado por: ' + c.usadoPor + '</div>'
        : '';
      card.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
          '<div>' +
            '<div style="font-family:Righteous,cursive;font-size:1.1rem;letter-spacing:2px;color:var(--blanco);">' + c.codigo + '</div>' +
            '<div style="font-size:0.8rem;color:var(--turquesa);font-weight:800;">' +
              (c.tipo === 'item' ? `🎁 ${c.item || 'Item gratis'}` : `${c.pct}% de descuento`) +
            '</div>' +
            usadoPorTxt +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            estado +
            (!c.usado ? '<button onclick="window.toggleCupon(' + c.id + ')" style="background:transparent;border:1.5px solid #444;color:#aaa;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:0.75rem;">⏸</button>' : '') +
            '<button onclick="window.eliminarCupon(' + c.id + ')" style="background:transparent;border:none;color:#555;cursor:pointer;font-size:1rem;">🗑</button>' +
          '</div>' +
        '</div>';
      cont.appendChild(card);
    });
  }

  window.renderCupones = renderCupones;

  // Escuchar cupones en tiempo real desde Firebase
  _ready(function() {
    const db = window._fbDB, doc = window._fbDoc, onSnapshot = window._fbOnSnapshot;
    onSnapshot(doc(db, 'config', 'cupones'), (snap) => {
      const nueva = (snap.exists() && snap.data().lista) ? snap.data().lista : [];
      nueva.forEach(c => {
        const anterior = cuponesData.find(x => x.id === c.id || x.codigo === c.codigo);
        if (anterior && !anterior.usado && c.usado) {
          window.showNotif('🎟️ Cupón ' + c.codigo + ' canjeado por ' + (c.usadoPor || 'un cliente'));
        }
      });
      cuponesData = nueva;
      renderCupones();
    });
  });

})();
