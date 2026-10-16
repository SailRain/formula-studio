import {createResourceResolver} from '../src/shared/resources.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {validateMathInput} from '../core/validate-math.mjs';
import {SourceHistory, insertSourceTemplate, nextPlaceholder, hasPlaceholder, visualCompatibilityReason} from '../src/editor/editor-state.mjs';
import {t,render,describe,getLocale,setLocale} from '../src/shared/i18n.mjs';
import {categories, examples} from '../src/editor/templates.mjs';

const script = (await readFile(new URL('../src/editor/editor.mjs', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace('controls(); initializeVisual();', 'controls();');

function harness(write = () => ({kind:'png', completion:Promise.resolve()})) {
  const elements = new Map(), jobs = [], created = [], revoked = [], windowEvents = new Map();
  class Element {
    constructor(id = '') { this.id=id; this.value=''; this.textContent=''; this.children=[]; this.style={}; this.listeners=new Map(); this.attributes=new Map(); this.hidden=false; this.disabled=false; this.selectionStart=0;this.selectionEnd=0; const classes=new Set(); this.classList={add:value=>classes.add(value),remove:value=>classes.delete(value),toggle:(value,on)=>on?classes.add(value):classes.delete(value),contains:value=>classes.has(value)}; }
    addEventListener(type, listener) { this.listeners.set(type,listener); }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children=[...nodes];this.textContent=''; }
    setAttribute(name,value) { this.attributes.set(name,value); }
    removeAttribute(name) { this.attributes.delete(name); if(name==='src')this.src=''; }
    focus() { this.focused=true; }
    setSelectionRange(start,end) { this.selectionStart=start;this.selectionEnd=end; }
    cloneNode() { return new Element(this.id); }
    replaceWith(node) { elements.set(this.id,node); }
    remove() {}
    click() { this.listeners.get('click')?.({}); }
  }
  const get = id => { if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id); };
  for(const [id,value] of Object.entries({size:'10',dpi:'300',background:'transparent',zoom:'2'}))get(id).value=value;
  const client={cancelCount:0,cancel(){this.cancelCount++;},clear(){this.cancelCount++;},compile(raw,options,onProgress){return new Promise((resolve,reject)=>jobs.push({raw,options,onProgress,resolve,reject}));}};
  const context=vm.createContext({resourceURL:createResourceResolver('https://example.test/formula-studio/shared/resources.mjs'),validateMathInput,SourceHistory,insertSourceTemplate,nextPlaceholder,hasPlaceholder,visualCompatibilityReason,categories,examples,
    t,render,describe,getLocale,setLocale,localizeStatic:()=>{},writeFormulaClipboard:write,supportsSVGClipboard:()=>true,createCompilerClient:()=>client,console,Map,Set,Blob,Number,Error,Promise,setTimeout,clearTimeout,
    URL:class extends URL {static createObjectURL(){const value='blob:test/'+created.length;created.push(value);return value;}static revokeObjectURL(value){revoked.push(value);}},
    document:{documentElement:{},getElementById:get,querySelector:()=>get('zone'),createElement:()=>new Element(),createTextNode:text=>Object.assign(new Element(),{textContent:text}),body:new Element()},
    window:{addEventListener(type,fn){windowEvents.set(type,fn);}},location:{href:'https://example.test/'},
  });
  vm.runInContext(script,context);
  return {context,get,jobs,created,revoked,client,windowEvents};
}
const output=()=>({pdf:new Uint8Array([1]),svg:'<svg/>',png:[{dpi:300,bytes:new Uint8Array([2]),metadata:{width:100,height:50}}],report:{boundsPt:[0,0,24,12],totalMs:1200,warnings:[]}});

test('clear during a job rejects stale progress and a late successful result',async()=>{
  const h=harness();h.context.commit('x');const running=h.context.compile();
  assert.equal(h.jobs.length,1);h.context.clear();
  h.jobs[0].onProgress({phase:'loading',message:'stale message'});h.jobs[0].resolve(output());await running;
  assert.equal(h.get('status').textContent,'Formula, results, and undo history cleared.');
  assert.equal(h.get('download-pdf').disabled,true);assert.equal(h.get('latex-source').value,'');
  assert.equal(h.created.length,0);assert.equal(h.get('undo').disabled,true);
});

test('a new edit cancels the old job and its completion cannot replace current state',async()=>{
  const h=harness();h.context.commit('x');const first=h.context.compile();h.context.commit('y');
  const second=h.context.compile();assert.equal(h.jobs[1].raw,'y');
  h.jobs[0].resolve(output());await first;
  assert.equal(h.get('cancel').disabled,false);assert.equal(h.created.length,0);
  h.jobs[1].resolve(output());await second;
  assert.equal(h.get('download-png').disabled,false);assert.equal(h.created.length,3);
});

test('zoom does not invalidate exports; settings do; clear releases all Blob URLs',async()=>{
  const h=harness();h.context.commit('x');const run=h.context.compile();h.jobs[0].resolve(output());await run;
  h.get('zoom').value='4';h.get('zoom').listeners.get('change')();
  assert.equal(h.get('preview-image').style.width,'128px');assert.equal(h.get('download-svg').disabled,false);
  h.get('dpi').value='600';h.get('dpi').listeners.get('change')();
  assert.equal(h.get('download-svg').disabled,true);assert.equal(h.get('stale-badge').hidden,false);
  h.context.clear();assert.deepEqual(h.revoked,h.created);
  assert.equal(h.get('preview-image').src,'');assert.equal(h.get('result-details').hidden,true);
});

test('incomplete placeholders and disallowed source never start a compiler job',async()=>{
  const h=harness();
  for(const raw of ['□',String.raw`\frac{\placeholder{}}{x}`,String.raw`\input{file}`]){h.context.commit(raw);await h.context.compile();assert.equal(h.jobs.length,0);assert.equal(h.get('error').hidden,false);}
});

test('BFCache restoration resets stale result, error, source and download controls',async()=>{
  const h=harness();h.context.commit('x');const run=h.context.compile();h.jobs[0].resolve(output());await run;
  h.get('error').textContent='old error';h.get('error').hidden=false;
  h.windowEvents.get('pagehide')();h.windowEvents.get('pageshow')({persisted:true});
  assert.equal(h.get('download-png').disabled,true);assert.equal(h.get('error').hidden,true);
  assert.equal(h.get('status').textContent,'Formula, results, and undo history cleared.');assert.equal(h.get('undo').disabled,true);
});


test('source mode is the initial mode and copy controls follow result validity',async()=>{
  const h=harness();assert.equal(h.get('mode-source').attributes.get('aria-pressed'),'true');
  assert.equal(h.get('source-pane').hidden,false);assert.equal(h.get('visual-pane').hidden,true);
  assert.equal(h.get('copy-png').disabled,true);
  h.context.commit('x');const run=h.context.compile();h.jobs[0].resolve(output());await run;
  assert.equal(h.get('copy-png').disabled,false);assert.equal(h.get('copy-svg').disabled,false);
  h.context.commit('y');assert.equal(h.get('copy-png').disabled,true);assert.equal(h.get('copy-svg').disabled,true);
});

test('late clipboard completion cannot restore feedback after clear',async()=>{
  let resolve;const h=harness(()=>({kind:'png',completion:new Promise(r=>resolve=r)}));
  h.context.commit('x');const run=h.context.compile();h.jobs[0].resolve(output());await run;
  const copying=h.context.copy('png');assert.equal(h.get('copy-svg').disabled,true);
  h.context.clear();resolve();await copying;
  assert.equal(h.get('copy-status').hidden,true);assert.equal(h.get('copy-png').disabled,true);
});

test('clipboard rejection provides a retry/download message without a false success',async()=>{
  const h=harness(()=>({kind:'png',completion:Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}))}));
  h.context.commit('x');const run=h.context.compile();h.jobs[0].resolve(output());await run;
  await h.context.copy('png');assert.match(h.get('copy-status').textContent,/Copy failed/);
  assert.equal(h.get('copy-png').disabled,false);assert.equal(h.get('download-png').disabled,false);
});

