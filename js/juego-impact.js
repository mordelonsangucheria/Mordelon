// ===================== MORDELÓN IMPACT =====================
(function () {

  const W = 320, H = 220;

  let canvas, ctx, audioCtx;
  let estado = 'parado';
  let score = 0, hiScore = 0, vidas = 3, nivel = 1;
  let loopId = null, lastTs = 0;
  let impactDificultad = 1;

  let ship = { x: 28, y: H/2 - 16, w: 28, h: 32, vx: 0, vy: 0, shootTimer: 0, frame: 0, frameTimer: 0 };
  const SHIP_SPD = 2.6;
  const SHOOT_CD = 220;

  let bullets    = [];
  let eneBullets = [];
  let enemies    = [];
  let explosions = [];
  let stars      = [];
  let powerups   = [];

  let shieldTimer = 0, shieldHits = 0;
  let rapidTimer  = 0;
  let multiTimer  = 0;

  let waveClearing = false, waveTimer = 0;
  let keysDown = {}, touchY = null, shooting = false;

  // ── Audio ─────────────────────────────────────────────────────────────────
  function getAC() {
    if (!audioCtx) try { audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e) {}
    return audioCtx;
  }
  function tone(freq, type, dur, vol, f0) {
    const ac = getAC(); if (!ac) return;
    try {
      const o=ac.createOscillator(), g=ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type=type||'square';
      o.frequency.setValueAtTime(f0||freq, ac.currentTime);
      if(f0) o.frequency.exponentialRampToValueAtTime(freq, ac.currentTime+dur);
      g.gain.setValueAtTime(vol||0.10, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+dur);
      o.start(); o.stop(ac.currentTime+dur);
    } catch(e) {}
  }
  const sfxShoot   = () => tone(880,'square',  0.06,0.07);
  const sfxHit     = () => tone(220,'sawtooth',0.08,0.10,440);
  const sfxExplode = () => tone(80, 'sawtooth',0.18,0.14,300);
  const sfxPowerup = () => tone(660,'sine',    0.25,0.11,440);
  const sfxDamage  = () => tone(150,'sawtooth',0.20,0.17,250);
  const sfxBossHit = () => tone(180,'square',  0.10,0.12,360);
  const sfxLevelUp = () => [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,'sine',0.15,0.10),i*80));

  // ── Stars ──────────────────────────────────────────────────────────────────
  function initStars() {
    stars = Array.from({length:55}, ()=>({
      x:Math.random()*W, y:Math.random()*H,
      spd:0.3+Math.random()*1.5, r:Math.random()<0.15?1.5:0.7,
    }));
  }
  function updateStars(dt) {
    stars.forEach(s=>{ s.x-=s.spd*dt/16; if(s.x<0){s.x=W;s.y=Math.random()*H;} });
  }

  function dm() { return [0.55,1.0,1.4,1.85,2.4][impactDificultad]; }

  // ── Llama de Mordelón ─────────────────────────────────────────────────────
  // Copiada fielmente de juego-dino.js y adaptada para canvas del juego
  function drawLlamaRun1(cx, px0, py0) {
    const T='#3DBFB8',L='#7EEEE9',D='#1A8C87',W2='#FFFFFF',E='#0a1a1a',S='#B2F5F2';
    const p=(c,x,y,w,h)=>{cx.fillStyle=c;cx.fillRect(px0+x,py0+y,w,h);};
    p(S,20,0,3,3); p(S,2,6,3,3); p(S,28,10,3,3);
    p(L,12,2,6,4); p(T,10,4,10,6); p(L,8,6,4,4); p(L,16,6,6,4);
    p(T,6,10,18,14); p(L,8,10,6,6); p(L,18,12,6,4);
    p(D,6,16,4,8); p(D,22,14,4,10);
    p(W2,8,14,7,7); p(W2,17,15,7,7);
    p(E,10,16,3,3); p(E,19,16,3,3);
    p(L,9,22,12,4);
    p(T,8,24,5,6); p(D,8,28,5,3);
    p(D,18,24,5,3); p(T,18,24,5,5);
    p(S,4,28,2,2); p(S,24,30,2,2);
  }
  function drawLlamaRun2(cx, px0, py0) {
    const T='#3DBFB8',L='#7EEEE9',D='#1A8C87',W2='#FFFFFF',E='#0a1a1a',S='#B2F5F2';
    const p=(c,x,y,w,h)=>{cx.fillStyle=c;cx.fillRect(px0+x,py0+y,w,h);};
    p(S,2,4,3,3); p(S,26,8,3,3); p(S,18,0,2,2);
    p(L,10,2,8,4); p(T,8,4,12,8); p(L,6,8,5,5); p(L,18,6,6,4);
    p(T,5,12,20,12); p(L,7,12,7,6); p(L,17,14,6,4);
    p(D,5,18,4,6); p(D,22,16,4,8);
    p(W2,8,14,7,7); p(W2,17,15,7,7);
    p(E,10,16,3,3); p(E,19,16,3,3);
    p(L,9,22,12,4);
    p(D,8,24,5,3); p(T,8,24,5,5);
    p(T,18,24,5,6); p(D,18,28,5,3);
    p(S,6,30,2,2); p(S,22,28,2,2);
  }

  function drawShip() {
    const x = ship.x, y = ship.y;
    const hasShield = shieldTimer > 0 && shieldHits > 0;
    const invFlash  = shieldTimer > 0 && shieldHits <= 0 && Math.floor(Date.now()/80)%2===0;
    if (invFlash) return;

    if (hasShield) {
      ctx.strokeStyle = '#5599ffcc'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(x+14, y+16, 20, 22, 0, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = '#5599ff18'; ctx.fill();
    }

    // Power-up color hint on flame (tint sparks)
    const sparkCol = multiTimer>0 ? '#44ff88' : (rapidTimer>0 ? '#ff44ff' : '#B2F5F2');

    // Draw llama — alternating run frames, used as "flying" animation
    if (ship.frame === 0) drawLlamaRun1(ctx, x, y);
    else                  drawLlamaRun2(ctx, x, y);

    // Override sparks color if powerup active
    if (multiTimer>0 || rapidTimer>0) {
      ctx.fillStyle = sparkCol;
      ctx.fillRect(x+20,y+0,3,3); ctx.fillRect(x+2,y+6,3,3); ctx.fillRect(x+28,y+10,3,3);
      ctx.fillRect(x+4,y+28,2,2); ctx.fillRect(x+24,y+30,2,2);
    }

    // Bullet trail (motor de cohete a la izquierda de la llama)
    const trailCol = rapidTimer>0 ? '#ff44ff' : '#ffdd0088';
    ctx.fillStyle = trailCol;
    ctx.fillRect(x-8, y+12, 8, 4);
    ctx.fillStyle = '#ffffff55';
    ctx.fillRect(x-5, y+13, 5, 2);
  }

  // ── Enemigos — verduras ───────────────────────────────────────────────────
  // Tipos: 0=tomate, 1=huevo, 2=lechuga, 3=zanahoria, 4=berenjena
  function drawEnemy(e) {
    const x = e.x|0, y = e.y|0;
    const bob = Math.sin(Date.now()/300 + e.bobOffset) * 1.5; // leve bob

    switch(e.tipo) {
      case 0: drawTomate(x, y+bob);     break;
      case 1: drawHuevo(x, y+bob);      break;
      case 2: drawLechuga(x, y+bob);    break;
      case 3: drawZanahoria(x, y+bob);  break;
      case 4: drawBerenjena(x, y+bob);  break;
    }

    // Barra de vida si tiene más de 1 hp
    if (e.maxHp > 1) {
      ctx.fillStyle='#222'; ctx.fillRect(x, y-6, e.w, 3);
      ctx.fillStyle = e.hp/e.maxHp > 0.5 ? '#3dbfb8' : '#ff4444';
      ctx.fillRect(x, y-6, e.w*(e.hp/e.maxHp), 3);
    }
  }

  function drawTomate(x, y) {
    // Cuerpo rojo redondo
    ctx.fillStyle='#cc2200'; ctx.beginPath(); ctx.arc(x+9,y+9,9,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ff3311'; ctx.beginPath(); ctx.arc(x+9,y+9,9,0,Math.PI*2); ctx.fill();
    // Brillo
    ctx.fillStyle='#ff7755'; ctx.beginPath(); ctx.ellipse(x+6,y+5,4,3,0,0,Math.PI*2); ctx.fill();
    // Hojitas verdes arriba
    ctx.fillStyle='#22aa44';
    ctx.beginPath(); ctx.ellipse(x+9,y+1,3,4,-0.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+5,y+2,2,3,-1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+13,y+2,2,3,1,0,Math.PI*2); ctx.fill();
    // Carita enojada
    ctx.fillStyle='#660000';
    ctx.fillRect(x+5,y+7,3,2); ctx.fillRect(x+11,y+7,3,2); // ojos
    ctx.beginPath(); ctx.moveTo(x+6,y+12); ctx.lineTo(x+12,y+12); ctx.lineTo(x+11,y+14); ctx.lineTo(x+7,y+14); ctx.closePath(); ctx.fill(); // boca
  }

  function drawHuevo(x, y) {
    // Cuerpo ovalado blanco-amarillo
    ctx.fillStyle='#eeeecc'; ctx.beginPath(); ctx.ellipse(x+8,y+10,8,10,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffffee'; ctx.beginPath(); ctx.ellipse(x+6,y+6,4,4,0,0,Math.PI*2); ctx.fill(); // brillo
    // Grietas
    ctx.strokeStyle='#bbaa66'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x+10,y+2); ctx.lineTo(x+8,y+6); ctx.lineTo(x+11,y+9); ctx.stroke();
    // Carita asustada
    ctx.fillStyle='#887744';
    ctx.fillRect(x+5,y+8,2,2); ctx.fillRect(x+10,y+8,2,2); // ojos
    ctx.beginPath(); ctx.arc(x+8,y+13,2,0,Math.PI); ctx.fill(); // boca abierta
  }

  function drawLechuga(x, y) {
    // Hojas externas
    ctx.fillStyle='#44bb33';
    ctx.beginPath(); ctx.ellipse(x+9,y+9,10,8,0,0,Math.PI*2); ctx.fill();
    // Hojas internas
    ctx.fillStyle='#88dd44';
    ctx.beginPath(); ctx.ellipse(x+9,y+9,7,6,0.3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#aaf055';
    ctx.beginPath(); ctx.ellipse(x+9,y+10,4,4,-0.3,0,Math.PI*2); ctx.fill();
    // Nervaduras
    ctx.strokeStyle='#33993399'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x+9,y+4); ctx.lineTo(x+9,y+16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+3,y+8); ctx.lineTo(x+15,y+10); ctx.stroke();
    // Ojos
    ctx.fillStyle='#1a5c11';
    ctx.fillRect(x+5,y+7,2,2); ctx.fillRect(x+11,y+7,2,2);
    // Boca (risa nerviosa)
    ctx.beginPath(); ctx.arc(x+9,y+12,3,0.1,Math.PI-0.1); ctx.stroke();
  }

  function drawZanahoria(x, y) {
    // Cuerpo naranja triangular
    ctx.fillStyle='#ff8c00';
    ctx.beginPath(); ctx.moveTo(x+9,y+18); ctx.lineTo(x+3,y+2); ctx.lineTo(x+15,y+2); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ffaa33';
    ctx.beginPath(); ctx.moveTo(x+9,y+14); ctx.lineTo(x+5,y+4); ctx.lineTo(x+10,y+4); ctx.closePath(); ctx.fill(); // brillo
    // Líneas horizontales
    ctx.strokeStyle='#cc5500'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x+5,y+7); ctx.lineTo(x+13,y+7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+5,y+11); ctx.lineTo(x+13,y+11); ctx.stroke();
    // Hojitas verdes arriba
    ctx.fillStyle='#33aa22';
    ctx.beginPath(); ctx.ellipse(x+7,y+1,2,4,-0.4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+11,y+1,2,4,0.4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+9,y+0,2,5,0,0,Math.PI*2); ctx.fill();
    // Carita
    ctx.fillStyle='#883300';
    ctx.fillRect(x+6,y+8,2,2); ctx.fillRect(x+10,y+8,2,2);
    ctx.beginPath(); ctx.moveTo(x+7,y+13); ctx.lineTo(x+11,y+13); ctx.stroke();
  }

  function drawBerenjena(x, y) {
    // Cuerpo morado
    ctx.fillStyle='#6622aa';
    ctx.beginPath(); ctx.ellipse(x+9,y+11,7,10,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#8833cc';
    ctx.beginPath(); ctx.ellipse(x+7,y+7,3,4,0,0,Math.PI*2); ctx.fill(); // brillo
    // Caliz verde
    ctx.fillStyle='#33aa22';
    ctx.beginPath(); ctx.ellipse(x+9,y+2,5,3,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#55cc33';
    ctx.beginPath(); ctx.ellipse(x+5,y+1,2,3,-0.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+13,y+1,2,3,0.5,0,Math.PI*2); ctx.fill();
    // Palito
    ctx.fillStyle='#33aa22'; ctx.fillRect(x+8,y-3,3,5);
    // Carita malvada
    ctx.fillStyle='#330066';
    // Cejas inclinadas
    ctx.fillRect(x+5,y+8,3,2); ctx.fillRect(x+10,y+8,3,2);
    ctx.fillRect(x+5,y+7,2,1); ctx.fillRect(x+12,y+7,2,1);
    ctx.beginPath(); ctx.moveTo(x+6,y+13); ctx.lineTo(x+12,y+13); ctx.lineTo(x+11,y+15); ctx.lineTo(x+7,y+15); ctx.closePath();
    ctx.fillStyle='#220044'; ctx.fill();
  }

  // ── Bosses ────────────────────────────────────────────────────────────────
  function drawBoss(e) {
    const x=e.x|0, y=e.y|0, pct=e.hp/e.maxHp;
    const pulse=0.85+0.15*Math.sin(Date.now()/180);

    // Boss gigante según tipo (versión enorme de la verdura)
    ctx.save(); ctx.globalAlpha=pulse;
    const scale = e.bossScale || 2.2;
    ctx.translate(x+e.w/2, y+e.h/2);
    ctx.scale(scale, scale);

    switch(e.bossType%5) {
      case 0: drawTomate(-9,-9);    break; // Super Tomate
      case 1: drawHuevo(-8,-10);    break; // Mega Huevo
      case 2: drawLechuga(-9,-9);   break; // Lechuga Jefa
      case 3: drawZanahoria(-9,-9); break; // Zanahoria Suprema
      case 4: drawBerenjena(-9,-11);break; // Berenjena Oscura
    }
    ctx.restore();

    // Aura de boss
    ctx.strokeStyle = ['#ff4444','#eecc00','#33bb33','#ff8c00','#9933cc'][e.bossType%5]+'88';
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.ellipse(x+e.w/2,y+e.h/2, e.w/2+8+Math.sin(Date.now()/200)*4, e.h/2+8+Math.cos(Date.now()/250)*4, 0, 0, Math.PI*2); ctx.stroke();

    // Barra de vida
    const bw=e.w+16;
    ctx.fillStyle='#222'; ctx.fillRect(x-8,y-10,bw,5);
    ctx.fillStyle=pct>0.6?'#ff4444':(pct>0.3?'#ff8800':'#ffdd00');
    ctx.fillRect(x-8,y-10,bw*pct,5);

    // Label
    const labels=['🍅 SUPER TOMATE','🥚 MEGA HUEVO','🥬 LECHUGA JEFA','🥕 ZANAHORIA REY','🍆 BERENJENA OSCURA'];
    ctx.fillStyle='#ffdd00'; ctx.font='bold 7px monospace';
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(labels[e.bossType%5], x+e.w/2, y-11);
  }

  // ── Spawn ─────────────────────────────────────────────────────────────────
  function spawnWave() {
    enemies=[]; waveClearing=false;
    if (nivel%5===0) { spawnBoss(); return; }
    const rows=nivel<3?2:(nivel<7?3:4);
    const cols=Math.min(2+Math.floor(nivel/2),5);
    const ENE_H = 20;
    const YMIN  = ENE_H + 12;                 // margen superior
    const YMAX  = H - ENE_H - 12;             // margen inferior (garantiza espacio para moverse)
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) {
      const tipo=Math.floor(Math.random()*5);
      const hp=Math.ceil((1+Math.floor(nivel/5))*dm());
      const spawnY = YMIN + r*(YMAX-YMIN)/Math.max(rows-1,1);
      enemies.push({
        x:W-25-c*38, y:spawnY,
        w:18, h:ENE_H, hp, maxHp:hp, tipo,
        dir: r%2===0 ? 1 : -1,               // filas alternas arrancan en dirección opuesta
        bobOffset:Math.random()*Math.PI*2,
        shootTimer:(900+Math.random()*1000)/dm(),
        moveSpd:(50+nivel*6)*dm(),
        pts:(tipo+1)*10, isBoss:false,
      });
    }
  }

  function spawnBoss() {
    const bossType=Math.floor(nivel/5)%5;
    const hp=Math.ceil((20+nivel*4)*dm());
    enemies.push({
      x:W-72, y:H/2-30, w:56, h:58,
      hp, maxHp:hp, tipo:'boss', bossType,
      timer:0, phase:0,
      shootTimer:500/dm(),
      pts:700+nivel*80, isBoss:true,
      dir:1, bobOffset:0,
    });
  }

  function updateBoss(e, dt) {
    e.timer+=dt;
    const t=e.timer, spd=dt/1000, pct=e.hp/e.maxHp;
    switch(e.bossType%4) {
      case 0: e.y=(H/2-30)+Math.sin(t/700)*70; break;
      case 1: e.y=(H/2-30)+Math.sin(t/600)*60; e.x=(W-72)+Math.cos(t/1200)*20; break;
      case 2:
        e.y+=e.dir*(90+(1-pct)*60)*dm()*spd;
        if(e.y<8||e.y>H-e.h-8) e.dir*=-1;
        if(pct<0.4) e.x=Math.max(W-140,e.x-20*spd);
        break;
      case 3:
        if(Math.floor(t/3000)!==Math.floor((t-dt)/3000)){
          e.y=10+Math.random()*(H-e.h-20);
          spawnExplosion(e.x+e.w/2,e.y+e.h/2,false);
        }
        break;
    }
    e.y=Math.max(5,Math.min(H-e.h-5,e.y));
    e.x=Math.max(W/2,Math.min(W-e.w-5,e.x));

    e.shootTimer-=dt;
    if(e.shootTimer>0) return;
    const bs=(2.5+nivel*0.25)*dm();
    switch(e.bossType%4) {
      case 0:
        for(let i=-1;i<=1;i++) eneBullets.push({x:e.x,y:e.y+e.h/2+i*10,vx:-bs,vy:0});
        e.shootTimer=700/dm(); break;
      case 1:
        for(let i=-2;i<=2;i++) eneBullets.push({x:e.x,y:e.y+e.h/2,vx:-bs,vy:i*bs*0.4});
        e.shootTimer=1000/dm(); break;
      case 2:
        const n=pct<0.4?4:2;
        for(let i=0;i<n;i++) eneBullets.push({x:e.x,y:e.y+e.h/2+(i-n/2+0.5)*12,vx:-bs*(pct<0.4?1.4:1),vy:0});
        e.shootTimer=(pct<0.4?300:500)/dm(); break;
      case 3:
        e.phase=(e.phase||0)+0.4;
        for(let i=0;i<6;i++){
          const ang=e.phase+(i/6)*Math.PI*2;
          eneBullets.push({x:e.x+e.w/2,y:e.y+e.h/2,vx:Math.cos(ang)*bs,vy:Math.sin(ang)*bs});
        }
        e.shootTimer=600/dm(); break;
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  function update(dt) {
    updateStars(dt);
    updateShip(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updateEneBullets(dt);
    updatePowerups(dt);
    updateExplosions(dt);
    checkCollisions();
    checkWaveClear(dt);
    if(shieldTimer>0) shieldTimer-=dt;
    if(rapidTimer>0)  rapidTimer-=dt;
    if(multiTimer>0)  multiTimer-=dt;
  }

  function updateShip(dt) {
    const spd = SHIP_SPD * dt/16;

    // ↑↓ movimiento
    if(keysDown['ArrowUp']   ||keysDown['w']||keysDown['W']) ship.y-=spd;
    if(keysDown['ArrowDown'] ||keysDown['s']||keysDown['S']) ship.y+=spd;
    // ← → movimiento horizontal (novedad)
    if(keysDown['ArrowRight']||keysDown['d']||keysDown['D']) ship.x+=spd;
    if(keysDown['ArrowLeft'] ||keysDown['a']||keysDown['A']) ship.x-=spd;

    // Touch — seguir dedo en Y
    if(touchY!==null){
      const dy=touchY-(ship.y+ship.h/2);
      ship.y+=Math.sign(dy)*Math.min(Math.abs(dy),spd*2.5);
    }

    // Límites — no puede salir de pantalla, ni pasar de la mitad derecha
    ship.x=Math.max(2,Math.min(W/2-ship.w, ship.x));
    ship.y=Math.max(2,Math.min(H-ship.h-2, ship.y));

    // Animación de frames (alterna cada 120ms)
    ship.frameTimer+=dt;
    if(ship.frameTimer>120){ ship.frame=(ship.frame+1)%2; ship.frameTimer=0; }

    // Disparo
    ship.shootTimer-=dt;
    const cd=rapidTimer>0?SHOOT_CD*0.3:SHOOT_CD;
    if((keysDown[' ']||keysDown['z']||keysDown['Z']||shooting)&&ship.shootTimer<=0){
      doShoot(); ship.shootTimer=cd;
    }
  }

  function doShoot() {
    sfxShoot();
    // La bala sale desde la derecha de la llama (su boca/frente)
    const bx=ship.x+ship.w+2, by=ship.y+ship.h/2;
    bullets.push({x:bx, y:by-1, vx:7.5, vy:0});
    if(multiTimer>0){
      bullets.push({x:bx-4, y:by-6, vx:7,   vy:-0.6});
      bullets.push({x:bx-4, y:by+4, vx:7,   vy: 0.6});
    } else if(rapidTimer>0){
      bullets.push({x:bx,   y:by+4, vx:7.2, vy:0});
    }
  }

  function updateBullets(dt) {
    const s=dt/16;
    bullets.forEach(b=>{b.x+=b.vx*s; b.y+=(b.vy||0)*s;});
    bullets=bullets.filter(b=>b.x<W+10&&b.y>-10&&b.y<H+10);
  }

  function updateEnemies(dt) {
    enemies.forEach(e=>{
      if(e.isBoss){updateBoss(e,dt);return;}
      e.y+=e.dir*e.moveSpd*dt/1000;
      if(e.y<e.h+8||e.y>H-e.h-8) e.dir*=-1;
      e.x-=(8+nivel*1.6)*dm()*dt/1000;
      e.shootTimer-=dt;
      if(e.shootTimer<=0){
        eneBullets.push({x:e.x,y:e.y+e.h/2,vx:-(2+nivel*0.22)*dm(),vy:0});
        e.shootTimer=(900+Math.random()*900)/dm();
      }
      if(e.x<-5) fin();
    });
  }

  function updateEneBullets(dt) {
    const s=dt/16;
    eneBullets.forEach(b=>{b.x+=b.vx*s; b.y+=(b.vy||0)*s;});
    eneBullets=eneBullets.filter(b=>b.x>-10&&b.x<W+10&&b.y>-10&&b.y<H+10);
  }

  function updatePowerups(dt) {
    powerups.forEach(p=>p.x-=1.2*dt/16);
    powerups=powerups.filter(p=>p.x>-24);
  }

  function updateExplosions(dt) {
    explosions.forEach(e=>e.life-=dt);
    explosions=explosions.filter(e=>e.life>0);
  }

  function spawnExplosion(x,y,big) {
    const EXPL=['#ffdd00','#ff8800','#ff4400','#ff2200'];
    const n=big?14:6;
    for(let i=0;i<n;i++) explosions.push({
      x:x+(Math.random()-0.5)*(big?44:20), y:y+(Math.random()-0.5)*(big?44:20),
      r:big?4+Math.random()*7:2+Math.random()*4,
      life:200+Math.random()*380, maxLife:580,
      color:EXPL[Math.floor(Math.random()*EXPL.length)],
    });
  }

  // ── Colisiones ─────────────────────────────────────────────────────────────
  function overlap(ax,ay,aw,ah,bx,by,bw,bh){return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by;}

  function checkCollisions() {
    // Balas → enemigos
    bullets.forEach(b=>{
      enemies.forEach(e=>{
        if(e.hp<=0) return;
        if(!overlap(b.x-3,b.y-2,6,4,e.x,e.y,e.w,e.h)) return;
        b.x=W+200; e.hp--;
        e.isBoss?sfxBossHit():sfxHit();
        if(e.hp<=0){
          score+=e.pts; hud();
          spawnExplosion(e.x+e.w/2,e.y+e.h/2,e.isBoss);
          sfxExplode(); tryDropPowerup(e);
        }
      });
    });
    bullets=bullets.filter(b=>b.x<W+10);
    enemies=enemies.filter(e=>e.hp>0);

    const hasShield=shieldTimer>0&&shieldHits>0;
    if(hasShield){
      eneBullets.forEach(b=>{
        if(!overlap(b.x-5,b.y-5,10,10,ship.x-4,ship.y-4,ship.w+8,ship.h+8)) return;
        b.x=-200; shieldHits--; sfxHit();
        if(shieldHits<=0){shieldTimer=0;toast('🛡️ Escudo roto');}
      });
    } else if(shieldTimer<=0){
      eneBullets.forEach(b=>{
        if(!overlap(b.x-2,b.y-2,4,4,ship.x+4,ship.y+4,ship.w-8,ship.h-8)) return;
        b.x=-200; golpear();
      });
    }
    eneBullets=eneBullets.filter(b=>b.x>-10);

    enemies.forEach(e=>{
      if(!overlap(ship.x+4,ship.y+4,ship.w-8,ship.h-8,e.x,e.y,e.w,e.h)) return;
      spawnExplosion(e.x+e.w/2,e.y+e.h/2,false); e.hp=0;
      if(shieldTimer<=0) golpear();
    });
    enemies=enemies.filter(e=>e.hp>0);

    powerups.forEach(p=>{
      if(!overlap(p.x,p.y-8,20,20,ship.x,ship.y,ship.w,ship.h)) return;
      applyPowerup(p.tipo); p.x=-200;
    });
    powerups=powerups.filter(p=>p.x>-24);
  }

  function tryDropPowerup(e) {
    if(Math.random()>0.22) return;
    const pool=vidas<=2?['shield','rapid','multi','life']:['shield','rapid','multi'];
    powerups.push({x:e.x,y:e.y+e.h/2,tipo:pool[Math.floor(Math.random()*pool.length)]});
  }

  function applyPowerup(tipo) {
    sfxPowerup();
    if(tipo==='shield'){shieldTimer=8000;shieldHits=5;toast('🛡️ Escudo x5 golpes!');}
    if(tipo==='rapid') {rapidTimer=6000;             toast('⚡ Disparo rápido!');}
    if(tipo==='multi') {multiTimer=6000;             toast('🔫 Triple disparo!');}
    if(tipo==='life')  {vidas=Math.min(vidas+1,5);hud();toast('❤️ +1 vida!');}
  }

  function golpear() {
    sfxDamage();
    spawnExplosion(ship.x+ship.w/2,ship.y+ship.h/2,false);
    vidas--; hud();
    shieldTimer=1500; shieldHits=0;
    if(vidas<=0) setTimeout(fin,700);
  }

  function checkWaveClear(dt) {
    if(enemies.length===0&&!waveClearing){waveClearing=true;waveTimer=1400;}
    if(waveClearing){
      waveTimer-=dt;
      if(waveTimer<=0){
        const bonus=120*nivel; score+=bonus; nivel++; hud();
        sfxLevelUp(); toast('🌟 Oleada '+(nivel-1)+' completada! +'+bonus);
        bullets=[]; eneBullets=[]; powerups=[];
        spawnWave();
      }
    }
  }

  // ── Dibujo ─────────────────────────────────────────────────────────────────
  function draw() {
    if(!ctx) return;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#0a0a0a'; ctx.fillRect(0,0,W,H);

    // Estrellas
    stars.forEach(s=>{
      ctx.fillStyle=`rgba(255,255,255,${0.22+s.spd*0.18})`;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
    });

    // Powerups flotantes
    const icons={shield:'🛡️',rapid:'⚡',multi:'🔫',life:'❤️'};
    powerups.forEach(p=>{
      ctx.font='15px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(icons[p.tipo]||'★', p.x+10, p.y);
    });

    // Balas jugador
    bullets.forEach(b=>{
      const col=multiTimer>0?'#44ff88':(rapidTimer>0?'#ff44ff':'#ffdd00');
      ctx.fillStyle=col; ctx.fillRect(b.x-7,b.y-1.5,10,3);
      ctx.fillStyle='#ffffff66'; ctx.fillRect(b.x-5,b.y-0.5,6,1);
    });

    // Balas enemigas — como pequeños trozos de verdura 🥦
    eneBullets.forEach(b=>{
      ctx.fillStyle='#22aa4444'; ctx.beginPath(); ctx.arc(b.x,b.y,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#44dd55';   ctx.beginPath(); ctx.arc(b.x,b.y,3,0,Math.PI*2); ctx.fill();
    });

    // Enemigos
    enemies.forEach(e=>e.isBoss?drawBoss(e):drawEnemy(e));

    // Nave — llama Mordelón
    drawShip();

    // Explosiones
    explosions.forEach(e=>{
      ctx.globalAlpha=e.life/e.maxLife;
      ctx.fillStyle=e.color;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r*(1+(1-e.life/e.maxLife)*0.8),0,Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha=1;

    // HUD power-ups activos
    let hx=4;
    if(shieldTimer>0&&shieldHits>0){drawPuHud(hx,'🛡️',shieldTimer,8000,'#5599ff');hx+=42;}
    if(rapidTimer>0)               {drawPuHud(hx,'⚡',rapidTimer, 6000,'#ff44ff');hx+=42;}
    if(multiTimer>0)               {drawPuHud(hx,'🔫',multiTimer, 6000,'#44ff88');hx+=42;}

    if(estado==='pausa') drawOverlay('PAUSA','#3dbfb8');
    if(estado==='fin')   drawFin();
  }

  function drawPuHud(x,icon,timer,max,col){
    ctx.fillStyle='#11111188'; ctx.fillRect(x,2,38,10);
    ctx.fillStyle=col+'88';    ctx.fillRect(x,2,38*(timer/max),10);
    ctx.font='8px serif'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(icon,x+2,7);
  }

  function drawOverlay(text,color){
    ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle=color; ctx.font='bold 26px Righteous,cursive';
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(text,W/2,H/2);
  }

  function drawFin(){
    ctx.fillStyle='rgba(0,0,0,0.88)'; ctx.fillRect(0,0,W,H);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#ff4d4d'; ctx.font='bold 24px Righteous,cursive'; ctx.fillText('GAME OVER',W/2,H/2-52);
    ctx.fillStyle='#3dbfb8'; ctx.font='bold 15px Righteous,cursive'; ctx.fillText('Puntos: '+score,W/2,H/2-16);
    ctx.fillStyle='#d4831a'; ctx.font='13px Righteous,cursive';
    ctx.fillText('Récord: '+hiScore,W/2,H/2+6); ctx.fillText('Nivel: '+nivel,W/2,H/2+26);
    ctx.fillStyle='#555'; ctx.font='10px monospace'; ctx.fillText('Tocá Reiniciar para jugar de nuevo',W/2,H/2+56);
  }

  // ── Loop ───────────────────────────────────────────────────────────────────
  function loop(ts){
    if(estado!=='jugando') return;
    const dt=Math.min(ts-lastTs,80); lastTs=ts;
    update(dt); draw();
    loopId=requestAnimationFrame(loop);
  }

  function fin(){
    if(estado==='fin') return;
    estado='fin'; cancelAnimationFrame(loopId);
    if(score>hiScore){hiScore=score;localStorage.setItem('impactHiC',hiScore);if(typeof window.notificarRecordJuego==='function')window.notificarRecordJuego('impact',hiScore);}
    draw(); score=0; hud();
    if(typeof window.actualizarBarraRecompensa==='function') window.actualizarBarraRecompensa();
    setTimeout(function(){ if(typeof window.abrirLeaderboard==='function') window.abrirLeaderboard('impact', score); }, 1200);
  }

  function hud(){
    const u=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    u('impactScore',score); u('impactHi',hiScore);
    u('impactLives','❤️'.repeat(Math.max(vidas,0))); u('impactLevel',nivel);
  }
  let _tt=null;
  function toast(msg){
    if(typeof window.showToast==='function'){window.showToast(msg);return;}
    const el=document.getElementById('impactToast');
    if(!el) return;
    el.textContent=msg; el.style.opacity='1';
    clearTimeout(_tt); _tt=setTimeout(()=>{if(el)el.style.opacity='0';},2200);
  }

  function onKD(e){
    if(estado!=='jugando') return;
    keysDown[e.key]=true;
    if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
  }
  function onKU(e){ delete keysDown[e.key]; }

  // ── API pública ────────────────────────────────────────────────────────────
  window.setImpactDificultad = v => { impactDificultad=Math.max(0,Math.min(4,v)); };
  window.impactShoot         = () => { if(estado==='jugando') doShoot(); };
  window.impactMoverArriba   = () => { if(estado==='jugando') ship.y=Math.max(2,ship.y-16); };
  window.impactMoverAbajo    = () => { if(estado==='jugando') ship.y=Math.min(H-ship.h-2,ship.y+16); };

  window.impactPause = () => {
    if(estado==='jugando')    {estado='pausa';cancelAnimationFrame(loopId);draw();}
    else if(estado==='pausa') {estado='jugando';lastTs=performance.now();loopId=requestAnimationFrame(loop);}
    const btn=document.getElementById('btnImpactPausa');
    if(btn) btn.textContent=estado==='pausa'?'▶ Reanudar':'⏸ Pausa';
  };

  window.impactReset = () => {
    cancelAnimationFrame(loopId);
    keysDown={}; touchY=null; shooting=false;
    score=0; vidas=3; nivel=1;
    shieldTimer=0; rapidTimer=0; multiTimer=0; shieldHits=0;
    bullets=[]; eneBullets=[]; enemies=[]; explosions=[]; powerups=[];
    ship={x:28,y:H/2-16,w:28,h:32,vx:0,vy:0,shootTimer:0,frame:0,frameTimer:0};
    estado='jugando'; initStars(); spawnWave(); hud();
    const btnP=document.getElementById('btnImpactPausa');
    if(btnP) btnP.textContent='⏸ Pausa';
    lastTs=performance.now(); loopId=requestAnimationFrame(loop);
  };

  window.impactInit = () => {
    canvas=document.getElementById('impactCanvas');
    if(!canvas){console.error('[impactInit] #impactCanvas no encontrado');return;}
    ctx=canvas.getContext('2d');
    hiScore=parseInt(localStorage.getItem('impactHiC')||'0');

    document.removeEventListener('keydown',onKD);
    document.removeEventListener('keyup',onKU);
    document.addEventListener('keydown',onKD);
    document.addEventListener('keyup',onKU);

    // Touch — deslizar canvas para mover en Y
    canvas.addEventListener('touchmove',e=>{
      e.preventDefault();
      const rect=canvas.getBoundingClientRect();
      touchY=(e.touches[0].clientY-rect.top)*(H/rect.height);
    },{passive:false});
    canvas.addEventListener('touchstart',e=>{
      e.preventDefault(); shooting=true;
      const rect=canvas.getBoundingClientRect();
      touchY=(e.touches[0].clientY-rect.top)*(H/rect.height);
    },{passive:false});
    canvas.addEventListener('touchend',()=>{shooting=false;touchY=null;});

    window.impactReset();
  };

  Object.defineProperty(window,'impactRunning',{get:()=>estado==='jugando',configurable:true,enumerable:true});

})();
