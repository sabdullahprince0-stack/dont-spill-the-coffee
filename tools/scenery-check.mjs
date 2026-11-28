// Visual motion checks and an offline demonstration made from real Chrome frames.
// Usage: node tools/scenery-check.mjs [path-to-chrome-or-edge]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { root, makeGame } from './refactor-check.mjs';

// Production changes are restricted to the renderer and its two lifecycle hooks.
for (const file of ['physics', 'config', 'state', 'audio', 'assets', 'ui', 'endings']) {
  assert.equal(fs.readFileSync(path.join(root, `js/${file}.js`), 'utf8').replace(/\r\n/g,'\n'),
    execFileSync('git', ['show', `HEAD:js/${file}.js`], {cwd:root, encoding:'utf8'}), file+' source unchanged');
}
const results={frameRates:[],events:[],loops:[],demo:[]};
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-8, `${label}: ${a} versus ${b}`);
for (const motion of [0,1,2]) for (const fps of [20,30,60,120,144]) {
  const g=makeGame(false),r=g.context.CoffeeGame.render;
  g.start(0);g.sim.motion=motion;g.sim.speed=12;g.sim.ay=3;
  const before=g.snapshot();
  for(let i=0;i<fps*2;i++)r.updateScenery(1/fps);
  near(r.scenery.scroll,12*2*[4.2,1.5,0][motion], 'velocity × delta time');
  near(r.scenery.bump,3*[.18,.045,0][motion]*(1-Math.exp(-24)), 'time-based bump damping');
  assert.equal(g.snapshot(),before,'visual update never mutates simulation, saves or RNG');
  const scroll=r.scenery.scroll;
  for(const speed of [0,-1]){g.sim.speed=speed;r.updateScenery(1/fps);near(r.scenery.scroll,scroll,'stationary scenery');}
  g.sim.state='pause';g.sim.speed=23;
  r.updateScenery(1);near(r.scenery.scroll,scroll,'paused scenery');
  for(const state of ['menu','result','ending']){g.sim.state=state;r.updateScenery(1);near(r.scenery.scroll,scroll,state+' scenery');}
}
console.log('PASS: velocity × dt at 20/30/60/120/144 Hz, zero/negative speed, pause/menu/results, visual isolation and bump damping.');

// Warnings must not change visual speed. Verify responsive, bounded transitions
// and release independently of physical acceleration, including the comfort cap.
{
  const g=makeGame(false),r=g.context.CoffeeGame.render;g.start(0);g.sim.speed=8;
  g.sim.event={kind:'FULL THROTTLE!',start:1,dur:1};g.sim.t=.5;
  for(let i=0;i<60;i++)r.updateScenery(1/120);
  near(r.scenery.driveGain,1,'no boost during warning');
  g.sim.t=1;
  let previous=r.scenery.scroll;
  for(let i=0;i<60;i++){r.updateScenery(1/120);assert.ok(r.scenery.scroll>previous);assert.ok(r.scenery.scroll-previous<=32*4.2/120+1e-8);previous=r.scenery.scroll;}
  assert.ok(r.scenery.driveGain>1.89&&r.scenery.driveGain<1.9,'responsive throttle gain');
  g.sim.event.kind='BRAKE!';
  for(let i=0;i<60;i++)r.updateScenery(1/120);
  assert.ok(r.scenery.driveGain>=.45&&r.scenery.driveGain<.46,'responsive brake gain');
  g.sim.t=2.1;for(let i=0;i<120;i++)r.updateScenery(1/120);
  assert.ok(r.scenery.driveGain>.99&&r.scenery.driveGain<1,'smooth return to cruise');
  g.sim.t=1;g.sim.event.kind='FULL THROTTLE!';g.sim.speed=23;
  for(let i=0;i<60;i++)r.updateScenery(1/120);
  near(r.scenery.scrollRate,32*4.2,'high-speed comfort cap');
  g.sim.speed=0;const at=r.scenery.scroll;r.updateScenery(1/120);near(r.scenery.scroll,at,'rest stops even during throttle');
}
console.log('PASS: warning intervals, smooth throttle/brake/release gain, continuous phase and high-speed comfort cap.');