test('language switch keeps source selection, history, settings, preview URLs and exports',async()=>{
  const h=harness();h.context.commit(String.raw`\sqrt{x}`);h.get('latex-source').value=String.raw`\sqrt{x}`;
  h.get('latex-source').setSelectionRange(2,6);const run=h.context.compile();h.jobs[0].resolve(output());await run;
  const preview=h.get('preview-image').src,cancels=h.client.cancelCount;
  h.context.setLanguage('zh-CN');assert.equal(h.get('status').textContent,'准确预览与三个导出已更新。');
  h.context.setLanguage('en-US');assert.equal(h.get('status').textContent,'Accurate preview and all three exports updated.');
  assert.equal(h.get('preview-image').src,preview);assert.equal(h.client.cancelCount,cancels);assert.equal(h.get('undo').disabled,false);
  assert.equal(h.get('latex-source').value,String.raw`\sqrt{x}`);assert.equal(h.get('latex-source').selectionStart,2);assert.equal(h.get('latex-source').selectionEnd,6);
  assert.equal(h.get('size').value,'10');assert.equal(h.get('copy-png').disabled,false);assert.equal(h.created.length,3);
});
test('switching during compilation translates current and subsequent progress without restarting',async()=>{
  const h=harness();h.context.commit('x');const run=h.context.compile();h.jobs[0].onProgress({phase:'loading',message:'PDF 引擎：3/37 个资源',engine:'pdf'});
  h.context.setLanguage('zh-CN');assert.equal(h.get('status').textContent,'PDF 引擎：3/37 个资源');
  h.context.setLanguage('en-US');assert.equal(h.get('status').textContent,'PDF engine: 3/37 resources');
  h.jobs[0].onProgress({phase:'pdf',message:'正在生成矢量 PDF…'});assert.equal(h.get('status').textContent,'Generating vector PDF…');
  h.jobs[0].resolve(output());await run;assert.equal(h.jobs.length,1);
});
