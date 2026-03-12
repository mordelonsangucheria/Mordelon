// ===================== PONG MULTIJUGADOR — MORDELÓN =====================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, updateDoc, getDoc, deleteDoc, onSnapshot, collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Reusar la app Firebase ya inicializada por cliente-app.js
const _app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: "AIzaSyDom7vxzcnnkc5_y3JquIr6TjMp5GX89_0",
  authDomain: "mordelon-52e75.firebaseapp.com",
  projectId: "mordelon-52e75",
  storageBucket: "mordelon-52e75.firebasestorage.app",
  messagingSenderId: "603187538200",
  appId: "1:603187538200:web:8921a78447a2182b5a166d"
});
const db = getFirestore(_app);

// ── Esperar usuario logueado ──────────────────────────────────────────────
function _ready(fn) {
  if (window.usuarioActual) { fn(); return; }
  const iv = setInterval(() => {
    if (window.usuarioActual) { clearInterval(iv); fn(); }
  }, 300);
}

// ── Refs Firestore ────────────────────────────────────────────────────────
const _salaRef = (id) => doc(db, 'pongSalas', id);
const _retoRef = (nombre) => doc(db, 'pongRetos', nombre);

// ── Estado del multijugador ───────────────────────────────────────────────
const PM = {
  activo:      false,
  soyHost:     false,
  salaId:      null,
  miNombre:    null,
  rivalNombre: null,
  unsubSala:   null,
  unsubRetos:  null,
  lastSend:    0,
  SEND_MS:     50,
};

const _miNombre = () => window.usuarioActual?.nombre || null;
const _toast = (msg, ms) => typeof window.showToast === 'function' && window.showToast(msg, ms || 3000);

// ── UI Panel ──────────────────────────────────────────────────────────────
function _inyectarUI() {
  if (document.getElementById('pongMultiPanel')) return;
  const panel = document.createElement('div');
  panel.id = 'pongMultiPanel';
  panel.style.cssText = `
    display:none; position:fixed; inset:0; z-index:9000;
    background:rgba(8,12,16,0.97);
    flex-direction:column; align-items:center; justify-content:center;
    gap:18px; padding:24px; font-family:Nunito,sans-serif;
  `;
  panel.innerHTML = `
    <div style="color:#3DBFB8;font-size:1.4rem;font-weight:900;letter-spacing:1px;">🔥 PONG ONLINE</div>
    <div id="pongMultiContenido" style="width:100%;max-width:320px;"></div>
    <button onclick="window.pongMultiCerrarPanel()"
      style="background:transparent;border:1px solid #333;color:#555;border-radius:10px;
             padding:8px 22px;cursor:pointer;font-size:0.85rem;font-family:Nunito,sans-serif;">
      ✕ Cerrar
    </button>
  `;
  document.body.appendChild(panel);
}

function _mostrarPanel(html) {
  const p = document.getElementById('pongMultiPanel');
  if (!p) return;
  document.getElementById('pongMultiContenido').innerHTML = html;
  p.style.display = 'flex';
}

window.pongMultiCerrarPanel = function () {
  const p = document.getElementById('pongMultiPanel');
  if (p) p.style.display = 'none';
};