// Exercise the actual main-loop accumulator at the same elapsed time, not just
// the helper. Suppress drawing only in this VM; real rendering is checked below.
for(let level=0;level<6;level++)for(const motion of [0,1,2]) {
  let expected;
  for(const rate of [20,30,60,120,144,'jitter']) {
    const g=makeGame(false,{seed:731291}),r=g.context.CoffeeGame.render;
    r.draw=()=>{};
    g.start(level);g.sim.motion=motion;
    let now=0,i=0;
    while(now<12000){const delta=rate==='jitter'?[1000/27,1000/144,1000/73][i++%3]:1000/rate;now=Math.min(12000,now+delta);g.frame(now);}
    // Avoid classifying round-off at an exact accumulator boundary as a lost step.
    g.frame(12000.0001);
    const snapshot=JSON.parse(g.snapshot());delete snapshot.state.monitorClock;
    const actual={snapshot:JSON.stringify(snapshot),scroll:r.scenery.scroll,bump:r.scenery.bump,t:g.sim.t};
    if(!expected)expected=actual;
    else {assert.equal(actual.snapshot,expected.snapshot,`route ${level+1}, ${motion}, ${rate} physics`);near(actual.scroll,expected.scroll,'frame-independent scroll');near(actual.bump,expected.bump,'frame-independent bump');}
    results.frameRates.push({route:level+1,motion,rate,t:actual.t,scroll:actual.scroll,bump:actual.bump});
  }
}
// A delayed frame still obeys the original 50 ms frame cap. A restart clears
// presentation offsets; changing motion mode never resets the horizontal phase.
{
  const g=makeGame(false),r=g.context.CoffeeGame.render;r.draw=()=>{};
  g.start(0);g.frame(1000);
  assert.ok(g.sim.t<=.05+1e-8);assert.ok(r.scenery.scroll<=8*.05*4.2+1e-8);
  g.sim.motion=2;const at=r.scenery.scroll;g.frame(1017);near(r.scenery.scroll,at,'Still freeze');
  near(r.scenery.bump,0,'Still bump');
  g.sim.motion=1;g.frame(1034);assert.ok(r.scenery.scroll>at,'Minimal resumes without reset');
  g.start(1);near(r.scenery.scroll,0,'route reset');near(r.scenery.bump,0,'bump reset');
}
console.log('PASS: actual main loop at five frame rates plus jitter, all six routes and all motion modes; frame cap, Still, switching and restart.');

