// ===================== SELECTOR DE JUEGO =====================

// Mostrar/ocultar cartel sinFichas por juego y actualizar nombre de usuario
function _actualizarCartelSinFichas(juego, sinFichas) {
  if (juego === 'slots') return; // Slots lo maneja internamente
  const cartel  = document.getElementById(juego + 'SinFichas');
  if (!cartel) return;
  const nombreEl = document.getElementById(juego + 'NombreSinFichas');
  if (nombreEl) {
    const nombre = (typeof usuarioActual !== 'undefined' && usuarioActual?.nombre) || '';
    nombreEl.textContent = nombre;
  }
  cartel.style.display = sinFichas ? 'block' : 'none';

  // Ocultar el canvas y controles del juego cuando no hay fichas
  const canvasIds = {
    tetris: 'tetrisCanvas', snake: 'snakeCanvas', dino: 'dinoCanvas',
    run: 'runCanvas', invaders: 'invadersCanvas', minas: 'minasCanvas',
    impact: 'impactCanvas', battle: 'battleCanvas', blockbuster: 'blockCanvas',
    '2048': 'canvas2048'
  };
  const canvasId = canvasIds[juego];
  if (canvasId) {
    const canvas = document.getElementById(canvasId);
    if (canvas) canvas.style.display = sinFichas ? 'none' : '';
  }
}

// Mostrar/ocultar banner de fichas según el juego
function _actualizarBannerFichas(juego) {
  if (juego === 'slots') return; // Slots lo maneja internamente

  if (typeof window.juegoRequiereFichas !== 'function' || !window.juegoRequiereFichas(juego)) {
    _actualizarCartelSinFichas(juego, false);
    return;
  }

  const desglose = typeof window.juegoFichasDesglose === 'function'
    ? window.juegoFichasDesglose(juego)
    : { gratis: 0, compradas: 0, total: 0 };

  _actualizarCartelSinFichas(juego, desglose.total <= 0);
}

// Intentar iniciar un juego con fichas
async function _iniciarJuegoConFichas(juego, initFn) {
  // Si el juego no requiere fichas, iniciar directo
  if (typeof window.juegoRequiereFichas !== 'function' || !window.juegoRequiereFichas(juego)) {
    initFn();
    return;
  }

  // Slots maneja sus propias fichas internamente
  if (juego === 'slots') {
    initFn();
    return;
  }

  // Intentar consumir ficha
  if (typeof window.juegoConsumirFicha === 'function') {
    var ok = await window.juegoConsumirFicha(juego);
    if (ok) {
      initFn();
      _actualizarBannerFichas(juego);
      return;
    }
  }

  // Sin fichas — mostrar cartel y toast
  if (typeof showToast === 'function') {
    showToast('🎟️ Sin fichas para ' + juego + '. 3 gratis por día o comprá 5 x $500');
  }
  _actualizarCartelSinFichas(juego, true);
}

window.elegirJuego = function(juego) {
  var juegos = ['tetris','snake','2048','dino','minas','invaders','slots','run','impact','battle','blockbuster'];
  juegos.forEach(function(j) {
    var el = document.getElementById('juego' + j.charAt(0).toUpperCase() + j.slice(1));
    if(el) el.style.display = 'none';
    var btn = document.getElementById('btnJuego' + j.charAt(0).toUpperCase() + j.slice(1));
    if(btn) btn.style.borderColor = 'var(--gris-light)';
  });
  var show = document.getElementById('juego' + juego.charAt(0).toUpperCase() + juego.slice(1));
  if(show) show.style.display = 'block';
  var actBtn = document.getElementById('btnJuego' + juego.charAt(0).toUpperCase() + juego.slice(1));
  if(actBtn) actBtn.style.borderColor = 'var(--turquesa)';

  // Iniciar juego (con verificación de fichas para los que no son slots)
  if(juego==='tetris')  _iniciarJuegoConFichas('tetris', function() { if(!tetrisRunning) window.tetrisInit(); });
  if(juego==='snake')   _iniciarJuegoConFichas('snake',  function() { if(!snakeRunning) window.snakeInit(); });
  if(juego==='2048')    _iniciarJuegoConFichas('2048',   function() { window.g2048Init(); });
  if(juego==='dino')    _iniciarJuegoConFichas('dino',   function() { window.dinoInit(); });
  if(juego==='minas')   _iniciarJuegoConFichas('minas',  function() { window.minasInit(); });
  if(juego==='invaders') _iniciarJuegoConFichas('invaders', function() { window.invadersInit(); });
  if(juego==='slots')   window.slotsInit();
  if(juego==='run')     _iniciarJuegoConFichas('run', function() { window.runInit(); });
  if(juego==='impact')  _iniciarJuegoConFichas('impact', function() { window.impactInit(); });
  if(juego==='battle')  _iniciarJuegoConFichas('battle', function() { window.battleInit(); });
  if(juego==='blockbuster') _iniciarJuegoConFichas('blockbuster', function() { window.blockbusterInit(); });

  // Actualizar sistema de recompensa para el juego seleccionado
  window.juegoActualRecompensa = juego;
  if (typeof window.actualizarBarraRecompensa === 'function') window.actualizarBarraRecompensa();

  // Mostrar banner de fichas
  _actualizarBannerFichas(juego);
};