// ── Abrir panel principal ─────────────────────────────────────────────────
window.pongMultiAbrir = function () {
  if (!_miNombre()) { _toast('⚠️ Necesitás estar logueado para jugar online'); return; }
  _inyectarUI();
  _mostrarPanel(`
    <div style="color:#aaa;font-size:0.85rem;margin-bottom:4px;">
      Jugando como <span style="color:#3DBFB8;font-weight:800;">${_miNombre()}</span>
    </div>
    <div style="color:#fff;font-size:0.9rem;font-weight:700;margin:12px 0 6px;">Retar a un jugador</div>
    <div style="display:flex;gap:8px;">
      <input id="pongMultiRivalInput" type="text" placeholder="Nombre del rival"
        style="flex:1;background:#111;border:1.5px solid #333;color:#fff;border-radius:10px;
               padding:10px 14px;font-family:Nunito,sans-serif;font-size:0.9rem;text-transform:uppercase;"
        oninput="this.value=this.value.toUpperCase()"
      />
      <button onclick="window.pongMultiRetar()"
        style="background:#3DBFB8;color:#0a0a0a;border:none;border-radius:10px;
               padding:10px 16px;font-weight:800;cursor:pointer;font-family:Nunito,sans-serif;font-size:0.9rem;">
        RETAR
      </button>
    </div>
    <div id="pongMultiMsg" style="font-size:0.8rem;color:#666;margin-top:8px;min-height:18px;"></div>
    <div style="border-top:1px solid #1a1a1a;margin:16px 0;"></div>
    <div style="color:#444;font-size:0.78rem;text-align:center;">
      Cuando alguien te rete, te aparece una notificación automáticamente.
    </div>
  `);
};

// ── Retar ─────────────────────────────────────────────────────────────────
window.pongMultiRetar = async function () {
  const rivalRaw = (document.getElementById('pongMultiRivalInput')?.value || '').trim().toUpperCase();
  const msgEl = document.getElementById('pongMultiMsg');
  const yo = _miNombre();

  if (!rivalRaw) { msgEl.style.color='#e88'; msgEl.textContent='⚠️ Ingresá el nombre del rival'; return; }
  if (rivalRaw === yo) { msgEl.style.color='#e88'; msgEl.textContent='⚠️ No podés retarte a vos mismo'; return; }

  msgEl.style.color = '#3DBFB8'; msgEl.textContent = 'Buscando jugador...';

  try {
    const snap = await getDoc(doc(db, 'clientes', rivalRaw));
    if (!snap.exists()) { msgEl.style.color='#e88'; msgEl.textContent='❌ No existe ese jugador'; return; }

    const retoSnap = await getDoc(_retoRef(rivalRaw));
    if (retoSnap.exists()) { msgEl.style.color='#e88'; msgEl.textContent='⏳ Ese jugador ya tiene un reto pendiente'; return; }

    const salaId = yo + '_vs_' + rivalRaw + '_' + Date.now();
    await setDoc(_salaRef(salaId), {
      host: yo, guest: rivalRaw, estado: 'esperando',
      hostScore: 0, guestScore: 0, hostLives: 3, guestLives: 3,
      ballX: 140, ballY: 200, ballVx: 0, ballVy: 0,
      hostPaddleX: 113, guestPaddleX: 113, creadoEn: Date.now(),
    });
    await setDoc(_retoRef(rivalRaw), { de: yo, para: rivalRaw, salaId, ts: Date.now() });

    PM.salaId = salaId; PM.soyHost = true; PM.miNombre = yo; PM.rivalNombre = rivalRaw;

    _mostrarPanel(`
      <div style="text-align:center;padding:20px 0;">
        <div style="font-size:2rem;margin-bottom:12px;">⏳</div>
        <div style="color:#fff;font-weight:800;font-size:1rem;margin-bottom:6px;">
          Reto enviado a <span style="color:#3DBFB8;">${rivalRaw}</span>
        </div>
        <div style="color:#555;font-size:0.8rem;">Esperando que acepte...</div>
        <button onclick="window.pongMultiCancelarReto()"
          style="margin-top:20px;background:transparent;border:1px solid #444;color:#777;
                 border-radius:10px;padding:8px 20px;cursor:pointer;font-family:Nunito,sans-serif;">
          Cancelar reto
        </button>
      </div>
    `);

    if (PM.unsubSala) PM.unsubSala();
    PM.unsubSala = onSnapshot(_salaRef(salaId), (d) => {
      if (!d.exists()) return;
      const data = d.data();
      if (data.estado === 'jugando') { window.pongMultiCerrarPanel(); _iniciarPartidaMulti(salaId, true, rivalRaw); }
      if (data.estado === 'cancelado') {
        if (PM.unsubSala) { PM.unsubSala(); PM.unsubSala = null; }
        _toast('❌ ' + rivalRaw + ' rechazó el reto');
        window.pongMultiCerrarPanel();
      }
    });

  } catch (e) {
    msgEl.style.color='#e88'; msgEl.textContent='❌ Error al enviar el reto';
    console.error(e);
  }
};

