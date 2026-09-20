// Explicit opt-in live test: two full races in one lab room, no database writes.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto'),{createClient}=require('@supabase/supabase-js');
const {connect}=require('../realtime-transport.js'),{MultiplayerSession}=require('../multiplayer-session.js');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../runtime-config.js'),'utf8'),context);
(async()=>{
 const config=context.window.RACE_NETWORK_CONFIG,token=randomBytes(16).toString('hex'),transports=[],sessions=[],results=[[],[]],moves=[false,false],jumps=[false,false];
 assert.equal(config.url,'https://gfuzmxkhhouhdrpjwajn.supabase.co');
 let interval,deadline,ready=false,rematchAt=0,guestRequested=false,moveSent=false,jumpSent=false,last=performance.now();
 try{
  for(let i=0;i<2;i++)transports.push(await connect({token,config,createClient}));
  await new Promise((resolve,reject)=>{
   deadline=setTimeout(()=>reject(Error('Two races exceeded 165 seconds')),165000);
   for(let i=0;i<2;i++)sessions.push(new MultiplayerSession({role:i?'guest':'host',clientId:i?'rematch-guest':'rematch-host',roomEpoch:token,characterId:'brown',transport:transports[i],onStatus:s=>{if(['aborted','result-closed'].includes(s.status))reject(Error(s.status+': '+s.reason));},onResult:r=>{results[i].push(r);if(results.every(list=>list.length===2))resolve();}}));
   sessions.forEach(s=>s.start());
   interval=setInterval(()=>{try{
    const now=performance.now(),dt=(now-last)/1000;last=now;sessions.forEach(s=>s.tick(dt));
    if(!ready&&sessions.every(s=>s.phase==='lobby')){ready=true;sessions.forEach(s=>s.ready('brown'));}
    if(!rematchAt&&results.every(list=>list.length===1)&&sessions[0].resultAck){
     assert.deepEqual(results[0][0],results[1][0]);rematchAt=now;assert.equal(sessions[0].requestRematch(),true);console.log('First race matched; host requested replay in the same room.');
    }
    if(rematchAt&&!guestRequested&&now-rematchAt>600){
     assert.ok(sessions.every(s=>s.phase==='result'));guestRequested=true;assert.equal(sessions[1].requestRematch(),true);moveSent=false;jumpSent=false;
    }
    const h=sessions[0],round=results[0].length;
    if(h.phase==='racing'&&round<2){
     if(!moveSent){moveSent=true;sessions[1].input(h.race.opponent.lane===0?'down':'up');}
     if(h.race.opponent.lane===1)moves[round]=true;
     if(!jumpSent&&h.race.time>.8){jumpSent=true;sessions[1].input('jump');}
     if(h.race.opponent.jumps>0)jumps[round]=true;
    }
   }catch(e){reject(e);}},1000/60);
  });
  for(let i=0;i<2;i++)assert.deepEqual(results[0][i],results[1][i]);
  assert.notEqual(results[0][0].raceId,results[0][1].raceId);assert.deepEqual(moves,[true,true]);assert.deepEqual(jumps,[true,true]);
  console.log(JSON.stringify({ok:true,project:'usapon-lab',races:2,sameRoom:true,sameTransports:true,resultsMatch:true,guestLaneSynced:moves,guestJumpSynced:jumps,stats:transports.map(t=>t.getStats())},null,2));
 }finally{clearInterval(interval);clearTimeout(deadline);sessions.forEach(s=>s.close());transports.forEach(t=>t.close());}
})().catch(e=>{console.error(e);process.exitCode=1;});
