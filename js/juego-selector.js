// ===================== SELECTOR DE JUEGO =====================
window.elegirJuego = function(juego) {
  const juegos = ['tetris','snake','2048','dino','minas','slots'];
  juegos.forEach(j => {
    const el = document.getElementById('juego' + j.charAt(0).toUpperCase() + j.slice(1));
    if(el) el.style.display = 'none';
    const btn = document.getElementById('btnJuego' + j.charAt(0).toUpperCase() + j.slice(1));
    if(btn) btn.style.borderColor = 'var(--gris-light)';
  });
  const show = document.getElementById('juego' + juego.charAt(0).toUpperCase() + juego.slice(1));
  if(show) show.style.display = 'block';
  const actBtn = document.getElementById('btnJuego' + juego.charAt(0).toUpperCase() + juego.slice(1));
  if(actBtn) actBtn.style.borderColor = 'var(--turquesa)';
  if(juego==='tetris' && !tetrisRunning) window.tetrisInit();
  if(juego==='snake' && !snakeRunning) window.snakeInit();
  if(juego==='2048') window.g2048Init();
  if(juego==='dino') window.dinoInit();
  if(juego==='minas') window.minasInit();
  if(juego==='slots') window.slotsInit();
  // Actualizar sistema de recompensa para el juego seleccionado
  window.juegoActualRecompensa = juego;
  if (typeof window.actualizarBarraRecompensa === 'function') window.actualizarBarraRecompensa();
};