window.pongMultiCancelarReto = async function () {
  try {
    if (PM.unsubSala) { PM.unsubSala(); PM.unsubSala = null; }
    if (PM.salaId) await deleteDoc(_salaRef(PM.salaId)).catch(()=>{});
    if (PM.rivalNombre) await deleteDoc(_retoRef(PM.rivalNombre)).catch(()=>{});
  } catch(e) {}
  PM.salaId = null; PM.soyHost = false;
  window.pongMultiCerrarPanel();
};

// ── Escuchar retos entrantes ──────────────────────────────────────────────
function _escucharRetos() {
  const yo = _miNombre(); if (!yo) return;
  if (PM.unsubRetos) { PM.unsubRetos(); PM.unsubRetos = null; }
  PM.unsubRetos = onSnapshot(_retoRef(yo), (snap) => {
    if (!snap.exists() || PM.activo) return;
    _mostrarNotificacionReto(snap.data());
  });
}

function _mostrarNotificacionReto(reto) {
  _inyectarUI();
  _mostrarPanel(`
    <div style="text-align:center;padding:10px 0;">
      <div style="font-size:2.5rem;margin-bottom:10px;">🥊</div>
      <div style="color:#D4831A;font-weight:900;font-size:1.1rem;margin-bottom:6px;">¡RETO RECIBIDO!</div>
      <div style="color:#fff;font-size:0.95rem;margin-bottom:20px;">
        <span style="color:#3DBFB8;font-weight:800;">${reto.de}</span> te desafía a Pong
      </div>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button onclick="window.pongMultiAceptar('${reto.salaId}','${reto.de}')"
          style="background:#3DBFB8;color:#0a0a0a;border:none;border-radius:12px;
                 padding:12px 24px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;font-size:0.95rem;">
          ✅ ACEPTAR
        </button>
        <button onclick="window.pongMultiRechazar('${reto.salaId}','${reto.de}')"
          style="background:#222;color:#888;border:1px solid #444;border-radius:12px;
                 padding:12px 24px;font-weight:700;cursor:pointer;font-family:Nunito,sans-serif;font-size:0.95rem;">
          ✕ Rechazar
        </button>
      </div>
    </div>
  `);
}

window.pongMultiAceptar = async function (salaId, hostNombre) {
  const yo = _miNombre();
  try {
    await updateDoc(_salaRef(salaId), { estado: 'jugando' });
    await deleteDoc(_retoRef(yo));
    if (PM.unsubSala) { PM.unsubSala(); PM.unsubSala = null; }
    PM.salaId = salaId; PM.soyHost = false; PM.miNombre = yo; PM.rivalNombre = hostNombre;
    window.pongMultiCerrarPanel();
    _iniciarPartidaMulti(salaId, false, hostNombre);
  } catch(e) { _toast('❌ Error al aceptar el reto'); console.error(e); }
};

window.pongMultiRechazar = async function (salaId, hostNombre) {
  const yo = _miNombre();
  try {
    await updateDoc(_salaRef(salaId), { estado: 'cancelado' });
    await deleteDoc(_retoRef(yo));
  } catch(e) {}
  window.pongMultiCerrarPanel();
};

// ── Iniciar partida ───────────────────────────────────────────────────────
function _iniciarPartidaMulti(salaId, soyHost, rivalNombre) {
  PM.activo = true; PM.salaId = salaId; PM.soyHost = soyHost;
  PM.rivalNombre = rivalNombre; PM.miNombre = _miNombre();
  if (typeof window.pongReset === 'function') window.pongReset();
  _inyectarHUDMulti();
  if (soyHost) _iniciarComoHost(); else _iniciarComoGuest();
}

