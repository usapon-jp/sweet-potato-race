// Explicit live integration test. One room, two clients, one real-time race.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {connect}=require('../realtime-transport.js');
const {MultiplayerSession}=require('../multiplayer-session.js');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../runtime-config.js'),'utf8'),context);
(async()=>{
 const config=context.window.RACE_NETWORK_CONFIG;
 if(config.url!=='https://gfuzmxkhhouhdrpjwajn.supabase.co')throw Error('Live test must target usapon-lab');
 const token=randomBytes(16).toString('hex'),transports=[],sessions=[],results=[];
 let interval,deadline;
 try{
  for(let i=0;i<2;i++)transports.push(await connect({token,config,createClient}));
  let readySent=false,moveSent=false,jumpSent=false,moved=false,jumped=false,last=performance.now();
  await new Promise((resolve,reject)=>{
   deadline=setTimeout(()=>reject(Error('Race did not finish within 80 seconds')),80000);
   for(let i=0;i<2;i++)sessions.push(new MultiplayerSession({role:i?'guest':'host',clientId:i?'live-guest':'live-host',roomEpoch:token,characterId:'brown',transport:transports[i],
    onStatus:s=>{if(s.status==='aborted')reject(Error('Session aborted: '+s.reason));},
    onResult:r=>{results[i]=r;if(results[0]&&results[1])setTimeout(resolve,400);}
   }));
   sessions[0].start();sessions[1].start();
   interval=setInterval(()=>{
    const now=performance.now(),dt=(now-last)/1000;last=now;
    for(const s of sessions)s.tick(dt);
    if(!readySent&&sessions.every(s=>s.peerId&&s.phase==='lobby')){readySent=true;sessions[0].ready('brown');sessions[1].ready('brown');}
    const host=sessions[0];
    if(host.phase==='racing'){
     if(!moveSent){moveSent=true;const g=host.race.opponent;sessions[1].input(g.lane===0?'down':'up');}
     if(host.race.opponent.lane===1)moved=true;
     if(!jumpSent&&host.race.time>.8){jumpSent=true;sessions[1].input('jump');}
     if(host.race.opponent.jumps>0)jumped=true;
    }
   },1000/60);
  });
  assert.deepEqual(results[0],results[1]);assert.equal(moved,true);assert.equal(jumped,true);
  const stats=transports.map(t=>t.getStats());
  console.log(JSON.stringify({ok:true,project:'usapon-lab',sameCharacter:true,guestLaneSynced:moved,guestJumpSynced:jumped,winner:results[0].winnerSlot,finalTick:results[0].finalTick,resultMatches:true,stats,totalCountedMessages:stats.reduce((n,s)=>n+s.sent+s.received,0)},null,2));
 }finally{clearInterval(interval);clearTimeout(deadline);sessions.forEach(s=>s.close());transports.forEach(t=>t.close());}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
