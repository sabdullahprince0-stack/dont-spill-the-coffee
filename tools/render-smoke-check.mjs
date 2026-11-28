// Actual, uninstrumented Chrome rendering over file:// and localhost.
// Usage: node tools/render-smoke-check.mjs [--expect-broken]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const broken=process.argv.includes('--expect-broken');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'coffee-render-smoke-'));
const profile=path.join(output,'profile');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const requests=[];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((req,res)=>{
  let file;
  try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);file=path.resolve(root,'.'+(name==='/'?'/index.html':name));}catch{res.writeHead(400);res.end();return;}
  if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403);res.end();return;}
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){requests.push({url:req.url,status:404});res.writeHead(404);res.end();return;}
  requests.push({url:req.url,status:200});res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const local=`http://127.0.0.1:${server.address().port}/index.html`;
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
class CDP{
  id=0;pending=new Map();events=[];
  constructor(socket){this.socket=socket;socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(!m.id)return this.events.push(m);const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);});socket.addEventListener('close',()=>{for(const p of this.pending.values())p.reject(Error('Browser closed'));this.pending.clear();});}
  send(method,params={}){const id=++this.id,p=new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}));this.socket.send(JSON.stringify({id,method,params}));return p;}
  async evaluate(expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
}
let c;
const report={broken,observations:[]};
try{
  const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++)await sleep(100);
  assert.ok(fs.existsSync(portFile),'Chrome could not start.');
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve);socket.addEventListener('error',reject);});c=new CDP(socket);
  for(const method of ['Page.enable','Runtime.enable','Network.enable'])await c.send(method);
  await c.send('Network.setCacheDisabled',{cacheDisabled:true});
  await c.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  report.browser=(await c.send('Browser.getVersion')).product;
  async function screenshot(name){const {data}=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(data,'base64'));}
  async function click(selector){const rect=await c.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...rect});}
  for(const [mode,url] of [['file',pathToFileURL(path.join(root,'index.html')).href],['localhost',local]]){
    c.events.length=0;
    await c.send('Network.emulateNetworkConditions',{offline:mode==='file',latency:0,downloadThroughput:0,uploadThroughput:0});
    await c.send('Page.navigate',{url});
    let complete=false;
    for(let i=0;i<100;i++){complete=await c.evaluate(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'`);if(complete)break;await sleep(50);}
    assert.ok(complete,'page complete');await sleep(300);
    const documentState=await c.evaluate(`({title:document.title.slice(0,300),titleLength:document.title.length,bodyChildren:document.body.children.length,scripts:document.scripts.length,css:document.styleSheets.length,background:getComputedStyle(document.body).backgroundColor,initialized:typeof CoffeeGame!=='undefined'&&!!CoffeeGame.main})`);
    const item={mode,url,document:documentState};
    await screenshot(mode+(broken?'-broken':'-menu'));
    if(broken){assert.equal(documentState.initialized,false);assert.equal(documentState.bodyChildren,0,'HTML swallowed into title');}
    else{
      assert.ok(documentState.initialized,'main initializes');assert.ok(documentState.css>0,'stylesheet loaded');
      assert.ok(await c.evaluate(`(()=>{const menu=document.getElementById('cafe'),img=menu.querySelector('img'),r=menu.getBoundingClientRect();return !menu.hidden&&img.complete&&img.naturalWidth>0&&r.width>0&&r.height>0})()`),'visible menu and native artwork');
      await click('#menuStart');await click('#menuActions button');
      assert.equal(await c.evaluate(`CoffeeGame.state.state`),'play','real menu buttons start gameplay');
      await sleep(1100);
      item.gameplay=await c.evaluate(`(()=>{const g=CoffeeGame,r=document.getElementById('c').getBoundingClientRect();return{state:g.state.state,t:g.state.t,scroll:g.render.scenery.scroll,rate:g.render.scenery.scrollRate,visible:!document.getElementById('game').hidden&&r.width>0&&r.height>0,customPanorama:g.routes.art[0].street.src.endsWith('/assets/route01-custom.png'),images:Object.values(g.assets.images).concat(g.routes.art.flatMap(a=>[a.street,a.interior,a.cup])).map(im=>({src:im.src,loaded:im.complete&&im.naturalWidth>0}))}})()`);
      assert.ok(item.gameplay.visible&&item.gameplay.t>.5&&item.gameplay.scroll>0,'active native-loop gameplay');
      assert.ok(item.gameplay.customPanorama&&item.gameplay.images.every(i=>i.loaded),'custom panorama and all route images');
      await screenshot(mode+'-gameplay');
      // Confirm pause after capturing gameplay from the unmodified native loop.
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'p'});
      assert.equal(await c.evaluate(`CoffeeGame.state.state`),'pause');
    }
    item.consoleErrors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
    item.failedRequests=c.events.filter(e=>e.method==='Network.loadingFailed'||e.method==='Network.responseReceived'&&e.params.response.status>=400);
    item.resources=c.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url);
    assert.deepEqual(item.consoleErrors,[],'console errors');assert.deepEqual(item.failedRequests,[],'failed resources');
    report.observations.push(item);
    console.log(mode,JSON.stringify({document:documentState,gameplay:item.gameplay&&{t:item.gameplay.t,scroll:item.gameplay.scroll},consoleErrors:item.consoleErrors.length,failedRequests:item.failedRequests.length,resources:item.resources.length}));
  }
  report.httpRequests=requests;
  fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify(report,null,2));
  console.log(broken?'CONFIRMED: malformed HTML consumes the entire page before scripts or CSS load.':'PASS: visible menu and native gameplay over offline file:// and localhost; all resources load, no console errors.');
  console.log('Evidence:',output);
}finally{if(c){await c.send('Browser.close').catch(()=>{});c.socket.close();}browser.kill();await new Promise(resolve=>server.close(resolve));}
