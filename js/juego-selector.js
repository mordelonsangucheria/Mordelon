// ===================== SELECTOR DE JUEGO =====================

// Mostrar/ocultar banner de fichas según el juego
function _actualizarBannerFichas(juego) {
  let banner = document.getElementById('fichasJuegoBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'fichasJuegoBanner';
    banner.style.cssText = 'padding:8px 12px;border-radius:10px;margin:6px 0;font-size:0.72rem;text-align:center;display:none;transition:all .2s;';
    const zona = document.getElementById('zonaJuegos');
    if (zona) {
      // Insertar después del selector de juegos
      const contenedores = zona.querySelectorAll('[id^="juego"]');
      const primerJuego = contenedores.length ? contenedores[0] : null;
      if (primerJuego) zona.insertBefore(banner, primerJuego);
      else zona.appendChild(banner);
    }
  }

  if (typeof window.juegoRequiereFichas !== 'function' || !window.juegoRequiereFichas(juego)) {
    banner.style.display = 'none';
    return;
  }

  const desglose = typeof window.juegoFichasDesglose === 'function'
    ? window.juegoFichasDesglose(juego)
    : { gratis: 0, compradas: 0, total: 0 };

  if (juego === 'slots') {
    banner.style.display = 'none'; // Slots tiene su propia UI de fichas
    return;
  }

  banner.style.display = 'block';
  if (desglose.total > 0) {
    banner.style.background = 'rgba(61,191,184,.08)';
    banner.style.border = '1px solid rgba(61,191,184,.2)';
    banner.innerHTML = '🎟️ <span style="color:var(--turquesa);font-weight:800;">' + desglose.total + '</span> fichas disponibles'
      + ' <span style="color:#555;">(' + desglose.gratis + ' gratis + ' + desglose.compradas + ' compradas)</span>';
  } else {
    banner.style.background = 'rgba(255,77,77,.08)';
    banner.style.border = '1px solid rgba(255,77,77,.2)';
    banner.innerHTML = '🎟️ <span style="color:var(--rojo);font-weight:800;">Sin fichas</span>'
      + ' <span style="color:#555;">· 3 gratis por día · 5 fichas = $500</span>';
  }
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

  // Sin fichas — mostrar mensaje
  if (typeof showToast === 'function') {
    showToast('🎟️ Sin fichas para ' + juego + '. 3 gratis por día o comprá 5 x $500');
  }
  _actualizarBannerFichas(juego);
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
