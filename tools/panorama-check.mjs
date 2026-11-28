// Route 01 review: real Chrome, file://, isolated saves and no npm dependencies.
// Usage: node tools/panorama-check.mjs [path-to-chrome-or-edge]
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { root, makeGame, originalHTML, originalBridge, currentBridge } from './refactor-check.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const assetHashes = {};
for (const file of execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', 'assets'], {cwd: root, encoding: 'utf8'}).trim().split('\n')) {
  const baseline = execFileSync('git', ['show', 'HEAD:' + file], {cwd: root, maxBuffer: 32 * 1024 * 1024});
  assert.equal(hash(fs.readFileSync(path.join(root, file))), hash(baseline), file);
  assetHashes[file] = hash(baseline);
}
assetHashes['assets/route01-custom.png'] = hash(fs.readFileSync(path.join(root, 'assets/route01-custom.png')));
console.log('PASS: original asset checksums unchanged.');
let runs = 0, steps = 0;
for (const seed of [123, 731291]) for (let level = 0; level < 6; level++) for (let motion = 0; motion < 3; motion++) for (const policy of ['neutral', 'hold', 'correct']) {
  const games = [makeGame(true, {seed}), makeGame(false, {seed})];
  games.forEach(g => { g.start(level); g.sim.motion = motion; });
  for (let i = 0; games[0].sim.state === 'play'; i++) {
    assert.ok(i < 7000);
    const s = games[0].sim, effective = Math.atan2(-s.ax * 1.22, Math.max(2, 9.81 + s.ay));
    const dir = policy === 'hold' ? -1 : policy === 'correct' && Math.abs(effective - s.theta) > .09 && i % 48 < 18 ? Math.sign(effective - s.theta) : 0;
    games.forEach(g => { g.sim.keys = {left:dir < 0, right:dir > 0}; g.step(1/120); g.context.CoffeeGame?.render.updateScenery(1/120); });
    assert.equal(games[1].snapshot(), games[0].snapshot(), `physics route ${level+1}, ${motion}, ${policy}, step ${i}`);
    steps++;
  }
  runs++;
}
console.log(`PASS: ${runs} seeded full-route physics replays, ${steps} identical paired steps, all routes and motion modes.`);

