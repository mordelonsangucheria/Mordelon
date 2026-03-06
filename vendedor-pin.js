// PIN LOCK
// SISTEMA MULTI-USUARIO
let usuariosData = [{ nombre: 'Admin', pin: '2198' }];
let usuarioActual = null;
let pinIngresado = '';

// Verificar si ya está autenticado en esta sesión
// Sesión con expiración de 8 horas
function chequearSesion() {
  try {
    const raw = localStorage.getItem('mordelon-sesion');
    if (!raw) return;
    const sesion = JSON.parse(raw);
    const ahora = Date.now();
    const OCHO_HORAS = 8 * 60 * 60 * 1000;
    if (sesion.nombre && (ahora - sesion.timestamp) < OCHO_HORAS) {
      usuarioActual = sesion.nombre;
      document.getElementById('pinOverlay').classList.add('hidden');
    } else {
      localStorage.removeItem('mordelon-sesion');
    }
  } catch(e) { localStorage.removeItem('mordelon-sesion'); }
}
chequearSesion();

function pinPress(num) {
  if (pinIngresado.length >= 4) return;
  pinIngresado += num;
  actualizarDots();
  if (pinIngresado.length === 4) verificarPin();
}

function pinBorrar() {
  pinIngresado = pinIngresado.slice(0, -1);
  actualizarDots();
  document.getElementById('pinError').textContent = '';
}

function actualizarDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('dot' + i);
    dot.classList.toggle('filled', i < pinIngresado.length);
    dot.classList.remove('error');
  }
}

function verificarPin() {
  const user = usuariosData.find(u => u.pin === pinIngresado);
  if (user) {
    usuarioActual = user.nombre;
    localStorage.setItem('mordelon-sesion', JSON.stringify({ nombre: user.nombre, timestamp: Date.now() }));
    document.getElementById('pinOverlay').classList.add('hidden');
    setTimeout(() => { if(typeof window.registrarActividad==='function') window.registrarActividad('🔑 Ingresó al panel'); }, 100);
  } else {
    for (let i = 0; i < 4; i++) document.getElementById('dot' + i).classList.add('error');
    document.getElementById('pinError').textContent = 'PIN incorrecto, intentá de nuevo';
    setTimeout(() => {
      pinIngresado = '';
      actualizarDots();
      document.getElementById('pinError').textContent = '';
    }, 1000);
  }
}