// ── HUD ───────────────────────────────────────────────────────────────────
function _inyectarHUDMulti() {
  let hud = document.getElementById('pongMultiHUD');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'pongMultiHUD';
    const canvas = document.getElementById('pongCanvas');
    if (canvas?.parentNode) canvas.parentNode.insertBefore(hud, canvas.nextSibling);
    else document.body.appendChild(hud);
  }
  hud.style.cssText = `
    display:flex; justify-content:space-between; align-items:center;
    background:#0d1117; border:1px solid #1a2a2a; border-radius:0 0 12px 12px;
    padding:6px 12px; font-family:Nunito,sans-serif; font-size:0.78rem;
    max-width:280px; margin:0 auto;
  `;
  hud.innerHTML = `
    <span style="color:#3DBFB8;font-weight:800;">${PM.miNombre}</span>
    <span style="color:#444;font-size:0.7rem;">VS ONLINE</span>
    <span style="color:#D4831A;font-weight:800;">${PM.rivalNombre}</span>
    <button onclick="window.pongMultiRendirse()"
      style="background:transparent;border:1px solid #2a2a2a;color:#444;
             border-radius:6px;padding:2px 8px;cursor:pointer;font-size:0.7rem;
             font-family:Nunito,sans-serif;margin-left:8px;">rendirse</button>
  `;
}

function _removerHUDMulti() {
  document.getElementById('pongMultiHUD')?.remove();
}

// ── Constantes canvas ─────────────────────────────────────────────────────
const PW = 280, PH = 400, PADDLE_W = 54, PADDLE_H = 10, BALL_R = 7;
const TURQ = '#3DBFB8', NARANJ = '#D4831A';
let _mState = null, _mRaf = null, _mCtx = null;

// ── HOST ──────────────────────────────────────────────────────────────────
function _iniciarComoHost() {
  _mCtx = document.getElementById('pongCanvas')?.getContext('2d');
  _mState = {
    ball: { x: PW/2, y: PH/2, vx: 1.6, vy: 2.2 },
    hostPaddle:  { x: PW/2 - PADDLE_W/2 },
    guestPaddle: { x: PW/2 - PADDLE_W/2 },
    hostLives: 3, guestLives: 3,
    hostScore: 0, guestScore: 0, rallyHits: 0,
  };

  if (PM.unsubSala) PM.unsubSala();
  PM.unsubSala = onSnapshot(_salaRef(PM.salaId), (snap) => {
    if (!snap.exists()) { _finalizarMulti('conexion'); return; }
    const d = snap.data();
    if (d.estado === 'terminado' || d.estado === 'cancelado') { _finalizarMulti('rival'); return; }
    if (_mState) _mState.guestPaddle.x = d.guestPaddleX ?? _mState.guestPaddle.x;
  });

  _mLoop();
}

function _mLoop() {
  if (!PM.activo || !PM.soyHost) return;
  _mFisica();
  _mDibujar();
  const now = Date.now();
  if (now - PM.lastSend >= PM.SEND_MS) { PM.lastSend = now; _mEnviarEstado(); }
  _mRaf = requestAnimationFrame(_mLoop);
}

