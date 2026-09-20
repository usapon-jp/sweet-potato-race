const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Race,LENGTH,itemPriority}=require('../engine.js');
const {MultiplayerSession}=require('../multiplayer-session.js');

function clock(){let value=0;return {now:()=>value,advance:ms=>{value+=ms;}};}
function pair(){
  const listeners=[new Set(),new Set()],disconnects=[new Set(),new Set()];let closed=[false,false];
  return [0,1].map(i=>({send(message){if(closed[i])return;for(const fn of listeners[1-i])fn(structuredClone(message));},onMessage(fn){listeners[i].add(fn);return()=>listeners[i].delete(fn);},onDisconnect(fn){disconnects[i].add(fn);return()=>disconnects[i].delete(fn);},close(){if(closed[i])return;closed[i]=true;for(const fn of disconnects[1-i])fn();}}));
}
function sessions(){const c=clock(),[a,b]=pair(),hostEvents=[],guestEvents=[],hostResults=[],guestResults=[];const common={roomEpoch:'room-1',now:c.now};const host=new MultiplayerSession({...common,role:'host',clientId:'h',characterId:'brown',transport:a,onEvent:e=>hostEvents.push(e),onResult:r=>hostResults.push(r)});const guest=new MultiplayerSession({...common,role:'guest',clientId:'g',characterId:'brown',transport:b,onEvent:e=>guestEvents.push(e),onResult:r=>guestResults.push(r)});return {c,host,guest,hostEvents,guestEvents,hostResults,guestResults};}
function pump(s,ms,step=1000/60){for(let n=0;n<ms;n+=step){s.c.advance(step);s.host.tick(step/1000);s.guest.tick(step/1000);}}

function envelope(s,type,payload,extra={}){return {protocolVersion:2,roomEpoch:'room-1',raceId:s.host.raceId,type,seq:100,senderId:'g',role:'guest',payload,...extra};}
test('third guest rejection and duplicate handshakes do not disturb admitted racers',()=>{
 const s=sessions();s.host.start();s.guest.start();s.host.ready('brown');s.guest.ready('brown');pump(s,2800);
 const before=s.guest.race.player.x;
 s.host.receive(envelope(s,'hello',{characterId:'gray',engineVersion:1,rulesVersion:2},{senderId:'third'}));
 assert.equal(s.guest.phase,'racing');assert.equal(s.host.peerId,'g');
 s.host.receive(envelope(s,'hello',{characterId:'brown',engineVersion:1,rulesVersion:2}));
 s.host.receive(envelope(s,'start-ack',{}));s.host.broadcastStart();
 assert.equal(s.host.phase,'racing');assert.equal(s.guest.phase,'racing');assert.equal(s.guest.race.player.x,before);
});
test('old rules version cannot claim a room slot',()=>{
 const s=sessions();s.host.start();s.host.receive({protocolVersion:2,roomEpoch:'room-1',raceId:null,type:'hello',seq:1,senderId:'old',role:'guest',payload:{characterId:'brown',engineVersion:1,rulesVersion:1}});assert.equal(s.host.peerId,null);assert.equal(s.host.race,null);assert.equal(s.host.phase,'waiting');
});
test('malformed input and forged guest result cannot change host result',()=>{
 const s=sessions();s.host.start();s.guest.start();s.host.ready('brown');s.guest.ready('brown');pump(s,2800);
 assert.doesNotThrow(()=>s.host.receive(envelope(s,'input',{inputs:[null,{},false]})));
 s.host.receive(envelope(s,'result',{resultId:'fake',raceId:s.host.raceId,finalSnapshot:s.host.race.snapshot()}));assert.equal(s.host.result,null);
 assert.equal(s.host.ready('not-a-character'),false);
});
test('a nonadjacent input gap times out even when the later input is retransmitted',()=>{
 const s=sessions();s.host.start();s.guest.start();s.host.ready('brown');s.guest.ready('brown');pump(s,2800);
 s.host.receive(envelope(s,'input',{inputs:[{seq:4,action:'jump'}]}));pump(s,300);
 s.host.receive(envelope(s,'input',{inputs:[{seq:4,action:'jump'}]}));pump(s,250);
 assert.equal(s.host.phase,'aborted');assert.equal(s.host.result,null);
});
test('missing result ACK has a finite deadline and preserves the result',()=>{
 const s=sessions();s.host.start();s.guest.start();s.host.ready('brown');s.guest.ready('gray');pump(s,2800);
 const send=s.guest.transport.send;s.guest.transport.send=m=>{if(m.type!=='result-ack')send(m);};
 s.host.race.items=[];s.host.race.player.x=LENGTH-1;s.host.race.opponent.x=0;pump(s,50);pump(s,11000);
 assert.equal(s.host.closed,true);assert.equal(s.guest.closed,true);assert.equal(s.host.phase,'result');assert.equal(s.guest.phase,'result');assert.equal(s.guestResults.length,1);
});

