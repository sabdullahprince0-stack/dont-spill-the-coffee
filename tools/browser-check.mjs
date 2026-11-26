// Real Chromium checks using Node's built-in WebSocket and the DevTools protocol.
// Usage: node tools/browser-check.mjs [path-to-chrome-or-edge]
// Uses a temporary browser profile and copies of the original assets, never your saves.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { root, originalHTML, originalBridge, currentBridge } from './refactor-check.mjs';

const executable = process.argv[2] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
assert.ok(fs.existsSync(executable), 'Supply an installed Chrome or Edge executable.');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'coffee-browser-'));
const baseline = path.join(output, 'original');
fs.mkdirSync(baseline);
fs.writeFileSync(path.join(baseline, 'index.html'), originalHTML);
fs.cpSync(path.join(root, 'assets'), path.join(baseline, 'assets'), { recursive: true });
const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + path.join(output, 'profile'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function pixels(base64) {
  const png = Buffer.from(base64, 'base64'), parts = [];
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), channels = png[25] === 6 ? 4 : 3;
  for (let p = 8; p < png.length;) {
    const length = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') parts.push(png.subarray(p + 8, p + 8 + length));
    p += length + 12;
  }
  const raw = inflateSync(Buffer.concat(parts)), stride = width * channels, result = Buffer.alloc(stride * height);
  for (let y = 0, p = 0; y < height; y++) {
    const filter = raw[p++];
    for (let col = 0; col < stride; col++) {
      const at = y * stride + col, a = col >= channels ? result[at - channels] : 0, b = y ? result[at - stride] : 0, c = y && col >= channels ? result[at - stride - channels] : 0;
      const predictor = a + b - c, pa = Math.abs(predictor - a), pb = Math.abs(predictor - b), pc = Math.abs(predictor - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      result[at] = raw[p++] + [0, a, b, Math.floor((a + b) / 2), paeth][filter];
    }
  }
  return result;
}
function compareScreenshot(actual, expected, label) {
  const a = pixels(actual), b = pixels(expected);
  let differences = 0, total = 0, maximum = 0;
  for (let i = 0; i < a.length; i++) {
    const delta = Math.abs(a[i] - b[i]);
    if (delta) differences++;
    total += delta;
    maximum = Math.max(maximum, delta);
  }
  const mean = total / a.length;
  assert.ok(a.length === b.length && differences === 0,
    `${label}: ${differences} differing channels; max ${maximum}, mean ${mean}`);
}
let sequence = 0;
class CDP {
  pending = new Map(); events = [];
  constructor(socket) {
    this.socket = socket;
    socket.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) p.reject(Error(JSON.stringify(m.error))); else p.resolve(m.result);
      } else this.events.push(m);
    });
  }
  async send(method, params = {}) {
    const id = ++sequence;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}
