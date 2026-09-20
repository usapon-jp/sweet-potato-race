// Explicit opt-in live smoke test: two clients, one random room, two messages.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {connect}=require('../realtime-transport.js');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../runtime-config.js'),'utf8'),context);
(async()=>{
 const config=context.window.RACE_NETWORK_CONFIG;
 if(config.url!=='https://gfuzmxkhhouhdrpjwajn.supabase.co')throw Error('Live test must target usapon-lab');
 const token=randomBytes(16).toString('hex');let a,b;
 try{
  a=await connect({token,config,createClient});b=await connect({token,config,createClient});
  const exchange=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Echo timeout')),8000);
   b.onMessage(m=>{if(m.type==='test-ping')b.send({type:'test-pong',seq:m.seq});});
   a.onMessage(m=>{if(m.type==='test-pong'&&m.seq===1){clearTimeout(timer);resolve();}});
  });
  await a.send({type:'test-ping',seq:1});await exchange;
  assert.equal(a.getStats().received,1);assert.equal(b.getStats().received,1);
  console.log(JSON.stringify({ok:true,project:'usapon-lab',a:a.getStats(),b:b.getStats()},null,2));
 }finally{a?.close();b?.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
