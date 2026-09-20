/* A game-only public Broadcast connection. Never shares an Auth session. */
(function(root, factory) {
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RaceRealtime=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  let sdkPromise;
  const scriptBase=root.document?.currentScript?.src;
  function sdk(){
    if(root.supabase?.createClient)return Promise.resolve(root.supabase);
    if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{
      if(!root.document)return reject(new Error('通信を準備できませんでした'));
      const s=root.document.createElement('script');
      s.src=scriptBase?new URL('vendor/supabase.js',scriptBase).href:'vendor/supabase.js';
      s.onload=()=>root.supabase?.createClient?resolve(root.supabase):reject(new Error('通信を準備できませんでした'));
      s.onerror=()=>{sdkPromise=null;reject(new Error('通信を読み込めませんでした。ひとりで遊ぶことはできます。'));};
      root.document.head.append(s);
    });
    return sdkPromise;
  }
  async function connect({token,config=root.RACE_NETWORK_CONFIG,createClient,now=()=>Date.now(),subscribeTimeout=10000}={}){
    if(!/^[a-f0-9]{32,64}$/.test(token||''))throw new Error('参加リンクを確認してください');
    if(!config?.enabled||config.url!=='https://gfuzmxkhhouhdrpjwajn.supabase.co'||!config.publishableKey?.startsWith('sb_publishable_'))throw new Error('対戦の準備ができていません。ひとりで遊ぶことはできます。');
    if(!createClient)createClient=(await sdk()).createClient;
    const client=createClient(config.url,config.publishableKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'sweet-potato-race-test'},
      realtime:{timeout:5000,params:{eventsPerSecond:25}}
    });
    const messages=new Set(),disconnects=new Set(),pending=[];
    const stats={sent:0,received:0,sentBytes:0,receivedBytes:0,peakSentPerSecond:0,startedAt:now(),closedReason:null};
    let channel,closed=false,subscribed=false,timer,settled=false,failReason=null,sendTimes=[];
    let resolveConnection,rejectConnection;
    const connection=new Promise((res,rej)=>{resolveConnection=res;rejectConnection=rej;});
    function shutdown(){
      if(closed)return;closed=true;clearTimeout(timer);
      // Explicitly stop SDK reconnects. A new match needs a new connection.
      try{Promise.resolve(client.removeChannel(channel)).catch(()=>{});}catch{}
      try{client.realtime.disconnect();}catch{}
    }
    function fail(reason){
      if(closed)return;failReason=reason;stats.closedReason=reason;shutdown();
      if(!settled){settled=true;rejectConnection(new Error('対戦に接続できませんでした。少し待ってお試しください。'));}
      for(const fn of disconnects)fn(reason);
    }
    const api={
      send(message){
        if(closed||!subscribed)return Promise.resolve(false);
        let json;try{json=JSON.stringify(message);}catch{return Promise.resolve(false);}
        if(!json||json.length>65536)return Promise.resolve(false);
        const bytes=new TextEncoder().encode(json).byteLength;
        if(bytes>65536)return Promise.resolve(false);
        const time=now();sendTimes=sendTimes.filter(t=>time-t<1000);
        if(sendTimes.length>=25||stats.sent>=8000||stats.sentBytes+bytes>20*1024*1024){fail('traffic_limit');return Promise.resolve(false);}
        sendTimes.push(time);stats.peakSentPerSecond=Math.max(stats.peakSentPerSecond,sendTimes.length);
        stats.sent++;stats.sentBytes+=bytes;
        return Promise.resolve(channel.send({type:'broadcast',event:'race-v1',payload:message})).then(status=>{
          if(status!=='ok'){fail('send_failed');return false;}return true;
        }).catch(()=>{fail('send_failed');return false;});
      },
      onMessage(fn){messages.add(fn);for(const msg of pending.splice(0))fn(msg);return()=>messages.delete(fn);},
      onDisconnect(fn){disconnects.add(fn);if(failReason)fn(failReason);return()=>disconnects.delete(fn);},
      close(){if(!closed)stats.closedReason='closed';shutdown();},
      getStats(){return {...stats,closed};}
    };
    channel=client.channel('sweet-potato-race:test:v1:'+token,{config:{private:false,broadcast:{self:false,ack:true}}});
    channel.on('broadcast',{event:'race-v1'},({payload})=>{
      if(closed||!payload||typeof payload!=='object'||Array.isArray(payload))return;
      let json;try{json=JSON.stringify(payload);}catch{return;}
      if(json.length>65536)return;
      const bytes=new TextEncoder().encode(json).byteLength;if(bytes>65536)return;
      stats.received++;stats.receivedBytes+=bytes;
      if(messages.size){for(const fn of messages)fn(payload);}else if(pending.length<16)pending.push(payload);
    });
    timer=setTimeout(()=>fail('subscribe_timeout'),subscribeTimeout);
    channel.subscribe(status=>{
      if(closed)return;
      if(status==='SUBSCRIBED'){
        subscribed=true;clearTimeout(timer);
        if(!settled){settled=true;resolveConnection(api);}
      }else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))fail(status.toLowerCase());
    });
    return connection;
  }
  return {connect};
});