// Read DevTools screenshots, since file:// intentionally taints canvas readback.
function pixels(base64) {
  const png=Buffer.from(base64,'base64'),parts=[];
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20),channels=png[25]===6?4:3;
  for(let p=8;p<png.length;) {
    const size=png.readUInt32BE(p);
    if(png.toString('ascii',p+4,p+8)==='IDAT')parts.push(png.subarray(p+8,p+8+size));
    p+=size+12;
  }
  const raw=inflateSync(Buffer.concat(parts)),stride=width*channels,result=Buffer.alloc(stride*height);
  for(let y=0,p=0;y<height;y++) {
    const filter=raw[p++];
    for(let col=0;col<stride;col++) {
      const at=y*stride+col,a=col>=channels?result[at-channels]:0,b=y?result[at-stride]:0,d=y&&col>=channels?result[at-stride-channels]:0;
      const predictor=a+b-d,pa=Math.abs(predictor-a),pb=Math.abs(predictor-b),pc=Math.abs(predictor-d);
      result[at]=raw[p++]+[0,a,b,Math.floor((a+b)/2),pa<=pb&&pa<=pc?a:pb<=pc?b:d][filter];
    }
  }
  // Normalize RGB and RGBA screenshots to RGB.
  return channels===3?result:Buffer.from(result.filter((_,i)=>i%4!==3));
}
function difference(a,b) {
  assert.equal(a.length,b.length);
  let total=0,max=0;
  for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);total+=d;max=Math.max(max,d);}
  return {mean:total/a.length,max};
}

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'coffee-panorama-'));
const baseline = path.join(output, 'baseline');
fs.mkdirSync(baseline);
fs.writeFileSync(path.join(baseline, 'index.html'), originalHTML);
fs.cpSync(path.join(root, 'assets'), path.join(baseline, 'assets'), {recursive:true});
const executable = process.argv[2] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = path.join(output, 'profile');
const browser = spawn(executable, ['--headless=new','--disable-gpu','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required','--user-data-dir='+profile,'about:blank'], {windowsHide:true, stdio:'ignore'});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class CDP {
  sequence = 0; pending = new Map(); events = [];
  constructor(socket) {
    this.socket = socket;
    socket.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (!m.id) return this.events.push(m);
      const p = this.pending.get(m.id); this.pending.delete(m.id);
      if (m.error) p.reject(Error(JSON.stringify(m.error))); else p.resolve(m.result);
    });
  }
  send(method, params={}) {
    const id = ++this.sequence;
    const promise = new Promise((resolve,reject) => this.pending.set(id,{resolve,reject}));
    this.socket.send(JSON.stringify({id,method,params}));
    return promise;
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
}
let c;
const observations = {runs, steps, assetHashes};
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i=0;i<100&&!fs.existsSync(portFile);i++) await sleep(100);
  assert.ok(fs.existsSync(portFile), 'Chrome could not start; check sandbox permissions.');
  const port = fs.readFileSync(portFile,'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve);socket.addEventListener('error',reject);});
  c = new CDP(socket);
  for (const method of ['Page.enable','Runtime.enable','Network.enable']) await c.send(method);
  observations.browser = (await c.send('Browser.getVersion')).product;
  await c.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  const hook = await c.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.clear();let seed=123;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};performance.now=()=>0;requestAnimationFrame=fn=>window.testFrame=fn;`});
  async function viewport(width=1280,height=800) {
    await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  }
  async function load(original=false) {
    await viewport(); c.events.length=0;
    const url = pathToFileURL(path.join(original?baseline:root,'index.html')).href;
    await c.send('Page.navigate',{url});
    let loaded=false;
    for(let i=0;i<200;i++) {
      loaded=await c.evaluate(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'&&typeof testFrame==='function'`);
      if(loaded) break;
      await sleep(50);
    }
    assert.ok(loaded,'page loaded');
    await c.evaluate(original?originalBridge:currentBridge);
    const assets=await c.evaluate(`(()=>{const list=${original?'Object.values(images).concat(routeArt.flatMap(a=>[a.street,a.interior,a.cup]))':'Object.values(CoffeeGame.assets.images).concat(CoffeeGame.routes.art.flatMap(a=>[a.street,a.interior,a.cup]))'};return list.map(i=>({src:i.src,ok:i.complete&&i.naturalWidth>0}))})()`);
    assert.ok(assets.every(a=>a.ok),JSON.stringify(assets.filter(a=>!a.ok)));
  }
  async function capture(name) {
    await sleep(150);
    const {data}=await c.send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(data,'base64'));
  }
  async function canvasPixels() {
    const clip=await c.evaluate(`(()=>{const r=document.getElementById('c').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
    return pixels((await c.send('Page.captureScreenshot',{format:'png',clip})).data);
  }
  function noErrors(label) {
    const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Network.loadingFailed'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
    assert.deepEqual(errors,[],label);
  }
  const otherRoutes=[];
  for(const original of [true,false]) {
    await load(original);
    for(let level=1;level<6;level++) {
      // Compare artwork at identical coordinates; velocity-driven motion is tested separately.
      await c.evaluate(`(()=>{const g=testGame;g.start(${level});for(let i=0;i<540;i++)g.step(1/120);${original?'':'CoffeeGame.render.scenery.scroll=g.sim.scroll;CoffeeGame.render.scenery.bump=Math.sin(g.sim.t*31)*g.sim.ay*[.13,.035,0][g.sim.motion];'}g.draw()})()`);
      const result=await canvasPixels();
      if(original) otherRoutes.push(result); else assert.ok(result.equals(otherRoutes[level-1]),`Route ${level+1} pixels unchanged`);
    }
    noErrors('route comparison');
  }
  console.log('PASS: Routes 02–06 pixel-identical to the original over offline file://.');
  await load();
  await c.evaluate(`document.getElementById('menuStart').click();document.querySelector('#menuActions button').click();for(let i=0;i<540;i++){CoffeeGame.physics.step(1/120);CoffeeGame.render.updateScenery(1/120)}CoffeeGame.render.draw()`);
  await capture('route01-gameplay-desktop');
  observations.image=await c.evaluate(`(()=>{const im=CoffeeGame.routes.art[0].street;return {width:im.naturalWidth,height:im.naturalHeight,source:im.getAttribute('src')}})()`);
  await viewport(390,844);
  await capture('route01-gameplay-mobile');
  assert.ok(await c.evaluate(`document.documentElement.scrollWidth<=390`),'mobile horizontal overflow');
  await viewport(844,390);
  await capture('route01-gameplay-landscape');
  await viewport();
  // Sample the actual renderer with frozen physics on either side of both modulo
  // boundaries. These are forced scroll positions, separate from the live run below.
  const width=await c.evaluate(`(()=>{const im=CoffeeGame.routes.art[0].street;return (im.naturalWidth-Math.round(im.naturalHeight*.16))*294/im.naturalHeight})()`);
  async function sample(scroll) {
    await c.evaluate(`CoffeeGame.render.scenery.scroll=${scroll};CoffeeGame.render.draw()`);
    return canvasPixels();
  }
  observations.transitions=[];
  for(const at of [width*.15/.58,width*.57/.58]) {
    const before=await sample(at-.001),after=await sample(at+.001),frameBefore=await sample(at-.25),frameAfter=await sample(at+.25),whole=await sample(at+width/.58);
    observations.transitions.push({scroll:at,boundary:difference(before,after),frame:difference(frameBefore,frameAfter),periodic:difference(await sample(at),whole)});
  }
  for(const t of observations.transitions) {
    assert.ok(t.boundary.mean<.05,JSON.stringify(t));
    assert.ok(t.periodic.mean<.001,JSON.stringify(t));
    assert.ok(t.frame.mean<1,JSON.stringify(t));
  }
  // Put each blended junction in the middle of the outer window for visual review.
  for(const [side,target] of [[0,140],[1,760]]) {
    const center=await c.evaluate(`(()=>{const im=CoffeeGame.routes.art[0].street;const w=(im.naturalWidth-Math.round(im.naturalHeight*.16))*294/im.naturalHeight;return ${side} ? (${target}-w*.43)/.58 : (w*1.15-${target})/.58})()`);
    for(const [label,offset] of [['before',-15],['center',0],['after',15]]) {
      await c.evaluate(`CoffeeGame.render.scenery.scroll=${center+offset};CoffeeGame.render.draw()`);
      await capture(`route01-loop-${side?'right':'left'}-${label}`);
    }
  }
  observations.motion=[];
  for(const motion of [0,1,2]) {
    const result=await c.evaluate(`(()=>{const g=CoffeeGame;g.main.start(0);g.state.motion=${motion};let expected=0;for(let i=0;i<120;i++){g.physics.step(1/120);g.render.updateScenery(1/120);expected+=g.state.speed/120*[4.2,1.5,0][${motion}]}g.render.draw();return {scroll:g.render.scenery.scroll,expected}})()`);
    assert.equal(result.scroll,result.expected);
    observations.motion.push(result);
  }
  // Simulate an unavailable image without changing any file on disk.
  assert.ok(await c.evaluate(`(()=>{const g=CoffeeGame;g.main.start(0);g.render.scenery.scroll=200;g.routes.art[0].street=new Image();g.render.draw();return g.routes.imageFor('street')===g.assets.images.street})()`));
  const fallback=await canvasPixels();
  await load(true);
  await c.evaluate(`testGame.start(0);testGame.sim.scroll=200;testGame.draw()`);
  assert.ok((await canvasPixels()).equals(fallback),'fallback pixels match original');
  await load();
  await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await load();
  assert.equal(await c.evaluate(`CoffeeGame.state.motion`),2,'reduced motion defaults to Still');
  await c.send('Emulation.setEmulatedMedia',{features:[]});
  noErrors('offline integration');
  await c.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:hook.identifier});
  await c.send('Page.navigate',{url:pathToFileURL(path.join(root,'index.html')).href});
  await sleep(500);
  await c.evaluate(`CoffeeGame.state.motion=0;CoffeeGame.ui.updateMotion();document.getElementById('menuStart').click();document.querySelector('#menuActions button').click()`);
  const start=await c.evaluate(`({t:CoffeeGame.state.t,scroll:CoffeeGame.render.scenery.scroll})`);
  await sleep(3500);
  const end=await c.evaluate(`({t:CoffeeGame.state.t,scroll:CoffeeGame.render.scenery.scroll,amount:CoffeeGame.state.amount})`);
  assert.ok(end.t>start.t+2&&end.scroll>start.scroll);
  await capture('route01-live-gameplay');
  // Exercise a wrap with the native animation/physics loop, capturing actual frames.
  // Move only the starting scenery offset so this review doesn't have to wait for it.
  const wrapAt=width*.15/.58;
  await c.evaluate(`CoffeeGame.render.scenery.scroll=${wrapAt-20}`);
  const wrapStart=await c.evaluate(`CoffeeGame.render.scenery.scroll`);
  const frames=[];
  for(let i=0;i<12;i++) {
    const name=`route01-live-transition-${String(i).padStart(2,'0')}`;
    await capture(name);frames.push(name+'.png');await sleep(100);
  }
  const wrapEnd=await c.evaluate(`CoffeeGame.render.scenery.scroll`);
  assert.ok(wrapStart<wrapAt&&wrapEnd>wrapAt,'native scrolling crosses wrap boundary');
  fs.writeFileSync(path.join(output,'scrolling-transition.html'),`<!doctype html><meta charset="utf-8"><title>Route 01 actual gameplay transition</title><style>body{background:#19130e;color:#ebdab9;font:18px Georgia;margin:20px}img{display:block;max-width:100%;max-height:85vh}button{margin:12px;padding:8px}</style><p>Actual offline Chrome gameplay frames across the scrolling wrap. The starting scenery offset was moved near the boundary; animation and physics ran normally.</p><button id="toggle">Pause / play</button><img id="frame"><script>const frames=${JSON.stringify(frames)};let i=0,playing=true;const image=document.getElementById('frame');image.src=frames[0];document.getElementById('toggle').onclick=()=>playing=!playing;setInterval(()=>{if(playing)image.src=frames[(++i)%frames.length]},250);</script>`);
  observations.liveWrap={start:wrapStart,boundary:wrapAt,end:wrapEnd,frames:frames.length};
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'p'});
  assert.equal(await c.evaluate(`CoffeeGame.state.state`),'pause');
  const paused=await c.evaluate(`CoffeeGame.render.scenery.scroll`);await sleep(200);
  assert.equal(await c.evaluate(`CoffeeGame.render.scenery.scroll`),paused);
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'p'});
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'r'});
  assert.ok(await c.evaluate(`CoffeeGame.state.t<.2`));
  noErrors('native animation loop');
  observations.live={start,end};
  fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify(observations,null,2));
  console.log('PASS: offline assets, responsive gameplay, both loop boundaries, repeat period, fallback, motion scales, reduced-motion default, native animation, pause and restart.');
  console.log('Artifacts:',output);
} finally {
  if(c){await c.send('Browser.close').catch(()=>{});c.socket.close();}
  browser.kill();
}
