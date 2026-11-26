// Development-only regression checks. No packages or server are needed to play.
// Compare against the inspected V0.7 commit, never the changing working copy.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const baselineRef = '0762552';
export const originalHTML = execFileSync('git', ['show', `${baselineRef}:index.html`], { cwd: root, encoding: 'utf8' });
export const currentHTML = fs.readFileSync(root + 'index.html', 'utf8');
export const stateNames = 'save level state t amount theta omega slosh sv ax ay speed dist event next keys drops shake muted lastSpill scroll visualSpeed chain hold lastDir motion monitorOn monitorClock cafeTrigger'.split(' ');
const functions = 'start grade campaignScore percent showEnding finish step newEvent draw pause togglePhysics updatePhysics showCafe cafeSettings'.split(' ');
export const originalBridge = `globalThis.testGame = { sim: {${stateNames.map(n => `get ${n}(){return ${n}},set ${n}(v){${n}=v}`).join(',')}}, ${functions.join(',')}, audio:soundscape };`;
export const currentBridge = `globalThis.testGame = {sim:CoffeeGame.state,...CoffeeGame.main,...CoffeeGame.endings,...CoffeeGame.physics,...CoffeeGame.render,...CoffeeGame.ui,audio:CoffeeGame.audio};`;

export function makeGame(original, options = {}) {
  const html = original ? originalHTML : currentHTML;
  const nodes = new Map(), listeners = {}, storage = new Map(Object.entries(options.storage || {}));
  let randomSeed = options.seed || 123, randomCalls = 0, raf, audioClock = 0;
  const canvasCalls = [], audioCalls = [];
  const canvas = new Proxy({}, {
    get(o, k) {
      if (k in o) return o[k];
      return (...args) => {
        canvasCalls.push([k, ...args.map(v => v?.src || v)]);
        if (k === 'createLinearGradient') return { addColorStop: (...a) => canvasCalls.push(['colorStop', ...a]) };
      };
    },
    set(o, k, v) { o[k] = v; canvasCalls.push(['set', k, v?.addColorStop ? '[gradient]' : v]); return true; }
  });
  const document = { hidden: false, activeElement: null, getElementById: id => nodes.get(id), createElement: tag => node(tag) };
  function node(tag, id = '', hidden = false) {
    return {
      tag, id, hidden, disabled: false, textContent: '', className: '', children: [], attrs: {}, handlers: {},
      get firstElementChild() { return this.children[0]; },
      append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; },
      setAttribute(k, v) { this.attrs[k] = v; }, focus() { document.activeElement = this; }, blur() { document.activeElement = null; },
      addEventListener(k, fn) { this.handlers[k] = fn; }, querySelectorAll() { return this.children; },
      setPointerCapture() {}, getContext() { return canvas; },
      click() { if (!this.disabled) this.onclick?.(); }
    };
  }
  for (const m of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) nodes.set(m[3], node(m[1], m[3], /\bhidden\b/.test(m[2])));
  const parameter = () => ({ value: 0, setTargetAtTime(v, ...a) { this.value = v; audioCalls.push(['target', v, ...a]); }, setValueAtTime(v, ...a) { this.value = v; audioCalls.push(['value', v, ...a]); }, exponentialRampToValueAtTime(v, ...a) { this.value = v; audioCalls.push(['ramp', v, ...a]); } });
  const audioNode = type => {
    const n = { type, gain: parameter(), frequency: parameter(), Q: parameter(), pan: parameter(), threshold: parameter(), ratio: parameter(), connect() {}, disconnect() {}, start: (...a) => audioCalls.push(['start', type, ...a]), stop: (...a) => audioCalls.push(['stop', type, ...a]) };
    return n;
  };
  class AudioContext {
    state = 'running'; sampleRate = 32; destination = {};
    get currentTime() { return audioClock; }
    createGain() { return audioNode('gain'); } createDynamicsCompressor() { return audioNode('compressor'); }
    createBiquadFilter() { return audioNode('filter'); } createOscillator() { return audioNode('oscillator'); }
    createBufferSource() { return audioNode('buffer'); } createStereoPanner() { return audioNode('panner'); }
    createBuffer(ch, frames, rate) { return { duration: frames / rate, getChannelData: () => new Float32Array(frames) }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  const math = Object.create(Math);
  math.random = () => { randomCalls++; randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; };
  const context = vm.createContext({
    document, console, Math: math, performance: { now: () => 0 },
    Image: class { complete = true; naturalWidth = 1200; width = 1200; height = 700; },
    localStorage: { getItem(k) { if (options.storageThrows) throw Error('blocked'); return storage.get(k) ?? null; }, setItem(k, v) { if (options.storageThrows) throw Error('blocked'); storage.set(k, v); } },
    matchMedia: () => ({ matches: !!options.reduced }), AudioContext,
    requestAnimationFrame: fn => { raf = fn; }, addEventListener: (k, fn) => { listeners[k] = fn; }
  });
  context.window = context;
  if (original) vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1] + '\n' + originalBridge, context);
  else {
    for (const m of html.matchAll(/<script src="([^"]+)"/g)) vm.runInContext(fs.readFileSync(root + m[1], 'utf8'), context, { filename: m[1] });
    vm.runInContext(currentBridge, context);
  }
  const game = context.testGame;
  return Object.assign(game, {
    nodes, context, storage, canvasCalls, audioCalls, randomCalls: () => randomCalls,
    frame(now) { audioClock = now / 1000; raf(now); },
    key(key, type = 'keydown', repeat = false) { listeners[type]({ key, repeat, preventDefault() {} }); },
    blur() { listeners.blur(); },
    snapshot() {
      return JSON.stringify({ state: Object.fromEntries(stateNames.filter(n => n !== 'cafeTrigger').map(n => [n, game.sim[n]])), storage: [...storage], randomCalls });
    },
    dom() { return JSON.stringify([...nodes].map(([id, n]) => [id, n.hidden, n.disabled, n.textContent, n.className, n.attrs, n.children.map(c => [c.textContent, c.disabled, c.className, c.children.map(v => v.textContent)])])); }
  });
}