function _mFisica() {
  const s = _mState; if (!s) return;
  s.ball.x += s.ball.vx;
  s.ball.y += s.ball.vy;

  if (s.ball.x - BALL_R <= 0)  { s.ball.x = BALL_R;      s.ball.vx *= -1; }
  if (s.ball.x + BALL_R >= PW) { s.ball.x = PW - BALL_R; s.ball.vx *= -1; }

  if (window._pongHostPaddleX !== undefined) s.hostPaddle.x = window._pongHostPaddleX;

  const hostY = PH - 28, guestY = 18;

  // Colisión host (abajo)
  if (s.ball.vy > 0 &&
      s.ball.y + BALL_R >= hostY && s.ball.y + BALL_R <= hostY + PADDLE_H + 5 &&
      s.ball.x >= s.hostPaddle.x - 2 && s.ball.x <= s.hostPaddle.x + PADDLE_W + 2) {
    s.rallyHits++;
    const ramp = Math.min(s.rallyHits / 2, 1);
    const newVy = Math.max(Math.abs(s.ball.vy) + 0.08, 2.5 + ramp * 2.2);
    s.ball.vy = -Math.min(newVy, 15);
    const hit = (s.ball.x - (s.hostPaddle.x + PADDLE_W/2)) / (PADDLE_W/2);
    s.ball.vx = hit * 4.5;
    if (Math.abs(s.ball.vx) < 1.5) s.ball.vx = (s.ball.vx >= 0 ? 1 : -1) * 1.5;
    s.ball.y = hostY - BALL_R;
    s.hostScore++;
  }

  // Colisión guest (arriba)
  if (s.ball.vy < 0 &&
      s.ball.y - BALL_R <= guestY + PADDLE_H && s.ball.y - BALL_R >= guestY - 5 &&
      s.ball.x >= s.guestPaddle.x - 2 && s.ball.x <= s.guestPaddle.x + PADDLE_W + 2) {
    s.rallyHits++;
    const ramp = Math.min(s.rallyHits / 2, 1);
    const newVy = Math.max(Math.abs(s.ball.vy) + 0.08, 2.5 + ramp * 2.2);
    s.ball.vy = Math.min(newVy, 15);
    const hit = (s.ball.x - (s.guestPaddle.x + PADDLE_W/2)) / (PADDLE_W/2);
    s.ball.vx = hit * 4;
    if (Math.abs(s.ball.vx) < 1.5) s.ball.vx = (s.ball.vx >= 0 ? 1 : -1) * 1.5;
    s.ball.y = guestY + PADDLE_H + BALL_R;
    s.guestScore++;
  }

  // Sale por abajo → host pierde vida
  if (s.ball.y - BALL_R > PH) {
    s.hostLives--; s.rallyHits = 0;
    if (s.hostLives <= 0) { _mFinPartida(); return; }
    s.ball = { x: PW/2, y: PH/2, vx: (Math.random()>.5?1:-1)*1.6, vy: 2.2 };
  }

  // Sale por arriba → guest pierde vida
  if (s.ball.y + BALL_R < 0) {
    s.guestLives--; s.rallyHits = 0;
    if (s.guestLives <= 0) { _mFinPartida(); return; }
    s.ball = { x: PW/2, y: PH/2, vx: (Math.random()>.5?1:-1)*1.6, vy: -2.2 };
  }
}

async function _mEnviarEstado() {
  if (!_mState || !PM.salaId) return;
  const s = _mState;
  try {
    await updateDoc(_salaRef(PM.salaId), {
      ballX: Math.round(s.ball.x * 10) / 10,
      ballY: Math.round(s.ball.y * 10) / 10,
      hostPaddleX: Math.round(s.hostPaddle.x),
      hostScore: s.hostScore, guestScore: s.guestScore,
      hostLives: s.hostLives, guestLives: s.guestLives,
      ts: Date.now(),
    });
  } catch(e) {}
}

async function _mFinPartida() {
  const s = _mState;
  const hostGano = s.guestLives <= 0;
  cancelAnimationFrame(_mRaf);
  try {
    await updateDoc(_salaRef(PM.salaId), {
      estado: 'terminado',
      ganador: hostGano ? PM.miNombre : PM.rivalNombre,
      hostLives: s.hostLives, guestLives: s.guestLives,
    });
  } catch(e) {}
  _mostrarResultadoMulti(hostGano ? PM.miNombre : PM.rivalNombre);
}

