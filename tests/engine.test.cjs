const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Race,CHARACTERS,LENGTH,opponents,seeded}=require('../engine.js');
function empty(){const g=new Race('brown','gray',42);g.items=[];g.state='racing';g.think=()=>{};g.opponent.x=-2000;return g;}
function step(g,t){for(let i=0;i<Math.round(t*120);i++)g.update(1/120);}
function item(type,x,lane=1,z=0){return {id:0,type,x,lane,z,seen:new Set(),taken:false};}
test('five characters each face four unique shuffled opponents',()=>{
 assert.deepEqual(CHARACTERS.map(c=>c.name),['ぽん','うさ','むぎくん','もかちゃま','ゆずくん']);
 for(const c of CHARACTERS){const pool=opponents(c.id,seeded(77));assert.equal(pool.length,4);assert.equal(new Set(pool).size,4);assert.ok(!pool.includes(c.id));}
 assert.notDeepEqual(opponents('brown',seeded(1)),opponents('brown',seeded(2)));
});
test('countdown prevents input and movement, then starts automatically',()=>{const g=new Race('brown','gray');g.move(g.player,-1);assert.equal(g.player.lane,1);assert.equal(g.jump(g.player),false);step(g,2);assert.equal(g.player.x,0);step(g,1);assert.equal(g.state,'racing');assert.ok(g.player.x>0);});
test('lane transitions stop at three lanes and work mid-jump',()=>{const g=empty();g.move(g.player,-1);g.move(g.player,-1);assert.equal(g.player.lane,0);g.jump(g.player);g.move(g.player,1);step(g,.2);assert.ok(g.player.z>0);g.move(g.player,1);g.move(g.player,1);assert.equal(g.player.lane,2);});
test('jump lands and cannot retrigger in the air',()=>{const g=empty();assert.ok(g.jump(g.player));assert.equal(g.jump(g.player),false);step(g,.5);assert.ok(g.player.z>48);step(g,.5);assert.equal(g.player.z,0);assert.ok(g.jump(g.player));});
test('acorn collects once, boosts temporarily, then returns to base speed',()=>{const g=empty();g.items=[item('acorn',100)];step(g,1);assert.equal(g.player.acorns,1);assert.equal(g.player.collected,1);assert.ok(g.player.speed>400);step(g,4);assert.equal(g.player.boost,0);assert.ok(Math.abs(g.player.speed-300)<1);});
test('rock drops at most three acorns, cancels boost, and respects immunity',()=>{const g=empty();g.player.acorns=5;g.player.boost=2;g.items=[item('rock',90)];step(g,.4);assert.equal(g.player.acorns,2);assert.equal(g.player.boost,0);assert.ok(g.player.slow>0);assert.equal(g.player.hits,1);g.hit(g.player);assert.equal(g.player.hits,1);step(g,2);assert.ok(g.player.speed>270);});
test('empty inventory never goes negative',()=>{const g=empty();g.hit(g.player);assert.equal(g.player.acorns,0);assert.ok(g.player.slow>0);});
test('jump clears rock; adjacent lane avoids rock',()=>{let g=empty();g.items=[item('rock',155)];g.jump(g.player);step(g,1);assert.equal(g.player.hits,0);g=empty();g.items=[item('rock',250,0)];step(g,1);assert.equal(g.player.hits,0);});
test('ramp launches automatically and clears the next rock',()=>{const g=empty();g.items=[item('ramp',100),item('rock',305)];step(g,1.5);assert.equal(g.player.jumps,1);assert.equal(g.player.hits,0);assert.ok(g.events.some(e=>e.type==='ramp'));});
test('car contact penalizes both; separate lanes do not',()=>{const g=empty();g.opponent.x=0;g.opponent.y=g.opponent.lane=1;g.player.acorns=2;g.opponent.acorns=3;step(g,.1);assert.equal(g.player.hits,1);assert.equal(g.opponent.hits,1);assert.equal(g.player.acorns,0);const h=empty();h.opponent.x=0;step(h,.1);assert.equal(h.player.hits,0);});
test('shared acorn belongs to first arriving car',()=>{const g=empty();g.opponent.x=70;g.opponent.lane=g.opponent.y=1;g.player.x=0;g.items=[item('acorn',110)];step(g,.15);assert.equal(g.opponent.acorns,1);assert.equal(g.player.acorns,0);});
test('pause freezes simulation state',()=>{const g=empty();g.state='paused';step(g,5);assert.equal(g.time,0);assert.equal(g.player.x,0);});
test('finish crossing order determines winner on same update',()=>{const g=empty();g.player.x=LENGTH-1;g.opponent.x=LENGTH-2;g.update(1/120);assert.equal(g.winner,'brown');assert.equal(g.state,'finished');const x=g.player.x;step(g,3);assert.equal(g.player.x,x);});
test('opponent can win',()=>{const g=empty();g.opponent.x=LENGTH-1;g.update(1/120);assert.equal(g.winner,'gray');});
test('full stage finishes for every character and round',()=>{for(const c of CHARACTERS)for(let round=0;round<4;round++){const rival=opponents(c.id,seeded(1))[round];const g=new Race(c.id,rival,200+round,round);step(g,65);assert.equal(g.state,'finished');assert.ok(g.time>20&&g.time<60);for(const type of ['ramp','rock','acorn'])assert.ok(g.items.some(i=>i.type===type));}});
