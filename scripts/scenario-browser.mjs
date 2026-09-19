import fs from 'node:fs';
import assert from 'node:assert/strict';
// Run against a local production build or public URL with a Chrome CDP port.
// Evidence is kept in ignored .deploy; no authentication headers are recorded.
const [base='https://flex-tbqkdfa42a-uc.a.run.app',port='9224',tag='scenario-check',width='390']=process.argv.slice(2);
const tabs=await (await fetch(`http://localhost:${port}/json`)).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let seq=0,holdDisruption=false;const pending=new Map(),network=new Map(),errors=[],records=[],held=[];
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
ws.addEventListener('message',async e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(m.error);else p.resolve(m.result);return;}
 const p=m.params;
 if(m.method==='Fetch.requestPaused'){
   if(holdDisruption&&JSON.parse(p.request.postData).scenario==='disruption')held.push(p.requestId);
   else await call('Fetch.continueRequest',{requestId:p.requestId});
 }
 if(m.method==='Network.requestWillBeSent'&&p.request.url===base+'/api/plan')network.set(p.requestId,{request:JSON.parse(p.request.postData),url:p.request.url});
 if(m.method==='Network.responseReceived'&&network.has(p.requestId))network.get(p.requestId).status=p.response.status;
 if(m.method==='Network.loadingFinished'&&network.has(p.requestId)){const record=network.get(p.requestId);try{record.response=JSON.parse((await call('Network.getResponseBody',{requestId:p.requestId})).body);}catch(e){record.bodyError=String(e);}record.done=true;}
 if(m.method==='Runtime.exceptionThrown')errors.push(p.exceptionDetails.exception?.description??p.exceptionDetails.text);
 if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(p.type))errors.push(p.args.map(a=>a.value??a.description).join(' '));
});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitResponse(count){for(let i=0;i<100;i++){const a=[...network.values()];if(a.length>count&&a.slice(count).every(r=>r.done)){await sleep(250);return a.at(-1);}await sleep(200);}throw Error('No response');}
function concise(body){const r=body.result,c=r?.recommended;return {scenario:body.scenario,simulation:r?.simulation,date:r?.request.date,earliest:r?.request.earliestDeparture,latest:r?.request.latestArrival,noFeasible:r?.noFeasibleRoute,limiting:r?.limitingConstraint,route:c?.routeOptionId,departure:c?.departureClock,crowd:c?.worstCrowd,estimates:c?.crowdEstimates,affected:c?.affectedByDisruption,explanation:r?.explanation,provenance:r?.conditionsProvenance,alerts:body.alerts};}
async function snapshot(label,record){const ui=await evaluate(`({text:document.body.innerText,inputs:[...document.querySelectorAll('input')].map(i=>({type:i.type,value:i.value})),controller:!!navigator.serviceWorker.controller,overflow:document.documentElement.scrollWidth>innerWidth,tiles:document.querySelectorAll('.leaflet-tile-loaded').length})`);records.push({label,request:record.request,status:record.status,response:concise(record.response),ui});assert.equal(record.status,200);assert(!ui.overflow,'Horizontal overflow');console.log(JSON.stringify({label,trip:record.request.request,scenario:record.request.scenario,status:record.status,route:record.response.result?.recommended?.routeOptionId,crowd:record.response.result?.recommended?.worstCrowd,controller:ui.controller}));}
async function click(label){const count=network.size;await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);const r=await waitResponse(count);await snapshot(label,r);return r;}
await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
await call('Emulation.setDeviceMetricsOverride',{width:Number(width),height:844,deviceScaleFactor:1,mobile:Number(width)<600});
await call('Page.navigate',{url:base});const initial=await waitResponse(0);await snapshot('initial',initial);
assert(!initial.response.result.simulation);assert.equal(initial.request.scenario,'live');
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Scenarios').click()`);
for(const label of ['Normal day','Planned works','Unplanned disruption','Irrelevant disruption']){
 const r=await click(label);
 assert.equal(r.response.result.request.date,'2026-09-21','Demo must use its disclosed simulation date');
 assert.equal(r.response.result.request.earliestDeparture,'07:15','Demo must not inherit the current Live clock');
 assert(r.response.result.recommended,'Demo must have a feasible route');
 assert(r.response.result.recommended.crowdEstimates.filter(e=>e.level!=='unknown').length>=14,'Morning demo must have coverage, preserving the intentional Kovan gap');
 assert(r.response.result.recommended.crowdEstimates.every(e=>e.bucketSource!=='outside forecast window'),'Demo station arrivals outside fixture coverage');
 if(r.response.result.recommended.crowdEstimates.some(e=>e.level==='unknown'))assert(await evaluate(`document.body.innerText.includes('Partial crowd data') && document.body.innerText.includes('Crowd coverage:')`));
 assert.equal(r.response.alerts.provenance.mode,'synthetic');
 assert.equal(r.response.result.conditionsProvenance.crowdForecast.mode,'synthetic');
 assert(await evaluate(`document.body.innerText.includes('reference clock 07:15')`));
 assert(!await evaluate(`document.body.innerText.includes('No data')`));
 if(label==='Planned works'){assert(r.response.alerts.messages.some(m=>m.content.includes('26 Sep 2026')));assert(r.response.result.allCandidates.every(c=>!c.affectedByDisruption));}
 if(label==='Unplanned disruption'){assert.equal(r.response.result.recommended.routeOptionId,'via-serangoon');assert(!r.response.result.recommended.affectedByDisruption);assert.match(r.response.result.explanation,/avoids it entirely/);assert(await evaluate(`document.body.innerText.includes('signalling fault')`));}
 if(label==='Irrelevant disruption'){assert(r.response.result.allCandidates.every(c=>!c.affectedByDisruption));assert.equal(r.response.result.recommended.id,records.find(r=>r.label==='Normal day').response.departure+'-'+r.response.result.recommended.routeOptionId+'-'+r.response.result.recommended.accessMode);}
 const direct=await fetch(base+'/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r.request)});const b=await direct.json();records.push({label:label+' direct',request:r.request,status:direct.status,response:concise(b)});
 assert.equal(direct.status,r.status);assert.deepEqual(b.result.recommended,r.response.result.recommended);
 fs.writeFileSync(`.deploy/${tag}-${r.request.scenario}.png`,Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
}
let count=network.size;await evaluate(`document.querySelector('[aria-label="Scenario controls"] input[type=checkbox]').click()`);await snapshot('stale on',await waitResponse(count));
assert(await evaluate(`document.body.innerText.includes('Stale — 180 min')`));
count=network.size;await evaluate(`document.querySelector('[aria-label="Scenario controls"] input[type=checkbox]').click()`);await snapshot('stale off',await waitResponse(count));
for(const label of ['Live conditions','Unplanned disruption','Normal day','Live conditions']){
 const r=await click(label);if(label==='Live conditions'){assert.deepEqual(r.request.request,initial.request.request);assert.equal(r.request.simulateStale,false);assert(!r.response.result.simulation);assert.notEqual(r.response.alerts.provenance.mode,'synthetic');assert(!await evaluate(`document.body.innerText.includes('Demo scenario:')`));}
}
count=network.size;await evaluate(`for(const label of ['Unplanned disruption','Normal day','Live conditions'])[...document.querySelectorAll('button')].find(b=>b.textContent===label).click()`);await snapshot('rapid ends Live',await waitResponse(count));
assert(!await evaluate(`document.body.innerText.includes('Demo scenario:')`));
// Deliberately deliver an older disruption response after Live has rendered.
await call('Fetch.enable',{patterns:[{urlPattern:'*/api/plan',requestStage:'Response'}]});holdDisruption=true;count=network.size;
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Unplanned disruption').click()`);
for(let i=0;!held.length&&i<100;i++)await sleep(200);assert(held.length,'No delayed response intercepted');
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Live conditions').click()`);
for(let i=0;i<100;i++){if([...network.values()].slice(count).some(r=>r.request.scenario==='live'&&r.done))break;await sleep(200);}
assert([...network.values()].slice(count).some(r=>r.request.scenario==='live'&&r.done));
await sleep(200);assert(await evaluate(`!!document.querySelector('[aria-label="Recommended departure"]') && !document.body.innerText.includes('Demo scenario:')`));
holdDisruption=false;for(const requestId of held)await call('Fetch.continueRequest',{requestId});await snapshot('delayed old response ends Live',await waitResponse(count));await call('Fetch.disable');
assert(!await evaluate(`document.body.innerText.includes('Demo scenario:')`));
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
count=network.size;await call('Page.reload');await snapshot('desktop reload',await waitResponse(count));
fs.writeFileSync(`.deploy/${tag}.png`,Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
fs.writeFileSync(`.deploy/${tag}.json`,JSON.stringify({base,tag,records,errors},null,2));console.log(JSON.stringify({tag,errors,requests:network.size}));assert.deepEqual(errors,[]);ws.close();
