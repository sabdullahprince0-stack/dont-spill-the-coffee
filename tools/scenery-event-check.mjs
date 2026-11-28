// Measure real, naturally generated throttle/brake events with deterministic inputs.
// Usage: node tools/scenery-event-check.mjs [--baseline path-to-previous-render.js]
// The previous renderer is optional; it is loaded in an isolated test VM only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { makeGame } from './refactor-check.mjs';

const baselineIndex=process.argv.indexOf('--baseline');
const previous=baselineIndex>=0?fs.readFileSync(process.argv[baselineIndex+1],'utf8'):null;
const report={units:'canvas pixels per second, before the existing 1.017 camera scale',routes:[]};
for(let level=0;level<6;level++)for(const motion of [0,1,2])for(const seed of [123,731291]){
  const g=makeGame(false,{seed}),r=g.context.CoffeeGame.render;
  let old;
  if(previous){
    old=makeGame(false,{seed});vm.runInContext(previous,old.context);old.start(level);old.sim.motion=motion;
  }
  g.start(level);g.sim.motion=motion;
  const events=[];
  let current=null,steps=0,velocityMin=Infinity,velocityMax=0;
  while(g.sim.state==='play'){
    const s=g.sim,effective=Math.atan2(-s.ax*1.22,Math.max(2,9.81+s.ay));
    const dir=Math.abs(effective-s.theta)>.09&&steps%48<18?Math.sign(effective-s.theta):0;
    s.keys={left:dir<0,right:dir>0};
    const at=r.scenery.scroll;g.step(1/120);r.updateScenery(1/120);
    const after=(r.scenery.scroll-at)*120*.58;
    let before=s.state==='play'?Math.max(0,s.speed)*[4.2,1.5,0][motion]*.58:0;
    if(old){const or=old.context.CoffeeGame.render,oa=or.scenery.scroll;old.sim.keys={left:dir<0,right:dir>0};old.step(1/120);or.updateScenery(1/120);before=(or.scenery.scroll-oa)*120*.58;assert.equal(g.snapshot(),old.snapshot(),'physics and RNG match previous renderer');}
    velocityMin=Math.min(velocityMin,s.speed);velocityMax=Math.max(velocityMax,s.speed);
    const e=s.event,active=e&&s.t>=e.start&&s.t<e.start+e.dur;
    if(active&&['FULL THROTTLE!','BRAKE!'].includes(e.kind)){
      if(!current||current.start!==e.start){current={kind:e.kind,start:e.start,duration:e.dur,samples:[]};events.push(current);}
      current.samples.push({elapsed:s.t-e.start,velocity:s.speed,before,after,ratio:before>0?after/before:0});
    } else current=null;
    steps++;assert.ok(steps<7000,'route completes');
  }
  for(const e of events){
    const plateau=e.samples.filter(s=>s.elapsed>=.4&&s.elapsed<=e.duration-.08);
    for(const sample of plateau){
      if(motion===2||sample.before===0){assert.equal(sample.after,0,'Still or completed route remains motionless');continue;}
      assert.ok(sample.after<=32*[4.2,1.5,0][motion]*.58+1e-8,'comfortable visual cap');
      if(e.kind==='FULL THROTTLE!'&&sample.velocity*1.9<=32){
        assert.ok(sample.ratio>=1.8&&sample.ratio<=2,'uncapped throttle reaches 1.8–2.0x matched-velocity cruise');
      }
      if(e.kind==='BRAKE!')assert.ok(sample.ratio>=.449&&sample.ratio<=.5,'brake visibly slows scenery: '+JSON.stringify({level,motion,seed,sample}));
    }
    const middle=e.samples.reduce((a,b)=>Math.abs(b.elapsed-e.duration*.6)<Math.abs(a.elapsed-e.duration*.6)?b:a);
    e.middle=middle;
    e.plateau=plateau.length?{before:plateau.reduce((n,s)=>n+s.before,0)/plateau.length,after:plateau.reduce((n,s)=>n+s.after,0)/plateau.length,minRatio:Math.min(...plateau.map(s=>s.ratio)),maxRatio:Math.max(...plateau.map(s=>s.ratio))}:null;
    // Keep enough measured samples to inspect transitions without a huge trace.
    e.samples=e.samples.filter((_,i)=>i%12===0);
  }
  report.routes.push({route:level+1,motion,seed,steps,velocityMin,velocityMax,events});
}
const table=report.routes.filter(r=>r.motion===0&&r.seed===123).map(r=>{
  const throttle=r.events.find(e=>e.kind==='FULL THROTTLE!'),brake=r.events.find(e=>e.kind==='BRAKE!');
  return {route:r.route,minV:r.velocityMin.toFixed(2),maxV:r.velocityMax.toFixed(2),throttleBefore:throttle?.middle.before.toFixed(2),throttleAfter:throttle?.middle.after.toFixed(2),throttleRatio:throttle?.middle.ratio.toFixed(2),brakeBefore:brake?.middle.before.toFixed(2),brakeAfter:brake?.middle.after.toFixed(2)};
});
console.table(table);
const output=fs.mkdtempSync(path.join(os.tmpdir(),'coffee-event-speeds-'));
fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(report,null,2));
console.log('Measured naturally generated events on all routes, both seeds and all motion modes.');
console.log('PASS: event speed ratios, comfort caps and Still mode during real generated events.');
if(previous)console.log('PASS: every physics state and RNG call matches the previous renderer.');
console.log('Measurements:',path.join(output,'measurements.json'));
