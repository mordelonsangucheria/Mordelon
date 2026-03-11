// ===================== MORDELÓN BATTLE CITY — PixiJS Renderer =====================
(function () {

  // ── Constantes lógicas (NO cambian) ──────────────────────────────────────
  const W = 320, H = 240;
  const TILE = 16;
  const COLS = W / TILE;
  const ROWS = H / TILE;
  const SCALE = 1.5; // escala visual

  const T_EMPTY=0, T_BRICK=1, T_STEEL=2, T_BASE=3, T_BUSH=4;

  // ── Estado del juego ──────────────────────────────────────────────────────
  let audioCtx;
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
  let baseArmor=0, baseArmorTimer=0;
  let keysDown={};

  // ── Efectos ───────────────────────────────────────────────────────────────
  let shakeTimer=0, shakeIntensity=0;
  let screenFlashTimer=0, screenFlashColor=0xff2200;
  let pBulletTrail=[];

  // ── PixiJS ────────────────────────────────────────────────────────────────
  let app=null;          // PIXI.Application
  let pixiReady=false;

  // Layers
  let layerBg, layerMap, layerGame, layerFx, layerHUD, layerOverlay;

  // Sprite pools / containers
  let spriteTiles={};    // key: "r_c" → PIXI.Graphics
  let spritePlayer=null;
  let spriteEnemies=new Map();
  let spriteBulletP=null;
  let spriteBulletTrail=[];
  let spriteBulletsE=[];
  let spriteParticles=[];
  let spriteExplosions=[];
  let spritePowerups=new Map();
  let spriteShield=null;

  // HUD elements
  let hudArmorBar=null, hudArmorFill=null, hudArmorText=null;
  let hudEnemyText=null;
  let hudPuBars=[];
  let overlayContainer=null;

  // Textures cache (offscreen canvas → PIXI.Texture)
  let textures={};

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

  // ── Constantes mapa ───────────────────────────────────────────────────────
  const BASE_COL=Math.floor(COLS/2)-1;
  const BASE_ROW=ROWS-3;

  function isPlayerZone(r,c){
    return r>=BASE_ROW-3&&r<=BASE_ROW&&c>=BASE_COL-3&&c<=BASE_COL+4;
  }

  // ── Mapa lógico ───────────────────────────────────────────────────────────
  function generateMap(lv){
    mapa=Array.from({length:ROWS},()=>Array(COLS).fill(T_EMPTY));
    for(let c=0;c<COLS;c++){mapa[0][c]=T_STEEL;mapa[ROWS-1][c]=T_STEEL;}
    for(let r=0;r<ROWS;r++){mapa[r][0]=T_STEEL;mapa[r][COLS-1]=T_STEEL;}
    mapa[BASE_ROW][BASE_COL]=T_BASE;
    mapa[BASE_ROW][BASE_COL+1]=T_BASE;
    for(let c=BASE_COL-1;c<=BASE_COL+2;c++)
      if(c>0&&c<COLS-1) mapa[BASE_ROW-1][c]=T_BRICK;
    mapa[BASE_ROW][BASE_COL-1]=T_BRICK;
    mapa[BASE_ROW][BASE_COL+2]=T_BRICK;
    const density=Math.min(0.14+lv*0.010,0.22);
    for(let r=3;r<ROWS-2;r++){
      for(let c=1;c<COLS-1;c++){
        if(mapa[r][c]!==T_EMPTY)continue;
        if(isPlayerZone(r,c))continue;
        if(r<=2)continue;
        if(Math.random()<density){
          const t=Math.random()<0.10?T_STEEL:T_BRICK;
          mapa[r][c]=t;
          if(c+1<COLS-1&&!isPlayerZone(r,c+1)&&Math.random()<0.5) mapa[r][c+1]=t;
        }
      }
    }
    for(let i=0;i<6;i++){
      const r=3+Math.floor(Math.random()*(ROWS-7));
      const c=1+Math.floor(Math.random()*(COLS-2));
      if(mapa[r][c]===T_EMPTY&&!isPlayerZone(r,c)) mapa[r][c]=T_BUSH;
    }
  }

  function tileAt(r,c){
    if(r<0||r>=ROWS||c<0||c>=COLS) return T_STEEL;
    return mapa[r][c];
  }

  function canMoveTo(x,y,w,h){
    const M=3;
    const r0=Math.floor((y+M)/TILE), r1=Math.floor((y+h-M-1)/TILE);
    const c0=Math.floor((x+M)/TILE), c1=Math.floor((x+w-M-1)/TILE);
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
      markTileDirty(r,c);
      return true;
    }
    if(t===T_STEEL){sfxBrick();return true;}
    if(t===T_BASE&&baseViva){
      baseViva=false; mapa[r][c]=T_EMPTY; sfxBase();
      shakeTimer=600; shakeIntensity=8;
      screenFlashTimer=300; screenFlashColor=0xff8800;
      spawnParticles(c*TILE+8,r*TILE+8,'#3dbfb8',18);
      spawnExplosion(c*TILE+TILE,r*TILE+TILE,true);
      markTileDirty(r,c);
      setTimeout(finJuego,1400);
      return true;
    }
    return t!==T_EMPTY&&t!==T_BUSH;
  }

  // ── Player ────────────────────────────────────────────────────────────────
  function initPlayer(){
    const pr=BASE_ROW-3,pc=BASE_COL;
    for(let r=pr;r<=pr+1;r++)
      for(let c=pc;c<=pc+1;c++)
        if(mapa[r]&&mapa[r][c]!==T_BASE) mapa[r][c]=T_EMPTY;
    player={x:BASE_COL*TILE,y:(BASE_ROW-3)*TILE,w:TILE*2,h:TILE*2,dir:'up',spd:1.6,shootTimer:0,frame:0,frameTimer:0};
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
    const eid=Date.now()+Math.random();
    enemies.push({
      id:eid,x:sx,y:sy,w:TILE*2,h:TILE*2,
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
    if(shakeTimer>0) shakeTimer-=dt;
    if(screenFlashTimer>0)screenFlashTimer-=dt;
    if(baseArmorTimer>0){baseArmorTimer-=dt;if(baseArmorTimer<=0)degradeBaseArmor();}
    if(spawnQueue.length>0){spawnTimer-=dt;if(spawnTimer<=0)trySpawnEnemy();}
  }

  function moveEntity(ent,dx,dy){
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
    const up=keysDown['ArrowUp']||keysDown['w']||keysDown['W'];
    const down=keysDown['ArrowDown']||keysDown['s']||keysDown['S'];
    const left=keysDown['ArrowLeft']||keysDown['a']||keysDown['A'];
    const right=keysDown['ArrowRight']||keysDown['d']||keysDown['D'];
    if(up&&right)       {player.dir='upright';   moveEntity(player, spd,-spd);}
    else if(up&&left)   {player.dir='upleft';    moveEntity(player,-spd,-spd);}
    else if(down&&right){player.dir='downright'; moveEntity(player, spd, spd);}
    else if(down&&left) {player.dir='downleft';  moveEntity(player,-spd, spd);}
    else if(up)         {player.dir='up';         moveEntity(player,0,-spd);}
    else if(down)       {player.dir='down';       moveEntity(player,0, spd);}
    else if(left)       {player.dir='left';       moveEntity(player,-spd,0);}
    else if(right)      {player.dir='right';      moveEntity(player, spd,0);}
    player.shootTimer-=dt;
    const cd=rapidTimer>0?180:420;
    if((keysDown[' ']||keysDown['z']||keysDown['Z'])&&player.shootTimer<=0&&!pBullet){
      shootPlayer();player.shootTimer=cd;
    }
  }

  function shootPlayer(){
    sfxShoot();
    const cx=player.x+player.w/2,cy=player.y+player.h/2,v=5.5,s=v*0.707;
    const dirs={up:{vx:0,vy:-v},down:{vx:0,vy:v},left:{vx:-v,vy:0},right:{vx:v,vy:0},
      upleft:{vx:-s,vy:-s},upright:{vx:s,vy:-s},downleft:{vx:-s,vy:s},downright:{vx:s,vy:s}};
    const d=dirs[player.dir]||dirs['up'];
    pBullet={x:cx,y:cy,vx:d.vx,vy:d.vy};
    pBulletTrail=[];
  }

  function updateEnemies(dt){
    enemies.forEach(e=>{
      e.frameTimer=(e.frameTimer||0)+dt;
      if(e.frameTimer>200){e.frame=(e.frame+1)%2;e.frameTimer=0;}
      if(e.flashTimer>0)e.flashTimer-=dt;
      e.dirTimer-=dt;
      if(e.dirTimer<=0){
        const pool=['down','down','down','left','right'];
        if(e.x<TILE*4)pool.push('right','right');
        if(e.x>W-TILE*6)pool.push('left','left');
        if(e.y>H/2)pool.push('up');
        e.dir=pool[Math.floor(Math.random()*pool.length)];
        e.dirTimer=600+Math.random()*700;
      }
      const spd=e.spd*dt/16;
      const dx={up:0,down:0,left:-spd,right:spd}[e.dir];
      const dy={up:-spd,down:spd,left:0,right:0}[e.dir];
      const oldX=e.x,oldY=e.y;
      moveEntity(e,dx,dy);
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
    const target=Math.random()<0.45
      ?{x:player.x+player.w/2,y:player.y+player.h/2}
      :{x:BASE_COL*TILE+TILE,y:BASE_ROW*TILE};
    const ang=Math.atan2(target.y-cy,target.x-cx);
    const snap=Math.abs(Math.cos(ang))>Math.abs(Math.sin(ang))
      ?{vx:Math.sign(Math.cos(ang))*v,vy:0}
      :{vx:0,vy:Math.sign(Math.sin(ang))*v};
    eBullets.push({id:Date.now()+Math.random(),x:cx,y:cy,vx:snap.vx,vy:snap.vy});
  }

  function updateBullets(dt){
    const s=dt/16;
    if(pBullet){
      pBulletTrail.push({x:pBullet.x,y:pBullet.y,life:120,maxLife:120});
      if(pBulletTrail.length>7)pBulletTrail.shift();
      pBullet.x+=pBullet.vx*s;pBullet.y+=pBullet.vy*s;
      if(bulletHitMap(pBullet.x,pBullet.y)){
        spawnParticles(pBullet.x,pBullet.y,'#ffdd00',5);pBullet=null;pBulletTrail=[];
      }else if(pBullet&&(pBullet.x<0||pBullet.x>W||pBullet.y<0||pBullet.y>H)){
        pBullet=null;pBulletTrail=[];
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
    pBulletTrail.forEach(t=>t.life-=dt);
    pBulletTrail=pBulletTrail.filter(t=>t.life>0);
  }
  function updatePowerups(dt){powerups.forEach(p=>p.timer-=dt);powerups=powerups.filter(p=>p.timer>0);}

  function spawnExplosion(x,y,big){
    const C=[0xffdd00,0xff8800,0xff4400,0xff2200];
    const n=big?20:8;
    for(let i=0;i<n;i++) explosions.push({
      id:Date.now()+Math.random(),
      x:x+(Math.random()-.5)*(big?52:22),y:y+(Math.random()-.5)*(big?52:22),
      r:big?5+Math.random()*10:2+Math.random()*5,
      life:200+Math.random()*500,maxLife:700,
      color:C[Math.floor(Math.random()*C.length)],
      vx:(Math.random()-.5)*1.5,vy:(Math.random()-.5)*1.5,
    });
  }
  function spawnParticles(x,y,col,n){
    for(let i=0;i<n;i++) particles.push({
      id:Date.now()+Math.random(),
      x,y,vx:(Math.random()-.5)*4,vy:-1.5-Math.random()*2.5,
      life:300+Math.random()*300,maxLife:600,color:col,r:1.5+Math.random()*2,
    });
  }

  // ── Colisiones ────────────────────────────────────────────────────────────
  function overlap(ax,ay,aw,ah,bx,by,bw,bh){return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by;}

  function checkCollisions(){
    if(pBullet){
      for(let i=eBullets.length-1;i>=0;i--){
        const b=eBullets[i];
        if(Math.abs(pBullet.x-b.x)<6&&Math.abs(pBullet.y-b.y)<6){
          spawnParticles(pBullet.x,pBullet.y,'#ffaa00',5);
          eBullets.splice(i,1);pBullet=null;break;
        }
      }
    }
    if(pBullet){
      for(let i=enemies.length-1;i>=0;i--){
        const e=enemies[i];
        if(!overlap(pBullet.x-3,pBullet.y-3,6,6,e.x+2,e.y+2,e.w-4,e.h-4))continue;
        e.hp--;e.flashTimer=200;sfxHit();
        spawnParticles(pBullet.x,pBullet.y,'#ffdd00',6);pBullet=null;
        if(e.hp<=0){
          score+=e.pts;hud();
          spawnExplosion(e.x+e.w/2,e.y+e.h/2,false);sfxExplode();
          tryDropPowerup(e);enemies.splice(i,1);
        }
        break;
      }
    }
    const invul=helmetTimer>0||shieldTimer>0;
    eBullets=eBullets.filter(b=>{
      if(!overlap(b.x-3,b.y-3,6,6,player.x+3,player.y+3,player.w-6,player.h-6))return true;
      if(invul){spawnParticles(b.x,b.y,'#5599ff',5);return false;}
      golpear();return false;
    });
    if(!invul){
      for(const e of enemies){
        if(overlap(player.x+3,player.y+3,player.w-6,player.h-6,e.x+2,e.y+2,e.w-4,e.h-4)){
          golpear();break;
        }
      }
    }
    powerups=powerups.filter(p=>{
      if(!overlap(p.x,p.y,TILE*2,TILE*2,player.x,player.y,player.w,player.h))return true;
      applyPowerup(p.tipo);return false;
    });
  }

  // ── Base armor ────────────────────────────────────────────────────────────
  const BASE_WALL_POS=[
    [BASE_ROW-1,BASE_COL-1],[BASE_ROW-1,BASE_COL],[BASE_ROW-1,BASE_COL+1],[BASE_ROW-1,BASE_COL+2],
    [BASE_ROW,BASE_COL-1],[BASE_ROW,BASE_COL+2],
  ];

  function fortifyBase(){
    BASE_WALL_POS.forEach(([r,c])=>{if(mapa[r]&&mapa[r][c]!==T_BASE)mapa[r][c]=T_STEEL;});
    baseArmor=1;baseArmorTimer=12000;
    BASE_WALL_POS.forEach(([r,c])=>markTileDirty(r,c));
    toast('🏰 Base BLINDADA (12s)!');
  }
  function repairBase(){
    BASE_WALL_POS.forEach(([r,c])=>{if(mapa[r]&&mapa[r][c]===T_EMPTY)mapa[r][c]=T_BRICK;});
    BASE_WALL_POS.forEach(([r,c])=>markTileDirty(r,c));
    toast('🧱 Base reparada!');
  }
  function degradeBaseArmor(){
    BASE_WALL_POS.forEach(([r,c])=>{if(mapa[r]&&mapa[r][c]===T_STEEL)mapa[r][c]=T_BRICK;});
    baseArmor=0;baseArmorTimer=0;
    BASE_WALL_POS.forEach(([r,c])=>markTileDirty(r,c));
    toast('⚠️ Blindaje vencido!');
  }
  function tryDropPowerup(e){
    if(Math.random()>0.32)return;
    const pool=['shield','rapid','helmet','life','base-repair','base-armor','gun-upgrade'];
    if(checkBaseNeedsRepair()){pool.push('base-repair','base-repair','base-armor');}
    if(vidas<=2){pool.push('life','life');}
    powerups.push({id:Date.now()+Math.random(),x:e.x,y:e.y,tipo:pool[Math.floor(Math.random()*pool.length)],timer:9000});
    sfxPowerup();
  }
  function checkBaseNeedsRepair(){return BASE_WALL_POS.some(([r,c])=>mapa[r]&&mapa[r][c]===T_EMPTY);}
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
    shakeTimer=350;shakeIntensity=4;
    screenFlashTimer=180;screenFlashColor=0xff2200;
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
        rebuildMapSprites();
      }
    }
  }
  function finJuego(){
    if(estado==='fin')return;
    estado='fin';
    stopLoop(); // para el RAF inmediatamente — no hay más frames
    if(score>hiScore){hiScore=score;localStorage.setItem('battleHiC',hiScore);if(typeof window.notificarRecordJuego==='function')window.notificarRecordJuego('battle',hiScore);}
    hud();
    drawFinPixi(); // ahora sí es seguro, el loop ya no corre
    if(typeof window.actualizarBarraRecompensa==='function')window.actualizarBarraRecompensa();
    setTimeout(function(){if(typeof window.abrirLeaderboard==='function')window.abrirLeaderboard('battle',score);},1200);
  }

  // ── PIXI: generación de texturas ──────────────────────────────────────────
  function hexToNum(hex){return parseInt(hex.replace('#',''),16);}

  // Dibuja un sprite en un offscreen canvas y lo convierte a textura PIXI
  function makeTexture(key, w, h, drawFn){
    if(textures[key]) return textures[key];
    const oc=document.createElement('canvas');
    oc.width=w; oc.height=h;
    const octx=oc.getContext('2d');
    drawFn(octx);
    textures[key]=PIXI.Texture.from(oc);
    return textures[key];
  }

  // ── Texturas de tiles ──────────────────────────────────────────────────────
  function makeTexBrick(){
    return makeTexture('brick',TILE,TILE,(c)=>{
      // Base
      const g=c.createLinearGradient(0,0,TILE,TILE);
      g.addColorStop(0,'#aa3311'); g.addColorStop(1,'#6a1a05');
      c.fillStyle=g; c.fillRect(0,0,TILE,TILE);
      // Mortero
      c.fillStyle='#3a0a00';
      c.fillRect(0,7,TILE,2); c.fillRect(0,0,TILE,1);
      c.fillRect(7,0,2,7); c.fillRect(7,9,2,7);
      // Ladrillos con highlight
      c.fillStyle='#cc4422'; c.fillRect(1,1,5,5); c.fillRect(9,1,6,5);
      c.fillRect(1,9,6,5);   c.fillRect(9,9,5,5);
      // Highlight top
      c.fillStyle='rgba(255,180,100,0.25)';
      c.fillRect(1,1,5,1); c.fillRect(9,1,6,1);
      c.fillRect(1,9,6,1); c.fillRect(9,9,5,1);
      // Sombra bottom
      c.fillStyle='rgba(0,0,0,0.35)';
      c.fillRect(1,5,5,1); c.fillRect(9,5,6,1);
      c.fillRect(1,13,6,1); c.fillRect(9,13,5,1);
    });
  }

  function makeTexSteel(){
    return makeTexture('steel',TILE,TILE,(c)=>{
      const g=c.createLinearGradient(0,0,TILE,TILE);
      g.addColorStop(0,'#6a6a6a'); g.addColorStop(0.5,'#888'); g.addColorStop(1,'#444');
      c.fillStyle=g; c.fillRect(0,0,TILE,TILE);
      // Rivets
      c.fillStyle='#333';
      c.fillRect(2,2,3,3); c.fillRect(11,2,3,3);
      c.fillRect(2,11,3,3); c.fillRect(11,11,3,3);
      c.fillStyle='rgba(255,255,255,0.3)';
      c.fillRect(2,2,1,1); c.fillRect(11,2,1,1);
      c.fillRect(2,11,1,1); c.fillRect(11,11,1,1);
      // Bevel
      c.fillStyle='rgba(255,255,255,0.15)';
      c.fillRect(0,0,TILE,2); c.fillRect(0,0,2,TILE);
      c.fillStyle='rgba(0,0,0,0.4)';
      c.fillRect(0,TILE-2,TILE,2); c.fillRect(TILE-2,0,2,TILE);
    });
  }

  function makeTexBush(){
    return makeTexture('bush',TILE,TILE,(c)=>{
      c.fillStyle='#0d2a10'; c.fillRect(0,0,TILE,TILE);
      // Clusters
      [[8,8,6],[5,6,3],[11,10,3],[7,4,2],[10,5,2]].forEach(([x,y,r])=>{
        const grd=c.createRadialGradient(x,y,0,x,y,r);
        grd.addColorStop(0,'#3da84a'); grd.addColorStop(0.5,'#2a7a35'); grd.addColorStop(1,'#163a1c');
        c.fillStyle=grd; c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill();
      });
      // Highlight drops
      c.fillStyle='rgba(100,255,120,0.2)';
      c.beginPath(); c.arc(6,5,1.5,0,Math.PI*2); c.fill();
      c.beginPath(); c.arc(11,7,1,0,Math.PI*2); c.fill();
    });
  }

  function makeTexBase(alive){
    const key=alive?'base_alive':'base_dead';
    return makeTexture(key,TILE,TILE,(c)=>{
      if(alive){
        // Base viva — edificio turquesa con ventanas
        const g=c.createLinearGradient(0,0,0,TILE);
        g.addColorStop(0,'#1a5a5a'); g.addColorStop(1,'#0a2a2a');
        c.fillStyle=g; c.fillRect(0,0,TILE,TILE);
        // Estructura
        c.fillStyle='#3DBFB8'; c.fillRect(3,2,10,12);
        c.fillStyle='#5ae0da'; c.fillRect(4,3,4,4);
        c.fillStyle='#5ae0da'; c.fillRect(9,3,4,4);
        // Ventanas oscuras con brillo
        c.fillStyle='#0a1a1a'; c.fillRect(5,4,2,2); c.fillRect(10,4,2,2);
        c.fillStyle='rgba(100,255,240,0.5)'; c.fillRect(5,4,1,1); c.fillRect(10,4,1,1);
        // Puerta
        c.fillStyle='#082020'; c.fillRect(6,9,4,5);
        // Antena
        c.fillStyle='#7EEEE9'; c.fillRect(7,0,2,3);
        c.fillStyle='#ff4444'; c.beginPath(); c.arc(8,0,1.5,0,Math.PI*2); c.fill();
        // Borde glow
        c.strokeStyle='rgba(61,191,184,0.6)'; c.lineWidth=1; c.strokeRect(0.5,0.5,TILE-1,TILE-1);
      } else {
        // Destruida
        c.fillStyle='#2a1000'; c.fillRect(0,0,TILE,TILE);
        c.fillStyle='#553300';
        c.fillRect(2,2,4,4); c.fillRect(10,8,4,4); c.fillRect(6,5,3,3);
        c.fillStyle='rgba(255,100,0,0.15)'; c.fillRect(0,0,TILE,TILE);
      }
    });
  }

  // ── Textura suelo ────────────────────────────────────────────────────────
  function makeTexGround(){
    return makeTexture('ground',TILE,TILE,(c)=>{
      c.fillStyle='#0d1117'; c.fillRect(0,0,TILE,TILE);
      // Variación sutil de suelo
      c.fillStyle='rgba(61,191,184,0.03)';
      if(Math.random()<0.3) c.fillRect(Math.random()*14,Math.random()*14,2,2);
    });
  }

  // ── Textura de jugador (llama) ────────────────────────────────────────────
  function makeTexPlayer(frame){
    const key='player_f'+frame;
    return makeTexture(key, 32, 32, (c)=>{
      const p=(col,x,y,w,h)=>{c.fillStyle=col;c.fillRect(x,y,w,h);};
      const T='#3DBFB8', L='#7EEEE9', D='#1A8C87', Wh='#FFFFFF', E='#0a1a1a', S='#B2F5F2';

      if(frame===0){
        // Sparkles
        p(S,20,0,3,3); p(S,2,6,3,3); p(S,28,10,3,3);
        // Cuello/cabeza
        p(L,12,2,8,4); p(T,10,4,12,6);
        // Orejas
        p(L,8,6,4,4); p(L,18,6,6,4);
        // Cuerpo
        p(T,6,10,20,14);
        p(L,8,10,6,6); p(L,18,12,6,4);
        // Patas adelante
        p(D,6,16,4,8); p(D,22,14,4,10);
        // Ojos con brillo
        p(Wh,8,14,7,7); p(Wh,17,15,7,7);
        p(E,10,16,3,3); p(E,19,16,3,3);
        p(Wh,10,16,1,1); p(Wh,19,16,1,1); // pupila brillo
        // Pecho
        p(L,9,22,12,4);
        // Patas traseras frame 0
        p(T,8,24,5,6); p(D,8,28,5,3);
        p(D,18,24,5,3); p(T,18,24,5,5);
        // Pezuñas
        p(S,4,28,2,2); p(S,24,30,2,2);
      } else {
        p(S,2,4,3,3); p(S,26,8,3,3); p(S,18,0,2,2);
        p(L,10,2,8,4); p(T,8,4,14,8);
        p(L,6,8,5,5); p(L,18,6,6,4);
        p(T,5,12,22,12);
        p(L,7,12,7,6); p(L,17,14,6,4);
        p(D,5,18,4,6); p(D,22,16,4,8);
        p(Wh,8,14,7,7); p(Wh,17,15,7,7);
        p(E,10,16,3,3); p(E,19,16,3,3);
        p(Wh,10,16,1,1); p(Wh,19,16,1,1);
        p(L,9,22,12,4);
        p(D,8,24,5,3); p(T,8,24,5,5);
        p(T,18,24,5,6); p(D,18,28,5,3);
        p(S,6,30,2,2); p(S,22,28,2,2);
      }
    });
  }

  // ── Texturas de enemigos (verdura-tanques detallados) ─────────────────────
  const ENEMY_COLORS=[
    // Tomate
    {body:'#cc2200',light:'#ff4422',dark:'#881a00',track:'#441100',eye:'#550000',accent:'#22aa44',name:'Tomate'},
    // Huevo
    {body:'#ccc890',light:'#f0f0d0',dark:'#888860',track:'#666640',eye:'#556650',accent:'#aaa870',name:'Huevo'},
    // Lechuga
    {body:'#2a8030',light:'#55cc44',dark:'#1a5518',track:'#112a11',eye:'#0f3d0f',accent:'#44bb33',name:'Lechuga'},
    // Zanahoria
    {body:'#cc5500',light:'#ff9922',dark:'#994400',track:'#663300',eye:'#552200',accent:'#33aa22',name:'Zanahoria'},
    // Berenjena
    {body:'#5522aa',light:'#8833cc',dark:'#330a55',track:'#180033',eye:'#220044',accent:'#22aa22',name:'Berenjena'},
  ];

  function makeTexEnemy(tipo, frame){
    const key=`enemy_${tipo}_${frame}`;
    const col=ENEMY_COLORS[tipo];
    return makeTexture(key, 32, 32, (c)=>{
      const p=(cl,x,y,w,h)=>{c.fillStyle=cl;c.fillRect(x,y,w,h);};

      // Orugas (tracks) con detalle
      const trackY=10, trackH=14;
      p(col.track,0,trackY,4,trackH); p(col.track,28,trackY,4,trackH);
      // Ruedas de oruga
      for(let i=0;i<3;i++){
        const wy=trackY+2+i*4;
        const g=c.createRadialGradient(2,wy+1,0,2,wy+1,2);
        g.addColorStop(0,col.dark); g.addColorStop(1,'#000');
        c.fillStyle=g; c.beginPath(); c.arc(2,wy+1,2,0,Math.PI*2); c.fill();
        c.beginPath(); c.arc(30,wy+1,2,0,Math.PI*2); c.fill();
      }
      // Track highlight
      c.fillStyle='rgba(255,255,255,0.1)'; c.fillRect(0,trackY,1,trackH); c.fillRect(31,trackY,1,trackH);

      // Cuerpo principal con gradiente
      const bg=c.createLinearGradient(4,8,28,26);
      bg.addColorStop(0,col.light); bg.addColorStop(0.5,col.body); bg.addColorStop(1,col.dark);
      c.fillStyle=bg; c.beginPath();
      c.roundRect ? c.roundRect(4,8,24,18,3) : c.rect(4,8,24,18);
      c.fill();

      // Detalle de superficie (líneas de armadura)
      c.strokeStyle='rgba(0,0,0,0.2)'; c.lineWidth=0.7;
      c.beginPath(); c.moveTo(4,16); c.lineTo(28,16); c.stroke();
      c.beginPath(); c.moveTo(4,22); c.lineTo(28,22); c.stroke();

      // Remaches / tornillos
      [[5,9],[27,9],[5,24],[27,24]].forEach(([x,y])=>{
        c.fillStyle=col.dark; c.beginPath(); c.arc(x,y,1.5,0,Math.PI*2); c.fill();
        c.fillStyle='rgba(255,255,255,0.4)'; c.beginPath(); c.arc(x-0.5,y-0.5,0.6,0,Math.PI*2); c.fill();
      });

      // Cañón con gradiente cilíndrico
      const cg=c.createLinearGradient(12,0,20,0);
      cg.addColorStop(0,col.light); cg.addColorStop(0.5,col.dark); cg.addColorStop(1,'#000');
      c.fillStyle=cg; c.fillRect(13,0,6,10);
      c.fillStyle='rgba(0,0,0,0.5)'; c.fillRect(13,0,1,10); // sombra izq
      c.fillStyle='rgba(255,255,255,0.2)'; c.fillRect(18,0,1,10); // highlight der
      // Boca del cañón
      c.fillStyle='#111'; c.beginPath(); c.arc(16,0,3,0,Math.PI); c.fill();

      // Acento decorativo según tipo
      if(tipo===0){ // Tomate: hojitas
        p(col.accent,7,0,3,5); p(col.accent,21,0,4,5);
        c.fillStyle='rgba(0,150,0,0.6)';
        c.beginPath(); c.moveTo(7,5); c.quadraticCurveTo(5,2,9,0); c.fill();
        c.beginPath(); c.moveTo(22,5); c.quadraticCurveTo(20,2,25,0); c.fill();
      } else if(tipo===2){ // Lechuga: venas
        c.strokeStyle='rgba(0,80,0,0.4)'; c.lineWidth=0.8;
        c.beginPath(); c.moveTo(16,9); c.lineTo(16,25); c.stroke();
        c.beginPath(); c.moveTo(5,17); c.lineTo(27,17); c.stroke();
      } else if(tipo===3){ // Zanahoria: hojitas en cañón
        p(col.accent,10,0,4,4); p(col.accent,19,0,4,4);
      } else if(tipo===4){ // Berenjena: palito verde
        p(col.accent,13,0,6,2);
      }

      // Ojos (faros) con glow
      const eyeX=[8,20], eyeY=16;
      eyeX.forEach(ex=>{
        // Halo exterior
        c.fillStyle='rgba(255,200,0,0.15)'; c.beginPath(); c.arc(ex+2,eyeY,5,0,Math.PI*2); c.fill();
        // Carcasa
        c.fillStyle=col.eye; c.beginPath(); c.arc(ex+2,eyeY,3.5,0,Math.PI*2); c.fill();
        // Cristal
        c.fillStyle='rgba(255,220,0,0.8)'; c.beginPath(); c.arc(ex+2,eyeY,2,0,Math.PI*2); c.fill();
        // Brillo
        c.fillStyle='#fff'; c.beginPath(); c.arc(ex+1,eyeY-0.5,0.8,0,Math.PI*2); c.fill();
      });

      // Animación: frame 1 tiene tracks desplazados
      if(frame===1){
        c.fillStyle='rgba(255,255,255,0.08)';
        c.fillRect(0,trackY+2,4,2); c.fillRect(28,trackY+6,4,2);
      }

      // Borde de armadura
      c.strokeStyle=col.dark; c.lineWidth=1;
      c.strokeRect(4,8,24,18);
    });
  }

  // ── Texturas de powerup ────────────────────────────────────────────────────
  function makeTexPowerup(tipo){
    const key='pu_'+tipo;
    const icons={shield:'🛡️',rapid:'⚡',helmet:'🪖',life:'❤️','base-repair':'🧱','base-armor':'🏰','gun-upgrade':'🔫'};
    const colors={'shield':0x5599ff,'rapid':0xff44ff,'helmet':0xffdd00,'life':0xff4466,
      'base-repair':0xcc5500,'base-armor':0x3dbfb8,'gun-upgrade':0xff8800};
    return makeTexture(key, TILE*2, TILE*2, (c)=>{
      const col=colors[tipo]||0xffffff;
      const hex='#'+col.toString(16).padStart(6,'0');
      // Fondo con gradiente
      const g=c.createRadialGradient(TILE,TILE,0,TILE,TILE,TILE);
      g.addColorStop(0,hex+'44'); g.addColorStop(1,'#111111');
      c.fillStyle=g; c.fillRect(0,0,TILE*2,TILE*2);
      // Borde
      c.strokeStyle=hex; c.lineWidth=1.5;
      c.strokeRect(1,1,TILE*2-2,TILE*2-2);
      // Ícono
      c.font='16px serif'; c.textAlign='center'; c.textBaseline='middle';
      c.fillText(icons[tipo]||'★',TILE,TILE+1);
    });
  }

  // ── Bullet textures ───────────────────────────────────────────────────────
  function makeTexBulletPlayer(){
    return makeTexture('bullet_p',8,8,(c)=>{
      const g=c.createRadialGradient(4,4,0,4,4,4);
      g.addColorStop(0,'#ffffff'); g.addColorStop(0.3,'#ffee00'); g.addColorStop(1,'rgba(255,200,0,0)');
      c.fillStyle=g; c.fillRect(0,0,8,8);
    });
  }
  function makeTexBulletEnemy(){
    return makeTexture('bullet_e',7,7,(c)=>{
      const g=c.createRadialGradient(3.5,3.5,0,3.5,3.5,3.5);
      g.addColorStop(0,'#ffffff'); g.addColorStop(0.3,'#ff5050'); g.addColorStop(1,'rgba(255,0,0,0)');
      c.fillStyle=g; c.fillRect(0,0,7,7);
    });
  }

  // ── Inicializar PIXI ──────────────────────────────────────────────────────
  function initPixi(canvasEl){
    if(app){
      app.destroy(false,{children:true,texture:false});
      textures={};
      app=null;
    }

    app=new PIXI.Application({
      view: canvasEl,
      width: W,
      height: H,
      backgroundColor: 0x0d1117,
      antialias: false,
      resolution: 1,
    });

    // Escala visual
    canvasEl.style.width=(W*SCALE)+'px';
    canvasEl.style.height=(H*SCALE)+'px';
    canvasEl.style.imageRendering='pixelated';
    canvasEl.style.boxShadow='0 0 32px rgba(61,191,184,0.5), 0 0 80px rgba(61,191,184,0.2)';
    canvasEl.style.borderRadius='8px';
    canvasEl.style.border='1.5px solid rgba(61,191,184,0.6)';

    // Layers en orden
    layerBg      = new PIXI.Container(); app.stage.addChild(layerBg);
    layerMap     = new PIXI.Container(); app.stage.addChild(layerMap);
    layerGame    = new PIXI.Container(); app.stage.addChild(layerGame);
    layerFx      = new PIXI.Container(); app.stage.addChild(layerFx);
    layerHUD     = new PIXI.Container(); app.stage.addChild(layerHUD);
    layerOverlay = new PIXI.Container(); app.stage.addChild(layerOverlay);

    buildBackground();
    buildHUDSprites();
    pixiReady=true;
  }

  // ── Fondo ─────────────────────────────────────────────────────────────────
  let bgGridGfx=null, bgStarsGfx=null, bgStarsData=[];
  function buildBackground(){
    layerBg.removeChildren();

    // Grid
    bgGridGfx=new PIXI.Graphics();
    bgGridGfx.lineStyle(0.5,0x3DBFB8,0.04);
    for(let x=0;x<=W;x+=TILE){bgGridGfx.moveTo(x,0);bgGridGfx.lineTo(x,H);}
    for(let y=0;y<=H;y+=TILE){bgGridGfx.moveTo(0,y);bgGridGfx.lineTo(W,y);}
    layerBg.addChild(bgGridGfx);

    // Stars
    bgStarsData=[];
    bgStarsGfx=new PIXI.Graphics();
    for(let i=0;i<35;i++){
      bgStarsData.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()<0.3?1.5:0.8,phase:Math.random()*Math.PI*2,speed:0.0005+Math.random()*0.001});
    }
    layerBg.addChild(bgStarsGfx);
  }

  function updateBackground(ts){
    if(!bgStarsGfx)return;
    bgStarsGfx.clear();
    bgStarsData.forEach(s=>{
      const a=0.08+0.12*Math.sin(ts*s.speed+s.phase);
      bgStarsGfx.beginFill(0x3DBFB8,a);
      bgStarsGfx.drawCircle(s.x,s.y,s.r);
      bgStarsGfx.endFill();
    });
  }

  // ── Mapa sprites ──────────────────────────────────────────────────────────
  let dirtyTiles=new Set();
  function markTileDirty(r,c){dirtyTiles.add(r+'_'+c);}

  function rebuildMapSprites(){
    layerMap.removeChildren();
    spriteTiles={};
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      buildTileSprite(r,c);
    }
    dirtyTiles.clear();
  }

  function buildTileSprite(r,c){
    const key=r+'_'+c;
    if(spriteTiles[key]){layerMap.removeChild(spriteTiles[key]);delete spriteTiles[key];}
    const t=mapa[r][c];
    if(t===T_EMPTY) return;
    let tex;
    if(t===T_BRICK) tex=makeTexBrick();
    else if(t===T_STEEL) tex=makeTexSteel();
    else if(t===T_BASE) tex=makeTexBase(baseViva);
    else if(t===T_BUSH) tex=makeTexBush();
    else return;
    const sp=new PIXI.Sprite(tex);
    sp.x=c*TILE; sp.y=r*TILE;
    layerMap.addChild(sp);
    spriteTiles[key]=sp;
  }

  function updateDirtyTiles(){
    dirtyTiles.forEach(key=>{
      const [r,c]=[...key.split('_').map(Number)];
      buildTileSprite(r,c);
    });
    dirtyTiles.clear();
  }

  // ── Player sprite ─────────────────────────────────────────────────────────
  function ensurePlayerSprite(){
    if(!spritePlayer){
      spritePlayer=new PIXI.Sprite(makeTexPlayer(0));
      spritePlayer.anchor.set(0.5,0.5);
      spritePlayer.width=32; spritePlayer.height=32;
      layerGame.addChild(spritePlayer);
    }
    if(!spriteShield){
      spriteShield=new PIXI.Graphics();
      layerFx.addChild(spriteShield);
    }
  }

  const ROT_MAP={up:0,right:Math.PI/2,down:Math.PI,left:-Math.PI/2,
    upright:Math.PI/4,downright:3*Math.PI/4,downleft:-3*Math.PI/4,upleft:-Math.PI/4};

  function updatePlayerSprite(ts){
    if(!spritePlayer)return;
    const invul=helmetTimer>0;
    const parpadeo=invul&&Math.floor(ts/80)%2===0;
    spritePlayer.visible=!parpadeo;
    spritePlayer.texture=makeTexPlayer(player.frame);
    spritePlayer.x=player.x+player.w/2;
    spritePlayer.y=player.y+player.h/2;
    spritePlayer.rotation=ROT_MAP[player.dir]||0;

    // Shield — solo visible si hay escudo Y el player es visible en este frame
    spriteShield.clear();
    if(shieldTimer>0 && !parpadeo){
      const a=0.3+0.2*Math.sin(ts*0.005);
      spriteShield.lineStyle(2,0x5599ff,a);
      spriteShield.beginFill(0x5599ff,0.05);
      spriteShield.drawCircle(spritePlayer.x,spritePlayer.y,player.w/2+6);
      spriteShield.endFill();
    }
  }

  // ── Enemy sprites ─────────────────────────────────────────────────────────
  function syncEnemySprites(){
    // Eliminar sprites de enemigos muertos
    spriteEnemies.forEach((sp,id)=>{
      if(!enemies.find(e=>e.id===id)){
        layerGame.removeChild(sp.container);
        spriteEnemies.delete(id);
      }
    });
    // Crear/actualizar sprites
    enemies.forEach(e=>{
      if(!spriteEnemies.has(e.id)){
        const container=new PIXI.Container();
        const body=new PIXI.Sprite(makeTexEnemy(e.tipo,0));
        body.anchor.set(0.5,0.5);
        body.width=e.w; body.height=e.h;
        const hpBg=new PIXI.Graphics();
        const hpFill=new PIXI.Graphics();
        container.addChild(body);
        container.addChild(hpBg);
        container.addChild(hpFill);
        layerGame.addChild(container);
        spriteEnemies.set(e.id,{container,body,hpBg,hpFill});
      }
      const s=spriteEnemies.get(e.id);
      s.container.x=e.x+e.w/2;
      s.container.y=e.y+e.h/2;
      s.body.texture=makeTexEnemy(e.tipo,e.frame);
      s.body.rotation=ROT_MAP[e.dir]||0;
      s.body.tint=e.flashTimer>0&&Math.floor(Date.now()/60)%2===0 ? 0xffffff : 0xcccccc;

      // Barra de HP
      s.hpBg.clear(); s.hpFill.clear();
      if(e.maxHp>1){
        s.hpBg.beginFill(0x000000,0.6); s.hpBg.drawRect(-e.w/2,-e.h/2-6,e.w,3); s.hpBg.endFill();
        const ratio=e.hp/e.maxHp;
        s.hpFill.beginFill(ratio>0.5?0x3dbfb8:0xff4444,1);
        s.hpFill.drawRect(-e.w/2,-e.h/2-6,e.w*ratio,3);
        s.hpFill.endFill();
      }
    });
  }

  // ── Bullet sprites ─────────────────────────────────────────────────────────
  function updateBulletSprites(){
    // Bala jugador
    if(pBullet){
      if(!spriteBulletP){
        spriteBulletP=new PIXI.Sprite(makeTexBulletPlayer());
        spriteBulletP.anchor.set(0.5,0.5);
        if(PIXI.filters && PIXI.filters.BlurFilter){
          const bf=new PIXI.filters.BlurFilter(1,2);
          spriteBulletP.filters=[bf];
        }
        layerFx.addChild(spriteBulletP);
      }
      spriteBulletP.visible=true;
      spriteBulletP.x=pBullet.x;
      spriteBulletP.y=pBullet.y;
    } else if(spriteBulletP){
      spriteBulletP.visible=false;
    }

    // Trail
    while(spriteBulletTrail.length<7){
      const g=new PIXI.Graphics();
      layerFx.addChild(g);
      spriteBulletTrail.push(g);
    }
    spriteBulletTrail.forEach((g,i)=>{
      g.clear();
      if(pBulletTrail[i]){
        const a=(i/pBulletTrail.length)*0.5;
        const r=1.5*(i/pBulletTrail.length);
        g.beginFill(0xffee00,a);
        g.drawCircle(pBulletTrail[i].x,pBulletTrail[i].y,r);
        g.endFill();
      }
    });

    // Balas enemigas
    while(spriteBulletsE.length<eBullets.length){
      const sp=new PIXI.Sprite(makeTexBulletEnemy());
      sp.anchor.set(0.5,0.5);
      layerFx.addChild(sp);
      spriteBulletsE.push(sp);
    }
    spriteBulletsE.forEach((sp,i)=>{
      if(eBullets[i]){sp.visible=true;sp.x=eBullets[i].x;sp.y=eBullets[i].y;}
      else sp.visible=false;
    });
  }

  // ── Particles & Explosions (Graphics dinámicos) ────────────────────────────
  let gfxParticles=null, gfxExplosions=null;
  function ensureFxGraphics(){
    if(!gfxParticles){gfxParticles=new PIXI.Graphics();layerFx.addChild(gfxParticles);}
    if(!gfxExplosions){gfxExplosions=new PIXI.Graphics();layerFx.addChild(gfxExplosions);}
  }
  function drawFxGraphics(ts){
    ensureFxGraphics();
    gfxParticles.clear();
    particles.forEach(p=>{
      const a=p.life/p.maxLife;
      const col=hexToNum(p.color);
      gfxParticles.beginFill(col,a);
      gfxParticles.drawCircle(p.x,p.y,p.r*(0.5+0.5*a));
      gfxParticles.endFill();
    });
    gfxExplosions.clear();
    explosions.forEach(ex=>{
      const a=ex.life/ex.maxLife;
      const rf=ex.r*(1+(1-a)*1.5);
      // Core brillante
      gfxExplosions.beginFill(ex.color,a*0.9);
      gfxExplosions.drawCircle(ex.x,ex.y,rf);
      gfxExplosions.endFill();
      // Halo exterior
      gfxExplosions.beginFill(ex.color,a*0.2);
      gfxExplosions.drawCircle(ex.x,ex.y,rf*2);
      gfxExplosions.endFill();
    });
  }

  // ── Powerup sprites ───────────────────────────────────────────────────────
  function syncPowerupSprites(ts){
    spritePowerups.forEach((sp,id)=>{
      if(!powerups.find(p=>p.id===id)){layerGame.removeChild(sp);spritePowerups.delete(id);}
    });
    powerups.forEach(p=>{
      if(!spritePowerups.has(p.id)){
        const sp=new PIXI.Sprite(makeTexPowerup(p.tipo));
        sp.anchor.set(0.5,0.5);
        layerGame.addChild(sp);
        spritePowerups.set(p.id,sp);
      }
      const sp=spritePowerups.get(p.id);
      const blink=Math.floor(ts/350)%2===0;
      sp.visible=!blink;
      sp.x=p.x+TILE; sp.y=p.y+TILE;
      sp.rotation=Math.sin(ts*0.002)*0.15;
      sp.scale.set(0.9+0.1*Math.sin(ts*0.004));
    });
  }

  // ── HUD Pixi ──────────────────────────────────────────────────────────────
  function buildHUDSprites(){
    layerHUD.removeChildren();
    hudPuBars=[];

    // Contador enemigos
    hudEnemyText=new PIXI.Text('',{fontFamily:'monospace',fontSize:8,fill:0xff5555,fontWeight:'bold'});
    hudEnemyText.x=W-2; hudEnemyText.y=4; hudEnemyText.anchor.set(1,0);
    layerHUD.addChild(hudEnemyText);

    // Barra armor base
    hudArmorBar=new PIXI.Graphics();
    hudArmorFill=new PIXI.Graphics();
    hudArmorText=new PIXI.Text('',{fontFamily:'monospace',fontSize:7,fill:0xffffff});
    hudArmorText.anchor.set(0.5,0.5);
    layerHUD.addChild(hudArmorBar);
    layerHUD.addChild(hudArmorFill);
    layerHUD.addChild(hudArmorText);

    // Power-up bars (3 max)
    for(let i=0;i<3;i++){
      const g=new PIXI.Graphics();
      const t=new PIXI.Text('',{fontFamily:'serif',fontSize:8,fill:0xffffff});
      layerHUD.addChild(g); layerHUD.addChild(t);
      hudPuBars.push({g,t});
    }
  }

  function updateHUDSprites(ts){
    if(!hudEnemyText)return;
    const rem=enemies.length+spawnQueue.length;
    hudEnemyText.text='ENE:'+rem;

    // Armor bar
    hudArmorBar.clear(); hudArmorFill.clear(); hudArmorText.text='';
    if(baseArmorTimer>0){
      const pct=baseArmorTimer/12000;
      hudArmorBar.beginFill(0x111111,0.8); hudArmorBar.drawRect(W/2-40,H-14,80,10); hudArmorBar.endFill();
      hudArmorFill.beginFill(pct>0.5?0x3dbfb8:0xff8800,1);
      hudArmorFill.drawRect(W/2-40,H-14,80*pct,10); hudArmorFill.endFill();
      hudArmorText.text='🏰 '+Math.ceil(baseArmorTimer/1000)+'s';
      hudArmorText.x=W/2; hudArmorText.y=H-9;
    }

    // PU bars
    const active=[];
    if(shieldTimer>0) active.push({icon:'🛡',t:shieldTimer,max:8000,col:0x5599ff});
    if(rapidTimer>0)  active.push({icon:'⚡',t:rapidTimer, max:7000,col:0xff44ff});
    if(helmetTimer>0) active.push({icon:'🪖',t:helmetTimer,max:6000,col:0xffdd00});
    hudPuBars.forEach((bar,i)=>{
      bar.g.clear(); bar.t.text='';
      if(active[i]){
        const {icon,t,max,col}=active[i];
        const x=2+i*42;
        bar.g.beginFill(0x111111,0.7); bar.g.drawRect(x,2,38,10); bar.g.endFill();
        bar.g.beginFill(col,0.7); bar.g.drawRect(x,2,38*(t/max),10); bar.g.endFill();
        bar.t.text=icon; bar.t.x=x+3; bar.t.y=7; bar.t.anchor.set(0,0.5);
      }
    });
  }

  // ── Screen flash & shake (overlay) ────────────────────────────────────────
  let gfxFlash=null;
  function ensureFlash(){
    if(!gfxFlash){gfxFlash=new PIXI.Graphics();layerOverlay.addChild(gfxFlash);}
  }
  function updateFlashAndShake(ts){
    ensureFlash();
    gfxFlash.clear();
    if(screenFlashTimer>0){
      const a=(screenFlashTimer/300)*0.35;
      gfxFlash.beginFill(screenFlashColor,a);
      gfxFlash.drawRect(0,0,W,H);
      gfxFlash.endFill();
    }
    // Shake: mover solo los layers de juego, nunca el stage completo
    if(shakeTimer>0){
      const intensity=shakeIntensity*(shakeTimer/350);
      const ox=(Math.random()-.5)*intensity;
      const oy=(Math.random()-.5)*intensity;
      layerBg.x=ox;   layerBg.y=oy;
      layerMap.x=ox;  layerMap.y=oy;
      layerGame.x=ox; layerGame.y=oy;
      layerFx.x=ox;   layerFx.y=oy;
    } else {
      layerBg.x=0;   layerBg.y=0;
      layerMap.x=0;  layerMap.y=0;
      layerGame.x=0; layerGame.y=0;
      layerFx.x=0;   layerFx.y=0;
    }
  }

  // ── Scanlines ─────────────────────────────────────────────────────────────
  let gfxScanlines=null, scanOff=0;
  function buildScanlines(){
    if(!gfxScanlines){gfxScanlines=new PIXI.Graphics();layerOverlay.addChild(gfxScanlines);}
  }
  function updateScanlines(dt){
    if(!gfxScanlines)return;
    scanOff=(scanOff+dt*0.03)%4;
    gfxScanlines.clear();
    for(let y=scanOff|0;y<H;y+=4){
      gfxScanlines.beginFill(0x000000,0.07);
      gfxScanlines.drawRect(0,y,W,2);
      gfxScanlines.endFill();
    }
  }

  // ── Overlays fin / pausa ──────────────────────────────────────────────────
  function drawPausaPixi(){
    layerOverlay.removeChildren();
    gfxFlash=null; gfxScanlines=null;
    buildScanlines();
    ensureFlash();
    const bg=new PIXI.Graphics();
    bg.beginFill(0x000000,0.65); bg.drawRect(0,0,W,H); bg.endFill();
    layerOverlay.addChild(bg);
    const t=new PIXI.Text('PAUSA',{fontFamily:'Righteous,cursive',fontSize:26,fill:0x3dbfb8,fontWeight:'bold'});
    t.anchor.set(0.5,0.5); t.x=W/2; t.y=H/2;
    layerOverlay.addChild(t);
  }

  function drawFinPixi(){
    // Ocultar todos los layers de juego para que el overlay sea lo único visible
    layerBg.visible=false;
    layerMap.visible=false;
    layerGame.visible=false;
    layerFx.visible=false;
    layerHUD.visible=false;

    layerOverlay.removeChildren();
    gfxFlash=null; gfxScanlines=null;
    const bg=new PIXI.Graphics();
    bg.beginFill(0x000000,0.92); bg.drawRect(0,0,W,H); bg.endFill();
    layerOverlay.addChild(bg);
    const msg=baseViva?'GAME OVER':'💥 BASE DESTRUIDA';
    const t1=new PIXI.Text(msg,{fontFamily:'Righteous,cursive',fontSize:20,fill:0xff4d4d,fontWeight:'bold'});
    t1.anchor.set(0.5,0.5); t1.x=W/2; t1.y=H/2-48; layerOverlay.addChild(t1);
    const t2=new PIXI.Text('Puntos: '+score,{fontFamily:'Righteous,cursive',fontSize:15,fill:0x3dbfb8,fontWeight:'bold'});
    t2.anchor.set(0.5,0.5); t2.x=W/2; t2.y=H/2-16; layerOverlay.addChild(t2);
    const t3=new PIXI.Text('Récord: '+hiScore,{fontFamily:'Righteous,cursive',fontSize:13,fill:0xd4831a});
    t3.anchor.set(0.5,0.5); t3.x=W/2; t3.y=H/2+4; layerOverlay.addChild(t3);
    const t4=new PIXI.Text('Nivel: '+nivel,{fontFamily:'Righteous,cursive',fontSize:13,fill:0xd4831a});
    t4.anchor.set(0.5,0.5); t4.x=W/2; t4.y=H/2+22; layerOverlay.addChild(t4);
    const t5=new PIXI.Text('Tocá Reiniciar para jugar de nuevo',{fontFamily:'monospace',fontSize:9,fill:0x555555});
    t5.anchor.set(0.5,0.5); t5.x=W/2; t5.y=H/2+48; layerOverlay.addChild(t5);
    layerOverlay.visible=true;
  }

  // ── Game loop ─────────────────────────────────────────────────────────────
  function gameLoop(ts){
    if(!pixiReady)return;
    const dt=Math.min(ts-lastTs,80); lastTs=ts;
    if(estado==='jugando') update(dt);
    updateBackground(ts);
    updateDirtyTiles();
    syncEnemySprites();
    updatePlayerSprite(ts);
    updateBulletSprites();
    drawFxGraphics(ts);
    syncPowerupSprites(ts);
    updateHUDSprites(ts);
    updateFlashAndShake(ts);
    updateScanlines(dt);
  }

  // ── HUD DOM ───────────────────────────────────────────────────────────────
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

  // ── Input ─────────────────────────────────────────────────────────────────
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
    if(estado==='jugando'){
      estado='pausa';
      stopLoop();
      drawPausaPixi();
    } else if(estado==='pausa'){
      estado='jugando';
      layerOverlay.removeChildren();
      gfxFlash=null; gfxScanlines=null;
      buildScanlines(); ensureFlash();
      lastTs=performance.now();
      startLoop();
    }
    const btn=document.getElementById('btnBattlePausa');
    if(btn)btn.textContent=estado==='pausa'?'▶ Reanudar':'⏸ Pausa';
  };

  window.battleReset=()=>{
    stopLoop();
    keysDown={};pBullet=null;eBullets=[];enemies=[];powerups=[];particles=[];explosions=[];
    pBulletTrail=[];shakeTimer=0;screenFlashTimer=0;
    score=0;vidas=3;nivel=1;baseViva=true;
    shieldTimer=0;rapidTimer=0;helmetTimer=0;
    spriteEnemies.forEach(s=>layerGame.removeChild(s.container));
    spriteEnemies.clear();
    spritePowerups.forEach(sp=>layerGame.removeChild(sp));
    spritePowerups.clear();
    if(spriteBulletP){layerFx.removeChild(spriteBulletP);spriteBulletP=null;}
    layerOverlay.removeChildren(); gfxFlash=null; gfxScanlines=null;
    layerBg.visible=true; layerMap.visible=true; layerGame.visible=true;
    layerFx.visible=true; layerHUD.visible=true; layerOverlay.visible=true;
    textures={};
    generateMap(1);initPlayer();setupWave();hud();
    rebuildMapSprites();
    buildScanlines(); ensureFlash();
    ensurePlayerSprite();
    estado='jugando';
    const btnP=document.getElementById('btnBattlePausa');
    if(btnP)btnP.textContent='⏸ Pausa';
    lastTs=performance.now();
    startLoop();
  };

  // ── Carga dinámica de PixiJS ───────────────────────────────────────────────
  function loadPixi(cb){
    if(window.PIXI){cb();return;}
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.3.2/pixi.min.js';
    s.onload=cb;
    s.onerror=()=>{console.error('[Battle] No se pudo cargar PixiJS');};
    document.head.appendChild(s);
  }

  // ── Loop con RAF manual (control total sobre cuándo corre la lógica) ──────
  let rafId=null, loopActive=false;

  function startLoop(){
    loopActive=true;
    lastTs=performance.now();
    function frame(ts){
      if(!loopActive)return;
      gameLoop(ts);
      rafId=requestAnimationFrame(frame);
    }
    rafId=requestAnimationFrame(frame);
  }

  function stopLoop(){
    loopActive=false;
    if(rafId){cancelAnimationFrame(rafId);rafId=null;}
  }

  window.battleInit=()=>{
    const canvasEl=document.getElementById('battleCanvas');
    if(!canvasEl){console.error('[battleInit] #battleCanvas no encontrado');return;}

    document.removeEventListener('keydown',onKD);
    document.removeEventListener('keyup',onKU);
    document.addEventListener('keydown',onKD);
    document.addEventListener('keyup',onKU);

    hiScore=parseInt(localStorage.getItem('battleHiC')||'0');

    loadPixi(()=>{
      initPixi(canvasEl);
      // El ticker de Pixi maneja el render del canvas — siempre corriendo
      // Nuestro RAF maneja la lógica del juego por separado
      window.battleReset();
    });
  };

  Object.defineProperty(window,'battleRunning',{get:()=>estado==='jugando',configurable:true,enumerable:true});
})();
