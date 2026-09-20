/* Shared by the browser and Node tests. No network or storage required. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RaceEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LENGTH = 12000;
  const DIFFICULTY = [
    {speed:278, dodge:.48, food:.30, reaction:.38, gold:0},
    {speed:286, dodge:.60, food:.44, reaction:.32, gold:2},
    {speed:294, dodge:.72, food:.57, reaction:.26, gold:3},
    {speed:300, dodge:.82, food:.70, reaction:.20, gold:4}
  ];
  const CHARACTERS = [
    {id:'brown', name:'ぽん', color:'#726058'},
    {id:'gray', name:'うさ', color:'#92939b'},
    {id:'mugi', name:'むぎくん', color:'#d3a777'},
    {id:'mocha', name:'もかちゃま', color:'#645143'},
    {id:'yuzu', name:'ゆずくん', color:'#cbb28e'}
  ];
  function seeded(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function opponents(id, rng = Math.random) {
    const pool = CHARACTERS.filter(c => c.id !== id).map(c => c.id);
    for (let i=pool.length-1;i>0;i--) {const j=Math.floor(rng()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]];}
    return pool;
  }
  function racer(id, lane) {return {id,x:0,lane,y:lane,z:0,vz:0,speed:300,acorns:0,boost:0,gold:0,slow:0,invincible:0,aiWait:0,jumps:0,hits:0,collected:0};}
  class Race {
    constructor(playerId, opponentId, seed=19, round=0) {
      this.rng=seeded(seed); this.round=Math.max(0,Math.min(3,round)); this.difficulty=DIFFICULTY[this.round]; this.helpCooldown=0; this.nextItemId=1000;
      this.player=racer(playerId,1); this.opponent=racer(opponentId,0);
      this.time=0; this.countdown=2.6; this.state='countdown'; this.winner=null; this.events=[];
      this.items=[];
      // Every row has at least one clear lane; jumps and lane changes both work.
      this.items.push({type:'acorn',x:620,lane:1},{type:'ramp',x:1180,lane:1},{type:'rock',x:1390,lane:1});
      for(let x=1800;x<LENGTH-450;x+=420) {
        const lane=Math.floor(this.rng()*3), n=this.rng();
        if(n<.22) {
          this.items.push({type:'ramp',x,lane},{type:'rock',x:x+205,lane});
          // This sits on the high part of a ramp jump, rather than at road level.
          // The flag gives it a generous airborne pickup volume so a clean ramp
          // launch is rewarding even when the car is boosted into the next ramp.
          this.items.push({type:'acorn',x:x+170,lane,z:170,rampBonus:true});
        } else {
          this.items.push({type:n<.60?'rock':'acorn',x,lane});
          this.items.push({type:'acorn',x:x+135,lane:(lane+1+Math.floor(this.rng()*2))%3});
        }
      }
      const foods=this.items.filter(it=>it.type==='acorn'&&it.x>2000);
      for(let i=0;i<this.difficulty.gold;i++){
        const index=Math.min(foods.length-1,Math.floor((i+1)*foods.length/(this.difficulty.gold+1)));
        foods[index].type='gold';
      }
      this.items.forEach((it,i)=>{it.id=i;it.seen=new Set();it.taken=false;});
    }
    emit(type,r,extra={}) {this.events.push({type,id:r.id,x:r.x,y:r.y,...extra});}
    move(r,dir) {if(this.state==='racing')r.lane=Math.max(0,Math.min(2,r.lane+dir));}
    jump(r, ramp=false) {
      if(this.state!=='racing') return false;
      // A ramp must relaunch a car that is still airborne from a previous ramp.
      // Otherwise a boosted car can reach the next ramp before landing, skip it,
      // and land in the rock that follows.
      if(!ramp&&(r.z>1||r.vz>0)) return false;
      r.vz=ramp?680:550; r.jumps++; this.emit(ramp?'ramp':'jump',r); return true;
    }
    hit(r) {
      if(r.invincible>0)return;
      const lost=Math.min(r.acorns,3); r.acorns-=lost; r.boost=0; r.gold=0; r.slow=1.45; r.invincible=1.9; r.hits++;
      this.emit('hit',r,{lost});
    }
    collect(r,it) {
      if(it.owner&&it.owner!==r.id)return;
      it.taken=true;r.acorns++;r.collected++;
      if(it.type==='gold'){r.gold=1.5;r.boost=0;}
      else if(r.gold<=0)r.boost=2.8;
      this.emit(it.type,r);
    }
    help(dt) {
      this.helpCooldown=Math.max(0,this.helpCooldown-dt);
      this.items=this.items.filter(it=>it.type!=='help'||(!it.taken&&this.time<it.expires));
      if(this.helpCooldown>0||this.items.some(it=>it.type==='help'))return;
      const p=this.player,o=this.opponent;
      if(Math.abs(p.x-o.x)<600)return;
      const r=p.x<o.x?p:o, x=r.x+240;
      if(x>LENGTH-160)return;
      // Choose a clear lane, preferring the trailing car's current lane.
      const lane=[r.lane,...[0,1,2].filter(l=>l!==r.lane)].find(l=>!this.items.some(it=>it.type==='rock'&&it.lane===l&&Math.abs(it.x-x)<150));
      if(lane===undefined)return;
      this.items.push({id:this.nextItemId++,type:'help',x,lane,owner:r.id,spawned:this.time,expires:this.time+4,seen:new Set(),taken:false});
      this.helpCooldown=6;this.emit('helpSpawn',r);
    }
    think(dt) {
      const r=this.opponent;r.aiWait-=dt;
      if(r.aiWait>0)return;
      r.aiWait=this.difficulty.reaction+this.rng()*.20;
      const danger=this.items.find(it=>it.type==='rock'&&it.x>r.x&&it.x<r.x+220&&it.lane===r.lane);
      if(danger && this.rng()<this.difficulty.dodge) {
        if(this.rng()<.48)this.jump(r);
        else {
          const safe=[0,1,2].filter(l=>l!==r.lane&&!this.items.some(it=>it.type==='rock'&&it.lane===l&&it.x>r.x-40&&it.x<r.x+260));
          if(safe.length)r.lane=safe[Math.floor(this.rng()*safe.length)];
        }
      } else {
        const food=this.items.find(it=>['acorn','gold','help','ramp'].includes(it.type)&&(!it.owner||it.owner===r.id)&&!it.taken&&it.x>r.x+90&&it.x<r.x+390);
        if(food&&this.rng()<this.difficulty.food)r.lane=food.lane;
      }
    }
    update(dt) {
      if(this.state==='finished'||this.state==='paused')return;
      if(this.state==='countdown') {this.countdown-=dt;if(this.countdown<=0)this.state='racing';return;}
      dt=Math.min(dt,.05); this.time+=dt; this.help(dt); this.think(dt);
      const old=[this.player.x,this.opponent.x];
      for(const r of [this.player,this.opponent]) {
        r.boost=Math.max(0,r.boost-dt); r.gold=Math.max(0,r.gold-dt); r.slow=Math.max(0,r.slow-dt); r.invincible=Math.max(0,r.invincible-dt);
        const base=r===this.player?300:this.difficulty.speed;
        const target=r.slow>0?base*.47:r.gold>0?base*2:r.boost>0?base*1.43:base;
        r.speed+=(target-r.speed)*Math.min(1,dt*7); r.x+=r.speed*dt;
        r.y+=(r.lane-r.y)*Math.min(1,dt*13);
        if(r.z>0||r.vz>0){r.z+=r.vz*dt;r.vz-=1200*dt;if(r.z<=0){r.z=0;r.vz=0;}}
      }
      // Resolve pickups chronologically so shared acorns go to the first car.
      const interactions=[];
      [this.player,this.opponent].forEach((r,ri)=>{
        for(const it of this.items) {
          if(it.taken||it.seen.has(r.id)||(it.owner&&it.owner!==r.id))continue;
          const reach=35;
          const crossed=old[ri]-it.x<reach&&r.x-it.x>=-reach;
          if(crossed&&Math.abs(it.lane-r.y)<.42) interactions.push({r,it,t:(it.x-reach-old[ri])/(r.x-old[ri])});
        }
      });
      interactions.sort((a,b)=>a.t-b.t).forEach(({r,it})=>{
        if(it.taken)return;it.seen.add(r.id);
        if(['acorn','gold','help'].includes(it.type)) {
          // Ramp rewards follow the flight arc and should not be narrowly missed
          // because a frame reaches the pickup a little before or after its apex.
          const verticalReach=it.rampBonus?150:78;
          if(Math.abs(r.z-(it.z||0))<verticalReach)this.collect(r,it);
        }
        if(it.type==='rock'&&r.z<48)this.hit(r);
        if(it.type==='ramp')this.jump(r,true);
      });
      const p=this.player,o=this.opponent;
      if(Math.abs(p.x-o.x)<70&&Math.abs(p.y-o.y)<.43&&Math.abs(p.z-o.z)<50&&p.invincible===0&&o.invincible===0){this.hit(p);this.hit(o);}
      if(p.x>=LENGTH||o.x>=LENGTH) {
        const pt=p.x>=LENGTH?(LENGTH-old[0])/(p.x-old[0]):Infinity;
        const ot=o.x>=LENGTH?(LENGTH-old[1])/(o.x-old[1]):Infinity;
        this.winner=pt<=ot?p.id:o.id;this.state='finished';
      }
    }
  }
  return {Race,CHARACTERS,LENGTH,DIFFICULTY,opponents,seeded};
});