// ── GUEST ─────────────────────────────────────────────────────────────────
function _iniciarComoGuest() {
  _mCtx = document.getElementById('pongCanvas')?.getContext('2d');
  _mState = {
    ball: { x: PW/2, y: PH/2 },
    hostPaddle:  { x: PW/2 - PADDLE_W/2 },
    guestPaddle: { x: PW/2 - PADDLE_W/2 },
    hostLives: 3, guestLives: 3, hostScore: 0, guestScore: 0,
  };

  if (PM.unsubSala) PM.unsubSala();
  PM.unsubSala = onSnapshot(_salaRef(PM.salaId), (snap) => {
    if (!snap.exists()) { _finalizarMulti('conexion'); return; }
    const d = snap.data();
    if (d.estado === 'terminado') { _mostrarResultadoMulti(d.ganador); return; }
    if (d.estado === 'cancelado') { _finalizarMulti('rival'); return; }
    if (_mState) {
      _mState.ball.x       = d.ballX ?? _mState.ball.x;
      _mState.ball.y       = d.ballY ?? _mState.ball.y;
      _mState.hostPaddle.x = d.hostPaddleX ?? _mState.hostPaddle.x;
      _mState.hostLives    = d.hostLives  ?? 3;
      _mState.guestLives   = d.guestLives ?? 3;
      _mState.hostScore    = d.hostScore  ?? 0;
      _mState.guestScore   = d.guestScore ?? 0;
    }
  });

  _guestLoop();
}

function _guestLoop() {
  if (!PM.activo || PM.soyHost) return;
  _mDibujar();
  const now = Date.now();
  if (now - PM.lastSend >= PM.SEND_MS) {
    PM.lastSend = now;
    if (window._pongHostPaddleX !== undefined) {
      _mState.guestPaddle.x = window._pongHostPaddleX;
      updateDoc(_salaRef(PM.salaId), { guestPaddleX: Math.round(window._pongHostPaddleX) }).catch(()=>{});
    }
  }
  _mRaf = requestAnimationFrame(_guestLoop);
}

// ── Dibujo ────────────────────────────────────────────────────────────────
function _mDibujar() {
  const ctx = _mCtx, s = _mState;
  if (!ctx || !s) return;

  ctx.fillStyle = '#080c10'; ctx.fillRect(0, 0, PW, PH);

  // Grid
  ctx.strokeStyle = 'rgba(61,191,184,0.045)'; ctx.lineWidth = 0.5;
  for (let x = 0; x <= PW; x += 28) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,PH); ctx.stroke(); }
  for (let y = 0; y <= PH; y += 28) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(PW,y); ctx.stroke(); }

  // Línea central
  ctx.save();
  ctx.shadowColor = TURQ; ctx.shadowBlur = 5;
  ctx.setLineDash([5,7]); ctx.strokeStyle = 'rgba(61,191,184,0.3)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(0,PH/2); ctx.lineTo(PW,PH/2); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();

  // Puntos y nombres
  ctx.font = '8px Nunito,sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillStyle = NARANJ; ctx.textAlign = 'left';
  ctx.fillText(PM.rivalNombre + '  ' + s.guestScore, 8, 10);
  ctx.fillStyle = TURQ; ctx.textAlign = 'right';
  ctx.fillText(s.hostScore + '  ' + PM.miNombre, PW-8, PH-10);

  // Vidas
  ctx.font = '9px serif'; ctx.textAlign = 'left';
  for (let i = 0; i < 3; i++) { ctx.globalAlpha = i < s.hostLives ? 1 : 0.18; ctx.fillText('🔥', 8+i*14, PH-10); }
  ctx.textAlign = 'right';
  for (let i = 0; i < 3; i++) { ctx.globalAlpha = i < s.guestLives ? 1 : 0.18; ctx.fillText('🧅', PW-8-i*14, 10); }
  ctx.globalAlpha = 1;

  _mDibujarPaleta(ctx, s.hostPaddle.x,  PH-28, TURQ,   '🔥');
  _mDibujarPaleta(ctx, s.guestPaddle.x, 18,    NARANJ, '🧅');
  _mDibujarBola(ctx, s.ball.x, s.ball.y);
}

