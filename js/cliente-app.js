let loginResuelto = false;

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, doc, onSnapshot, updateDoc, setDoc, getDoc, increment } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDom7vxzcnnkc5_y3JquIr6TjMp5GX89_0",
  authDomain: "mordelon-52e75.firebaseapp.com",
  projectId: "mordelon-52e75",
  storageBucket: "mordelon-52e75.firebasestorage.app",
  messagingSenderId: "603187538200",
  appId: "1:603187538200:web:8921a78447a2182b5a166d"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// CONTADOR DE VISITAS — se registra al cargar la página
try {
  updateDoc(doc(db,'config','stats'), { visitas: increment(1) }).catch(() =>
    setDoc(doc(db,'config','stats'), { visitas: 1 })
  );
} catch(e) {}

let carrito = [];
let metodoPago = null;
let numeroPedidoLocal = 0;

let menu = [];

function renderMenu() {
  const cont = document.getElementById('menuContainer');
  const cats = [...new Set(menu.map(i => i.cat))];
  const promos = window._promosActivas || [];
  cont.innerHTML = cats.map(cat => `
    <div class="cat-label">${cat}</div>
    <div class="items-grid">
      ${menu.filter(i => i.cat === cat).map(item => {
        const promoItem = promos.find(p => p.tipo === 'descuento' && p.producto &&
          item.nombre.toLowerCase().includes(p.producto.toLowerCase()));
        const badge = promoItem
          ? `<span class="promo-item-badge" style="background:${promoItem.color}22;color:${promoItem.color};border:1px solid ${promoItem.color};">${promoItem.emoji} -${promoItem.descuento}%</span>`
          : '';
        return `
        <div class="item-card ${item.agotado ? 'agotado' : ''}" onclick="${item.agotado ? '' : 'window.agregarItem('+item.id+')'}">
          ${item.esCombo ? '<span class="combo-tag">COMBO</span>' : ''}
          ${item.agotado ? '<span class="combo-tag" style="background:#FF4D4D;">AGOTADO</span>' : ''}
          <span class="item-emoji">${item.emoji}</span>
          <div class="item-nombre">${item.nombre}</div>
          <div class="item-desc">${item.desc}</div>
          ${badge}
          <div class="item-precio" style="${item.agotado ? 'color:#555;text-decoration:line-through;' : ''}">$${fN(item.precio)}</div>
          ${item.agotado ? '' : '<div class="add-pill">+</div>'}
        </div>`;
      }).join('')}
    </div>`).join('');
}

window.agregarItem = function(id) {
  const item = menu.find(i => i.id === id);
  const en = carrito.find(c => c.id === id);
  if (en) en.qty++; else carrito.push({...item, qty:1});
  actualizarFab();
  showToast(`✅ ${item.emoji} ${item.nombre}`);
};

function actualizarFab() {
  const count = carrito.reduce((s,i) => s+i.qty, 0);
  const total = carrito.reduce((s,i) => s+i.precio*i.qty, 0);
  const fab = document.getElementById('carritoFab');
  document.getElementById('fabCount').textContent = count;
  document.getElementById('fabTotal').textContent = '$' + fN(total);
  fab.classList.toggle('show', count > 0);
}

function renderCarrito() {
  const cont = document.getElementById('carritoItems');
  if (!carrito.length) { cont.innerHTML = '<p style="color:#555;text-align:center;padding:20px;">Carrito vacío</p>'; return; }
  cont.innerHTML = carrito.map(item => `
    <div class="carrito-item">
      <span class="ci-emoji">${item.emoji}</span>
      <span class="ci-nombre">${item.nombre}</span>
      <div class="ci-controles">
        <button class="btn-q del" onclick="window.cambiarQty(${item.id},-1)">−</button>
        <span class="ci-qty">${item.qty}</span>
        <button class="btn-q" onclick="window.cambiarQty(${item.id},1)">+</button>
      </div>
      <span class="ci-sub">$${fN(item.precio*item.qty)}</span>
    </div>`).join('');
  document.getElementById('carritoTotal').textContent = '$' + fN(carrito.reduce((s,i) => s+i.precio*i.qty, 0));
}

window.cambiarQty = function(id, delta) {
  const idx = carrito.findIndex(c => c.id === id);
  if (idx === -1) return;
  carrito[idx].qty += delta;
  if (carrito[idx].qty <= 0) carrito.splice(idx, 1);
  renderCarrito();
  actualizarFab();
};

window.irAMenu = function() { showScreen('menu'); };
window.irACarrito = function() { renderCarrito(); showScreen('carrito'); };
window.validarWA = function(el) {
  const val = el.value.trim();
  const valido = val.length >= 8;
  el.style.borderColor = val.length === 0 ? 'var(--rojo)' : valido ? 'var(--verde)' : 'var(--naranja)';
  document.getElementById('waCheck').style.display = valido ? 'block' : 'none';
  document.getElementById('waError').style.display = val.length > 0 && !valido ? 'block' : 'none';
};

window.irAPago = function() {
  if (!carrito.length) { showToast('⚠️ Tu carrito está vacío'); return; }
  if (window.localPausado) { showToast('⏸️ El local está en pausa, volvé en unos minutos'); return; }
  if (!estaAbiertoAhora(30)) {
    const prox = proximaApertura();
    const msg = prox ? '🕐 Abrimos a las ' + prox + '. ¡Ya podés hacer tu pedido 30 min antes!' : '🕐 El local está cerrado por hoy.';
    showToast(msg, 5000);
    return;
  }
  const nombre = document.getElementById('nombreCliente').value.trim();
  if (!nombre) {
    document.getElementById('nombreCliente').focus();
    document.getElementById('nombreCliente').style.borderColor = 'var(--rojo)';
    showToast('⚠️ Ingresá tu nombre para continuar');
    return;
  }
  document.getElementById('nombreCliente').style.borderColor = '';
  const direccion = document.getElementById('direccionCliente').value.trim();
  if (!direccion) {
    document.getElementById('direccionCliente').focus();
    document.getElementById('direccionCliente').style.borderColor = 'var(--rojo)';
    showToast('⚠️ Ingresá tu dirección para continuar');
    return;
  }
  document.getElementById('direccionCliente').style.borderColor = '';
  const wa = document.getElementById('whatsappCliente').value.trim();
  if (!wa || wa.length < 8) {
    document.getElementById('whatsappCliente').focus();
    document.getElementById('whatsappCliente').style.borderColor = 'var(--rojo)';
    document.getElementById('waError').style.display = 'block';
    showToast('⚠️ Ingresá tu número de WhatsApp para continuar');
    return;
  }
  document.getElementById('waError').style.display = 'none';
  document.getElementById('whatsappCliente').style.borderColor = 'var(--verde)';
  metodoPago = null;
  document.querySelectorAll('.metodo-btn').forEach(b => b.classList.remove('sel'));
  document.getElementById('pagoTransferencia').style.display = 'none';
  document.getElementById('pagoTarjeta').style.display = 'none';
  document.getElementById('pagoEfectivo').style.display = 'none';
  document.getElementById('recargoBox').classList.remove('show');
  renderResumen();
  showScreen('pago');
};

function renderResumen() {
  const subtotal = carrito.reduce((s,i) => s+i.precio*i.qty, 0);
  const esItem   = cuponAplicado?.tipo === 'item';
  const descuento = (cuponAplicado && !esItem) ? Math.round(subtotal * cuponAplicado.pct / 100) : 0;
  const total = subtotal - descuento;
  const descuentoRow = cuponAplicado
    ? esItem
      ? `<div class="res-fila" style="color:var(--verde)"><span>🎁 ${cuponAplicado.item || 'Premio'} (${cuponAplicado.codigo})</span><span>Al retirar</span></div>`
      : `<div class="res-fila" style="color:var(--verde)"><span>🎟️ Cupón ${cuponAplicado.codigo} (-${cuponAplicado.pct}%)</span><span>-$${fN(descuento)}</span></div>`
    : '';
  document.getElementById('resumenPago').innerHTML = `
    ${carrito.map(i=>`<div class="res-fila"><span>${i.emoji} ${i.nombre} x${i.qty}</span><span>$${fN(i.precio*i.qty)}</span></div>`).join('')}
    <div class="res-fila total"><span>Subtotal</span><span>$${fN(subtotal)}</span></div>
    ${descuentoRow}
    ${(cuponAplicado && !esItem) ? `<div class="res-fila total" style="color:var(--verde)"><span>Total con descuento</span><span>$${fN(total)}</span></div>` : ''}`;
  const qBtn = document.getElementById('cuponQuitarBtn');
  if (qBtn) qBtn.style.display = cuponAplicado ? 'inline' : 'none';
}

function actualizarResumenPago() {
  renderResumen();
  // Re-trigger selMetodo to update payment amounts
  if (metodoPago) window.selMetodo(metodoPago);
}

window.selMetodo = function(m) {
  metodoPago = m;
  document.querySelectorAll('.metodo-btn').forEach(b => b.classList.remove('sel'));
  document.getElementById('mbtn-'+m).classList.add('sel');
  const subtotal = carrito.reduce((s,i) => s+i.precio*i.qty, 0);
  const esItem   = cuponAplicado?.tipo === 'item';
  const descuento = (cuponAplicado && !esItem) ? Math.round(subtotal * cuponAplicado.pct / 100) : 0;
  const total = subtotal - descuento;
  document.getElementById('pagoTransferencia').style.display = 'none';
  document.getElementById('pagoTarjeta').style.display = 'none';
  document.getElementById('pagoEfectivo').style.display = 'none';
  document.getElementById('recargoBox').classList.remove('show');
  if (m === 'Transferencia') {
    document.getElementById('montoFinal').textContent = '$' + fN(total);
    document.getElementById('pagoTransferencia').style.display = 'block';
  } else if (m === 'Tarjeta') {
    const conRecargo = Math.round(total * 1.1);
    document.getElementById('montoTarjeta').textContent = '$' + fN(conRecargo);
    document.getElementById('recargoBox').classList.add('show');
    document.getElementById('pagoTarjeta').style.display = 'block';
  } else if (m === 'Efectivo') {
    document.getElementById('montoEfectivo').textContent = '$' + fN(total);
    document.getElementById('pagoEfectivo').style.display = 'block';
  }
};

window.confirmarPedido = async function() {
  if (!tipoEntrega) { showToast('⚠️ Elegí si retirás o querés delivery'); return; }
  if (!metodoPago) { showToast('⚠️ Elegí un método de pago'); return; }
  pedirPermisoNotif(); // Pedir permiso con interacción del usuario
  const waCliente = document.getElementById('whatsappCliente').value.trim();
  const nombreCliente = document.getElementById('nombreCliente').value.trim();
  const direccionCliente = document.getElementById('direccionCliente').value.trim();
  if (!waCliente) { showToast('⚠️ Ingresá tu número de WhatsApp'); return; }
  if (metodoPago === 'Tarjeta') {
    const num = document.getElementById('numTarjeta').value.replace(/\s/g,'');
    if (num.length < 15) { showToast('⚠️ Número de tarjeta inválido'); return; }
  }
  const subtotalBase = carrito.reduce((s,i) => s+i.precio*i.qty, 0);
  const esItemCupon  = cuponAplicado?.tipo === 'item';
  const descuentoCupon = (cuponAplicado && !esItemCupon) ? Math.round(subtotalBase * cuponAplicado.pct / 100) : 0;
  const total = subtotalBase - descuentoCupon;
  const totalFinal = metodoPago === 'Tarjeta' ? Math.round(total * 1.1) : total;
  const nota = document.getElementById('notaPedido').value;

  try {
    const docRef = await addDoc(collection(db, 'pedidos'), {
      items: carrito.map(i => ({ id:i.id, emoji:i.emoji, nombre:i.nombre, precio:i.precio, qty:i.qty })),
      total: totalFinal,
      subtotal: subtotalBase,
      descuento: descuentoCupon,
      cupon: cuponAplicado ? cuponAplicado.codigo : null,
      metodo: metodoPago,
      recargo: metodoPago === 'Tarjeta' ? Math.round(total * 0.1) : 0,
      nota,
      entrega: tipoEntrega,
      whatsapp: waCliente,
      nombre: nombreCliente,
      direccion: direccionCliente,
      estado: 'pendiente',
      timestamp: serverTimestamp()
    });
    numeroPedidoLocal = docRef.id.slice(-4).toUpperCase();
    document.getElementById('numPedidoConfirmado').textContent = '#' + numeroPedidoLocal;
    actualizarBarraEstado('pendiente');
    escucharEstadoPedido(docRef.id);
    guardarPedidoEnUsuario(docRef.id, totalFinal, carrito);

    // Enviar WhatsApp al local
    const resumenWA = carrito.map(i => `• ${i.emoji} ${i.nombre} x${i.qty} — $${fN(i.precio*i.qty)}`).join('\n');
    const notaWA = nota ? `\n📝 Nota: ${nota}` : '';
    const metodoWA = metodoPago === 'Tarjeta' ? 'Tarjeta (+10% recargo)' : metodoPago;
    const waNum = waCliente ? `\n📱 *WhatsApp:* ${waCliente}` : '';
    const waNombre = nombreCliente ? `\n👤 *Nombre:* ${nombreCliente}` : '';
    const waDireccion = direccionCliente ? `\n📍 *Dirección:* ${direccionCliente}` : '';
    const entregaWA = tipoEntrega === 'delivery' ? '🛵 Delivery' : '🏠 Retiro en local';
    const msgWA = `🔥 *NUEVO PEDIDO #${numeroPedidoLocal}*\n\n${resumenWA}${notaWA}\n\n🛵 *Entrega:* ${entregaWA}\n💳 *Pago:* ${metodoWA}\n💰 *Total:* $${fN(totalFinal)}${waNombre}${waDireccion}${waNum}`;
    window.open(`https://wa.me/5492271415751?text=${encodeURIComponent(msgWA)}`, '_blank');

    // Marcar cupón como usado en Firebase
    if (cuponAplicado) {
      const codigoCupon = cuponAplicado.codigo;
      cuponAplicado = null; // limpiar inmediatamente para evitar doble uso
      try {
        const cuponesSnap = await getDoc(doc(db,'config','cupones'));
        const listaActual = cuponesSnap.exists() ? (cuponesSnap.data().lista || []) : [];
        const lista = listaActual.map(c =>
          c.codigo === codigoCupon
            ? { ...c, usado: true, activo: false, usadoPor: nombreCliente, usadoEn: Date.now() }
            : c
        );
        await setDoc(doc(db,'config','cupones'), { lista });
        console.log('✅ Cupón ' + codigoCupon + ' marcado como usado');
      } catch(e) {
        console.error('❌ Error marcando cupón:', e);
      }
      const inp = document.getElementById('cuponInput');
      const msg = document.getElementById('cuponMsg');
      if (inp) inp.value = '';
      if (msg) msg.textContent = '';
    }

    // Guardar pedido en localStorage para recuperarlo si cierra el navegador
    localStorage.setItem('mordelon-pedido-activo', JSON.stringify({
      firestoreId: docRef.id,
      numeroPedido: numeroPedidoLocal,
      timestamp: Date.now()
    }));

    showScreen('confirmado');
  } catch(e) {
    showToast('❌ Error al enviar el pedido. Intentá de nuevo.');
    console.error(e);
  }
};

// ===== PEDIDO ANTERIOR FAB =====
let unsubPedidoAnt = null;
const ESTADOS_LABEL = {
  pendiente:  { txt: '📋 Pendiente',   color: 'var(--turquesa)', dot: '#3DBFB8' },
  preparando: { txt: '👨‍🍳 Preparando', color: 'var(--naranja)',  dot: '#FF9800' },
  listo:      { txt: '✅ Listo',        color: 'var(--turquesa)', dot: '#3DBFB8' },
  cobrado:    { txt: '💰 Cobrado',      color: '#666',            dot: '#666'    },
};

function mostrarFabPedidoAnt(firestoreId, numeroPedido, estado) {
  const fab = document.getElementById('fabPedidoAnt');
  const dot = document.getElementById('fabAntDot');
  const label = document.getElementById('fabAntLabel');
  const popNum = document.getElementById('popAntNum');
  const popEst = document.getElementById('popAntEstado');
  const info = ESTADOS_LABEL[estado] || ESTADOS_LABEL['pendiente'];

  fab.style.display = 'flex';
  dot.style.background = info.dot;
  label.textContent = '#' + numeroPedido;
  popNum.textContent = '#' + numeroPedido;
  popEst.textContent = info.txt;
  popEst.style.background = info.color + '22';
  popEst.style.color = info.color;

  // Escuchar cambios en tiempo real
  if (unsubPedidoAnt) unsubPedidoAnt();
  unsubPedidoAnt = onSnapshot(doc(db, 'pedidos', firestoreId), (snap) => {
    if (!snap.exists()) {
      ocultarFabPedidoAnt();
      return;
    }
    const est = snap.data().estado;
    const inf = ESTADOS_LABEL[est] || ESTADOS_LABEL['pendiente'];
    popEst.textContent = inf.txt;
    popEst.style.background = inf.color + '22';
    popEst.style.color = inf.color;
    dot.style.background = inf.dot;
    if (est === 'cobrado') {
      if (unsubPedidoAnt) { unsubPedidoAnt(); unsubPedidoAnt = null; }
    }
  });
}

function ocultarFabPedidoAnt() {
  document.getElementById('fabPedidoAnt').style.display = 'none';
  document.getElementById('popupPedidoAnt').classList.remove('show');
  if (unsubPedidoAnt) { unsubPedidoAnt(); unsubPedidoAnt = null; }
  localStorage.removeItem('mordelon-pedido-ant');
}

window.togglePopupPedidoAnt = function() {
  document.getElementById('popupPedidoAnt').classList.toggle('show');
};
window.cerrarPopupPedidoAnt = function() {
  document.getElementById('popupPedidoAnt').classList.remove('show');
};

// Al hacer nuevo pedido: mover pedido activo a "anterior"
window.nuevoPedido = function() {
  // Guardar pedido actual como anterior antes de limpiar
  const rawActivo = localStorage.getItem('mordelon-pedido-activo');
  if (rawActivo) {
    localStorage.setItem('mordelon-pedido-ant', rawActivo);
    const pedAnt = JSON.parse(rawActivo);
    mostrarFabPedidoAnt(pedAnt.firestoreId, pedAnt.numeroPedido, 'pendiente');
  }
  localStorage.removeItem('mordelon-pedido-activo');
  if (unsubEstado) { unsubEstado(); unsubEstado = null; }
  pedidoActivoId = null;
  carrito = [];
  metodoPago = null;
  document.getElementById('notaPedido').value = '';
  document.getElementById('whatsappCliente').value = '';
  document.getElementById('nombreCliente').value = '';
  document.getElementById('direccionCliente').value = '';
  tipoEntrega = null;
  document.querySelectorAll('#entregaSelector .metodo-btn').forEach(b => b.classList.remove('entrega-sel'));
  document.getElementById('infoRetiro').style.display = 'none';
  document.getElementById('infoDelivery').style.display = 'none';
  if (unsubEstado) { unsubEstado(); unsubEstado = null; }
  pedidoActivoId = null;
  document.getElementById('whatsappCliente').style.borderColor = 'var(--rojo)';
  document.getElementById('waCheck').style.display = 'none';
  document.getElementById('waError').style.display = 'none';
  actualizarFab();
  showScreen('menu');
};

window.formatTarjeta = function(el) {
  let v = el.value.replace(/\D/g,'').slice(0,16);
  el.value = v.replace(/(\d{4})/g,'$1 ').trim();
};
window.formatVenc = function(el) {
  let v = el.value.replace(/\D/g,'').slice(0,4);
  if (v.length >= 2) v = v.slice(0,2)+'/'+v.slice(2);
  el.value = v;
};

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  window.scrollTo(0,0);
}

function showToast(msg, duracion = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), duracion);
}

function fN(n) { return n.toLocaleString('es-AR'); }

// ENTREGA
let tipoEntrega = null;
window.selEntrega = function(tipo) {
  tipoEntrega = tipo;
  document.querySelectorAll('#entregaSelector .metodo-btn').forEach(b => b.classList.remove('entrega-sel'));
  document.getElementById('ebtn-' + tipo).classList.add('entrega-sel');
  document.getElementById('infoRetiro').style.display   = tipo === 'retiro'   ? 'block' : 'none';
  document.getElementById('infoDelivery').style.display = tipo === 'delivery' ? 'block' : 'none';
};

// COMPARTIR MENÚ
window.compartirMenu = async function() {
  const url = window.location.href;
  const texto = '🔥 Mirá el menú de Mordelón y pedí online: ' + url;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Mordelón — Del Fuego al Pan', text: '🔥 Pedí online:', url });
    } catch(e) {}
  } else {
    try {
      await navigator.clipboard.writeText(url);
      showToast('🔗 Link copiado al portapapeles');
    } catch(e) {
      showToast('🔗 ' + url);
    }
  }
};

// SPLASH — desaparece a los 2 segundos
setTimeout(() => {
  document.getElementById('splash').classList.add('oculto');
}, 2000);

// TOGGLE HORARIOS
window.toggleHorarios = function() {
  const body = document.getElementById('horariosBody');
  const chevron = document.getElementById('horariosChevron');
  body.classList.toggle('abierto');
  chevron.classList.toggle('abierto');
};

// MODO CLARO/OSCURO
window.toggleTheme = function() {
  const isLight = document.body.classList.toggle('light');
  document.getElementById('themeToggle').textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('mordelon-theme', isLight ? 'light' : 'dark');
};
const savedTheme = localStorage.getItem('mordelon-theme');
if (savedTheme === 'light') {
  document.body.classList.add('light');
  document.getElementById('themeToggle').textContent = '☀️';
}

// ESCUCHAR CONFIG (bienvenida + modo pausa)
onSnapshot(doc(db, 'config', 'general'), (snap) => {
  const cfg = snap.exists() ? snap.data() : {};
  // Banner bienvenida
  const banner = document.getElementById('bannerBienvenida');
  const texto = document.getElementById('bannerTexto');
  if (cfg.bienvenida && cfg.bienvenida.trim()) {
    texto.textContent = cfg.bienvenida;
    banner.classList.add('show');
  } else {
    banner.classList.remove('show');
  }
  // Modo pausa
  window.localPausado = cfg.pausado || false;
});

// SEGUIMIENTO DE ESTADO DEL PEDIDO
let pedidoActivoId = null;
let unsubEstado = null;

function escucharEstadoPedido(firestoreId) {
  if (unsubEstado) unsubEstado();
  pedidoActivoId = firestoreId;
  unsubEstado = onSnapshot(doc(db, 'pedidos', firestoreId), (snap) => {
    if (!snap.exists()) {
      // Pedido eliminado (rechazado)
      localStorage.removeItem('mordelon-pedido-activo');
      return;
    }
    const estado = snap.data().estado;
    actualizarBarraEstado(estado);
    if (estado === 'listo') {
      notificarClienteListo();
    }
    // Limpiar localStorage si el pedido ya fue cobrado
    if (estado === 'cobrado') {
      localStorage.removeItem('mordelon-pedido-activo');
      const numPedido = snap.data().numeroPedido || null;
      mostrarModalRating(firestoreId, numPedido);
      if (unsubEstado) { unsubEstado(); unsubEstado = null; }
    }
  });
}

function actualizarBarraEstado(estado) {
  const pasos = ['pendiente','preparando','listo'];
  const iconos = { pendiente:'📋', preparando:'👨‍🍳', listo:'✅' };
  const titulos = { pendiente:'¡Pedido recibido!', preparando:'¡Lo estamos preparando!', listo:'¡Tu pedido está listo!' };
  const subs = {
    pendiente:'Tu pedido llegó a la cocina.<br>En unos instantes empezamos a prepararlo.',
    preparando:'Estamos cocinando con fuego 🔥<br>Ya casi está listo.',
    listo:'Pasá a retirar tu pedido.<br>¡Gracias por elegir Mordelón!'
  };
  const colores = { pendiente:'var(--turquesa)', preparando:'var(--naranja)', listo:'var(--verde)' };

  document.getElementById('estadoIcon').textContent = iconos[estado] || '🔥';
  document.getElementById('estadoTitulo').textContent = titulos[estado] || '¡Pedido enviado!';
  document.getElementById('estadoSub').innerHTML = subs[estado] || '';
  document.getElementById('estadoTitulo').style.color = colores[estado] || 'var(--turquesa)';

  // Actualizar círculos
  ['pendiente','preparando','listo'].forEach((p, i) => {
    const circ = document.getElementById('circulo-'+p);
    const idx = pasos.indexOf(estado);
    if (i < idx) { circ.className = 'paso-circulo listo-ok'; }
    else if (i === idx) { circ.className = 'paso-circulo activo'; }
    else { circ.className = 'paso-circulo'; }
  });
  // Líneas
  const idx = pasos.indexOf(estado);
  document.getElementById('linea-1').className = 'paso-linea' + (idx >= 1 ? ' activa' : '');
  document.getElementById('linea-2').className = 'paso-linea' + (idx >= 2 ? ' activa' : '');
}

// ===== CALIFICACIÓN =====
let ratingSeleccionado = 0;
let ratingPedidoId = null;
let ratingPedidoNum = null;

function mostrarModalRating(firestoreId, numeroPedido) {
  ratingPedidoId = firestoreId;
  ratingPedidoNum = numeroPedido;
  ratingSeleccionado = 0;
  document.getElementById('ratingComentario').value = '';
  document.querySelectorAll('.star-btn').forEach(s => { s.style.opacity = '.4'; s.style.transform = 'scale(1)'; });
  document.getElementById('btnEnviarRating').style.opacity = '.4';
  document.getElementById('btnEnviarRating').style.pointerEvents = 'none';
  const modal = document.getElementById('modalRating');
  modal.style.display = 'flex';
  document.querySelectorAll('.star-btn').forEach(star => {
    star.onclick = () => {
      ratingSeleccionado = parseInt(star.dataset.val);
      document.querySelectorAll('.star-btn').forEach(s => {
        s.style.opacity = parseInt(s.dataset.val) <= ratingSeleccionado ? '1' : '.3';
        s.style.transform = parseInt(s.dataset.val) <= ratingSeleccionado ? 'scale(1.2)' : 'scale(1)';
      });
      document.getElementById('btnEnviarRating').style.opacity = '1';
      document.getElementById('btnEnviarRating').style.pointerEvents = 'auto';
    };
  });
}

window.enviarRating = async function() {
  if (!ratingSeleccionado) return;
  try {
    const comentario = document.getElementById('ratingComentario').value.trim();
    await addDoc(collection(db, 'ratings'), {
      pedidoId: ratingPedidoId,
      numeroPedido: ratingPedidoNum,
      estrellas: ratingSeleccionado,
      comentario: comentario || '',
      fecha: serverTimestamp()
    });
  } catch(e) { console.error(e); }
  cerrarRating();
};

window.cerrarRating = function() {
  document.getElementById('modalRating').style.display = 'none';
  nuevoPedido();
};

// ===== NOTIFICACIONES CLIENTE =====
let clienteAudioCtx = null;
let notifPermiso = false;

async function pedirPermisoNotif() {
  if ('Notification' in window && Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    notifPermiso = perm === 'granted';
  } else if (Notification.permission === 'granted') {
    notifPermiso = true;
  }
  try {
    clienteAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = clienteAudioCtx.createOscillator();
    const gain = clienteAudioCtx.createGain();
    osc.connect(gain); gain.connect(clienteAudioCtx.destination);
    gain.gain.setValueAtTime(0.001, clienteAudioCtx.currentTime);
    osc.start(); osc.stop(clienteAudioCtx.currentTime + 0.01);
  } catch(e) {}
}

const _notifAudioCliente = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAWlRJVDIAAAAVAAADSXBob25lIHdoYXRzYXBwIHNtcwBUUFVCAAAADgAAA3JheXlhbjExMjIxMgBUU1NFAAAADwAAA0xhdmY1Ny44My4xMDAAAAAAAAAAAAAAAP/7UAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEluZm8AAAAPAAAAswABJQ4AAwYJDA0QExYYGh0gIiUnKiwvMjQ2OTw+QENGSUpNUFNWV1pdYGNkZ2ptbnF0d3l7foGDhoiLjZCTlZeanZ+hpKeqq66xtLe4u77BxMXIy87P0tXY2tzf4uTn6ezu8fT2+Pv+AAAAAExhdmM1Ny4xMAAAAAAAAAAAAAAAACQGkQAAAAAAASUOCri2egAAAAAAAAAAAAAAAAAAAAD/+5BkAAvTKWI/KGEcgjiAGBAAIgANnZsMAZkQSRmG4cQAiKkBAAJ7v19zhPxPDiz3d+Mdd3FpoicLf/iE4AISu7vu8QsnN3d/d38qaIXxKHFgZx3+IiUARPT6AF1wMXEOIWiJUL5XRHAxc3A3ju575f7xELcOBu7vlu7n/hERAgAkipncHeACB/58uXh9JAv3B9Z/JiB3LvrP8EAA4+lYPl8T4gyhzh8uD8ScoD/+NB999b2n4gLgQ5z5MPzPhiJw+N3/ePJd4iVTwdbnAicIRPfIm5eDHSgcAUES+KdaoaX8u2kPAoYNOLfLF3/rdNkpL+qtI6xhkS8r119Y0dXU6DKITqbmZtETpxHIH0z89tFIlTeidWMW0I57e4Gc83/FXaEesCUREP7Gj89NOmE5c+AhtUx+D4G13LW/tVv4rP425v+4g3tWd3aBvabjOEeMCz/9IWvz5r/+7Ly4O+891P/VOo9mPv7h2tgFT54xm/tJ63u4AphFKUpt702lqQpgQEA8vESwBw/L6uC7YkCQktUrjuOCgf6F9HBSI8Fa03//+5JkFgAE2WXGrTGAAjBEONqgiAASoZlV+PQAALUAYwMAIACulQSDyjTDmWccpcwWUZvt7kglq7zX56n1vZyjBMpjHUYr/uMUxiqcSz9YW14lrjAwOFL+uTOuaZk9R2VvSjdrMLDxy6xZS/zBnXpznEgmU29pbs38J2/fF6e9KdzkuUYcmjlOpTKnZm3P72v+Wn2AAqYhpJAH530c3p+lK/t1jpXV12M7o8FcBBHW513xd5hZXNLjXGBbV/2f//8e7/1VEQ826O7MhIhSOMRlstKMmgmUemh8d2hbyQEGhwaZO0PU+9jgFxwZEwCWJw8KFhDMEMO7DwaI4NhNATqIIfoNH0eQI4uYLiwA7AsBqDdTRgeB/as4iQZZduODvd30pGKfPQeF0dCDDIQhXSblcRVlEQdIusvcz71z6X+P6/Hf9DRl13GiV/3f1/Bv/Ff/736Ijb09ns2LMFBSFGPJxlLSr5LuUdJWd2qjQ1RMouRjf+iYQjt/3bLFaEdb1f2oR////13MzMvsnKhWN3bwOGXWjb7ATQTRDV/klGIMfkhV//uSZA4ABI5N4H494AIwABjmwAgAELknV/z6ABDIgGJDgCAA3NvoaSXyibknkTGFu4uB0B9gDtTIkJ7Z4CxquPBqpTlpa1WR/OfhoSK5iezf/+jPDjvHlqwYL4r//5YzIq96u/uovBe2hQn/nlfPu8eUvf7/9dV1nf/////pTX+L3/9bf+jJGt///3qu//8ARh4jxFH6xBgoFCACgQAABBc+xli7YqW2S9CJBhattmP/XjN6Ivnr9dPSijUPmvpabt3bn3bnSgrOpRUaVZBEAAABBBXzpC+dncHoLckwdBiEyPKiyXw5zlXFjY+kdMRoBcMB5AQGlBDfGXKpqkkgimmgi6boKTTSZNbpopqRSUg6CFaSC01sXy6K6Bhi4XHTTRPHGTZE3ayakVMya3WtJaaFfWyr3eYKGfIsnSRv/RRLqJNECGOIsZh/Vu/+/+JdkhQJIWvbQ6JbzlWabjXlb7GuZ0u71OPNUp7RZfRI0rMLl0y3sWpHvn6BotJrrzL+PKppZ7h0MAAAIVU1f4rDrZfZrsRgV9XYvO9beCMRGVXK9f/7kmQQAhRrSlFziW+AL2AYoAAAABH1KT3MdbNAzYBi7AAAAOd7BDK0xEqToMmMWARHOE3cc8IGzgmrchFJAFdyK2Fyr2BtWIBhXHt1Crd3JysL8C414Ge5y9wXBpYAAIYxh8AQbS38AZigAECi/VtMGXIclcKkU6NT00XqS+phpND///TKZ0kTiQNkbkv///J+geKsZmuQgrbd0rW3vS7R3gXui+xfGqTQRa1wV1JnkXCrObVHuoZokFLwq3tHzyUZ2aFMAAAGAjTmCMydVmbJbudiHGkWrUJ+VT2d2xL4AeddhlaYWhYaPYiYJge1p6YhnajsR7AGdWORKmkMLdp579SPwungCAYtWrP5JGGtNpG7QY52Ued2RRFxKrLo8X9MmxbBQ6KFvauPAIY2Ol1nejSpPRNakqrc1cYV+3zEo//+YkstIyMAbwQ5B///8mI2QgAMLkyAsutx205G1drkyYcvq+2M1rc/FCIAemyq/HNWciiBwpqeLdTr3cJ939fVFK41SZhlIAAAIl4uSzh+mwOEypr0P0tVwaWBoKi1qev/+5JkDwL0UmFO87ttQDPgGIAAIgARtSczbPpzQM4AYgABCABS3cgn5xsaNBiYKJnpzgBBgsiqZlMPS2m5qew1NVF7OzGMpRB+deK1JmEP7QSuXvw5cNSuWSyah+doIvS3aWJtIEISbx4gZzbtGm2rDYv///9aSTt/yss//ys+eCwLo9y8mDoEV///////zpc+qxvrEDxTEAeLuRM1q9ES0JxQpVfLQtIWuiz1vWircoAqU8euUUNYtLq/fF2JPbkoj1X0G2atAAiQq31mOC6cGyqmo4hAetxenxwjNLjhnJl3BYMw7DCNBkM/9GkxKgRTBBAaMAQAFMZlMPY73jz425D+uxDMZdqNyBsT/YTE00pWhl0NzzTmwxnmo1udmo3k7PX+ZSAQFjBoGiMFcBxB1TKRzSBWWl///6KSX/zFv/6zEkyOFdY5WALYZgLf5//+dqyTmqcePI2CSJYc61x1yfVudapxDxu5ZK+tQ7sQhbV9BSjOufEFDWtj1B452KmEiByAMqoRWXwAIossg59nfeiG5ztWP32kPG9EljsvlEzG//uSZA4D9FRKS6PbbUAyDOigCCK+EdGFKQ35s0DFMSKAAYhgGRr4RvBADABBtMGYAs2DgjSgycDAyjQDyKK9mow9epOczssFuxianZqBUtoBlsplrMVFonqC5iQssv/+/3cgiPzEpirFzDgY/WEA6wJBbaQfFCYboP////0kv///nT4/g/JOXR2gOkBddv8p//FfQD0rWxTAf/6Np+X9HWNz7r/+b/L/6/YtP/6//88/+uUJfyK2qYvrDsLk4id29AZqB2SpsAHAqlNjKbrxaxUw3u5lK868gp7y80xEiwoJGPk5qEoYJAapulxJGQADsYH4GIsAohc4UHyaI371Lepn+pvpvgKnkr7OzSuLBsBlYCd94VcrXV7////JKV/HGcmARUAgKgkmCAWSYJQI4oAI1uAJKRyMf////////+RTgxQdh6dOAj4Rv//x5z////8tnZHTjCZ39fSvoi2rp1/Xff//6f/9qd/R+/T/9Kf9/r/6f3/UJZvs4dQ63K2opWOZBOoJwlUAJiteet1XSZg6cauc12z2pTx5++TawkPl3P/7kmQOg/R6U8mjXmzQNKzYkAglrhFtUSiPcbUAzbEiACCeuAELM8OPHpMR0W4zaNUTBvD7MB8FYwDgBSoAIlTD0d7RYTmHNfv9SSNUVDjGtzif6tU/MzSj1H//hrW2ix6GW5LGQdMA8BwxZBcjDTAEIgOG2c2eHqTl////////t5WUAYAB9rRTAjx6///WPqxP/41z5v+9FbFbWdVtpQ7P+XKepVPz2XLn/n//Ty/n//uXg/LvfIZP3vsoy5kJqHaLVz3oTr9o7twkEkzIAG4xmSQxIIpV7OQ1LdUsxSTFWLZzj9RhkzQDANAIBwIJiICLmeBTIYvoYBgQAUmAyAohJLXRFxr92l/7lNfpr///zE9QxuDmYjwYcF/aVxXy////uPFF4pTUiqZgYVG39MZqDBa9dDjxAeBfPf/////y4XP/86PEdwI2f5GF///8iTn/zBTfUno2IeZs4c7a+n8vv33scv5f9f8/Zg2yX//Xc/l3Kf/zfXRZn2XHCcLH/t3bT6lS96lEbUUKyy4gARAbmROy5bXpSsl8HobNG6susSj/+5JkDALUQVPK216skDKJeJAEIq4Q8VEpbfqyQMgv4sghiwh/r1Wmj8ANjQ6EJEZ1GF2E0a+KepjSAkmCmAoAgLQwAJOlnT2280m/61Okm4tAEgKgUURSxbVo2oJkWJEZUPSBIRgZ5xYGMgiDY8KBMkUkUv///9b/8oDZ9b/3RKh0UktDF8W2//9Ruxv0eRZBJCGV8SyIdkNCNP/v/n9Ud7/s+v/8+g6/5//r33ro/6/NUwTDxY0rodlZ0Rjg3cAgdAWHGL9oSkcYAE1dqLN8Y5XhpW11qC1a32kt1J+5K30ZGjwFQUwgiMrlTBABGNuQ38x3wGSII0SAeVa0KEwqkwWzf/nyuGTASAZsxOi2I+gZGIvzA+Rw9DYBsHgKakHRoLkDvGYK50wT////Y4TH/j8m//2QL5VJgNIPJTo5Rh1f/vGVK7NJafUf8XTJBb1bQSrZmrt6dPpui/z9X7bIUgMxVpi/+nXX/p/99qfT////X/8H///AE/Hs5wbI0JUqBDSVAF75dvnzVNbzytay+MQ2+X0kTVIX/MABjGSU1aIM//uSZBCC9HtUSaN+rJIwzGiQBAWEEelTK4H6rQjGMqKAAIl4JIP01H5VDFWCsMBUBkKAAMjiUlv0/sm3/trHPBQVHy8cIb84RI+cOni8Xg/4DhIBlHtAYoDwYjHMIecPF4iH/+v265YHS9Su9SQ9v//kiKEFPVmJiaoNU7qQ2rVUisdBstmn32UsEZ9x7wAQuJZfyKaxMcqp36dKulP+tdlr7V9/2//0+n/+r6emtnZfT13q/pzodNXaSrOv1bhbiqEVAghTAADIQkvy69EJJukm+Tcsdd+Ezw4BAwMQDTC7DcMNeBcwagmzANAeBAAaXy7XaltaqXkf/tYnRTxXEaiDGLdJJRYLpSJkhohMDboGhYKBk4BiPiKkXWbCkCbR////cgz/6i+Tz//pnC0Twb0fpGhMnWRMFJTJGZGlZ2o8gQc+5SJvDu+TvNeulrp/W1+LXf5fPyw+Av2/9/7P+3/t/T7f//6/9G/VY3IckjrUeQ/6iWASL7O3IcuDa5XKjVB11QEAArz+/+9c/9Y/njRyl/ssY80lOYGAAgEBowLAlf/7kmQPD9RTVcer2K0EMEn4oQgC4hHxhyAG+s0YwrIiyCCLGDGoGDOZDRwzHw7DCMBXMDcCQ9LNYEAq7m8kiJL//qohjUCRUJCiG2Et+sXZGEakmFwAGFwqB06tgbJCoGDgAFxyQJNwmDkH///9sUr/4vRgf/ri8JEREO4vrer1NU1akqKyAm7LNH9kPo0vrUgHkL7KrSO/+f/Mk9VZFE2B+KLb////9Cd77fb/U7vVFZc5ihoGmnlb9eRxoAGvt2hCM3vZevUry2rBjM1bBGACBAFjALBHMDQN4w0QCzpFErImQTCNAOMDAAMIAeDAAUmma2o2TS//VlsrBEAACgBUFlAe2/lIiw8jiHEHQghBIBglRABgxBEFnRXHKrGwjUrf/1f1bi3P0vojx/+0fiKCVAWACVOirQ7NW1ZqynTHUfUg/r07rq9dVlljpV3kRYweuWitLm7/I3v/usGM0yJs+9//f/+/////0Xf+vtwbVc379m7bZPowt2+n+RZsjhEAMl4AAABga0e5Y6l8gjcAQupK4YZWqQuGYAwCxgVgzmD/+5JkEILUE1TK4V6jQDLLeMIEI74QtU8jbXqyQLcaY0ggF4oaEQaCyqpiMgYgYERHNkk/et4Xk1//oubDHBtZskkSiavqKBdQYnSJBvoHBegt5FTLRPnjg3S0////rrKv/Wo1/+vKRdJQT+/Vua0GUtnQuX2usgZmXkDdrDKEyt1z2E3zYaABy6dow/3/63qtb1tf1f8/8Hf/78b41xvy///LzCLgMje7XjIwnAuka9lo69hUK1u1AAAGAASnH9//yw/PmO/r1pK+nYxD7EC14CEGhIngwGHgJqYl+MRg8BeAQDkVAQQQruhl6qKaLSX/9kA1MCQKqjIv+sslgtokVFcAiCwMWScDEILFIEXQKbi7JP//6/8k//LBb7ev5KO4YydnQQQWucatE8eRSMl1qWTJXD5TlGsLt0mKFFxo6Lo/1/r+lu1kWqSiWg2WDytrDurQQJ2jqKHy42//iNRBQfzu1y/ESbfwMQlFABRdAABGdhe93ZqqV3nRhWLyUnkyiJfEwJwGjDfDuNI2FkxRgnTA9AsMBIAstsmKyKHc9u3///uSZBsC8/thSdk+rCAx7NiQBEXoEQ1XJ49Qd4DEsOKAUJY46TF0ckBoCFp1Ff/WkikUiAhZMBlZWAHFYc1JFqJb//7/1Zc/9zd9//OHzMPojrm5qhp6qB2brQWishhot2L6Xv6roIfoHxHLLV/UnGTf8lz+s1z/fkr8sHTr/+n7N/v09/2weOjxlb8M3fr4nzlpa/jd/+dhCf929KqEQASbwAan57739/+WHJrKSzb6ruyqzDY1sFUAMRAMAkHcwmAUza4OqMfcFYwUAFzAZACDABVLl2udZwRf/vqTPh/AJDWd0P6ji1IsZhlwD05AFKgw0E0ECMJL//zpen/lgUGdLx7+mW/r/eUiuUBHqFUUfG3ghiC0TnZ6gQhhAqNap/YuBSAtsL/poF90a/v/1mtPvr+v/5RHrsk/+f/9P+uWj7r/ByfN/8Y/m2SiEpf/jUBebiTqCzOhAwAQmGK+z+diHE3Y4ytOQKgBmAEAsYDoIZgoBvAEK05hXTjJ6BCDg0xID0mAHXC5zmv/XOH/+2dImM0CYKACC4zRiRg5pJ/5df/7kmQkgtRfU8goXquyMKAIkAQibhE5hSCt+pJQqI2jTBAJ0ANSGisBIHgYKmYGAgWJuIeqZBnhk3//t0ktIcxJT9F51M5//x6Ng3s+vdr0VN0XTM1K1DOnSCg//xeXBncMpFLO2/mpjTAMiJyfsQ5FKWlJpkW/3I/fTbJW+wM7LwYdWT1kGV1wwlRsk8Y2+XlZBZmo2lyAUApvoss/1rn0tz+fdlGVyNwAiuBAAwsPMoLjb7Mw/RaDVc1ZMYMNkwGgLhCAOz6AY1SyilPnv/zp6HJgivDTnSeJ7+dOHT5eGiFwwHuzAyGIaTxcPxyh2//6v1c1HLL6PqSUpE9+vqSTUiWyyMsrTOrTRZJ3Wqp1pL5kTCdl76uyD1Val82rpQYJhH5LNB6+x8n8jqRY0pWq7/s//6eos4/geTqiPKiwqGXX0v9YfsXTNtHKAABUAAEc5+u//P3zLVbHCbpL8og93FrpgAoBswQgBjESEhMsCuow9wrDAmAvMAcA4u6oM7Mqoqxql/+sqk6EABDAhXSRJ1lpqqqOJKqJsMgAY5QwBQb/+5JkKwDUmWdJW9Ut4DIsuKIIAuBTXY0jgPqtCMIu4kAAlJgIOTBucLhFyILb1V/M3VQdt3MRjDBaXVrZFu1B1+pzZhUdrzMcxUZZ0ZWtYDEUkyv9Ko2lyo1TFodKuqKLDgAH9n22G97/TX5VW56UlsCA1/T0//7f/9fk/+D+pHvahq8d7E6aHK29v//SKf+/BklAAAMAAQCgszHCpyPdiVLZlUy2JmKaQgARMAkHQxIw6DeFixMhIIMwZwMjAgAVMAkAQuSoM0GnmzJvy4XJw8XywdJkdgMFBLJsbvRWzZgdLxdLpDg2UDC6TAUFI5RikmZB/y63+zdFSZ1a6Rm7mQtK5o+6Tam9alK9a4uhxpNVatLo+7My00iyy1NSrSQRvfUgt62rTLjrO1CZ2IZT3Sv6f9m22049bBD6///9P9Ov4W/977aoun+kzKTrHctXXpIZ+bf9fbb4LWcbJUU+0sFTuZtso8kbGqohPBgBRgAgUmAoDUYJonJh7AbH2sCaaGoHxhrAVmCqAcBogYARoGzo2iAE4ft9S+tZJidgiUAw//uSZCGC1OhlRoB+o6It7EjjCALwEr1PGw56skjBMyKAIAuAw8cwpm5PIfrWyKTmgX3A/zsFw4hg9lpM3DORObda+pn2UzovU2sOWZzatSa2rSTdXqoIGCmqK4ac5VQSRrs3dJ1oPczVKiaSmTQWprLWggkuv92KbMtk0y1VCsAAA/q/rb//+/qvK6ZRgd1vZ0ea//tb66F32/0/712/7/rBenkX/6f6+bGu0AQkAi/+Wtfdp+/hr/r0jvwmPvAlWWwMEg8wsJjHZlNNTwwoBiTvF6yMwYL4wWwHzAQAIFgG0KGqtdfe+YN/7OnHcHxASUZuyhg/6krmQ3QkAgMHvICgAI0oLQoiBm7r1vopsYKU+imSc2C00tOhZ0KNe6n0mp0Ua3H8gEsLvWi5vugySFau5Kc4h9P1W0tb2OjYDr/Hk6SWoUnWDb//1v//Mb9v/+n/1Z1QKEcHX+i/1QJp/3N+u+V64P9H/BN97p0bq2xwSABTAAAeNvYEDFZPxyvYf9yFjo0AoA8wHgFjBjBfMRUYAybtYzBlDvJAODAAARLlKf/7kmQYC/SvZ8hAXqNALGjIkBwHdBJZmR0BeozIuK/igBAXQIryf25KT57/nZwvlolghAgDHi+fOF//OF04XTpPCEoGzigSajiIifPHAtwO47nD//o/2piaus3fZXTW72SatCzUJoTpuyTXZeqyNbKt6yqzrXPHJeOHy9OfOHjhdL06czp/P5+fPdERK2hiYn9jWs35S3t+vX/+n6GMmhn/9/2/m/dPriE9/FVP1K+4sZdklszqCAMVpb3BjZix6rcyvSKEreEgEQgDIwVARTGqHTN0b2wyQRIjCMBlMDECoDMEwMCAC0ETIkDhdK37aSbyQIiAsFA1gAliOLJY/omakzyygHtgb7iBZORAtkMLZKARCCNHtSU91/9BkV54TBCzvqXTUpdHru1qClEkftu+k7vZ1o6tEo2Sb7q0GurWt2qSRVfW6ypn6nNEGb1/+X/8ipf+tv/48YNHDMYHdtP//20xEv/6tp/8Kb9Tayt/+rE418SpyKoDAAb7/eb/WOs/+5d1lSzMqgthBCACIgDh0DcGBaGI2EgdCbE5l/BOmEP/+5JkFQuUt2ZHq9QtZjHLqJAIIp4ReVEYoPqMyLmE4tQAjBiBcYGgB4GRBAKBQsOElIuTZlf6d61oFcrBgwAqrL5qTrf01IpGRMhugBOgWLEyXkDxMg3TDsmzVKV/qZGhqoSaEfmqbqZBar/TR/miQiBDGTj6VZnyspFVDBJ9quyOqMr6szmbOoaKOOuagceN9lrcGetgdO3/mpylPmflUp4Czv///I8QvsGQX3+X6D/l+Fe9W6bPp/qyspf6fwzPp0IWUj2tD7HJHUbGqoIQAzACAOMA8DEwLAcDCJFxMDQSw+QJ/TQVBbAQlAOB+BY4CIkIFFGHQSBTS/6mdEexBYB5YDUjxfIkXPlz+ZaLEuNEAs+BagQt0SVAgdS1P6v9kH1WI8LIND2rUi1l9kr+5GCaM9N2TZ6kOpqZxkFM7HsFv442m1aNgRM5w9/YKNSNFVT6wgINoV2tbUh7OGLdPt19X63yz5d0jrf0LhmuCQek0Pcpn34MxGM33aIAAAUAAR+v1c1r+4Zd5ltyHLdzNuDlqkLhmAQAQYEIE5gyBIGG//uSZBKK1GhhyFvUFdIx7HihCALgEdGDHoH6jQjGM6JAIIo4MJWaUtsBiJBlGAyBOQgELTaNDsxG7TN/+dPEMEIwGow8miBAC7/Wg7MYCngYaGKTJw6tRbGAIOPPSda70mU321pyoHptXshOi9N7oj93cUP11etNyfhxIelXcpDMVUb81WRhnOk654xAPwVGjZbrTze3/1dVb0KZt9On7/2//BA8GPr//jjfGHwQGN8b8b/9Fgh/8b/4LxrbkBgAe8pZSF35bTUNFRxRv1+iQB5gOAAGC6AiYsIwhmz7mmJkHyYIIJRgIAKmACAIXZVuh2TzJNN/rWpFyoOACAkAAQOacUktaCr9JlTEiwGKXAiBEi6aSIRADjKq9beivX+hqTEuNW9N3n++pdVSLNMy6WCeTf9Bq9fVd0Ckgp101aXfoboLSSRMi0plKL9a+06FAINlIs1/+vP+Djdb1edf+eWa2z/Lwf////Bcf8A40GCx//8aP/4//4LwfBKPjUd7y3oL1dCgamdmClVUZgIAyYAIHxgaB5mRoPafSH7hnii/GP/7kmQSC/RvU8WAvqOiLgzYsAgl0hIBhR0PURdIsa1iQDCJ+HUD2YLoHQG0MgZMAAUBEXKA+CVV+m9aa1JKDCgVsjZJJEfRHVL9S0E0ooADWsgRFDc5USgEQw2E0HOerqW2/tpBgVTdNtT9VKupClXHtQ2UFWZ3WueWzV3Q2aQNlqvddyJr+hfkHzvMBk1UpalNkRga/rv6dU+6LxX9yr//7//9fnT/CvVr/xH/v///CuGcL/hX//Cv8M4awG995/cP/X7+5foLc7jBDR1VAuAKAAHDAPBFMCYO4wqwCDtpGkMvIG8wjQEjAwAHBwEwsAi7yzK82ka/7Oy2JMeghJBESXkUEdSXru64+wm1FkpKQWYONBJd3q36PprSQ6IgM1B2M1LiLS9o//tNiwuVaTzSeyU91fLXQh7WvEcaNEXEOqPL9MiNny9Ko1kt3ufCuNukA6vU8+v+dkX/z/xLy8t/t//wY3/emN/X/8F/4JP/BfguP4L2fUMVAwAFv/1h+ua/n3rms45RzEBq2IngAEMJGTJkA2/xMKEVQ45rfTJlBnP/+5JkFInUa1PHK36kkjFDaLIEA6ASWZsbLf6SWL4kYoQQCdgFABwFALqhXu/Fp/OGy/2o6C0zIWUFPY2mUpCr601IUXAYKBp55LcjRgrVbpVoKQU1Nbuyd2TDVLWdFaCqKO/Ud0NJiVdIe19S6KmXd1WWkpaCDkYlehh4rWU1SGfAtirNmAIhBgAB/KEiQUT/737ezsv3zGeq0fxjOz4w6zZV8t8GhWXyFdBJTsMb3XoPoW+QrCqlDlEAQEH/z8eU//3f/zcFP2yjNyGJl4AcFmJBRmpScZNGDDA9JhQaPoYEoCiGAQAJ4jAIgQAEl7mAsyoaxVs+75mqeWPAtoRIgYsMWVrU0v9qvcfgBVQrRdmRFDlU2PetTUX5/Zt9ELmkS5syWv/19OOS4+TJevVuukpprmZ1bGxWav2Z1vZBpxJaPLjmhP1oP3lNAYr/XmyJLXpvqp1LLT//T+mvbvv16F7v1J/u8h1pRa1R5ncotS+OATBI2a/FcpV6noP/m8f/Xzf93zWNarLYeg5kyYoCDGkGnnqGEPg8BkfqR6YTkClm//uSZBML9IZcxgNfpIIw40iAAGUoEal7GqF6jMjEr6KAUAnIA0gOhgGgByBlywGEBg2aEYj2SpPN/1WMDwpULAgKoB5P02obe9bkNABPhclKxqdC8Rts9TdXZ3Vdtb2UGw3bZFWpJ3f3bVkqyyQZ01VLZlMugg1lspVZASzVSZqKrpqXSLEdwMDBahqG7lJSl7NwXT/pG9tNj0yhgQOJeqylWq7bquETjKM+E26U7KgyyoMhnJqu3/lvntj7lp9uB9lUCtBwMYFVpbWoNawyMkAIGQGRQEQLhwmLIIOeAEGxm3hgGGEB2YH4DAGeJgDEgsNDKmRECi/1t60B7IUJigNMJHQtJNKzOqy/lcAASJmaFdqYzIi9/otXorrQun1KDzpVO97UfftVSsPstD4I9CykEHQU+1qm2ZNRzS9k6ldFSndMqJ0igZ/BkyMR9ULSIKwTz+tt/2prqv0/19fsn2/0bRs38d06M42v/7j/vGzuiWdr9rrRvX/r+N2/6wMAhKtEs1oB3rc5i6DAy9gFAJMAQCAwIQUTBeESMFEL87y3OP/7kmQSCvSCVMaoXqNCMcmokAgFhBFBlxoA+o0Ayi3iQBAV0DLOAUFg0gUDKRAHIQp9PJH7akv+pFUexcQQhgBsZLolhGvWz36mOBAUG+1cvgkCGmbz09LB3z69Bqu6iBiYHqLooqZk1s/qaq6Nh8jwkPT0bLRRUcdmUaZenF1mp9A6310b+/NayJ6K/eKt1T+zJNudwbet2roK87/zPmv7dvpb+qOxfbbt7/t9H///3DfHO5kXMWuLWtXIuQYZOTAdVTjnNE+6meDtrCF3wAAAYB4C5gYAgGECHCYhIxhvEdomOuGWYIAHABAPU0VTgp16CyXkf+6KnNWDCYA24VNR3/pVJqk4GxilSTZNSIaMMFPX0kWuiq6daOhlIT+gyXRQUtBPT7MtN7TpLHUkKtmVsvSagt73MVamvXZNGmg63U6CKL2TNF2Z3P2o/bRp4Y1T6+6zN79vt/v/6DxEb+MOyciIy6r7L/1mM30R/p+6p//6dUL4LVhlD2jktMlKAgAHP3rWe+3bH50dNT6x/4o76sC1wMANCNPEqMWgZEyDuij/+5JkEYv0aGNHK16UljLmmJEAIiYPkRcbDfqSCMszYkAACAjCbDSMDAE0wEwIAQACvJEFrUmmi6l/qrQWWhOoCzgeATiRaW63UirbrRHLAoM3SpmgxQ9wra/36C7LU12WUxmCTtd1f9Td71pEsUBzGdnunVVQS3XfsyNTOgm7UPqakiixRUykWQLSOuaUQAyYSckPb/t/Tax0csrcxvv//+n//VuocgYGFofiTZiHCXZ/3U+Q1gq5T4obWVBVzKoswD29/uv7n+uat6uValLIa0tZknaMgRgAuZbDGMiLMcl+XplJB2mEmCgYGADYGXHAFEQbbC2rMzZv/1OsNUAMdRUU0nX/X62BvIJ2d6KQbseD9f7a1UHar2UIXLS+lUgv+p6rZis8Ky1R+u1X6QN+BB+Xj8tH6cv9Hn3fTnBG3oCH/vom+3VWuDl23OpyW9fuvT//6+C6/pz/fbu9z7Uf0bp+7/9v+/X+r/974Ibh9NUBAAFlwowIPmygrUmhVyDVbFbxQAQRgLmAICUYGYiJiUAJnpAVIZ04NhhWARmCKAQB//uSZBiL08g3xih+mzQ0i9ihACUgEFGdGQ56kkDOq6LAAJRgyKBbQN2iTC5Cgn/1dj4nIE5AEzHUm67I6ldXUFvw2HTbCRxp//r7dteICedJnKcRkQVDRqNe+s0aecIGED0TqqbKz7h4UWiQQC3Gv1SbQjf/ukx5Nq7O1SaU6f9v/0BH20e///+lv///539eovqpm/UbO9eh11jkdOHVYmYCDv7hr/7zu/ocqK5L5y6zxQMuABQaYSEBjErmho8YMQlp193JGZYGQYNYCYYBYlEq1ocCxO+XDh0//uqxSE5AyORI8fz57+c50EwJdOHZ6Sweef/nD3e3d7VCM0OsyOakrTis/pMuWK11VVdGhv6D731fPfPz+fy5ni+cOZ7PH56flARvqMNjDjv/rl/ptT/evp/9eSF3dv/v/dP/r41nWP+ONHr0Q7t9dtmQdjekf71gJdGWUlwc/9//Ob/72OrtJfwf9QBFcwgKMRGTPEQ63JMGnCDDFOE50wIEFfCgC0MAEYCUC5RFBZI2kXRWr+1SZIDyCWQM8CPe1XZn1Nw90v/7kmQlj/P6RsWDf5yCMgU4kAQCchEBkxYNfpIIyChiwFAV0BT1TwSAPWtstJP7X7vW6RSDiDe1dJFf2uyHbWg0k7fnz7dOIaQ7h4/qSDlC3Pbju+3qBgP/m5lkE/vprf5yX+/+/f+NwfDBudYA3LqoUNJkyGHUuKphvxHIiUwRQPDBek4Wd//ricoAf+v1v7/4y796oL0xFpM769B4cPAQiMfJaYQoEGmOjJXhg4oKsYEEA5mAfgGAGIJgY8IDboYWJAlCNP2/67DyGAQFSgmjo31/+SgJhDi70gmAGYWps7q+6+taSSrh5SktVnt9W66lVvqdfdlMcXV+62W1dPU611601cssQ5GgzWro05KI7g70KMw8Fw55Ppv+sV+Mcb0tt9RP+NHuObxgwZGRo6MH//8djYWP///8Z//8N34vd10dGmpNj/1Ra+//dfrWvl1mGZI6KjSBY4AYIAOQuGgYuIkh2wytmb8E+YT4KBggAPgd2AMZBsHEsOeSpY//y2S4RIB+L///DLZLfLYsMtSzyzy3Lbqdae2tIQiM1VqdamX/+5BkLo/UB2VGA9MtYC4L+MEIAmYQFN8aDfqSSMYzooAQFZjMFOzONR48duiund0bVSLlWVtio4k6+Fwr4YGQr8AQvhYUGhnAdDMDtqt0/9FKiE6/f/++30r8fZOj//r3wR+NXp9/I6K/7J/GHWC///X8ZrcnCf/vP1hz/y/9Z4X9QWyhSsKARgYuYojGn9ZgvBFHR8pOZb4JZhAAAhgIQQAyuKEu/JJASaf9BbvW45wTAAKTx6LSX7VPXzom0l1JUTop5ES75w6YnlzkzZd0tbvUIKxl/wochG5qeOdu8orS76suDWUBap6qt5/OY9I4tp1nQZ2vLMuS7XRPy0f6G9X70P76NeRHS/03olU6fvlyt//2DeEKf43/8N//DB3/+Ox3GxsMjAAGABC9+f/n+97/WN/PUvmM4YaWqQtmYAwAxgPgWmDIFcYVAi5rp16GLQEwYEoEZgBAAInuJTQVjaQS/fezlo1DiwD5Gmgp9dqnqsWBLEmRamLtZirrW1aDpmWij1WrE5KrRap4dLM9svz6RH49ca9I5v5HeRtd6VP/+5JkPIr0OmPHQ9Md0jMr2JAARTgP+OMaofptGLgUIoAAiNAnPpT6SX/r11hu6hYfVpd0kwQIYf97/19K0/Tsv/RvZun1iP7fb//1xnoeb5/xKyw9vm/Fmwg5K/4+3+DQ2iuhPUgCXqfFoNTMFblUr5PwIxMuIWbMCAAIwXwKzFnGUMZfi8w0g0TArBEMBICEtkjqpkw2fjpAkf+iqolhohYiAOgUqk3+5xa9iGDiIifZBJiHjNsrUmtTbIVspSdS17B7p7pz879tBv9mN5+4hohrNzb4FsPTu+hQ+182/wh9G2Rq2cLeeKf/+/f/9X6CWf/AwXHhONISPZ/t4Bfa7IoyEZzwFAqFN7c/lyCgNSRU5lUACQAAj/C/6RI7xMQIForbEmAVkSCUAgKGBIDKYqwqJvSV8GRSGAYOgHpgVgPGAgAKWiXS/0YqIv+paltQTTEUAYkkk9utbr/uOmf5xIif6VW/Uu1kXdReD7E2fpazXb+edu6lCKfOV76rXY7Au+JeLx15qvaMfjgWkmvKh/+KXvo3qLQr9Df8GY9IqHKk//uSZEcI0+Y8RsE+pCIzJFigBAJoEG0ZGw36MkjEsmKEAIjgVA85LlofMPy8WFNTwZsHLalbp4ojUMbDCyK3zTul7A8UM4AiE9+t7/9a+9djdWLfbvVZiA18CMBBAgATcxTIML8FA51yXTLmBjMIEB4wJgAQcBEWtRSaBVrof6q88blYJ4ApmTKXVd3WaMv0CcNnT0huFt5ymgzJVO1NTutVJT1iGP9N6lvqr1rRZBJlGi+/vj8B/452cntfK5usrJjucE+RWD4m0Upovf1r/0vQiL8q3/pp8/tp3gfcL9//R/f9OJk1oP/PQGibr3l/r9N7l+37r/vBpWoAAFwAAgSG/1ll/65u7z7tq7FH/qP+0hYctwYCFmMFxpdiBhHFoB8o+iBn3DiBhCAACwGgoAFZLEmRQ0SX/uzqTUw0woD5NnQd0l9666aBHFV3WkojkurUupTIu7rY1rZ5IKDGdhzUE90aVTK5EkV3eqM9tbum7vfrdWpVYUhkvvbqt15zOrDN5kyYAAfudcB9f21q8Gi/bWud/5t+vurP/8m3///+Qv/7kmRTgNRRY8djdizwLslY0gQCchA45RqtehIIxTEiwBAJ0On8ZAbq/4J5KaY9BOHftvoV0CwACF/v/5T3OfSXvqbuV8M6RnbEEAZiABoz55OxiIDGmZ3okYPgcAjA3KoBQCyGBh8j6KqSKvraqzpHh2gkhhAj1JqUpJWlod1kfdTMmRYhKSbozRSD3QW7WWtTvrFANLP666F5J6tGf3HWOu9sIkjW/SrEGCNNnupuwtv5OFg+MCfn4zIOD1b6/zs+771TtbUvpdHf/unf9fBaDfgx48eDBfxQBH/+C//wf4/B/BfHGG4HAAoAEDABOmtkmJYicfLZv2ZO9q/hIAEwLQEDD5EKM8+TsxHAmTArA0MAwA0tEirInVzoUkf6mVpTEdgMkQj399J009ll1K9lrKu+7qU9VU8aGxfMlE+x1MmA5MvMXCwXCck/d0nq72qUtNT1Nqt/a90KCf1HF79da9I9Yy0iSFTd6AfvMsoke/hkKaf+j/9v8pOdRqI6kzn//6xftT7yfWqJ//pNP6X4P0/I5t6/GPzClgQAoj/4b5r/+5JkXIjUC1zHyV6bsDCsGKEEAnTRpY0ajzS3SMeu4oQgCdDmf93lvmr1NcqyRTtNokABEYFAgCbMRILE4iGYDJpCQMHwCswLQEgUA6WWd23UqHf6C7XYtHkAtABpJRFX2Z2MzJ3qjudFKyIUZopJTrSWiipk7tetNNnWtwoF31Otj8jtOzpZWMQhnZmKtE8qVsyOIVM+zJnGOpXkOZhIomqXZCBQmSFu9JP71RzCWBgHv+6XBfT17cZy+Y3Cxn67un//q3+q+gv8bb4Oq1C27MC//x/p03pwS+3oAQECJWP7/v3u57/f71RztC3Bc5cwKgHmAQBIYE4LZgxCUGDqDieabhhE9CJChA4G0HARF0U4lNYfzMVfrsvm5kHxANeyJMpa+zLRSYqGJrNCDlIpm7G0OJHH6S+1TzZ9aCFNnhqLOpme749/6qx9y2vwCfF3b6HQcNe7SBEqrm5GfX9kVU9MM8flxYlk9T48JMRmZMBT13dYy1g9f7bfRbeu+izkX/+OD7aW+pH/qqP8n/+P/xuA/4L/8HBf4FTw3Bf4MbjQ//uSZGMC1K5jRSvURdAxzOiwCAKCEVV5H615ski4s6LEEBXYPGAAIMAEZAkWH9/m+9y/PL/j8Qk+EbfxiaYgFBmQOG/6mD+HEaCUG5iEg2iABZIeOPu3CNy7EtX+3RueLAxgGpN1oeydBSqaDLJpRrebjxArj3UVoKJBTT5uUThdTNFMTyxtpUBNkpqqTLd20Lda1qqd6lWX9XU6LqOVOlrtevqRQprTzi859fmN1LOj+ps46FT3pffpJ+nvX/7Xqlm31S37+np/q6Lsqfb1T6/66ttd+f/3f0v112hNlQKQTAAILqWP/D9Uff7njd/7MTiHzj9to1MvQCgHzBGAUMPQSUx0qjDCjDAMA4DMAgFAwAFfTus25QF02+ta388aCFQLgKiSFDZ1UGpa1lgoaKSg/hFkqLc1oKUpOopqstR09IYFoufKE8dPU0Wa10Fa1p5mW0d8GKobyHZzdV8+UODqsdefGc9imewIug5JlnkyAfSi3kDrkFwp//TJ4TSO6fz/7asnOya9f+T9rfQvXu//66P+O+3d/dk6+P1+jGKMgP/7kmRhgNSNYMdj0x3iMIs4oRQFdJG1gxqvSHdYuyljCCAJ0IADPmu7/f/hX1v93qlLZrTMNMhSWBABpgJgzGIeIAbZ8ZpkFBHmDmBkYEgCoBAEUBWNNy+bSb9dnrQNiuIoAqooi7IroLZqmZbppoLZZx1B3h4PIajVJaTPZS2tRWgpNaQ4lUVqT9k9bwXwkM3Os+0ociK5LMtOjZ+TzhKt+QqDSYdkg5LAgXKHujMkMsDovB22JQV71jI7A1fwbJ3rsWv/Wm+r19ev3Lr6Ur9v7//7Zd9l/0wa7yUW6v7lAAIAAMAj3Nd1/f/f8/72pBHq0NuAquiAFwDzAKA4MCcMUwqABzluDAMtEEowbADQwEomAlLxJIwfcqJ/3v7lsNcAyMXHdf0HnNKipMxZB54UkFEHp0vlxFzh5R48skmdFGpdFNNET6dq+iudDm3ok1SM9JWPUynKp0KszBmdSNbPZqoYruquVqK7sqXkEEawUP601QE6RqCu//fT/09/jQ47Tp/vWGOvvfzrZ+b9BIfxPwwakV+n2r9PZdv/0p1Ff3//+5JkYQr0jGZGS9Mt0jHLKJAIBXIQ6ZsdL0i3AL4MIoAgCcjlbACCU8/e9d7hzXPq0tx/5ZjMPuzhE8CABGAeBKYIARxggBSmt25sYwAMRgXgHlAAqu3Ug9rGPTyv2sjUZoxHYDZJMnt6Fa60WsntWLstUa3QrVr1R1YwxkREBgazqOXRA9j7xo8co+glYZjRzzvssivo7yOy4jsg1zvFrVV9jIr1ncsSOrjhH06IuaBgIn2/7cOMok8s/9CZUXpd6H+p3/OtOUtPNoeYRF1udR6krXLHdrqkxZIEAQAG/3+8t4XN48y5hlLL9iXw4qdMAHABmAwAcYKIK5h3igGOxZCYIoYIJA0Q4pfKNtKXL2lSR/SZtaZoQA6gAwKLooaFl9G7KVRZbMmD2T0GWykUVLqX66qnd6yMmtJWjpndDfr2Zl0j+dTV5l7EeaH67bxUEPFGqNhiyuvvnOISDBwieOEdH9I6g0TyX9v30g/7Vf/vBbDrlThSpWrpXjP+9lrt/2+ummrf+vyX/bb6p7t3b6fQaxC5Bvm/w/n/z/3/7qWp//uSZGML9DNjxqvNHdYzLFigCAKQEQWfGg9M1wDRrGLAAYgoyfh13lLQwBIwJgJzEOD5NNSfoxdwujBGAzMBMBICABobMpcakoCil+z9OmbDkATCeTQ6K23onVV3fRUoZUb6COpta6mec+7ni35ZN6b/eb2am3tn77+0ZFZtY01TS8d6Zpyatmv/J2GuXo9tnv/3bMcrJtiVeOkO52CV5yT73ZxQz6Kz/Hb6PWl7KzAvd61VLuoJm/o0fwY+hn//pZt5P/+D//zeN/wf//wX9MnW5BQABwBAaB+8/z7/7/n5VOXYrVrPW9DRxwAYQgQmAAEYYaIQhu4pamRoD+YNoDxgLAAgoBYuyxaV0+am+taDOgyzcpAwAA/Nr0E/PJp7tsp0cyDoHpIzMqzTQUhSOse13UfJARXcyEVHqTOyjz6nMhV7NNR1Qp3VC3cLfRTKyKMGmneuPEmuyEQVYfETxlEFKxNAP7nQK85Ufz9WERq3Xl/URBIR+YuH5C5lv9IzzoCeGiX31X/IfV/+25RU6JeGiTUFYAG8sv52x/efl/58rf/7kmRnCdSAZUbDzS3CL8ZYkQQijpLhkRIvUXcAvgAiQBCJKFnTWEC4AIAAIMA8CcwJgWjBpEdMFAMA8HIlTNZCFEhDCgFsWAYLtLomJJOGSNVvRdJIpoJijAitD2g963dtzyVdan0k1BMAhoOy0VM6mtO+nPe1zdw1xH/5HmCC5ZtXg4372c3umqbd1V5BXfG1CpfNtmovtzopsMutvbW2IgI7msdc23GY25uvr1w+4w7uY9FWfc2/qOVF9ecF55yX1m0qDGf+Y4glKTZwV9jV4EGvxJVaXb2OrcNVAQACzf3rXP7+ufrLmrcrmXca+mAWfMAYA4wIwLTBoCiMNIV81T8fjFaC+MBcC0AAAJ3tMa3anckUv1JJvUiQSCA+gjievqU9tLUitaCSp8PwnJ/1mRyf5u897LaxgpI+3lXk/+seq11xLTW/wzxHHxGvUokrp+gupKiSeZGcjcq2+B4b1WRolO6YgAf9cZQUIN0YoMhap3pWlNsHTRafQi1TT90pWpqZ9kUzW/V6tT3/pB/2/9u/9EHy79D3/1+7V7DVTs3/+5JkYo7USWTFq81F0i8JGMIEAoQQpZUWL0y3CMgx4oAgFdBN4z8OQtvCsAMwGAAjBbANMUEWwzM9PzEcDVMC0DwwGAHy6xbVB5ituhKSP70FVKPrHNCpSq/rTW9/uyOhrFxiLOfLaU4yBqRV3PlW/fbQL98T9OerFfMQqr5Ec8qMyHvVlkLfKdShqOUpnIVHRnlaS5XkIwdFHyW8EqaSLg7V9u2X2sO33zf/b6M6t761b9tvER+v3XbG27L0T2p31btwkDevrqYZ//v8ahUADoAKEBC73oNol0uF4pzYyLpHDOi+FCgRAMAIEcDFEJkDlpTADK2GQDCcBkDAeAIG6ofMMyYFwwW/+91Tc+LoORKBiea5aXUZa2rJqqTiWamZgp0FaMOmuPfaX0yHM4yupuTAsdF3M6GlrIQ1ooiUiTU52yfD8nORuDPv53XadQybJJd9nQ9OxbDuThiNAAPWVqR16+uVGaAX71/T///0GjeCH8B//LB/8C0AuN/8f//tjj8bXNj6f+ON4If3jEACDt9/X7/n0l+krfe7+4IgNgCC//uSZGmI1GpnR8rLHyAxrJjCCAJ0EOGPFo9JFwjFMiJAEIr4MGAFGAKBmYEwYAKErOUEfoykgATBjAKMCAAkBAJJio1VZvM+/631zqisOoGbU7dqkaeq6CFOusMgj27utVSkd1J61o/MxGGR23Cy93FxDT+lKEz9/fCXzWir13wnE8S3VXNkTabpEUtiLdfokJKw+GJjO/1laZFlIH+U+jz1GYkaJHofyX/R8y/+X5ddTy5PznLnLy/7LyLL8v+X/1Zl/ewzYkUqAAIAQCAs/+9/3ev7+f/dpKPUvdBTNDAwAQCTAWAqMFEJkwXw2DYAiXMaUJcwNAChYAN7Y28tFlx3/apl7MGME6J7UVqVoV7LrfUpZmTkRFnNakkHZFaS3nEalK9MyncsM52J/MhB8PMFffp+3D+G1+vsV6IXBHf+2n9p5cp/U6xI0DkCgMEAQAOjRjLXsfjCgeuy/2s6HGZGUliPpyIX8r///Rta/r8D9////6////+n/3//RWTBMgAIAvZ6/9/vf/r91sK/a+D9tcXWXEMBEAUwQgPjDIETMP/7kmRsiJQxZ0ZLzR3QMYzoxRQCgg+xnRrPQFcAyoVihACMUJuagZC0BAEZZ4s60ZyXu5pH/62UYnhjQzCCtbT9upZsqt3MDE2dQtBBkakTFjrXRY/fMjoy3IiU5TtzdHyDKdqrkz3BJaNlqzdy+PBmqzoHRL0Rd7RYqHJKiDQbIf6QykUvAoZ9SrjSi9FrVo5W+XKnS/0QAPOvO73t+GeVZLZFMLo9Wy1TqyBSfeMGWtW+CAQkAXsNf+tfc/98r/jrdXKcjUMrDF0TAfAkMOcNY0t4HzFiCXMDUDAwFAA0ToFYdS27pePfrQ6TJk4KwBuli+eRS9als/TdNKfAazF1TS5OnH20aqJkqLIrLodktcK1RQ65VV49R6kZnPPH1P75qWUiHPe0Y7DI1c7HW0xA+weEBzOO4RHAADq3M+1lYYUEf7RnYxiQVTP0aUtBotf4pSUV7W2LZs8s7q1nWH+WM+7zt1rCODQCAwtbp5k1bwtZV4hAa8BkAELAOAkIEwoAQTaGL8MecDowSgCzAZAIAVQRQixEEEKVt02Wte6R8fT/+5Jkd4DULmVGs80twjAi6MIIAoIP6NsaoPoMyMQsYoAgFgge+in1fPl8zNTp0/OS9OGzD6IRzY3OLWpFkloLQVZCt6DFpPLAH3m+z3X0t80T1noKmyWW/GlpaFx2uElgk/5/SXKoGfDNe15KMLizFKq9P8unvcnSRkR2ZHzOalZHVJ1fRBrNnUrcl+y9KwS3/v/+P0///hn/hdUBAAX/p7l69Xv0P3bn3btqXSz3wYGjwWrMIFDGT81TWMAkMc4lX1jJeBOMHUA8iA9DgElQUcHUNGeV9dWePHi4XQrwCNL3/JkhK5gZueLVoRPwsdR0vnl5yfnpcOnPOHi9OHHPrOlw+dfzDPn5op/5cO/Xnh3+e87O/8q/LJbKyuWlXLJXLcs5YgH96t2vhH/Ur/zjX8osV1/z5TXp89dOx5JkiYBHKin4z//4V+/18ntP/+Mx/x3/GEgGj/+Z/j/71Wz5+5ZQ6j7kKBpCAIAMwEgDDBNBrML0QIzEp1zC3CZBAEyb6IDUG3e3KqbHf3tnNEWIJAz6n1KMUTOgzUEVtUokxDn1//uSZIMJ1EVmRSt+bJAwTGjBCCWekHGRGQ80twi8KGLAAJSwpOv1r7JrIIXaVOkqI5NhHjlPHuIPW/RO11Qa0r3xJBZA+wQVEzogWMRFd0W8xpGMEzoIhe5xdSaM8zyXX6b3//qnatU3y/rVv+sZM3I6ldSXszfVHd4X/r0dpp22wtJ/7xSlf/0K7+/39yl/Dn/e+5d/s7RuYzdJgHATg4JgxTBZzRWycMU0PQwSATTAVAUAwEJeKHWhSygRV+tSVex8fAHDbdeuq6J52Vd96w0iuix5FqL6a1ckyOyyR5ej3e6vU7tahyG3Gucl0pU7SEcpL33Hraij524WyhpSR5nhA9ZRpcpOi7Z5VDy6O5f99NNOv9tPj+4yrs+Sdm6L9WHP8f7r5O/+9tGTocbWpIxtdvGfTR7eG/9OAFpAXMB8xbjAbL8kjr1LApbCgB4VBwMNMIo2e12zHmCBMEEBwwHACwMYEERziPTTSb86XJcOS6fMhfClyt3Xo11HT05PnZeO8ZAPsbE4xePFU4fQj4Lp79G0b2YRnvmMOfMOz/+v6//7kmSMDtP4Y0UDzS3CMarYsABlKg+UxRhB+k6IxrAjBAAICv722z8X+4fTodPq3Z5Jlz6HOkuR7pC0kPTg+37e3X0ID/v9vXbwkOu5+lz26Np//bdv6Hj0JZ9qfzt67/VF2B/7e3/oP2KRAA4ACAkABdnoZ9gOBqE/Xhh/2QF9wYAoYDINZgbAIGpoRKGF/jwNiESlrT3ZkWGCaf8k6JANysdBkHwplLVdtC1S6kE0KKa1soKATI6senM+bv163RnFcQf31LMF0X5+cp19wjtucoxrld7Dz2ZWW2QGt3r8JRZM/AAD4LS5+qqv9PukyWLe4Vap3//G/mD/H81eS+eTY+aFsPHgIPgsFx8b//v/H4/+////8YEEgDRAI5MzowF0/GFtuMPu1hU5ZwwDQGTA0BoMF4LUz8XKjECByMCMAlZi74IZ1Csem/3ulWMYKoTApXjhEMUNFVDT5ynnrfRKAiHEd+yfPY+ZYgdFNo+cS2XS85Nm1NPmrufRyizkVas5phxg0Ld+rKaYe2xpIWViKB4gvxawd9U4OqirBBtT2Of/+5Jkm4DTwitHUF5rsjTsyMIIIuQQGXUawflOyMoEYoAAiGBEAVOPV+p6yyxDdfmn0qFClTAhhKraNpGLOXYJzAXU5AZDRwTK+vX9M2oCAwABW1akXSUy0mWt0C+aDvIIIBgFAEAwTgZAxTjCAxa9fAwIB1AXA8EgDidh4HcWnOq/6i41EtrDxdGLveL73rGa+H81hvd7kvu0LtR/Fo0zKeE8cJdPpabkl21V3pb2Q1GeQncE4TbRWWysD6123Q7rXYeOtqXQVCDgmoyBYmrOg7uwyAVSCAbVtf/y99GZUa3g9f/8/37zP0ee6mc3duo3qs/0fQrbezAP9No/SukHg0EWULRHCYAY8oqamY0/sNPqW6MBADswugrzSGZ4MT8HgwNgGzAJAAQkv9HZ6cqNv/+3X7G7h4ArW1N7e31L8qZBg5e7akqUNAuWbL3OdcXFG8FBU3P9N1pWfWoUrTsmuE52130+p5iqzBkzPEuiLZw2Z9scS181EPvmny9a+2PZM9xGxtJ++9xjJrWAXOeMIOH223XoY2cPVM6EWbkoTejO//uSZKoA1CtkxxrPFjArpsihACIwEXWbGqH5bsi5gCKAEQm4Ol2NF+YLN/9qEaL2Ty722PpVF5tX+ukAhAEQa92aHB9Jol1u47mI+3RbYiACBIEpgGBPGEOAcbwI3pkMAnmDWAYDgMQbGgZCnLTTOHv5tPnjpdnyOEXRZ1qR7Ou7Ipo66lUwtyV1OpztA9qPpl7STdmpGB7WNIKn17v1fx7d0v/hiPl7sxys3l/3SsOmwHIT21XGub51APrpo53KzsQGi2up6brR1Ls36df5x4z/xo/jh/p//18/q9T9P//8/Z/ojOjf9R+D6P1gYCRQHurwynmh0WgrUbjDW1AC3ZgDALGBWDmYEYPxpeKumK2CGUAgKXMsbeMzmuO//4NZtPP0sQYERyLk7Nupp6Y+JuZi5qni8O0evu85n+z6UPtvuhqkduhznsPx7nNPxFyyovbNM2303vbU8803iqtGffbopnF1TGnWcVmDpVKb3nN8ubyWtdcH7TesKxXf179qUk1fyVaug53b6Dhv8PwpUqi6fzGfJt/r/q7YggNuT9WU6//7kmSzgNP2NkXA/oMyMqu4oQgFhBFtnxrB+W7AwZ/jBACUmKRm/66vylUAB0AKGyQKlal1PZOssG+VCfIoLLDVAAQAwMEAIgMNgmwMnOBAMIQVAFwFiQC1jPDpLbKR/uHULNl5bWnmKemZ3c6elE9EcHcXsxr4l+v1BQN1EzS/9EykQ11omrY6rGdHVFY8jK1atn1bTFNG0zdqNr5S5Kq+iWadmQptDs9t9BuXTIAuQ3ZdfX16LUsymM7DW1bR1b9P/Df7/mtK1+YyfTr3/X3/M7v/f/9HVa//7hv//qEUAwAHd/39c7n9Dzlf6lWW2a85F2OILDQEJgigHGKmJgar+EZjdBxmCyCkYFADIPokoGJZW1+03//zmDI9gd++iHcIzq0Jpp1Qtv4/jT5p9/U280+uJB81+WP07X73vAVkzXPmm0dYn9FiAXpNNc5Xq6Kc1LHomKsy582wmLlFw41rihorel0HzR+isiGNXiBkORSttn8dmndyxD/+f6tU3Cn5jf/O5pP8+v+U5y5G7/X/l+evG/7l//H7+ns+v2+I1PX/+5Jku4jUF2RH0swWMjGsuJEAJTwSgZkSzzz1SLqyYsQQivgqAwGsAYfv+4458ywxrd1Xwv3Ksw9bYFlkgBwqCyYRANZqZHOGMeCMYHwA5gHgBFpWbOnlhhN//KY7ithaxFriIBue65cjVPmpp6tt3ePA4FkMztO1jhLs9oztvTNFvQ1t+UWlrRojp5pYSJdVt2Y92ebjHHlztZl8qjIS7u7PIyDAVPYEQgMmc8ZlYgQYAC64yIc/9JT00LJMypKiOlk/qYzgBQY6XdhgW2jeD1nJCI2ZAN9/+z+j7/7f1SABC+f+fd6/8dd+tfy7jupXhhpalAVAkwSEwwJCs/roY0OAIWDIWAV53cgbPecf///DWevCLlyoFe/f++Mbpz0C3O1pKgdBBhcSv233cbyeSWu/nY9Or5LHPOfI0bPM8kbe2wmButS/sTfaiZEUjOn2PvRnJlc0YleK7JSVoJGg6kORautJRQN37/2SkzJUg40BB4GAD91/to9OmnRqn0bf1en1k6b1////8aijdZTyfnv11TA5n+X63+/33/5T3qeg//uSZL6JlFtZRrPLRaIvhdjSACI8ECGdH06kdwDJJeNYAIiYib+KboJAKAGYDAExgohCmFOIYaPVBpiHhYmA8AchuqRbLdpN3FJvrPKe7z5iJqPAgJGVI1ebJHSbRQVRZkaOiCXTPugvezIsmxSIVENDUOroq6MqKqqVj9SKik3o/IZjOmte7NXyuV93dHJF4O7nYh0opinICqjLFCAEAD7+jEmyAUGM311zIRSNwU7rIUIBJK2uZPerr2rrqc/KH/VyOMv+n1V92zXTAGAnr+3P56+MIUqvbw2JHfZIJABmBUAQYZQbpjnQiGDOEkYDAE5bpAbI2S2sKBv/8jscPbkTQtPwPY4O/P7qia7d8z+/fIFSHdHH838u54rdENY/fXN1Us+rqWb+ou52zf211x89XfUU+HtYsZMW+bKuKaWcdQwxv6TMKkzuEyvo2yWPoAJVTUkQQP1rBA5I70189/OwETeIQzGkwbELB5yavpoEXBOv/D2//oB5gbYtTtf/t/1qEAMnV+iUvV7U5UpYlBawQWALMAkFgw2wmDWZajMcIP/7kmTGCQQ9Z0ULzS3ALkNopQgFghCVhxjk+XCIx5ckKCCJeG8wRwKAUByW2UddqQ268V/874/huRMI5JlG99FFVyaM1bG30o1gcAMzdys1dwv8XMy6Ttz8CC8PzCtHywgy7WrkPMpY/p+w/oiJ0hfgqF0vq0ETxDhCFqJ5p4RKOEJKg+TCPp5E0nk2AAhEiCIAHk7BXE/p/6+yzovCMZvMnnUXYSsPje007aoiUfkf3o/q6al/0jfS5bPp9/6vp0gIEAQBn/apAh+x35usE1WMAOyBSsQAFGAOCiHBMmjIEmAiaggGkvUlir5/9awOq+zoqkZ7GBhZ1SSYvep9mui3CA+FWbF8T8zfqJOlOVX5NVz0ONHs7aGu58z7tW+rnFsZ+WBO+VIRZur3SEDqCKggAAfv2r63O3t39IZwStG8rl+jCp3r4c0XvR3rdf2v6sev8srl///Bff8Yf//1//gqARkATRAGz7p5i6BgYJLd3Kd9GHo8GACASYDwJxgMA8maylcYdQGBgFgAsVb+tKrePl/+McbiIooWeUx2ECxqEob/+5JkzoGEN2fFiP5DQDTIKQoEYuANtKkdJPiwiMkzI5wgiyi4guY0BhzudiksV6mrc9ERsqq7SmT/xSZ3pD2/WpvXuam7CaNe28bGj0dce0zekhi0Q0IAEjmjaYte19vJZ3XrqHVdNAT9ldXY+sh0/luz1ZPZS8/0Jbb///jde1Zhy0Wf9H9aALg3l+96o6Kk52mo7nxz8LcCMvTUBxcyxQ7N8xDRTjDyvhAAYYXA6KoDKETkKcvl3Eob/+ScJLG3KwJQ0NHCvnHCg8XDUOjw6F3dhq+WBDDJOGuZdPvNFMjPOmMUxQVHh7i44YW/Pr/HX3EfMc0/MkTc/VnDQvG3YJW6xtyMHQIWdXTVK+yRc14nNeqsYEXVIvBYw1ej+39WZ2M85woIQwEu4bT+jfGafhvCw93wx/43/T1uO8Ku2/wvf9P//puFXj43e3DApghhdfk6AHXAGagDmZlfLTg9H47W1jJ8Syp+VhjAGAJMHgG8ykkiDC7BKMBQAktEwGJUt+xUlv/4VL7VYxXh4eFaB13lQszcREcUD5B0xDlayYLS//uSZN+A05dcR0h+K7AxyLjCACI+EhGVEi15EkDtr2JEARTa69DtZkvkSkXZ3I3u1tEVF4Q21r5WdCSxomSo4qV2lFWrtbu6V7i00rdUG9TUs521kWjqlJFcoJLID8pTax9+X/P4lZsDqE7LOm7dutkjd6uy4LN3ZE/BQ/VTNo7f31Oj+yecp6gvXbOnq/q5PZ8GpOnGsIAIGQAGzfznL/f1rX/++7u2aCbiD4qUCMAkLAqGDOBkaXZCZisAVmBuAIDgFS7zLXQ3nmjfmKhrPdjhcb1Na7HPNew4dj1UiEX32u57oky2Fw57d+z+eh0zKOeXL1NWbrSwsvPvmRbvjjeVgywkkUvluUCqszQhlmWB66ogfOl1DmK8ruj/l5FgYDH9ixcJYhPKp2gFRppwM7Jz0+vwKAjjiRfsDgxu3r1/9v/KeqoDA0SAMdjt2dnZm5qbay/w24DS05C3ZgCANGBSD+FQeDWATdMZUDUHAuI/K8cdwZz+Ov/nNjdRbNF9QfyCLHGBfS87UbQPqJycOL2vnM3YO0Zte2R3totqSl9tzf/7kGTmAAQyZ0fJPkQgO2v4oQRiwA8VfxrPHHcI1B3j2CCKOOe4/jf2u/hZVaqbE0evmagstp7Y+nb219XFllXxy8/Pd6te13E0dl08WkWep7Y3RVomA2DtMMxgqGfKlLLE46U/SvoqsqlszfR8oPwL1G/v+koLz/XM4tJuCk/8F+N4UG/ggf/wIfBR/j/6xx/jQYL4+vGRAH7/v51MOY/y7S3eXL25RNyBd6KhhjnJsYNQT5j7sjGEkDcOgEtEbHJ4pR8yL+hnYe44qkGjnVNtxPOMfIivtFkDRCOaqupmdFnkEmTqs8l7syozlT0VNXqPKjTU3RnqSrTHbZ0RyK27MznKccqq5RNjFeNYRmHHivj9PSf+/6P0aDbrf0VuFbppqU/qiWj3eDiLm3T6SCCe5/suap58w+6JeUNk24qFQWJY2hHqRGnbUysKz29L3NY8iQEAlGGaGQZYcCphvBCmBCBAAgBWyLtkUmt7Oz//9zG/iILZHDfvTf222n3e7nfZVr4hm1sn+5nu96f3ePlu63Z37NXqe3ejJXLK9ZX5ef/7kmTsiPStZsWxfluyOazooAgCcg85jRqM+LJIyhgigBAJkMr7Lbm6V0zPsPUp+9g2n90kT/K+Pft3+tTuGco2AQ3nLWgD5SKyH/Wv+sjqVRD2RWe/b0dWhaM4xH6R0nr/fV+602TtUNbjV+zHTiC/9/UqUcy9P/jFPWT3ZNQEouCvKzMJK2gmtTKO1KZJHVGhgAUqgOCgQ5iBBom+458ZMIWhg6AXmBKAgYBQBKBywcWkE5N/9d01k20wRYxizWst+Z9NJlw+Hxse+7gHi0nxMsmJmn3LKj6LXcXDqn7mbbEEH10ZVtpK8oZkD0y3fO7YxxSPERVV5CltjuexKOyD9cgrVHG7OtmXmEEFw+5tsECObptKJXkfv8G0iNcH66x/LLskZWw34+MarKRWpUz4OAA/BQD8fgTevtwcGNik/KCXRv0Z/j4Aq8FJH4B4/p38H8FRGwCEAmqw81LPHMzL5iPwwzNKgKgHmAYCsYDIAJotjvGJ8AMVgNhgBrB9u1nvP7/+IEAAgZxYnpndTDiOxTLuhFQR11DiGecuBEqpxZX/+5Jk7Y/T82FFgH4zsjwrGJEAJSyS4ZsQBHluwPWxYkAgiXiUlIz6Qi5BHUvM+bHUzYz+/z1Ul7mvfObKSH0j8rUJGpmUJ1S2duipvnjrUgGjc9wfo+i9/QXDREqMlrTFs3pUymlam+5qVpOdh65de9YEWiTTqOYXNMOJuseSPrQ5ITGSb975+9ya9SSmi52S3qfT/uAoOgEMBBzFiA02BMH8Pg06o8zE/CBMCQCAFANrwSuceTUHCr/rmJRIimW4fpzZedTNTHtVe/5XmM3VNVJB/U6Rl/8UhPRkYdFd5+mca825l/dzrcer6n++n3/bM4ZbHMmljhyCRvU46W+jK6h0xGoZKwuPHLjLVpK3qKO7VcO/wX20HqvfpbnIf/0vYxFZoVKrKj+T45P6j5kTGa7Bap9mVmY+vX0+1kvcfvveFfU/41DLFUuuc6Dq6wAGQJAAL3p10OuglM5mUdqRt2HnZYW/MBwA4wgAmTCwYmMDUF4CALrKU1UuoqPC4vxx9j/1KjXa51d4u4txlya0HPURWGXtq7hGrxlrFwszTIo///uSZOUB071mRqh+G7IywBjBAEIAEj2VEq35ckjrK+JAIBYIhXqRqR7StbpFxF9cstVcaOvfI7SaFSGPeIaIqa2JloLeneUkZzrvIy5lhskdMbwUqAf5r7ERdNK1vT+lVsuHqGPjh4gC4Uh08nESSSHJacItJOiUlvwG561333qUQSWURXceJIFnMUyt+LiJAgvedW0kiDpEUuuNNHX+f1W4LABmAaB8YaoXBp0tomMUDyYI4ERgLAGl9kqYlIbc2Mr/4KdaHKpaoKjxcwcOGGFigqP+b65i/7sFIJUJWxOIVFxSRf1vbNjYtVdnlburVdroKHTS62ik0+shv+/SYrixZ9dY6fkL+j65FOs1wlOEoSQIv0lPa2F5t8Nq/SvHN+P1/yaqixhZCqfcZ+M0Uhr29b/xuvK97nt0GD8eS396D9QuFCP0f/8Mwr+FhgLwmr+nupahAAWAwJ/P8d/jvWsf1l3esq1PKInEG5jAABcMQELp5oOQOa4OC1OpUsPQ3rWCn+jq4q0fOVRR6CBWV7HZ9ru1VeEDooos6WSVuRORUv/7kmToidQbZ0bIfkNAPARYsQQChJGBnRQkeQ7A5auiQACUyFqmn1ISydip5sx5rJKaRC+NnCa2P2kZ5cbhFW1enL2/ekx/t7MsqIFaaiCwodco12O766YbD8XcArUaEECrkAZRhQMOW+T5XbYmbI0VOqHxbQ0AxW2tqTLqXXNB2e0oBLv/d//uXNY3KW5fx7hukjbDFAwQCMSdNh+MBgJ81AV5jFkBKIgW1+qnZw6Uv++r/X/SrU00Lk/8lUryPqs20350Lnx1N+YlwerbjnqGur+E0/1nu6aSbn0l2E+m9yaaWdJ6XTT/6FyXRuS6f7nf//oP/X6SJPf/0aaTkSf/c9yPpCSv3v1JPEkuVeml0kKBA93mOXumYhavgjlvdd797YcxE7gLnX0UuXOi8KkOMj/6ygMdTAgte/W/rqv7/cr0Z0Lr2wUMPU83eYRFg6aphxjKVQUVgPDaaiFPog0U3h4W5ZG3Ia2g4YB4B5gbgxGGAiqYBYGIjAEWFbJAtHe7xr//yk4EelXRLTV64Z6cEOwYGYRiNQwCmFVkAzBGy/n/+5Jk5QnzpmdHw6UdwDWgGKAAQgASfZ8UrXkyQPwq4gAginh85Dyz9CTyPn2ZOv/LNZesxAl03bPOlyec9H420nkUWGCLeM/qw2I22U6AfNZlmYw7S7bsiGsrqs3TxB4T/wf/4O1Zq9e8xNH/QydaJoC+z1/666f9LP6s/2/r1Hs/oAQQAtVX69Z0KMtA4WFYaUc0SNOaCHABGBYAyYfwhZpETxGLaFAYJQH5gRgILAl/n9hUIoFf+vQ2uMVqfM/HcTPRHuDRc1NlljRVU1UqaFdSz7Sc5an98srjhua185+enzORP3xHLuhw9jK2Zi5kkF7lLZf1d3RiR+WoNZs7JElpCGbJecYxp+L+I7IsjRBHhxW1hyU76SQ0XpGHuxQVY//6d7unRgvtshhsUmGEJwYLwAeAt4+Pv7AgTINro/+N/6eD/6YJlgxuMDAPjOCB//QL/6UABgDgU1a5kSzSQEwDjWqwRBbREOZVDQxTDQ+7l80CCsBCEGACik5MAY55xX/8wMhbsYPjuiSrgdDxdrzdTQ5YscOcD1+U9aWbn3VL//uSZOUA069ix8B+G7I07CixBAKCEsmfEKT5cIDzLSKIIRb4Rpcu2yac5YiXnWUVGl5ZG5Wr5qZ0ZKRZX24Xfq4qr3+FrtLoUdOUqW/HyL2sTCyTaDqP100qyxL8v15sRkgMhmLJAZy3W3yEFZrL/XyfzP////6+t/xumT3ClT6usgTAhEAhdAExrll2c2PD3txh42QF7wYAkYDINZIB0aXRo4CKrCANRIBJ5FnNdw1hd8fxNfN9deZ1VJvbxLNjmJRNOthrDAITM1OG/nFcPyCBjdGU91VMZW67luUtTuOW8PUtkPptcT9bO0jJunRpLOVTnCZ2XTEtOfFe525xxFaJpRczYich1rvW2otpOj56uGgotS85nVDmOb/+jbajY+MUcOHDTnZiM6Sq1TP7KUjDXVlZ+g5V3NHPFYzh+PGDr9P/hoZ/////wtn9vZ/tWgCQASVmcTMzC+1TOgl8YVvSIMAUAcwKAQDBiCNMq1nIwtAVizZbh7GwvJ3HJf/4Q8e0n3wWPlOT5t4SBo4YcOBwWGDxowaOGiwOBezVacQK3P/7kmTlAPP0ZsbAfUOyLMp4wAQlrhHBnxch+W7A/amiQAMUoOVKniq4vWdG5GnJ1a39vXaQZt/dPIy+RtSs9YhXmxJBT1ScE6IjpAeStH79G0tfEQIa0PvGUgnEATDUA882ziV0YRrtvVNdAnzCDmrK5IWqWw0NWLm+CFZzjZivZ1DK39upmWoDHlsOXUaHogQAtm3X9GfDqiqS6SHNFAuzROMIAMBQLZhsh9GQ/GiYbQUJgOgRAgAUFAFTsik0/Qm3dfqpLHEl1jU1NDSq41eYvKjMyU05qIzJyNYUHrPzCjVS/S91GVx9WyFnU+1UrOOv5rl9ugtcZmWpPN9StBgvNVxEX3mLyTMb8l6x2MzMqymDxnJ8oie/Mi2p3a5XmFNHYV2O+NcwGDKTMcSv//Vj5kSl2V1VLRPv6G9Bt3u2kyBPpSy/vWgROsEvr8KyILbuhUrQeqHftwQ/b/5fHhz9FQKVgKUQA1U2OTIHkdQP/2aoicRmn1WkIAfMVBPOxMEMtQ4AwclwlyvtGbWGD///9ypKE8CWS67aFu3xr65/DtX/+5Jk54jUXGdFkH5DsDFDWJEEBYIS6Z8SpPlwgOmt4sgAiMA2IF12YGVu/3h+fWZ8E1ty32Mff8+5W626+7Xdmef5zLPiGuI7FFbDW0FxrZaDZlVps+qa3f7UnTBz3R6LTdl1q9k07gYBBAAAAFsJ1/wVHP/+s7lclEt1bzvIvT29f/P/g/sxakVj3Vn/2/47OKXs9vy6v+b0Xgkig2AJnnS6LXRS0NybfRpaqghAHMAAEYwRQBzQnD4DCPRoDpEVB5wYhvPaN0sjj3jDaPmuNG3qZrXcKo6UhYZRXiRpBOLul1FSo14rSmXOpEK/SPRyFHLutxpJxgazB9HMysl3szESnFHOd5Foyjiir0QOslVjlcVGZACKEQMH/Xy9KfBgCPr32qdeAD4PB436ehV7JfsRWQr///6ff+DB//T//v9+C/0qABNAMUAbN9//v0l6/SUk5r7jzvtBcUf9nDO1SF1zEFjb9zBDC6NGJrkxJwXTASAGFgE0ZHMcuDvvGxp/+O0pMQ2Ky4dwJJjomuopCqhgTF1FDc4bGposmqovCngf//uSZN8AhCdlx0jdNCIyCFjXAGI4D2WZGQL4rsi5rqOkAIngWmFllzRc2Jet/+e1za1lTn2qS1zc1zTo10T/+osuqaLLaderrfqGjQ/Uap6x1fk2jXzy++jX/P66xobq4f5lTW83XVNdQcGqmoaa1AW/EQVtI/7e6VoUSXyD7f6juKx4/1/hSfR+9/m++PhvH+9YV/X/X/3/r2x/wey9sK+v9pxvpAQQAI6R8IqrXTpn8qUcUd9liAMwGAEDBoCHMBtbIKgmAQAsdAAc2LWL+FYhv/+9WKjRVycciaJQpxVih1c35VYckFMLRCpGcgZvYmImPg2olm0jmbfCfoohiMiUxlOdDD9GWkMHIgaIRgzVlcZoEyQETgKOfQhEvBnQG4qJBhAKn63F6/EdLfNf11LfGBDn6AXuCl6ENcrVroStT/yAtQ5j6h7vJsRttM+jdGT9OKKUmToAAYABgAW31ufI1ffmsSTm0LBt2Y8glMAcBwwtwnjOdYVMO4G0wNQBjAOAFQydmLS2f2l//w33ddVF74iFpq7ojvm3TXxNuXwkef/7kmTtgNVDZsTLXlyQNmzokABFPBBBmxikeG7AvxBixACI+NdvRy/bZ5VNTatLUW5icayylrek4O2+56iI7881Fsl996n8uc+99VJS2WU1zOH9lswtTZl0+gQMdRLu4umGfDVy8pskpAECK6oAj/fyv9f1+6qjPvUkOFOBKGjwO8egoEOxppDLun9vkE7P9P7lN+p1f6Bu48NLs9YzVLrqXaSA2kKHiIAwEgumDQBuagA8xi7gYGB4AeJATFwVpPrlUqTdX1978OQNzLZTnjenqd2g2muE4aKAcpl/EbPxdNTbb/M/ffTsJH9a5Z13WZt7daRJlmtJa5gypVrEbhr1j5NK87sRt3KeLClWwjpKW4gsINRJA4KyEBKNDrx/wf8bX0SheEevFIPUJ1o52iRKGGpFg0H/Z0PBKZv8rg0ZI7Ub8cH8C/BAh/AOD/////xv8FUAAkAGACQa5ha73mX/eszGp2U61qG2ULnL2AEBEwHgajAcBbNF9DQxEgKAMB2oQXKcmUS/fTfd/54rUQkunu16sabMY8TB9YMC8DJfg9//+5Jk5AgEdmbFST5cIC4DiPkAAgQQSZUUA3kOyOmvIoACiOAKW4jMWtqSfL8Fb/BSiVv8As/5X/TZ1LcU10X+V05/d4xaCe/abQJoS7fuHnHgutBZEq0iX874B2t0o2JUFvbm84xQEkwFAmwglSSVwf36r9/Svcqaqv+REUxvZZXYKT/ZLoZNH/fKilag/LbhUNarXb1kCa5Lss787UWyTxmDBO3rt915/w24X0yADdxnZdwwFQGTA/BsMTRHkwSQO1pMBi0Jp73dz1T+PlSRwQQwaYyLs6Nmf2lzjHNfKYsEeLrynrC8vKWEP3JzpZGZh/0Hg/w5K0xQNNE/7OMgknphnELhh8xUWwIMZQFd3hjKCKwoNcELFfxb7nMgBC69QZcr2uY9ReSjHJHa3M08p8Fb/v02+f/6/+//Ax/6zOEWDBwZP+3/wX/x/FqSqk4+q8Mj6dMxx9iQQ06rfKcEwBQQCyYewe5nDTIGIyG0YGgFpgIgFJoruhL51NNUr/jUMR0rukzSY2Ej12eg1s8qtKiiW1Dh5VSuPNRCcw7XcdPW//uSZOYJ1K5nRUvINbA2JzihACImDuGdGqN4cIDVMCKAIIm59pqdo6e1vtbz6vwepOyorUVT1EoLGVZDHzUr5DsuUUVejTPp3T9Yysh62uqs/bcY1FzC2UsyuTNjRCstUOuuGoSwXlCcIrbIysVgWDXH5aL1b0a5KKbYOv2V3ru+PXBfGT+m6Vb/ZY3/6NfBQQ/4KP43gQ+mmN4/VQXhMQ9n0VkIDM7IiWysjMghvIySBREdaokqOhoY5iwfv5eaMCCYXgIAADR6aTHp2vsZf/jVhmxJdQY29rPdMzoIVJbyl3N2NhxHZZHviJF0tO1xL2XcTUJMTaTTtRhFY2n5YYpY+mZrFvWHW2WzBaJn5Il5mFjSdzZVYoWmkm6YfDjXD9MLi9i4dZOOox5EA/6fYrtdkojtUyMq1vP4ILQEFWnuz0XO/jC7v62aNDbXfOIW/RKksVbJ6WoM1QIBATdr1WoCJbXklqQG4ClYIAgwLFUwIDw/2g00dBMSDlr6CrcpLhc4d9HqyuxUYpWd6BL1g4esEYwbHY8aOZh+rSIkJXQdQ//7kmToiYTUZ0OBHluwOCrIkAAiJBDBiRbDdRCIvg6jWBAKCNbnrK0qlUyJkbSmV9MMR9FQr2mMxKrqhlV0mOZnUWmeex3dnXibLciR4440crEgAB+rrv6pt9fRrrL2epXzAyBmOt1/I9xjUSM+jbRk5zf2A26NgqX//////j/0/X2f0C3/f3P/TT2ffFNXAuABd6AQwBwETAwBMMFoI0zT2cDDEBsAwE4WACWY/L8S/noUv//zkUUYSpuB4wm/Zy+TFGXN6fTrpORIHk3WYWJ1EXtvok0XeliJJC/+0qtNJLof+57no0N7zl9LoUuj/QuQ/oj6NB02u/p9Cj4f6/SS7noHptO+puSckl00L9TEqVHUjiXDxxM70Kab0Qm73u/48ZF5Vb/+ur99tSdWKiKimR2ruzcwZ0LV8bwXx4Pghho4wOCGgAIGDEwMcb///Gj8K/wsN8Mwv//w3hYb/8K4agAEgIAam567DAVzgqCT4O3GIfWoBgFzBjB2MKNOMwOgSQCAUyFQZpt+93bf/7IWeZhy1hzJhjwZ1aIX0XpswRH/+5Jk4wnTr2ZFqF0rsjIJ+KIIItYTlZ8SBPkwgQSy4oBRF9CPk6f8ckPSGRQ/oWSPDHKQ6a5mccrxMx88FSNMegxZ0iwYIjGPBGLXFIRXYzd2bQSXpSbQEl6DWQZTRgAB97Ard6s9fnqsbqSMal4rjXA6Xs0fSt6ehcr8bUnlXvrou3ZM6+nXpx/9fH/QZwb/9ugAAEqADJN7icN+mowLM5WAKckz5uDKoZVWCgDpg9AymYwg4YcoGRgGAHl1lysqq2rGFXL9//3Jqiyq/y7y18HUoCGJnyJyR1O4cXVykRVYmQyKlYF0XMsOJqGhqZEpruSMWzHg+tVBrCChbqZFrKdD/210PJ4+TDd5SohCJtmqTYgMiGUei3A75ZHbdlvqCZ6Tpb16rZM5UynzN0MRxvovutC01gsqgzA/X+v2X3c6tVvr/0R/7cqLro+uO9tSIcyLuioBBADGp6kQasAms63EIDWwMgKYACAUEcfmiaaEACYVgETAiis4Me3ntGRE0OJTlY9hYt9Uofs9L1BMgUgvLQIjSpjyKzSJWqE3ePQx//uSZN8B09NmxkBeG7I0qqiyCCVuESmZF4N4b0DkK6LEIAoIFKVnF4o5hdVOO9xKUVZqy+4NV1Yy323NDUVG5xEOOWPVYqHGLC2ETLWWsJzgCRIIkEAB152M0dq4Ypa/eviNaGoxIBj8OlUCq0ttL1Mt9NA6czb/rJ/9vZ/RFtXkOn4tRawxwt6+Wd1u9/zvNfG38Z2nIW7MAYBgwLQdzArCMNIZaUxVQUSsCYu2W9cJw5zVh3/8K/7E04m7njVMLrfToTiGOm3cRhidQZDrniZm8vUUlR3wZqKfRtljaKe/Sen3dad73+3F54k1zmUcT3eRmVIfD8TaBFcbRoDOUtA7+m2NH/KtK7c/ZQNFizauxDYog5cwx5jBHNADGVWQUN31j/XnsDIDUiEVLQ6t9TUuymvR/G2VLlCnKlxuXKjcoUynLJy/LFC0vhLl8oVlvLymWv//GP8T/poRSoA3ABXf+27a+qKNUsrCAWGi7eKnMBgGMNBHMgeKMCg8WyzB0bU529oqfjB9VERqKAlFV2ZLswfh8aocQAQ80VDwWldzpv/7kmTlCYPDZsWoXSuyM4V5CggiiBLtnRAPLTdI/SmiRAEduIu2KUnVthQVSPpVo3s+ZbTvk8jKMp2dkh2Z1vZx7OozLHvoeiMjJVNGZiOMALJApAA5ns8y4zzP/fyi/vemoqQ2KXyvChd9HrbS/I2pva1kqZCtSvYn6LU2p///pAoJX6iusgTKJ6CLAQV2GBRELb1eyKJgPgNGHKGsZ+b5ZibBEmBCBQYCwA7Ckxaaxauqez9dQ0VXQHo6bKGo/Gih44bysaqLGy48VObHljZXWUNs8HfWU9ZXVzafNTXVXWNzQ38Qs2VW9fn/VIh/VV81VXQVw6qa6nSix1c8vwp6ikKKrKLH5X1eF1VVDnkQePHpZYiEYiURyI9TPG5oPIcE6w8qGueWgn/jpHV/8nb65cyF41VB7zOqVwZXoMr/+VuVf8bt+gP3+CCC7/fGvT30q1v8KLmt+3uN023ohRN1AIWBACIs7PlhDK4wSWcqSWYj6fhCD5h8DJ1cyRlyBQCCVOJhr7TOWHnf0nUQQY9aOraO71K6bqbKa53RqsQiiLP/+5Jk4oHTrmPHSN0sIC4D+NIEYrIU6Z8Oo3lwgOKt4kAACAgyOdGOdUH6o3Zzo6PK2807M6HMdrmerWZyPbUjYxVK00zO7HY1DkdDVZGiTEI1rMHxQCQ6guOAEaVRAoABvYKOCQ69Pb7WZey4PTrVU260qtNfZcpGje/s/Z/U7k9137yH7vo6RkmZqVaonZocLsQhuGFzl9DADAXMBoGgwCwRzTnO8MWgCQwIQAkDCzTIY53Pp/55/pW9EqQ6p2Eu0leSrr+5eLRK2pXt3+/yX3djjvKNYrVb3S/ToMPuOzvi8Je37j+o0wlufv36lrcIR/e4agsnj7vxelefyC8UIfYGvzq9WKbw7jWeKg4N31SsEGp1sIVrMlFUA+r5bapBqav/vnu+DwrHAtquluOvXw2/thuvzrRf+vCF6f/P/oe3VH1k0Pd6STH+iqW/6u/6X9npURJ3igoAAp8d7BhJUJXiQZhAHFGdpCGBIMmGYsGqnCmHITrEaXF6CnsdxPgynE1TFkbyUiWSVzaOtTU6TyZoFCLj2XfUnMyRtCcU6Qma//uSZN+Bg7pnRsB9K7AuBZj6ACI0EkmXEAF5LQjzsyIEEYkRE5tEZxdjhLA22pueQJySModHKBombtxndigpAgkBEw1ZyXZyBlFGDLauDcgyEhglAQSZrKUt431dNYtJ5c6AdL1IC7qnPRWTLIAkc19Ln+BGiqNa6F9VgcGMpSLzqCeqKek9QWPcb5e7juBUHSjkdwu4y+BHmXCHABg4FgwwA3TIygIMJEI4wEgHwEAEym1O38MNqGXqgtJrl1h8MGjSMUGMLAYB0CpXjx8mDBYYMgU1gDy59bWbSbvm4eHigMWL24e+he2cJLnodFTctZk1NxF3q/aWiNDaL9jKJgESQnZks/5lELkEV+pR2Db2CYi0JwsBUC1WIEi7f97M6HJY9P/dUVP+DS1UGmeyNpdJFJBUaX+s/11k+M7ar9fjsTt1X/6MtAadWaTt73BOTHK0JN1AFoClBC/Z7HgYawqJDy2lryi7QMpGQWMOQuOQZPMqgTAQJKAulKabHPffL5QYFYDI9Vdd4yGX5EY1Joxsox1Sq6f/fpyOfWIyY16h9//7kmTkCfPkZsaofRwgMgFIsAAiGhKdnQ4jeQ0I3SyiQCCLWByYn3pIcuRTPM7P+fIC4cnNbGtbL5TwSmUZS72UGHB5kYQHhjj4LR9OgLBrfb9Pp9esrhtVrB1a4fxt//vn9cqfv/990DPWPjB79NOm6+uRPb7b8bUYwrgIOetn0hl10U5m596wpoTbkl6+0Rh6RAVAJAgFRgThNmCYBUboxAIkfkYLwAoQCmYBQA6HJstypUjjnZzMfpVz1rxf4qZBZsZVe4T83cmt0jNF9PZihnHJ/93sx0tP/eYqx+9d7p+zlVA0o6/N6Zl8ncWo/V7QbOPzVZxX5p9noumNruRkGdKbifdhvZ97IVtKIdXCdbC9TPhXAFxrsXFOxTGTyV1CWXdIIfV7tURYo+bG8EMoaOoNHD/9tPUOSGjK1xzTqaXpGm4z/xlfK/0RdUZ7+VvN/wH///j/8dHx8d/4V//+G/FNMC615IKk0hYeMADl2Ym30Z2hIMAEAUwIASDA2BxMwlOIw3ALA4DNFRkjw9o9+Ob3f82el2zjUj558PnyKZ//+5Jk5YDTo2dGyH0bsDWLqLAIJeQVSZ8KBnmOyO2zIkRRlsi7Shny89s4ysnhb10ofdyk8NX92UJP3Q/cDcfg7N1r5ez2veWzJ2nWKK0tGtoY31v6NqEer237AbMMsV4H5eoU67sP9LMhyIfBGUGamH8BHYC8EuzmCSA0H17PtB78mg2R/u//hJCLVof4PVuN8ZY/8n7t8v1J2/3wbRxhvBP/4X+qjWb6Yyv3FP9aQX88Ms8Ofas/nyrW1levU8Uf+WN+mACgTMQRgMAf/BAbkIDPq15/Y1Y/YZGcQdZzQVR8TQCvIZBjeUKdlXzoHUZpysdNdstIysW2fHl5RDGpRaxrcijlkRkrlpbGLam8XcheqVjVmNWYzj82cTvPMUnsVtFKdzZZoTGGTBnfUUHkBkWVutOto1uf8lP9X+i9BECX4O1itrl2K/V6e5Pb4X+rkNP/6eg3ml3qAYkEO5TU5mwqB6ComCcpSw4GAGYoCKb+ZwZBhsYFAWpk+sajOWGqfllFzgzfoSZKnrmQKAvbPCMpieT/mTZ1vuIzXsIMdNg5//uSZNyLBKVnRIB+S7AxCoigCCJeD8mTGQ6M18CyECMYEQ2wKC6Fu8v+2oOSUQOl1ubE4pxZmFBRQdz5gxIjLwwXBoCGUmEEN4ZLQNCHUV2DDYQ1eAxwP/RfgCDdv/Lo3zRMK1MULohkAL8n+jA7G5GCzI/RfzjLmtrX5FHfKz+N/+yr9Ku30/Hai+R8KzxhMAOmwwhAUQB4Yrgsf9q2aXBWBhmIgIQlL5iWNvfz5v19i5RcWWF/PCevvdvfKhv0PkbFY/fWZuctsjr0SQd2/0tnNksO0KTD6BuF1zo//h28/5o4CjP4oF3Y3jLcGnSLtmBwrN0p2DCWoWzQB5x2AluBB60KMGB5DgEunYBMB53zEDEF2NYuysR7epF41VUKq1VWii7lUi3GgbCmHxgyuMDB/DY78NjB8MGtCvUd/8KCo4N/T1//6bcN+79dOI3fRQWBSiG8P3+vxy+h/LWGuVtXZx/30YGW4MCw3KgYHUVVmVoIoksvWLBVfD+Dd/444GAgMcYeBggEAiwMdqhIOozQIFnHoOEeA1IV4IK71kpuqP/7kmTjCZPFZkYofRwgMIlo1QgirhFJnRIDdNCBBSkiAFAWCIhHRVQPGOstkhZYYoJ+GQ7jGqpWV6TQTtY7mYG7T8KrZOb7b8zPZ+3g6cBSGYL4MGORV6UGKjdbb/+tVRGV3RGtUgZQqoZuOgMfBj4PwL///4Nxh8YYGP+MD/x/YDG43//6L/Bf/xgYL6QQACwBAAFj+4at61/1vpu7rZ3LlSH38h9lhdcwEAGDBCBpMQlCQwNAOAqACsMYOkj418lcHehALI0aQepyH+Vtyt92SL+3sO0IrLf1+2Z6X3Sf1v8531lfbKXCGHSy2KQNOoyfbO31+3Y9/RB5NU78t3LKL1+TzXYtymIGLiDIe8mn+ak70FlLc6CzByZjktIJKJKen8f0gzOZqFEDL/1+ymZkgY6M0zMIGyMCyJsbN5aMNbxmOb8THwl/7hWFf/wvR+kBeNv+KRg3hqPoABSAAFPubdNLCcTLI5BsljQqWyJzS6RiOIxqzuJi0FpgOACYMextcz3PIvwzBw5Gl/4mXsRrA/5zB98HsK5SjpO0nvo5LxD/+5Jk54Dz+2HFs6I18jxMeKAAYjgSfZ0XLyTUgOIpYoBQljDbM1RzyyPq1nJSzhlSZ7UzQqxK/sbPNTdVas/q6nVIyVUpIeiEIcuUU47IGAAGUAAMEA99dFsLVlBgYEAj8wDFTKT3XQdATIjtpra6+3KyWrVOi1r9W/dP/f/////4P+n38fmAY1SKuad9g8DjFjBaCiXwU7FACCEFEwhAZTSaOgMWUF4wOgDTAFAKL6s+hnKY1O1XccqWI4uHtwlj6FR2VtIoOHY2cuosGY6xiBJRWtqqtMj7uOCJhdbQdWYtZ3TdUvdNR12ICSbcCMtJTjKvJpkeUSSfYwMBefqTg3ERSUCLAw7DMaWCTAiA6QmLEFi+1A6o0DIjAQvt+FRgWAgSBceP+N9f7qVq8aLq0Y4/v8d0GeN/Gfxw/E3SFf//gv9dxmgaOpjHtDYUM/DOf4Z8LjhlMcjcKxrxrekDDQDN3I+73zFIdz5ZgMQ+7KEjwAEACBc5nVIWUwWCJzGdQTMZ72Rf6EHPAQ3YCBBoVJaUzbMdm4x6qrQukxNn/Wqc//uSZOKDk6xlxkDdHCI1C6jYCAKEEtGdDgR5EIEEL+KAURSoJo6Fytg3MzSQZzNmhVCTsaCjRYyx2druR9CLTIRK5GaNvSlHNBsEtnQhk5ZQbQS0ShjQ8AloIRJoACOcB4x5FPsb43OLEocFg8Z0RonDDybQmYW29CU8nxla/s/o9j1f72WyIMAZ6y9+R+RQLXuahZgO/jOy/hgWEJg+JRthx5jOFKKC03vrV+d9EbRBWNZFUi1YY5FHjFnbMdeVumFlOqJabZ2ZkKWZXQ5FNO5XQ7za0sdKupSqacm6IrPIQxHOhkNJQ5nwV2ZlmUraODibusgTMJrES2YAaP+vgvwO/qfV7KjVQZEuuu0240ag+IbqNQ0WqjoejtLX///8bjeN0Dcn9v8ff4/X+1df3JpYd749SgCAAe37S7/dW5Wvc8MigVhiTuYgeCgKDCACbMQZegwTwYDAMAVWGGdMn4VG8s5zkIpw/56zVTRfGruqQt+PrGJemEG56xu6y55s8/0/SS0dW06UY3liMfbjy3UF90p0oJbgve83D34MzKs6zv/7kGTggQO2ZkYo3RwiL6DJCgADAg7FixajdLCI37KiQCAWEHmib1kYjsD90XfdKTrp41uDs+VO4b+nj/spqZzBSiXmdu5mxUucMFlioXOny9Tf7YbQ5t+18vUmFPQ0xlavobdtuOGjONG+NGhfoNH0G/8dGRo/HgNwKkNjg8Mh7HfgLHB8an8d/hYwcNjwoZhQZ/////hXpX1Vp9FHsOkjsFbceaSFwMMUQ2OQbDMoAnMBQCSFAGB05XmFRZqGmaSZ6uJlKylTXq6fVeuhtfFH2pIxO6+mlOWmGSJ3WZZYucQKuKaXm7hUvKhJtLjS4kYzzHV1Q/pFV3QiBBSORMYwxlgzEkiN2k9vMZXRLiCrEG96JVS6WUHv9/LvVzxe7lbxBq9vVQzpfohB/Tpb/6xDan/+tL/x319N1f1hn2/guX9X+MoCjACSsy9WuorChAnbK5nDEreBn5fQEhqBgwPHgxGnCDAZBQBKleKrrDCd1cmb8ak1hi8HgoywGGDOS0jLsh8Y8MU5yj+xGcfeUgn8rDU2Nmkrp0yzZwkFYubkjv/7kmT0i/TUZ8QpPkwURkzIoBQFgg8dkxYB9RBIy7FiQCAWCN6DkccjmUUigU+KrTdVjEoQLPCtsikq4IJLxNFqayC95NRKuSIwSOTLO5fvlVXJpWoLTWuE52yQ0DQ3iibedOObfbA6jN7Js39oU9nByFQ8ca3atGY7+WIOIylwkwS0I+EYp9WLnNvWwO9qkORD/DSAd7nT/+fNbRhDT1SIo4dV/u1I3DEbdguuYDBAYGBycH2YZBAsUAGyAIAyKP/j2vDtNaES+5qOaHawhd41r4ep0RK7gqYiqIaYQl2zGmVR7nupZLubmou7hWvpYtYWnROEqW447m+zx00g91VW163k5HZ6oyJcYxrrF0stDSQNIcMBNo/pU01tyindPW4gIPTRiyNVp407UTn/31R2vt3o3T/qzeGfZj1CP5PQhFKGKfH/t/ttQWq+chQ9UchyidFfEVoTYEBdripy2hgPgSmD6FgYVDJ5gGg1mACAcVAA0rm6XW5wvahyXwIr4QaQcdF/y5c3aeXlQhqNlFVtqLXlMM46k5BKMqq7vtWm9xD/+5Jk7QvUx2bFKN0zxjwF+JAAZRwPQZMWoPUMyM6gIoQgFgpRu2dOt12Ixcu6X3KiEUxs51XyPe8ayqpansVqnvpRkt85UHJKDiA/zLJIjS47K9y1laTK2cxZD1cJl1MZZBsbIwYv5HD+ApzS0d3R6f6fcAHC81QUZHEphMxJuC6YJ8cCqkfwY+CGH9gWC4LwS/BRgXHEY/H////0GX///8f/WDSgAe4UNHKLLW4afiDIQ6cuZY+sXdiELQf1MdTpXhc9IooAgwiD00mgwxjA4wcAYLgOjEW0WikXBDvgEHQTGBwA48CFDg2LghEJg4LAhEfrBuUIjgf2CaNJyNyNJyaJAm97SXii8LxT2kvDpvFDbyMvMjiCNSN805iTMHeWZH8nMHjsxn/5Zm3vMSMR7XME6j9Pa3IP/0FH8q+cqp2R9vVzf9v/p6f+Y3r/9eml+5sW03HHb/bKFm7d/V1sJ/+tPZ70VXeImIdjBb22N1wobdV4lvI8sQRWHSgJySqcJc5TcADYQpclq5ymLSEfqGdfafuvvPb+NU8trX6Za5cV//uSZOqB9OBnQ4E+XCI6q/igCCLCEqzjHQ6lFsi0qyKAEBXQjCVyeq3EJS8wcZDiiSWqYmWZUWQOL2tuOKQnFVQZNk05UmT4GR4H4kqA9OCcVTUlHYkoRZJR2YlwnHKglMFo5QCUdmJKVEq5imeMaGTapKoXXWpo0tz0pIigSdE1RKyJyyMEaSNQJHonIknNpZsJNpGCTqrTrNK0iokWOfAEBgFtALyBbIwBAeO1WN3RoENYPOAKQ2+GX/2epf1eyQrV9G//S6t9pyh/sb6gpT7muf0Pd/6wADACDvAeQYxTc6AgIAag1xiL/IqmGAYmoU0GLYOBgAqXOjrKRd+Mt5A4o17L51T/3BMxAwnwYcEONlBYEbGcR+5ocMpJ+qb5vzpEzLy9vnnEaqTm8PWEbmSx8mc8s0Y60h7m2zAiIMoUzuxk2vQaua+QK+A/MQABF4F//RBAM808mM8IRjEGBzqDMv///ghseC39hwY+PBf/8FB//wYL/9ONg0xv/joAFcFQmSxkLQaqg4ptS7m4hM0DRyAJGFQEfhcZnYBhgKY61v/7kmTcgPZ9Z9X7DDa8HuAIoAQibg5pixsB9HCIz69igBCJ+KZy53P2n/DUp72GsYSPPMbe86nkUIoFIKZnSK63Zo0zQzzQtmzrtZc1VDNMibcqrw3fSbOTMVVabd2LWrkqHtX0qKUN7FZk1KuMzgNgsB/vNV+aa8ccCbggMbHBwYOyFW6ZOp9v/0IeZfv9bf9Xb//+u36/urrz9WtuCQjtqDkgxCSoACwIA+6tFotZFI9mMziQD5Q7alAJCo4Dj2lxBzPUjG3Fmq+Gub4ZX9xHvHdd433O873jPHap9ffH7Ae7mk2jetdz6ns3eIttf32Xs8pWt6+vWHdB939vUvjmLvFZ5cnsoGsrwaauTHiHtvlbToO5i2V6vpcyCFbBjVw5spZ+uPGdNs8sv1gpkTqg/oBZHG/HCiFlPmecBZG/umN/8b/1b//7oMuzwvq13+/cu1v1Vac7Z81tB3t0GNJfjDtroLrmAkA8YHQLpi2oqGCcB0BgC1FAYGpa/BOSOGie0H0smWMp5qrntJlR9cWN1nnrdqm2b9vjpU06+f7/iZT/+5Jk0IDTgWNGwLwbsjWK2LEEAoIPsZ8bBHDQgMQmIoAgljhll9SY+7TXiKlvofaXrFPVGXNfYxhE0i5DMCW+YhPm7ka8Nysy8cbUUDshOEw48LkfTlkcQLcPVh7e3v8fnL0rBkysukP0F7jdS3a2Y++r+rvFHWUl7J7+o93P+G/aS4ht4fmvJuM/46KU0Uf6QuepAeAeMHcH4xh0+TCABJMA0AhFFuVLPUWe9PwTK5e5lZ4L+t8GTn2tnUo+HSh7jUvHcZIooKON+j6NQ6i3+Utqv+tHE2bvlFHJzn9nHfmF889LRIqr/YbfdSP0lE5d35Pa0vR6Wqqno9BuyLq4vOMxtHUsbBxvYFLgkSMIAwdpLAzT/huHB7qcTRg+NU52T/+xvgXAZj6lXR9OZHsV0NZHs9/aO/QaG1Ht7vT21/0e9K8sjdsbHfH8cJ+Ffst//QoBAQAAR7JtOZVio6AricC1nxVSJAfMVBLOxqYMyQQMEgBLvLlgKl7Y0NgVv3FJBvjtSidPdx/NQkLMPZ5nb47+XHEsOH5Ye8fpsNmseT/7//uSZOUL891nRIB+QzAuQoigAGIYEm2fEKN5LtD0qWJAVBcAys9zG6DKH9jPF2RYG9PE2PFR583fVj0F+QwmMKHDnLOqh/GONWXc1BcO7zKxo4ZDWbklA4g4UzB7tXR+kxFZkIWQqNTfr/L5XsNu6u8sYCVcaJBFCYk/4yJhuoZ/9/bvjP//AH//DP///jfHf/+M/CqKAFlsRV+vhAACQNzr+P+7EBuwoeCAeMEQDOSTcHkxBwDL9YlGam9+dbdiRF6Uje/xSHz/xMP6qaZt+Y3v9927rZvnQ7f2+BkYbbiK7/da5w/tmWtmv4uHj/vd6z5j/7ns+LiGzCu/L1/6jPGeZZCt48adVyMtHzuPW1g7ZAlSAIwlkfrH1mYGAzNV/l8+zoyCUSZOeHYGspUbK6snmRE/R0Tk/2++qKMQtc9PTQEP+77VemoKiAOzOt4RqwPwjD7LnSis3OM7cBVcAADGAyB6YFoLxlHJbmFaBeBgEFrtUg6jw/zpNrjDx9rky4i57v9kuYHJR0hr5IHVa1L+yFqElGDLlPDIbrcR/EBKmv/7kmTmiQRJZkSwvUQgN2zYoAgl0g/NnRah9M7Q0Z1joCCJ6Ee9/dxDGaeqH0E6P7L2M3aYexEg1BWK8SriKEmII6cNhmVsJZuc+7cFIZozED7RAYXYQlCYCAihLEACMXLgveXNX6/e3LHE1o5FshpnjxY0DwX8F8YHg9/B/0G/48HwIbxeNt6arw6+C+D/B4NP4/Bf8bbjj/jgEMBCG9ZUecjDYSzkTCIaVuQy8HAIYjCmYndkYAh0CADcpIdgfGyK0masOFWvHWWVC3QXl62uxeTL6yYF5oZrflO+ohq2Zj5Id9x5+0//eGp6/aofDOzz/jN4+eJHcRd5nsUOSaml4svGtnk7TnKu2ul9qGB2qhMB4rAubu7qxNPOGg9OldppI6jttUHp6F19GTUABRCsOhXQgEMWSATClOryn918/kbyH/3vf0/4K3qrd/q/2S8Y70tBhR7qeCAAFxx9u01kGgoYxigdJ9aZeB2Ag+SNa1DMi53YjK7pGMC03EVFGWOuP9Z6gExN226QGsQ/+zJfpLfz1VxAaEe5rRSE6XJPCWL/+5Jk64HUq2bDqT5DsDoMmKAAYiYQrZ0Uw3TQSMSjIwQgingEQJaiUm+WDHLuI/biH3T0FX5zwo6JUwJ0Toe9UsKs1LUIQlUMPDDAoPYaeEzQCIlmguJBQwRJGjgnvo6zNRhXMtfXzPh5gCE/JLZmwvvqiJVHBvVSouqfyiXzMypU1H6JMhQt//3R+b5/26LTBq7ip1mq/NjABRgY05OZmvfCNx3vwRAAHMQGzARhEwoAT8BICIMPA1QZrsGY6/Dte0fZJK/B3OKkIz8rX+bjvezLM10/xtfzG9o3Kh/Oe8ju2JZ8efs99rxD9/ltDNva8bW9N8eO3zPW7t+G+u+XmZBeNPeY3vW79banD5ltieHpIwGU6SIAUQWSc0kailhOu+p0nafFMgmHzyz6Wocv/rzi7mXOxe2WexS7Or6lSz/rz7etqAGBAOQ3/YRwZSRF5uErxPORy68DlpiA0ATAwOjAoRTxHjDMwLAcD6fEGtZw7/MRL0QMQKs9jYDlRUdCwy2dMhf2kweLYwoQrmh4iRPrAlkJEpbvHYU3gTDSRHE5//uSZOeBRFxnxAB9RCA7CniABCJeD5GXGQNw0IDAACLsAIgAi1N1QdTEtiMtV89UwY2oDuXX6TDKy1SGQZS7nngLVa2+I8hXuAZm+wSoRZaANBKqAqMLV0r14HS4pc+TIBAP/BDSourqjfpm/EAoD4DwJMHnLbpTstCZxkof33U3W6WGDTZ12GDf/wzCm8L6vdAQQWsKt4b7ujZ/udfX/1gIDADInOTRTQrvEYpi7LNyyfcgtOYMhcYvSKAQPbBAY2NzfOfKx/ml7n0XnUGrl+cxvPpu4XttEb//PZr+tn5VX/l1mFsdsNTX/HdreHnzPzu0nPNdLby3x6iJpy/9yp+VJbXf5703VZ1Qq8uGmU8gG3nSghWu8Z2WSms7eoCuHmPhJzguPciKljIcE0MhInTrItqWbAUaBQ3QyzX/r26/1drbfT+e5FABgAKLX7eAPcLXh9lEcEkCI3tLAyA0xGDU1gw4xlCIDACmFBtNS/9x41+Ox5GoZ/plHQa3qVdOHafbazzrBu2cSnOMzX6Z/G8srpSvrXqlFcgvlOSgnykQhf/7kmTtAZTAZ0OpPUOwQKj4kghltg8pnRsh9M6AvABjpAAAAP6y+vm9+pSyy1byiiyHWmpIpAgX1/rL/IllFM5ajOoj9JGlkElhi+aQByHIElESgs4pfI2HlPniyzX1+fkUoKWmJGfKyLR+nTXT/98oKysMUoLb/rWvX/6+rfZtEM5QiNG4ol7FQoVduPWP1HixMh3g7sc2Zj3JRhb8IiccZ+OBIxCFj+85NCAEHA5frTpLc/vuqb+dF4ya8n9H9v/vyMbL9lo87vG38/3P9+brP/cY+DFt+r6tLF7neoqF1E54Nz/If29+03j6cd56njPMwUWjTLvlFfT87lsWSKfWB0Ml0rxEkQg/WzFMdKKLTBrVLEqUAWtMPUoR3o0IWLuABSw3VLUI9p479BZ6yiSrntQWuKv6jtvfV/Uw0mKUdq30FJEABkAAva/u+8vY73d+zcpYhJ/zqTcYaWsADQuFAYfkpIY50YG+jkSz/+OC52HQj0kI2Y7KvS/pGVXgpTMOLZq9M0ahTFRUJoHufdMroRmhHrYcMrSGZ35HjoY+3wz/+5Jk641UcGdFKN00IDipWIAAJRwP1Z0WI3DQgNMAIqAQiXD+mFUpn8PMQYPZmGQ7pBvu1U03elyPNjWIFTRQfqAwP88urnDiH/272TXZKK41KsfnB3KU5jo/jwx7GrXYxCEaNxe7vbbt1tWaW8eltzVKb4ynoqSYMf3u9h9FSCQ1bx8YgLTDEfVIXLMBwDAwPgfTIPUKMF4DxHtQRTt3bF/H/KhS+iGbmHsFY+chw4YJA9Osz3q6WzelvG/B5j1++TghefP8+TqStbk/7h+/patuh9WGZV7EwcxUQot2KfnsPHZLp18poKoGndsxIQjW9ei0Cjh0kVnVj0BaUn0L3M8zNwf6p6wLCceiUveIRs06r+djNcQrGM9Oa3R88pKevV/tcxtEGLsKz5p9i+MZEZj4ww9SrnxIdyEHGCOIK+cc+fnDd5A03qqMqep98PSRB9TTNQBVwKCm1kQ0GNzEBqDtW/hFqkvgRa5gyDBjrCpggBrPn9i2N/ndgkR679OMQIci2GzkrsctIzZQzMIpjnEJKh7oYSdlPaSslOrPRPqs//uSZO2L09hlRcODNfI3BDiRBEZ6EzGbDAT5MIEHl2JAII2w6xP3eWOuilEdqf2kSEra63MywtnU1FLRAN2EGUGUILQw8IiIgi2vgx3HAfeCSrj3i7ydWZdHh9BZhcVuaMLQKyfNlPx0YZ6ffW1ZBl6WVOqcf9qD5LGJ1fSv7UdAAgQKpsv3/f5dgHmdqUXpj5uDc3QkvaVbQwDJiQIpzxVhl+ExgwAKEpwY9Z7hotRrCAlyO5LAU59ZZSJRmuWXkg77Mo+KZzcouPxP2q+6j9f9UcZS+3drMbb2D+35XurgrGPmOK6MXreRto9Jok3O/blZ/q29J99PIykMhrV8+KcThpxgrPL8yY0NMQ8raLv1/ZztLRnfSw76v/vdpFsqntmPvR1JRTvwb1RZ7Zz5h0UaI8wv8+1jkd+NcGRvykfnkJbmOGA7Efr26pZN6AuWUfRQAQAHzvnOWRbeSIsGUZMHgkGvQnuDAeMCwDOcyCByYiwPJsM6fXX68aomBBqRjnd5qqSNIFtUWO8iOc6WCQONXTHKcVTDDIwzhddSCNQwf//7kmTlgZO5ZsbAfRuyMoD41QAiIhIRmREOmTfBBzCiACCL2FYeNQMoRRwy49XigQI5oOPjm3uFODIOw228Wh9hh6OC1H7qTSBQJuPB7lGBjntjbsMQAUAfs3yhruhyQAeC/bxxgfGBGDu4x6vWMBAzFwDmHtk/N/zNrf/18eO/jF6volUafjP/3/7f///r+F0q9p92pvUwKAC8ENLAADijE0TDAMITBEKDcSszHMGVeNLC4FP9DSx8DuxYZKpFlyHVw9zHHbcCJaHyZbTTztKVLcpDrPdpcCfnnptqEnxD0V7Jc2og3UrDrSppTiXq2lYetTNtHn5ZEYRsdKGT2I7hSURltvVTDsSEQ4SuIklIYIBrvl9/CEGAxghw6goAFP/5XR6O9lap+EZw54HxmEAoGN5Ca0llhL8c5NQgMUSirQOSzMIJPiDu1ZWip0jVIDGfW34mW3yCsYCwY6puMKDgYEDEIXTBn4jA0MkEqgT875lz+xuPWRCq4wPCs+rxF3NtJloOhPzrzv+djs9fv7+b46eHV/NfHGKrv/hedvselbL/+5Jk5ou0BmfEqN0sIDrsmLUIJdQQZZsSo3UQQOmOYtQRiSC662jvSRrWHW8D4ik2rHau0oh+9UtFetwefU99HVeZ7OvWYVhwahAoZxogNYkYlgFNAAD+jUQpQEooir/+pRWIbNix3zRBgyY346/ddf1MnTZ9O3S0dO6edvv6bfbg27XN3v1j9teWle+sHgLGef7vZYX+yW3rUqnMr1nlu5GcmClxjFMQDd3ITIYHQgFkUXalNq93Gb1sYaCqmUpald5nZjQ2tchLvVu5qQ1nwYfNwyOQu2FeSw7PNjR9tXxp24ydl3dzVIUKuzjLygoJm8sGaUiLJ6oMM/xkij3dqWYa52fMo4RqFSFSF11ILzRMtto6nUBEKE6WbiIQ2o5p+LShMP10TBaIhkEf0oyI6DMMDHguRLQcz2PNmUc1J4Wfe//wdzmVDPd69HwdZzf+nb1b4n/rb7XwsO7rVQUABmfd3s48WAUKNBjs7nXMTK+BkKgoan9FYDoETBVIqGZVj/6hzvhccKQDFUOFxfMxhsA5IkNf/dTlerlsZ/b2s9yh//uSZOiBlBFnxAjdNCA6qujGFCKOEtWfEK6ZN8Djr6LEIIsqvHVnvlXoUxtEsYlfudTz6Qsq1F9cicgRspwyVjRUGDr+rqhAjiLStDbyk1KMAEBgBXPIZKYT/9vTUkZDV6bxxuBMDBAtGvsvxwkEONpBuNwdTE1DedxdRS4X/vbt939tNG6dAJ3LXd8ww79bDH5v+6orlDHofZQXPMAgkKgRnHMcGSAIEwNu4taS1O/4bIFMlzm8S59Xd4XlB5wRv3A101GLXrF8tepv8/2n9ZuU2ylDK5WJIVatJYy7DPDRilPeFNfzINpOawfm0pYeb0BmbANfcovinfNbL23zvGl2I2sT2gIpbmYYgjwu7ZFdGbQHrfPlmRoI8nX/zNE+CMwkCSH8Y0hrIEw9Bec1mizyS5Pn5a41/43g+DjAhgX643oMw1vwYw2Cx/BAh42CaNjP8HSqBY2DvaR6sJAWrsVKSvei8YhtnAFAMwZCgyUlUwRBFcjY5FrPnftcn4BqgoggoZyI2/Xq1yHqCkxsLGE5slz1BoWFHd3OXSFnJmDhFv/7kmThA/OnZ0Uo3BwgMiYosAAiNhHBnRCumTfBALLigBCKeFfWnijMmPYyaSSCssybTOV65lOQ427u1WF+GgpgZBTfd7XN0RKECD6GYOfgAqwVQwF7I2M+CqCZt5dUgoxHAg8RA+0mMJ7LebpJGi70mWji254fY3r9+n7b7eO/12nveLcPRuhR8mqymadlCh+4JXsJAKmDEDiYzyLxg6gdGAMAWkUBVyxnSBrSpoqbIH1O1VlrL0dCDRlsPsSd5ofldHnX5N+US04o3nhh59H1vNqz9NmrXtLqWTKEGltirPGNKblZRW98pGhKWxpOi6HLnqkaYki3BKIiahWqZ+USchaVzLlyyB8oa1AjEcjssjQajFd4lQEpgYxxJxZXi3JRaOPBwkY4OVhg4Vk67Uu/MOAikmUfYXy+DpGMZ8ded4XHSGVWLw/3K8P/Ab+wYynKfbXjH//L///+vtt/p6fjcYD6AESAAA16Xd7Fe3TI7gGdIKSVx6hkjYyAFGJQwe9sJm4DiQGYa+0py5v2ZVUMRVFoUzKqEq1EkskNYa9E2lL/+5Jk5QADvWbFqL0bsjIBSOkAIhYT0aMMBPlwQQ2yogBRn0iOdqjw1w0YQdnRD+6iR7sSLNNdXpiSFZkNezVptFnWChFxbYch406EElo52PH1hY8dDHMNONuNGg7hMLGEcqGYRdggYYygJJbILY40SQhFzeBUJX7/2yrqpkf/lJf0YKCK1gsvYh0oTfU+mV8nNWr9/MrOjbARbXLCpwoB8Zsip13oCMImJAbywguo5aRgJB8wMAo5USkDJWJArD7DY9Q//1Y6bl5hBo4tuYxglGK+hAhhwOnqauKT5dVe141V3t9tKhEeJGKrjrmkmkqu56GdQohjkZahu2mgbyjq0c06NS1XUg37qoSUVOmC8B4Qt9ybDHCZ1sS0rioyhqho2IsTQB78FIozTGan0mL+d9rHqi/2Q6aFdy/9REx69E52/+T+/T/yfed/T+jPVaf7cv+HdPI1KgKABNUKmXnYWsU+n3qDYQi7+M7AAGGBQTmiccGHgJKxuwMmNnvJT0QzJ8tNzGde+o8lTDHV/PbKrO3Z5Z8ZrbmNF+qfe39Q759m//uSZN4DBBxnxUDcK7A2w9ntAGIZkH2fEAN1EIDOr6MEIAnQ9bWvdafti7iJ945rZyr3f++uzifceZ7NR33eOofwTKMeHilYblmRUTMlhIut9WbIGVRpXvCBAH9QK3Jqzf/H8O3pqdRkHWUuS+pJW68/lB///9ebKiMGQmpvL//+C6oQLUvP2qnVOXQTXc88ZjHWGu50E7vViy/MXp6ekhbiF0zD0SjHXTTBIKwKADunZsa8FRHawO3jpGoGRz/WXmu6xmzuTkP8PnV3++bxkjMynmeVuRLWUdVe8gsm6FGd3S2YRxtjLbNYxT23ANXClXQqQ/E8aIBaVTlDLclDCG0pzShzmxRKcYJF5dMgW81CGmcXa0Mm1YOv+6K2yMbBxxv/tUhnCR3xyGbUjkNcGMBRkTxvA4EAQMATZ2Wa1IMC/r//Wi/QZSv2I0jL6///hVf0HeN2+ioZgAfv+/qVduWu1P/tuvVzzrWalWVI6mGguc4xxlEEKCsGiNNv/8FvC6ON5ePj3Q0PInOMMQLJUiS0uZ3ypfl4jIlMMZ0yp4QQg//7kmTkC3P0ZsUo3TQQM6pI1QgirhG9nRCumTXQ9S3igCEWOhZbxKRSkhbym4NyKqXj2Zrbi9dSP8Fp+PnQYwrksRfdIFoYkkcgtabP+YUbL6UoOrTiOgBACtcSixvKnOQ6zhko+HVPxo51GdFx+KrdnE998tcuryWVmK66ci9n76Em2oIkKdnJH/21iggodFi+B5S7eMPu3QvuBAqEg+D3jCGZDgiRoWGcGgw7+MQV1q3NPT/eUo/jS7+vZ58pvEbZM6/FlcL0SX3ZgOayRkfpaJcXbWUlX651UPmeNFqytXhKZl6I4jdQa35gsVitlYY2Lw5MJqgWU7BSI8SWO0VrTt7Iu4l6atAbUXs7B0Rg0TLuV80gWF4zhUQMjBs287STZ+bqkMtVR0JR/cbmMq88/z5ZkvpkowSzCrn5ArgEIuYa4avEYyuNe79PdOjzffcN00bt9TX99kwf/av/4U3r46oAGMCA00YLXUJ0IKlzq48jdJK2sCEAjION9UUBGdzY2ElXn956bz4yUlsYTK3+8qnmbop/2WZu7mbrT7Ks2cn/+5Jk5APT52fFq4M14DAgGLUAQgAUaZ8MBPWQgOAyokQQljiK5e5p2brZM3phVfehrbDYvEF/sV193V3eK9b1dl5TrS9MorTptSCi/RP5r9ZCMkmjkGtloymJIhD6UjkkU2UbBFUAJNWxCtJlAUIjCnIADLCVO3p/uADNFpDCjKXUMQYaIFPQH2lTglkhYgArWJdsipPxCNhkABYAHKWCNYbQJR3HJRg4DbnI2kIYMDJi3kCADN1rIvm56uv7rHZ/hSNVGJtld+31Itr18pBqz//KL/5WT4g6VbfzceNzuhXzMb961xpa7nGeaaKWvaMO3Nffrt3NJUovOUvdW2mss7O+k2W6WttJUYUZDnxJMiWeicSYzFnrgpXxUiSSB7lwqBkMcbCLtceknWLnkH3F1H1kVGQOsXkQipt1zzcUjH6B5W2SQ0+qx3/6vdf9nXXekkM1AsYPoFqgtemnVRWMOw0NW6pMVAnLVJ0hQLsLe06Nwi5jyvfTft573GM290jNV0CzafwG/37rRwrNzMsvSpDu/wXWYAg3CDW/YMIcPn9A//uSZN6BBAhmxkB8M6Izwtk9ACImD82bGQHw0EjdC6RoEApAR7ZhQHT8BYV+34GUsst92+HarZw6egF0XVgnAKV8L0aiYH3QAj2Hd34E4DFYBAR+ACGzF/9+VAHqHo4f4yZyBSV/9WVLMwKpoMENQHANXpv04KCHbqO44ABWBNPBahf8N/BRH/4Zhv//4Z/////Zf7fGxhEFN8hcuzRpCCtgwEKSA45JWFFgIgIanxnYBncXxVMCkOiesb2VjpG8TadtvY24HTcUQ07z33HTkSVBY9OaT9anVf6j5jSJHpS9QjMc2jI0L0lZyJKcog+D5VxU5RAaJiTmGHoNnyxps0LoYvyplKYedOMEjGmSo5z1eDZFUAQiaYbaqSAHwuMBMCHZgXX+Xf48KbHkaryUKOCxi1Bw2E/ItPCJpJ4cR8ov7dH0/Z+hAAJBkDPuBSrPs7z8zuAgJh4lOHSB93cUPAgOAUETh1sDJgAkkn8A0DqX/beiVHC8kjTU2nQOmHq7HfFfDYr94Z9XGVLX/saqOJ0hlqkGWdqGszxmloJi+arOrv/7kmToCQRFasQAvTQQPIxooRRFng+1nRKjcRBAyA/kdCCNoLY5LYVG4wnjM9hlFJqTVnU12nNV2vuwlKZuiUVprHoImrlG/larUD1IjETOsQEyJo60YkMPEbRRolA7ex54sLJ09e1WMBINshGL2chVRy9PLcWEn76/rH0unbSaqtGUrsrcEMxyq7r7/Xo6XGW8padbePXvLYYZh9OyR/Ujf9QCKwABzfNc1cp9fSazu17le1Um6S3YhtyAqATBYYNKcUwmC38j5xy899jEb+zA1IiI0itD8nlMqS768JctGc2cmtUxiY9Zsh9SaomR/GZq2ftRwL7k7mRL5flo17cCzx9ariq7+O+cDyjsL9xnpxJ7P5c5sbZjsWYM6574JcrqX6WtVQkxaVx5Wi/CNFBbWhs/0WZuKQAp7DJ0/Q0tAQo7jMU7nCzn+vr90qS7VQAFgCEAGK+5HMgpMtR4fapIgUmVn7EDrdMJgtMopcMKwYUBd4lquoNl6YkQpKMqpqw/XtB7iElxtaG8j5xiC9ni8U+mydXTdLTPA2KhtRiUNJr/+5Jk7ID04WfDwT1MED3KeIAIBYIPJZcXDgzViM0L4kAgFkCoYXaz1rg+Scay3biI2afHVSjiJdTYc1cDaMuInmBHErQPGS7IpvIWmOGGiZ3FCpR0Oc84gJgmzBTD2FKMDqm7tdE0Pxv/n2HaLezQMLQE6ZghkiPLPRFSFOKI63Z1fFERaf1t5UYVzyvJ/1/9haNhAx25y1/q+VegAQgCDO+6xRMoZulPqwwC6yyt5R1J4wyCjpM9MoAlCJwQeJar7+6UmYlswcPFBgk2Q5Ve7r+2+R6y732lPKc11CrX8xFXqstcn1CU03CQ0PKJEQ0kTy1zFvfKHr1YijGferrNiSIe+3lunGMI5kxFHS09Dro5jXESXDgSWHxjQP5/uNQ6W+79HKnV/HZS6u/BxowPjXqiFd0Tlq/wY/3J/33///wX+1v/XHqIf1v9SgKAAEN2PvJuVdCeHkoOHIPqU7dBGCS4B2g4iSzXrL4Zprv62hb/fjZ9/cIZAi+yqSfuMb/5/0DGSKbu7kyyunko5r7qZiJ6V73jsye3HS7xJbnUjpV8//uQZOgBlHJnxMk9RBA8ibihCCWMD82dFQNxEEDBKuNUEAnQwpfeUu+aiZGZdSTOyipUkkZJA02UALCKJooBEiBJE6zeRAAXt2vLOYSjYYks53J3zwEWSIgWIQAE50KeRxF5P/flBiQQHgkomi51hh69aPbSzX9VXGjmk/spEVVW6koCoDln47RoIGgIG/xo3//C//4/wZRytszspw3a6uZ6ggott2GHhQAAQPm780YsBDJ4gC5UDzhvHToJBb4HCh6Gjbm1R1vSGWkexgrq/z/Jv981cz8x1BmOmGk/5pDcRla8QU+pEX2uakQKYS1R0jWmUqRtNE8duJpjnWqkRWuY74NicSLcEQ7DIE97YwRQnCBQs+SABGh8K1KYMYmOP06eovoHMKl1CMOqKjR4hWXfjA/vCDgHez2f3bWXqFGp6ez+irsRAIIAZs2hOuUY7FZLmLkmxeE+0xB8wbCQwLjUGAuodDoaHUtd10XypbBVSRrZeUs6dJ6QFdZOvPQp/qOVC6lWLHO2lHKv+8hqaVa+6Sm+eTUlQ++1LJY5DZyg//uSZOmNBFVnRSkcNCQ+i3jGAGI4D+WZFCTxEEDCi2OgAIkIaQ/x9VWJsVLVq9rJafSkk/5/I1KbN+jPTpovZQ2rFycZETqfh8V5O8qcI0QS54PrhqizjL0/0Cuj7lGH/WXLh7QrzTg67Ibwg8wmn967PoN93tzd/npp68fqoiuFT+n/vjV9kw216K3o2n/9QsRAIASEsBD3HAbqCd9BTAYxObmlgTBQRNtUgxqBF2tOJK7raRh5AtuTcMNLsdcq06t3bxQLzRnI7vxYfI3vuC0uVp/SKaOJdeCou1Wam7I6e84Z+TErX1fMVLSv1Xj2iaX7ng3/LUYc0DjXNF1xWXp1R1LFSx9R5C09GUOW9JAAb/olrZfdS+tWjSuWhzh/q1qv7973O0dxv+FwvhnwE+2YaEgv7RvGjl2jh3/+M47/tX/E8YOVAAhAgM2Fs0lesbQ+mvCn8rhSVxxn4wBiYLHeyiEL1M5oACBf655MpI0o50SW6Uiz9HO6/83d3/k7g/32iki+Yrnlp9pW+sl9zT3Kh03jMbC/Dpt1pHqmOXBUa//7kmTsAfR7Z8So3UwQN+y4kBQlfg9lnRchcRBA57BiQACU+GnvyOykxXmhJFGmtzTQXDmu5uFNBgjnJM52MU8+mKPMJk0XZ3LQND6IGvZqVAyMAer760VEGWxyQ4tvVZDTr8H354yeAgLgGzzeTM3Tnk5jX/Ty+/U6zflt8yf1l9T/iHV9fTpXuHeVojeZf3oWyVMtRg8slI6HjsOOWygEhUVEB5zimZQSRACCgRAyq8Jkx98j8MEBF0E02GIxopw0GGio/uhihJREQ6/cSl2f2FB9joDjteG1WPWCL0tVS4iVl4jejkUZe3Ul90lQ1hcTedNgKSwSwgiPYVEWDRItjWZbW1EX3uwxNh+KBqklxKloVVCIj6VdjZPmczjAJY1Vn+yMmAmvINM872m3uaTQMvchCwRDRdgyAg6X4oWTywtEeS4ov/0X1O/r/R/0KgKEAjc3Xh7M7yYt8w0xhE/LH/QkGCA2ZT4BgAENhpAoAp8YqMi4kKrhTMKVyUjxH5YPCKaV7LDpCjo9MiUUKMhIYr26P5aGT4PNaTS10mKBoQ3/+5Jk7ImUTWdEwTw0EDosmKEIJ74RdZsOBPEQQNsOI1wUgsgyOkyMCNiJ2CrlgmF0MlLAY4JWg4Z6GQcS6Bxlq0AIxzSC/tBA3EgQ6ixj/mWYUUIeAKk/SgpxsIUdIgyGGodIqSEojVa+v3q/9GlwesH/TVtVZHQzt/tW3RWf1VKfm/G8Ozdypq7r6gSAx/etrRYEFlkOsiQgGDCcbb2LWMJQqM44dMQATR6YiBQAURvxCiEHjMtJaoeZc21PKMXsqhPV3sJlZaVuW/qbeTjOqouzeCblYiWBoTidF58SyzahKUMlCRojCBiMnN7CNMK8CCVYmVWG0l0tMRTq1kmKFkRJR0SaSBlXUylCCNSxzEGC5SpZFa0E+l/Ic6xI4VSHsi/f7pLWnIIbsDGrDKRkcv7KYoaeB2Mj/ZvQwSzNcfhY3/+q8f8HBYP0HB8f///goANpR3tkM+fvaZktEhyF2KsEFgAgYOnSm4ClEiLCw9EKeuY/YqInvQ6npkPWHqIWVinShB1fE6WIt3cj3dbIb5HIoiWIqjzZ6pYmam+akbbn//uSZOgBs+hnxSjcHBA9CziQBCJuEW2fEKN1EEDysaJUIItYJa1bcUkJ10IK0mMsfrPTzusk0ha0s7PVI8OJwqJL4dyVSZeRwgwoNg5sTCIwshZrH1+pDMSjkZqL5fP5omaI9x2qDOYC8winbrkpVjPTVb///G//j+C/+uD+PgoIH8YYFHrbj7DeP4L8bQEDmBCDmbvzW2+qsuJGDHm5L2RaOT76NzEAIT/OiswmSCeUoUZhv7OkZeA6gSSdFPDfjNzVMXuup7tejSvpXU99a79P7kkp+sr7fzIYY3xySV+O+upFNaGrZCvXXy8+nWNK07Mtyf1LPLwnaSNezvPUwzB21pVlciqdEOpiyk/n9MZtcdyiXXb/B47VVBeaLIdzp17pu2Dva9SRZa3NhxjuTWF3itb6zlKSjK3qGue2lhU9EwCcmoel9h5dTanOQsbYqRdalzRNGwEegGUAKLWHN83rHuNaNWJu3dv42am+ZwwucKgxr3yECcAW7TjN9ZG5YSjSo7dSk+nhnbJ7Pqh+ZUzh7xsdnXZjekTERlKpObnD9P/7kmTmAdP7Z8SA3EQQOQyosAQibhGJmRMk8S6A8QoiBACIqGzxs34daYcvq5RZ3a1XmplqmxOyTYUfuxmayrGbgoxF2MUZOyaIjOixRJhY4AVNOAmEBoNXAhxP233i8yhiry/eqhCa2J7yaK3QEBbclbrs1brl9/Y0NWYCN/vt29wBABjvbig/nJmFpYpRJ7rCyTjiR8ddcBhAFpkJOhhCCiXs0ApyIffw/DYS6DpzFZYu2RwIUOHiTMdNA+NPPVssgYPkS0f7vOnvn8uv5frbUn0lGKsNFt37lykgvFPzy1bKkcmEg6x04nLmgqe3Caeanz+oSq0qYX21cd7uBSJxJyc8Zl9LrtzN9GJPKQr7NOga9CkPOtSP5kK5oCGeS68lvYmgZFlzWcuSyNRcmX39qRUo9Dd7/pnb6nUjPmLs/ZpvMVWzj7FvXKws4NIqtIlX4YWx9iowBIZhcD/QT9TkqrNjcSmbtqZWUYPBxvOJmMAOn1RCnJVr7u7lJaoDW72NG4gV975H37/lV7Omnpmx7IJNZmmI0O+tS/vjnG+vv9v/+5Jk5IETvGXGy2YdQjFhONgAIigS1aEOpnUwQPanYkAQijg6Zsdoxsb+78Pd+X+17do23xZQGzu2PD726/H3PfZphbIXM9AUOzYqaM39oG5FtEQpAP/LxJC4fBqJyHTBDVCWICNHX6GrrcQsQmJ3uriOKDUm087kut1IW0ZyQap7g3elb/Cwx1dh5Uzd80mwsjaA/kBgPOwg1eAjCpMBD1w7GnkUAFj4ARNf/IPtzF5Q3IUz0lXa6ZVs6c7zx57GaN17l5VOS042l7qMacX6Z6ewh5B/dnzl7L8rkcpp/xjEq/sP6x53di6k5Vi15GZ9aowhMfjatr9Wh01jIHbGUA/iUSilw+ZeRZ8UhaYsPiBXRmcKwThJiQ72fzf2OCY5r9nP6AhKEUcMrt3FxvsP42v/k+j21IjgwfaqjQYLBRkj3p1ckh6O/3L/+gPwfG/+7/8Ljv99hvpqECGBwFyB7zEVai9UpP0Ez+diJpyCABOT5AwotWCZD9BSkFHwgo76ZUPR4SkuED0lubPFtcyPN9NHjWoUQKrGUdT8mN6TVaoN//uSZOSE095nxSjcNBAzwwiRBAOSklWfDgTxMED4s2JAERb4qXX3NYimaBzdpyo+xQ6xlTKmWmq1m4KADEJCro8OsSOoVpA4lxKIqEEUN6AgPF4QPrRTJA3DNUQf/H7WRMrO3HC5s6HzjhdQbDqy8HzjxBN1kjUwL/+mnd3J/xX6dP/qAIAxC9r0zLxFLrv0eCg3XjEndwvGYOhYYAS2OAW3J4Q0S5n+lisJcwTG27P+cIfsESXd/cjdJShUsO9fWdOvu414XGMmIzvZTnew3fBTmJx8qp0utb8LYnK5QejXKDP9VFFs6qWxjX1ZnXJn/Lh7wnLziZuz84yD5Qdqdad4OlxRFsethl5BpEFD/HlCBHPOAKAODwwEQ4EkGXLySzmp1DP1jQhjOOxiYwOBaQ5vGRo/h4WD76MHB3Csfp0HcrBcYNj8dxq48eO3/aM1//8f//7Y3//xnuqqCIUBaUnapz5yjUmo7oHLyeFIgYEA4GmIwAEPhOJFgbU/WKmYoIOABh5Mz+q55+u8ZmI0BvmhEKs9TeohrenCpwkJy0bBuf/7kmTjAQObZsZBGxwSNKNY2AACAhH9lw6k9TBJHa4iVCMUqJ9BE1h8ZerkzFAquxeZmTnMH07bDfwRx22b26+dPp9pnc7xt1jFTKKVuakuzz5HgQ8JLMAOvqsHAoRe3/oO11WlvQjayFClai/Hap99VHLQdYdD22r+iK/+j/7Po7UdZDM/BTMHU6RLoVEUDf8jdXXYdMcBQCGR81WmeAGNApzAGGaxb6ue3i8aQd6+1oHN5NOcpy3+WQWq4VEeGR7l6ZOwKu/ra8K2UqjVJypjdGdh3s0/rMPjfOl1pLqGcLXrRCeuTGLXOM6AK05vrJn4FQ9Q5lLh5nM0ryOHnewkoJDEFBkSzRPuehTRtKRlaGDofIgAiYLRCQevK2wB/BlKUfANQfG/0buMwhFf2eEVlaJFtaVQN3jAgeAggo4YcFHgoKLQYTXBQgZtbhXudT9n1e/6//9KLakVAEWAwEKnPLUxnY/ma6RoXgPYp38RnVWPEuxJPczNErP873/jbZS6BlM7pNUs6DpvPzs9fxvmImWmWyrPiim+M+RWH0vtGRr/+5Jk4gEDqWbFqqM1cjBFqOkAZSgTSZ0MJPEwQPMbIkQhFjjXHResvZZTM6mjcYxnnfV+rrDk6zo0xONvQ7ltPdsp7UfDOVlu01EATZ2zYhU1M1KzIwr9gEkJNS6UA8EqPsZsyAAa/C180zFiTgXC5HB2eSG4gYZmJLJT8U1FqtWjzxb/9Ur2OZ//QAgMCJB/6woZTM85azwy+/Ke1uW6TsYh9UhgQMmUbIAAFGYwB0GzAOhbAQZ2b83cXMAmvj0E+RzNk5lzFeYbRqGXQv91Imu/iwjKsTDh8K6We2fjs3/fQcKoWKZwEM0WcMn8c4nYuq1maR6NaWv6mfbOsnrxU1+66gdJ75U48qaFBw0fKma8DpeFGYikZwoUKCs4TgEgD42MjVc6TKqOMDZV/ReitWyskb8PCVLAqTMP2ZGpPmjmnZf1xUb/x8bjfj/////v//+D/wMGAECADfpb884SlqeN7llRZvzkDGCwcZvqphIBsGluox7z/r/uWlqioGz3drLD3u70GJpFDjVmk1uaq+lvcatVMSOn5Op3tdrkZDw9//uSZOKBA9llRcDbNBIzhekMBCJ+EmmdFQ4ZNcDcreKUUIuA1cff6b08F28yyKafdCaXH145WO0CPt7b4o3dadZEKqbrasO7JtcQxqzEYsG76AASW4mjCQAAZWljupoLEM/j3venyee4ANasgxi/YbduXt7Ue/9D7M/47/2/279mz3K/2n2kjxEMKMQKIeuQk1M2qWUIdTCwDOuRgyuAkaWvEK1Le8kx3Q3a7KfezFhAqwgRWkQPSf5qoXIHOQ/UKUsSTUQn1eogMJ2iXJ0aSpzofaaNA0n+mKBWm+kCiiFEgoUUHnmHpdWmsTej+N34ddNLPUSLismRKvKoEJdR187ZMTdNB0hSqgSTJ0MECaarArQkTO62kSJPVQESFGmHMWAElYHgscaxIACHMqkZ8F3p5F83lKzItW5E4PwFcfaR3OytbTgoJMcECx+D/wfwcEMADiAY2DCfgvG//G+MBAuD8b8YduC8ECHxlQAEgAANjw+P2fzSO03BAaxsrvPuiAkOfW5FDK1eEAYak8zXZ4Wz+JDytZyXQqtKguRUVToayf/7kmTlARPQZsVA3EQQMKN5DQBiKhPdnQ4E8TBBJzOjICAKgGV2ZLxzEMZ7WZHrVmpj9NUV40WeNQj4Ue6K6iBpvMui1DGHFGWhSKo+IiSAzHE44XaCKUSSPYcFiFwBzBg+ApG0ISqPSQDwbaJRBtgQslLf0n8GDMODB/ruZ+cvlRLrxmU8aWesT49Wgrez427s/WkcOPngpDwiEWGQ9KFS4xK3QLdgEJGvMmAiG6kbNyn85EhtKftfTyULaQlVoW0fNseJckRZyU2Ww8Xs5ctt/FBD1v4IkKWvpLp+CVso5pn3mRRndW5BqnilDE+KSI8eSfEgVvU047b4563ZTPxSkvWn4baRR8bUkTFeWnOjk6sosW2cJyLrKLzmmWEayExAxYoFChfEP6dKBgCgA8GNrGoNgULOqcgMjtfpuiNdlN5iAigByOoMYEMCG3gxuoVo4mPB8ewsSOm4uCAukYaD8GOA8H//wMb61QUABnx0Hrk5FkLaKIFZSV58kbNDBQRMTYgwGAF40yGTpLnu147nySqZ6M/Ww1Tw/8ql4f/5kZX/+5Jk2gsDtmbFQNssEC6nuPkIIsYTGaMQBHEwQPiiIpQkCVhv95vyRi6rLjKqy/ScDBvy+1decpQoqVltWxaf+sZ7geS3azRyV74xbuiPMGLjd5TlofbP3I6V2UCqbzaRaskkcitel2YDTT2JGYHR7loztBdADX4DjCkCFMDK4M5SXMH8gnfoWAiQKRc0EUGCHBAoEOMCGB72D2NYY/R/pfd/////6AGK+cG1VhrlqBcDqhXIbyeiKwRgsEG1YuBi6kVYEJWhvhO42Q/sScHVMyo0dJ0fcRAl4l698ZQ+Fq6sT1aRTSnKrI2B/Tcpx3TN2twyzvcI+3iBVJCJYme7aEZ16ixPOSghKVZggTeEliylXUSSEzCwjEfYqGYEYTowoiBJiCMYObBSIcdFjaEAGU3KXK5ggdQJgLoM3oxPHjP961blc6NzX9bcb/07f/HCjY+OAggCAd3+tfETPWn1f/UqCYAAZsg7d4qHZFqQsy0aPoI2+iM6eBOFRY/LNhYSU/+JISjm/O+7qWYzds6q3599LfF1bRUd+i/rsLiH0SzH//uSZNqDBDdlxKjcTBIzJRi1CCKKEDGfEqNxEEDmnaR0EYlYZbHPLU922JbSUgyvs8CIS17TB2plnvhcsjrCXuEysZrJ2n3pJCBGoATMbntLl6YwBr8M4bR6BSNHiwFgkDQwRsTxiQi2rAZcHqtV6UhWGnqP9+iJpe9iPsrAijS6jpp7s8v6e6si0/tvTTtrgoL8fB/433TK//3CcILQj8sUe89pL45TFS0iTOWQ2gIGAGbHhwQTGpSwtHNbv8K2vy03iAI/O/l3n0VuL2IjCu8b5Z78JZmJ7Zn8zHmnyd28bttv7IWWXrZTcpDw+1OxpM5QZmWjBWv4z2+v3ucevrfMbMneeUXjGVriFkSZCEoDka2bs4YkmeNtXUIH0jZ2BeTuNjL9faP4SMqdVBK1ka3T62UzobavBN6fwQNoV+5ngh+2lvbVj6/069P9///+nj5GAAGAAAzLfMOr7BBe6gmOlkARTtFLn8S/MHhYxRsR0Csg8sdPci72K/tBqDVpuan4QgKeqQG2r/YskSI2p9AVbv6q2lTVx8zjLotdU/nSnf/7kmTegZQmZ8So3DQQMaloxQgifBABnRKk8NBA3bDi1CCKWJKenCyf8/mKc7m1XKm5Y8qSskUCy//4pPx59OBFyscJUyc9O7hp0smQTz4h9O1bcOHo8hw9h06UFewcmkKBTp5Lneewefh2Qlhyrq61vqoTBfBv+zJGuKyv8Lulxg0aOcqxhuwsslbM6BtF938LTX+/R5Qrx9f/9v+N/TC/wz/8AThtNMK61ABBOMglIfPvP/pjkxerJjNv1+PX9LqmiTBeqM2q2ZbKZKOMM2i6vmGQoMRJ5eJmDEKRstZtPOJxHiHo3KqpfaqgbOrDo7XdDdV+JCq0xVgMQJtJ2CyGDjmyFEQmqgcEgmprSdlLqvhXIQ6PvmKZwxSSih/1q6LrvMYOb+jzCgF55sln4pF3ocUwfd1Kct2rbR/9f//+v/+v9vpG/YH/8aMNvj0BCQAAEiPo00Z4rbaFxC8gVkKDzWyu5zaiSFR/LqHOq6vBpb6Xn+dE8wr7h/6iioKT8KZFyJHq6ZPKK/5H9NFziyyeagC9gM8hBWw+sxSjSCanKen/+5Jk5oGUzGfEQNxLojxrqIAAZToOKZUdg2xwSMYxItQginBI8IW7ePigf8r9lthZBmVKkSyz+LClKdEfZBMMivCR4fMYeQ1aCVKSDlw5HOWZwk8F5gzrMTBiwjH55Yl4+rAAA+kkEEYEsOlU/Yy/+vVk/imz1KfZLTnMyPr+kF/+CB1+DwYHrggPgmwYFGjf/+3B2EwXjwf8f8cF/+DAAuAgMO55Z87jr8M7l7Kktyecv5UuV2ULTZ8cg6kRfFacSCIj6EEhAwkIGuc9ZSnn2OvD14OVPrJmQPzikRvUWVyDMczkU2hmzmTE9HI76YXUwRJQmdKN960ioLO2XWgZB+XFiY2zHbVf1e22pal5PgtGkLew7ky4Z0ypSIEdHTzahXF2K37fYewYOUe46OEqwKlDU9GnNPfhgn83eYov/0fb9Vi6F+q2KpbQAoACMMznu7WuByyShcJoFqn52H0xDAAXM01QKACZmMSK7/3WVWTLpSrqJLd5xLCgqOf+8dCP/+ivoMJ2Iy3JRX9rYxW2uahU6nEppmWuaUVhRnDk/lZA//uSZOkBhJJnRME7NBA9C1iyCGJeD4GbGS2M1ci+i2LUAIiYzarO98sVZwX9isUtb1roobKCvm/9ElpiwbJjghFCheyI5EpAhLGXcnfxHxk/tmaedoKig1E0YOb+2oVkQkimdEAHVXHrqyCyfyKlNHx5k9R+iG9GW1pTVTp/Eajf/7adRWNLRv/R3/f10t/fwu8IcbGfT/16f/ThhEZnHMSxtmjlXAwAcYfm3te4wSCDJsnAwNeKlShZ0ka/X1GmyzuXJrnMybQm85fz7P/rs2lKKqPMK/355Ymyqj7cfc/9Vf/uj7ZN+i5jFP2SK35jrarhL6i0UhGViF0QlZOtP7v2b+kIg5O93k8Q+GUGLIgRZWP+QTOJrq+mgOy1dPCXrzn5JaHo7Y3Rk//I6Je5rfnBm+mv/6yP3/6U//xqcS9TdYy4Vp8K6ryIBtdUagEYQSCm3b2hT6UowbsHMel/fm6jRQUAnOSAYZM1lSGU/X5859ydVmbHwjmq3FM/ktmrqheEjnKkkqM4qaKx9zendxXik+oJyTtO11m7TYhNPqU/tv/7kmTqidS5Z8So3EwQOEz4oQAlNA+JmRSh8NBI1KjiACCWGMfyb3qZ8ilFKk4+2WpUiqLLaD7LGKRRuJ3YxvMrsN+GmE23N5FuMkuhYRycKGcliFXocjYWQUTKpYr/8kE+Uhn8c3eTK573hDjP+8ZdeBYfOl/eFHZUNlb7IiYOjeTpXb/9fqYv0TvrYskbRKb3uufwbpK0EIoDQjCFvfdT73RzHpDzmy7t4Ta2HXOTKisYg+qyT8WPoOJC/kr0PJJVsm9M+HviPO8c0ztI/RjnbBKuxXila0ClmX8qO9rZox9VMjyIHa20NS3Y27RaVSTBJTrZIqmHYKGBHrGuQ50QsRzA06gRSqzu2Sy3dffnLZYzJ8ak4a86K6TASo2CGnKaJOr31QyvNySddO67R2f17F24zXoqCPD9vqihClW0djPLQTQ7Uj7IAuBzAocNza8xqBXIxJmEe6Xr1tN0sU4kcvWh969inWxxUXvpFiOt3TGs3vym//Bel6sraTMDP7XI6ShvMKs9Mijul2y7crVuBk5erL22pNrrKH+EZzxLYxj/+5Jk6QGUcGfFwNtMEDnM6JAEIp4NxZcZJOxwSMGUIlQQibhAe5yPLa8/p4hZ1tK8l+Kiq8T2uCehW/OqPSnCt4iHTjvXuXbrkamFnLE0zFxhzTOxTMzIB/vA20UDFWd4NPT9d5KNAjE5khjZeinX6uVzNoKmZJ0jRb94xtvbxQ9TRhBN/7vH0fE34Jbptsu9Fu//8nrf9vxmmW4lPMc/Srkz96zejXoqdnBgQCmCJYgicmSKIQ2B4mVM1VNoh9LpM+BHSUo98kxBk6U1XVNEj/KqIeKneOHjS1afxGm8f9pQn5uqj//WJ6cdnm/8zd1M1jd4zW5VUn4DQmhv9bgSiM65/NDbYdhx32NLHeLSBCB/UECR00n3kdH7UXyHMzFcExZzFMS2RGFtjn+X5n/85C9ePrZfm+D/fxv/+D/+3p/i1QCAY2AEoAY7/KXWs/3+V13Hew5OPphL71F+VV4gUDG+34YUt9S9BoK+7lbbToKf9JResmQognUHOpApgjJW0Us2uqw9HpOl8ippMoRluIBlUXclqnpbXM6q1gtNWyRk//uSZPSPFPNnwwE8ZBJDLHiRCGWyDpWbFANxEEjNKCLUIIsgW9JfA3eKIMtKaxpNhIRwxIxkuFD5Q3BiFV2YOYOoJYAAQFEAAAMs0mxdJw6V6q+v0k4uvIDH8sVTEHSsVQ4V4Gu63NFFRq8w7ngpZS68BP/oAo1MNwVkhEFUpoDruw7tqCADclq3eICslBHN391ZhMwQOgNLA4IFhY7LNfscL4D2a/JrRarJ61coTVix/V5GG4mVqrzI1tCFtRT55KVlrZKq0tGMqy57l1yJkMQ+Q+H6EEcDyhmOmiRSjpZg+0WXbM96tZKPxjEpzNp5sw8g4ngnPx1/kakubhEPMswFZhkbVWzG9SNwFMzyjOGNHzcyBs9aJDH/mSqEnDmPl9/hkR5kTCMS/cicaTjOsa4FFLUV2vqdRRG07cfjHHUj3rdOhNSz1PU1aa+O9QpM33oAQYAAj+i77DwhXxDTjNGhQky7g+6Nibp2+8JIj94aCbgVw/7kGQaFoFEN9/sy2WzZ//9KfPdqZ7vnFv+z+P+OK+Y6v1V04L/0xQb5y1q6tf/7kmTugZPnZcXjZh0iQuM4vQRJaBI9oRCjcTBA7BOi5BChuMDXhX58ge6ka2B+5StVu2vIif8G/qwrGxkROljxHE6CXaBzwBhuQFtkgBmZi6sO9qHrS6wZcAAB6BDALN1V1KODJpsEBEaANjfJV0Lt5LMm1PScp2WONe/BjUHH+D//RfwXj0FD7LKlLHPMb//X/3aEM1g87qOnKNw/mpYeY+FuWKZgEHGIqKFwDHs7tKEQckM5EDqlXytIuaLaxae04E/xEPxXDU6iWpniHrj4uc+lqa4E+PmBEslhINaZR5TdTneZtHnReyUhIhIW/R4llZpRey+xCiG0ahFVpplEMxmYM3hRRBHCrCPiYWEEKBSwAQOWrytpsft4LIp1Q/GtiEk5QoSmEIPJnD7GA0Boo0PTKaqAuGrzlZzttE2hkkJoY1jstTiaaURDnJwLFQWb0KQAHevkHUgRqeyeYkLvQqtpfWgJLwmmXQQJRmsW0tvKRLvsSUt9uTglXbMPf6d5yjdfVZ3fG/zlNVz8f72gv3nr/OX9ZXZ4Vf21tstp0yT/+5Jk5wMUHmdEwNs0EDzIGKYAIiIPyZ0SA3EQQPUGYpQADACpOu/sv5zcQn4Z4O1as6zo7f+LNhLy/Obqcv2+181PppL6vrH2/a9KJbiVjyzp7V++iO6xsU7/bejX6zFROdDsaq5g2j9VbU8qPp9bkVLhn/7fqa/9fZ67fCE8u36iWlpfBfo+JbgguAV2+YsskQJ5YRNJE1FmoZ1o6shAEee9hii2zUDuO5gyIHoNRFRLcR96+pIuFcY/fnTSMfbxWNjgbKUyD8wafA392qOH0hKsy2tSzL3qNhxiWf1a8ih9ElocqLzEloQ6IsDJIdHRCXszgZkjhSiTIkKPZxJRA4ih5hZsQNEWWNtGuH5TzUwjddZWQWNhJMZCoqdsakjFBrk32PNhxyTLKqmHEgI81FAfpFEyB9QsIN9qLHQMg/HvFy3DaFVJjXzNAIAGZry6MVkij3sDK8UgCfgHkFtYC4BS0OGL8mP7HM2DZnKuI8ooVbMveSR2UkUqq83Fpas82nLOkSIwkaDq2XUJoecfvjo1PucQ5S2cH5Jl7xyj2v8s//uSZOgB09tmxkk7NIA9LNiQAGIkEEGfEqNtEED4iaJEEAnKDYpLO3aw1Cos1McF1qjRTTAF11IY+YDEqmDL6yIFiei4CUDnCYShkZboFUt4LNZFaAEAB+v2xk0Pqjf79lMn2IIw2hx08q5kcDu2966oNZ2mqgULv+yNyPKffrb+6fY/Whx102jfvXUhfo/6UDkthLuu4VUVzhw1sC2qZyB3y6gACJonBAIKQXEJHGd3uJkaBJhKm1WCHFCVr9TbzM1L/yycA8ZrJ5DpV5yj9rZ/VV2rh6v5b263aukQfHxtSqtAiyBgpHJV8WmJ4ylimwTrPG3jtQ7WZUPOhbJzzRZw1ChikqBBAZoe1Bg0kkyWL0XTVB85+w3Eu0WHXRg4i2WBP/uo4ylT3df/GVMlLzJpQi9Mya3cmMRM02uvzyP9emC8F/4/weP/vBp/+N43ViK7ITS1MI3qBwACLZs/4gyluwSU7ThiHMrD3GAQAY5hYGAMPSmEd/zZd3+ldvc8Lff0SmkvWc2Dv2zLLjWbc/PVry6esvN37fh0/r9m075k///7kmTqi1RAZ0Oo3EOkO0l4tQhlwhJBnw6k8TBA2Kki1CCK4Bk++/7v/bPP9b2KlGMm8Znx3Z/ZvKwipef1O/ePU8oRcU25KvfjS+ewFqjuyUcuAEvsZIADEvQ6HGhh2Uw9Ra33/c3UuLVDhU5esY06Fj8qKUKHHn+WOKI2LUQxb08uxSpR6eh1QbXLDiCRAgWmrTy7cdnvL8dgpR0BBJ6m8Ck5gr/Rlf/qM5q4dvFt9yPSqX9s3u+nX0oU3mwP75SW9A+Xp/rTxWux31KrilOIvNexydpzT26sZrZTTkc3afuy9T0YHMfxuduKMQjb4h4Xy7FxLTV6H5QO40Hx2JMLjhnwH7GB0E4gaiWQntFxwZGWR6QJD6YI7wwcqBBAH4wYiB8dMjRhkZU/wg/pBJnPAAQ440EvV5NEt90h6t4GC4PgxgXBgPx4IECxow3x/xv8ccF+D/Hjf///x/g6KoAA3VHDxcDOSDZauDH3qJrAOOc6MExrA0VSyP+xeNr/md9rfPx7ZH9zeXDbn/9Pr+DGxt+dmfOav9Xbcsn0G2tqdhj/+5Jk44MDv2XFKNw0EjaCqOoAIwISbZsQA20wQQMvYtRQisCHxFy5rdXF1ZOGL57YU+XDL3fROJuHj4hPvXSZ8dCkbb845emHbBkVGkDYIdv8l1GIBYsxOkAmpBSADvQ8C4lmFomgDbg2/elYHGgwYA5UeKnnjHo43F3DxsS9XS5/9ZDD/r03f/9/0u/OPQqy6PFpFsSRvdokT9+3QEIBBoSNdUsHEN5JWk2751gP/TSSTJzCpx2NspqyFKaS6XX6Dp/9L/29LpdlhH10SX8a+sX3enb+DKWLRQrWHdb6f+AxepMO6V52F4v0jA5z9ft4XfnSJ0ujer/BAVSBlC/W1PaFJJLx7z6QAunBExzaS/6KwAppImAPQkyFCjR/vTeAQP8SEmUKSkJLUvx/ZLzKFsFJsl1israWUYcGOBgwQMEOBQHXb7PVqqpY2z2oSjU7Oz/hUWixFi4ABYEgPR2See5HPmqImehMzEY42YHwMGAgGIoQpVQ5bWSvnxF9nr6+7mfcZ/EM7vkC7spv3/1z9h4ye/AkP28xmN89987v+by4//uQZOEDE8pnRah7NBAyoujZAGIeEomhDgTxMEDioKMUERYw3tu3HGb2gPLRgEBFDh74/S33gHIAa83lifrSCm2BlbMae43M4tgR7qKt2V2JTYDgCTsD4rRsARDAL/YoqAFYRuQaCePl/rK4jkuRlkZfDOXKQaC6xRksJlABC4dBEa4kmgJO/vr//sdoe78pwBj+uZnSJLeYXPCk4MqHLL4XarCjBIINRw8FE1p05Ky2zs8ductuG397j0VM+RcfOMn4nVFjsbhVsCmlUtM+9vfUbj8qLKmeysZ1L1Vdjnh2S/+GpVPauloHJ3T6ls4HNhqCcbTalmhcbutrBzI5aWcovr+OF44bkMukOTZ0QFaQjcDJZhjgFXNNsH07uCeUgAQkAH1sER8ILmCREGc6lf9okJe5irodt2X9gd1W1Lg5t6tpaLPn+GX/2nN0eP5VKiqtHG//Z64AUICAHfHIK5ZsPis4pqGSfTXJw3WkrwKHhgCfIWDS0s1rzNX5VnyW3rVzNv0PXd1GvCWNHRXh31DmMjqp7V9ld+Ssqn5Cn7Cs//uSZOMJBAxnxUE8NIAzY+kJACMuEgmfEKTxMEDeo+MgIIvIPr3ispRhKOtznN+p7nq6Mlo/5GTcIQo9Ov3KTmZjEIN1L2BgdFjmD94oV52PltVDJOw3hhqcA8bpR2JulU/NoNFRpkHjdaDtl9A1AHD+GwYUFB1eOIl06xlQqrp/SabTWiOvVH9WV3eu1HXVNbrp7+PfVr1Iy3/0dNDW9QAjYR23J3ThSEQYVFrlycgypGrdiNrALZOLmiIoh/B5y9867s3tuoiSIr5MjFZ55h33TXTamZnzCkLanZv23xvLK6W0cyUHJUxmvV/PhJsqkuY8vG917T4Wijmpft9D6e3csjMuZyZmHET3JY23p6CwKyJ3ONJYba0yJbNvSQ54MeeNIeXBmAtGRZmf3l2rYQLHABBUez6V2wFXS2QLOqywU6pZDPnPyoNI5XWZc2FRhh62e1l9+2sSiAFqeooqlZhsFoyOhL12kaWW6Ma0WB0lL788yEFKKA3treDTczPW1hbviSsfnd9zsd/u/Oktv862fO/0/NX/9TaVt6LMf3//K//7kmTjg5SUZ8RBO0wQMqcopQBiKhCdmxUDbMzIzAtiRACM+HX32y/7mJOZ/r29p1s3e+MZvRqBd7qX1NPIxNWYjuN1c1FXuJciUeDcwpFy2QfoA80UDlZmTyL+gnMCwnBkOED8l9YKF4JsDVqm1y9tb3i9muTWPL///3p273IfPt7QeAjd9sipL6q0zAXwhS2L5bJsMmBgWZulAQImIy6GWTksZCi1Up60oV8UnkqqEyXULzuAy2Dbvroem6ec32bKz2CVufqLlm2j+/Sj9m9kNVq26hDSYxakyvOJWbvycmHSrQ1C4+Q3kShPD0cMOUlM+ktAnQ1a25kirrTMR3AfWQ0NIY6/0ymshJle8hsbVCqcIZLM11RtlEiGh3kyTnaH6BTABgI+B/OxVVTHA9P5GiD37fDgn6coVERl9L+8FtfsJGT00/2+DW3/0//+369f/7sZqZnxqpTZV4WDVNXNZh15OPb33tJJTF/dSuo4WiPJiQxVX9GShouXO9XM8Nd3aQNSi9Bt3ERHC8wrpfF12zpa1EUqRUrnRVGNbq7ZikP/+5Jk5AEDyGbFqLs0EC+BiMUAYlQUEZ8QpPGSAPCy4pQBiKhvLi1oxFIxrOixKfZNjYep4RiYq7jPeBVNJGkQ81IuJUUhSED2FUUcss7Yoijz1sMiJQwt8ZZ4woAJ2WWapJIEVNAh3ZwotojBjfdOBDQQIGMMODBufMyMLIQKHjoeYcPkpwKpTvCBYkrQ+Nd//2INiiw5dIHwJJbpRTmm6uxPyRDNKg+qPFl9fs+KfCYk5wrAyYpHqS7NJZdHDlqHUMLUzo/rmV+hhSsEJL7Vu0U7cvpwvjo+GnqzSxbMx3kkfRLLVGxEkx1WdjWXRLOE33Adp27bhWYSORRXeHJ0+yVcpZK6OmN52LihU6kcN0M4SHZo4GShqyPNcQEeaXcINKFj6hhUqoAGlJFADr5bj0EgiIMHA8lUD+tKmz2bG535eVVQ1xiBtzYZEskFGCgG2qxX8yhGU///7P0f/pUAgADGVm59stA28zZsiiWE0+EbYAW5NLzi3klqTKQ42bNJSoJ0m96WIr0jeF+ouLWoGq9tVx99DtVgehXfCCCqLlS5//uSZOAPA9JnRADbRBA2YtktAAICErWbDgNtMEDZECMkUI4YtJjmGo7LDqq1NlEmCs3jrZd+CWka6jpWoo4Yrt3XT6ElDKaWlRhJaKkDnGXQ8aLjEIERTloVFiwVDCZAIABN4AnUwps1/v9OHvulSOr6O63WvUISWqzaVXdNOy9WN/57jP020u+1/Xu+pyaetzYdoEAR86ip1PNuLbab1Cx4HikXNGALMEhQxvVTAwFerAiwjOWURPljCmLtAzZvGVkaJTzlmNUc562j6x5m56QstzjkU0c00rOzWr9rZOUvS3a9P0mMTuGWEyq2ZNd20k98nzmtC2p2i62EKpwNVEXqWaJNit3O1oYR06SfpTVs3As09OoCluJA8q5DsViITY+gYOSTPYRkqmd7zP5obGiOxmiV//pfbKCAxM0a9p+U9z4kcQDEbkL7D//Xz83/PT/zNzJzlWpe/w31f+EN5LLvQlUASEAgACEslanTOu2LjrFp/pVrC8BlACb1HBw1DtBC17+tI3LL/bPmJDB5dMxV5j58rJO3tldD0vv0e+9Syv/7kmTgibPyZ0Uo20QUM8dopQAlLBNJnw7E8TII2C8igBCW+PW4hm115e47P++t8j5787dMf211s8eDcbc5zmx324foVDm/MPX3Lb6SMcd/5net0baOmUnXJkkmhJijOxmI7gAZAJAANpLdOCDpzYf6fb+iBJAFGxmP4/Qj6tVD3+9BApEGmarkfsnb/B4Q//Hxr9vp////v//9tGqFUe9eF6RRWgUWA5ueHIawWoYCAlogs8K7YIHAdIiOz06bqelxbFB7z7SlLsBDkp6cO559X9ScjWmbKXymWU4fqdU88qk87vmVyuqTfQZx0tr8ua1gCBkZZQ75w/ukYEKXwAGoaOQ564AlQU6D7AQAOHAMcTf/9VJ+gAOB4OOC2W7Ws+D4sxrAC5drVy04t6u4nRN0c1Wr9///ofk1d/LLROjEWPDy6SVQMx5P83EC+4yCDXUdCB/QZHJkUZC0qm1LtkfJZUac3EvizEkpwuGK/ZUl2IbySWSml1Ny7lpTf5MEiuwQYZlqYoiNEsDkH4QVyaFTIjtKSM19MIvVGqUEqUzkzaH/+5Jk3gET6GdFSTs0gD/MiLkAxTYMTR0ZAehwSNGRoyABiJAnuRtkj2MZP2cJLocUpQ0G7NtlJqmBhiYLDRo1GT03hsRCq4iUSqzYaEs4kjg0HL/VmwGgBF7M5SIEAo8EDDFu/3Q2X09tW+9zwVUU3T/0M1EdSIY022yO8Yj3R8FvX9sG3//6yeyI3nX0NqW8HtQMZleqief0gBNgj38+9naQmJNNxREYpEpYS6QEYIFuRnQX1Gbk9yvzo1obGrteSun+Q8NRqRh878bvKDoNolsNYT81lsc0+rfvaPn7/jzlTue3/4lsVuTMt2x5aB1T/i15VGN8k1ok2dZol6Z0L65Pk/7tR+wajQP6cj/oVoa4UQNWQZG7kkrGmBQ6A1fsrev9WGA66apWgqqqPS/15/zw6YL8Z+uUfCj6tn7q2La7/6+9iPqVk35akH3LuX3alLSyrtm7O/MyuzblrXjA4KNUykDEFb0EgCgmZz6nA7mvgeFm8X2J76Gg+PoWvp6W/j/idhsSuedESnPj7U9jjHNtUM5ubKfB7f+kNYfdVKeN//uSZPMBtNBowwE8TBBELDiVAGIaD3WdFQTs0gDGGOKUAYhoakM1NPO5qcdjpW+Mgc8I74R7s7stfvoX61HZgjCdgN8VQkVpqbG8GoEkS3ezxHBrWNJO6ueuUI60Q7lhj/GUaakAIKvqCAe1iZ2EWJ3YJuilZvtNMNz8ceCcr6KGKzKis8qPs9X6NVE4MEC43BdOdT5Huy//G+3////+D//+moVSoAloLL7bIDYUyBARBQLWdx421PAUIiU7TEDk/n5j+njHQ7pdqMCuR8g0NK8VYEOfeUjTL+eT3s/+5aehwGrufLle0yBCkqHUbr19rMLzwHMhB9Qs2z4SGQrNYMlQTcLFGLEEakLDBRHJLdkpJIghwrZ5pn6ueivXyuP3+mZ35wRmM9ZXUZh2Zv4nBD1WqjqUthaeRb//+zoq8esydrVRICByRNAtlMuRGJYWfmE9TkFkAASgZ2tUJIDV9NO/bdhh+rORKLDT8StzW4+0LKdJfuew013ut1uev21XO/+pPZVcixC7vqnORphx73/HJIaW5ilEf9vSQMLrW9yEk//7kmTsAQTbZ0MDiWVwPepYyQkioA0ZnRkB6HBA2hRldBMJIL+gGNXSbpNWknJ/Q4yHAOdv6YP4jtER0vHl8ZTdjHRIyPvU0o0kHHtpg3j20C55yAIk6TT1gIgAAP8vRFBgLVkaoR38ENRUWzvwPL7/4p5sgtHcN6i/LK+cp/75LvD/tJzIbh7t99DJZf6E+rd1/slcZYCrQK/A4yTSztcubIpEiKLPqnqO2nMYtPs7qWcjX1W5e7nLlN9zZb72bpTBfz43dnnq2utw8627z87bOfIchWf4jjt5/7mFof+caNbI1e4WtAvxmf6tp/67/mvFZn6L/DKtlkE1v9J/TSv/urtvQL6nv9P1iJey0AGtLnWMTNBdDXo/7dfQ2j00c16Vs8h8B/Bgh46aOiwrvomt/JiL/xZjE9XqT7E29zWKAoABn6XuDzxCjlyYGEDppEipotr5iUwIBTK0QBwWf2GheWsEN75ustO3OhHOb9UuX07Gv03Tu+6mNS8fexyjupR+u9FFErUo/CFJ1SdvP1/3786VyjDFY+v6T01I3mLw/u7/+5Jk7oMUoWfDgNtMED0MyJYIIrwO7ZsXA2zQQMeUY2ABiRjZtQlp92WeWxI6d9rIt206fkKaGB+AV8JKjL+uf50fxKfZIe1hlZFlPOblAAAkAAPMB5JCc46fYivp27AtNfqTrvu27/QHq2I29dv0ICSDpN/b23jl/+t1+iK9f84SvH//grYqXt0Qhnmy9LGHsvQhwuRqRSm2hYr1q7Yk6jgWMSIYepZSnSJaDzkFp06bTP8EFVB97bGckTQYlOculeTZZjb+pjUPPF3Uzkt/3Iv2lK1KU9DxN9Q1nk6UbyrRqvWnOm4NR13mnFSlE09RnI11GoMuuqYbc/raSuPm3GtyMlqSfdmErzOsma2OLOaljGG4OJ08hjIgfAIACo//zQg570txqL3C4fEmugW2z5yulM+yL1+r5W9GR8KWdSUaw+zbdauvYesGTW9ChwcMKe8vRQUVgeAZ+5llNhZGY5qKl+aQ5ucbvLDxKSsPFcpr5+VYVZmT5mPLYsv/aNdS8nXxxW87Wo59zt6r59/zvuf+fMv6wvc31Mkv9h/kZh05//uSZPALtGlmQ6k8TIA7S7ioACIaEaGdEwTtMED1H2JAEReAjf6c/2/PN+B98efBVu7l6hDN2dvjMmkkfmfYmW256mEXbsJxzL5fvhh4KRdjQ3lAeQbIPlCiJ5VTe0p5/50RlO7vLdUOIABg+VKkRyAexzK3pyJeL/9Xv//3f/tkGevbRXv3+FLlajMvxh6W1v5+ern0Oo2qoFAM2nuDiS3jaG43mIe3/KjirpZaSthzWU7lyOy92QI52qo10Qz7m5DwXhbPM5kPUn7Aqo/VRxT3GS2x44cg7PKGuWM3OZbwWeuotm75xnUD9tefm3bZ/JSLspTIGSM0dSPUtnVmNYSImayLAynZSLJbEUU26mvYBaAAA8/BqdA4GhXKX1GkjP+IAwKJBOOc6KwU6CFrO6PbGP3P2Qz8fpsMGqOsbbVdsXHCb9lTVJf+//8NCv5D3P2alQCOUADJ5fy5ExvxRpBQniSMOcrjTg2gmMDq1AabjPf/tvb1UVdU5mIa3Js8Pu7sOW//3/3P3pO3guXecxHX3Yyu1PxfyNXcpQ03GwXCnv/7kmTlgQO1Z0XA2jQQNkMZDATCRhGhnw4NmTWBCaQiWBMVICOWeVGbdnoomzCP3+jVeq2MOj+jL1u9u6J9PjY/QXjITEmxBcWVlHmtIZIxSFXKAGpyVQA4NoPXChgi3CPTMDZDnyhwlpcO7d1LScqEklRH8xrAQMfBC4L+ix9GESS//9tB/+n/t/bwf/T/wQVFTb0d0QEh3FBVmqcjKb1uXIikSdboJEn9v/t+XzsaS2fqz/WYs8vMrN7b2+M0RpWl7hRXQ6AHjoM7sbnP/7iY+1ra0xwU1QrZ78TJRApd2xf9MV/jpS46pkaCoGp1vdk/XZ2Es7vmlHxomQMqEh7SiUQmlGokCBBOmckcmBJEUtKTQxWlLT+bM9JSbDCCRE496fqY5zvBMxjsXp9lzrMjW5tncE0oN5xcracf34o/q9h9v/23f//1KiEKAZ+cPiOjqMTeHhbQbWUR1DuEfUMV8NrRMkwqcbVmxA8FMnj7UhXF5yg0bvfWyOmEtfminWIF4SdK3L51YUqxsoRWWz9r+O5eS9ynDYnIZeZA0en7hKT/+5Jk5gOT6GfFQTs0gD0q2NkEYj4QOZ0Uo2jQUN0UI1ATCHi06m7J3/aU4aQ1cqnq4nnlRP4lFAwv8bXTao2dIPKi6SruwwI6uR4cOjUrzScCVYNnXFC7DR9IH84GwMAB+Z80AxQkKREM+1eKIoMmGd6yMO1iIzDHC7q3IUX3oc22PezJx1RmO/8MZU3+Fs6+iliX+/8L/hf///eG+BMEeUr62/X9GDlEXg69G4w5bYjocRYHJvSJoia99BkwXvJ4+bj3hBnApZo+K2lYRpip4rq+aQuYDcCMkRzC/ay+UJpGVR1PcJUQ2nbxVazzTRst9mbUMSa+a5i2hLmYuHamotTKNE9uSS3coILK8EBpYdjhJRA1/quTF7oDt/7NmlF7czZnZrsifJdl239saTsO9//d/ZNNMfb/x8t+1HTva/ZZlAIAAr5fdyJgGBjAIe5bJzpeTNaNtYLOmB7C+JXcsGcmBfKZRac8pW8koIDJfAN61J4oe9inPROKb9fTge3eWdMlBEcqA6/3TnuiXmJ/sN4G4GabLUrViu1lnlfJmSyC//uSZOsJlJJmw6k7TBA+62ilCCXQDsGfFKNpEEC/oiMUAYkwtZe4czn/oopSv6UekW+xsDTBBArlHCUNAigIMLYCDANIEHvwgKFOSW0lcYo3R2rbAQAE2nogMAAhj/o//AwQICgYIcvYJZKqcoaW6Mt0ox6qRBlfHx+D8YcHy99PT/Gj/wQFBp4H/HwUR8j/vfq6PTeIYxM/XSitkMz2mdqCWCiR4kBF4jR58SCX+obqpE6O7Cpm7fheeqCS6VxNBFRdtcCbqF6EeFE+JLCOb6hGi+J6ixAub7xPdZSrA+2XwtHYh8yXojnNXCyfRDTGTY/ze1x8hjGTfEn1jrbqjtGCURWhiXGtThv3DQgcJbPLjThhWk16hgyuVG7+EiBGBt3sFFjBV955q88aXduPrbw2j7xC2di9YD1O3K//9fTVAIABnoSPOQsJTRAJCDkmzRwuiRwRzinaVp3CURHzXb7N+8g9l4CVRRe/aqq3/tU2bJbQ9H2Oawn2rM2bXT0D3RTtdYpmx076IU3rssFKHd4ilLWPmL66Sdap/dMj9LbaBv/7kmTui5R4ZsQo2zQSQSm4lQAiGA+dnRKjbRIAuIljYAEMuNb/pH2KbQVmn6Q9+u14h671MNkr9pI2ezFwn37x7N6WtufTz6pQrYxbNHK7cbePhaZX2GDXH7KgBIgEEo5RIMK92o48z/85Jxwi9laXs+qu+n3x/I5HfPI+M3vjP7N9Af/4fh9vjt/zjscO/9f/x3//jPn/TMDNxyvl9PbHRQw9NA7C99+u3Rqp15BEQe7ChtK3USKj6nmuJRbiPZu+6++76mlfouZNSV9Piuolnj3kerttHPN3USqQRKVvrV2LVDENq+RdMIYosq5A+n6mxuQp7MjMjur31CWgw85ynsfIqOYmQyKITZ9QRQFf3f/AFakZ0Qf2pV9qJ4qqXfPYqRLrIZkVgLhGAAybcIXICy3hRMDrell+tDP37Pu7P+gCgAC1fWb8q+ppHkKqyNmSxqW2YwycEhRn36XjjHXKIXNbZAp0Q+chydMUvI1n053WwzXSkzulCz5xp2NmZp+OsNXtFvIVnFOZBYwM8P0O2z0XQ79/rm6h3sz7F00WzD3/+5Jk74sEw2dDKTtkEj1LqLgBJSQOsZ8VBOkQQM+QpCQBDLhRpeZRKlmDvXkrt8ugpcyJxJOGdJ04juPiZXyGjSlUxZjryEiq0q+8BkYyW1lkPbDUTTK4XXKBWJFjpKe2U9xzYDAAIr7ITCgMDEMq/xkYpSA6KVtFRzO+39/vJG43Gt/dfGJ/4ZX8b/rb38L19YXDU3/jv+nr33T/fC/vxtWgEBJMfXG7WmUjzkyHM0hyZRqCakhTGopMKW9xxud8RKQNuXJMW60E1b5m+lJc7mf7/y4/vD41rt9z5tS1w9aMjGi8mZRjb29u/V5Dzo3CsruJuK3RzGVMv7vcZ9fHs0O7KGxRRnL2MT8WWlBDu8/Y095eGPLg/pTaaRWOqK4HgnIgWOW/u4ciEQM5om6Z/b6x9OmM+kZfT79f/b7sOOLt0e+n6qvr91FLf36DCgIAAG+i+BPEf6eAq5cO8zM0EzHE1ju0x4jIrsruTneit1OEIKQYizBKaft9zd82VZ+93zf8vy8J+05zL6wVy4U3h79b/OgzWvuRPpXX5qftiuV+//uSZO8DtQNoQyk7ZBI+bMiVAGUoD3GbFQNs0gjAm+KUAYkQqntuNqSNpHYZuemT1pXIpcj08jR9I/hw7ZzU1oyO7Evd5hY/JV0M83wJDvvRSJjSZ1mZ7ABAgAD4KOAAmY5+oOCGnT8cPjgjL4Tl6r5USJ2iHMwlka4KqA8YCWD4/+C/gfghvgvjeP4/4/Hj/////8aPG43HEALCLYSf2bEp8eBxJoBwZPDVR434OIRRjor+ZM/PRbP5ktW15sogNZvOd7fsmr16Yv2kXeTj6+u2y9RcPr53f/JX3772bvm+t16rf72/Hb5F5/ecvWt4fwjdX5hvs3qJm7mpbf35cxTVp+nM2hlR2lCkJ0ACuCAARckRqbr4Nx6Zxb/xIJCjR5igwkkZKioVjgmaDpZJq4bUF5CR07Ejc0LDZj9Cf/fVHPEq9Updt+fiTwzkpVep/UbVsQSmx4wYCTdy1NZhaeU0fk6EC9JNRtgmZuXiYY5XoS5htCd9xTN9LGXa1Rp/klGGR6nc9i8YdN0cJSBjKXPQISNtZk6dinPNPrwo21DEt//7kmTogwQ4Z8So2kwUQQzIuAgitg5tkxcDaNBIzwjjZACMYGboJWeg0mcmTEqTQgWUPjuJO5lktjaR2sgVjTVQmpGzDyHcnR00Gw/AjKDA8ZFLBbYWXF0UACwJAAAclSTuOUGX1VUzEUvwxJzKh3yu9lbO5nQQgKMFfcFXbt+MrBeif/gx+qU8R2/7Rv/9/g06P////9P8cAhEPeJyhaghETk2TEpawkkhalTArLrAmbZzNY1uVWZqFfP6zajKxcf30C+b5l+1clBT5yDfEwKt6DGS29v9Rdn8Tk7X7FNM/Prydymwo9Atu2dnkv8ufnvUi5NLg/g5ZWbFveI8ubpvqvQn4GW1NlEHPywykWlInrp8pQEiiQhKV2C4mwFVKAJVv+mQZW8nJtI3l1Vffy5+CKSYAysuKpdcsInfctEmv/1/8vQqDl9T0wrD3sLRImXkqKyIpQoD4cCm7VgkRPzNKcwpHGzSC7kURvL/TN0yNi8Us7NESjGVlfS+99ZhwrI+xfESjWH5xF1qydOQQEDM1B+cj2YOnIa67Stjlup8uvT/+5Jk74MUsWbDATtMED9seLkFIjQPdZsTBOzSAMQQoyADjJAvIMnrtyWlR5z2u78RnkJSmP8dplk0TeWjWLYaoWft24lUUBO2OokkwpwFLCCrNY4y76ouF8VdaUEnPoZgXSchcsGCAAAfe7RhgQJJVqHXhV+Ew5nQhjheasuPWXBaGvrkIT9JQTbvB66YyIT3f/wSR23b6L2/pb/pho/FP8kAgaEWznsSsggp8/hyVTCkPtWZhFD3B5soCT0tS7emaX7lRFSn2Aje7sC77IiSmeHyfPa500vz8kC0apm3l5P/T9RmfafS/2D1baQbe31h9E2WSLxCCj4keNsbfveNlMh1lAXD1u6zAnSuVvEY6fbbAisJcuo540BUrD0BuEWP0Z1KDLX8lGCL9eW33iG8GKVfDa8pEMzPwsEP8+lPv/LrHqOTNW3/Ff+te8cmYdvqlbuhn1VVWtBAQtCmOncbHSSxbFI0GL/dJE48blbQ9dlOKfCRyzY4TszrQQYQ1PU2EDt6ZaG5FYbvNr+edaWxOJnWszhlWpLt0iVLpmrrydJz//uSZO0DFOtnQwE7ZIA8yzi4CCKcED2fFQZo0gDGoSMUIIp4v/q9mZmlsMmOGRoaw3tskrTlNZm2vz1lDSyoAJmuQ9VQCYK6g3Z74ZnKef9oJ/fnvtsgIGM67kHrqm1WH87xz3uM8339Y2pD3yc7ruPZ+thGopqRSyt3fbv1ZfNWZtwAIDmL/iHl2gyrfYVj8Owc79qSdwGmZcXSLYv8Qc6ncl2TunMR4n839VZSDhWkYUg5uCxK/EhLWj6+ksg+mcsck597CM1UMHrICwuvMgwaR8nIIpTTz2+K96PxsKnVRS7/qdnsWS5YsO1xYSyVExTTWmMyeDL3tcOYEwxPkuKhk04dC3VYkwy3k+gugD+PgA9lUYyYIcYEPBcEBggIYHAAQKAAweOo6NTb0T19YEWASRRRLuE8F/wDBrwcENjf//ghv+OPG//9de329P//+OoAQAC2Hlm4lt1Q8K+kTRrBx9VunBUXKNPvwcC1pm5Ve+txZVPhzCBmto4dK1Om5Y57e6yEe2oVuN7La+H1ZBuKSTSOsu1s02ap55whIRHCSv/7kmTlAQM2Z0bA2RwQLoI5HABDIlPtnQoNpZXJEzEilCMLgDuoLYuamNyNS1hGYVrQ5aTOeqzitvI0PMmuiWxZYWRJmwbu1Ui6111hcB1l8HjbNxrYV3QeXy1kBQtQrhoimdb6uACsHUNyLsDGvK1U+DkZaVzFcIsEdiHJs9frUY0t0IpCL/4PVhngoMcAG/xuCBwdv/+/g///+P/6gAQga/WpJ3jqaTE6QUSWBI5X5VE2SnENFAKM5T9qvRVdDMe/3VulK8N33Yn7+0Zvxv87fGGUpIq8jd9atn/n5TDhbP+9RudP9q/fxulYW5D1sav1Z+TU/7k5r5hvs+YUoVhJBy318qCnRqJ2kmQdj3Mk1JtktsLAx2LAL7mpJAACaG0JO+PnVrewkdAI03ppdKuyEZURw4icOaQFyLhn7xn6BfIvWrukaf///1UAQIAADDouC5WYSwnZS7+kSIEE16TN4JectgNBJFhb2VVLpXtr9qnoGU2GnmhQ9TIyjDe1tPzNWQwbRNZ2KS5FjnoPCoLoOtKKGmtvMRriAsslJUq/JMX/+5Jk5wMEjWfDKTtcgjiqaMgAYkQPQZ8VA2jQQMmPpCgBiOjJYmckq1KtlsV5QX6sJMUJxTvfZ9pZKJsjsnPRhTqpaU20ZEmG2es+/ueHbJ1WmYIiaKpkyxR1qL+T3aZvdgQKGAE53Q4uOEFi/j6ln9fFoOz9DoeUgBtvQQlSUQb8VfUlCl5/W+GFSFDd8WRm1suAFjBPHC3xFLoABqDPk+Wh1EySzhjKGSmSSMeAdpRjKLE6mwKE+33G3DlLQfEmrMM2eV2jz5f5vTLLK1vEvcUjM9se87ZTwrtkVJ5cxyas13l1whLMsUv22K5SN8zpu96db+qd0naox0JQRaCbzSqg/cnNK/mXHHcmUskekTPM+sVT3T8H2oEuxLRhaNRNOsFT3IC+nGBLbrHzLDn/R/60Ww76wlv//4X/9qKP/Xdb9qCrbNTNuc0JAEAEgwyw/n352rS1rk5O0GX3sKD5LGLcJBgCZVeIPQTYVjBghJ9CLQlzrGF09uJ4xAzVePjCZJVhiwvIHskxAHgwlhEy/IDRkLQs1xYBy2ZT62G5kRNi//uSZOqDNKdmxMDaTBI6YjioACMAD02TFwNo0gjRoaJAIZdANJqDFOUspqgKU1WdYI8Wy1amnUpRFb9r0FIT8jXS14h7QhFqM0dn7N4xV7qXKHkE0u5ZBVUHFQRR9Li0aaNmbWgOgDxw9GUtndhYPB0LGPDHVmruA4djRXCOwDQ687RhZlESZcGCBA/jeq4MEC+OD/ww2+D//Bf/49P/0wf/+v/7aeAgY3fAHS+Q1pzaVStpjE6UthSDzI0qY//0LZFvS+saTc/I+7lKEQ/daWmJupoYJ7alqvRaekG0GcQqxBZ6QYIU7UnFUolEonqcSqFBCNupo9+RFxFSnl7brqwpXaztuh7I0DR9jRwjSGWve5iqrWUGDxOkGNUKrhimEDunRSoaxyDDTMA/2e8mSr1jq4qZ4OkvllOCsOFAgABcPBGkaXLt+ytxV+hrk3vRttZXZEP+nhyr+23RrSoAVYFAY2aWJ+0eIYo7kwjPoFTRnTtCMwA3QUMqSySbtU046ZeQObHycJ9kE10FnDEghg7/pmJsD5IaEonc0p3uZdx9Ov/7kmTqi5S9ZsMraGVwRqzYlRQitA/FlxIE5RII0AljGDAaQPSNaEbK+RkRY7MFG8gfli8hhWtKsGFjktLMzLywD/BFqXwIOEfQycODEUzOQRTE4QeFDwQwAEzQBAgAGbkEhzKa3m+UYUwk/qttPGjvUtU3p/74JDnZ57G/r/4LZs7P/3e/9l9vUi39IDAZ3neURtImZzy7Ik0BxMyEQMAMxNPWWZPX57u1F5GTQ6NBfzTEGNnPI77SDc2Me8VJCQg1VxQWJ5uELZKixq03cnZR6PSCxR8yMdVgfQ6TUF9mGpRcQIV624sRJ42k2cg1xd6LhFECqYkdbpY6amrRUOMPEYpmIHzcEi4dSodBo8bRijtIAwGAB25juDBVlpqU6wt9lG+zeMPdTmsqXwjImo0eVf/zfz1BPdtf8Yn+3/xSRH02/6bSP8Mui/g9qBaeIwAFkAAd2utaN2+XNnpSm0JNkUejwbZ0M8YjlVgbFtYlxBlqjvrqUqhz+9S34hwvtKxY+5qUYwMzdGNYau3rq4SakRomdY2Znf0ETEHSfwlRaa7/+5Bk4QEDxWfFQTQcsDPG+NoAYkgQyZ8So2kSAPUwIyAgimgSGtOoEk38iBS8bQsjaawt/pqECidU4loYQCZDiA2Rz4YxDEbg6EhBHDp2kYBAdrAwAKDJVARH7KRvQUmJrw+MHh+Hh6oPT8ZxibcY3T4XHBf1q/f3cMw1Tin/+GX/qvX////////DOphrSqiimcl1Y9RRDQUbFsjBysKbCgnFGehoUHAn7w+Jp52ymo34q3ffNnOTl9bRfTZm7Xq+rGP4JhyhL562Emck2i7/0P/8zMt0vVrLJoYELXRWdlkGDMjnbsBHO10hn/kpR/I82oNFhAGJV2IDuskhb8eWBSPWHgSwOpwANEy3UoNUgAQwgs1WHGRPZRDW9Xs2RmGNhGFVjDYUTFMEwcIz69p48SVYk3RsiZYy2u9amqKPofv/4yIDlzUhVZcYvVQqABZAAHe0vUNVsEWWGJEhAKXzSYeW4HRY6YEmIy7HBMIsQpmP4RhxTJemdb5oOUuim4U8enVtyl2T72tPV+lZ/7DF/eaZmMvxklkW1Dy2ePy8bF3/+5Jk54sT7GdEwTpEgDzMiKUIBYIQXZ0SpGjSAPgLY2AAiFDCMw+KNCmPKA0mSZvWNYMesFA6fZ6fDYNBPnl8cFLYsM5EuEWPKAggCckxbaAlGHqKaMBgMaB4AKaQ4IYT8fH/NTXlLlibv0sHxORl0anTZoXV4f5oeUy6vwv7f6DQlq2ITwpdLSH/Z//6QCGx+c5QrKlHonwBBSS3ENQneo4ElC+9Pza/r/58/QdlWkf/cnnhBuu07Yx3DsZ1afxY5VepLWt/5HKyZYX/QX89Rwx07sVzh+dnRl+b3Zmet2jaXIH/nvi3Tlvh2TSU8gZXo5vLpz04wYMCt+qDVsuYs5Z42rhWtPK0LWf4UJR8PjJUEorCtDAQAhqETjJXujaUBDiQEGC1cbHZWPQlRu1TMqHY4pfZtzgt62oS5GrouuC3ZL2q6aL//r77+v4P/u+39VUFgARlOrtL5A6LXWrvLOTQwpZMMKYgXE1irzHyas2vm9PaLnepvbUOzo9E63LZIqYIRrWY1vZukXsuzGi15hzIlqX3amh58HJSfDUi6609//uSZOiDlENnREE6NIA05pi1AEMuEP2dEKRpMgDwKCLkAIjQqfVGlLRo8w83XaYt3m0u/60bXJIyVZqbcuTTPL4fNLTYISTAQG6SoRJqGtYAvSrV0ea5sAgAaS5K5nwOagYqnsujZiEIla0ZbhTlR6801zsQyKi/GMI03nZHVcMjUtLB6FV7u5LbPRz/6n1nbKzU8oAyEN+Qt5PKXwM/EENGCIWPDwekUZ/SnjIuD1w9nr2UEXleIMleylltQrMj+UjHabnX7/N0PnjOEk7U9W1LD3fKzhja60Ej8oQjs5X/tXq5p8k2kt3LfR1M1KqGLlSqbXye9mBvYb4nXOsj+Rw7mSw3Ev8VivslhRLYTiwTxx65j3kVw/isQGp+nxo14EOMNRf70azpxkmD3yaJGMCcMiPZ5X1jLI6unXuXulwLqQqOvL85su/0WtaLNcpiABAiRCAY9zq2cLsxf/tdVZfaq0Iq/d7OU12mwicOnYonFZyljXRno5u9mNaM+D718KK/z++9K1YjBeTuzrK1nLWjqbFc8TDrdujeTuPr1+998f/7kmTmgZQUZsSpOjSAPMTIpQBlHhCtmRCjaTIA2BXjJCCLEN1TPKK8vznkuEvBr7tA5DJp6rCMYJFetRIzqBpdMwx8giwVpbabjqKc5bBLG0eY2uLomOUY8CN+Cgjb+QAo72VIggBSafDAVqaG6XLy9vy0CMiyKyAGBEZhEJz4WQIxvQvuvT/gLiMTdaP6dL/yqu9f23gNVRe3+HfzuS361LTu06VDlcwpMq/3JfHI+cJi4L/H5XsgyXY9SbpE3oX3rwvO2uJ3CdjqKJmz/4cJm8UpBvONfgxuzI27qsY26PtbqQ0157qNuDEXyaQ3u/fPSP3P8hnlUTfA9Iz6OBGPvLfUDN1JbtCSVYYAEqkyAAQcxcjA5hX4CIiVBqxUOCLjgxowQZBowDBBdt5wu3eRew8GX+vT+3+/+tXVXXYEyzM7stdk/DpenokWzuvvaV1gjPc3H/5VQIpjsbq/jEKnlZG5xj2Hf+fqMZ9MrnZ12YYhHZZW0nW/5UY4sjel0j9v2NZ0SX94tNeF/V4JyJmZQGqOGC+x/89PJyLn7VcBzJf/+5Jk6AMEdGhFWyZNcDYi2PoAZi4OsZ0XDIzVgMYQ46QAiTictjR+VHI00rcZ4dG4F4QpNSevRTIowyGZEPyQK3AqWkKQkx3AwAAvW4hNg6Jep2Tg17AQUoYMcowt64BYqHY82yTtQ8jA5+qKYMuZwci+ui/g1ggQKAjY4IePHx8AH8F/goLUFZ//9EoGntszs0pt2AIULa95pD5U3EykPE5TBZnKnc9XuHntwvyw8jz71rP1aW3LFUlPVJHvn5/3lYaqNHZ2nLwu3+dTlcIethOF4f5W4V5vyqvyG93pHsXVUWYNxiZY8Zrykv88+d8BjayrgKaLGpbUFZxuRFTerZdxmeKS1fCBGPOSJagqql7gs5TuvUHM5AQFEiX9RwLC+5IHk41YwZIcLJEUO5UH7mVvV+To/rhYb//Sm7SUVLxVmWMp1KAMSo8/vyaIP5QDwAGMhiSUKnGUydlwWSUQduJd1kTBjpvS5kWOfJw8Eoc5sT8J8/dr5OMsS8tz+UKzYS3LXjV3t1cp/85eyqpTurn9ut3+/JWZo3tf+TB7WnOU//uSZPEL9ENnw4GaTIBDyWilAMImESWfEQZpMgjrHuKAIJYYid0yWZoPv44dzw55/UzxUqZtK2dSmbxxSAIPMx1ecnJy6hr0WxNup1qZjCAZVw+pPF4uaNuZUIgAAQH7jijgFnHLYwTt7G5b7EdVR3TdBYOOevWYd6f/srq/e+v46/QLrjfw2iR3t9vr+t///+n2DeF6AAqks/njcz/vcqkTbjSOlM97e+xbqVfhu8Ggre5sEffcHTgrDj/7AHB3ndNkcF5Anfq7v9xn+70xsI7bNG8+7CRvxzQ54mjLAbbfmEHvBN4mam/IfQLe/Z3y/hp+77bpXiXUx6894xDOd6Y7Np8jSyPFQAHAgB20SYwfYBQYj+i6YVZ/VdHOY8p5HXFFHP1Thz/jVNPttNIUnsey/9H/9////vWi+i3e+pLqS9XpJY1BoMOy/DsxNV5nKbhhkJtciYF2kb/RvZQps6iR9E25DaS61okHtCk9JAZBfHIeo46iRI1OhTQOfqL5yHnr5179/SRpPQvSSJNf3I6We56F6UzD0UtdzUayQylnYv/7kmToAxRFZ8SpOUyAO6vYpQBlLA5BlRcMjNXIxRQjJACUWB4LKz5ggWZA9DMUwLlry1ZBMU8J76xayumJeu1T0SEs/pXtwroYkJtxaveWrY1kSx8LUCYoY91a9O9H3qWre7Tvm3049adGQpoiYQVqZV+5CNwHIoZNSmjKFYiSGr5rWV3J/5iNw0ABUSvN1AXFMnxRSNE5044AoJuQDBHfuxjH4zegIaNJooo0iOyNwDkCCaM6ZNXMK3pWUyaJuyC3lsxPHZTBrMqW+cuDKcibl+45qYTwZkRqWQJ/IeuCsh9PHSvH23Pc8wywc4Wc92/WLkdx3nnRiWInCJ0d80SKJJ6p9lCjjDBAi/+0VQhDUMSGqTaXNLlQmB6elTNKhVrrxz20vuepbtMfUhSh56fF6Cwdw5b3bWO9XbbcWxQAwAZtTHK6RhZKRxha6RA32ip6CAWcmmpJnSHL4bNJKC2C6o3J+3dK7cs6VwvLntYtQ1dUvtezVx9rQjDJyhPBjy3/oPWTpSce/4duLMvemPms+oVOD0x6jOYmB0Kcn+ZFyDH/+5Jk8wH1AGfDA0llYj4JOJAIIsoOJZsbhNByyM+AIkAAibh4ymLrOhuZKTcCkATnwv4bxuScx9qA0MjjTN3hyJBQNjTivyQXirESD0z/+8yov8gKiPygxKzMciLJZ3LLNSP7WMkpA9GqnR0DB6mmZVSXsXqS5QSF7wx2x7jWKtLpQfUxwtnJdBdzcURhgxio4sWx7BYHEQZMIzbmpW4ENAOtVtHt8JQZv1c2nyb7C0+pGm7mnfSrKabTjD+CKupM/KH99v83JFW+UjebjOOtfx3agfhrC7P57Lc3lVr1qQY2fbmpKj8Gr7ox/nDoYqVKVoS2G4CtJZ6H5bvKoS2cl4qIL2vPSNVQFJveUmTsSYKSKNk/7v/9e7N3oTttroivtk2ZN53R3mkEUpP7Z6S9nBgCDgGPxerX+UbvvRfdGVcg0cvEtU9UtGHH1vSo1qVDPV7ONtZKPStQSRRbVPyJ1jqrUZxtV83xPXkd3z/xha47nUvzk29bN9zr5ksh9O4luLQd2jdSZw52Y5Xu5bmqe4UvnzNknBFbgrdXscQ4lVRF//uSZPCJ1G1nw6jaTBA95liABCOOEOWfEQHlMEDvrCJEIIvYGEwJSl+5Oj0YL4cxFDYNrED0M43tZErFXZS8DRE5X6HaOIA+/xEsx1InybCpZBRg+TmsXBUQHwVXQAkdAcH2BsD/zsKb1CeG52pDyc1JN6nq6t+HPjttCvI15kUhCa+jKrtXtcfGvj/wz/4X9X//9YSFpTpVucZjRCkYtmrkNNUThuSgrUAWIOYvM1XEXQrqc6Wdc63tznS4a7Eo522NWRYxHbrKTi+WsbUp5edPPuP+5XvXz/S9C0o7RJS+z+ZrfW35vhmFql6D9BeexwYn3zGKN5pM45bQxS/K7d7Hd0cp1Ca5UMf89E/p8+ALtFKAd9KyOcCUOqMpHKdgb4LUFGAKvk8MGpnKdysLylkvfRIeyR7LykZp/SWWGC4Mf+OBceDG4L4/+z79X7KVBAVgAO1jlEin1LGAGKJrLVGAZAerXGMX1ptbE0bnT2YZ5YozUPCthv//qW7sFLjOD7ZPlZoK7ffEqK4JbW0pJWm0NbXTldVHLfv5DBdqmFahR//7kmToCwQuZ0QA2UwQPGkopQhlig9pnxMKFTUBAKCjpCGK4Fhd7qNyrXsRnzOSr4eYakcU7FMRmcYXNKvSLmCu9pnIQGzhzZSpOjZaBsmqK0edUTw9OiQaPGt02TkzVAAVIwHRnUKBljaMZKex7AtypPyF2+9Xfc0tWtW+1W/j2Zgf+3g//g/g/////+D/4LjeN/4P//4NkOa8cMp/OAQSchsI2iXvQku8wYWVQOAb+s57KSNjFE8xiddFlrUg5xI6s2MmMmTSWrqU7P0qimtbs+az6NDx4X3aYfmQwKU1Ll5DzfI+78jVJTM016mse+I0P6L4fm6BRYaVhtmocgLlhsyiDlGqMQkhfU68QoXlxQdYh0tvQud8n0uaifdUborM3tr8Gmsk8rl/1/fpso1du6z2v2I1KgTAA6F3G4/NaYjJKaNJNJHBAwQjEfOkxZkjxPyj4RMyVhrUvHOm1cZ4ezbLxqsd45HPG+a2eVfnqEfl/GnzYlnY/31+3CktK1sYQMXC6JpntalDfVnbaReK5bmSkZKlrkdchUmMx02xEpH/+5Jk6AGUb2hEwNlMgDhsuMgAYk4NzZ0bA0RzgMIYY6gAiLCnyIYpQuEWVeoMpSWtx0wrE6saLxNBgKcRkAeKYXLHmFFRML6v+tFp8e7yzH0QGYyQivUIIizmLDmvqzBOAt8X6MjXr+qfqjlu133dKIjJZWTdk8xaRAfb+ysGlQiQc3z6BvbetIAjcFevVdiP30dRAFKAGIJ2M6eLt2MKWL82hd/bszfXgm7K6OCNubPU1hP67uPodOyyNzn7yGShj53tU/7t36yu/p5003u/e9/T6BLyd1nIHOTStrM1g6iz2s7r/v/Sco2miSTZTd0kukkklzyNyO0no3EBhRCi+JFE34kjREBGmhD6KaAmeqoiU9tC1XqmeQ6SihnaEDwSySFs3/+/vwWC0cnZ/f1/+u6Skg+Cbp5yrX2bBPonp4LUancfTrO6FB/pxDATjwXAAh8+f5GEV9zjQCCFXUWctR5yRBEgrny/E1fQ6UiLQTwsOI01bQJGaox8Yl7nn2q6fwKu0suAuIIX7dtIcbTQ4xzrqr5c5LBkRltywzQWqm9k//uSZPQD1HdnxCk5TIJASniACCV+EQGdFQNlMED3M2KEAIjoV8xoyHujbi4ZCanHc2VRtMM7lmQlQxvcQWWr3gwsoITv2FAFQsjg5aAUBhw7GUoAgYEBAAAP6DBpT9SlGMZzfbHxn7nqR23lagnHQ+gTUQCMR4XNmT/lP0ede11yfXggf+CH///twSUoff//wf4wPGBfGBWmgZB36LeNglhtkSdgwgfL0wdQ0Z3vLf0W/S6kqVk6/5kHpCSDUVnyMf9mtuv9ZX76nmqOAlFrz98/+K6jiv+UVnM/NzSb7+2+qUV35fZ15eMZ/n7lKfZ+lF/StVttqud9V8Z1+Vgv1/yslLlf8otfdZ6BRbg2FqAAzyI5AAGf0W3PdouCnkETW12PIRr9XizqLhStEBIXENsO/R/+36H6v/jGEdPG/+kBApAAci6Vl0K0YUbTQcgJUJ0POONREidUnFW9U9KHRInWbyUGPUbbKzu98qmUZyFGZx2fQpX12Hp42ku9LEOf2mk76mmkk7p/1SF6e9Al/NT9PDTKJyMkk//pEb3IUaEgWf/7kmTogQQQaUQo2kQQQ8yoyhQi5A8ZnRckYNIAwhIjqAGU6FSejZZ2ntuTTX4KI3M9JyxRGylFki6SlKEif/xAkkhQvR8mKhxIGj6dkhIh3uOLLtXgCAAVyF3qdkFgQw1VsD9fIkFT3KZs6+t7t1vtYjkvgXoctV+jbf9AdB8H9fxgYB8F7wYOkB/+Dg/8V6///HGpGd3AWBjmYCFHCAufRgwJcnJ4h2zdmatVkI72fZnJVhXZTlDcw34XcpvtVqE4w6NlMXQLQe5lPvtPg/jU1OiNT/i+hFMfUp9HHYHq815LT6czeemvobgtulYJ1MPDjcx6QjVuJbBerOiWoaMDQ8eiCH21ocXiUvYiyzJ615hwEYHrODmtWMEHHvwT0fGYKDwJUIRxXzP6qd4t6ilYzwY3eiJ5MMyUuZz9/xhu//L/f8l3/vn9bfg/vg/36AmobVBv99v5tPn7jt9wShABkADLcTbbrTGPkLcMpiJOcQuXDENf8jC2zHL/2Lt9z74Y94jdjbc9/k2bm1/+0xj+a/vK3O7vp8ur9qTpo7WjsbD/+5Jk8AOUm2dEQTlMgD+s6IUAAgQScZ0OA2UyCNey4pQginjvGfIVpSZk2fOJ5jwlr62wiz09yUX3hte7baxQWxab5KbZNJgd1L1MOljp5TFLmf76MIgATJCgAPJIGCBodoC1IP9pmQNJlDN/7rRZBDo6VpGECbRA+RRYYHgQ1qX9ea6923/V//9vsAFGgZ2y3Y5WrsrXK4ARA8Dm0FJSkxqHmmKnlJJK4vTx/hriI//GSs4RWUvd5+BfeomupDZseduyviN25SSVKNzyeTu5p6n8xzp1J69NX5+5xdWUb5dr/DCenURm7MqJkGzn2EMULUPsFE9YIBTRd+ExowKKP4hVpVg0RU/RXlTaMWhJTZhKYmJNSl08B9CP/YEPOKEgq6URuCDCY7epqhmDJzLNZyHn91Qzh8k0hvVl7Lx6j2eDtt6J9hH+vf//7R//r7f/9b26nxoAQhAA7ovumJFFr3bgLSQx+WRGcGiwOm9s9iPWH6g3jIqirmZpBWkqr55uISothzINtmR7r7/iJNW92SIvWulpkeGcSbOnpnxbrFVC//uSZOCDE61nxUDZNIA1IyjJACMkEYmfEQNlMgD3MKLYIYrYu1Pkpy/VM8y0s4QQpqIkq03jFEyiDYhrN2vDDYR1EghmVVSF1gc9sIlzKCBQAlUsgAFR5/RwFfEDqDTxqejCkTAmNgkHlHluUfExUSEMpTIU2zJ3Koit7TP9G3/p/9KweKd/eySkYeWDteiExcSWUR/RHLdm6A8Ne/Dcz7bk8mSRtuMz0rMKGL1UQLwTP5W5cMUfkLzNlksnOUqq2ndvySyU/Fi0p705ZAvBOj6Cic2/YUYoqHsO+Ma/hExTNoa2MBK3Qrd+UTqlLbPm4lkjLMEsJgcyEkmzi5LCs2AQ8PLAWD0VaXhix9WYqcPNDJUHcABhXQL8GuAQ814R3S/MGDkoJlqL1F/oo2g/dENRB6DOv9/TZcq1/6/J9ZuVPn/tt912vTbf/r/9oxBq//L1AxAB6G3VvRwhzpmQqClHEc/JguXJX1AtT6Z2j0PFFV0eEm1s6AfaEU9Zm5WmSBrtc8NAgVWiSG61lFt9UY/PqIW7kYj0aKUIkBMCQpTII//7kmTlAxPFZ8VA2ESAMuKI2QBiJhIpnw6mYTIA9q6i5AGUsAjm6zUTdUXfsNkaGrqQxNfQYFTwdNC9/wArO6PDIG1gZQbEluzlA++EoWaTzMNy4SFLNiKGzhEEMJRR6+wCAB7ivr3VyB5UGi8aIbNuBD4WPFX5Q1p7hm+QcwgcycfPLg/9BfyA649yjvwwi+MGkT0x34WM/vHYD/uN2/ot3J1/9PbUAjNAL2mrjSeRR42lIttxGW2yw+QonAjVF1xNtdU8vtk1LRXbRF1due9QipbXVxN2nbVf8dTqPRJSLTlYmrutLa4enqPq2e7f2prRuSL96gY8TM0MvlxSJhrmad77DJXMnidnVaplCWxy+awPJUMtUGB9D7AIRhUmgLuUI2JmkwY1E3pw8UPAf6l6VR6NVBetdKyMX2SJhc66X1kqkb/7O/3dLVaemmlNKgFAAG9a/b/c1mKOInU7V0FE4qaHNOx3TvmjG49b/3Vf1rBrcSuJz3/n539iTCeXDks14tsZ9leXKvCE5Qyfpu63MQ7Xk2xfw7E2kPJctO9TkHz/+5Jk5oEUXmbDqTlEgkYo2JUUZcYOdZ8VBM0SANOQ42ABiGg1tpSQi2xvYSfaqMrCCtRkHy1x01DeV3F4mpwQRE6XKLjdisQA7gwtli3JRzj4fvxoPyHh9U/ZaAQALrIpeDuDwIiqx0DMMGaLVSiMxZm0KkdUNXsY6fo1Co38//0j8f9Y/8MG42v/jf//8MG0hnjeF/w3/7eF2aapJulWt8yKTWnTjHDzHD4KiFQTaSIdN1Ql19YtchTcK73sOcuXK7Zo9s8Zkdfd3a2HLeWK7rZtWVj1u2uabxFezJzYyf7pDn2XnTX5no5lzYPhudB1pGXBdIp6fqeKROWqZyJRLLJEEFFPfhjGhsSB4p7xnwYUa92ShwfsTTqDGHGKqM9B0U7tT9edGUxCkd/2k/wf+r7J60bXHv0/07//+N/////+CjJSe9T0yTRlYqOq2vFdGIUZtYjh4zIXHx/lEMOOocZsorN9vB/cedA0ws7Vn7H/s1pruWvFfNudOqKY3W2JWouvTNelh7av5A3W126c7HXMT15EVqc71ROmim0pyq1x//uSZOgLFE1nxCjYTIA+jCilAGUeDiWfEKmM1QDeMaLUAIhIgoPDXGoyqqiSxvRWIF6KLK43YSvaDdHebRNpMJRVqJ4+R/eYjk0kv1Rkl4tUX0MlZaUNEyiR7kMazZ9ykAAEBgAAffTRjMQQn4X95TqBobyEhHPsmmrJ/Vi6qD64jVkuIZ+d+9a9bZnJXo9fbVL4LANC/kktfNdt2pNik59AIDMY7MQr74c1yhR6I4g2YgieVESw6a5ceTLKhWd3KIGZSOtGSfrkXfN8PnbXyf/26JL0xvntzJVqPhXqjPndvr7MfMSZFvOJY0blU74278K9X99IapE5A93QpZ1vWTl7FbMKUZkUhCM+CoYMNQWB3VUD5Z2FUEqEYtX16Ki4M2iNoL76jPu6t7I76FVm8HGx+Xk6eePr/5piooRXYmjLsvps1hMZ/9//b9AtZQABgIANuOyPf5u9GURgDBChq2hIt2jDVyeaPQ/5J8UTTewr+SQ/79hVWdHpeo1cp3UWsuN5K5Z4jXzfzORnD1UPtR1BOf8/Vmz6UIzmRB6r/ye+Vf/7kmTug5TfZ0MBOWSAQMiIuQRiTg8hnRUDYNIAzCIjFCCLkOpV263GYly1QteWwrKxmcrGHlzI6YGc23firJ+GZWzBB5HOA6j8RcbFMmrlMEFPqSpvtAAhDAAAzQCDkdyF/hsMDKnb9TIosPohKzETpEk1/XiH2jW7J8M79LdKfi3G3/Tqqv/LUV/xiOM/r8I+nVf8e9IALKOR743a84zcxEgZ1GthWZjwBoQWsqsyGsmSpiPR3iSoLw0hzGmCytmKMaO1tXxG83yZ4r/C5Vkna2a8O0+2nzXkU19t+bva/8nFy0XePVymx+454x9zsVtV7KZ+e0GlQ8Tr5mbtS/bNL6WFO8gsysYiolgwbAsKXBpVAkdPoOL/OVFoUKEBWVG3uOpZWkSBoxQLkCY9yVKctVDnOx+a/W6xP1w8lien1Cjk6wBZEABU4/r0HMJpngh45QWRqbpQkRMgJUg7enJqT4ePWk3bbC7E0/exl9rPLUt+JJrZf+6UokOIPhaD623s4zDVDc9U8NxU5XYPLSmyKufMfndh3WKjzm904VPWs1r/+5Jk6QGENmdEQNhMgEAsiKkAZUQPJZsVAzzSCNAFo2QAiRCf0uyKTSrckcl6noqJa/f4S/FaDCU5ZulfK/A3klj6yM7ZoMGMObI+V68mBkuYsTYBCIAAFUCP0UElMFf/MWoYOAgpCCggFo4YYALIEWttD56dfq+IdtM7y+vt8t+17f3lfX////p/GWP3YHO/rAAQgOW/G8VFG2RbkxUzKyVM3FANisB48DKZ/Oh165pnTNszJrOmr9pQu9E+usmdytqp9nXvdmltrTKNz0Ae9lJRfNopysHFO7aFV3utteevs5bm05vNO1qlcajmuVY/GrVn4lUUPW2HiLDFWdzKPFPVA6eI7h0a+7lPiLm1hzqHInFsrFzq7lKEW1C+M4ospomoNZL+mgPg/YeNBqYvXw6TXgvOKLhj7G2wQIGMvG4+DVpwOMCx/wWkVU3pqIBQVBbvvREdUgv8cHBjQX//g//39//dH7/goP+D9aoAQaEAzJ1mzW/pt3GWIR0s3SZ9kQKtc6nnZuQnKo1yePu4XbNs3Lv9nfI3L+39zzXXmvL+//uSZO4DlHFnxMDYTIA9qriWAGdeErmjDQTlkgEWsqJUIwjgfdozv22zHru2d/Dte1lPG5pbP/HvXbI12aW7VOPAFEN/c3ny8xJp3bh5zN1wOaGXvZysqzat0QJ6hmzxByACEMAErvmaBwmkxAweCD6hnzs91b/6BVYr5qHMaj21U/SxiAsauV1DWUHWi++ImEIyuoLWawy/1YHF7fSjU5Xjb/xiDGbWnpQrYQ1MScXgAskdpXqUxehSJJf0sZvFIMlVP/mM8msbHVC3w2Nxs8aJ3FysUKxEtPjFvpuKtnEq1UP0IDxjG/axPAxaG1Bvr0N4lOZsQT8YwpQlXqY4ke9iUehgy0ex9ifozeRsg2EAFqt4Aq1EqBDYaEoqBhYSQ4aGXTXq8sn9EHABYIWZ0AVvsrkaiOz9Wy0HbZfseHtbfv+Ubozz/dg+rf2u87e/W9pbhtdNkr/9Wr4NFQHEAAAbx29acMNn8yoIH7M9Jz4E6NqttJRDCRMEUL+sfVSokHWZKzQ/o8dXxaNtavM6la8sJ67tXiv6q/E0CLFxR/UwJ//7kmTZCwOPZ0VA2DSAPcjYyABiJg6BlxKjQRIBIzMjJACIwJuq8pYTXcRJECpZREN4SLPnR8VC8iCkPiKqsHdq+1r20yIUCaJBdERIjCfUSRdCM4jHLATHE1QArAP5WleR1QXOkMsnXUwjFEqwKSSokTWfl5Cw/k5Hv25+j1jETf/tv7/t+v////T/////sFxUGNKFZ0Ri4qBbKKMKQ0sUUZQgW0OW6xFTl8YR629/bcYckzO2LUdn3b209v5K82cM7FXnnHX1vmcW8J7B2VUK/1KKXKo8Szex/m5hktcTxH2TO04S3C43qUSRsq0OCrBjFB729TdttJomjfEk/RKc0/i/fkzj5cXLaZg7XmwIiKGXXqKwuMGWReH6OPgqCEckzs8EowIbwoIWDVlfYEo7jhjBb/MUZZQcDvjf//xw8aJDMb6x/DI1Yz//7W//Gxn+HcQt/Gj43hjDKYetH4wGwAT5eGx7wwLSKNtpgE2k6yukMc9Yhm2qiDDaNccwIlQEeJEqEdTcOGEYdeNY553ywlMwygKOWKFnkgp6TTc6bJv/+5Jk4YmT4WdEsNFEgDas6LUIJcYREZ8OBGEyARczokQglxCb1UW6AjVRu/1nHXqM4JLTEM6mTsbqJQFDEQeWKKRqIpEAs4yQFa0JVdDVw8YigkbmPnlT9qIldrDZG9Tiws0hZ8qdKw7t803sF0Sms7eSU8V+1GHFB1m8/yIBcjIkKeCj1rlAFHurxX0rIURO6ESg/TEV3qlFg8rdMUHuxzajCZXUqQuTaQ6PiscOuc+38eFBZHvKmYLHXzLQOwmKJwekf2qJmUxB/4Waotu3A5D+YrpMajJucjCfPrwp7Uz7GKUMsqMOJ16TpllwniNoIwjqXVbKnbPKxSNsCU7EUNFVRV3TcFGnOxGaRy9rrawZkn8Jh2Y+zU1g8FBV1Y3z56Dk0LsDk8zPiqrxEwtKkrXc+GAxaGEF30kxqYHnB48yrHxMEbCCwvkkxjo8w9BwWSdQlWPOtRHJPIJSTzxdjqkAgAIxqS05Nf4f1ma+AYqiUGFADIHodDJ5t2vgpInqmWRvFx9/9D7WLvvjnr6q4UXE2N776i+ZUddX1Ay+Sapl//uSZOAD85tnRKjYHIIyIAigBEJuE0WfDqThMgkAgCIAEIjg064uZu+KeEn+0x1qnyto4mbmRJH+NrvooPdYwr2iiap8Su1iYdGJ9r1fPoF1jjhENnXTAAWpg/7tj/lOwQy+Xpf7a2eMw06f0Zr7HuewKWfWpVbJlYh6dVl80BQWEkVQM7FcVKo9zl/TYM2E2MzM6OixHzRtNLmgEhTSsTrs8wXSoMZYZfVqLNpy2EGyH/Y846GGBiSp3UT/KomYOZ88r7ZFUdG8GMfsLCz/oWk11hmvUzZv8TT/pFeSlrMyNoYrvDpatlxls5Xb/+I/PSllXMrwPTJYeY0p2JjjRO7qxkVBQyIhBs5CIyHZNGZyBgZxJDZgGEmSrZzVQlkFLW9apxK1i1W1z2qRutLuifvoY231GoLsErzy0WRYuhAAAG7tW1ve8eqWy0Wh8/Zvs/DfuSg6qvk5TrESZba/N9+5ybFLkCOow7Xn2ZmXrPXBQgRqRGZ9J5ePD6SkvQZCQR65tFX4EvnJNzIz6xx+dXn3uM2vk1t35GRBEMvWb1cqCP/7kmTfCdORZ8Soz0SANsQIogBDLAw5cRAisHCJQC9hxDCKeDz8twz6llFTa1NPaESGewYzXi1rzKrBjbMfqpmJyeQke0QYSKDjJvOeu20lIKROaqsVmr2r2nH5kDL3E1D3FeUcmhhXR3HLeb8OkZPaakDB1WG+PVxE0VrhgzMjvStxMxkIDM0bhsd4hVhq7gs2tqORdMs65Qz3aE94Fh9OGcul/VZym5kd2p1yVTU59vDRSqUmdCNvyNcl5fLKeimHstIgR0ya6e/aW9zsLMsrcw/81KEPEPnumZ0xITkz8tFyLCUG5CWIlzKxlbM+Nlkufm7S3Tym5ccjzKqI6iq4AQk1qGSrLVpINbIsRqSQMRg9yHgZKlECz2kDEKMpf8iZ1h5M+OTiE4CMebTNjO2JqK8s7UMsVW9jhccGD+yBCDCzgRp5KQMr1jSiaq238+1qk8/u6GXthrqsdqsPyLve321Tj509VUgRkjykfeahPt8tpdCNjUiPrGuRvPpFxZH4Hp2Zgy4qnZCWn3M1IjIjhE5a57Mh5k4JHA7uBRAAAAD/+5Bk8IfzHmFCKMM19mCNWDAAIxJLfZsEooRgCYs1YEAADAkSs5ozhKhkGSbAPMJnENMxSEHaiCgyIjY2rcg/dW6uaZMRhVtQdfyVMnv5vP6eZpxkiFCeMT17DkKqDKed8teUqR6mbZ2rSnU26G2MNliQVvuQ8F+1MmqBMynItpWzLhmhyWB5RttSlwRmmIMwQUF6OIV87tWHSKGeHZgmNQu8q1aVQyDdrOGddrCllCwnws8oVpQcukyGF3EBnUSVFrGJvYHgrtxWVGNHalweksRvY2zZyh0vY6TL1BRtGEw517LMMfcvIwW6vAtVb4nkdM2d8wx7kXColDvVNtuFmTlts1I1mpWtk0qPkljBmaoYnbWm1jMR4gdZUH7JaCHOxCFLVrBQhlsYgUcYxJ+FqgjJDh1HIEZobMwzH0ZgRKfnNjO2CBgAAFh/NS4dhlD9j8qSk1WGsKwVfLhJ3+zU0GIR/+qk1hhT6vxoXseftRLepG1JmNf6qlD/b5kx/kzky8MBh9LY9SMm6TbOuarSY1L4eGNV6qr/TjbUjIKRgJb/+5Jk7Y/y02ZAgEEYIlsr+BgEYujMsbD8AQBgAY+yX4AAjBFTOIIgAHOrn1nWVcMKlXalrGpcDHxqWolnE6mhZMMTiQtSONGh/YftVLWLG12q81Lgo+NdUMljUo1KGTUj81I16XPbjXVfpfsfGsAqcNSCk0UM2zf6S9pMOO/kriSVVgIGQ7P/ZymVUOzsYqIdnZP3YwUMFBhDs7f3KYKCBByOzsZf/+8bJI0UBHoLRqWd2/xIiKEiRBNDc3////uzO25snGlxeVJxZSU8+soiEaOF0D3SjV3/8lFZUqo27clGqutyUVk04bGtQkQydIEZg0hRFSxZfP4rKqCQBWr//yMy+ZF/ImcqKqP6KqWdkVEX///djKiKz8qIpHYxTKpHboqp/+5TKqO3+zlMFBAgx/1UiVSVctVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZO0CgulqPUBhHhJcq3eoDCPCT1mwsEEZPojqrVfIEArRVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+5JkQI/wAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//uSZECP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kmRAj/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=');
function playClienteBeep() {
  try { navigator.vibrate && navigator.vibrate([300, 100, 300, 100, 600]); } catch(e) {}
  try { _notifAudioCliente.currentTime = 0; _notifAudioCliente.volume = 1.0; _notifAudioCliente.play(); } catch(e) {}
}

function notificarClienteListo() {
  playClienteBeep();
  if (notifPermiso && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('🔥 ¡Tu pedido está listo!', {
        body: 'Pasá a retirar tu pedido en Mordelón 🎉',
        icon: 'https://mordelonsangucheria.github.io/Mordelon/logo.png',
        tag: 'mordelon-pedido-listo',
        renotify: true,
      });
    } catch(e) {}
  }
}

// Recuperar pedido activo si el cliente cerró el navegador
(function recuperarPedido() {
  // Recuperar pedido anterior (FAB)
  try {
    const rawAnt = localStorage.getItem('mordelon-pedido-ant');
    if (rawAnt) {
      const pedAnt = JSON.parse(rawAnt);
      if (pedAnt.firestoreId && (Date.now() - pedAnt.timestamp) < 4 * 60 * 60 * 1000) {
        getDoc(doc(db, 'pedidos', pedAnt.firestoreId)).then(snap => {
          if (snap.exists() && snap.data().estado !== 'cobrado') {
            mostrarFabPedidoAnt(pedAnt.firestoreId, pedAnt.numeroPedido, snap.data().estado);
          } else {
            localStorage.removeItem('mordelon-pedido-ant');
          }
        }).catch(() => localStorage.removeItem('mordelon-pedido-ant'));
      } else {
        localStorage.removeItem('mordelon-pedido-ant');
      }
    }
  } catch(e) { localStorage.removeItem('mordelon-pedido-ant'); }
})();

// Recuperar pedido activo si el cliente cerró el navegador
(function recuperarPedido() {
  try {
    const raw = localStorage.getItem('mordelon-pedido-activo');
    if (!raw) return;
    const pedido = JSON.parse(raw);
    // Solo recuperar pedidos de las últimas 4 horas
    if (!pedido.firestoreId || (Date.now() - pedido.timestamp) > 4 * 60 * 60 * 1000) {
      localStorage.removeItem('mordelon-pedido-activo');
      return;
    }
    // Verificar que el pedido siga activo en Firebase
    getDoc(doc(db, 'pedidos', pedido.firestoreId)).then(snap => {
      if (!snap.exists() || snap.data().estado === 'cobrado') {
        localStorage.removeItem('mordelon-pedido-activo');
        return;
      }
      // Restaurar estado
      numeroPedidoLocal = pedido.numeroPedido;
      document.getElementById('numPedidoConfirmado').textContent = '#' + numeroPedidoLocal;
      actualizarBarraEstado(snap.data().estado);
      escucharEstadoPedido(pedido.firestoreId);
      if (loginResuelto) showScreen('confirmado');
    }).catch(() => localStorage.removeItem('mordelon-pedido-activo'));
  } catch(e) {
    localStorage.removeItem('mordelon-pedido-activo');
  }
})();

// Cargar horarios desde Firebase
const horariosDefault = [
  { dia:'Lunes',     abierto:false, desde:'19:30', hasta:'23:00', turno2:false, desde2:'12:00', hasta2:'14:00' },
  { dia:'Martes',    abierto:true,  desde:'19:30', hasta:'23:00', turno2:false, desde2:'12:00', hasta2:'14:00' },
  { dia:'Miércoles', abierto:true,  desde:'19:30', hasta:'23:00', turno2:false, desde2:'12:00', hasta2:'14:00' },
  { dia:'Jueves',    abierto:true,  desde:'19:30', hasta:'23:00', turno2:false, desde2:'12:00', hasta2:'14:00' },
  { dia:'Viernes',   abierto:true,  desde:'19:30', hasta:'23:00', turno2:false, desde2:'12:00', hasta2:'14:00' },
  { dia:'Sábado',    abierto:true,  desde:'19:30', hasta:'23:00', turno2:false, desde2:'12:00', hasta2:'14:00' },
  { dia:'Domingo',   abierto:true,  desde:'19:30', hasta:'23:00', turno2:false, desde2:'12:00', hasta2:'14:00' },
];

function mostrarHorarios(dias) {
  const banner = document.getElementById('horariosBanner');
  const lista = document.getElementById('horariosLista');
  const body = document.getElementById('horariosBody');
  const chevron = document.getElementById('horariosChevron');
  banner.style.display = 'block';
  // Acordeón cerrado por defecto — el usuario lo abre con click
  lista.innerHTML = dias.map(h => `
    <div class="horario-fila">
      <span class="horario-dia">${h.dia}</span>
      <span>
        ${h.abierto
          ? `<span class="horario-hora">${h.desde} — ${h.hasta}${h.turno2 ? ` · ${h.desde2} — ${h.hasta2}` : ''} <span class="horario-abierto">✓</span></span>`
          : `<span class="horario-cerrado">Cerrado</span>`}
      </span>
    </div>
  `).join('');
}

// CUPONES EN TIEMPO REAL
let cuponesDisponibles = [];
let cuponAplicado = null;

onSnapshot(doc(db,'config','cupones'), (snap) => {
  cuponesDisponibles = (snap.exists() && snap.data().lista) ? snap.data().lista : [];
});

window.aplicarCupon = function() {
  const input = document.getElementById('cuponInput');
  const codigo = input.value.trim().toUpperCase();
  if (!codigo) return;
  if (!estaAbiertoAhora()) {
    document.getElementById('cuponMsg').textContent = '🕐 ¡El local aún está cerrado! ¡Canjealo cuando abramos!';
    document.getElementById('cuponMsg').style.color = 'var(--naranja)';
    return;
  }
  const cuponExiste = cuponesDisponibles.find(c => c.codigo === codigo);
  const cupon = cuponExiste && cuponExiste.activo && !cuponExiste.usado ? cuponExiste : null;
  if (!cupon) {
    const msg = cuponExiste && cuponExiste.usado
      ? '😅 ¡Este cupón ya fue usado! ¡Más suerte la próxima!'
      : '❌ Código inválido';
    document.getElementById('cuponMsg').textContent = msg;
    document.getElementById('cuponMsg').style.color = 'var(--rojo)';
    cuponAplicado = null;
    actualizarResumenPago();
    return;
  }
  cuponAplicado = cupon;
  const esItem = cupon.tipo === 'item';
  const msgTxt = esItem
    ? `🎁 ¡Listo! ${cupon.item || 'Premio'} al retirar`
    : `✅ -${cupon.pct}% aplicado!`;
  document.getElementById('cuponMsg').textContent = msgTxt;
  document.getElementById('cuponMsg').style.color = 'var(--verde)';
  actualizarResumenPago();
};

window.quitarCupon = function() {
  cuponAplicado = null;
  document.getElementById('cuponInput').value = '';
  document.getElementById('cuponMsg').textContent = '';
  actualizarResumenPago();
};

// PROMOS EN TIEMPO REAL
onSnapshot(doc(db,'config','promos'), (snap) => {
  const cont = document.getElementById('promosBanner');
  if (!cont) return;
  const lista = (snap.exists() && snap.data().lista) ? snap.data().lista.filter(p => p.activa) : [];
  if (!lista.length) { cont.style.display='none'; cont.innerHTML=''; return; }
  cont.style.display = 'block';
  cont.innerHTML = lista.map(p => `
    <div class="promo-banner" style="background:${p.color}18;border:1.5px solid ${p.color};">
      <div class="promo-banner-titulo" style="color:${p.color};">${p.emoji} ${p.titulo}</div>
      ${p.descripcion ? `<div class="promo-banner-desc" style="color:${p.color};">${p.descripcion}</div>` : ''}
      ${p.tipo==='descuento' && p.producto ? `<div style="font-size:0.72rem;color:${p.color};opacity:.8;margin-top:3px;">📦 ${p.producto} — ${p.descuento}% off</div>` : ''}
      ${p.tipo==='combo' && p.precioCombo ? `<div style="font-size:0.72rem;color:${p.color};opacity:.8;margin-top:3px;">💰 Precio especial: $${p.precioCombo.toLocaleString('es-AR')}</div>` : ''}
    </div>
  `).join('');

  // Aplicar badges en items del menú
  window._promosActivas = lista;
  if (typeof renderMenu === 'function') renderMenu();
});

// Mostrar horarios — esperar DOM listo
document.addEventListener('DOMContentLoaded', () => mostrarHorarios(horariosDefault));
if (document.readyState !== 'loading') mostrarHorarios(horariosDefault);

let horariosData = horariosDefault;
onSnapshot(doc(db,'config','horarios'), (snap) => {
  horariosData = (snap.exists() && snap.data().dias) ? snap.data().dias : horariosDefault;
  mostrarHorarios(horariosData);
});

function estaAbiertoAhora(margenMinutos = 0) {
  const ahora = new Date();
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const diaActual = dias[ahora.getDay()];
  const horario = horariosData.find(h => h.dia === diaActual);
  if (!horario || !horario.abierto) return false;
  const toMin = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
  const now = ahora.getHours()*60 + ahora.getMinutes();
  if (now >= toMin(horario.desde) - margenMinutos && now <= toMin(horario.hasta)) return true;
  if (horario.turno2 && now >= toMin(horario.desde2) - margenMinutos && now <= toMin(horario.hasta2)) return true;
  return false;
}

function proximaApertura() {
  const ahora = new Date();
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const diaActual = dias[ahora.getDay()];
  const horario = horariosData.find(h => h.dia === diaActual);
  if (horario && horario.abierto) {
    if (horario.turno2) return horario.desde2;
    return horario.desde;
  }
  // Buscar el próximo día abierto
  for (let i = 1; i <= 7; i++) {
    const sig = horariosData[(ahora.getDay() + i) % 7];
    if (sig && sig.abierto) return sig.dia + ' a las ' + sig.desde;
  }
  return null;
}

// Cargar menú desde Firebase en tiempo real
let stockActual = {};
onSnapshot(doc(db, 'config', 'stock'), (snap) => {
  stockActual = snap.exists() ? snap.data() : {};
  menu.forEach(item => { item.agotado = stockActual[item.id] === false; });
  if (menu.length) renderMenu();
});

onSnapshot(doc(db, 'config', 'menu'), (snap) => {
  if (snap.exists() && snap.data().items) {
    menu = snap.data().items;
  } else {
    menu = [
      { id:1,  cat:'🥪 Sánguches',     emoji:'🔥', nombre:'Mordelón de la Casa',       desc:'Bola de lomo desmechada, mozzarella, cebolla caramelizada · Ciabatta', precio:14000 },
      { id:2,  cat:'🥪 Sánguches',     emoji:'🧅', nombre:'Mordelón de los Aros',      desc:'Bola de lomo desmechada, cheddar, aros de cebolla · Ciabatta',         precio:15000 },
      { id:3,  cat:'🥪 Sánguches',     emoji:'🐷', nombre:'Cochino pero Fino',         desc:'Bondiola braseada, cheddar, pepinos agridulces · Ciabatta',             precio:14000 },
      { id:4,  cat:'🥪 Sánguches',     emoji:'🥔', nombre:'Sinvergüenza',              desc:'Papas doradas, carne desmechada, mozzarella · Ciabatta',                precio:14000 },
      { id:5,  cat:'🥪 Sánguches',     emoji:'🌶️', nombre:'TexMex',                   desc:'Carne picada, guacamole, cheddar, jalapeños · Ciabatta',                precio:14000 },
      { id:6,  cat:'🍟 Combos',        emoji:'🍟', nombre:'Combo Casa + Papas',        desc:'Mordelón de la Casa + porción de papas',                               precio:16000 },
      { id:7,  cat:'🍟 Combos',        emoji:'🍟', nombre:'Combo Aros + Papas',        desc:'Mordelón de los Aros + porción de papas',                              precio:17000 },
      { id:8,  cat:'🍟 Combos',        emoji:'🍟', nombre:'Combo Cochino + Papas',     desc:'Cochino pero Fino + porción de papas',                                 precio:16000 },
      { id:9,  cat:'🍟 Combos',        emoji:'🍟', nombre:'Combo Sinvergüenza + Papas',desc:'Sinvergüenza + porción de papas',                                      precio:16000 },
      { id:10, cat:'🍟 Combos',        emoji:'🍟', nombre:'Combo TexMex + Papas',      desc:'TexMex + porción de papas',                                            precio:16000 },
      { id:11, cat:'🍔 Smash Burgers', emoji:'🍔', nombre:'Smash Cheeseburger',        desc:'Clásica smash cheeseburger estilo americano',                           precio:11000 },
      { id:12, cat:'🍔 Smash Burgers', emoji:'🔥', nombre:'Smash de la Casa',          desc:'Medallón smash, mozzarella, cebolla caramelizada',                      precio:12000 },
      { id:13, cat:'🍔 Smash Burgers', emoji:'🌶️', nombre:'Smash TexMex',             desc:'Medallón smash, cheddar, guacamole, jalapeños',                         precio:12500 },
      { id:14, cat:'🍔 Smash Burgers', emoji:'🧅', nombre:'Smash Onion Burger',        desc:'Medallón smash, cheddar, aros de cebolla',                              precio:12500 },
      { id:15, cat:'🍔 Smash Burgers', emoji:'➕', nombre:'Medallón Extra',           desc:'Medallón adicional para cualquier burger',                              precio:2000  },
      { id:16, cat:'🫓 Arepas',        emoji:'🫓', nombre:'Arepa de Bola de Lomo',     desc:'Asada o frita · Bola de lomo desmechada con mozzarella',                precio:9000  },
      { id:17, cat:'🫓 Arepas',        emoji:'🧀', nombre:'Arepa de Jamón y Queso',    desc:'Asada o frita · Jamón y queso',                                         precio:7500  },
      { id:18, cat:'🍟 Extras',        emoji:'🍟', nombre:'Porción de Papas',          desc:'Papas fritas crocantes',                                                precio:4000  },
      { id:19, cat:'🥤 Bebidas',       emoji:'🥤', nombre:'Coca-Cola',                 desc:'Lata 354ml',                                                            precio:2000  },
      { id:20, cat:'🥤 Bebidas',       emoji:'🥤', nombre:'Sprite',                    desc:'Lata 354ml',                                                            precio:2000  },
      { id:21, cat:'🧅 Aros de Cebolla', emoji:'🧅', nombre:'Aros de Cebolla — Media Docena', desc:'Media docena de aros de cebolla crocantes', precio:5000  },
      { id:22, cat:'🧅 Aros de Cebolla', emoji:'🧅', nombre:'Aros de Cebolla — Docena',       desc:'Docena de aros de cebolla crocantes',       precio:9000  },
      { id:23, cat:'🧀 Tequeños',        emoji:'🧀', nombre:'Tequeños — Media Docena',         desc:'Media docena de tequeños de queso',          precio:9500  },
      { id:24, cat:'🧀 Tequeños',        emoji:'🧀', nombre:'Tequeños — Docena',               desc:'Docena de tequeños de queso',               precio:18000 },
      { id:25, cat:'🥪 Sánguches',       emoji:'🥩', nombre:'Sánguche de Milanesa Clásico',    desc:'Lechuga, tomate, jamón y queso · Ciabatta', precio:15000 },
      { id:26, cat:'🍟 Combos', emoji:'🥩', nombre:'Combo 2 Milanesas Clásicas',       desc:'2 sánguches de milanesa clásico',                           precio:25000, esCombo:true },
      { id:27, cat:'🍟 Combos', emoji:'🔥', nombre:'Combo Mordelón x4',                 desc:'4 Mordelón de la Casa + 4 porciones de papas',              precio:52000, esCombo:true },
      { id:28, cat:'🍟 Combos', emoji:'🔥', nombre:'Combo 2 de la Casa + Papas',        desc:'2 Mordelón de la Casa + 1 porción de papas',                precio:25000, esCombo:true },
      { id:29, cat:'🫙 Salsas', emoji:'🧄', nombre:'Salsa Besito de Ajo',       desc:'Salsa de ajo de la casa',  precio:500 },
      { id:30, cat:'🫙 Salsas', emoji:'🌶️', nombre:'Salsa Picante de la Casa', desc:'Salsa picante de la casa', precio:500 },
      { id:31, cat:'🫙 Salsas', emoji:'🥛', nombre:'Mayonesa Común',            desc:'Dip de mayonesa',          precio:500 },
    ];
  }
  menu.forEach(item => { item.agotado = stockActual[item.id] === false; });
  renderMenu();
});


// ── SISTEMA DE RECOMPENSA (moved into module for Firebase access) ──
// ── SISTEMA DE RECOMPENSA POR JUEGO (todos los juegos) ───────────────────
// Configuraciones por juego. Clave = id del juego: tetris, snake, 2048, dino
let recompensasConfig = {}; // { tetris: {puntos, pct, activo}, snake: {...}, ... }
let juegoActualRecompensa = 'tetris'; // juego visible actualmente
let recompensaYaGanada = {}; // { tetris: bool, snake: bool, ... }

// Exponer en window para que los scripts no-módulo puedan acceder
Object.defineProperty(window, 'juegoActualRecompensa', {
  get: () => juegoActualRecompensa,
  set: (v) => { juegoActualRecompensa = v; }
});

const JUEGOS_NOMBRES = { tetris: '🧱 Tetris', snake: '🐍 Snake', '2048': '🔢 2048', dino: '🦕 Dino', minas: '💣 Minas', slots: '🎰 Slots' };

// Escuchar configuraciones: nuevo doc recompensaJuegos (por juego) y fallback al legacy recompensaJuego (solo dino)
// Mostrar todos los botones de juegos por defecto (Firebase los oculta si corresponde)
document.addEventListener('DOMContentLoaded', () => {
  ['tetris','snake','2048','dino','minas','slots'].forEach(id => {
    const btn = document.getElementById('btnJuego' + id.charAt(0).toUpperCase() + id.slice(1));
    if (btn) btn.style.display = '';
  });
});

// ── TOGGLE VISIBILIDAD DE JUEGOS INDIVIDUALES ────────────────────────────
const JUEGOS_IDS = ['tetris', 'snake', '2048', 'dino', 'minas', 'slots'];
onSnapshot(doc(db, 'config', 'juegos'), (snap) => {
  const estado = snap.exists() ? snap.data() : {};
  let algunoVisible = false;
  JUEGOS_IDS.forEach(id => {
    // Si el campo no existe en Firebase, el juego está ACTIVO por defecto
    const val = estado[id];
    const activo = (val === undefined || val === null || val !== false);
    // Ocultar/mostrar botón selector
    const btn = document.getElementById('btnJuego' + id.charAt(0).toUpperCase() + id.slice(1));
    if (btn) btn.style.display = activo ? '' : 'none';
    if (activo) algunoVisible = true;
  });
  // Si el juego actualmente seleccionado fue desactivado, saltar al primero activo
  const btnActual = document.getElementById('btnJuego' + juegoActualRecompensa.charAt(0).toUpperCase() + juegoActualRecompensa.slice(1));
  if (btnActual && btnActual.style.display === 'none') {
    const primerActivo = JUEGOS_IDS.find(id => estado[id] !== false);
    if (primerActivo) window.elegirJuego(primerActivo);
  }
  // Ocultar la zona entera si no hay ningún juego activo
  const zona = document.getElementById('zonaJuegos');
  if (zona) zona.style.display = algunoVisible ? 'block' : 'none';
});

// ── DIFICULTAD DINO desde Firebase ─────────────────────────────────────────
onSnapshot(doc(db, 'config', 'dinoDificultad'), (snap) => {
  if (snap.exists()) {
    window.setDinoDificultad(snap.data().valor || 0);
  }
});

onSnapshot(doc(db,'config','recompensaJuegos'), (snap) => {
  if (snap.exists()) {
    recompensasConfig = snap.data(); // { tetris:{...}, snake:{...}, ... }
  }
  actualizarBarraRecompensa();
});

// Fallback legacy: si existe recompensaJuego (solo dino), usarlo también para el dino
onSnapshot(doc(db,'config','recompensaJuego'), (snap) => {
  if (snap.exists() && !recompensasConfig.dino) {
    recompensasConfig.dino = snap.data();
    actualizarBarraRecompensa();
  }
});

// Llamar esto cada vez que cambia el juego visible
function actualizarBarraRecompensa() {
  const juego = juegoActualRecompensa;
  const cfg = recompensasConfig[juego];
  const wrapEl = document.getElementById('recompensaProgressWrap');

  if (!cfg || cfg.activo === false || !cfg.puntos || !cfg.pct) {
    if (wrapEl) wrapEl.style.display = 'none';
    return;
  }

  // Obtener récord del juego actual (usando las mismas keys que cada juego)
  const records = {
    tetris: parseInt(localStorage.getItem('tetrisHiC') || '0'),
    snake:  parseInt(localStorage.getItem('snakeHiC') || '0'),
    '2048': parseInt(localStorage.getItem('g2048HiC') || '0'),
    dino:   parseInt(localStorage.getItem('dinoHiC') || '0'),
    minas:  parseInt(localStorage.getItem('minasHiC') || '0'),
    slots:  parseInt(localStorage.getItem('slotsHiC') || '0')
  };
  const puntosActuales = records[juego] || 0;

  if (wrapEl) wrapEl.style.display = 'block';
  const pct = Math.min(100, Math.round((puntosActuales / cfg.puntos) * 100));
  const barEl = document.getElementById('recompensaProgressBar');
  const labelEl = document.getElementById('recompensaProgressLabel');
  const nombreEl = document.getElementById('recompensaJuegoNombre');
  if (barEl) barEl.style.width = pct + '%';
  if (labelEl) labelEl.textContent = puntosActuales.toLocaleString('es-AR') + ' / ' + cfg.puntos.toLocaleString('es-AR') + ' pts';
  if (nombreEl) nombreEl.textContent = 'Récord en ' + (JUEGOS_NOMBRES[juego] || juego);

  // Verificar si ya ganó recompensa
  const lsKey = 'mordelon-recompensa-cupon-' + juego;
  const lsUsadoKey = 'mordelon-recompensa-usado-' + juego;
  const cuponGuardado = localStorage.getItem(lsKey);
  const cuponUsado = localStorage.getItem(lsUsadoKey);

  if (puntosActuales >= cfg.puntos) {
    if (cuponGuardado && !cuponUsado) {
      mostrarBannerRecompensa(cuponGuardado, cfg.pct);
    } else if (!recompensaYaGanada[juego] && !cuponUsado) {
      generarCuponRecompensa(cfg, juego);
    }
  } else {
    // Ocultar banner si no llegó al umbral (o ya usó el cupón)
    const banner = document.getElementById('recompensaBanner');
    if (banner && !cuponGuardado) banner.style.display = 'none';
  }
}
window.actualizarBarraRecompensa = actualizarBarraRecompensa;

// ===================== SISTEMA DE USUARIOS =====================
let usuarioActual = null; // { nombre, direccion, fichasSlots, record, ... }

// ── Tabs login/registro ──
window.loginMostrarTab = function(tab) {
  const isLogin = tab === 'login';
  document.getElementById('loginForm').style.display    = isLogin ? 'block' : 'none';
  document.getElementById('registroForm').style.display = isLogin ? 'none' : 'block';
  document.getElementById('loginTabBtn').style.background    = isLogin ? 'var(--turquesa)' : 'transparent';
  document.getElementById('loginTabBtn').style.color         = isLogin ? '#111' : '#666';
  document.getElementById('registroTabBtn').style.background = isLogin ? 'transparent' : 'var(--verde)';
  document.getElementById('registroTabBtn').style.color      = isLogin ? '#666' : '#111';
  document.getElementById('loginMsg').textContent = '';
  document.getElementById('regMsg').textContent = '';
};

// ── Teclado numérico login ──
window.loginTecla = function(val) {
  const inp = document.getElementById('loginClave');
  if (val === 'borrar') { inp.value = inp.value.slice(0,-1); return; }
  if (inp.value.length < 4) inp.value += val;
  if (inp.value.length === 4) window.loginEntrar();
};
window.regTecla = function(val) {
  const inp = document.getElementById('regClave');
  if (val === 'borrar') { inp.value = inp.value.slice(0,-1); return; }
  if (inp.value.length < 4) inp.value += val;
  if (inp.value.length === 4) window.registrarse();
};

// ── Ingresar ──
window.loginEntrar = async function() {
  const nombre = (document.getElementById('loginNombre').value||'').trim().toUpperCase();
  const clave  = (document.getElementById('loginClave').value||'').trim();
  const msgEl  = document.getElementById('loginMsg');

  if (!nombre) { msgEl.textContent = '⚠️ Ingresá tu nombre'; return; }
  if (clave.length !== 4) { msgEl.textContent = '⚠️ La clave debe tener 4 dígitos'; return; }

  msgEl.style.color = 'var(--turquesa)';
  msgEl.textContent = 'Verificando...';

  try {
    const snap = await getDoc(doc(db, 'clientes', nombre));
    if (!snap.exists()) {
      msgEl.style.color = 'var(--rojo)';
      msgEl.textContent = '❌ Usuario no encontrado';
      return;
    }
    const data = snap.data();
    if (data.clave !== clave) {
      msgEl.style.color = 'var(--rojo)';
      msgEl.textContent = '❌ Clave incorrecta';
      document.getElementById('loginClave').value = '';
      return;
    }
    usuarioActual = { nombre, ...data };
    localStorage.setItem('mordelon-usuario', JSON.stringify({ nombre, clave }));
    msgEl.textContent = '';
    loginExitoso();
  } catch(e) {
    msgEl.style.color = 'var(--rojo)';
    msgEl.textContent = '❌ Error de conexión';
    console.error(e);
  }
};

// ── Registrarse ──
window.registrarse = async function() {
  const nombre   = (document.getElementById('regNombre').value||'').trim().toUpperCase();
  const clave    = (document.getElementById('regClave').value||'').trim();
  const dir      = (document.getElementById('regDireccion').value||'').trim();
  const msgEl    = document.getElementById('regMsg');

  if (!nombre || nombre.length < 2) { msgEl.style.color='var(--rojo)'; msgEl.textContent = '⚠️ Nombre de al menos 2 caracteres'; return; }
  if (!/^[A-Z0-9 ]+$/.test(nombre)) { msgEl.style.color='var(--rojo)'; msgEl.textContent = '⚠️ Solo letras y números'; return; }
  if (clave.length !== 4 || !/^\d{4}$/.test(clave)) { msgEl.style.color='var(--rojo)'; msgEl.textContent = '⚠️ La clave debe ser 4 dígitos numéricos'; return; }

  msgEl.style.color = 'var(--turquesa)';
  msgEl.textContent = 'Creando cuenta...';

  try {
    const ref = doc(db, 'clientes', nombre);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      msgEl.style.color = 'var(--rojo)';
      msgEl.textContent = '❌ Ese nombre ya está en uso, elegí otro';
      return;
    }
    const nuevoUsuario = {
      nombre, clave, direccion: dir,
      fichasSlots: 3, recordSlots: 0,
      historialPedidos: [], puntosJuegos: {},
      creadoEn: Date.now()
    };
    await setDoc(ref, nuevoUsuario);
    usuarioActual = { ...nuevoUsuario };
    localStorage.setItem('mordelon-usuario', JSON.stringify({ nombre, clave }));
    msgEl.textContent = '';
    loginExitoso();
  } catch(e) {
    msgEl.style.color = 'var(--rojo)';
    msgEl.textContent = '❌ Error al crear cuenta';
    console.error(e);
  }
};

// ── Continuar sin cuenta ──
window.continuarSinCuenta = function() {
  usuarioActual = null;
  localStorage.removeItem('mordelon-usuario');
  entrarAMenu();
};

// ── Post-login: cargar datos del usuario ──
function loginExitoso() {
  // Pre-llenar campos del carrito con datos del usuario
  const nombreInput = document.getElementById('nombreCliente');
  const dirInput    = document.getElementById('direccionCliente');
  if (nombreInput && usuarioActual?.nombre) nombreInput.value = usuarioActual.nombre;
  if (dirInput && usuarioActual?.direccion) dirInput.value = usuarioActual.direccion;

  // Sincronizar fichas de slots con Firebase
  if (usuarioActual) {
    // Migrar fichas del sistema viejo si existían
    const fichasViejas = parseInt(localStorage.getItem('slotsFichasC') || '0');
    if (fichasViejas > 0 && !usuarioActual.fichasSlots) {
      updateDoc(doc(db, 'clientes', usuarioActual.nombre), { fichasSlots: fichasViejas });
      localStorage.removeItem('slotsFichasC');
    }
  }

  // Escuchar cambios del usuario en tiempo real (fichas, etc.)
  if (usuarioActual) {
    onSnapshot(doc(db, 'clientes', usuarioActual.nombre), (s) => {
      if (!s.exists()) return;
      const d = s.data();
      // Fichas cargadas por vendedor en tiempo real
      const fichasNuevas = d.fichasSlots ?? 0;
      const fichasAntes  = usuarioActual.fichasSlots ?? 0;
      if (fichasNuevas > fichasAntes) {
        const extra = fichasNuevas - fichasAntes;
        // Actualizar variable global de slots también
        slotsFichas = fichasNuevas;
        const msgEl = document.getElementById('slotsMensaje');
        if (msgEl) {
          msgEl.textContent = '🎉 ¡Recibiste ' + extra + ' ficha' + (extra>1?'s':'') + '!';
          msgEl.style.color = 'var(--turquesa)';
        }
      }
      // Siempre sincronizar usuarioActual con Firebase
      usuarioActual = { ...usuarioActual, ...d };
      slotsFichas  = usuarioActual.fichasSlots ?? slotsFichas;
      slotsHiScore = usuarioActual.recordSlots ?? slotsHiScore;
      slotsActualizarUI();
    });
  }

  entrarAMenu();
}

function entrarAMenu() {
  loginResuelto = true;
  // Cambiar screen-login → screen-menu
  const loginScr = document.getElementById('screen-login');
  loginScr.classList.remove('active');
  loginScr.style.display = 'none';
  document.querySelectorAll('.screen:not(#screen-login)').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-menu').classList.add('active');
  // Mostrar nombre en header si está logueado
  actualizarHeaderUsuario();
  const badge = document.getElementById('btnCerrarSesion');
  if (badge) badge.style.display = usuarioActual ? 'inline-block' : 'none';
}

function actualizarHeaderUsuario() {
  let badge = document.getElementById('usuarioBadge');
  if (!badge) return;
  if (usuarioActual) {
    badge.textContent = '👤 ' + usuarioActual.nombre;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

// ── Auto-login si tiene sesión guardada ──
async function intentarAutoLogin() {
  // Limpiar claves viejas que podrían causar bypass del login
  localStorage.removeItem('mordelon-sesion');
  localStorage.removeItem('slotsNombreC');  // viejo sistema slots
  
  const sesionGuardada = localStorage.getItem('mordelon-usuario');
  if (!sesionGuardada) {
    // Sin sesión → mostrar login (ya está activo por defecto)
    return;
  }
  try {
    const { nombre, clave } = JSON.parse(sesionGuardada);
    const snap = await getDoc(doc(db, 'clientes', nombre));
    if (snap.exists() && snap.data().clave === clave) {
      usuarioActual = { nombre, ...snap.data() };
      loginExitoso();
    } else {
      localStorage.removeItem('mordelon-usuario');
    }
  } catch(e) {
    // Sin conexión → mostrar login igual
    console.warn('Auto-login falló:', e);
  }
}

intentarAutoLogin();

// ── Cerrar sesión del cliente ──
window.cerrarSesionCliente = function() {
  loginResuelto = false;
  usuarioActual = null;
  localStorage.removeItem('mordelon-usuario');
  document.querySelectorAll('.screen:not(#screen-login)').forEach(s => s.classList.remove('active'));
  const loginScr = document.getElementById('screen-login');
  loginScr.classList.add('active');
  loginScr.style.display = 'flex';
  const li = document.getElementById('loginNombre'); if(li) li.value='';
  const lc = document.getElementById('loginClave');  if(lc) lc.value='';
  const lm = document.getElementById('loginMsg'); if(lm) lm.textContent = '';
};

// ── Guardar pedido en historial del usuario ──
async function guardarPedidoEnUsuario(pedidoId, total, items) {
  if (!usuarioActual) return;
  try {
    const entrada = { pedidoId, total, items: items.length, timestamp: Date.now() };
    const hist = usuarioActual.historialPedidos || [];
    hist.unshift(entrada);
    if (hist.length > 20) hist.length = 20; // máx 20
    await updateDoc(doc(db, 'clientes', usuarioActual.nombre), { historialPedidos: hist });
    usuarioActual.historialPedidos = hist;
  } catch(e) { console.error('Error guardando historial:', e); }
}


// ═══════════════════════════════════════════════════════
//  TRAGALLAMA — Sistema Jackpot Mordelón (v3)
// ═══════════════════════════════════════════════════════

// ── Símbolos del Tragallama ─────────────────────────
// peso: frecuencia relativa de aparición por rodillo
// Símbolos base (los emojis se actualizan desde Firebase si el vendedor los cambia)
let TL_SIMBOLOS = [
  { e:'💀', nombre:'Calavera',  peso:30, rareza:'común'      },
  { e:'🍟', nombre:'Papas',     peso:28, rareza:'común'      },
  { e:'🥤', nombre:'Bebida',    peso:22, rareza:'común'      },
  { e:'🧀', nombre:'Queso',     peso:18, rareza:'poco común' },
  { e:'🥪', nombre:'Sánguche',  peso:10, rareza:'raro'       },
  { e:'🦙', nombre:'Llama',     peso:4,  rareza:'épico'      },
  { e:'🔥', nombre:'Fuego',     peso:1,  rareza:'legendario' },
];
let TL_POOL = [];
function _tlReconstruirPool() {
  TL_POOL.length = 0;
  TL_SIMBOLOS.forEach(s => { for(let i=0;i<s.peso;i++) TL_POOL.push(s); });
}
_tlReconstruirPool();

// Actualizar emojis del pool cuando cambia la config
function _tlActualizarSimbolosDesdeFirebase(premios) {
  if (!premios || !premios.length) return;
  // premios está en orden: jackpot(pos0)...sin_premio(pos6)
  // TL_SIMBOLOS está en orden inverso de rareza: [común...legendario]
  // Mapear por posición inversa
  const posASimbol = [6,5,4,3,2,1,0]; // posición en premios → índice en TL_SIMBOLOS
  premios.forEach((p, i) => {
    const si = posASimbol[i];
    if (si !== undefined && TL_SIMBOLOS[si]) {
      TL_SIMBOLOS[si].e = p.emoji;
    }
  });
  _tlReconstruirPool();
}

// ── Premios por resultado ───────────────────────────
// Sistema basado en probabilidades reales de 3 rodillos
// Con pool: calavera ~26%, papas ~24%, bebida ~19%, queso ~15%, sanguchea ~8%, llama ~3%, fuego~0.08%
// Prob jackpot (🔥🔥🔥): ~1/113^3... pero usamos overrides para control exacto
// Premios por defecto (se sobreescriben con los de Firebase)
const TL_PREMIOS_DEFAULT = {
  '🔥': { nivel:'jackpot', label:'🔥 JACKPOT MORDELÓN 🔥', premio:'Combo Mordelón x4 · 4 sánguches + papas', color:'#FFB800', pts:2000, cupon:true,  cuponTipo:'item', cuponItem:'Combo Mordelón x4 (4 Mordelón de la Casa + 4 porciones de papas)', esJackpot:true  },
  '🦙': { nivel:'grande',  label:'🦙 LLAMA x3',            premio:'Mordelón de la Casa gratis',               color:'#3DBFB8', pts:500,  cupon:true,  cuponTipo:'item', cuponItem:'Mordelón de la Casa',  esJackpot:false },
  '🥪': { nivel:'grande',  label:'🥪 SÁNGUCHE x3',         premio:'Porción de Papas gratis',                  color:'#2DC653', pts:300,  cupon:true,  cuponTipo:'item', cuponItem:'Porción de Papas',     esJackpot:false },
  '🧀': { nivel:'medio',   label:'🧀 QUESO x3',            premio:'Tequeños Media Docena gratis',             color:'#D4831A', pts:150,  cupon:true,  cuponTipo:'item', cuponItem:'Tequeños — Media Docena', esJackpot:false },
  '🥤': { nivel:'medio',   label:'🥤 BEBIDA x3',           premio:'Coca-Cola gratis',                         color:'#D4831A', pts:100,  cupon:true,  cuponTipo:'item', cuponItem:'Coca-Cola',            esJackpot:false },
  '🍟': { nivel:'pequeño', label:'🍟 PAPAS x3',            premio:'Salsa de la casa gratis',                  color:'#3DBFB8', pts:50,   cupon:true,  cuponTipo:'item', cuponItem:'Salsa Besito de Ajo',  esJackpot:false },
  '💀': { nivel:'ninguno', label:'💀 MORDELÓN SE RÍE',     premio:'',                                         color:'#555',    pts:0,    cupon:false, cuponTipo:'pct',  cuponItem:'',                     esJackpot:false },
};
let TL_PREMIOS = { ...TL_PREMIOS_DEFAULT };

// Lista ordenada de premios por posición (índice 0 = jackpot, último = sin premio)
// Se actualiza desde Firebase. Se usa para la tabla y para obtener el premio al girar.
let _tlPremiosOrdenados = null; // null = usar defaults

// Escuchar cambios de premios desde Firebase (editados por el vendedor)
onSnapshot(doc(db,'config','tragallamaPremios'), snap => {
  if (snap.exists() && snap.data().premios) {
    const lista = snap.data().premios;
    _tlPremiosOrdenados = lista;
    // Reconstruir TL_PREMIOS keyed por emoji (para compatibilidad con lógica de spin)
    const nuevo = {};
    lista.forEach(p => { nuevo[p.emoji] = p; });
    TL_PREMIOS = nuevo;
    // Actualizar umbrales de probabilidad y emojis del pool visual
    _tlActualizarProbsDesdeFirebase(lista);
    _tlActualizarSimbolosDesdeFirebase(lista);
  } else {
    _tlPremiosOrdenados = null;
    TL_PREMIOS = { ...TL_PREMIOS_DEFAULT };
  }
  tlRenderTabla();
});

// Actualizar las probabilidades controladas según config del vendedor
function _tlActualizarProbsDesdeFirebase(premios) {
  if (!premios || !premios.length) return;
  // Los premios vienen en orden: jackpot, llama, sanguche, queso, bebida, papas, sin_premio
  const claves = ['jackpot','llama','sanguche','queso','bebida','papas'];
  premios.forEach((p, i) => {
    if (i < claves.length) _tlUmbralCustom[claves[i]] = parseFloat(p.pct) || 0;
  });
}
// Umbrales personalizables (se sobreescriben con Firebase)
const _tlUmbralCustom = { jackpot:0.1, llama:0.9, sanguche:3, queso:6, bebida:10, papas:20 };

// Obtener el emoji del resultado según posición en la lista de premios
function _tlEmojiPorPosicion(pos) {
  if (_tlPremiosOrdenados && _tlPremiosOrdenados[pos]) return _tlPremiosOrdenados[pos].emoji;
  const defaults = ['🔥','🦙','🥪','🧀','🥤','🍟','💀'];
  return defaults[pos] || '💀';
}

// ── Premios por par (solo 2 iguales en línea central) ──
const TL_PREMIOS_PAR = {
  '🦙': { nivel:'pequeño', label:'2x LLAMA ✨',    premio:'Salsa Besito de Ajo gratis', color:'#3DBFB8', pts:30, cupon:true,  cuponTipo:'item', cuponItem:'Salsa Besito de Ajo' },
  '🥪': { nivel:'pequeño', label:'2x SÁNGUCHE 🥪', premio:'Salsa Picante gratis',       color:'#2DC653', pts:20, cupon:true,  cuponTipo:'item', cuponItem:'Salsa Picante de la Casa' },
};

// ── Probabilidad controlada por tirada ──────────────
// En vez de depender 100% del pool, usamos un dado cargado al inicio de cada spin
// para garantizar las probabilidades del negocio independientemente del pool
function tlResultadoControlado(bias = 0) {
  const dado = Math.random() * 100;
  let umbral;
  if (bias > 0) {
    const factor = bias / 100;
    umbral = {
      jackpot:  _tlUmbralCustom.jackpot  * (1 - factor * 0.8),
      llama:    _tlUmbralCustom.llama    * (1 - factor * 0.6),
      sanguche: _tlUmbralCustom.sanguche * (1 - factor * 0.4),
      queso:    _tlUmbralCustom.queso    * (1 - factor * 0.2),
      bebida:   _tlUmbralCustom.bebida,
      papas:    _tlUmbralCustom.papas,
    };
  } else {
    umbral = { ..._tlUmbralCustom };
  }

  let acum = 0;
  if (dado < (acum += umbral.jackpot)) return _tlEmojiPorPosicion(0);
  if (dado < (acum += umbral.llama))   return _tlEmojiPorPosicion(1);
  if (dado < (acum += umbral.sanguche))return _tlEmojiPorPosicion(2);
  if (dado < (acum += umbral.queso))   return _tlEmojiPorPosicion(3);
  if (dado < (acum += umbral.bebida))  return _tlEmojiPorPosicion(4);
  if (dado < (acum += umbral.papas))   return _tlEmojiPorPosicion(5);
  return _tlEmojiPorPosicion(6); // sin premio
}

// ── Config Firebase (compatibilidad) ────────────────
const SLOTS_SIMBOLOS = TL_SIMBOLOS; // alias legacy
const SLOTS_POOL = TL_POOL;         // alias legacy
const SLOTS_COMBOS_DEFAULT = [];    // no usado en v3

// ── Estado del juego ──────────────────────────────────
const SLOTS_FICHAS_INIT = 3;
let slotsScore    = 0;
let slotsFichas   = 0;
let slotsSpinning = false;
let slotsHiScore  = 0;
let _slotsSpinsSesion  = 0;
let _slotsGanasSesion  = 0;
let _slotsFichasGanadas = 0;
let _tlGratisUsado = false;  // tirada gratis del día

// ── Rodillos: init visual ─────────────────────────────
function tlIniciarRodillos() {
  for(let i = 0; i < 3; i++) {
    const inner = document.getElementById('tlRodInner' + i);
    if (!inner) continue;
    // Mostrar un símbolo random inicial
    const s = TL_POOL[Math.floor(Math.random() * TL_POOL.length)];
    inner.innerHTML = `<div class="tl-sym"><span class="tl-sym-e">${s.e}</span><span class="tl-sym-lbl">${s.nombre}</span></div>`;
  }
}

function slotsActualizarUI() {
  const fEl   = document.getElementById('slotsFichas');
  const sEl   = document.getElementById('slotsScore');
  const hEl   = document.getElementById('slotsHi');
  const btn   = document.getElementById('btnGirarSlots');
  const sinF  = document.getElementById('slotsSinFichas');
  const nEl   = document.getElementById('slotsNombreDisplay');
  const nSF   = document.getElementById('slotsNombreSinFichas');
  const stats = document.getElementById('slotsSessionStats');
  const gratisVal = document.getElementById('tlGratisVal');
  const gratisBadge = document.getElementById('tlGratisBadge');
  const nombre = usuarioActual?.nombre || '';

  if (fEl)  fEl.textContent  = slotsFichas;
  if (sEl)  sEl.textContent  = slotsScore;
  if (hEl)  hEl.textContent  = slotsHiScore;
  if (nEl)  nEl.textContent  = nombre || 'INVITADO';
  if (nSF)  nSF.textContent  = nombre;

  const tieneGratis = tlTieneGratisHoy() && usuarioActual;
  if (gratisVal) gratisVal.textContent = tieneGratis ? '⚡' : '✓';
  if (gratisBadge) {
    gratisBadge.style.opacity = tieneGratis ? '1' : '.35';
    gratisBadge.title = tieneGratis ? 'Tirada gratis disponible' : 'Ya usaste tu tirada gratis hoy';
  }

  const sinFichas = slotsFichas <= 0 && !tieneGratis;
  if (sinF) sinF.style.display = (!usuarioActual || sinFichas) ? 'block' : 'none';
  if (btn) {
    const puedeGirar = usuarioActual && (slotsFichas > 0 || tieneGratis) && !slotsSpinning;
    btn.disabled = !puedeGirar;
    btn.classList.toggle('girando', slotsSpinning);
  }
  if (stats && _slotsSpinsSesion > 0) {
    const pct = Math.round(_slotsGanasSesion / _slotsSpinsSesion * 100);
    stats.textContent = `${_slotsSpinsSesion} giros · ${_slotsGanasSesion} premios (${pct}%)`;
  }
}

// ── Tirada gratis del día ─────────────────────────────
function tlTieneGratisHoy() {
  if (!usuarioActual) return false;
  const key = 'tl-gratis-' + usuarioActual.nombre;
  const guardado = localStorage.getItem(key);
  if (!guardado) return true;
  const fecha = new Date(parseInt(guardado));
  const hoy = new Date();
  return fecha.toDateString() !== hoy.toDateString();
}
function tlMarcarGratisUsado() {
  if (!usuarioActual) return;
  localStorage.setItem('tl-gratis-' + usuarioActual.nombre, Date.now().toString());
}
window.tlUsarGratis = function() {
  if (!tlTieneGratisHoy()) return;
  showToast('⚡ ¡Tirada gratis activada! Presioná GIRAR');
};

// ── Renderizar tabla de premios ───────────────────────
function tlRenderTabla() {
  const el = document.getElementById('slotsTablaPremiOS');
  if (!el) return;

  // Armar filas desde TL_PREMIOS (que se actualiza desde Firebase)
  // Excluir el "sin premio" (💀) de la tabla visible
  const emojisOrden = ['🔥','🦙','🥪','🧀','🥤','🍟'];
  const rows = emojisOrden.map(e => {
    const p = TL_PREMIOS[e];
    if (!p) return null;
    const desc = (p.cuponTipo === 'item' && p.cuponItem) ? `🎁 ${p.cuponItem}` : (p.premio || p.label);
    return { e: `${e}${e}${e}`, premio: desc, color: p.color || '#aaa' };
  }).filter(Boolean);

  el.innerHTML = `
    <div class="tl-tabla-row" style="border-bottom:1px solid #1a2a2a;padding-bottom:6px;margin-bottom:4px;">
      <span style="font-family:'Righteous',cursive;font-size:0.68rem;color:var(--naranja);">🏆 PREMIOS POSIBLES</span>
    </div>
    ${rows.map(r => `
      <div class="tl-tabla-row">
        <span style="color:${r.color};">${r.e} ${r.premio}</span>
      </div>`).join('')}
    <div style="margin-top:8px;padding-top:6px;border-top:1px solid #1a2a2a;font-size:0.58rem;color:#333;">
      ⚡ 1 tirada gratis por día · Pack: 50 fichas = $500 · Cupones válidos por 7 días · Solo 1 uso
    </div>`;
}

// ── Init ──────────────────────────────────────────────
window.slotsInit = function() {
  slotsFichas  = usuarioActual?.fichasSlots ?? SLOTS_FICHAS_INIT;
  slotsHiScore = usuarioActual?.recordSlots ?? 0;
  slotsScore = 0;
  _slotsSpinsSesion = _slotsGanasSesion = _slotsFichasGanadas = 0;

  tlIniciarRodillos();
  const msgEl = document.getElementById('slotsMensaje');
  if (msgEl) {
    msgEl.textContent = usuarioActual ? '🎰 ¡Girá para ganar!' : '🔐 Iniciá sesión para jugar';
    msgEl.style.color = usuarioActual ? '#666' : 'var(--naranja)';
  }
  document.getElementById('slotsPremioBanner').style.display = 'none';
  const cuponDisp = document.getElementById('tlCuponDisplay');
  if (cuponDisp) cuponDisp.style.display = 'none';
  tlRenderTabla();
  slotsActualizarUI();
};

// ── Animación rodillo ─────────────────────────────────
function tlAnimarRodillo(idxRod, simboloFinal, delay) {
  return new Promise(resolve => {
    setTimeout(() => {
      const inner = document.getElementById('tlRodInner' + idxRod);
      const rod   = document.getElementById('tlRod' + idxRod);
      if (!inner || !rod) { resolve(); return; }

      let frames = 0;
      const totalFrames = 14 + idxRod * 4; // rodillos giran distinto tiempo
      const intervalo = setInterval(() => {
        const s = TL_POOL[Math.floor(Math.random() * TL_POOL.length)];
        inner.innerHTML = `<div class="tl-sym"><span class="tl-sym-e">${s.e}</span><span class="tl-sym-lbl">${s.nombre}</span></div>`;
        frames++;
        if (frames >= totalFrames) {
          clearInterval(intervalo);
          // Efecto casi-ganar: 30% del tiempo mostrar el símbolo ganador 1 frame antes y luego cambiarlo
          if (simboloFinal !== '💀' && Math.random() < 0.3 && idxRod < 2) {
            inner.innerHTML = `<div class="tl-sym"><span class="tl-sym-e">${simboloFinal}</span></div>`;
            setTimeout(() => {
              const diff = TL_POOL.filter(s => s.e !== simboloFinal);
              const alt = diff[Math.floor(Math.random() * diff.length)];
              inner.innerHTML = `<div class="tl-sym"><span class="tl-sym-e">${alt.e}</span><span class="tl-sym-lbl">${alt.nombre}</span></div>`;
              resolve();
            }, 160);
          } else {
            inner.innerHTML = `<div class="tl-sym"><span class="tl-sym-e">${simboloFinal}</span><span class="tl-sym-lbl">${TL_SIMBOLOS.find(s=>s.e===simboloFinal)?.nombre||''}</span></div>`;
            resolve();
          }
        }
      }, 60);
    }, delay);
  });
}

// ── Confetti ─────────────────────────────────────────
function tlConfetti(cantidad = 60) {
  const cont = document.getElementById('tlConfetti');
  if (!cont) return;
  cont.innerHTML = '';
  const colores = ['#3DBFB8','#FFB800','#FF4D4D','#2DC653','#D4831A','#ffffff'];
  for (let i = 0; i < cantidad; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.cssText = `
      left:${Math.random()*100}%;
      top:${-10 - Math.random()*20}px;
      background:${colores[Math.floor(Math.random()*colores.length)]};
      border-radius:${Math.random()>.5?'50%':'2px'};
      width:${6+Math.random()*6}px;
      height:${6+Math.random()*6}px;
      animation-duration:${2+Math.random()*2}s;
      animation-delay:${Math.random()*.5}s;
    `;
    cont.appendChild(p);
  }
  setTimeout(() => { cont.innerHTML = ''; }, 4000);
}

// ── Generar cupón de premio ───────────────────────────
async function tlGenerarCupon(premio, origen) {
  // premio puede ser el objeto completo del premio o un pct legacy
  const esPct   = typeof premio === 'number';
  const tipo    = esPct ? 'pct' : (premio.cuponTipo || 'pct');
  const pct     = esPct ? premio : (premio.cuponPct || 0);
  const item    = esPct ? '' : (premio.cuponItem || '');
  const desc    = esPct ? premio : (tipo === 'item' ? item : pct);

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand  = Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  const prefijo = origen === 'jackpot' ? 'JACK'
    : tipo === 'item' ? 'GIFT'
    : (pct >= 50 ? 'LLAMA' : (pct >= 20 ? 'MORDE' : 'DESC'));
  const codigo = prefijo + '-' + rand;
  const expira = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 días

  try {
    const cuponesRef = doc(db, 'config', 'cupones');
    const cuponesSnap = await getDoc(cuponesRef);
    const lista = cuponesSnap.exists() ? (cuponesSnap.data().lista || []) : [];
    lista.push({
      id: Date.now(),
      codigo,
      tipo,          // 'pct' o 'item'
      pct:  tipo === 'pct' ? pct : 0,
      item: tipo === 'item' ? item : '',
      activo: true,
      usado: false,
      origen: 'slots-' + origen,
      usuario: usuarioActual?.nombre || 'anon',
      creadoEn: Date.now(),
      expira,
    });
    await setDoc(cuponesRef, { lista });
  } catch(e) { console.error('Error generando cupón slots:', e); }
  return codigo;
}

// ── Mostrar jackpot modal ─────────────────────────────
async function tlMostrarJackpot(codigo) {
  tlConfetti(100);
  const modal = document.getElementById('tlJackpotModal');
  const codEl = document.getElementById('tlJackpotCodigo');
  if (codEl) codEl.textContent = codigo;
  if (modal) modal.classList.add('show');
  // Vibrar si disponible
  try { navigator.vibrate && navigator.vibrate([200,100,200,100,400,200,400]); } catch(e){}
}
window.tlCerrarJackpot = function() {
  const modal = document.getElementById('tlJackpotModal');
  if (modal) modal.classList.remove('show');
};
window.tlCopiarJackpot = function() {
  const cod = document.getElementById('tlJackpotCodigo')?.textContent;
  if (cod) navigator.clipboard.writeText(cod).catch(()=>{});
  showToast('✅ Código jackpot copiado!');
};
window.tlCopiarCupon = function() {
  const cod = document.getElementById('tlCuponCodigo')?.textContent;
  if (cod) navigator.clipboard.writeText(cod).catch(()=>{});
  showToast('✅ Cupón copiado!');
};

// ── Girar ─────────────────────────────────────────────
window.slotsGirar = async function() {
  if (slotsSpinning || !usuarioActual) return;
  const usarGratis = slotsFichas <= 0 && tlTieneGratisHoy();
  if (slotsFichas <= 0 && !usarGratis) return;

  slotsSpinning = true;
  _slotsSpinsSesion++;

  // Descontar ficha o marcar gratis
  const ref = doc(db, 'clientes', usuarioActual.nombre);
  if (usarGratis) {
    tlMarcarGratisUsado();
  } else {
    slotsFichas--;
    usuarioActual.fichasSlots = slotsFichas;
    updateDoc(ref, { fichasSlots: slotsFichas }).catch(()=>{});
  }

  // Reset UI
  document.getElementById('slotsPremioBanner').style.display = 'none';
  const cuponDisp = document.getElementById('tlCuponDisplay');
  if (cuponDisp) cuponDisp.style.display = 'none';
  const msgEl = document.getElementById('slotsMensaje');
  if (msgEl) { msgEl.textContent = '🎰 Girando…'; msgEl.style.color = '#444'; }
  // Quitar glow de rodillos
  for(let i=0;i<3;i++) {
    const r = document.getElementById('tlRod'+i);
    if(r) { r.classList.remove('win-glow','jackpot-glow'); }
  }
  slotsActualizarUI();

  // ── Determinar resultado ──────────────────────────
  const bias = 0; // dificultad ya no se usa; las probabilidades se controlan desde tragallamaPremios
  const simBoton = tlResultadoControlado(bias);

  // Los 3 rodillos: para ganar deben salir los 3 iguales
  let r0, r1, r2;
  const esGanador = simBoton !== '💀';

  if (esGanador) {
    // Los 3 rodillos muestran el símbolo ganador
    r0 = r1 = r2 = simBoton;
  } else {
    // Sin premio: asegurarse que los 3 rodillos sean todos distintos entre sí
    r0 = TL_POOL[Math.floor(Math.random()*TL_POOL.length)].e;
    do { r1 = TL_POOL[Math.floor(Math.random()*TL_POOL.length)].e; } while(r1===r0);
    do { r2 = TL_POOL[Math.floor(Math.random()*TL_POOL.length)].e; } while(r2===r0 || r2===r1);
  }

  // ── Animar rodillos escalonado ──────────────────────
  await Promise.all([
    tlAnimarRodillo(0, r0, 0),
    tlAnimarRodillo(1, r1, 250),
    tlAnimarRodillo(2, r2, 500),
  ]);

  // ── Evaluar y mostrar resultado ──────────────────────
  try {
    if (esGanador) {
      const premio = TL_PREMIOS[simBoton];
      _slotsGanasSesion++;

      // Glow en rodillos
      const glowClass = premio.esJackpot ? 'jackpot-glow' : 'win-glow';
      for(let i=0;i<3;i++) {
        const r = document.getElementById('tlRod'+i);
        if(r) r.classList.add(glowClass);
      }

      // Vibración
      try { navigator.vibrate && navigator.vibrate(premio.esJackpot ? [300,100,300] : [150]); } catch(e) {}

      if (msgEl) {
        msgEl.textContent = premio.label;
        msgEl.style.color = premio.color;
      }

      // Puntos
      slotsScore += premio.pts;
      if (slotsScore > slotsHiScore) {
        slotsHiScore = slotsScore;
        updateDoc(ref, { recordSlots: slotsHiScore }).catch(()=>{});
      }

      // Banner
      const bannerEl = document.getElementById('slotsPremioBanner');
      const bannerTxt = document.getElementById('slotsPremioBannerTexto');
      if (bannerEl && bannerTxt) {
        bannerEl.className = 'tl-premio-banner tl-premio-' + premio.nivel;
        bannerTxt.innerHTML = `<span style="color:${premio.color};">${premio.label}</span><br><span style="font-size:0.72rem;color:#aaa;">${premio.premio}</span>`;
        bannerEl.style.display = 'block';
      }

      // Generar cupón si aplica
      if (premio.cupon && (premio.cuponPct > 0 || premio.cuponTipo === 'item')) {
        const origen = premio.esJackpot ? 'jackpot' : simBoton;
        const codigo = await tlGenerarCupon(premio, origen);
        const esItem = premio.cuponTipo === 'item';

        if (premio.esJackpot) {
          await tlMostrarJackpot(codigo);
          try {
            await setDoc(doc(db,'config','slotsJackpot'), {
              ganador: usuarioActual.nombre,
              codigo,
              timestamp: Date.now(),
              ultima: Date.now(),
            });
          } catch(e) {}
        } else {
          if (cuponDisp) {
            document.getElementById('tlCuponCodigo').textContent = codigo;
            // Mostrar descripción del cupón debajo del código
            let descEl = document.getElementById('tlCuponDesc');
            if (!descEl) {
              descEl = document.createElement('div');
              descEl.id = 'tlCuponDesc';
              descEl.style.cssText = 'font-size:0.72rem;color:#aaa;margin-top:4px;text-align:center;';
              document.getElementById('tlCuponCodigo').after(descEl);
            }
            descEl.textContent = esItem
              ? `🎁 ${premio.cuponItem || premio.premio} — presentá este código al retirar`
              : `💰 ${premio.cuponPct}% de descuento en tu próxima compra`;
            cuponDisp.style.display = 'block';
          }
          if (premio.nivel === 'grande') tlConfetti(50);
        }
      }

      // Registrar stats en Firebase
      const statsRef = doc(db,'config','slotsStats');
      getDoc(statsRef).then(snap => {
        const d = snap.exists() ? snap.data() : {};
        updateDoc(statsRef, {
          totalSpins:    (d.totalSpins||0)+1,
          totalGanados:  (d.totalGanados||0)+1,
          ptsOtorgados:  (d.ptsOtorgados||0)+premio.pts,
        }).catch(()=>setDoc(statsRef,{ totalSpins:1, totalGanados:1, fichasOtorgadas:0, ptsOtorgados:premio.pts }));
      });

    } else {
      // Sin premio
      if (msgEl) {
        const frases = ['💀 Sin suerte esta vez…','😅 ¡Casi!','🎲 La próxima es tuya','😤 ¡Otra vez!'];
        msgEl.textContent = slotsFichas > 0 || tlTieneGratisHoy() ? frases[Math.floor(Math.random()*frases.length)] : '😢 Sin fichas';
        msgEl.style.color = '#444';
      }
      const statsRef = doc(db,'config','slotsStats');
      getDoc(statsRef).then(snap => {
        const d = snap.exists() ? snap.data() : {};
        updateDoc(statsRef, { totalSpins: (d.totalSpins||0)+1 })
          .catch(()=>setDoc(statsRef,{ totalSpins:1, totalGanados:0, fichasOtorgadas:0, ptsOtorgados:0 }));
      });
    }
  } catch(err) {
    console.error('slots error:', err);
  } finally {
    slotsSpinning = false;
    slotsActualizarUI();
  }
};

// Llamar cuando cambia el récord en cualquier juego
window.notificarRecordJuego = function(juego, nuevoRecord) {
  if (juego === juegoActualRecompensa) {
    actualizarBarraRecompensa();
  }
};

async function generarCuponRecompensa(cfg, juego) {
  recompensaYaGanada[juego] = true;
  const prefijos = { tetris: 'TETRIS', snake: 'SNAKE', '2048': 'DOS4K', dino: 'LLAMA' };
  const prefijo = prefijos[juego] || 'GAME';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  const codigo = prefijo + '-' + rand;

  try {
    const snap = await getDoc(doc(db,'config','cupones'));
    const lista = snap.exists() ? (snap.data().lista || []) : [];
    lista.push({
      id: Date.now(),
      codigo,
      pct: cfg.pct,
      activo: true,
      usado: false,
      origen: 'juego-' + juego,
      creadoEn: Date.now()
    });
    await setDoc(doc(db,'config','cupones'), { lista });

    localStorage.setItem('mordelon-recompensa-cupon-' + juego, codigo);
    localStorage.removeItem('mordelon-recompensa-usado-' + juego);

    mostrarBannerRecompensa(codigo, cfg.pct);
  } catch(e) {
    console.error('Error generando cupón recompensa:', e);
  }
}

function mostrarBannerRecompensa(codigo, pct) {
  const banner = document.getElementById('recompensaBanner');
  const codigoEl = document.getElementById('recompensaCodigo');
  const descEl = document.getElementById('recompensaBannerDesc');
  if (!banner) return;
  if (codigoEl) codigoEl.textContent = codigo;
  if (descEl) descEl.textContent = `¡Superaste el puntaje! Usá este código y obtenés ${pct}% de descuento:`;
  banner.style.display = 'block';
}

window.copiarCodigoRecompensa = function() {
  const codigo = document.getElementById('recompensaCodigo').textContent;
  navigator.clipboard.writeText(codigo).then(() => {
    const el = document.getElementById('recompensaCodigo');
    const orig = el.textContent;
    el.textContent = '✅ Copiado!';
    setTimeout(() => { el.textContent = orig; }, 1500);
  }).catch(() => {});
};

// Cuando se usa un cupón de recompensa, limpiar el local storage
onSnapshot(doc(db,'config','cupones'), (snap) => {
  const lista = snap.exists() ? (snap.data().lista || []) : [];
  ['tetris','snake','2048','dino'].forEach(juego => {
    const lsKey = 'mordelon-recompensa-cupon-' + juego;
    const lsUsadoKey = 'mordelon-recompensa-usado-' + juego;
    const codigoGuardado = localStorage.getItem(lsKey);
    if (!codigoGuardado) return;
    const cupon = lista.find(c => c.codigo === codigoGuardado);
    if (cupon && cupon.usado) {
      localStorage.setItem(lsUsadoKey, '1');
      localStorage.removeItem(lsKey);
      if (juego === juegoActualRecompensa) {
        const banner = document.getElementById('recompensaBanner');
        if (banner) banner.style.display = 'none';
      }
      recompensaYaGanada[juego] = false;
    }
  });
  // Compatibilidad con cupones legacy (clave sin sufijo de juego)
  const legacyCupon = localStorage.getItem('mordelon-recompensa-cupon');
  if (legacyCupon) {
    const cupon = lista.find(c => c.codigo === legacyCupon);
    if (cupon && cupon.usado) {
      localStorage.setItem('mordelon-recompensa-usado', '1');
      localStorage.removeItem('mordelon-recompensa-cupon');
    }
  }
});

// ===================== BUSCAMINAS =====================
const MINAS_DIFS = {
  facil:   { cols: 8,  rows: 8,  minas: 10 },
  medio:   { cols: 10, rows: 10, minas: 20 },
  dificil: { cols: 12, rows: 12, minas: 35 }
};
let mDif = 'facil';
let mBoard = [], mRevealed = [], mFlagged = [], mMinas = [];
let mCols, mRows, mTotalMinas;
let mGameOver = false, mWon = false, mStarted = false;
let mScore = 0;
let mTimerVal = 0, mTimerInterval = null;
let mHiC = {};
try { mHiC = JSON.parse(localStorage.getItem('minasHiC') || '{}'); } catch(e) { mHiC = {}; }

function minasInit() {
  const cfg = MINAS_DIFS[mDif];
  mCols = cfg.cols; mRows = cfg.rows; mTotalMinas = cfg.minas;
  mBoard    = Array.from({length: mRows}, () => Array(mCols).fill(0));
  mRevealed = Array.from({length: mRows}, () => Array(mCols).fill(false));
  mFlagged  = Array.from({length: mRows}, () => Array(mCols).fill(false));
  mMinas    = [];
  mGameOver = false; mWon = false; mStarted = false; mScore = 0;
  clearInterval(mTimerInterval); mTimerVal = 0;
  document.getElementById('minasTimer').textContent = '0s';
  document.getElementById('minasRestantes').textContent = mTotalMinas;
  const scoreEl = document.getElementById('minasScore');
  if (scoreEl) scoreEl.textContent = '0';
  actualizarHiMinas();
  minasRender();
}

function minasColocarMinas(firstR, firstC) {
  // Coloca minas evitando la primera celda y sus vecinas
  const safe = new Set();
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const r = firstR+dr, c = firstC+dc;
    if (r>=0&&r<mRows&&c>=0&&c<mCols) safe.add(r*mCols+c);
  }
  let placed = 0;
  while (placed < mTotalMinas) {
    const idx = Math.floor(Math.random() * mRows * mCols);
    const r = Math.floor(idx/mCols), c = idx%mCols;
    if (!safe.has(idx) && mBoard[r][c] !== -1) {
      mBoard[r][c] = -1; mMinas.push([r,c]); placed++;
    }
  }
  // Calcular números
  for (let r = 0; r < mRows; r++) for (let c = 0; c < mCols; c++) {
    if (mBoard[r][c] === -1) continue;
    let cnt = 0;
    for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
      const nr=r+dr, nc=c+dc;
      if (nr>=0&&nr<mRows&&nc>=0&&nc<mCols&&mBoard[nr][nc]===-1) cnt++;
    }
    mBoard[r][c] = cnt;
  }
}

function minasDescubrir(r, c) {
  if (mGameOver || mWon) return;
  if (mFlagged[r][c] || mRevealed[r][c]) return;

  // Primer click: colocar minas y arrancar timer
  if (!mStarted) {
    mStarted = true;
    minasColocarMinas(r, c);
    mTimerInterval = setInterval(() => {
      mTimerVal++;
      const el = document.getElementById('minasTimer');
      if (el) el.textContent = mTimerVal + 's';
    }, 1000);
  }

  if (mBoard[r][c] === -1) {
    // BOOM
    mGameOver = true;
    clearInterval(mTimerInterval);
    mRevealed[r][c] = true;
    minasRender(r, c);
    // Revelar todas las minas con animación
    setTimeout(() => {
      mMinas.forEach(([mr, mc]) => { mRevealed[mr][mc] = true; });
      minasRender(r, c);
    }, 100);
    return;
  }

  // BFS flood fill para celdas vacías
  const queue = [[r, c]];
  while (queue.length) {
    const [cr, cc] = queue.shift();
    if (cr<0||cr>=mRows||cc<0||cc>=mCols) continue;
    if (mRevealed[cr][cc] || mFlagged[cr][cc]) continue;
    mRevealed[cr][cc] = true;
    if (mBoard[cr][cc] === 0) {
      for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
        if (dr===0&&dc===0) continue;
        queue.push([cr+dr, cc+dc]);
      }
    }
  }

  // Sumar puntos por celdas reveladas
  const ptsAntes = mRevealed.flat().filter(Boolean).length;
  // Verificar victoria
  let sin_revelar = 0;
  for (let rr=0;rr<mRows;rr++) for (let cc=0;cc<mCols;cc++)
    if (!mRevealed[rr][cc] && mBoard[rr][cc]!==-1) sin_revelar++;

  // Calcular nuevas celdas reveladas y sumar puntos
  const ptsDespues = mRevealed.flat().filter(Boolean).length;
  const factor = {facil:1, medio:2, dificil:4}[mDif] || 1;
  mScore += (ptsDespues - ptsAntes) * 10 * factor;
  const scoreEl = document.getElementById('minasScore');
  if (scoreEl) scoreEl.textContent = mScore;

  if (sin_revelar === 0) {
    mWon = true;
    clearInterval(mTimerInterval);
    // Bonus por tiempo rápido
    const tiempoBonus = Math.max(0, 500 - mTimerVal * 2) * factor;
    const puntajeFinal = mScore + Math.round(tiempoBonus);
    mScore = puntajeFinal;
    if (scoreEl) scoreEl.textContent = mScore;
    // Guardar récord de puntaje
    const hiActual = parseInt(localStorage.getItem('minasHiC_score') || '0');
    if (puntajeFinal > hiActual) {
      localStorage.setItem('minasHiC_score', puntajeFinal);
      if (typeof window.notificarRecordJuego === 'function') window.notificarRecordJuego('minas', puntajeFinal);
    }
    // Guardar también récord de tiempo
    const prevTiempo = mHiC[mDif];
    if (!prevTiempo || mTimerVal < prevTiempo) {
      mHiC[mDif] = mTimerVal;
      localStorage.setItem('minasHiC', JSON.stringify(mHiC));
    }
    actualizarHiMinas();
  }
  minasRender(null, null);
}

function actualizarHiMinas() {
  const el = document.getElementById('minasHi');
  if (!el) return;
  const recScore = parseInt(localStorage.getItem('minasHiC_score') || '0');
  el.textContent = recScore > 0 ? recScore + ' pts' : '—';
}

function minasToggleFlag(r, c) {
  if (mGameOver || mWon || mRevealed[r][c]) return;
  mFlagged[r][c] = !mFlagged[r][c];
  const flagCount = mFlagged.flat().filter(Boolean).length;
  const el = document.getElementById('minasRestantes');
  if (el) el.textContent = mTotalMinas - flagCount;
  minasRender(null, null);
}

const MINAS_COLORES = ['','#3DBFB8','#2DC653','#FF4D4D','#7C3AED','#D4831A','#06B6D4','#111','#888'];

function minasRender(boomR, boomC) {
  const tablero = document.getElementById('minasTablero');
  if (!tablero) return;

  // Tamaño de celda según dificultad
  const cellSize = mCols <= 8 ? 34 : mCols <= 10 ? 28 : 24;
  const fontSize = cellSize <= 24 ? '0.7rem' : cellSize <= 28 ? '0.8rem' : '0.9rem';

  tablero.innerHTML = '';
  for (let r = 0; r < mRows; r++) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:2px;';
    for (let c = 0; c < mCols; c++) {
      const cell = document.createElement('div');
      cell.style.cssText = `width:${cellSize}px;height:${cellSize}px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:${fontSize};cursor:pointer;transition:all .1s;flex-shrink:0;`;

      const isBoom = (r===boomR && c===boomC);
      const isRevealed = mRevealed[r][c];
      const isFlagged = mFlagged[r][c];
      const val = mBoard[r][c];

      if (!isRevealed) {
        // Celda oculta
        cell.style.background = isFlagged ? 'rgba(212,131,26,.3)' : 'var(--gris-light)';
        cell.style.border = isFlagged ? '1.5px solid var(--naranja)' : '1.5px solid #444';
        cell.textContent = isFlagged ? '🚩' : '';
        // Touch: tap = descubrir, longpress = bandera
        let pressTimer = null;
        cell.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          pressTimer = setTimeout(() => {
            pressTimer = null;
            minasToggleFlag(r, c);
          }, 400);
        }, {passive:false});
        cell.addEventListener('pointerup', (e) => {
          if (pressTimer !== null) {
            clearTimeout(pressTimer);
            pressTimer = null;
            minasDescubrir(r, c);
          }
        });
        cell.addEventListener('pointercancel', () => { if(pressTimer) clearTimeout(pressTimer); });
        cell.addEventListener('contextmenu', (e) => { e.preventDefault(); minasToggleFlag(r, c); });
      } else if (val === -1) {
        // Mina
        cell.style.background = isBoom ? 'rgba(255,77,77,.4)' : 'rgba(255,77,77,.15)';
        cell.style.border = '1.5px solid var(--rojo)';
        cell.textContent = isBoom ? '💥' : '💣';
      } else {
        // Número o vacío
        cell.style.background = 'var(--gris-mid)';
        cell.style.border = '1.5px solid #222';
        if (val > 0) {
          cell.textContent = val;
          cell.style.color = MINAS_COLORES[val] || '#fff';
        }
      }
      row.appendChild(cell);
    }
    tablero.appendChild(row);
  }

  // Mensaje de estado
  let msgEl = document.getElementById('minasMsg');
  if (!msgEl) {
    msgEl = document.createElement('div');
    msgEl.id = 'minasMsg';
    msgEl.style.cssText = 'text-align:center;margin-top:10px;font-family:Righteous,cursive;font-size:0.9rem;letter-spacing:1px;min-height:24px;';
    tablero.parentElement.insertBefore(msgEl, tablero.nextSibling);
  }
  if (mWon) {
    msgEl.innerHTML = `<span style="color:var(--turquesa)">🎉 ¡GANASTE en ${mTimerVal}s!</span>`;
  } else if (mGameOver) {
    msgEl.innerHTML = `<span style="color:var(--rojo)">💥 ¡BOOM! Tap ↺ para reintentar</span>`;
  } else {
    msgEl.textContent = '';
  }
}

window.minasDificultad = function(d) {
  mDif = d;
  ['facil','medio','dificil'].forEach(k => {
    const btn = document.getElementById('minasBtnFacil'.replace('facil', '') + 'Btn' + k.charAt(0).toUpperCase() + k.slice(1));
    // Fallback naming
  });
  document.getElementById('minasBtnFacil').style.background = d==='facil' ? 'rgba(45,198,83,.2)' : 'var(--gris-mid)';
  document.getElementById('minasBtnFacil').style.borderColor = d==='facil' ? 'var(--verde)' : 'var(--gris-light)';
  document.getElementById('minasBtnFacil').style.color = d==='facil' ? 'var(--verde)' : '#888';
  document.getElementById('minasBtnMedio').style.background = d==='medio' ? 'rgba(212,131,26,.2)' : 'var(--gris-mid)';
  document.getElementById('minasBtnMedio').style.borderColor = d==='medio' ? 'var(--naranja)' : 'var(--gris-light)';
  document.getElementById('minasBtnMedio').style.color = d==='medio' ? 'var(--naranja)' : '#888';
  document.getElementById('minasBtnDificil').style.background = d==='dificil' ? 'rgba(255,77,77,.2)' : 'var(--gris-mid)';
  document.getElementById('minasBtnDificil').style.borderColor = d==='dificil' ? 'var(--rojo)' : 'var(--gris-light)';
  document.getElementById('minasBtnDificil').style.color = d==='dificil' ? 'var(--rojo)' : '#888';
  minasInit();
};

window.minasInit      = minasInit;
window.minasReset     = function() { minasInit(); };





// ═══════════════════════════════════════════════════════
//  SISTEMA DE SORTEOS — MORDELÓN CLIENTE v3
// ═══════════════════════════════════════════════════════

let _sorteoData       = null;
let _seleccionActual  = new Set();   // números elegidos en esta sesión (aún no reservados)
let _misNumeros       = { reservados: [], confirmados: [] };
let _cupoCliente      = 0;           // cuántos boletos tiene disponibles para elegir

// ── Listener en tiempo real ──────────────────────────
onSnapshot(doc(db, 'sorteos', 'actual'), (snap) => {
  _sorteoData = snap.exists() ? snap.data() : null;
  _renderSorteoCliente();
});

function _renderSorteoCliente() {
  const s = _sorteoData;
  const btnWrap = document.getElementById('sorteosBtnWrap');
  if (btnWrap) btnWrap.style.display = (s && s.activo !== false) ? 'block' : 'none';

  const contenido    = document.getElementById('sorteoClienteContenido');
  const grillaWrap   = document.getElementById('sorteoGrillaClienteWrap');
  const boletosCard  = document.getElementById('sorteoBoletosMiosCard');
  const histCard     = document.getElementById('sorteoHistorialCard');
  if (!contenido) return;

  if (!s || s.activo === false) {
    // Verificar si el vendedor quiere ocultar este mensaje
    getDoc(doc(db, 'config', 'sorteoUI')).then(snap => {
      const ocultar = snap.exists() && snap.data().ocultarSinSorteo;
      const zonaSorteos = document.getElementById('zonaSorteos');
      const btnWrap = document.getElementById('sorteosBtnWrap');
      if (ocultar) {
        if (zonaSorteos) zonaSorteos.style.display = 'none';
        if (btnWrap) btnWrap.style.display = 'none';
      } else {
        contenido.innerHTML = '<div style="color:#555;text-align:center;padding:16px 0;font-size:0.82rem;">' +
          (s && s.activo === false ? '⏸️ Sorteo pausado temporalmente' : 'Sin sorteo activo por el momento') + '</div>';
      }
    }).catch(() => {
      contenido.innerHTML = '<div style="color:#555;text-align:center;padding:16px 0;font-size:0.82rem;">Sin sorteo activo por el momento</div>';
    });
    if (grillaWrap) grillaWrap.style.display = 'none';
    if (boletosCard) boletosCard.style.display = 'none';
    if (histCard) histCard.style.display = 'none';
    return;
  }

  const numeros    = s.numeros || {};
  const cupo       = s.cupo || 100;
  const confirmados = Object.values(numeros).filter(n=>n.estado==='confirmado').length;
  const disponibles = cupo - Object.keys(numeros).length;
  const cupoMax     = s.cupo || 0;

  // Info del sorteo
  const fechaStr = s.fecha ? new Date(s.fecha+'T12:00').toLocaleDateString('es-AR',{day:'2-digit',month:'long',year:'numeric'}) : null;
  contenido.innerHTML = `
    <div style="text-align:center;margin-bottom:14px;">
      <div style="font-size:2.2rem;margin-bottom:4px;">${s.emoji||'🎟️'}</div>
      <div style="font-family:'Righteous',cursive;font-size:1rem;color:var(--blanco);">${s.nombre}</div>
      ${s.descripcion ? `<div style="font-size:0.72rem;color:#888;margin-top:3px;">${s.descripcion}</div>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:rgba(255,140,0,.1);border:1px solid rgba(255,140,0,.3);border-radius:10px;padding:8px;text-align:center;">
        <div style="font-size:0.55rem;color:#888;text-transform:uppercase;margin-bottom:3px;">Precio</div>
        <div style="font-family:'Righteous',cursive;font-size:0.88rem;color:var(--naranja);">$${(s.precio||0).toLocaleString('es-AR')}</div>
      </div>
      <div style="background:rgba(61,191,184,.1);border:1px solid rgba(61,191,184,.3);border-radius:10px;padding:8px;text-align:center;">
        <div style="font-size:0.55rem;color:#888;text-transform:uppercase;margin-bottom:3px;">Disponibles</div>
        <div style="font-family:'Righteous',cursive;font-size:0.88rem;color:${disponibles<=0?'var(--rojo)':'var(--turquesa)'};">${disponibles<=0?'¡LLENO!':disponibles}</div>
      </div>
      <div style="background:rgba(0,200,100,.1);border:1px solid rgba(0,200,100,.3);border-radius:10px;padding:8px;text-align:center;">
        <div style="font-size:0.55rem;color:#888;text-transform:uppercase;margin-bottom:3px;">Total</div>
        <div style="font-family:'Righteous',cursive;font-size:0.88rem;color:var(--verde);">${cupo}</div>
      </div>
    </div>
    ${cupoMax ? `<div style="margin-bottom:10px;">
      <div style="background:#222;border-radius:6px;height:5px;overflow:hidden;margin-bottom:3px;">
        <div style="height:100%;width:${Math.min(100,Math.round(Object.keys(numeros).length/cupoMax*100))}%;background:${disponibles<=0?'var(--rojo)':disponibles<10?'var(--naranja)':'var(--verde)'};border-radius:6px;transition:width 1s;"></div>
      </div>
      <div style="font-size:0.62rem;color:#555;text-align:center;">${disponibles<=0?'¡Sorteo completo!':disponibles+' números disponibles de '+cupoMax}</div>
    </div>` : ''}
    ${fechaStr ? `<div style="text-align:center;font-size:0.72rem;color:#666;margin-bottom:10px;">📅 Sorteo: ${fechaStr}</div>` : ''}
    <div style="background:#0a0a00;border:1px dashed rgba(255,140,0,.4);border-radius:10px;padding:10px;text-align:center;font-size:0.7rem;color:#888;">
      🔢 Elegí tus números en la grilla de abajo · Pagás en tu próximo pedido
    </div>`;

  // Grilla
  if (grillaWrap) grillaWrap.style.display = 'block';
  _renderGrillaCliente(numeros, cupo);

  // Mis números
  if (usuarioActual?.nombre) {
    const misRes  = Object.entries(numeros).filter(([,d])=>d.cliente===usuarioActual.nombre && d.estado==='reservado').map(([n])=>parseInt(n));
    const misConf = Object.entries(numeros).filter(([,d])=>d.cliente===usuarioActual.nombre && d.estado==='confirmado').map(([n])=>parseInt(n));
    _misNumeros = { reservados: misRes, confirmados: misConf };

    if (misRes.length || misConf.length) {
      boletosCard.style.display = 'block';
      const totalMios = misRes.length + misConf.length;
      const totalConf = Object.values(numeros).filter(n=>n.estado==='confirmado').length;
      const pct = totalConf > 0 ? Math.round((misConf.length / (s.cupo||100)) * 100) : 0;
      document.getElementById('sorteoBoletosMiosInfo').innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <div>
            <div style="font-family:'Righteous',cursive;font-size:1.4rem;color:var(--naranja);">${totalMios}</div>
            <div style="font-size:0.65rem;color:#666;">número${totalMios!==1?'s':''} total</div>
          </div>
          ${pct>0?`<div style="text-align:right;">
            <div style="font-family:'Righteous',cursive;font-size:1rem;color:var(--verde);">${pct}%</div>
            <div style="font-size:0.65rem;color:#666;">de chances</div>
          </div>`:''}
        </div>
        ${misConf.length ? `<div style="margin-bottom:6px;">
          <div style="font-size:0.62rem;color:var(--verde);margin-bottom:2px;">✅ Confirmados: N° ${misConf.sort((a,b)=>a-b).join(', ')}</div>
          ${pct>0?`<div style="background:#222;border-radius:4px;height:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:var(--verde);border-radius:4px;"></div>
          </div>`:''}
        </div>` : ''}
        ${misRes.length ? `<div style="font-size:0.62rem;color:var(--naranja);">⏳ Pendientes de pago: N° ${misRes.sort((a,b)=>a-b).join(', ')}</div>` : ''}`;
    } else {
      boletosCard.style.display = 'none';
    }
  } else {
    boletosCard.style.display = 'none';
  }

  // Último ganador
  if (s.ultimoGanador) {
    histCard.style.display = 'block';
    document.getElementById('sorteoUltimoGanadorCliente').textContent = '🏆 ' + s.ultimoGanador;
  } else {
    histCard.style.display = 'none';
  }
}

function _renderGrillaCliente(numeros, cupo) {
  const el = document.getElementById('sorteoGrillaCliente');
  const leyenda = document.getElementById('sorteoGrillaLeyenda');
  if (!el) return;

  // Leyenda
  if (leyenda) leyenda.innerHTML = `
    <span><span style="display:inline-block;width:9px;height:9px;background:#111;border:1px solid #444;border-radius:2px;margin-right:3px;"></span>Libre</span>
    <span><span style="display:inline-block;width:9px;height:9px;background:#1a0a00;border:1px solid var(--naranja);border-radius:2px;margin-right:3px;"></span>Reservado</span>
    <span><span style="display:inline-block;width:9px;height:9px;background:#003a10;border:1px solid var(--verde);border-radius:2px;margin-right:3px;"></span>Confirmado</span>
    <span><span style="display:inline-block;width:9px;height:9px;background:#1a1a00;border:1px solid var(--turquesa);border-radius:2px;margin-right:3px;"></span>Tuyo</span>`;

  el.innerHTML = '';
  for (let i = 1; i <= cupo; i++) {
    const info   = numeros[String(i)];
    const esMio  = info && usuarioActual?.nombre && info.cliente === usuarioActual.nombre;
    const enSel  = _seleccionActual.has(i);
    const libre  = !info;

    let bg, border, color, cursor = 'pointer', title = 'N° ' + i;
    if (enSel) {
      bg = '#1a1a00'; border = 'var(--turquesa)'; color = 'var(--turquesa)';
      title = 'N°' + i + ' — Seleccionado (click para quitar)';
    } else if (!info) {
      bg = '#111'; border = '#333'; color = '#555';
      title = 'N°' + i + ' — Libre';
    } else if (esMio && info.estado === 'reservado') {
      bg = '#1a0a00'; border = 'var(--naranja)'; color = 'var(--naranja)';
      title = 'N°' + i + ' — Tuyo (pendiente de pago)'; cursor = 'default';
    } else if (esMio && info.estado === 'confirmado') {
      bg = '#003a10'; border = 'var(--verde)'; color = 'var(--verde)';
      title = 'N°' + i + ' — Tuyo ✅'; cursor = 'default';
    } else if (info.estado === 'reservado') {
      bg = '#1a0800'; border = '#553300'; color = '#553300';
      title = 'N°' + i + ' — Reservado'; cursor = 'not-allowed';
    } else {
      bg = '#001a08'; border = '#005020'; color = '#005020';
      title = 'N°' + i + ' — Confirmado'; cursor = 'not-allowed';
    }

    const div = document.createElement('div');
    div.style.cssText = `aspect-ratio:1;display:flex;align-items:center;justify-content:center;
      border-radius:5px;font-size:0.62rem;font-family:'Righteous',cursive;
      border:1.5px solid ${border};background:${bg};color:${color};
      cursor:${cursor};transition:all .15s;user-select:none;`;
    div.textContent = i;
    div.title = title;

    if (libre || enSel) {
      div.addEventListener('click', () => _toggleNumero(i));
      div.addEventListener('mouseover', () => { if (libre || enSel) div.style.transform='scale(1.15)'; });
      div.addEventListener('mouseout',  () => { div.style.transform='scale(1)'; });
    }
    el.appendChild(div);
  }
  _actualizarInfoSeleccion();
}

function _toggleNumero(n) {
  if (!usuarioActual?.nombre) {
    const msgEl = document.getElementById('sorteoSeleccionMsg');
    if (msgEl) { msgEl.style.color='var(--rojo)'; msgEl.textContent='⚠️ Tenés que estar logueado para elegir números'; }
    return;
  }
  if (!_sorteoData || _sorteoData.activo === false) return;

  // Verificar que el número sigue libre en tiempo real
  const numeros = _sorteoData.numeros || {};
  if (numeros[String(n)] && !_seleccionActual.has(n)) return;

  if (_seleccionActual.has(n)) {
    _seleccionActual.delete(n);
  } else {
    _seleccionActual.add(n);
  }
  _renderGrillaCliente(numeros, _sorteoData.cupo||100);
}

function _actualizarInfoSeleccion() {
  const infoEl = document.getElementById('sorteoSeleccionInfo');
  const btnEl  = document.getElementById('btnConfirmarSeleccion');
  const msgEl  = document.getElementById('sorteoSeleccionMsg');
  if (!infoEl || !btnEl) return;

  const cant = _seleccionActual.size;
  if (cant === 0) {
    infoEl.style.display = 'none';
    btnEl.style.display  = 'none';
    if (msgEl) msgEl.textContent = '';
    return;
  }

  const precio = _sorteoData?.precio || 0;
  const total  = cant * precio;
  const nums   = [..._seleccionActual].sort((a,b)=>a-b);
  infoEl.style.display = 'block';
  infoEl.innerHTML = `
    <span style="color:var(--turquesa);">✔ Seleccionados: N° ${nums.join(', ')}</span>
    ${precio ? `<span style="color:var(--verde);margin-left:10px;">Total: $${total.toLocaleString('es-AR')}</span>` : ''}`;
  btnEl.style.display = 'block';
  btnEl.textContent = `🎟️ RESERVAR ${cant} NÚMERO${cant!==1?'S':''} — $${total.toLocaleString('es-AR')}`;
}

// ── Confirmar selección (reservar) ────────────────────
window.confirmarSeleccionCliente = async function() {
  const msgEl = document.getElementById('sorteoSeleccionMsg');
  if (!usuarioActual?.nombre) { msgEl.style.color='var(--rojo)'; msgEl.textContent='⚠️ Tenés que estar logueado'; return; }
  if (!_sorteoData || !_seleccionActual.size) return;
  if (_sorteoData.activo === false) { msgEl.style.color='var(--rojo)'; msgEl.textContent='⚠️ El sorteo está pausado'; return; }

  const cliente  = usuarioActual.nombre;
  const numerosDB = { ...(_sorteoData.numeros || {}) };
  const ahora    = Date.now();
  const conflictos = [];

  for (const n of _seleccionActual) {
    const key = String(n);
    if (numerosDB[key]) {
      // Verificar prioridad por timestamp
      if (numerosDB[key].ts <= ahora - 500) { // ya fue tomado antes
        conflictos.push(n);
      }
    }
  }

  if (conflictos.length) {
    msgEl.style.color = 'var(--rojo)';
    msgEl.textContent = '⚠️ Los números ' + conflictos.join(', ') + ' ya fueron tomados. Elegí otros.';
    _seleccionActual.clear();
    _renderGrillaCliente(numerosDB, _sorteoData.cupo||100);
    return;
  }

  // Reservar todos los números seleccionados
  for (const n of _seleccionActual) {
    numerosDB[String(n)] = { cliente, estado: 'reservado', ts: ahora };
  }

  try {
    await updateDoc(doc(db, 'sorteos', 'actual'), { numeros: numerosDB });
    const cant = _seleccionActual.size;
    msgEl.style.color = 'var(--verde)';
    msgEl.textContent = '✅ Reservaste ' + cant + ' número' + (cant!==1?'s':'') + '! Comunicate por WhatsApp para proceder al pago.';
    _seleccionActual.clear();
    setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 10000);
  } catch(e) {
    msgEl.style.color = 'var(--rojo)';
    msgEl.textContent = '❌ Error al reservar, intentá de nuevo';
  }
};

// Mostrar/ocultar zona sorteos
window.toggleZonaSorteos = function() {
  const z = document.getElementById('zonaSorteos');
  if (!z) return;
  const visible = z.style.display !== 'none';
  z.style.display = visible ? 'none' : 'block';
  if (!visible) _seleccionActual.clear();
};

