import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const engineSource=await readFile(new URL('../src/shared/engine-worker.js',import.meta.url),'utf8');

async function engineHarness(engine,{failure,bodyFailure}={}){
  const items=Array.from({length:11},(_,i)=>({name:i===0?'test.fmt':`part-${i}.sty`,url:`/assets/part-${i}`}));
  let active=0,peak=0;
  const events=[],writes=[],requested=[],listeners=new Map();
  let resolveResult;
  const result=new Promise(resolve=>{resolveResult=resolve;});
  const context=vm.createContext({URL,Uint8Array,Map,Set,Promise,performance,setTimeout,
    location:{href:`https://example.test/engine-worker.js?engine=${engine}`,origin:'https://example.test'},
    postMessage(data){events.push(data);if(data.type==='ready'||data.type==='error')resolveResult(data);},
    addEventListener(name,listener){listeners.set(name,listener);},
    FS:{mkdir(){},writeFile(name,bytes){writes.push({name,bytes:bytes.length});}},
    wasmMemory:{buffer:new ArrayBuffer(16)},
    async fetch(url){
      const pathname=new URL(url).pathname;
      if(pathname==='/assets.json')return {ok:true,json:async()=>items};
      requested.push(pathname);active++;peak=Math.max(peak,active);
      // Resource completion order differs from request order.
      await new Promise(resolve=>setTimeout(resolve,3+(Number(pathname.split('-').at(-1))%3)));
      active--;
      return {ok:pathname!==failure,status:pathname===failure?503:200,arrayBuffer:async()=>{if(pathname===bodyFailure)throw new Error('Load failed');return new Uint8Array([1,2,3]).buffer;}};
    },
    importScripts(url){if(!url.endsWith('/compiler-core.js'))queueMicrotask(()=>context.postMessage({result:'ok'}));},
  });
  context.self=context;
  vm.runInContext(engineSource,context);
  const terminal=await Promise.race([result,new Promise((_,reject)=>setTimeout(()=>reject(Error('mock engine did not settle')),1000))]);
  return {terminal,events,writes,requested,peak,items,listeners};
}

test('XeTeX preloads every resource with at most four simultaneous requests and no early ready',async()=>{
  const {terminal,events,writes,requested,peak,items}=await engineHarness('xetex');
  assert.equal(terminal.type,'ready');assert.equal(peak,4);
  assert.equal(writes.length,items.length);assert.equal(new Set(requested).size,items.length);
  assert.equal(terminal.preloadBytes,items.length*3);
  const progress=events.filter(event=>event.phase==='resources');
  assert.equal(progress.at(-1).completed,items.length);
  assert.ok(progress.every(event=>event.active.length<=4));
  assert.ok(progress.every((event,index)=>!index||event.completed>=progress[index-1].completed));
  assert.equal(events.at(-1).type,'ready');
});

test('PDF engine omits only the format file and reports a matching total',async()=>{
  const {terminal,writes,events,items}=await engineHarness('dvipdfm');
  assert.equal(terminal.type,'ready');assert.equal(writes.length,items.length-1);
  assert.ok(writes.every(item=>!item.name.endsWith('.fmt')));
  assert.equal(events.filter(event=>event.phase==='resources').at(-1).total,items.length-1);
});

test('failed resources identify their filename and status instead of reporting ready',async()=>{
  const {terminal,events,peak}=await engineHarness('xetex',{failure:'/assets/part-2'});
  assert.equal(terminal.type,'error');assert.match(terminal.message,/part-2\.sty HTTP 503/);
  assert.ok(!events.some(event=>event.type==='ready'));assert.ok(peak<=4);
});

test('upstream asynchronous failures are forwarded with the last known phase',async()=>{
  const {events,listeners}=await engineHarness('xetex');
  listeners.get('unhandledrejection')({reason:new Error('WASM initialization rejected')});
  assert.equal(events.at(-1).type,'error');assert.equal(events.at(-1).phase,'resources');
  assert.match(events.at(-1).message,/WASM initialization rejected/);
});

test('body download failures retain resource and engine context',async()=>{
  const {terminal,events}=await engineHarness('xetex',{bodyFailure:'/assets/part-2'});
  assert.equal(terminal.type,'error');assert.equal(terminal.engine,'xetex');
  assert.equal(terminal.resource,'part-2.sty');assert.equal(terminal.phase,'resources');
  assert.match(terminal.message,/part-2\.sty.*Load failed/);
  assert.ok(!events.some(event=>event.type==='ready'));
});