let control;
let deterministic = true;
try {
  const portFile = path.join(output, 'profile', 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  assert.ok(fs.existsSync(portFile), 'Chrome did not start (possibly sandbox restrictions).');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  control = new CDP(socket);
  await control.send('Page.enable');
  await control.send('Runtime.enable');
  await control.send('Network.enable');
  const version = await control.send('Browser.getVersion');
  console.log('Browser:', version.product, 'Artifacts:', output);
  // Deterministic animation clock and RNG for repeatable screenshots and physics.
  const hook = await control.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.clear();
    let seed=123; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
    performance.now=()=>0;
    window.requestAnimationFrame=fn=>window.testFrame=fn;
  ` });
  async function load(original) {
    // Match the initial decode scale as well as each later viewport. Chromium's
    // JPEG decode cache otherwise depends on the viewport at navigation time.
    await control.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    control.events.length = 0;
    const url = pathToFileURL(original ? path.join(baseline, 'index.html') : path.join(root, 'index.html')).href;
    await control.send('Page.navigate', { url });
    for (let i = 0; i < 200; i++) {
      if (await control.evaluate(`location.href===${JSON.stringify(url)} && document.readyState==='complete' && ${deterministic ? "typeof testFrame==='function'" : 'true'}`)) break;
      await sleep(50);
    }
    await control.evaluate(original ? originalBridge : currentBridge);
    const assets = await control.evaluate(`(()=>{const g=testGame;const list=[document.querySelector('#cafe>img'),...(typeof CoffeeGame==='undefined'?Object.values(images).concat(routeArt.flatMap(a=>[a.street,a.interior,a.cup])):Object.values(CoffeeGame.assets.images).concat(CoffeeGame.routes.art.flatMap(a=>[a.street,a.interior,a.cup])))];return list.map(i=>({src:i.src,ok:i.complete&&i.naturalWidth>0}))})()`);
    assert.ok(assets.every(a => a.ok), JSON.stringify(assets.filter(a => !a.ok)));
    assert.equal(control.events.filter(e => e.method === 'Runtime.exceptionThrown' || e.method === 'Network.loadingFailed').length, 0, 'load errors');
  }
  async function click(id, heldKey) {
    const rect = await control.evaluate(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await control.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...rect });
    if (heldKey) assert.equal(await control.evaluate(`testGame.sim.keys[${JSON.stringify(heldKey)}]`), true, heldKey + ' pointer hold');
    await control.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...rect });
  }
  async function key(key, type = 'keyDown') { await control.send('Input.dispatchKeyEvent', { type, key }); }
  async function screenshot(name) {
    // Chromium briefly uses a different image resampling quality while resizing.
    await sleep(350);
    const { data } = await control.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data, 'base64'));
    return data;
  }
  const captures = new Map(), observations = [];
  for (const original of [true, false]) {
    await load(original);
    const label = original ? 'original' : 'separated';
    const observation = {};
    for (const [width, height] of [[1280, 800], [390, 844], [844, 390]]) {
      await control.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const size = `${width}x${height}`;
      observation[size] = await control.evaluate(`(()=>{const r=document.getElementById('cafe').getBoundingClientRect();return [r.x,r.y,r.width,r.height,document.documentElement.scrollWidth]})()`);
      const png = await screenshot(`${label}-menu-${size}`);
      if (original) captures.set('menu-' + size, png); else compareScreenshot(png, captures.get('menu-' + size), 'menu screenshot ' + size);
    }
    await control.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await click('menuSettings');
    assert.equal(await control.evaluate(`document.activeElement.textContent`), 'Motion: gentle');
    await key('Tab');
    await key('Tab');
    await key('Tab');
    assert.equal(await control.evaluate(`document.activeElement.textContent`), 'Motion: gentle', 'dialog focus trap');
    await key('Escape');
    assert.equal(await control.evaluate(`document.getElementById('cafe-dialog').hidden`), true);
    await click('menuCredits');
    await key('Escape');
    await click('menuStart');
    // Begin with an actual pointer click on the generated button.
    await control.evaluate(`document.querySelector('#menuActions button').id='testBegin'`);
    await click('testBegin');
    await key('a');
    assert.equal(await control.evaluate(`testGame.sim.keys.left`), true);
    await key('a', 'keyUp');
    await key('ArrowRight');
    await control.evaluate(`testFrame(16.6666666667)`);
    await key('ArrowRight', 'keyUp');
    await key('p');
    assert.equal(await control.evaluate(`testGame.sim.state`), 'pause');
    await key('p');
    await key('r');
    assert.equal(await control.evaluate(`testGame.sim.t`), 0);
    await key('i');
    assert.equal(await control.evaluate(`document.getElementById('physicsMonitor').hidden`), false);
    await click('left', 'left');
    assert.equal(await control.evaluate(`!!testGame.sim.keys.left`), false, 'pointer release');
    await click('right', 'right');
    await control.evaluate(`window.dispatchEvent(new Event('blur'))`);
    assert.equal(await control.evaluate(`testGame.sim.state`), 'pause');
    await key('p');
    for (const motion of [0, 1, 2]) {
      await click('motion');
      assert.equal(await control.evaluate(`testGame.sim.motion`), (motion + 1) % 3);
    }
    await click('mute');
    assert.equal(await control.evaluate(`testGame.sim.muted`), true);
    await click('mute');
    assert.equal(await control.evaluate(`testGame.audio.context.state`), 'running');
    // All routes rendered with loaded native images, including a warning/bump/spill interval.
    observation.routes = [];
    for (let route = 0; route < 6; route++) {
      const result = await control.evaluate(`(()=>{const g=testGame;g.start(${route});for(let i=0;i<540;i++){g.sim.keys={left:i%120<18};g.step(1/120)}g.draw();g.updatePhysics();return {t:g.sim.t,amount:g.sim.amount,ax:g.sim.ax,ay:g.sim.ay,dist:g.sim.dist,theta:g.sim.theta,slosh:g.sim.slosh,monitor:[...document.querySelectorAll('.physics-grid dd')].map(n=>n.textContent)}})()`);
      observation.routes.push(result);
      const png = await screenshot(`${label}-route-${route + 1}`);
      if (original) captures.set('route-' + route, png); else compareScreenshot(png, captures.get('route-' + route), 'route screenshot ' + route);
      // Retry and Next route buttons after a forced successful result.
      await control.evaluate(`testGame.sim.amount=.8;testGame.finish();document.querySelector('#actions button').click()`);
      assert.equal(await control.evaluate(`testGame.sim.t`), 0);
      if (route < 5) {
        await control.evaluate(`testGame.sim.amount=.8;testGame.finish();document.querySelectorAll('#actions button')[1].click()`);
        assert.equal(await control.evaluate(`testGame.sim.level`), route + 1, 'Next route');
      }
    }
    for (const [width, height] of [[390, 844], [844, 390]]) {
      await control.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await control.evaluate(`testGame.start(2);testGame.draw();testGame.updatePhysics()`);
      const png = await screenshot(`${label}-game-${width}x${height}`);
      if (original) captures.set(`game-${width}`, png); else compareScreenshot(png, captures.get(`game-${width}`), 'responsive game screenshot');
    }
    await control.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    observation.endings = [];
    for (const score of [.4, .6, .8, .95]) {
      observation.endings.push(await control.evaluate(`(()=>{const g=testGame;g.sim.save={unlocked:5,best:Array(6).fill(${score})};g.showEnding();return [document.getElementById('pt').textContent,document.getElementById('pd').textContent,document.getElementById('endingScores').textContent]})()`));
    }
    assert.equal(control.events.filter(e => e.method === 'Runtime.exceptionThrown' || e.method === 'Network.loadingFailed' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')).length, 0, label + ' console/load errors');
    observations.push(observation);
    console.log('PASS:', label, 'file:// assets, menus/focus, keyboard/pointer, preferences, routes, monitor, four endings and responsive screenshots.');
  }
  assert.deepEqual(observations[1], observations[0], 'browser results match original');
  // A fresh, uninstrumented run exercises actual requestAnimationFrame and Web Audio fading.
  await control.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook.identifier });
  deterministic = false;
  for (const original of [true, false]) {
    await load(original);
    await control.evaluate(`testGame.start(0)`);
    await sleep(500);
    const playing = await control.evaluate(`({t:testGame.sim.t,audio:testGame.audio.status})`);
    assert.ok(playing.t > .1 && playing.audio.state === 'running' && playing.audio.bed > .5, JSON.stringify(playing));
    await control.evaluate(`testGame.pause()`);
    await sleep(500);
    const paused = await control.evaluate(`({t:testGame.sim.t,audio:testGame.audio.status})`);
    assert.ok(paused.t >= playing.t && paused.audio.bed < .05 && paused.audio.voices <= 32, JSON.stringify(paused));
    await control.evaluate(`testGame.showCafe()`);
    await sleep(250);
    assert.ok(await control.evaluate(`testGame.audio.status.bed<.01`));
    console.log('PASS:', original ? 'original' : 'separated', 'native animation loop and Web Audio play/pause/menu fades.');
  }
  fs.writeFileSync(path.join(output, 'observations.json'), JSON.stringify(observations, null, 2));
  console.log('PASS: original and separated browser state, monitor, dialogue and screenshots match.');
} finally {
  if (control) { await control.send('Browser.close').catch(() => {}); control.socket.close(); }
  browser.kill();
}
