const {test}=require('node:test');
const assert=require('node:assert/strict');
const {connect}=require('../realtime-transport.js');
const config={enabled:true,url:'https://gfuzmxkhhouhdrpjwajn.supabase.co',publishableKey:'sb_publishable_test'};
function fake(){
  let handler,status,closed=0,options,channelOptions,sends=[];
  const channel={on(t,f,fn){handler=fn;return this;},subscribe(fn){status=fn;queueMicrotask(()=>fn('SUBSCRIBED'));return this;},send(m){sends.push(m);return Promise.resolve('ok');}};
  return {createClient:(u,k,o)=>{options=o;return {channel(n,o){channelOptions=o;return channel;},removeChannel(){return Promise.resolve();},realtime:{disconnect(){closed++;}}};},incoming:m=>handler({payload:m}),status:s=>status(s),get closed(){return closed;},get options(){return options;},get channelOptions(){return channelOptions;},sends};
}
test('public dedicated transport does not create or share auth sessions, and forwards payload once',async()=>{
 const f=fake(),t=await connect({token:'a'.repeat(32),config,createClient:f.createClient});let got=[];t.onMessage(m=>got.push(m));f.incoming({type:'hello'});await t.send({type:'ready'});
 assert.equal(f.options.auth.persistSession,false);assert.equal(f.options.auth.detectSessionInUrl,false);assert.equal(f.channelOptions.config.broadcast.self,false);assert.deepEqual(got,[{type:'hello'}]);assert.equal(t.getStats().sent,1);assert.equal(t.getStats().received,1);t.close();t.close();assert.equal(f.closed,1);assert.equal(await t.send({type:'hello'}),false);
});
test('quota/connection errors stop the SDK rather than reconnecting forever',async()=>{
 const f=fake(),t=await connect({token:'a'.repeat(32),config,createClient:f.createClient});let reasons=[];t.onDisconnect(r=>reasons.push(r));f.status('CHANNEL_ERROR');f.status('CLOSED');assert.deepEqual(reasons,['channel_error']);assert.equal(f.closed,1);
});
test('per-client safety budget aborts a message flood',async()=>{
 const f=fake(),t=await connect({token:'a'.repeat(32),config,createClient:f.createClient,now:()=>0});for(let i=0;i<26;i++)await t.send({type:'input',seq:i});assert.equal(t.getStats().sent,25);assert.equal(t.getStats().closedReason,'traffic_limit');assert.equal(f.closed,1);
});
test('malformed token or nonpublic key fails before connecting',async()=>{
 const f=fake();await assert.rejects(connect({token:'short',config,createClient:f.createClient}));await assert.rejects(connect({token:'a'.repeat(32),config:{...config,publishableKey:'sb_secret_invalid'},createClient:f.createClient}));
});