// Offline Chrome review. Isolated temporary profile; no user browser saves.
const output=fs.mkdtempSync(path.join(os.tmpdir(),'coffee-scenery-'));
const profile=path.join(output,'profile');
const executable=process.argv[2]||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=spawn(executable,['--headless=new','--disable-gpu','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class CDP {
  id=0;pending=new Map();events=[];
  constructor(socket){this.socket=socket;socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(!m.id)return this.events.push(m);const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);});socket.addEventListener('close',()=>{for(const p of this.pending.values())p.reject(Error('Browser connection closed'));this.pending.clear();});}
  send(method,params={}){const id=++this.id,promise=new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}));this.socket.send(JSON.stringify({id,method,params}));return promise;}
  async evaluate(expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
}
// Decode screenshots outside the browser: file:// canvas readback is restricted.
function pixels(base64){
  const png=Buffer.from(base64,'base64'),parts=[];
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20),channels=png[25]===6?4:3;
  for(let p=8;p<png.length;){const size=png.readUInt32BE(p);if(png.toString('ascii',p+4,p+8)==='IDAT')parts.push(png.subarray(p+8,p+8+size));p+=size+12;}
  const raw=inflateSync(Buffer.concat(parts)),stride=width*channels,result=Buffer.alloc(stride*height);
  for(let y=0,p=0;y<height;y++){const filter=raw[p++];for(let col=0;col<stride;col++){const at=y*stride+col,a=col>=channels?result[at-channels]:0,b=y?result[at-stride]:0,d=y&&col>=channels?result[at-stride-channels]:0;const v=a+b-d,pa=Math.abs(v-a),pb=Math.abs(v-b),pc=Math.abs(v-d);result[at]=raw[p++]+[0,a,b,Math.floor((a+b)/2),pa<=pb&&pa<=pc?a:pb<=pc?b:d][filter];}}
  return channels===3?result:Buffer.from(result.filter((_,i)=>i%4!==3));
}
function difference(a,b){assert.equal(a.length,b.length);let total=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);total+=d;max=Math.max(max,d);}return {mean:total/a.length,max};}
let c;
try {
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<100&&!fs.existsSync(portFile);i++)await sleep(100);
  assert.ok(fs.existsSync(portFile),'Chrome failed to start; check sandbox permissions.');
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve);socket.addEventListener('error',reject);});
  c=new CDP(socket);
  for(const method of ['Page.enable','Runtime.enable','Network.enable'])await c.send(method);
  results.browser=(await c.send('Browser.getVersion')).product;
  await c.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  const hook=await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.clear();let seed=123;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};performance.now=()=>0;requestAnimationFrame=fn=>window.testFrame=fn;`});
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  const url=pathToFileURL(path.join(root,'index.html')).href;
  await c.send('Page.navigate',{url});
  let loaded=false;
  for(let i=0;i<200;i++){loaded=await c.evaluate(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'&&typeof CoffeeGame==='object'`);if(loaded)break;await sleep(50);}
  assert.ok(loaded);
  assert.ok(await c.evaluate(`Object.values(CoffeeGame.assets.images).concat(CoffeeGame.routes.art.flatMap(a=>[a.street,a.interior,a.cup])).every(i=>i.complete&&i.naturalWidth>0)`),'all artwork loads offline');
  assert.ok(await c.evaluate(`CoffeeGame.routes.art[0].street.src.endsWith('/assets/route01-custom.png')`),'custom panorama preserved');
  async function screenshot(name,jpeg=false){
    const clip=await c.evaluate(`(()=>{const r=document.getElementById('c').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:${jpeg?.75:1}}})()`);
    const {data}=await c.send('Page.captureScreenshot',{format:jpeg?'jpeg':'png',...(jpeg?{quality:85}:{}),clip});
    if(name)fs.writeFileSync(path.join(output,name+(jpeg?'.jpg':'.png')),Buffer.from(data,'base64'));
    return jpeg?null:pixels(data);
  }
  // Both window phases cross modulo zero without a displacement jump, on every
  // route. Also compare one full period to catch incorrect wrap widths.
  for(let level=0;level<6;level++){
    await c.evaluate(`CoffeeGame.main.start(${level});CoffeeGame.render.draw()`);
    const width=await c.evaluate(`(()=>{const g=CoffeeGame,im=g.routes.imageFor('street');return g.routes.art[g.state.level].panorama?(im.naturalWidth-Math.round(im.naturalHeight*.16))*294/im.naturalHeight:294*im.width/im.height})()`);
    const sample=async scroll=>{await c.evaluate(`CoffeeGame.render.scenery.scroll=${scroll};CoffeeGame.render.draw()`);return screenshot();};
    for(const at of [width*.15/.58,width*.57/.58]){
      const a=await sample(at-.001),b=await sample(at+.001),p=await sample(at),q=await sample(at+width/.58);
      const boundary=difference(a,b),period=difference(p,q);
      assert.ok(boundary.mean<.05,JSON.stringify(boundary));assert.ok(period.mean<.001,JSON.stringify(period));
      results.loops.push({route:level+1,scroll:at,boundary,period});
    }
  }
  console.log('PASS: offline file:// images and both scrolling wrap boundaries on all six routes.');
  // Capture naturally generated events too: no event force, duration or timing is
  // injected. Match the seeded corrective input policy used in the before/after VM.
  results.naturalEvents=[];
  for(let level=0;level<6;level++)for(const kind of ['FULL THROTTLE!','BRAKE!']){
    const measured=await c.evaluate(`(()=>{const g=CoffeeGame,s=g.state,r=g.render;let seed=123;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};g.main.start(${level});s.motion=0;for(let i=0;i<7000&&s.state==='play';i++){const effective=Math.atan2(-s.ax*1.22,Math.max(2,9.81+s.ay));const dir=Math.abs(effective-s.theta)>.09&&i%48<18?Math.sign(effective-s.theta):0;s.keys={left:dir<0,right:dir>0};const at=r.scenery.scroll;g.physics.step(1/120);r.updateScenery(1/120);const e=s.event;if(e&&e.kind===${JSON.stringify(kind)}&&s.t>=e.start+e.dur*.6&&s.t<e.start+e.dur){r.draw();return {route:s.level+1,kind:e.kind,t:s.t,eventStart:e.start,duration:e.dur,velocity:s.speed,before:s.speed*4.2*.58,after:(r.scenery.scroll-at)*120*.58,gain:r.scenery.driveGain}}}throw Error('No generated event found')})()`);
    results.naturalEvents.push(measured);
    await screenshot(`natural-route-${level+1}-${kind==='FULL THROTTLE!'?'throttle':'brake'}`,true);
  }
  console.log('PASS: measured and captured naturally generated throttle/brake events on all six routes.');
  // Use route-approved event intensities and the real fixed-step physics. Only
  // event timing is scripted for a compact, repeatable review; inputs stay neutral.
  for(let level=0;level<6;level++){
    const title=await c.evaluate(`CoffeeGame.main.start(${level});CoffeeGame.state.motion=0;CoffeeGame.ui.updateMotion();CoffeeGame.state.next=Infinity;CoffeeGame.routes.levels[${level}][0]`);
    const frames=[];
    let previous=0;
    for(let frame=0;frame<=24;frame++){
      const target=frame*40;
      const observation=await c.evaluate(`(()=>{const g=CoffeeGame,s=g.state,r=g.render;for(let i=${previous};i<${target};i++){if(i===120)s.event={kind:'FULL THROTTLE!',start:s.t,dur:2,force:g.routes.levels[s.level][2]*1.1};if(i===360)s.event={kind:'BRAKE!',start:s.t,dur:2,force:-g.routes.levels[s.level][2]*1.1};if(i===600)s.event={kind:'POTHOLE!',start:s.t,dur:.72,force:g.routes.levels[s.level][2]*1.1};g.physics.step(1/120);r.updateScenery(1/120)}r.draw();return {t:s.t,speed:s.speed,ay:s.ay,bump:r.scenery.bump,scroll:r.scenery.scroll,pixelsPerSecond:r.scenery.scrollRate*.58,event:s.event&&s.t<s.event.start+s.event.dur?s.event.kind:'CRUISE'}})()`);
      const name=`route-${level+1}-${String(frame).padStart(2,'0')}`;
      await screenshot(name,true);
      frames.push({...observation,file:name+'.jpg'});
      previous=target;
    }
    assert.ok(frames[8].speed>frames[3].speed,'throttle speeds up');
    assert.ok(frames[14].speed<frames[9].speed,'brake slows down');
    assert.ok(frames.some(f=>Math.abs(f.bump)>.001),'pothole response');
    for(let i=1;i<frames.length;i++)assert.ok(frames[i].scroll>=frames[i-1].scroll,'continuous forward phase');
    results.demo.push({route:level+1,title,frames});
    results.events.push({route:level+1,cruise:frames[3].speed,throttle:frames[8].speed,brake:frames[14].speed,maxBump:Math.max(...frames.map(f=>Math.abs(f.bump)))});
  }
  // The model never reaches zero (minimum 3 m/s). Exercise rest only through
  // renderer inputs, with physics held; this is explicitly separate from gameplay.
  const stationary=await c.evaluate(`(()=>{const g=CoffeeGame;g.main.start(0);g.state.speed=0;const at=g.render.scenery.scroll;for(let i=0;i<240;i++)g.render.updateScenery(1/120);return {at,after:g.render.scenery.scroll}})()`);
  assert.equal(stationary.after,stationary.at);
  results.stationary=stationary;
  // Check the new native-loop wiring as well as the deterministic event fixture.
  await c.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:hook.identifier});
  await c.send('Page.reload');await sleep(500);
  await c.evaluate(`CoffeeGame.main.start(0)`);await sleep(1200);
  assert.ok(await c.evaluate(`CoffeeGame.render.scenery.scroll>0&&CoffeeGame.state.t>.5`));
  const frozen=await c.evaluate(`CoffeeGame.ui.pause();CoffeeGame.render.scenery.scroll`);await sleep(200);
  assert.equal(await c.evaluate(`CoffeeGame.render.scenery.scroll`),frozen);
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Network.loadingFailed'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  assert.deepEqual(errors,[],'browser errors');
  fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify(results,null,2));
  // Review-only chrome around captured game frames; production HTML/HUD is unchanged.
  fs.writeFileSync(path.join(output,'demo.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Velocity-responsive scenery review</title><style>body{margin:24px auto;max-width:1000px;padding:0 16px;background:#19130e;color:#ebdab9;font:17px Georgia}img{display:block;width:100%;height:auto}button,select,input{padding:8px;margin:4px;background:#32271c;color:#ebdab9;border:1px solid #b89c70}#timeline{width:95%}#stats{font:17px monospace;line-height:1.6}p{line-height:1.5}</style><h1>Velocity-responsive scenery</h1><p>Actual offline Chrome gameplay captures across all six routes. Event timing is scripted for review; vehicle acceleration, sloshing and spills use the unchanged physics. No steering inputs. The counter below measures scenery movement; the game HUD is unchanged.</p><select id="route"></select><button id="play">Pause / play</button><button id="restart">Replay route</button><p id="stats"></p><img id="game" alt="Captured gameplay"><input id="timeline" type="range" min="0" max="24" value="0"><p>Each sequence shows cruise → full throttle → braking → pothole → cruise. Active throttle targets 1.9 times matched-velocity cruise; braking targets 0.45 times, with smooth transitions. Comfort caps are about 78 canvas pixels/s in Gentle and 28 in Minimal; Still freezes scenery. Bump displacement is damped and capped at 1.25 px in Gentle, 0.35 px in Minimal and zero in Still. Zero velocity is tested separately because normal gameplay clamps vehicle speed to at least 3 m/s.</p><script>const routes=${JSON.stringify(results.demo)};let route=0,frame=0,playing=true;const $=id=>document.getElementById(id);routes.forEach((r,i)=>$('route').add(new Option('Route 0'+r.route+' · '+r.title,i)));function show(){const f=routes[route].frames[frame];$('game').src=f.file;$('timeline').value=frame;$('stats').textContent=f.t.toFixed(2)+' s · '+f.event+' · speed '+f.speed.toFixed(2)+' m/s · scenery '+f.pixelsPerSecond.toFixed(1)+' px/s · bump '+f.bump.toFixed(2)+' px'}$('route').onchange=()=>{route=+$('route').value;frame=0;show()};$('play').onclick=()=>playing=!playing;$('restart').onclick=()=>{frame=0;show()};$('timeline').oninput=()=>{frame=+$('timeline').value;playing=false;show()};setInterval(()=>{if(playing){frame=(frame+1)%routes[route].frames.length;show()}},333);show();</script></html>`);
  // A native live copy demonstrates smooth animation at the display frame rate.
  // Review controls exist only in this temporary copy, never in the game source.
  const live=path.join(output,'live');fs.mkdirSync(live);
  for(const folder of ['js','css','assets'])fs.cpSync(path.join(root,folder),path.join(live,folder),{recursive:true});
  fs.writeFileSync(path.join(live,'index.html'),fs.readFileSync(path.join(root,'index.html'),'utf8').replace('</body>','<script src="review.js"></script></body>'));
  fs.writeFileSync(path.join(live,'review.js'),`(function(){
    const g=CoffeeGame,s=g.state;
    const style=document.createElement('style');
    style.textContent='#review-panel{padding:12px;margin:0 10px 12px;border:1px solid #82705a;font:13px Georgia;line-height:1.5}#review-panel button,#review-panel select{font:inherit;margin:4px;padding:7px;background:#231c16;color:#e5d1b0;border:1px solid #82705a}#review-status{font-family:monospace;display:block;margin-top:6px}';
    document.head.append(style);
    const panel=document.createElement('section');panel.id='review-panel';panel.setAttribute('aria-label','Temporary scenery demonstration controls');
    panel.innerHTML='<strong>Scenery review — live, offline copy</strong><p>Choose a route and replay cruise → full throttle → braking → pothole. Only event timing is scripted; the game physics, cup and HUD are unchanged. Use the game’s Motion button to compare Gentle, Minimal and Still.</p><label>Route <select id="review-route"></select></label><button id="review-replay">Replay sequence</button><button id="review-natural">Natural gameplay</button><span id="review-status" role="status"></span>';
    document.getElementById('game').prepend(panel);
    const select=document.getElementById('review-route');
    g.routes.levels.forEach((l,i)=>select.add(new Option('0'+(i+1)+' · '+l[0],i)));
    let sequence=false,phase=0;
    function start(scripted){g.main.start(+select.value);sequence=scripted;phase=0;if(sequence)s.next=Infinity;}
    select.onchange=()=>start(true);
    document.getElementById('review-replay').onclick=()=>start(true);
    document.getElementById('review-natural').onclick=()=>start(false);
    function event(kind,dur,sign){s.event={kind,start:s.t,dur,force:sign*g.routes.levels[s.level][2]*1.1};}
    function update(){
      if(sequence&&s.state==='play'){
        if(phase===0&&s.t>=1){event('FULL THROTTLE!',2,1);phase=1;}
        if(phase===1&&s.t>=3){event('BRAKE!',2,-1);phase=2;}
        if(phase===2&&s.t>=5){event('POTHOLE!',.72,1);phase=3;}
        if(s.t>=8){sequence=false;s.next=s.t+.7;}
      }
      const px=s.state==='play'?g.render.scenery.scrollRate*.58:0;
      document.getElementById('review-status').textContent=(sequence?'Scripted review':'Natural gameplay')+' · '+s.speed.toFixed(2)+' m/s · scenery '+px.toFixed(1)+' px/s · offset '+(g.render.scenery.scroll*.58).toFixed(1)+' px · bump '+g.render.scenery.bump.toFixed(2)+' px';
      requestAnimationFrame(update);
    }
    start(true);update();
  })();`);
  await c.send('Page.navigate',{url:pathToFileURL(path.join(live,'index.html')).href});
  let demoLoaded=false;
  for(let i=0;i<100;i++){demoLoaded=await c.evaluate(`document.readyState==='complete'&&!!document.getElementById('review-replay')`);if(demoLoaded)break;await sleep(50);}
  assert.ok(demoLoaded,'native demonstration loads');
  await c.evaluate(`document.getElementById('review-route').value='5';document.getElementById('review-route').dispatchEvent(new Event('change'));CoffeeGame.state.motion=0;CoffeeGame.ui.updateMotion()`);
  await sleep(1800);
  assert.ok(await c.evaluate(`CoffeeGame.state.level===5&&CoffeeGame.state.speed>8&&CoffeeGame.render.scenery.scroll>0`),'native demo throttle and route selector');
  await c.evaluate(`document.getElementById('motion').click();document.getElementById('motion').click()`);
  const still=await c.evaluate(`CoffeeGame.render.scenery.scroll`);await sleep(200);
  assert.equal(await c.evaluate(`CoffeeGame.render.scenery.scroll`),still,'native demo Still mode');
  await c.evaluate(`document.getElementById('motion').click();document.getElementById('review-route').value='0';document.getElementById('review-route').dispatchEvent(new Event('change'))`);
  await sleep(1500);
  const {data:demoPng}=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  fs.writeFileSync(path.join(output,'live-demo.png'),Buffer.from(demoPng,'base64'));
  assert.deepEqual(c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Network.loadingFailed'),[],'native demo errors');
  console.log('PASS: scripted throttle/brake/pothole gameplay on all routes, stationary renderer, native animation and pause; no console or load errors.');
  console.log('PASS: native offline demonstration, route selector and motion controls.');
  console.log('Live demonstration:',path.join(live,'index.html'));
  console.log('Captured timeline:',path.join(output,'demo.html'));
  console.table(results.events);
} finally {if(c){await c.send('Browser.close').catch(()=>{});c.socket.close();}browser.kill();}
