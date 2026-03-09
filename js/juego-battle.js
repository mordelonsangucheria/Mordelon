// ===================== MORDELÓN BATTLE CITY =====================
(function () {

  const W = 320, H = 240;
  const TILE = 16;
  const COLS = W / TILE; // 20
  const ROWS = H / TILE; // 15

  const T_EMPTY=0, T_BRICK=1, T_STEEL=2, T_BASE=3, T_BUSH=4;
  const FL_T='#3DBFB8',FL_L='#7EEEE9',FL_D='#1A8C87',FL_W='#FFFFFF',FL_E='#0a1a1a',FL_S='#B2F5F2';

  let canvas,ctx,audioCtx;
  let estado='parado';
  let score=0,hiScore=0,vidas=3,nivel=1;
  let loopId=null,lastTs=0;
  let battleDificultad=1;
  let baseViva=true;

  let mapa=[];
  let player={};
  let enemies=[];
  let pBullet=null;
  let eBullets=[];
  let explosions=[];
  let powerups=[];
  let particles=[];
  let spawnQueue=[],spawnTimer=0;
  let waveClearing=false,waveTimer=0;
  let shieldTimer=0,rapidTimer=0,helmetTimer=0;

  // Estado de la base (0=ladrillo, 1=acero temporal, cicla cada refuerzo)
  let baseArmor=0;      // 0=ladrillo 1=acero
  let baseArmorTimer=0; // tiempo restante de acero (ms)
  let keysDown={};

  // ── Audio ─────────────────────────────────────────────────────────────────
  function getAC(){if(!audioCtx)try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){}return audioCtx;}
  function tone(freq,type,dur,vol,f0){
    const ac=getAC();if(!ac)return;
    try{
      const o=ac.createOscillator(),g=ac.createGain();
      o.connect(g);g.connect(ac.destination);o.type=type||'square';
      o.frequency.setValueAtTime(f0||freq,ac.currentTime);
      if(f0)o.frequency.exponentialRampToValueAtTime(freq,ac.currentTime+dur);
      g.gain.setValueAtTime(vol||0.09,ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+dur);
      o.start();o.stop(ac.currentTime+dur);
    }catch(e){}
  }
  const sfxShoot  =()=>tone(700,'square',  0.07,0.08);
  const sfxHit    =()=>tone(180,'sawtooth',0.10,0.11,360);
  const sfxExplode=()=>tone(70, 'sawtooth',0.22,0.14,260);
  const sfxBrick  =()=>tone(320,'square',  0.05,0.07);
  const sfxPowerup=()=>tone(660,'sine',    0.28,0.11,440);
  const sfxDamage =()=>tone(120,'sawtooth',0.22,0.17,210);
  const sfxBase   =()=>{tone(80,'sawtooth',0.4,0.2,200);setTimeout(()=>tone(55,'sawtooth',0.5,0.18),250);};
  const sfxLevelUp=()=>[523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,'sine',0.15,0.10),i*80));

  // ── Constantes de mapa ────────────────────────────────────────────────────
  const BASE_COL=Math.floor(COLS/2)-1; // col 9  → x=144
  const BASE_ROW=ROWS-3;               // fila 12 → y=192

  // Zona libre para el jugador (cols 7-12, filas 10-13)
  function isPlayerZone(r,c){
    // Zona amplia libre para el jugador: cols 6-13, filas 9-13
    return r>=BASE_ROW-3 && r<=BASE_ROW &&
           c>=BASE_COL-3 && c<=BASE_COL+4;
  }

  // ── Mapa ──────────────────────────────────────────────────────────────────
  function generateMap(lv){
    mapa=Array.from({length:ROWS},()=>Array(COLS).fill(T_EMPTY));

    // Bordes de acero
    for(let c=0;c<COLS;c++){mapa[0][c]=T_STEEL;mapa[ROWS-1][c]=T_STEEL;}
    for(let r=0;r<ROWS;r++){mapa[r][0]=T_STEEL;mapa[r][COLS-1]=T_STEEL;}

    // Base (2 tiles)
    mapa[BASE_ROW][BASE_COL]=T_BASE;
    mapa[BASE_ROW][BASE_COL+1]=T_BASE;

    // Ladrillos protectores — U alrededor de la base
    // Fila directamente encima
    for(let c=BASE_COL-1;c<=BASE_COL+2;c++)
      if(c>0&&c<COLS-1) mapa[BASE_ROW-1][c]=T_BRICK;
    // Lados de la base
    mapa[BASE_ROW][BASE_COL-1]=T_BRICK;
    mapa[BASE_ROW][BASE_COL+2]=T_BRICK;

    // Obstáculos aleatorios — respetan zona player Y zona spawn
    const density=Math.min(0.14+lv*0.010,0.22);
    for(let r=3;r<ROWS-2;r++){
      for(let c=1;c<COLS-1;c++){
        if(mapa[r][c]!==T_EMPTY) continue;
        if(isPlayerZone(r,c)) continue;  // zona libre jugador
        if(r<=2) continue;               // zona spawn enemigos
        if(Math.random()<density){
          const t=Math.random()<0.10?T_STEEL:T_BRICK;
          mapa[r][c]=t;
          // Bloques 2×1 horizontales
          if(c+1<COLS-1&&!isPlayerZone(r,c+1)&&Math.random()<0.5)
            mapa[r][c+1]=t;
        }
      }
    }

    // Arbustos decorativos
    for(let i=0;i<6;i++){
      const r=3+Math.floor(Math.random()*(ROWS-7));
      const c=1+Math.floor(Math.random()*(COLS-2));
      if(mapa[r][c]===T_EMPTY&&!isPlayerZone(r,c)) mapa[r][c]=T_BUSH;
    }
  }

  // ── Colisión con mapa ─────────────────────────────────────────────────────
  function tileAt(r,c){
    if(r<0||r>=ROWS||c<0||c>=COLS) return T_STEEL;
    return mapa[r][c];
  }

  // Verifica si el rectángulo (x,y,w,h) puede existir sin pisar tiles sólidos
  function canMoveTo(x,y,w,h){
    // Margen de 3px en cada lado para hitbox más permisiva
    const M=3;
    const r0=Math.floor((y+M)/TILE),   r1=Math.floor((y+h-M-1)/TILE);
    const c0=Math.floor((x+M)/TILE),   c1=Math.floor((x+w-M-1)/TILE);
    for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++){
      const t=tileAt(r,c);
      if(t!==T_EMPTY&&t!==T_BUSH) return false;
    }
    return true;
  }

  function bulletHitMap(bx,by){
    const r=Math.floor(by/TILE),c=Math.floor(bx/TILE);
    const t=tileAt(r,c);
    if(t===T_BRICK){
      mapa[r][c]=T_EMPTY; sfxBrick();
      spawnParticles(c*TILE+8,r*TILE+8,'#cc5500',5);
      return true;
    }
    if(t===T_STEEL){sfxBrick();return true;}
    if(t===T_BASE&&baseViva){
      baseViva=false; mapa[r][c]=T_EMPTY; sfxBase();
      spawnParticles(c*TILE+8,r*TILE+8,'#3dbfb8',14);
      spawnExplosion(c*TILE+TILE,r*TILE+TILE,true);
      setTimeout(finJuego,1400);
      return true;
    }
    return t!==T_EMPTY&&t!==T_BUSH;
  }

  // ── Player init ───────────────────────────────────────────────────────────
  function initPlayer(){
    // Player spawnea en fila BASE_ROW-3 (arriba del muro protector)
    // Solo limpiar la celda exacta del spawn
    const pr=BASE_ROW-3, pc=BASE_COL;
    for(let r=pr;r<=pr+1;r++)
      for(let c=pc;c<=pc+1;c++)
        if(mapa[r]&&mapa[r][c]!==T_BASE) mapa[r][c]=T_EMPTY;
    player={
      x:BASE_COL*TILE,
      y:(BASE_ROW-3)*TILE,
      w:TILE*2,h:TILE*2,dir:'up',spd:1.6,shootTimer:0,frame:0,frameTimer:0
    };
    helmetTimer=3000;
  }

  function dm(){return[0.6,1.0,1.4,1.8,2.3][battleDificultad];}

  // ── Wave ──────────────────────────────────────────────────────────────────
  function setupWave(){
    enemies=[];eBullets=[];powerups=[];particles=[];
    waveClearing=false;
    const count=Math.min(3+nivel*2,20);
    spawnQueue=Array.from({length:count},(_,i)=>({
      tipo:Math.floor(Math.random()*5),
      hp:Math.ceil((1+Math.floor(nivel/4))*dm()),
      col:[2,10,17][i%3],
    }));
    spawnTimer=800;
  }

  function trySpawnEnemy(){
    if(spawnQueue.length===0)return;
    const e=spawnQueue[0];
    const sx=e.col*TILE,sy=TILE+1;
    if(enemies.some(en=>Math.abs(en.x-sx)<TILE*2&&en.y<TILE*4)){spawnTimer=600;return;}
    spawnQueue.shift();
    tone(440,'sine',0.12,0.08,220);
    spawnParticles(sx+TILE,sy+TILE,'#ffdd00',6);
    enemies.push({
      x:sx,y:sy,w:TILE*2,h:TILE*2,
      tipo:e.tipo,hp:e.hp,maxHp:e.hp,
      dir:'down',spd:(0.55+nivel*0.06)*dm(),
      shootTimer:(1500+Math.random()*800)/dm(),
      dirTimer:800+Math.random()*600,
      frame:0,frameTimer:0,flashTimer:0,
      pts:(e.tipo+1)*20,
    });
    spawnTimer=Math.max(2000/dm(),1000);
  }

  // ── Update ────────────────────────────────────────────────────────────────
  function update(dt){
    if(!baseViva)return;
    updatePlayer(dt);updateEnemies(dt);updateBullets(dt);
    updateExplosions(dt);updateParticles(dt);updatePowerups(dt);
    checkCollisions();checkWaveClear(dt);
    if(shieldTimer>0)shieldTimer-=dt;
    if(rapidTimer>0) rapidTimer-=dt;
    if(helmetTimer>0)helmetTimer-=dt;
    if(baseArmorTimer>0){
      baseArmorTimer-=dt;
      if(baseArmorTimer<=0) degradeBaseArmor();
    }
    if(spawnQueue.length>0){spawnTimer-=dt;if(spawnTimer<=0)trySpawnEnemy();}
  }

  function moveEntity(ent,dx,dy){
    // Mover en pasos pequeños para evitar atravesar paredes
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))));
    const sx=dx/steps,sy=dy/steps;
    for(let i=0;i<steps;i++){
      if(sx!==0&&canMoveTo(ent.x+sx,ent.y,ent.w,ent.h)) ent.x+=sx;
      if(sy!==0&&canMoveTo(ent.x,ent.y+sy,ent.w,ent.h)) ent.y+=sy;
    }
    ent.x=Math.max(TILE,Math.min(W-TILE-ent.w,ent.x));
    ent.y=Math.max(TILE,Math.min(H-TILE-ent.h,ent.y));
  }

  function updatePlayer(dt){
    player.frameTimer+=dt;
    if(player.frameTimer>130){player.frame=(player.frame+1)%2;player.frameTimer=0;}

    const spd=player.spd*dt/16;
    const up   =keysDown['ArrowUp']   ||keysDown['w']||keysDown['W'];
    const down =keysDown['ArrowDown'] ||keysDown['s']||keysDown['S'];
    const left =keysDown['ArrowLeft'] ||keysDown['a']||keysDown['A'];
    const right=keysDown['ArrowRight']||keysDown['d']||keysDown['D'];

    // Dirección de disparo = última dirección presionada (guarda en player.dir)
    if(up&&right)    {player.dir='upright';  moveEntity(player, spd,-spd);}
    else if(up&&left){player.dir='upleft';   moveEntity(player,-spd,-spd);}
    else if(down&&right){player.dir='downright';moveEntity(player,spd,spd);}
    else if(down&&left) {player.dir='downleft'; moveEntity(player,-spd,spd);}
    else if(up)         {player.dir='up';        moveEntity(player,0,-spd);}
    else if(down)       {player.dir='down';      moveEntity(player,0,spd);}
    else if(left)       {player.dir='left';      moveEntity(player,-spd,0);}
    else if(right)      {player.dir='right';     moveEntity(player,spd,0);}

    player.shootTimer-=dt;
    const cd=rapidTimer>0?180:420;
    if((keysDown[' ']||keysDown['z']||keysDown['Z'])&&player.shootTimer<=0&&!pBullet){
      shootPlayer();player.shootTimer=cd;
    }
  }

  function shootPlayer(){
    sfxShoot();
    const cx=player.x+player.w/2,cy=player.y+player.h/2,v=5.5;
    const s=v*0.707; // diagonal normalizada
    const dirs={
      up:{vx:0,vy:-v},down:{vx:0,vy:v},left:{vx:-v,vy:0},right:{vx:v,vy:0},
      upleft:{vx:-s,vy:-s},upright:{vx:s,vy:-s},
      downleft:{vx:-s,vy:s},downright:{vx:s,vy:s},
    };
    const d=dirs[player.dir]||dirs['up'];
    pBullet={x:cx,y:cy,vx:d.vx,vy:d.vy};
  }

  function updateEnemies(dt){
    enemies.forEach(e=>{
      e.frameTimer=(e.frameTimer||0)+dt;
      if(e.frameTimer>200){e.frame=(e.frame+1)%2;e.frameTimer=0;}
      if(e.flashTimer>0)e.flashTimer-=dt;

      e.dirTimer-=dt;
      if(e.dirTimer<=0){
        // Preferir ir hacia abajo (hacia la base)
        const pool=['down','down','down','left','right'];
        if(e.x<TILE*4)  pool.push('right','right');
        if(e.x>W-TILE*6)pool.push('left','left');
        if(e.y>H/2)     pool.push('up');
        e.dir=pool[Math.floor(Math.random()*pool.length)];
        e.dirTimer=600+Math.random()*700;
      }

      const spd=e.spd*dt/16;
      const dx={up:0,down:0,left:-spd,right:spd}[e.dir];
      const dy={up:-spd,down:spd,left:0,right:0}[e.dir];
      const oldX=e.x,oldY=e.y;
      moveEntity(e,dx,dy);

      // Si no se movió, cambiar dirección
      if(Math.abs(e.x-oldX)<0.01&&Math.abs(e.y-oldY)<0.01){
        const alts=['down','left','right','up'];
        e.dir=alts[Math.floor(Math.random()*alts.length)];
        e.dirTimer=300;
      }

      e.shootTimer-=dt;
      if(e.shootTimer<=0){shootEnemy(e);e.shootTimer=(1300+Math.random()*900)/dm();}
    });
  }

  function shootEnemy(e){
    const cx=e.x+e.w/2,cy=e.y+e.h/2,v=(2.0+nivel*0.12)*dm();
    // Apuntar a jugador o base
    const target=Math.random()<0.45
      ?{x:player.x+player.w/2,y:player.y+player.h/2}
      :{x:BASE_COL*TILE+TILE,y:BASE_ROW*TILE};
    const ang=Math.atan2(target.y-cy,target.x-cx);
    // Snap al eje más cercano (estilo Battle City)
    const snap=Math.abs(Math.cos(ang))>Math.abs(Math.sin(ang))
      ?{vx:Math.sign(Math.cos(ang))*v,vy:0}
      :{vx:0,vy:Math.sign(Math.sin(ang))*v};
    eBullets.push({x:cx,y:cy,vx:snap.vx,vy:snap.vy});
  }

  function updateBullets(dt){
    const s=dt/16;
    if(pBullet){
      pBullet.x+=pBullet.vx*s; pBullet.y+=pBullet.vy*s;
      if(bulletHitMap(pBullet.x,pBullet.y)){
        spawnParticles(pBullet.x,pBullet.y,'#ffdd00',4); pBullet=null;
      } else if(pBullet&&(pBullet.x<0||pBullet.x>W||pBullet.y<0||pBullet.y>H)){
        pBullet=null;
      }
    }
    eBullets.forEach(b=>{b.x+=b.vx*s;b.y+=b.vy*s;});
    eBullets=eBullets.filter(b=>{
      if(b.x<0||b.x>W||b.y<0||b.y>H)return false;
      if(bulletHitMap(b.x,b.y)){spawnParticles(b.x,b.y,'#ff4444',3);return false;}
      return true;
    });
  }

  function updateExplosions(dt){explosions.forEach(e=>e.life-=dt);explosions=explosions.filter(e=>e.life>0);}
  function updateParticles(dt){
    particles.forEach(p=>{p.x+=p.vx*dt/16;p.y+=p.vy*dt/16;p.vy+=0.12;p.life-=dt;});
    particles=particles.filter(p=>p.life>0);
  }
  function updatePowerups(dt){powerups.forEach(p=>p.timer-=dt);powerups=powerups.filter(p=>p.timer>0);}

  function spawnExplosion(x,y,big){
    const C=['#ffdd00','#ff8800','#ff4400','#ff2200'],n=big?14:6;
    for(let i=0;i<n;i++) explosions.push({
      x:x+(Math.random()-.5)*(big?48:20),y:y+(Math.random()-.5)*(big?48:20),
      r:big?4+Math.random()*8:2+Math.random()*4,
      life:200+Math.random()*400,maxLife:600,
      color:C[Math.floor(Math.random()*C.length)],
    });
  }
  function spawnParticles(x,y,col,n){
    for(let i=0;i<n;i++) particles.push({
      x,y,vx:(Math.random()-.5)*3,vy:-1-Math.random()*2,
      life:300+Math.random()*300,maxLife:600,color:col,r:1+Math.random()*2,
    });
  }

  // ── Colisiones ────────────────────────────────────────────────────────────
  function overlap(ax,ay,aw,ah,bx,by,bw,bh){return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by;}

  function checkCollisions(){
    // Bala jugador vs balas enemigas (intercepción)
    if(pBullet){
      for(let i=eBullets.length-1;i>=0;i--){
        const b=eBullets[i];
        if(Math.abs(pBullet.x-b.x)<6&&Math.abs(pBullet.y-b.y)<6){
          spawnParticles(pBullet.x,pBullet.y,'#ffaa00',4);
          eBullets.splice(i,1); pBullet=null; break;
        }
      }
    }

    // Bala jugador vs enemigos
    if(pBullet){
      for(let i=enemies.length-1;i>=0;i--){
        const e=enemies[i];
        if(!overlap(pBullet.x-3,pBullet.y-3,6,6,e.x+2,e.y+2,e.w-4,e.h-4))continue;
        e.hp--;e.flashTimer=200;sfxHit();
        spawnParticles(pBullet.x,pBullet.y,'#ffdd00',5);pBullet=null;
        if(e.hp<=0){
          score+=e.pts;hud();
          spawnExplosion(e.x+e.w/2,e.y+e.h/2,false);sfxExplode();
          tryDropPowerup(e);enemies.splice(i,1);
        }
        break;
      }
    }

    // Balas enemigas vs jugador
    const invul=helmetTimer>0||shieldTimer>0;
    eBullets=eBullets.filter(b=>{
      if(!overlap(b.x-3,b.y-3,6,6,player.x+3,player.y+3,player.w-6,player.h-6))return true;
      if(invul){spawnParticles(b.x,b.y,'#5599ff',4);return false;}
      golpear();return false;
    });

    // Contacto directo enemigo vs jugador (solo si no invul)
    if(!invul){
      for(const e of enemies){
        if(overlap(player.x+3,player.y+3,player.w-6,player.h-6,e.x+2,e.y+2,e.w-4,e.h-4)){
          golpear();break;
        }
      }
    }

    // Powerups
    powerups=powerups.filter(p=>{
      if(!overlap(p.x,p.y,TILE*2,TILE*2,player.x,player.y,player.w,player.h))return true;
      applyPowerup(p.tipo);return false;
    });
  }

  // ── Armor de la base ──────────────────────────────────────────────────────
  function setBaseWall(tileType, duration){
    // Reemplazar muros de la base con el tipo dado
    const positions=[
      [BASE_ROW-1,BASE_COL-1],[BASE_ROW-1,BASE_COL],[BASE_ROW-1,BASE_COL+1],[BASE_ROW-1,BASE_COL+2],
      [BASE_ROW,BASE_COL-1],[BASE_ROW,BASE_COL+2],
    ];
    for(const[r,c] of positions)
      if(mapa[r]&&mapa[r][c]!==T_BASE&&mapa[r][c]!==T_EMPTY)
        mapa[r][c]=tileType;
    if(duration){
      baseArmor=1;
      baseArmorTimer=duration;
    } else {
      baseArmor=0;
      baseArmorTimer=0;
    }
  }

  function fortifyBase(){
    // Reconstruir + convertir a acero temporal
    const positions=[
      [BASE_ROW-1,BASE_COL-1],[BASE_ROW-1,BASE_COL],[BASE_ROW-1,BASE_COL+1],[BASE_ROW-1,BASE_COL+2],
      [BASE_ROW,BASE_COL-1],[BASE_ROW,BASE_COL+2],
    ];
    for(const[r,c] of positions)
      if(mapa[r]&&mapa[r][c]!==T_BASE) mapa[r][c]=T_STEEL;
    baseArmor=1;
    baseArmorTimer=12000; // 12 segundos de acero
    toast('🏰 Base BLINDADA (12s)!');
  }

  function repairBase(){
    // Reparar ladrillos rotos alrededor de la base
    const positions=[
      [BASE_ROW-1,BASE_COL-1],[BASE_ROW-1,BASE_COL],[BASE_ROW-1,BASE_COL+1],[BASE_ROW-1,BASE_COL+2],
      [BASE_ROW,BASE_COL-1],[BASE_ROW,BASE_COL+2],
    ];
    for(const[r,c] of positions)
      if(mapa[r]&&mapa[r][c]===T_EMPTY) mapa[r][c]=T_BRICK;
    toast('🧱 Base reparada!');
  }

  function degradeBaseArmor(){
    // El acero vence → vuelve a ladrillo
    const positions=[
      [BASE_ROW-1,BASE_COL-1],[BASE_ROW-1,BASE_COL],[BASE_ROW-1,BASE_COL+1],[BASE_ROW-1,BASE_COL+2],
      [BASE_ROW,BASE_COL-1],[BASE_ROW,BASE_COL+2],
    ];
    for(const[r,c] of positions)
      if(mapa[r]&&mapa[r][c]===T_STEEL) mapa[r][c]=T_BRICK;
    baseArmor=0; baseArmorTimer=0;
    toast('⚠️ Blindaje vencido!');
  }

  function tryDropPowerup(e){
    if(Math.random()>0.32)return;
    // Pesos: base-repair y base-armor más frecuentes si base está vulnerable
    const pool=['shield','rapid','helmet','life','base-repair','base-armor','gun-upgrade'];
    // Doble probabilidad de power-ups de base si hay huecos en la muralla
    const needsRepair=checkBaseNeedsRepair();
    if(needsRepair){pool.push('base-repair','base-repair','base-armor');}
    if(vidas<=2){pool.push('life','life');}
    powerups.push({x:e.x,y:e.y,tipo:pool[Math.floor(Math.random()*pool.length)],timer:9000});
    sfxPowerup();
  }

  function checkBaseNeedsRepair(){
    const positions=[
      [BASE_ROW-1,BASE_COL-1],[BASE_ROW-1,BASE_COL],[BASE_ROW-1,BASE_COL+1],[BASE_ROW-1,BASE_COL+2],
      [BASE_ROW,BASE_COL-1],[BASE_ROW,BASE_COL+2],
    ];
    return positions.some(([r,c])=>mapa[r]&&mapa[r][c]===T_EMPTY);
  }
  function applyPowerup(tipo){
    sfxPowerup();
    if(tipo==='shield')      {shieldTimer=8000;  toast('🛡️ Escudo 8s!');}
    if(tipo==='rapid')       {rapidTimer=7000;   toast('⚡ Disparo rápido 7s!');}
    if(tipo==='helmet')      {helmetTimer=6000;  toast('🪖 Invulnerable 6s!');}
    if(tipo==='life')        {vidas=Math.min(vidas+1,5);hud();toast('❤️ +1 vida!');}
    if(tipo==='base-repair') {repairBase();}
    if(tipo==='base-armor')  {fortifyBase();}
    if(tipo==='gun-upgrade') {rapidTimer=Math.max(rapidTimer,0)+5000;toast('🔫 Cañón potenciado!');}
  }
  function golpear(){
    sfxDamage();spawnExplosion(player.x+player.w/2,player.y+player.h/2,false);
    vidas--;hud();helmetTimer=2200;
    if(vidas<=0)setTimeout(finJuego,900);
  }

  function checkWaveClear(dt){
    if(enemies.length===0&&spawnQueue.length===0&&!waveClearing){waveClearing=true;waveTimer=1600;}
    if(waveClearing){
      waveTimer-=dt;
      if(waveTimer<=0){
        const bonus=200*nivel;score+=bonus;nivel++;hud();
        sfxLevelUp();toast('🌟 Oleada '+(nivel-1)+' completada! +'+bonus);
        pBullet=null;eBullets=[];
        generateMap(nivel);initPlayer();setupWave();
      }
    }
  }

  function finJuego(){
    if(estado==='fin')return;
    estado='fin';cancelAnimationFrame(loopId);
    if(score>hiScore){hiScore=score;localStorage.setItem('battleHiC',hiScore);if(typeof window.notificarRecordJuego==='function')window.notificarRecordJuego('battle',hiScore);}
    draw();hud();
    if(typeof window.actualizarBarraRecompensa==='function')window.actualizarBarraRecompensa();
    setTimeout(function(){ if(typeof window.abrirLeaderboard==='function') window.abrirLeaderboard('battle', score); }, 1200);
  }

  // ── Dibujo ────────────────────────────────────────────────────────────────
  function draw(){
    if(!ctx)return;
    ctx.fillStyle='#1a1a1a';ctx.fillRect(0,0,W,H);
    drawMap();
    powerups.forEach(p=>drawPowerup(p));
    if(pBullet)drawBullet(pBullet,true);
    eBullets.forEach(b=>drawBullet(b,false));
    enemies.forEach(e=>drawEnemy(e));
    drawPlayer();
    particles.forEach(p=>{ctx.globalAlpha=p.life/p.maxLife;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();});
    ctx.globalAlpha=1;
    explosions.forEach(ex=>{ctx.globalAlpha=ex.life/ex.maxLife;ctx.fillStyle=ex.color;ctx.beginPath();ctx.arc(ex.x,ex.y,ex.r*(1+(1-ex.life/ex.maxLife)),0,Math.PI*2);ctx.fill();});
    ctx.globalAlpha=1;
    drawHUD();
    if(estado==='pausa')drawOverlay('PAUSA','#3dbfb8');
    if(estado==='fin')  drawFin();
  }

  function drawMap(){
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const t=mapa[r][c];if(t===T_EMPTY)continue;
      const x=c*TILE,y=r*TILE;
      if(t===T_STEEL){
        ctx.fillStyle='#4a4a4a';ctx.fillRect(x,y,TILE,TILE);
        ctx.fillStyle='#686868';ctx.fillRect(x+1,y+1,TILE-2,4);ctx.fillRect(x+1,y+1,4,TILE-2);
        ctx.fillStyle='#2a2a2a';ctx.fillRect(x,y+TILE-2,TILE,2);ctx.fillRect(x+TILE-2,y,2,TILE);
      }else if(t===T_BRICK){
        ctx.fillStyle='#882200';ctx.fillRect(x,y,TILE,TILE);
        ctx.fillStyle='#bb3311';
        ctx.fillRect(x+1,y+1,6,6);ctx.fillRect(x+9,y+1,6,6);
        ctx.fillRect(x+1,y+9,6,6);ctx.fillRect(x+9,y+9,6,6);
        ctx.fillStyle='#661100';
        ctx.fillRect(x,y+7,TILE,2);ctx.fillRect(x+7,y,2,7);ctx.fillRect(x+7,y+9,2,7);
      }else if(t===T_BASE){
        if(baseViva){
          ctx.fillStyle='#1a4a4a';ctx.fillRect(x,y,TILE,TILE);
          ctx.fillStyle=FL_T;ctx.fillRect(x+3,y+2,10,12);
          ctx.fillStyle=FL_L;ctx.fillRect(x+5,y+2,6,5);
          ctx.fillStyle=FL_W;ctx.fillRect(x+4,y+7,3,3);ctx.fillRect(x+9,y+7,3,3);
          ctx.fillStyle=FL_E;ctx.fillRect(x+5,y+8,2,2);ctx.fillRect(x+10,y+8,2,2);
          ctx.strokeStyle='#3dbfb8cc';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,TILE-1,TILE-1);
        }else{
          ctx.fillStyle='#2a1000';ctx.fillRect(x,y,TILE,TILE);
          ctx.fillStyle='#553300';
          ctx.fillRect(x+2,y+2,4,4);ctx.fillRect(x+10,y+8,4,4);ctx.fillRect(x+6,y+5,4,4);
        }
      }else if(t===T_BUSH){
        ctx.fillStyle='#163a1c';ctx.fillRect(x,y,TILE,TILE);
        ctx.fillStyle='#1e5a28';ctx.beginPath();ctx.arc(x+8,y+8,6,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#2d7a3a';
        ctx.beginPath();ctx.arc(x+5,y+6,3,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(x+11,y+10,3,0,Math.PI*2);ctx.fill();
      }
    }
  }

  function drawBullet(b,fromPlayer){
    ctx.fillStyle=fromPlayer?'#ffee00':'#ff5050';ctx.fillRect(b.x-2,b.y-2,4,4);
    ctx.fillStyle=fromPlayer?'#ffffff66':'#ff000055';ctx.fillRect(b.x-1,b.y-1,2,2);
  }

  function drawPowerup(p){
    if(Math.floor(Date.now()/350)%2===0)return;
    const icons={shield:'🛡️',rapid:'⚡',helmet:'🪖',life:'❤️','base-repair':'🧱','base-armor':'🏰','gun-upgrade':'🔫'};
    ctx.fillStyle='#111';ctx.fillRect(p.x,p.y,TILE*2,TILE*2);
    ctx.strokeStyle='#ffdd00';ctx.lineWidth=1.5;ctx.strokeRect(p.x+1,p.y+1,TILE*2-2,TILE*2-2);
    ctx.font='18px serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(icons[p.tipo]||'★',p.x+TILE,p.y+TILE);
  }

  // ── Llama Mordelón ────────────────────────────────────────────────────────
  function drawPlayer(){
    const invul=helmetTimer>0;
    if(invul&&Math.floor(Date.now()/80)%2===0)return;
    ctx.save();
    const cx=player.x+player.w/2,cy=player.y+player.h/2;
    ctx.translate(cx,cy);
    const rotMap={up:0,right:Math.PI/2,down:Math.PI,left:-Math.PI/2,
      upright:Math.PI/4,downright:3*Math.PI/4,downleft:-3*Math.PI/4,upleft:-Math.PI/4};
    ctx.rotate(rotMap[player.dir]||0);
    // Centrar el sprite (32px aprox) en el tile 2×2 (32px)
    ctx.translate(-16,-16);
    if(player.frame===0)drawLlamaRun1(ctx,0,0);
    else                 drawLlamaRun2(ctx,0,0);
    ctx.restore();
    if(shieldTimer>0){
      ctx.strokeStyle='#5599ffcc';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(cx,cy,player.w/2+5,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#5599ff12';ctx.fill();
    }
  }

  function drawLlamaRun1(cx,px0,py0){
    const p=(c,x,y,w,h)=>{cx.fillStyle=c;cx.fillRect(px0+x,py0+y,w,h);};
    p(FL_S,20,0,3,3);p(FL_S,2,6,3,3);p(FL_S,28,10,3,3);
    p(FL_L,12,2,6,4);p(FL_T,10,4,10,6);p(FL_L,8,6,4,4);p(FL_L,16,6,6,4);
    p(FL_T,6,10,18,14);p(FL_L,8,10,6,6);p(FL_L,18,12,6,4);
    p(FL_D,6,16,4,8);p(FL_D,22,14,4,10);
    p(FL_W,8,14,7,7);p(FL_W,17,15,7,7);
    p(FL_E,10,16,3,3);p(FL_E,19,16,3,3);
    p(FL_L,9,22,12,4);
    p(FL_T,8,24,5,6);p(FL_D,8,28,5,3);
    p(FL_D,18,24,5,3);p(FL_T,18,24,5,5);
    p(FL_S,4,28,2,2);p(FL_S,24,30,2,2);
  }
  function drawLlamaRun2(cx,px0,py0){
    const p=(c,x,y,w,h)=>{cx.fillStyle=c;cx.fillRect(px0+x,py0+y,w,h);};
    p(FL_S,2,4,3,3);p(FL_S,26,8,3,3);p(FL_S,18,0,2,2);
    p(FL_L,10,2,8,4);p(FL_T,8,4,12,8);p(FL_L,6,8,5,5);p(FL_L,18,6,6,4);
    p(FL_T,5,12,20,12);p(FL_L,7,12,7,6);p(FL_L,17,14,6,4);
    p(FL_D,5,18,4,6);p(FL_D,22,16,4,8);
    p(FL_W,8,14,7,7);p(FL_W,17,15,7,7);
    p(FL_E,10,16,3,3);p(FL_E,19,16,3,3);
    p(FL_L,9,22,12,4);
    p(FL_D,8,24,5,3);p(FL_T,8,24,5,5);
    p(FL_T,18,24,5,6);p(FL_D,18,28,5,3);
    p(FL_S,6,30,2,2);p(FL_S,22,28,2,2);
  }

  // ── Enemigos verdura-tanques ──────────────────────────────────────────────
  function drawEnemy(e){
    const x=e.x|0,y=e.y|0;
    const flash=e.flashTimer>0&&Math.floor(Date.now()/60)%2===0;
    ctx.save();
    ctx.translate(x+e.w/2,y+e.h/2);
    ctx.rotate({up:0,right:Math.PI/2,down:Math.PI,left:-Math.PI/2}[e.dir||'down']);
    ctx.translate(-e.w/2,-e.h/2);
    if(flash)ctx.globalAlpha=0.3;
    switch(e.tipo){
      case 0:drawTanqueTomate(ctx,0,0);break;
      case 1:drawTanqueHuevo(ctx,0,0);break;
      case 2:drawTanqueLechuga(ctx,0,0);break;
      case 3:drawTanqueZanahoria(ctx,0,0);break;
      case 4:drawTanqueBerenjena(ctx,0,0);break;
    }
    ctx.restore();
    if(e.maxHp>1){
      ctx.fillStyle='#000a';ctx.fillRect(x,y-5,e.w,3);
      ctx.fillStyle=e.hp/e.maxHp>0.5?'#3dbfb8':'#ff4444';
      ctx.fillRect(x,y-5,e.w*(e.hp/e.maxHp),3);
    }
  }

  function drawTanqueTomate(cx,ox,oy){
    const p=(c,x,y,w,h)=>{cx.fillStyle=c;cx.fillRect(ox+x,oy+y,w,h);};
    p('#881a00',2,8,28,18);p('#cc2200',4,10,24,14);p('#ff3311',5,11,16,10);p('#ff7755',6,11,7,4);
    p('#660000',12,0,8,9);p('#991100',13,1,6,8);  // cañón
    p('#22aa44',7,0,4,6);p('#22aa44',21,0,4,6);   // hojitas
    p('#441100',0,10,3,14);p('#441100',29,10,3,14);// orugas
    p('#552200',1,12,2,3);p('#552200',1,18,2,3);p('#552200',29,12,2,3);p('#552200',29,18,2,3);
    p('#550000',8,15,5,3);p('#550000',19,15,5,3); // ojos
    p('#771100',9,21,14,3);                        // boca
  }
  function drawTanqueHuevo(cx,ox,oy){
    const p=(c,x,y,w,h)=>{cx.fillStyle=c;cx.fillRect(ox+x,oy+y,w,h);};
    p('#aaa870',2,8,28,18);p('#ccc890',4,10,24,14);p('#e8e8cc',5,11,16,10);p('#f5f5e0',6,11,7,4);
    cx.strokeStyle='#998860';cx.lineWidth=1;cx.beginPath();cx.moveTo(ox+15,oy+8);cx.lineTo(ox+13,oy+13);cx.lineTo(ox+16,oy+17);cx.stroke();
    p('#888850',12,0,8,9);p('#aaa870',13,1,6,8);
    p('#666640',0,10,3,14);p('#666640',29,10,3,14);
    p('#556650',8,15,5,3);p('#556650',19,15,3,3);
    p('#664430',10,21,12,3);
  }
  function drawTanqueLechuga(cx,ox,oy){
    const p=(c,x,y,w,h)=>{cx.fillStyle=c;cx.fillRect(ox+x,oy+y,w,h);};
    p('#1a5518',2,8,28,18);p('#2a8030',4,10,24,14);p('#44bb33',5,11,16,10);p('#66cc44',6,11,7,4);
    cx.strokeStyle='#1a6622aa';cx.lineWidth=1;cx.beginPath();cx.moveTo(ox+16,oy+10);cx.lineTo(ox+16,oy+24);cx.stroke();cx.beginPath();cx.moveTo(ox+6,oy+17);cx.lineTo(ox+26,oy+17);cx.stroke();
    p('#0d3311',12,0,8,9);p('#1a5518',13,1,6,8);
    p('#112a11',0,10,3,14);p('#112a11',29,10,3,14);
    p('#0f3d0f',8,15,5,3);p('#0f3d0f',19,15,5,3);
    p('#0d2d0d',9,21,14,3);
  }
  function drawTanqueZanahoria(cx,ox,oy){
    const p=(c,x,y,w,h)=>{cx.fillStyle=c;cx.fillRect(ox+x,oy+y,w,h);};
    p('#994400',2,8,28,18);p('#cc5500',4,10,24,14);p('#ee8800',5,11,16,10);p('#ffaa33',6,11,7,4);
    cx.strokeStyle='#773300';cx.lineWidth=1;cx.beginPath();cx.moveTo(ox+4,oy+14);cx.lineTo(ox+28,oy+14);cx.stroke();cx.beginPath();cx.moveTo(ox+4,oy+20);cx.lineTo(ox+28,oy+20);cx.stroke();
    p('#332200',12,0,8,9);p('#553300',13,1,6,8);
    p('#33aa22',10,0,4,5);p('#33aa22',18,0,4,5); // hojitas cañón
    p('#663300',0,10,3,14);p('#663300',29,10,3,14);
    p('#552200',8,15,5,3);p('#552200',19,15,5,3);
    p('#441100',9,21,14,3);
  }
  function drawTanqueBerenjena(cx,ox,oy){
    const p=(c,x,y,w,h)=>{cx.fillStyle=c;cx.fillRect(ox+x,oy+y,w,h);};
    p('#330a55',2,8,28,18);p('#4a1177',4,10,24,14);p('#6622aa',5,11,16,10);p('#8833cc',6,11,7,4);
    p('#1a0033',12,0,8,9);p('#330055',13,1,6,8);
    p('#22aa22',13,0,6,3);                        // palito verde
    p('#180033',0,10,3,14);p('#180033',29,10,3,14);
    p('#220044',8,15,5,3);p('#220044',19,15,5,3);
    p('#110033',9,21,14,3);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  function drawHUD(){
    // Timer de blindaje de base
    if(baseArmorTimer>0){
      const pct=baseArmorTimer/12000;
      ctx.fillStyle='#111c'; ctx.fillRect(W/2-40,H-14,80,10);
      ctx.fillStyle=pct>0.5?'#3dbfb8':'#ff8800'; ctx.fillRect(W/2-40,H-14,80*pct,10);
      ctx.fillStyle='#fff'; ctx.font='7px monospace'; ctx.textAlign='center';
      ctx.textBaseline='middle'; ctx.fillText('🏰 '+Math.ceil(baseArmorTimer/1000)+'s',W/2,H-9);
    }
    const rem=enemies.length+spawnQueue.length;
    ctx.fillStyle='#111c';ctx.fillRect(W-42,2,40,12);
    ctx.fillStyle='#ff5555';ctx.font='bold 8px monospace';
    ctx.textAlign='right';ctx.textBaseline='top';
    ctx.fillText('ENE:'+rem,W-3,4);
    let hx=2;
    if(shieldTimer>0) {drawPuBar(hx,'🛡️',shieldTimer,8000,'#5599ff');hx+=42;}
    if(rapidTimer>0)  {drawPuBar(hx,'⚡',rapidTimer, 7000,'#ff44ff');hx+=42;}
    if(helmetTimer>0) {drawPuBar(hx,'🪖',helmetTimer,6000,'#ffdd00');hx+=42;}
  }
  function drawPuBar(x,icon,timer,max,col){
    ctx.fillStyle='#111a';ctx.fillRect(x,2,38,10);
    ctx.fillStyle=col+'99';ctx.fillRect(x,2,38*(timer/max),10);
    ctx.font='8px serif';ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillText(icon,x+2,7);
  }
  function drawOverlay(text,color){
    ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect(0,0,W,H);
    ctx.fillStyle=color;ctx.font='bold 26px Righteous,cursive';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,W/2,H/2);
  }
  function drawFin(){
    ctx.fillStyle='rgba(0,0,0,0.88)';ctx.fillRect(0,0,W,H);
    ctx.textAlign='center';ctx.textBaseline='middle';
    const msg=baseViva?'GAME OVER':'💥 BASE DESTRUIDA';
    ctx.fillStyle='#ff4d4d';ctx.font='bold 21px Righteous,cursive';ctx.fillText(msg,W/2,H/2-50);
    ctx.fillStyle='#3dbfb8';ctx.font='bold 15px Righteous,cursive';ctx.fillText('Puntos: '+score,W/2,H/2-16);
    ctx.fillStyle='#d4831a';ctx.font='13px Righteous,cursive';
    ctx.fillText('Récord: '+hiScore,W/2,H/2+4);ctx.fillText('Nivel: '+nivel,W/2,H/2+22);
    ctx.fillStyle='#555';ctx.font='10px monospace';ctx.fillText('Tocá Reiniciar para jugar de nuevo',W/2,H/2+50);
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  function loop(ts){
    if(estado!=='jugando')return;
    const dt=Math.min(ts-lastTs,80);lastTs=ts;
    update(dt);draw();loopId=requestAnimationFrame(loop);
  }

  function hud(){
    const u=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    u('battleScore',score);u('battleHi',hiScore);
    u('battleLives','❤️'.repeat(Math.max(vidas,0)));u('battleLevel',nivel);
  }
  let _tt=null;
  function toast(msg){
    if(typeof window.showToast==='function'){window.showToast(msg);return;}
    const el=document.getElementById('battleToast');
    if(!el)return;
    el.textContent=msg;el.style.opacity='1';
    clearTimeout(_tt);_tt=setTimeout(()=>{if(el)el.style.opacity='0';},2200);
  }

  function onKD(e){
    if(estado!=='jugando')return;
    keysDown[e.key]=true;
    if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();
  }
  function onKU(e){delete keysDown[e.key];}

  // ── API pública ───────────────────────────────────────────────────────────
  window.setBattleDificultad=v=>{battleDificultad=Math.max(0,Math.min(4,v));};
  window.battleShoot=()=>{if(estado==='jugando'&&!pBullet)shootPlayer();};
  window.battleMoverArriba =()=>{if(estado==='jugando'){keysDown['ArrowUp']   =true;keysDown['ArrowDown'] =false;}};
  window.battleMoverAbajo  =()=>{if(estado==='jugando'){keysDown['ArrowDown'] =true;keysDown['ArrowUp']   =false;}};
  window.battleMoverIzq    =()=>{if(estado==='jugando'){keysDown['ArrowLeft'] =true;keysDown['ArrowRight']=false;}};
  window.battleMoverDer    =()=>{if(estado==='jugando'){keysDown['ArrowRight']=true;keysDown['ArrowLeft'] =false;}};
  window.battleSoltarMov   =()=>{keysDown['ArrowUp']=false;keysDown['ArrowDown']=false;keysDown['ArrowLeft']=false;keysDown['ArrowRight']=false;};

  window.battlePause=()=>{
    if(estado==='jugando')    {estado='pausa';cancelAnimationFrame(loopId);draw();}
    else if(estado==='pausa') {estado='jugando';lastTs=performance.now();loopId=requestAnimationFrame(loop);}
    const btn=document.getElementById('btnBattlePausa');
    if(btn)btn.textContent=estado==='pausa'?'▶ Reanudar':'⏸ Pausa';
  };

  window.battleReset=()=>{
    cancelAnimationFrame(loopId);
    keysDown={};pBullet=null;eBullets=[];enemies=[];powerups=[];particles=[];explosions=[];
    score=0;vidas=3;nivel=1;baseViva=true;
    shieldTimer=0;rapidTimer=0;helmetTimer=0;
    generateMap(1);initPlayer();setupWave();hud();
    estado='jugando';
    const btnP=document.getElementById('btnBattlePausa');
    if(btnP)btnP.textContent='⏸ Pausa';
    lastTs=performance.now();loopId=requestAnimationFrame(loop);
  };

  window.battleInit=()=>{
    canvas=document.getElementById('battleCanvas');
    if(!canvas){console.error('[battleInit] #battleCanvas no encontrado');return;}
    ctx=canvas.getContext('2d');
    hiScore=parseInt(localStorage.getItem('battleHiC')||'0');
    document.removeEventListener('keydown',onKD);
    document.removeEventListener('keyup',onKU);
    document.addEventListener('keydown',onKD);
    document.addEventListener('keyup',onKU);
    window.battleReset();
  };

  Object.defineProperty(window,'battleRunning',{get:()=>estado==='jugando',configurable:true,enumerable:true});
})();