test('multiplayer Race keeps slots apart from same character IDs and serializes Sets',()=>{
  const race=new Race('brown','brown',42,0,{mode:'multiplayer'});assert.equal(race.player.slot,'host');assert.equal(race.opponent.slot,'guest');assert.notEqual(race.player.lane,race.opponent.lane);assert.equal(race.player.speed,300);assert.equal(race.opponent.speed,300);race.items=[];race.state='racing';race.think=()=>{throw new Error('CPU must be disabled');};race.opponent.x=1000;race.help(.01);const help=race.items[0];assert.equal(help.owner,race.player.slot);const snap=race.snapshot();assert.ok(Array.isArray(snap.items[0].seen));const restored=Race.fromSnapshot(snap);assert.deepEqual(restored.snapshot(),snap);
});
test('multiplayer item tie uses seed/item priority and goal boundary allows a draw',()=>{
  const race=new Race('brown','gray',77,0,{mode:'multiplayer'});race.items=[{id:9,type:'acorn',x:10,lane:race.player.lane,z:0,seen:new Set(),taken:false}];race.opponent.lane=race.opponent.y=race.player.lane;race.state='racing';race.player.x=race.opponent.x=0;race.update(1/120);assert.equal(race.events[0].id,itemPriority(77,9));const finish=new Race('brown','gray',22,0,{mode:'multiplayer'});finish.items=[];finish.state='racing';finish.player.x=LENGTH-1;finish.opponent.x=LENGTH-1;finish.update(1/120);assert.equal(finish.state,'finished');assert.equal(finish.winnerSlot,null);assert.equal(finish.winner,null);
});
test('host and guest handshake, ready, canonical race, ordered deduplicated guest input',()=>{
  const s=sessions();s.host.start();s.guest.start();assert.equal(s.host.phase,'lobby');assert.equal(s.guest.phase,'lobby');s.host.ready('brown');s.guest.ready('brown');assert.equal(s.host.race.player.id,'brown');assert.equal(s.host.race.opponent.id,'brown');pump(s,2800);assert.equal(s.host.phase,'racing');assert.equal(s.guest.phase,'racing');const before=s.host.race.opponent.lane;s.guest.input('up');s.guest.input('up');pump(s,200);assert.equal(s.host.race.opponent.lane,Math.max(0,before-2));const seq=s.host.expectedInput.guest;s.host.receive({protocolVersion:2,roomEpoch:'room-1',raceId:s.host.raceId,type:'input',seq:99,senderId:'g',role:'guest',payload:{inputs:[{seq:1,action:'down'}]}});assert.equal(s.host.expectedInput.guest,seq);assert.equal(s.host.race.player.slot,'host');assert.equal(s.guest.race.opponent.slot,'guest');
});
test('guest ignores stale snapshots and host result is canonical and acknowledged',()=>{
  const s=sessions();s.host.start();s.guest.start();s.host.ready('brown');s.guest.ready('gray');pump(s,2800);const current=s.guest.lastSnapshotTick;s.guest.receive({protocolVersion:2,roomEpoch:'room-1',raceId:s.host.raceId,type:'snapshot',seq:10,senderId:'h',role:'host',payload:{tick:current,snapshot:s.guest.race.snapshot()}});assert.equal(s.guest.lastSnapshotTick,current);s.host.race.items=[];s.host.race.player.x=LENGTH-1;s.host.race.opponent.x=0;pump(s,50);assert.equal(s.host.phase,'result');assert.equal(s.guest.phase,'result');assert.equal(s.hostResults.length,1);assert.equal(s.guestResults.length,1);assert.equal(s.hostResults[0].winnerSlot,'host');assert.equal(s.guestResults[0].winnerSlot,'host');assert.ok(s.host.resultAck);
});
test('disconnect aborts without a speculative result',()=>{
  const s=sessions();s.host.start();s.guest.start();s.host.ready('brown');s.guest.ready('gray');pump(s,2800);s.guest.transport.close();assert.equal(s.host.phase,'aborted');assert.equal(s.hostResults.length,0);
});
test('canonical result remains available after clean transport shutdown',()=>{
  const s=sessions();s.host.start();s.guest.start();s.host.ready('brown');s.guest.ready('gray');pump(s,2800);s.host.race.items=[];s.host.race.player.x=LENGTH-1;pump(s,50);assert.equal(s.host.phase,'result');assert.equal(s.guest.phase,'result');assert.equal(s.guestResults[0].winnerSlot,'host');
});
test('same peers can complete two rounds only after both request a rematch',()=>{
  const s=sessions();s.host.start();s.guest.start();s.host.ready('brown');s.guest.ready('gray');pump(s,2800);s.host.race.items=[];s.host.race.player.x=LENGTH-1;pump(s,50);const oldRace=s.host.raceId;assert.equal(s.host.requestRematch(),true);assert.equal(s.host.requestRematch(),true);pump(s,1200);assert.equal(s.host.phase,'result');assert.equal(s.guest.phase,'result');assert.equal(s.guest.requestRematch(),true);pump(s,2800);assert.equal(s.host.phase,'racing');assert.equal(s.guest.phase,'racing');assert.notEqual(s.host.raceId,oldRace);assert.equal(s.host.tickCount,s.guest.tickCount);s.host.race.items=[];s.host.race.opponent.x=LENGTH-1;pump(s,50);assert.equal(s.host.phase,'result');assert.equal(s.guest.phase,'result');assert.equal(s.hostResults.length,2);assert.equal(s.guestResults.length,2);
});
test('old result and rematch messages cannot mutate the new round',()=>{
  const s=sessions();s.host.start();s.guest.start();s.host.ready('brown');s.guest.ready('gray');pump(s,2800);s.host.race.items=[];s.host.race.player.x=LENGTH-1;pump(s,50);const old=s.host.raceId;s.host.requestRematch();s.guest.requestRematch();pump(s,2800);const next=s.host.raceId;s.host.receive({protocolVersion:2,roomEpoch:'room-1',raceId:old,type:'rematch-ready',seq:91,senderId:'g',role:'guest',payload:{raceId:old}});s.guest.receive({protocolVersion:2,roomEpoch:'room-1',raceId:old,type:'result',seq:92,senderId:'h',role:'host',payload:{raceId:old,resultId:'old',finalSnapshot:s.guest.race.snapshot()}});assert.equal(s.host.raceId,next);assert.equal(s.guest.raceId,next);assert.equal(s.host.phase,'racing');assert.equal(s.guest.phase,'racing');s.host.race.items=[];s.host.race.player.x=LENGTH-1;pump(s,50);s.guest.requestRematch();const completed=s.guest.raceId;s.guest.receive({protocolVersion:2,roomEpoch:'room-1',raceId:old,type:'start',seq:93,senderId:'h',role:'host',payload:{roundCounter:1,engineVersion:1,rulesVersion:2,snapshot:s.guest.race.snapshot()}});assert.equal(s.guest.phase,'result');assert.equal(s.guest.raceId,completed);
});
test('result idle does not retransmit leftover gameplay inputs',()=>{
 const s=sessions();s.host.start();s.guest.start();s.host.ready('brown');s.guest.ready('gray');pump(s,2800);s.guest.pendingInputs.set(99,{seq:99,action:'jump'});let inputs=0;const send=s.guest.transport.send;s.guest.transport.send=m=>{if(m.type==='input')inputs++;return send(m);};s.host.race.items=[];s.host.race.player.x=LENGTH-1;pump(s,1200);assert.equal(s.guest.phase,'result');assert.equal(inputs,0);
});
test('idle and explicit leave close a result without replacing it or permitting rematch',()=>{
 const idle=sessions();idle.host.start();idle.guest.start();idle.host.ready('brown');idle.guest.ready('gray');pump(idle,2800);idle.host.race.items=[];idle.host.race.player.x=LENGTH-1;pump(idle,50);pump(idle,120001,1000);assert.equal(idle.host.closed,true);assert.equal(idle.guest.closed,true);assert.equal(idle.host.phase,'result');assert.equal(idle.guest.phase,'result');assert.equal(idle.host.requestRematch(),false);
 const leave=sessions(),statuses=[];leave.guest.onStatus=s=>statuses.push(s);leave.host.start();leave.guest.start();leave.host.ready('brown');leave.guest.ready('gray');pump(leave,2800);leave.host.race.items=[];leave.host.race.player.x=LENGTH-1;pump(leave,50);leave.guest.abort('leave');assert.equal(leave.guest.phase,'result');assert.equal(leave.guest.result.winnerSlot,'host');assert.equal(leave.guest.requestRematch(),false);assert.ok(statuses.some(s=>s.status==='result-closed'&&s.reason==='leave'));
});