function compare(a, b, label) {
  assert.equal(b.snapshot(), a.snapshot(), label + ' state/storage/random stream');
  assert.equal(b.dom(), a.dom(), label + ' DOM');
}
function pair(options) { return [makeGame(true, options), makeGame(false, options)]; }
function both(games, fn, label) { games.forEach(fn); compare(...games, label); }

export function runChecks() {
  for (const m of currentHTML.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(fs.existsSync(root + m[1]), m[1]);
  assert.deepEqual([...currentHTML.matchAll(/id="([^"]+)"/g)].map(m => m[1]), [...originalHTML.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const originalCSS = originalHTML.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\s/g, '');
  assert.equal(fs.readFileSync(root + 'css/styles.css', 'utf8').replace(/\s/g, '').replace('.controls.small{text-align:center;}', ''), originalCSS);
  for (const file of execFileSync('git', ['ls-tree', '-r', '--name-only', baselineRef, 'assets'], { cwd: root, encoding: 'utf8' }).trim().split('\n')) {
    const old = execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
    const hash = data => createHash('sha256').update(data).digest('hex');
    assert.equal(hash(fs.readFileSync(root + file)), hash(old), file + ' checksum');
  }
  console.log('PASS: DOM IDs, CSS declarations, relative entry paths, 23 asset/data SHA-256 checksums.');

  const scenarios = [ {}, { reduced: true }, { storageThrows: true },
    { storage: { 'coffee-delivery-v1': '{"unlocked":3,"best":[0.9]}' } },
    { storage: { 'coffee-delivery-v03': '{"unlocked":4,"best":[0.9,0.8]}', 'coffee-motion-v03': 'minimal', 'coffee-sound-v04': 'off' } },
    { storage: { 'coffee-delivery-v03': '{broken', 'coffee-motion-v03': 'invalid' }, reduced: true },
    { storage: { 'coffee-delivery-v1': '{broken', 'coffee-delivery-v03': '{"unlocked":4,"best":[]}' } },
    { storage: { 'coffee-delivery-v03': '{"unlocked":5,"best":[0.95,0.95,0.95,0.95,0.95,0.95]}' } }
  ];
  for (const options of scenarios) {
    const games = pair(options);
    compare(...games, 'initial');
    both(games, g => g.nodes.get('menuSettings').click(), 'settings');
    for (let i = 0; i < 4; i++) both(games, g => g.nodes.get('menuActions').children[0].click(), 'menu motion');
    both(games, g => g.nodes.get('menuActions').children[1].click(), 'menu sound');
    both(games, g => g.key('Escape'), 'menu escape');
    both(games, g => g.nodes.get('menuCredits').click(), 'credits');
    both(games, g => g.nodes.get('menuActions').children[0].click(), 'credits back');
    both(games, g => g.nodes.get('menuContinue').click(), 'continue');
    both(games, g => { g.showCafe(); g.nodes.get('menuStart').click(); g.nodes.get('menuActions').children[0].click(); }, 'start without erase');
    both(games, g => g.key('A'), 'left key');
    both(games, g => g.key('A', 'keyup'), 'left release');
    both(games, g => g.key('ArrowRight'), 'right key');
    for (const key of ['a', 'd', 'ArrowLeft', 'ArrowRight']) {
      both(games, g => g.key(key), key + ' down');
      both(games, g => g.key(key, 'keyup'), key + ' up');
    }
    both(games, g => g.blur(), 'blur pause and clear');
    both(games, g => g.key('p'), 'resume');
    for (const id of ['left', 'right']) for (const ending of ['onpointerup', 'onpointercancel', 'onlostpointercapture']) {
      both(games, g => g.nodes.get(id).onpointerdown({ preventDefault() {}, pointerId: 1 }), id + ' pointer down');
      both(games, g => g.nodes.get(id)[ending](), id + ' ' + ending);
    }
    both(games, g => g.key('r'), 'restart');
    both(games, g => g.key('i'), 'monitor');
    for (const id of ['motion', 'mute', 'physicsToggle']) both(games, g => g.nodes.get(id).click(), id + ' toggle');
    both(games, g => g.nodes.get('menuBack').click(), 'return confirmation');
    both(games, g => g.nodes.get('actions').children[1].click(), 'return resume');
    for (const now of [1, 17, 33, 500, 501, 601, 602, 651, 1000]) {
      both(games, g => g.frame(now), 'frame cap / accumulator / monitor');
      assert.deepEqual(games[1].canvasCalls, games[0].canvasCalls, 'canvas commands');
      assert.deepEqual(games[1].audioCalls, games[0].audioCalls, 'audio parameters');
    }
  }
  console.log('PASS: saves/migration/storage errors, reduced motion, menu/settings/credits/Continue/Start, keyboard/pointer/pause/blur/retry, frame cap, monitor and canvas/audio traces.');

  for (const score of [0, .399999999, .4, .599999999, .6, .799999999, .8, .949999999, .95, 1]) {
    const games = pair();
    both(games, g => { g.start(5); g.sim.amount = score; g.finish(); }, 'finish boundary ' + score);
    assert.equal(games[1].grade(score), games[0].grade(score));
    both(games, g => { g.sim.save = { unlocked: 5, best: Array(6).fill(score) }; g.showEnding(); }, 'ending boundary ' + score);
    assert.equal(games[1].campaignScore(), games[0].campaignScore());
    assert.equal(games[1].percent(score), games[0].percent(score));
    both(games, g => { g.start(2); g.sim.save.best[2] = .99; g.sim.amount = .2; g.finish(); }, 'failed attempt preserves best');
    assert.equal(games[1].sim.save.best[2], .99);
  }
  for (const best of [[], [.9, .9, .9, .9, .9], [.9, .9, .9, .9, .9, NaN], [.9, .9, .9, .9, .9, 1.01], [.4, .6, .8, .95, 1, .400000000001]]) {
    const games = pair();
    assert.equal(games[1].campaignScore(best), games[0].campaignScore(best), 'campaign availability/precision');
  }
  console.log('PASS: pass/unlock boundaries, S/A/B/C/F thresholds, all four ending dialogues, failed best preservation and campaign precision.');

  let steps = 0, runs = 0;
  const results = [];
  for (const seed of [123, 731291]) for (let level = 0; level < 6; level++) for (let motion = 0; motion < 3; motion++) for (const policy of ['neutral', 'left', 'right', 'taps', 'correct', 'both']) {
    const games = pair({ seed });
    games.forEach(g => { g.start(level); g.sim.motion = motion; });
    let i = 0;
    while (games[0].sim.state === 'play') {
      const a = games[0].sim;
      const effective = Math.atan2(-a.ax * 1.22, Math.max(2, 9.81 + a.ay));
      const dir = policy === 'left' ? -1 : policy === 'right' ? 1 : policy === 'taps' ? (i % 120 < 18 ? (Math.floor(i / 120) % 2 ? -1 : 1) : 0) : policy === 'correct' ? (Math.abs(effective - a.theta) > .09 && i % 48 < 18 ? Math.sign(effective - a.theta) : 0) : 0;
      games.forEach(g => { g.sim.keys = { left: dir < 0 || policy === 'both', right: dir > 0 || policy === 'both' }; g.step(1 / 120); });
      assert.equal(games[1].snapshot(), games[0].snapshot(), `seed ${seed}, route ${level + 1}, motion ${motion}, ${policy}, step ${i}`);
      // Render and event sound synthesis at deterministic sampling points as well.
      if (i % 120 === 0) {
        games.forEach(g => { g.canvasCalls.length = 0; g.audioCalls.length = 0; g.draw(); g.audio.update(1); });
        assert.deepEqual(games[1].canvasCalls, games[0].canvasCalls, 'replay canvas');
        assert.deepEqual(games[1].audioCalls, games[0].audioCalls, 'replay audio');
      }
      i++; steps++;
      assert.ok(i < 7000, 'route finishes');
    }
    compare(...games, 'replay finish/unlock');
    if (motion === 0 && seed === 123) results.push({ route: level + 1, policy, delivered: Number((games[1].sim.amount * 100).toFixed(3)), time: Number(games[1].sim.t.toFixed(6)) });
    runs++;
  }
  console.log(`PASS: ${runs} seeded route replays, ${steps} paired fixed steps with exact equality (physics, particles, events, random calls, completion, saves/unlocks); all motion modes.`);
  console.table(results.filter(r => ['left', 'right', 'correct'].includes(r.policy)));
  return { runs, steps, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runChecks();
