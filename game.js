/* Rendering and controls. Artwork is drawn from unchanged supplied PNG files. */
'use strict';
const {Race,CHARACTERS,LENGTH,opponents}=RaceEngine;
const $=id=>document.getElementById(id), canvas=$('world'), ctx=canvas.getContext('2d');
const images={}, W=1280,H=720,lanes=[326,441,556];
let selected='brown',order=[],round=0,race=null,view='selection',last=0,accumulator=0,particles=[],noticeUntil=0,ready=false;
let backgroundClock=0,finishShown=false,pausePrevious='racing';
let manualLandscape=false,guidePrevious='countdown',seenStartGuide=false,seenGoldGuide=false;
let multiplayer=null,multiplayerToken='',multiplayerRole='',multiplayerResultShown=false,multiplayerClosing=false,multiplayerDisplay=null,multiplayerTargets=null,multiplayerDisplayRaceId='',multiplayerAttempt=0,invalidJoinLink=false;
function orientationBlocked(){return matchMedia('(orientation: portrait)').matches&&!manualLandscape;}
$('play-rotated').onclick=()=>{manualLandscape=true;document.body.classList.add('manual-landscape');if(view==='paused')resume();};
const char=id=>CHARACTERS.find(c=>c.id===id);
const inMultiplayer=()=>!!multiplayer;
function localRacer(){if(!race)return null;return multiplayerDisplay?.[multiplayer?.localSlot||'host']||(multiplayer?.localSlot==='guest'?race.opponent:race.player);}
function otherRacer(){if(!race)return null;const slot=multiplayer?.localSlot==='guest'?'host':'guest';return multiplayerDisplay?.[slot]||(multiplayer?.localSlot==='guest'?race.player:race.opponent);}
function localSlot(){return multiplayer?.localSlot||'host';}
function toggle(id,show){$(id).hidden=!show;}
function showGuide(kicker,title,detail,jumpTip=false){
 if(!race||view==='result')return;
 guidePrevious=race.state;if(!inMultiplayer())race.state='paused';view='guide';document.body.classList.toggle('show-jump-tip',jumpTip);
 $('guide-kicker').textContent=kicker;$('guide-title').textContent=title;$('guide-detail').textContent=detail;
 toggle('guide',true);$('guide-close').focus({preventScroll:true});
}
function closeGuide(){if(!race)return;if(!inMultiplayer())race.state=guidePrevious;view='race';document.body.classList.remove('show-jump-tip');toggle('guide',false);last=performance.now();accumulator=0;}
function portraitFlag(c){
 c.save();c.translate(54,198);c.rotate(-.18);c.strokeStyle='#76543c';c.lineWidth=3;c.lineCap='round';c.beginPath();c.moveTo(0,0);c.lineTo(0,-55);c.stroke();
 c.fillStyle='#ef9ba4';c.beginPath();c.moveTo(2,-53);c.lineTo(-33,-42);c.lineTo(2,-31);c.closePath();c.fill();c.strokeStyle='#bd6e7c';c.lineWidth=1.5;c.stroke();c.restore();
}
function makePortrait(id,flagged=false){
 const out=document.createElement('canvas');out.width=250;out.height=230;
 const c=out.getContext('2d'); const b=SPRITE_BOUNDS[id];
 const scale=Math.min(220/b[2],205/b[3]);
 if(flagged)portraitFlag(c);c.save();c.translate(250,0);c.scale(-1,1);
 c.drawImage(images[id],...b,(250-b[2]*scale)/2,225-b[3]*scale,b[2]*scale,b[3]*scale);
 c.restore();
 return out;
}
function refreshCharacterCards(){document.querySelectorAll('.character').forEach(button=>{const flagged=button.dataset.id===selected;button.setAttribute('aria-pressed',String(flagged));button.replaceChildren(makePortrait(button.dataset.id,flagged),button.label);});}
async function load(){
 try{
  await Promise.all([...CHARACTERS.map(c=>c.id),'meadow'].map(id=>new Promise((resolve,reject)=>{
   const im=new Image(); im.onload=()=>{images[id]=im;resolve();};im.onerror=reject;im.src=`assets/${id}.png`;
  })));
  for(const c of CHARACTERS){
   const button=document.createElement('button');button.className='character';button.dataset.id=c.id;
   button.setAttribute('aria-label',c.name+'を選ぶ');button.setAttribute('aria-pressed',String(c.id===selected));
   const label=document.createElement('strong');label.textContent=c.name;button.label=label;button.append(makePortrait(c.id,c.id===selected),label);
   button.addEventListener('click',()=>{selected=c.id;refreshCharacterCards();$('start').textContent=c.name+'でスタート';if(view==='lobby')$('multiplayer-ready').textContent=c.name+'で準備できた';});
   $('characters').append(button);
  }
  ready=true;$('start').disabled=false;$('multiplayer-start').disabled=false;$('start').textContent='ぽんでスタート';
  const joinToken=joinTokenFromLocation();if(joinToken)joinMultiplayerRoom(joinToken);else if(invalidJoinLink){showMultiplayerLobby('guest','');$('multiplayer-title').textContent='このリンクは使えません';setMultiplayerDetail('もう一度、相手のQRコードから開いてね。');$('multiplayer-ready').hidden=true;}
 }catch(e){$('start').textContent='画像を読み込めませんでした';console.error(e);}
}
function randomToken(){
 if(!window.crypto?.getRandomValues)return '';
 const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
function joinTokenFromLocation(){
 const hash=typeof location==='undefined'?'':location.hash||'',match=hash.match(/^#join=([0-9a-f]{32,})$/i);if(!match){if(hash.startsWith('#join=')){invalidJoinLink=true;try{history.replaceState(null,'',location.pathname+(location.search||''));}catch(_){}}return '';}
 try{history.replaceState(null,'',location.pathname+(location.search||''));}catch(_){}return match[1].toLowerCase();
}
function roomLink(token){return location.origin+location.pathname+'#join='+token;}
function multiplayerText(status){
 const map={
  waiting:'参加する人を待っています。',joining:'部屋を探しています。',joined:'うさぎさんを選んで、準備できたを押してね。',
  'waiting-for-guest':'QRコードを見せて、参加を待っています。','guest-joined':'うさぎさんを選んで、準備できたを押してね。',
  reconnecting:'接続を確認中。',aborted:'対戦を中断しました。','room-full':'この部屋はいっぱいです。',
  'version-mismatch':'2台ともページを再読み込みして、もう一度参加してね。','join-timeout':'部屋が見つかりません。','room-expired':'この部屋は期限切れです。','peer-timeout':'相手との接続が切れました。',
  disconnect:'接続が切れました。','send-failed':'接続できませんでした。','invalid-start':'対戦を始められませんでした。',
  'input-gap':'通信が途切れたため、対戦を中断しました。','race-timeout':'対戦を中断しました。',
  'frame-stall':'端末の動きが止まったため、対戦を中断しました。','start-timeout':'開始を確認できなかったため、対戦を中断しました。',
  'start-ack-timeout':'開始を確認できなかったため、対戦を中断しました。','hidden':'画面を閉じたため、対戦を中断しました。',
  portrait:'画面を縦向きにしたため、対戦を中断しました。',left:'対戦を終了しました。',recreate:'新しい部屋を作りました。',
  'peer-abort':'相手が対戦を中断しました。','input-overflow':'通信が多すぎたため、対戦を中断しました。'
 };return map[status]||'接続を確認しています。';
}
function setMultiplayerDetail(text){$('multiplayer-detail').textContent=text;}
function showMultiplayerLobby(role,token){
 multiplayerRole=role;multiplayerToken=token;view='lobby';race=null;particles=[];document.body.classList.remove('racing','show-jump-tip');document.body.dataset.multiplayerRole=role;
 document.body.classList.add('multiplayer-lobby');
 toggle('selection',true);toggle('select-bottom',false);toggle('multiplayer',true);
 for(const id of ['hud','controls','race-caption','dialog','guide','countdown'])toggle(id,false);
 $('multiplayer-kicker').textContent=role==='host'?'近くの人と対戦':'対戦に参加';$('multiplayer-title').textContent='うさぎさんを選んでね';
 setMultiplayerDetail(role==='host'?'部屋を作っています。':'部屋を探しています。');
 $('create-room').hidden=role!=='host';$('copy-room').hidden=role!=='host';$('multiplayer-ready').hidden=false;$('multiplayer-ready').disabled=true;
 $('multiplayer-ready').textContent=char(selected).name+'で準備できた';toggle('multiplayer-qr',false);toggle('multiplayer-link',false);
}
function displayRoomCode(token){
 const url=roomLink(token);$('multiplayer-link').textContent=url;toggle('multiplayer-link',true);
 const qr=$('multiplayer-qr');qr.replaceChildren();
 if(window.qrcode){try{const code=window.qrcode(0,'M');code.addData(url);code.make();qr.innerHTML=code.createSvgTag({scalable:true});toggle('multiplayer-qr',true);}catch(_){}}
}
function clientId(){return randomToken()||('local-'+Date.now().toString(36));}
async function beginMultiplayer(role,token){
 if(!ready)return;closeMultiplayer('recreate');const attempt=++multiplayerAttempt;showMultiplayerLobby(role,token);
 if(!window.RaceRealtime?.connect||!window.MultiplayerSession){setMultiplayerDetail('この端末では対戦を始められません。');return;}
 try{
  const transport=await window.RaceRealtime.connect({token});
  if(multiplayerClosing||attempt!==multiplayerAttempt||view!=='lobby'||multiplayerToken!==token){transport.close?.();return;}
  multiplayer=new window.MultiplayerSession({role,clientId:clientId(),roomEpoch:token,characterId:selected,transport,now:()=>performance.now(),onState:multiplayerState,onStatus:multiplayerStatus,onEvent:multiplayerEvent,onResult:multiplayerResult});
  multiplayer.start();
  $('multiplayer-ready').disabled=true;$('create-room').hidden=true;
  if(role==='host')displayRoomCode(token);
 }catch(_){setMultiplayerDetail('接続できませんでした。ひとりで遊ぶことはできます。');if(role==='host'){$('create-room').hidden=false;$('create-room').textContent='作り直す';}}
}
function createMultiplayerRoom(){const token=randomToken();if(!token){showMultiplayerLobby('host','');setMultiplayerDetail('この端末では部屋を作れません。');return;}beginMultiplayer('host',token);}
function joinMultiplayerRoom(token){if(token)beginMultiplayer('guest',token);}
function multiplayerStatus(status){
 if(!inMultiplayer())return;const detail=multiplayerText(status?.reason||status?.status);if(view==='lobby')setMultiplayerDetail(detail);
 if(['guest-joined','joined'].includes(status?.status))$('multiplayer-ready').disabled=!ready;
 if(status?.status==='rematch-waiting'&&view==='result'){$('continue').disabled=true;$('result-detail').textContent='相手の準備を待っています。';}
 if(status?.status==='rematch-offered'&&view==='result'){$('continue').disabled=false;$('result-detail').textContent='相手がもう一度あそぶのを待っています。';}
 if(status?.status==='result-closed'&&view==='result'){$('continue').disabled=true;$('result-detail').textContent='相手との接続が終わりました。もう一度遊ぶには、新しい部屋を作ってね。';}
 if(status?.status==='aborted'&&!multiplayerClosing)showMultiplayerAbort(detail);
}
function multiplayerState(snapshot){
 if(!inMultiplayer())return;race=multiplayer.race||null;
 if(multiplayer.localSlot==='guest'&&race){
  multiplayerTargets={host:{...race.player},guest:{...race.opponent}};
  const raceId=snapshot?.raceId||multiplayer.raceId||'';
  if(!multiplayerDisplay||raceId!==multiplayerDisplayRaceId){multiplayerDisplay={host:{...race.player},guest:{...race.opponent}};multiplayerDisplayRaceId=raceId;}
  refreshGuestDisplayLane();
 }else {multiplayerDisplay=null;multiplayerDisplayRaceId='';}
 const phase=snapshot?.phase||multiplayer.phase;
 if(['countdown','racing'].includes(phase)&&race)enterMultiplayerRace();
}
function enterMultiplayerRace(){
 if(view==='race')return;view='race';finishShown=false;multiplayerResultShown=false;accumulator=0;
 particles=[];
 document.body.classList.remove('multiplayer-lobby');
 for(const id of ['selection','multiplayer','dialog','guide'])toggle(id,false);
 for(const id of ['hud','controls','race-caption','countdown'])toggle(id,true);
 document.body.classList.add('racing');$('stage-label').textContent='近くの人と対戦';$('stage-name').textContent='1回勝負';$('rival-name').textContent='相手：'+char(otherRacer()?.id||'gray').name;
 $('player-label').textContent='あなた：'+char(localRacer()?.id||selected).name;$('status-text').textContent='';$('pause').textContent='×';
}
function multiplayerEvent(event){if(!inMultiplayer()||!race)return;presentEvent(event);}
function multiplayerResult(result){
 if(!inMultiplayer()||multiplayerResultShown)return;multiplayerResultShown=true;race=multiplayer.race||race;showMultiplayerResult(result);
}
function showMultiplayerResult(result){
 const winner=result?.winnerSlot;const title=winner===null?'引き分け！':winner===localSlot()?'ゴール！ あなたの勝ち':'ゴール！ 相手の勝ち';
 view='result';showDialog('対戦結果',title,'もう一度あそぶと、同じ部屋で再戦できます。','もう一度あそぶ',requestMultiplayerRematch,true,false);
}
function requestMultiplayerRematch(){
 if(!multiplayer?.requestRematch?.())return;
 $('continue').disabled=true;$('result-detail').textContent='相手の準備を待っています。';
}
function showMultiplayerAbort(detail='対戦を中断しました。'){
 if(multiplayerClosing)return;multiplayerClosing=true;const oldRole=multiplayerRole,session=multiplayer;multiplayer=null;session?.close();race=null;multiplayerDisplay=null;multiplayerTargets=null;multiplayerDisplayRaceId='';view='result';document.body.classList.remove('multiplayer-lobby');
 showDialog('対戦を中断しました。','またあとで遊ぼう',detail,'もう一度あそぶ',()=>{if(oldRole==='host')createMultiplayerRoom();else goSelection();},false);multiplayerClosing=false;
}
function closeMultiplayer(reason='left'){
 multiplayerAttempt++;if(!multiplayer){multiplayerClosing=false;return;}multiplayerClosing=true;const session=multiplayer;multiplayer=null;session.abort(reason);session.close();multiplayerClosing=false;race=null;multiplayerToken='';multiplayerDisplay=null;multiplayerTargets=null;multiplayerDisplayRaceId='';
}
function guestDisplayLane(){
 let lane=multiplayerTargets?.guest?.lane??multiplayerDisplay?.guest?.lane??1;
 const pending=multiplayer?.pendingInputs;
 if(pending?.values)for(const input of pending.values()){
  if(input?.action==='up')lane=Math.max(0,lane-1);
  else if(input?.action==='down')lane=Math.min(2,lane+1);
 }
 return lane;
}
function refreshGuestDisplayLane(){
 const shown=multiplayerDisplay?.guest;if(!shown)return;
 shown.targetLane=guestDisplayLane();shown.lane=shown.targetLane;
}
function stepMultiplayerDisplay(dt){
 if(!multiplayerDisplay||!multiplayerTargets)return;const amount=Math.min(1,dt/.1);
 for(const slot of ['host','guest']){const shown=multiplayerDisplay[slot],target=multiplayerTargets[slot];if(!shown||!target)continue;
  const smooth=slot==='guest'?['x','z','vz','speed']:['x','y','z','vz','speed'];
  for(const key of smooth)if(typeof target[key]==='number')shown[key]+=((target[key])-shown[key])*amount;
  for(const key of Object.keys(target))if(!smooth.includes(key)&&!(slot==='guest'&&['y','lane','targetLane'].includes(key)))shown[key]=target[key];
  if(slot==='guest'){refreshGuestDisplayLane();shown.y+=(shown.targetLane-shown.y)*(1-Math.exp(-13*dt));}
 }
}
function predictMultiplayerInput(action){
 if(!multiplayerDisplay||multiplayer?.phase!=='racing')return;const shown=multiplayerDisplay[localSlot()];if(!shown)return;
 if(action==='up'||action==='down'){refreshGuestDisplayLane();}
 else if(action==='jump'&&shown.z<2){shown.z=16;shown.vz=550;}
}
async function copyRoomLink(){
 if(!multiplayerToken)return;if(!navigator.clipboard?.writeText){setMultiplayerDetail('下のリンクを選んでコピーしてね。');return;}try{await navigator.clipboard.writeText(roomLink(multiplayerToken));setMultiplayerDetail('リンクをコピーしました。');}catch(_){setMultiplayerDetail('下のリンクを選んでコピーしてね。');}
}
function startTournament(){order=opponents(selected);round=0;startRace();if(!seenStartGuide){seenStartGuide=true;showGuide('まずはこれだけ','どんぐりで加速','石・相手に当たると\nどんぐりを落とすよ',true);}}
function startRace(){
 race=new Race(selected,order[round],Math.floor(Math.random()*1e8),round);particles=[];finishShown=false;view='race';accumulator=0;
 for(const id of ['selection','dialog','guide'])toggle(id,false);
 for(const id of ['hud','controls','race-caption','countdown'])toggle(id,true);
 document.body.classList.add('racing');$('stage-label').innerHTML='STAGE 1 · <span id="round">'+(round+1)+'</span> / 4 戦';$('stage-name').textContent='やさしい野原';$('rival-name').textContent='相手：'+char(order[round]).name;
 $('player-label').textContent='あなた：'+char(selected).name;$('status-text').textContent='';$('pause').textContent='Ⅱ';
 if(round>0&&!seenGoldGuide){seenGoldGuide=true;showGuide('つぎのコースから','金色どんぐり','取ると 2倍速！');}
}
function goSelection(){closeMultiplayer();race=null;view='selection';particles=[];document.body.classList.remove('racing','show-jump-tip','multiplayer-lobby');
 for(const id of ['hud','controls','race-caption','dialog','guide','countdown','multiplayer'])toggle(id,false);toggle('selection',true);toggle('select-bottom',true);
}
function showDialog(kicker,title,detail,button,action,art=true,showWins=art){
 $('result-kicker').textContent=kicker;$('dialog-title').textContent=title;$('result-detail').textContent=detail;
 $('continue').textContent=button;$('continue').disabled=false;$('continue').onclick=action;$('result-art').replaceChildren();
 toggle('result-art',art);toggle('wins',showWins);
 if(art)$('result-art').append(makePortrait(selected));
 $('wins').replaceChildren();if(showWins)order.forEach((id,i)=>{const s=document.createElement('span');s.textContent=(i<round||(i===round&&race.winner===selected)?'✓ ':'○ ')+char(id).name;s.className=i<round||(i===round&&race.winner===selected)?'won':'';$('wins').append(s);});
 toggle('dialog',true);toggle('controls',false);toggle('countdown',false);$('continue').focus({preventScroll:true});
}
function finish(){
 if(inMultiplayer())return;
 finishShown=true;view='result';const win=race.winner===selected;
 if(win&&round===3)showDialog('4 / 4 勝利','優勝！',char(selected).name+'が、野原のチャンピオン。','もう一度あそぶ',startTournament);
 else if(win)showDialog(`${round+1} / 4 勝利`,'ゴール！ あなたの勝ち',`次の相手は${char(order[round+1]).name}。`,`次のうさぎさんとレース`,()=>{round++;startRace();});
 else showDialog(`${round+1} / 4 戦`,char(order[round]).name+'の勝ち','どんぐりで加速して、もう一度！','同じ相手に再挑戦',startRace);
}
function pause(reason='left'){if(inMultiplayer()&&view==='race'){closeMultiplayer(reason);showMultiplayerAbort(multiplayerText(reason));return;}if(!race||view!=='race'||race.state==='finished'||race.state==='paused')return;pausePrevious=race.state;race.state='paused';view='paused';
 showDialog('ひとやすみ','一時停止','準備ができたら、続きをどうぞ。','つづける',resume,false);
}
function resume(){if(orientationBlocked()||document.hidden)return;race.state=pausePrevious;view='race';toggle('dialog',false);toggle('controls',true);last=performance.now();accumulator=0;}
function input(action){if(view!=='race'||!race)return;if(inMultiplayer()){if(multiplayer.input(action))predictMultiplayerInput(action);return;}if(action==='jump')race.jump(race.player);else race.move(race.player,action==='up'?-1:1);}
for(const id of ['up','down','jump']){
 $(id).addEventListener('pointerdown',e=>{e.preventDefault();$(id).setPointerCapture(e.pointerId);input(id);});
 // Keyboard activation through native button semantics, without double-firing pointer clicks.
 $(id).addEventListener('click',e=>{if(e.detail===0)input(id);});
}
$('start').addEventListener('click',startTournament);$('back').onclick=goSelection;$('pause').onclick=pause;
$('multiplayer-start').onclick=createMultiplayerRoom;$('create-room').onclick=createMultiplayerRoom;$('copy-room').onclick=copyRoomLink;
$('multiplayer-ready').onclick=()=>{if(orientationBlocked()){setMultiplayerDetail('画面を横にしてから、準備できたを押してね。');return;}if(multiplayer?.ready(selected)){$('multiplayer-ready').disabled=true;setMultiplayerDetail('相手の準備を待っています。');}};
$('multiplayer-cancel').onclick=goSelection;
$('help').onclick=()=>{if(inMultiplayer()){ $('status-text').textContent='対戦中は止めずに走ろう。';noticeUntil=backgroundClock+1.7;return;}showGuide('あそびかた','どんぐり','どんぐり：加速\n石・相手：落とす\n金色：2倍速');};$('guide-close').onclick=closeGuide;
addEventListener('keydown',e=>{
 if(['ArrowUp','ArrowDown','Space'].includes(e.code)&&view==='race'){e.preventDefault();if(!e.repeat)input(e.code==='Space'?'jump':e.code==='ArrowUp'?'up':'down');}
 if((e.code==='Escape'||e.code==='KeyP')&&!e.repeat){if(view==='paused')resume();else pause();}
});
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen();}else{await $('game').requestFullscreen();try{await screen.orientation.lock('landscape');}catch{}}}catch{$('fullscreen').textContent='⛶';}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(inMultiplayer()?'hidden':'left');});addEventListener('blur',()=>{if(!inMultiplayer())pause();});
matchMedia('(orientation: portrait)').addEventListener('change',e=>{if(e.matches&&!manualLandscape)pause(inMultiplayer()?'portrait':'left');});
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
function sparkle(x,y,size){ctx.save();ctx.translate(x,y);ctx.fillStyle='#fff9bd';ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(size*.34,-size*.34);ctx.lineTo(size,0);ctx.lineTo(size*.34,size*.34);ctx.lineTo(0,size);ctx.lineTo(-size*.34,size*.34);ctx.lineTo(-size,0);ctx.lineTo(-size*.34,-size*.34);ctx.closePath();ctx.fill();ctx.restore();}
function playerFlag(x,y){
 ctx.save();ctx.translate(x-53,y-25);ctx.rotate(-.18);ctx.strokeStyle='#76543c';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-68);ctx.stroke();
 ctx.fillStyle='#ef9ba4';ctx.beginPath();ctx.moveTo(2,-66);ctx.lineTo(-40,-53);ctx.lineTo(2,-39);ctx.closePath();ctx.fill();
 ctx.strokeStyle='#bd6e7c';ctx.lineWidth=2;ctx.stroke();ctx.restore();
}
function obstacle(it,camera){const x=it.x-camera,y=lanes[it.lane];if(x<-100||x>W+100||it.taken)return;
 if(it.type==='rock'){ellipse(x,y+8,32,8,'#77754935');ctx.fillStyle='#9a9e95';ctx.strokeStyle='#74766d';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x-31,y+7);ctx.lineTo(x-26,y-15);ctx.quadraticCurveTo(x-6,y-48,x+14,y-31);ctx.quadraticCurveTo(x+32,y-20,x+33,y+8);ctx.closePath();ctx.fill();ctx.stroke();ellipse(x-8,y-12,4,5,'#7e8279');ellipse(x+16,y-2,3,5,'#7e8279');}
 else if(it.type==='ramp'){ctx.fillStyle='#be864d';ctx.strokeStyle='#85623b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-44,y+7);ctx.lineTo(x+36,y-30);ctx.lineTo(x+36,y+7);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#fff1ad';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x-17,y-2);ctx.lineTo(x+11,y-15);ctx.stroke();}
 else{
  const fall=it.type==='help'?Math.max(0,1-(race.time-it.spawned)/.45)*90:0;
  const cy=y-24-(it.z||0)+Math.sin(backgroundClock*5+it.id)*4-fall;
  if(it.z){ctx.save();ctx.setLineDash([5,6]);ctx.strokeStyle='#fff7c9d9';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y-3);ctx.lineTo(x,cy+17);ctx.stroke();ctx.restore();}
  if(it.type==='gold'){ellipse(x,cy,34,39,'#fff6a38a');sparkle(x-28,cy-23,7+Math.sin(backgroundClock*7)*2);sparkle(x+31,cy+17,5+Math.sin(backgroundClock*7+1)*2);}
  ellipse(x,y+7,it.type==='gold'?19:14,it.type==='gold'?5:4,'#9b84372b');acorn(x,cy,it.type==='gold'?1.28:.9,it.type==='gold');
 }
}
function car(r,camera){const x=r.x-camera,y=lanes[0]+r.y*115;
 if(x<-160||x>W+160)return;
 ellipse(x,y+12,47-r.z*.06,9-r.z*.012,'#52664335');
 ctx.save();if(r.invincible>0&&Math.floor(backgroundClock*13)%2===0)ctx.globalAlpha=.52;
 if(r.boost>0||r.gold>0){ctx.strokeStyle='#fff4a5';ctx.lineWidth=4;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x-75-i*8,y-r.z-12+i*9);ctx.lineTo(x-102-i*12,y-r.z-12+i*9);ctx.stroke();}}
 const b=SPRITE_BOUNDS[r.id],height=130,width=b[2]/b[3]*height;
 const bounce=r.z>0?0:Math.sin(backgroundClock*19)*1.2;
 if(r===localRacer())playerFlag(x,y-r.z+bounce);
 ctx.save();ctx.translate(x,0);ctx.scale(-1,1);
 ctx.drawImage(images[r.id],...b,-width/2,y-height-r.z+12+bounce,width,height);ctx.restore();
 ctx.restore();
}
function finishLine(camera){const x=LENGTH-camera;if(x<-50||x>W+50)return;ctx.fillStyle='#fffbe7';ctx.fillRect(x-8,278,300/10,300);for(let i=0;i<15;i++)for(let j=0;j<2;j++)if((i+j)%2===0){ctx.fillStyle='#786652';ctx.fillRect(x-8+j*15,278+i*20,15,20);}ctx.strokeStyle='#826748';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x,270);ctx.lineTo(x,193);ctx.stroke();ctx.fillStyle='#c47583';ctx.beginPath();ctx.moveTo(x,194);ctx.lineTo(x+48,208);ctx.lineTo(x,226);ctx.fill();}
function presentEvent(e){
 if(!e)return;
  if(e.type==='hit')for(let i=0;i<Math.max(3,e.lost);i++)particles.push({x:e.x,y:lanes[0]+e.y*115-30,vx:-65-Math.random()*110,vy:-150-Math.random()*100,life:.8,type:e.lost?'acorn':'dust'});
 const mine=inMultiplayer()?e.slot===localSlot():e.id===selected;
 if(mine){const messages={hit:e.lost?`どんぐり −${e.lost} · 減速`:'ぶつかった！ 減速',acorn:'どんぐり ＋1 · 加速！',gold:'金色どんぐり · 2倍速！',help:'お助けどんぐり · 加速！',helpSpawn:'お助けどんぐりが来たよ！',ramp:'ジャンプ台！'};if(messages[e.type]){$('status-text').textContent=messages[e.type];noticeUntil=backgroundClock+1.7;}}
}
function consumeEvents(){
 if(!race?.events)return;for(const e of race.events)presentEvent(e);
 race.events.length=0;
}
function render(){const local=localRacer(),opponent=otherRacer(),camera=local?local.x-300:backgroundClock*18;meadow(camera);
 if(!race||!ready)return;
 finishLine(camera);
 const drawables=race.items.filter(it=>!it.taken).map(it=>({depth:it.lane,draw:()=>obstacle(it,camera)}));
 for(const r of [opponent,local])if(r)drawables.push({depth:r.y+.1,draw:()=>car(r,camera)});
 drawables.sort((a,b)=>a.depth-b.depth).forEach(d=>d.draw());
 for(const p of particles){ctx.save();ctx.globalAlpha=Math.max(0,p.life/.8);if(p.type==='acorn')acorn(p.x-camera,p.y,.6);else ellipse(p.x-camera,p.y,9,7,'#fff9df');ctx.restore();}
 // Opponent can leave the camera; show direction instead of hiding race information.
 const ox=opponent.x-camera;if(ox<40||ox>W-40){const x=ox<40?65:W-70;rounded(x-52,185,104,29,15,'#fff9e9e8');ctx.fillStyle='#625141';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText(ox<40?'◀ 相手':'相手 ▶',x,205);}
 $('acorns').textContent=local.acorns;$('position').textContent=local.x>=opponent.x?'1位':'2位';
 $('speed-state').textContent=local.slow>0?'減速中':local.gold>0?'2倍速！':local.boost>0?'加速中！':'いつもの速さ';
 const pp=Math.min(100,local.x/LENGTH*100),op=Math.min(100,opponent.x/LENGTH*100);
 $('progress-fill').style.width=pp+'%';$('player-dot').style.left=pp+'%';$('rival-dot').style.left=op+'%';
 if(race.state==='countdown'){toggle('countdown',true);$('countdown').textContent=Math.ceil(race.countdown);}
 else if(race.state==='racing'&&race.time<.65){toggle('countdown',true);$('countdown').textContent='スタート！';}
 else toggle('countdown',false);
 if(backgroundClock>noticeUntil)$('status-text').textContent='';
}
function frame(now){const elapsed=last?Math.max(0,(now-last)/1000):0,dt=Math.min(elapsed,.05);last=now;
 const frozen=view==='paused'||document.hidden||orientationBlocked();
 if(!frozen){backgroundClock+=dt;const session=multiplayer;
  if(session){session.tick(elapsed);if(multiplayer===session){race=session.race||race;if(view==='race')stepMultiplayerDisplay(dt);}}
  else if(race&&view==='race'){accumulator+=dt;while(accumulator>=1/120){race.update(1/120);accumulator-=1/120;}consumeEvents();if(race.state==='finished'&&!finishShown)finish();}
 for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=500*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);}
 render();requestAnimationFrame(frame);
}
// Read-only state for verification and bug reports; no debug controls in the game UI.
window.raceSnapshot=()=>({view,selected,order:[...order],round,state:race?.state,winner:race?.winner,player:race?{...race.player}:null,opponent:race?{...race.opponent}:null});
load();requestAnimationFrame(frame);
