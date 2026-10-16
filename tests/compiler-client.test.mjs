import {createResourceResolver} from '../src/shared/resources.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {assertMathInput} from '../core/validate-math.mjs';

const source=(await readFile(new URL('../src/shared/compiler-client.mjs',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'').replace('export function createCompilerClient','function createCompilerClient');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};

function harness(options={}){
  const workers=[],timers=new Map();let nextTimer=0;
  const context=vm.createContext({resourceURL:createResourceResolver('https://example.test'+(options.basePath||'/')+'shared/resources.mjs'),assertMathInput,performance,Error,Set,Promise,
    setTimeout(fn,ms){timers.set(++nextTimer,{fn,ms});return nextTimer;},
    clearTimeout(id){timers.delete(id);},
    // This client must never persist source/fonts/results or upload a formula.
    fetch(){throw Error('Unexpected client fetch');},
    localStorage:new Proxy({},{get(){throw Error('Unexpected persistence');}}),
    indexedDB:new Proxy({},{get(){throw Error('Unexpected persistence');}}),
    Worker:class {
      constructor(url,settings){
        if(options.constructorFailure&&workers.length===options.constructorFailure)throw Error('Worker creation failed');
        this.url=url;this.settings=settings;this.messages=[];this.deadMessages=[];this.terminated=false;
        this.kind=url.includes('xetex')?'tex':url.includes('dvipdfm')?'pdf':url.includes('font-worker')?'font':'converter';
        workers.push(this);
        queueMicrotask(()=>{
          if(options.hold==='startup')return;
          this.emit(this.kind==='font'?{type:'fonts',fonts:{font:new Uint8Array([1])},report:{package:{sha256:'package-hash'},requests:['/times32.exe']}}:{type:'ready'});
        });
      }
      emit(data){if(!this.terminated)this.onmessage?.({data});}
      terminate(){this.terminated=true;}
      postMessage(data){
        this.messages.push(data);
        if(this.terminated){this.deadMessages.push(data);return;}
        if(options.postFailure===this.kind)throw Error('structured clone failed');
        queueMicrotask(()=>{
          if(data.type==='fonts'){if(options.hold!=='fonts')this.emit({type:'fonts-ready'});return;}
          if(options.hold===this.kind)return;
          if(options.error===this.kind){this.emit({type:'error',message:'engine failure'});return;}
          if(this.kind==='converter')this.emit({type:'result',result:{pdf:new Uint8Array([1,2]),report:{}},durationMs:1,requests:['/mupdf.wasm']});
          else this.emit({type:'result',result:'ok',bytes:new ArrayBuffer(4),compileMs:1,log:options[`${this.kind}Log`]||'',requests:[`/${this.kind}.wasm`],wasmMemoryBytes:1024,snapshotBytes:512});
        });
      }
    },
  });
  vm.runInContext(source,context);
  const client=context.createCompilerClient();
  const clean=()=>{assert.equal(timers.size,0,'all pending timeouts released');assert.ok(workers.every(w=>w.terminated),'all owned Workers terminated');};
  return {client,workers,timers,clean};
}

test('a successful compile uses fresh Workers and only sends raw math to XeTeX',async()=>{
  const h=harness(),latex=String.raw`\mathrm{\phi}+\text{Script=Latin}`,phases=[];
  const result=await h.client.compile(latex,{sizePt:12,dpi:300,background:'white'},p=>phases.push(p.phase));
  assert.equal(h.workers.length,4);h.clean();
  const [tex,pdf,converter,font]=h.workers;
  assert.deepEqual({...tex.messages.at(-1)},{type:'compile',latex,sizePt:12,arrayStretch:1});
  assert.deepEqual(Object.keys(pdf.messages.at(-1)).sort(),['type','xdv']);
  assert.deepEqual(JSON.parse(JSON.stringify(converter.messages[0].options)),{dpi:[300],background:'white',cropToInk:true});
  assert.equal(font.messages.length,0);assert.equal(result.report.fontPackageSHA256,'package-hash');
  assert.equal(result.report.warnings.length,0);assert.deepEqual(phases,['loading','typesetting','pdf','exporting','complete']);
  await h.client.compile('y');assert.equal(h.workers.length,8);h.clean();
});

test('invalid source and unsupported settings never create a Worker',async()=>{
  const h=harness();
  for(const latex of [String.raw`\input{secret}`,String.raw`\end{document}`,'x'.repeat(10001),{toString(){throw Error('coerced');}}])
    await assert.rejects(h.client.compile(latex));
  for(const setting of [{dpi:72},{sizePt:11},{background:'red'},{arrayStretch:1.5}])await assert.rejects(h.client.compile('x',setting),/支持范围/);
  assert.equal(h.workers.length,0);h.clean();
});

test('cancel at startup or while an engine runs aborts promptly and rejects stale progress',async()=>{
  for(const hold of ['startup','fonts','tex','pdf','converter']){
    const h=harness({hold}),progress=[];
    const running=h.client.compile('x',{},p=>progress.push(p.phase));
    const rejected=assert.rejects(running,{name:'AbortError'});
    await flush();const stale=h.workers.find(w=>w.onmessage)?.onmessage;
    h.client.cancel();const length=progress.length;
    stale?.({data:{type:'progress',phase:'resources',completed:99,total:99}});
    await rejected;assert.equal(progress.length,length);h.clean();
  }
});

test('a superseding job survives cancellation cleanup from its predecessor',async()=>{
  const h=harness({hold:'tex'});
  const first=h.client.compile('x');const aborted=assert.rejects(first,{name:'AbortError'});await flush();
  const second=h.client.compile('y');await aborted;await flush();
  assert.ok(h.workers.slice(0,4).every(w=>w.terminated));
  assert.ok(h.workers.slice(4,7).every(w=>!w.terminated));
  const tex=h.workers[4];tex.emit({type:'result',result:'ok',bytes:new ArrayBuffer(4),log:'',requests:[]});
  await second;h.clean();
});

test('startup protocol errors, message errors, timeouts and compile failures release all Workers',async()=>{
  for(const cause of ['unexpected','decoding','worker','timeout']){
    const h=harness({hold:'startup'}),running=h.client.compile('x'),rejected=assert.rejects(running);
    if(cause==='unexpected')h.workers[0].emit({type:'result'});
    if(cause==='decoding')h.workers[0].onmessageerror();
    if(cause==='worker')h.workers[0].onerror({message:'failed to load'});
    if(cause==='timeout'){assert.ok([...h.timers.values()].every(t=>t.ms===120000));h.timers.values().next().value.fn();}
    await rejected;h.clean();
  }
  for(const options of [{error:'tex'},{error:'pdf'},{error:'converter'},{postFailure:'tex'},{constructorFailure:2}]){
    const h=harness(options);await assert.rejects(h.client.compile('x'));h.clean();
  }
  const h=harness({hold:'tex'}),running=h.client.compile('x'),rejected=assert.rejects(running,/超时/);await flush();
  assert.equal(h.timers.size,1);const timer=h.timers.values().next().value;assert.equal(timer.ms,60000);timer.fn();await rejected;h.clean();
});

test('real missing-glyph/font substitution warnings stop export',async()=>{
  for(const log of ['Missing character: There is no X in font Times!','LaTeX Font Warning: Font shape undefined; substituted.','warning: Failed to load ToUnicode CMap for font "TimesNewRomanPSMT"','warning: Unable to read OpenType/TrueType Unicode cmap table.','warning: Failed to load ToUnicode CMap for font "TeXGyreTermesMath-Regular"']){
    const h=harness({pdfLog:log});await assert.rejects(h.client.compile('x'),/字体排版未通过/);
    assert.equal(h.workers.find(w=>w.kind==='converter').messages.length,0);h.clean();
  }
});

test('the known Termes construction-glyph CMap limitation is reported with the result',async()=>{
  const log='warning: Unable to read OpenType/TrueType Unicode cmap table.\nUnable to read OpenType/TrueType Unicode cmap table.\nwarning: Failed to load ToUnicode CMap for font "TeXGyreTermesMath-Regular"\nFailed to load ToUnicode CMap for font "TeXGyreTermesMath-Regular"';
  const h=harness({pdfLog:log}),result=await h.client.compile('x');
  assert.equal(result.report.warnings.length,1);assert.match(result.report.warnings[0],/无法正确复制/);h.clean();
  const tex=harness({texLog:log});await assert.rejects(tex.client.compile('x'),/字体排版未通过/);tex.clean();
  const extra=harness({pdfLog:log+'\nwarning: Failed to load ToUnicode CMap for font "OtherFont"'});
  await assert.rejects(extra.client.compile('x'),/字体排版未通过/);extra.clean();
});

test('a Worker progress callback may cancel or throw without leaving pending waits',async()=>{
  for(const mode of ['cancel','throw']){
    const h=harness({hold:'startup'});
    const running=h.client.compile('x',{},update=>{
      if(!update.engine)return;
      if(mode==='cancel')h.client.cancel();else throw Error('progress renderer failed');
    });
    const rejected=assert.rejects(running,mode==='cancel'?{name:'AbortError'}:/progress renderer failed/);
    h.workers[0].emit({type:'progress',engine:'xetex',phase:'resources',completed:1,total:4});
    await rejected;h.clean();
  }
});

test('cancellation from a progress callback never posts to a terminated Worker or returns stale success',async()=>{
  for(const phase of ['loading','typesetting','pdf','exporting','complete']){
    const h=harness();let settled=false;
    const running=h.client.compile('x',{},update=>{if(update.phase===phase)h.client.cancel();});
    const outcome=running.then(value=>{settled=true;return {value};},error=>{settled=true;return {error};});
    await flush();
    // On failure, settle the fixture without waiting for a real timeout, then
    // report the original late-post / stale-success defect deterministically.
    const dead=h.workers.flatMap(w=>w.deadMessages).length;
    const pending=!settled;
    for(const timer of [...h.timers.values()])timer.fn();
    const result=await outcome;
    assert.equal(dead,0,`${phase}: cancellation must prevent subsequent postMessage`);
    assert.equal(pending,false,`${phase}: cancellation must settle without an engine deadline`);
    assert.equal(result.error?.name,'AbortError',`${phase}: cancelled job cannot publish success`);h.clean();
  }
});

test('a Pages project URL keeps every Worker inside the repository prefix',async()=>{
  const h=harness({basePath:'/formula-studio/'});
  await h.client.compile('x');
  assert.deepEqual(h.workers.map(worker=>worker.url),[
    'https://example.test/formula-studio/formula-worker.js?engine=xetex',
    'https://example.test/formula-studio/formula-worker.js?engine=dvipdfm',
    'https://example.test/formula-studio/converter/worker.mjs',
    'https://example.test/formula-studio/font-worker.mjs',
  ]);
  h.clean();
});

test('startup progress preserves pending waits and cannot publish premature success',async()=>{
  const h=harness({hold:'startup'}),updates=[];
  let settled=false;
  const running=h.client.compile('x',{},update=>updates.push(update));
  const observed=running.then(()=>{settled=true;},error=>{settled=true;throw error;});
  const cancelled=assert.rejects(observed,{name:'AbortError'});
  h.workers[0].emit({type:'progress',engine:'xetex',phase:'resources',completed:2,total:11});
  await flush();
  assert.equal(settled,false);assert.equal(h.timers.size,4);
  assert.match(updates.at(-1).message,/2\/11/);
  h.client.cancel();await cancelled;h.clean();
});
