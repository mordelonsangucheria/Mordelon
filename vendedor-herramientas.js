// ===== CRONÓMETRO =====
let cronoInterval = null;
let cronoSegundos = 0;
let cronoActivo = false;
let vueltas = [];

function cronoFormatear(seg) {
  const m = Math.floor(seg / 60).toString().padStart(2,'0');
  const s = (seg % 60).toString().padStart(2,'0');
  return m + ':' + s;
}

window.cronoIniciar = function() {
  if (cronoActivo) return;
  cronoActivo = true;
  cronoInterval = setInterval(() => {
    cronoSegundos++;
    document.getElementById('cronoDisplay').textContent = cronoFormatear(cronoSegundos);
  }, 1000);
  document.getElementById('cronoBtnIniciar').textContent = '▶ Corriendo';
  document.getElementById('cronoBtnIniciar').disabled = true;
};

window.cronoPausar = function() {
  if (!cronoActivo) return;
  clearInterval(cronoInterval);
  cronoActivo = false;
  document.getElementById('cronoBtnIniciar').textContent = '▶ Continuar';
  document.getElementById('cronoBtnIniciar').disabled = false;
};

window.cronoReset = function() {
  clearInterval(cronoInterval);
  cronoActivo = false;
  cronoSegundos = 0;
  vueltas = [];
  document.getElementById('cronoDisplay').textContent = '00:00';
  document.getElementById('cronoBtnIniciar').textContent = '▶ Iniciar';
  document.getElementById('cronoBtnIniciar').disabled = false;
  document.getElementById('cronoVueltas').innerHTML = '';
};

window.cronoVuelta = function() {
  if (!cronoActivo && cronoSegundos === 0) return;
  const num = vueltas.length + 1;
  vueltas.push(cronoSegundos);
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;justify-content:space-between;font-size:0.78rem;padding:5px 8px;background:var(--gris-dark);border-radius:8px;';
  div.innerHTML = '<span style="color:#666;">🏁 Marca ' + num + '</span><span style="font-family:Righteous,cursive;color:var(--naranja);">' + cronoFormatear(cronoSegundos) + '</span>';
  document.getElementById('cronoVueltas').prepend(div);
};

// ===== TIMERS RÁPIDOS =====
let timers = [];

window.agregarTimer = function() {
  const nombre = document.getElementById('timerNombre').value.trim() || 'Timer';
  const minutos = parseInt(document.getElementById('timerMinutos').value) || 5;
  const segundosTotales = minutos * 60;
  const id = Date.now();
  const timer = { id, nombre, total: segundosTotales, restante: segundosTotales, activo: false, interval: null };
  timers.push(timer);
  document.getElementById('timerNombre').value = '';
  document.getElementById('timerMinutos').value = '';
  renderTimers();
};

function renderTimers() {
  const cont = document.getElementById('timersContainer');
  if (!cont) return;
  cont.innerHTML = '';
  if (!timers.length) {
    cont.innerHTML = '<div style="font-size:0.8rem;color:#555;text-align:center;padding:10px;">Agregá un timer arriba ⬆️</div>';
    return;
  }
  timers.forEach(t => {
    const row = document.createElement('div');
    row.className = 'timer-row';
    row.id = 'timer-' + t.id;
    const pct = t.restante / t.total;
    const color = pct > 0.3 ? 'var(--turquesa)' : 'var(--rojo)';
    row.innerHTML =
      '<div class="timer-nombre">' + t.nombre + '</div>' +
      '<div class="timer-display ' + (pct <= 0.15 ? 'urgente' : '') + '" id="disp-' + t.id + '">' + cronoFormatear(t.restante) + '</div>';

    const btnPlay = document.createElement('button');
    btnPlay.textContent = t.activo ? '⏸' : '▶';
    btnPlay.style.cssText = 'background:transparent;border:1.5px solid ' + color + ';color:' + color + ';border-radius:8px;width:34px;height:34px;cursor:pointer;font-size:1rem;';
    btnPlay.addEventListener('click', () => toggleTimer(t.id));

    const btnDel = document.createElement('button');
    btnDel.textContent = '🗑';
    btnDel.style.cssText = 'background:transparent;border:none;color:#555;cursor:pointer;font-size:1rem;';
    btnDel.addEventListener('click', () => eliminarTimer(t.id));

    row.appendChild(btnPlay);
    row.appendChild(btnDel);
    cont.appendChild(row);
  });
}

function toggleTimer(id) {
  const t = timers.find(x => x.id === id);
  if (!t) return;
  if (t.activo) {
    clearInterval(t.interval);
    t.activo = false;
  } else {
    if (t.restante <= 0) return;
    t.activo = true;
    t.interval = setInterval(() => {
      t.restante--;
      const disp = document.getElementById('disp-' + t.id);
      if (disp) {
        disp.textContent = cronoFormatear(t.restante);
        if (t.restante / t.total <= 0.15) disp.classList.add('urgente');
      }
      if (t.restante <= 0) {
        clearInterval(t.interval);
        t.activo = false;
        try { navigator.vibrate && navigator.vibrate([300,100,300,100,600]); } catch(e) {}
        playBeep();
        showNotif('⏰ ¡Timer ' + t.nombre + ' terminó!', true);
        renderTimers();
      }
    }, 1000);
  }
  renderTimers();
}

function eliminarTimer(id) {
  const t = timers.find(x => x.id === id);
  if (t && t.interval) clearInterval(t.interval);
  timers = timers.filter(x => x.id !== id);
  renderTimers();
}
