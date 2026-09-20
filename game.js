/* Rendering and controls. Artwork is drawn from unchanged supplied PNG files. */
'use strict';
const {Race,CHARACTERS,LENGTH,opponents}=RaceEngine;
const $=id=>document.getElementById(id), canvas=$('world'), ctx=canvas.getContext('2d');
const images={}, W=1280,H=720,lanes=[326,441,556];
let selected='brown',order=[],round=0,race=null,view='selection',last=0,accumulator=0,particles=[],noticeUntil=0,ready=false;
let backgroundClock=0,finishShown=false,pausePrevious='racing';
let manualLandscape=false;
function orientationBlocked(){return matchMedia('(orientation: portrait)').matches&&!manualLandscape;}
$('play-rotated').onclick=()=>{manualLandscape=true;document.body.classList.add('manual-landscape');if(view==='paused')resume();};
const char=id=>CHARACTERS.find(c=>c.id===id);
function toggle(id,show){$(id).hidden=!show;}
function makePortrait(id){
 const out=document.createElement('canvas');out.width=250;out.height=230;
 const c=out.getContext('2d'); const b=SPRITE_BOUNDS[id];
 const scale=Math.min(220/b[2],205/b[3]);
 c.translate(250,0);c.scale(-1,1);
 c.drawImage(images[id],...b,(250-b[2]*scale)/2,225-b[3]*scale,b[2]*scale,b[3]*scale);
 return out;
}
async function load(){
 try{
  await Promise.all([...CHARACTERS.map(c=>c.id),'meadow'].map(id=>new Promise((resolve,reject)=>{
   const im=new Image(); im.onload=()=>{images[id]=im;resolve();};im.onerror=reject;im.src=`assets/${id}.png`;
  })));
  for(const c of CHARACTERS){
   const button=document.createElement('button');button.className='character';button.dataset.id=c.id;
   button.setAttribute('aria-label',c.name+'を選ぶ');button.setAttribute('aria-pressed',String(c.id===selected));
   button.append(makePortrait(c.id));const label=document.createElement('strong');label.textContent=c.name;button.append(label);
   button.addEventListener('click',()=>{selected=c.id;document.querySelectorAll('.character').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===selected)));$('start').textContent=c.name+'でスタート';});
   $('characters').append(button);
  }
  ready=true;$('start').disabled=false;$('start').textContent='ぽんでスタート';
 }catch(e){$('start').textContent='画像を読み込めませんでした';console.error(e);}
}
function startTournament(){order=opponents(selected);round=0;startRace();}
function startRace(){
 race=new Race(selected,order[round],Math.floor(Math.random()*1e8),round);particles=[];finishShown=false;view='race';accumulator=0;
 for(const id of ['selection','dialog'])toggle(id,false);
 for(const id of ['hud','controls','race-caption','countdown'])toggle(id,true);
 document.body.classList.add('racing');$('round').textContent=round+1;$('rival-name').textContent='相手：'+char(order[round]).name;
 $('player-label').textContent='あなた：'+char(selected).name;$('status-text').textContent='';$('pause').textContent='Ⅱ';
}
function goSelection(){race=null;view='selection';particles=[];document.body.classList.remove('racing');
 for(const id of ['hud','controls','race-caption','dialog','countdown'])toggle(id,false);toggle('selection',true);
}
function showDialog(kicker,title,detail,button,action,art=true){
 $('result-kicker').textContent=kicker;$('dialog-title').textContent=title;$('result-detail').textContent=detail;
 $('continue').textContent=button;$('continue').onclick=action;$('result-art').replaceChildren();
 toggle('result-art',art);toggle('wins',art);
 if(art)$('result-art').append(makePortrait(selected));
 $('wins').replaceChildren();if(art)order.forEach((id,i)=>{const s=document.createElement('span');s.textContent=(i<round||(i===round&&race.winner===selected)?'✓ ':'○ ')+char(id).name;s.className=i<round||(i===round&&race.winner===selected)?'won':'';$('wins').append(s);});
 toggle('dialog',true);toggle('controls',false);toggle('countdown',false);$('continue').focus({preventScroll:true});
}
function finish(){
 finishShown=true;view='result';const win=race.winner===selected;
 if(win&&round===3)showDialog('4 / 4 勝利','優勝！',char(selected).name+'が、野原のチャンピオン。','もう一度あそぶ',startTournament);
 else if(win)showDialog(`${round+1} / 4 勝利`,'ゴール！ あなたの勝ち',`次の相手は${char(order[round+1]).name}。`,`次のうさぎとレース`,()=>{round++;startRace();});
 else showDialog(`${round+1} / 4 戦`,char(order[round]).name+'の勝ち','どんぐりで加速して、もう一度！','同じ相手に再挑戦',startRace);
}
function pause(){if(!race||view!=='race'||race.state==='finished'||race.state==='paused')return;pausePrevious=race.state;race.state='paused';view='paused';
 showDialog('ひとやすみ','一時停止','準備ができたら、続きをどうぞ。','つづける',resume,false);
}
function resume(){if(orientationBlocked()||document.hidden)return;race.state=pausePrevious;view='race';toggle('dialog',false);toggle('controls',true);last=performance.now();accumulator=0;}
function input(action){if(view!=='race'||!race)return;if(action==='jump')race.jump(race.player);else race.move(race.player,action==='up'?-1:1);}
for(const id of ['up','down','jump']){
 $(id).addEventListener('pointerdown',e=>{e.preventDefault();$(id).setPointerCapture(e.pointerId);input(id);});
 // Keyboard activation through native button semantics, without double-firing pointer clicks.
 $(id).addEventListener('click',e=>{if(e.detail===0)input(id);});
}
$('start').addEventListener('click',startTournament);$('back').onclick=goSelection;$('pause').onclick=pause;
addEventListener('keydown',e=>{
 if(['ArrowUp','ArrowDown','Space'].includes(e.code)&&view==='race'){e.preventDefault();if(!e.repeat)input(e.code==='Space'?'jump':e.code==='ArrowUp'?'up':'down');}
 if((e.code==='Escape'||e.code==='KeyP')&&!e.repeat){if(view==='paused')resume();else pause();}
});
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen();}else{await $('game').requestFullscreen();try{await screen.orientation.lock('landscape');}catch{}}}catch{$('fullscreen').textContent='⛶';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});addEventListener('blur',pause);
matchMedia('(orientation: portrait)').addEventListener('change',e=>{if(e.matches&&!manualLandscape)pause();});
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
function rounded(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function flower(x,y,size=1){for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ellipse(x+Math.cos(a)*7*size,y+Math.sin(a)*7*size,5*size,5*size,'#fffbe2');}ellipse(x,y,4*size,4*size,'#f8db67');}
function meadow(camera){
 const sky=ctx.createLinearGradient(0,0,0,300);sky.addColorStop(0,'#63cbee');sky.addColorStop(1,'#b5e5ed');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 // Slow parallax clouds and hills behind the supplied transparent meadow art.
 for(let i=0;i<4;i++){const x=((i*420-camera*.10)%1680+1680)%1680-130;const y=155+(i%2)*34;ellipse(x,y,52,19,'#fffbee');ellipse(x+28,y-13,27,29,'#fffbee');ellipse(x+56,y,42,20,'#fffbee');}
 ctx.fillStyle='#83bea0';ctx.beginPath();ctx.moveTo(0,280);for(let x=0;x<=W;x+=8)ctx.lineTo(x,245+Math.sin((x+camera*.17)/200)*27);ctx.lineTo(W,400);ctx.lineTo(0,400);ctx.fill();
 ctx.fillStyle='#c3ea77';ctx.fillRect(0,285,W,H-285);
 if(images.meadow){const off=((camera*.3)%W+W)%W;for(let i=-1;i<2;i++)ctx.drawImage(images.meadow,0,675,2250,650,i*W-off,242,W,370);}
 // Three horizontal tracks keep the lane positions easy to read.
 lanes.forEach((y,l)=>{
  ctx.fillStyle=l%2?'#f5dca2':'#f2d69b';ctx.fillRect(0,y-28,W,57);
  for(let i=0;i<13;i++){const x=((i*130-camera)%1690+1690)%1690-80;ellipse(x,y+11*Math.sin(i*7+l),6+(i%3)*3,2.5,'#dabc813d');}
 });
 for(let i=0;i<20;i++){const x=((i*137-camera*.85)%2740+2740)%2740-50,y=[380,498,630,677][i%4];if(i%3===0)flower(x,y,.65+(i%2)*.25);else{ctx.strokeStyle='#89b757';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-4,y-9);ctx.moveTo(x+4,y);ctx.lineTo(x+8,y-11);ctx.stroke();}}
 // Foreground edge stays below the racers and touch buttons.
 ctx.fillStyle='#7db768';ctx.beginPath();ctx.moveTo(0,720);for(let x=0;x<=W;x+=10)ctx.lineTo(x,703+Math.sin((x+camera*.65)/48)*10);ctx.lineTo(W,H);ctx.fill();
}
function acorn(x,y,s=1,gold=false){ctx.save();ctx.translate(x,y);ctx.rotate(.3);ctx.scale(s,s);ctx.strokeStyle='#715036';ctx.lineWidth=3;ellipse(0,0,13,18,gold?'#ffe15c':'#cc934e');ctx.stroke();rounded(-17,-17,34,13,7,gold?'#dba62a':'#9f7045');ctx.stroke();ctx.beginPath();ctx.moveTo(0,-18);ctx.quadraticCurveTo(-2,-27,6,-27);ctx.stroke();ctx.restore();}
function obstacle(it,camera){const x=it.x-camera,y=lanes[it.lane];if(x<-100||x>W+100||it.taken)return;
 if(it.type==='rock'){ellipse(x,y+8,32,8,'#77754935');ctx.fillStyle='#9a9e95';ctx.strokeStyle='#74766d';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x-31,y+7);ctx.lineTo(x-26,y-15);ctx.quadraticCurveTo(x-6,y-48,x+14,y-31);ctx.quadraticCurveTo(x+32,y-20,x+33,y+8);ctx.closePath();ctx.fill();ctx.stroke();ellipse(x-8,y-12,4,5,'#7e8279');ellipse(x+16,y-2,3,5,'#7e8279');}
 else if(it.type==='ramp'){ctx.fillStyle='#be864d';ctx.strokeStyle='#85623b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-44,y+7);ctx.lineTo(x+36,y-30);ctx.lineTo(x+36,y+7);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#fff1ad';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x-17,y-2);ctx.lineTo(x+11,y-15);ctx.stroke();}
 else{
  const fall=it.type==='help'?Math.max(0,1-(race.time-it.spawned)/.45)*90:0;
  const cy=y-24-(it.z||0)+Math.sin(backgroundClock*5+it.id)*4-fall;
  if(it.type==='gold')ellipse(x,cy,24,27,'#fff6a366');
  if(it.type==='help'){ctx.save();ctx.globalAlpha=it.owner===selected?1:.4;ellipse(x,cy,25,28,'#e8ffebbb');ctx.strokeStyle='#599e59';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#396c42';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText(it.owner===selected?'あなた用':'相手用',x,cy-34);}
  ellipse(x,y+7,14,4,'#9b84372b');acorn(x,cy,.9,it.type==='gold');
  if(it.type==='gold'){ctx.fillStyle='#80651a';ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.fillText('×2',x,cy-31);}
  if(it.type==='help')ctx.restore();
 }
}
function car(r,camera){const x=r.x-camera,y=lanes[0]+r.y*115;
 if(x<-160||x>W+160)return;
 ellipse(x,y+12,47-r.z*.06,9-r.z*.012,'#52664335');
 ctx.save();if(r.invincible>0&&Math.floor(backgroundClock*13)%2===0)ctx.globalAlpha=.52;
 if(r.boost>0||r.gold>0){ctx.strokeStyle='#fff4a5';ctx.lineWidth=4;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x-75-i*8,y-r.z-12+i*9);ctx.lineTo(x-102-i*12,y-r.z-12+i*9);ctx.stroke();}}
 const b=SPRITE_BOUNDS[r.id],height=130,width=b[2]/b[3]*height;
 const bounce=r.z>0?0:Math.sin(backgroundClock*19)*1.2;
 ctx.save();ctx.translate(x,0);ctx.scale(-1,1);
 ctx.drawImage(images[r.id],...b,-width/2,y-height-r.z+12+bounce,width,height);ctx.restore();
 // Distinguish the player's car without changing the supplied face or drawing.
 const own=r===race.player;rounded(x-30,y-height-r.z-14,60,21,10,own?'#8c4a70':'#6e7560');ctx.fillStyle='#fffbee';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText(own?'あなた':'相手',x,y-height-r.z+1);
 ctx.restore();
}
function finishLine(camera){const x=LENGTH-camera;if(x<-50||x>W+50)return;ctx.fillStyle='#fffbe7';ctx.fillRect(x-8,278,300/10,300);for(let i=0;i<15;i++)for(let j=0;j<2;j++)if((i+j)%2===0){ctx.fillStyle='#786652';ctx.fillRect(x-8+j*15,278+i*20,15,20);}ctx.strokeStyle='#826748';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x,270);ctx.lineTo(x,193);ctx.stroke();ctx.fillStyle='#c47583';ctx.beginPath();ctx.moveTo(x,194);ctx.lineTo(x+48,208);ctx.lineTo(x,226);ctx.fill();}
function consumeEvents(){
 for(const e of race.events){
  if(e.type==='hit')for(let i=0;i<Math.max(3,e.lost);i++)particles.push({x:e.x,y:lanes[0]+e.y*115-30,vx:-65-Math.random()*110,vy:-150-Math.random()*100,life:.8,type:e.lost?'acorn':'dust'});
  if(e.id===selected){const messages={hit:e.lost?`どんぐり −${e.lost} · 減速`:'ぶつかった！ 減速',acorn:'どんぐり ＋1 · 加速！',gold:'金色どんぐり · 2倍速！',help:'お助けどんぐり · 加速！',helpSpawn:'お助けどんぐりが来たよ！',ramp:'ジャンプ台！'};if(messages[e.type]){$('status-text').textContent=messages[e.type];noticeUntil=backgroundClock+1.7;}}
 }
 race.events.length=0;
}
function render(){const camera=race?race.player.x-300:backgroundClock*18;meadow(camera);
 if(!race||!ready)return;
 finishLine(camera);
 const drawables=race.items.filter(it=>!it.taken).map(it=>({depth:it.lane,draw:()=>obstacle(it,camera)}));
 for(const r of [race.opponent,race.player])drawables.push({depth:r.y+.1,draw:()=>car(r,camera)});
 drawables.sort((a,b)=>a.depth-b.depth).forEach(d=>d.draw());
 for(const p of particles){ctx.save();ctx.globalAlpha=Math.max(0,p.life/.8);if(p.type==='acorn')acorn(p.x-camera,p.y,.6);else ellipse(p.x-camera,p.y,9,7,'#fff9df');ctx.restore();}
 // Opponent can leave the camera; show direction instead of hiding race information.
 const ox=race.opponent.x-camera;if(ox<40||ox>W-40){const x=ox<40?65:W-70;rounded(x-52,185,104,29,15,'#fff9e9e8');ctx.fillStyle='#625141';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText(ox<40?'◀ 相手':'相手 ▶',x,205);}
 $('acorns').textContent=race.player.acorns;$('position').textContent=race.player.x>=race.opponent.x?'1位':'2位';
 $('speed-state').textContent=race.player.slow>0?'減速中':race.player.gold>0?'2倍速！':race.player.boost>0?'加速中！':'いつもの速さ';
 const pp=Math.min(100,race.player.x/LENGTH*100),op=Math.min(100,race.opponent.x/LENGTH*100);
 $('progress-fill').style.width=pp+'%';$('player-dot').style.left=pp+'%';$('rival-dot').style.left=op+'%';
 if(race.state==='countdown'){toggle('countdown',true);$('countdown').textContent=Math.ceil(race.countdown);}
 else if(race.state==='racing'&&race.time<.65){toggle('countdown',true);$('countdown').textContent='スタート！';}
 else toggle('countdown',false);
 if(backgroundClock>noticeUntil)$('status-text').textContent='';
}
function frame(now){const dt=last?Math.min((now-last)/1000,.05):0;last=now;
 const frozen=view==='paused'||document.hidden||orientationBlocked();
 if(!frozen){backgroundClock+=dt;if(race&&view==='race'){accumulator+=dt;while(accumulator>=1/120){race.update(1/120);accumulator-=1/120;}consumeEvents();if(race.state==='finished'&&!finishShown)finish();}
 for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=500*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);}
 render();requestAnimationFrame(frame);
}
// Read-only state for verification and bug reports; no debug controls in the game UI.
window.raceSnapshot=()=>({view,selected,order:[...order],round,state:race?.state,winner:race?.winner,player:race?{...race.player}:null,opponent:race?{...race.opponent}:null});
load();requestAnimationFrame(frame);
