(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const wrap = document.querySelector('.game-wrap');
  const W = canvas.width, H = canvas.height;
  const keys = new Set();
  const pointer = { x: W / 2, y: H / 2, down: false };
  const controls = { x: 0, y: 0, fire: false };
  let state = 'menu', last = 0, clock = 0, score = 0, wave = 0, health = 100, bond = 0;
  let enemies = [], bullets = [], enemyShots = [], drops = [], particles = [];
  let spawnLeft = 0, spawnTimer = 0, fireTimer = 0, invuln = 0, pulseFlash = 0, shake = 0;
  let audioOn = false, audioCtx = null;
  const player = { x: W / 2, y: H / 2, r: 13, speed: 218, angle: 0 };
  const companions = [
    { name: 'MOSSBYTE', icon: '◉', color: '#b8ee73' },
    { name: 'EMBERKIT', icon: '✦', color: '#ff9869' },
    { name: 'TIDETIP', icon: '◆', color: '#79d9e3' },
    { name: 'MOSSBYTE', icon: '◉', color: '#b8ee73' }
  ];
  const decor = [];
  let seed = 92;
  const rand = (a, b) => { seed = (seed * 1664525 + 1013904223) >>> 0; return a + (seed / 4294967296) * (b - a); };
  for (let i = 0; i < 44; i++) decor.push({ x: rand(20, W - 20), y: rand(20, H - 20), r: rand(12, 34), type: i % 4, phase: rand(0, 7) });

  function resizePointer(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) * W / r.width;
    pointer.y = (e.clientY - r.top) * H / r.height;
  }
  canvas.addEventListener('pointermove', resizePointer);
  canvas.addEventListener('pointerdown', e => { resizePointer(e); pointer.down = true; canvas.setPointerCapture?.(e.pointerId); });
  window.addEventListener('pointerup', () => { pointer.down = false; });
  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase(); keys.add(key);
    if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) e.preventDefault();
    if ((key === 'e' || key === ' ') && state === 'playing') usePulse();
    if ((key === 'escape' || key === 'p') && state === 'playing') pause();
    else if ((key === 'escape' || key === 'p') && state === 'paused') resume();
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  $('resumeBtn').addEventListener('click', resume);
  $('pulseBtn').addEventListener('click', usePulse);
  $('soundToggle').addEventListener('click', () => {
    audioOn = !audioOn; $('soundState').textContent = audioOn ? 'ON' : 'OFF';
    if (audioOn && !audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioOn) beep(520, .07, .035);
  });

  // Touch joystick and action controls are deliberately independent of the canvas aim.
  const stick = $('stick');
  let stickId = null, stickCenter = null;
  function moveStick(e) {
    if (e.pointerId !== stickId) return;
    const dx = e.clientX - stickCenter.x, dy = e.clientY - stickCenter.y;
    const max = 33, d = Math.hypot(dx, dy), scale = d > max ? max / d : 1;
    controls.x = dx * scale / max; controls.y = dy * scale / max;
    stick.querySelector('i').style.transform = `translate(${controls.x * max}px,${controls.y * max}px)`;
  }
  stick.addEventListener('pointerdown', e => { e.preventDefault(); stickId = e.pointerId; const r = stick.getBoundingClientRect(); stickCenter = {x:r.left+r.width/2,y:r.top+r.height/2}; stick.setPointerCapture(e.pointerId); moveStick(e); });
  stick.addEventListener('pointermove', moveStick);
  const resetStick = e => { if (e.pointerId !== stickId) return; stickId = null; controls.x = controls.y = 0; stick.querySelector('i').style.transform = ''; };
  stick.addEventListener('pointerup', resetStick); stick.addEventListener('pointercancel', resetStick);
  $('touchFire').addEventListener('pointerdown', e => { e.preventDefault(); controls.fire = true; $('touchFire').setPointerCapture(e.pointerId); });
  $('touchFire').addEventListener('pointerup', () => controls.fire = false); $('touchFire').addEventListener('pointercancel', () => controls.fire = false);
  $('touchPulse').addEventListener('pointerdown', e => { e.preventDefault(); usePulse(); });

  function beep(freq, duration, volume) {
    if (!audioOn || !audioCtx) return;
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.frequency.value = freq; osc.type = 'triangle'; gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration);
  }
  function startGame() {
    state = 'playing'; clock = 0; score = 0; wave = 0; health = 100; bond = 0;
    enemies = []; bullets = []; enemyShots = []; drops = []; particles = [];
    player.x = W / 2; player.y = H / 2; invuln = 1; wrap.classList.add('playing');
    $('menuOverlay').hidden = true; $('resultOverlay').hidden = true; $('hud').hidden = false;
    $('pauseBadge').hidden = true; $('touchControls').hidden = false;
    startWave(); updateHud();
  }
  function startWave() {
    wave++;
    spawnLeft = [5, 8, 11, 0][wave - 1];
    if (wave === 4) spawnLeft = 1;
    spawnTimer = .7;
    $('waveText').innerHTML = `${String(wave).padStart(2,'0')} <small>/ 04</small>`;
    $('waveStatus').textContent = wave === 4 ? 'RIFT BEAST' : 'HOSTILES ACTIVE';
    $('companionName').textContent = companions[wave - 1].name;
    $('companionIcon').textContent = companions[wave - 1].icon;
    $('companionIcon').style.color = '#183224'; $('companionIcon').style.background = companions[wave - 1].color;
    burst(W/2, H/2, '#c8f36a', 18, 110);
  }
  function pause() { state = 'paused'; $('pauseBadge').hidden = false; }
  function resume() { state = 'playing'; $('pauseBadge').hidden = true; last = performance.now(); }
  function endGame(won) {
    state = 'result'; $('hud').hidden = true; $('pauseBadge').hidden = true; $('touchControls').hidden = true;
    $('resultOverlay').hidden = false; $('resultKicker').textContent = won ? 'RIFT CLEARED' : 'RUN TERMINATED';
    $('resultTitle').innerHTML = won ? 'YOU MADE<br><span>IT OUT.</span>' : 'THE WILD<br><span>WON THIS ONE.</span>';
    $('resultCopy').textContent = won ? 'The wilds will remember this one.' : 'Catch your breath. The Rift will still be here.';
    $('finalScore').textContent = String(score).padStart(4,'0');
    $('againBtn').querySelector('span').textContent = won ? 'RUN IT BACK' : 'TRY AGAIN';
  }
  function updateHud() {
    $('healthText').textContent = Math.ceil(health);
    $('healthBar').style.width = `${Math.max(0, health)}%`;
    $('scoreText').textContent = String(score).padStart(4,'0');
    $('bondText').textContent = `${Math.floor(bond)}%`;
    $('bondBar').style.width = `${bond}%`;
    $('pulseBtn').classList.toggle('ready', bond >= 100);
  }
  function addBond(n) { bond = Math.min(100, bond + n); updateHud(); }
  function usePulse() {
    if (state !== 'playing' || bond < 100) return;
    bond = 0; pulseFlash = .65; shake = 7; beep(210, .28, .09);
    for (const e of [...enemies]) {
      if (Math.hypot(e.x-player.x,e.y-player.y) < (e.boss ? 195 : 170)) damageEnemy(e, e.boss ? 3 : 99);
    }
    burst(player.x, player.y, companions[wave-1]?.color || '#c8f36a', 48, 260); updateHud();
  }
  function spawnEnemy(type) {
    const side = Math.floor(rand(0,4));
    let x = side === 0 ? -25 : side === 1 ? W+25 : rand(20,W-20);
    let y = side === 2 ? -25 : side === 3 ? H+25 : rand(20,H-20);
    if (Math.hypot(x-player.x,y-player.y) < 220) { x = x < W/2 ? -25 : W+25; y = rand(25,H-25); }
    const boss = type === 'boss';
    enemies.push({x,y,r:boss?29:(type==='brute'?18:13),hp:boss?28:(type==='brute'?4:2),maxHp:boss?28:(type==='brute'?4:2),speed:boss?46:(type==='brute'?56:78)+wave*5,boss,type,attack:rand(.8,2),hit:0,phase:rand(0,6)});
  }
  function shoot() {
    let target = pointer;
    if (controls.fire || (matchMedia('(pointer: coarse)').matches && !pointer.down)) {
      let closest = null, best = Infinity;
      for (const e of enemies) { const d = Math.hypot(e.x-player.x,e.y-player.y); if (d<best) best=d,closest=e; }
      if (closest) target = closest;
    }
    const a = Math.atan2(target.y-player.y,target.x-player.x); player.angle = a;
    bullets.push({x:player.x+Math.cos(a)*17,y:player.y+Math.sin(a)*17,vx:Math.cos(a)*540,vy:Math.sin(a)*540,life:.85,r:4});
    fireTimer = .19; beep(330+Math.random()*90,.055,.022);
    burst(player.x+Math.cos(a)*17,player.y+Math.sin(a)*17,'#ffe7a0',2,45);
  }
  function damageEnemy(e, amount) {
    if (!enemies.includes(e)) return;
    e.hp -= amount; e.hit = .1;
    if (e.hp <= 0) {
      enemies.splice(enemies.indexOf(e),1); score += e.boss ? 500 : e.type==='brute'?80:50;
      addBond(e.boss ? 45 : 9);
      burst(e.x,e.y,e.boss?'#ff8b67':'#e6ecac',e.boss?30:12,e.boss?180:110);
      if (!e.boss) drops.push({x:e.x,y:e.y,r:7,life:14,spin:rand(0,6)});
      updateHud(); beep(e.boss?130:660,.12,.045);
    }
  }
  function burst(x,y,color,count,speed) {
    for(let i=0;i<count;i++){const a=rand(0,Math.PI*2),v=rand(speed*.2,speed);particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.2,.65),max:.65,color,size:rand(1,4)});}
  }
  function update(dt) {
    if (state !== 'playing') return;
    clock += dt; fireTimer -= dt; invuln -= dt; pulseFlash = Math.max(0,pulseFlash-dt); shake = Math.max(0,shake-dt*18);
    let mx = (keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+controls.x;
    let my = (keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+controls.y;
    let ml = Math.hypot(mx,my); if(ml>1){mx/=ml;my/=ml;}
    player.x = Math.max(24,Math.min(W-24,player.x+mx*player.speed*dt));
    player.y = Math.max(24,Math.min(H-24,player.y+my*player.speed*dt));
    if (pointer.down || controls.fire) { if(fireTimer<=0) shoot(); }
    else if (matchMedia('(pointer: coarse)').matches && enemies.length && fireTimer<=0) shoot();
    spawnTimer -= dt;
    if (spawnLeft > 0 && spawnTimer <= 0) {
      if(wave===4 && spawnLeft===1) spawnEnemy('boss');
      else spawnEnemy(wave>=3 && Math.random()<.25?'brute':'scout');
      spawnLeft--; spawnTimer = Math.max(.48,1.15-wave*.12);
    }
    if (spawnLeft===0 && enemies.length===0) {
      if(wave>=4){endGame(true);return;}
      spawnTimer -= dt;
      if(spawnTimer < -1.35) { score+=100; updateHud(); startWave(); }
    }
    for (let i=bullets.length-1;i>=0;i--) {
      const b=bullets[i]; b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      let hit=false;
      for(const e of [...enemies]) if(Math.hypot(e.x-b.x,e.y-b.y)<e.r+b.r){damageEnemy(e,1);hit=true;break;}
      if(hit||b.life<=0||b.x<0||b.x>W||b.y<0||b.y>H) bullets.splice(i,1);
    }
    for(const e of [...enemies]) {
      e.hit=Math.max(0,e.hit-dt);e.phase+=dt*2;
      const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;
      if(e.type==='ranged'&&d<215){ e.x-=dx/d*e.speed*dt*.25;e.y-=dy/d*e.speed*dt*.25; }
      else {e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt;}
      if(e.boss){e.attack-=dt;if(e.attack<=0){e.attack=1.6;enemyShots.push({x:e.x,y:e.y,vx:dx/d*145,vy:dy/d*145,life:3,r:7});}}
      if(d<e.r+player.r && invuln<=0){health-=e.boss?18:12;invuln=.7;shake=6;burst(player.x,player.y,'#ff765f',9,120);updateHud();if(health<=0){health=0;updateHud();endGame(false);return;}}
    }
    for(let i=enemyShots.length-1;i>=0;i--){const b=enemyShots[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(Math.hypot(b.x-player.x,b.y-player.y)<b.r+player.r&&invuln<=0){enemyShots.splice(i,1);health-=14;invuln=.7;shake=6;updateHud();if(health<=0){health=0;updateHud();endGame(false);return;}}else if(b.life<=0)enemyShots.splice(i,1);}
    for(let i=drops.length-1;i>=0;i--){const d=drops[i];d.life-=dt;d.spin+=dt*3;const dist=Math.hypot(player.x-d.x,player.y-d.y);if(dist<120){d.x+=(player.x-d.x)*dt*1.6;d.y+=(player.y-d.y)*dt*1.6;}if(dist<player.r+d.r+5){drops.splice(i,1);score+=25;addBond(6);burst(d.x,d.y,'#c8f36a',7,70);updateHud();}else if(d.life<=0)drops.splice(i,1);}
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt;if(p.life<=0)particles.splice(i,1);}
  }
  function drawBackground() {
    ctx.fillStyle='#263a31';ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(198,224,175,.045)';ctx.lineWidth=1;
    for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    // worn trails and damp clearings
    ctx.fillStyle='rgba(174,157,111,.08)';ctx.beginPath();ctx.ellipse(510,290,300,65,-.38,0,Math.PI*2);ctx.fill();
    decor.forEach(d=>{
      const sway=Math.sin(clock*.7+d.phase)*2;
      if(d.type===0){ctx.fillStyle='#334a39';ctx.beginPath();ctx.ellipse(d.x,d.y,d.r,d.r*.55,sway*.02,0,Math.PI*2);ctx.fill();ctx.fillStyle='#496447';ctx.beginPath();ctx.ellipse(d.x-3,d.y-3,d.r*.55,d.r*.3,0,0,Math.PI*2);ctx.fill();}
      else if(d.type===1){ctx.fillStyle='#31493b';ctx.beginPath();ctx.arc(d.x,d.y,d.r*.48,0,Math.PI*2);ctx.fill();ctx.fillStyle='#668351';ctx.beginPath();ctx.arc(d.x-2,d.y-3,d.r*.27,0,Math.PI*2);ctx.fill();}
      else if(d.type===2){ctx.strokeStyle='#b7ad78';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(d.x,d.y+5);ctx.lineTo(d.x+sway,d.y-d.r*.4);ctx.stroke();ctx.fillStyle='#a5a66a';ctx.beginPath();ctx.ellipse(d.x+sway,d.y-d.r*.3,4,8,-.4,0,Math.PI*2);ctx.fill();}
      else {ctx.fillStyle='#435348';ctx.beginPath();ctx.ellipse(d.x,d.y,d.r*.48,d.r*.32,.4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#5e6b51';ctx.beginPath();ctx.arc(d.x-2,d.y-2,d.r*.2,0,Math.PI*2);ctx.fill();}
    });
    // broken boundary stakes
    ctx.strokeStyle='rgba(210,225,182,.18)';ctx.setLineDash([3,8]);ctx.strokeRect(12,12,W-24,H-24);ctx.setLineDash([]);
    ctx.fillStyle='#a8bd87';ctx.font='8px DM Mono, monospace';ctx.fillText('ZONE 07  /  THE BRAMBLE',24,29);
  }
  function drawPlayer() {
    ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);
    if(invuln>0 && Math.floor(clock*18)%2===0)ctx.globalAlpha=.5;
    // muzzle
    ctx.fillStyle='#f8c770';ctx.fillRect(5,-3,19,6);ctx.fillStyle='#283c35';ctx.fillRect(12,-2,11,4);
    ctx.fillStyle='#183027';ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#9dc971';ctx.beginPath();ctx.arc(0,0,11,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d5e79b';ctx.beginPath();ctx.arc(-2,-3,6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#22392e';ctx.beginPath();ctx.arc(2,-3,1.4,0,Math.PI*2);ctx.fill();
    ctx.restore();
    // tiny companion follows behind
    const cx=player.x-Math.cos(player.angle)*25,cy=player.y-Math.sin(player.angle)*25+Math.sin(clock*5)*3;
    ctx.fillStyle=companions[Math.max(0,wave-1)]?.color||'#b8ee73';ctx.beginPath();ctx.arc(cx,cy,7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#203b2a';ctx.beginPath();ctx.arc(cx+2,cy-1,1.2,0,Math.PI*2);ctx.fill();
  }
  function drawEnemy(e) {
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.sin(e.phase)*.08);
    const color=e.hit>0?'#fff1c8':e.boss?'#a34f49':e.type==='brute'?'#9b7955':'#68795a';
    ctx.fillStyle=e.boss?'#622f32':'#1b2c26';ctx.beginPath();ctx.ellipse(0,4,e.r*1.05,e.r*.78,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(0,0,e.r*.8,e.r*.68,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=e.boss?'#eeaa75':'#d7e6a3';
    ctx.beginPath();ctx.arc(-e.r*.28,-e.r*.15,e.boss?4:2.4,0,Math.PI*2);ctx.arc(e.r*.28,-e.r*.15,e.boss?4:2.4,0,Math.PI*2);ctx.fill();
    if(e.boss){ctx.fillStyle='#d7bd75';ctx.beginPath();ctx.moveTo(-14,-17);ctx.lineTo(-21,-30);ctx.lineTo(-6,-21);ctx.fill();ctx.beginPath();ctx.moveTo(14,-17);ctx.lineTo(22,-29);ctx.lineTo(6,-21);ctx.fill();}
    ctx.restore();
    if(e.hp<e.maxHp||e.boss){const bw=e.boss?54:30;ctx.fillStyle='#17231f';ctx.fillRect(e.x-bw/2,e.y-e.r-10,bw,4);ctx.fillStyle=e.boss?'#ff8264':'#c8f36a';ctx.fillRect(e.x-bw/2,e.y-e.r-10,bw*Math.max(0,e.hp/e.maxHp),4);}
  }
  function draw() {
    ctx.save();if(shake>0)ctx.translate(rand(-shake,shake),rand(-shake,shake));
    drawBackground();
    // ambience glimmers
    for(let i=0;i<18;i++){const x=(i*173+clock*7)%W,y=(i*83+Math.sin(clock+i)*25)%H;ctx.fillStyle=`rgba(213,232,153,${.16+.12*Math.sin(clock*2+i)})`;ctx.fillRect(x,y,2,2);}
    drops.forEach(d=>{ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.spin);ctx.fillStyle='#c8f36a';ctx.shadowColor='#c8f36a';ctx.shadowBlur=11;ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(7,0);ctx.lineTo(0,8);ctx.lineTo(-7,0);ctx.closePath();ctx.fill();ctx.restore();});
    bullets.forEach(b=>{ctx.fillStyle='#fff0b0';ctx.shadowColor='#ffe28a';ctx.shadowBlur=9;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;});
    enemyShots.forEach(b=>{ctx.fillStyle='#ff8567';ctx.shadowColor='#ff694d';ctx.shadowBlur=10;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;});
    enemies.forEach(drawEnemy);
    if(state==='playing'||state==='paused')drawPlayer();
    particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);});ctx.globalAlpha=1;
    if(pulseFlash>0){const r=(.65-pulseFlash)*360;ctx.strokeStyle=`rgba(194,242,112,${pulseFlash})`;ctx.lineWidth=5;ctx.beginPath();ctx.arc(player.x,player.y,r,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
  function loop(now) { const dt=Math.min(.033,(now-last)/1000||0); last=now; update(dt); draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