function _mDibujarPaleta(ctx, x, y, color, emoji) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  const grad = ctx.createLinearGradient(x, y, x, y+PADDLE_H);
  grad.addColorStop(0, color+'cc'); grad.addColorStop(1, color+'44');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.roundRect(x, y, PADDLE_W, PADDLE_H, 5); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color+'88'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x+.5, y+.5, PADDLE_W-1, PADDLE_H-1, 5); ctx.stroke();
  ctx.font = '10px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x+PADDLE_W/2, y+PADDLE_H/2+.5);
  ctx.restore();
}

function _mDibujarBola(ctx, x, y) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, BALL_R*3);
  glow.addColorStop(0, 'rgba(61,191,184,0.45)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, BALL_R*3, 0, Math.PI*2); ctx.fill();
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowBlur=5; ctx.shadowOffsetY=2;
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x, y, BALL_R, 0, Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.font = (BALL_R*1.65)+'px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('🥪', x, y+1);
}

// ── Resultado ─────────────────────────────────────────────────────────────
function _mostrarResultadoMulti(ganador) {
  cancelAnimationFrame(_mRaf);
  const yoGane = ganador === PM.miNombre;
  _inyectarUI();
  _mostrarPanel(`
    <div style="text-align:center;padding:16px 0;">
      <div style="font-size:3rem;margin-bottom:12px;">${yoGane ? '🏆' : '😔'}</div>
      <div style="font-size:1.2rem;font-weight:900;color:${yoGane ? '#3DBFB8' : '#D4831A'};">
        ${yoGane ? '¡GANASTE!' : '¡PERDISTE!'}
      </div>
      <div style="color:#666;font-size:0.85rem;margin:8px 0 20px;">
        ${yoGane ? 'Le ganaste a '+PM.rivalNombre : PM.rivalNombre+' te ganó'}
      </div>
      <button onclick="window.pongMultiAbrir()"
        style="background:#3DBFB8;color:#0a0a0a;border:none;border-radius:12px;
               padding:12px 28px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;font-size:0.95rem;">
        🔄 Revancha
      </button>
    </div>
  `);
  _limpiarEstadoMulti();
}

function _finalizarMulti(motivo) {
  cancelAnimationFrame(_mRaf);
  if (motivo === 'rival') _toast('⚠️ Tu rival se desconectó');
  if (motivo === 'conexion') _toast('⚠️ Error de conexión');
  _limpiarEstadoMulti();
  window.pongMultiCerrarPanel();
  if (typeof window.pongInit === 'function') window.pongInit();
}

function _limpiarEstadoMulti() {
  if (PM.unsubSala) { PM.unsubSala(); PM.unsubSala = null; }
  PM.activo = false; PM.soyHost = false; PM.salaId = null; PM.rivalNombre = null;
  _mState = null; _removerHUDMulti();
}

window.pongMultiRendirse = async function () {
  if (!confirm('¿Seguro que querés rendirte?')) return;
  try { if (PM.salaId) await updateDoc(_salaRef(PM.salaId), { estado:'terminado', ganador: PM.rivalNombre }); } catch(e) {}
  _mostrarResultadoMulti(PM.rivalNombre);
};

// ── Limpieza salas viejas ─────────────────────────────────────────────────
async function _limpiarSalasViejas() {
  try {
    const hace2h = Date.now() - 2 * 60 * 60 * 1000;
    const q = query(collection(db, 'pongSalas'), where('creadoEn', '<', hace2h));
    const snaps = await getDocs(q);
    snaps.forEach(d => deleteDoc(doc(db, 'pongSalas', d.id)).catch(()=>{}));
  } catch(e) {}
}

// ── Init ──────────────────────────────────────────────────────────────────
_inyectarUI();
_ready(() => {
  _escucharRetos();
  setTimeout(_limpiarSalasViejas, 5000);
});
