import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createResourceResolver} from '../src/shared/resources.mjs';

const manifest=JSON.parse(await readFile(new URL('../runtime/assets.json',import.meta.url),'utf8'));
const fontGuard=(await readFile(new URL('../src/probe/font-worker.mjs',import.meta.url),'utf8')).split('\ntry{')[0];

for (const basePath of ['/', '/formula-studio/']) {
  test(`all public resources resolve inside ${basePath}`,()=>{
    const resolve=createResourceResolver(`https://example.test${basePath}shared/resources.mjs`);
    for (const path of ['formula-worker.js?engine=xetex','formula-worker.js?engine=dvipdfm',
      'converter/worker.mjs','font-worker.mjs','editor-vendor/mathlive-0.111.1/mathlive.min.mjs',
      'editor-vendor/mathlive-0.111.1/fonts','licenses/third-party.html']) {
      assert.equal(resolve(path),`https://example.test${basePath}${path}`);
    }
    for(const item of manifest) {
      const url=new URL(item.url,`https://example.test${basePath}`);
      assert.equal(url.origin,'https://example.test');
      assert.ok(url.pathname.startsWith(basePath+'assets/'), item.url);
      assert.equal(url.search,'');
    }
  });

  test(`font Worker permits only original same-origin font resources beneath ${basePath}`,async()=>{
    const requests=[];
    const context=vm.createContext({URL,Set,location:{href:`https://example.test${basePath}font-worker.mjs`,origin:'https://example.test'},
      fetch:async resource=>{requests.push(String(resource));return {ok:true};}});
    context.self=context;
    vm.runInContext(fontGuard,context);
    for(const file of ['fonts/times32.exe','fonts/libarchive.wasm'])await context.fetch(`https://example.test${basePath}${file}`);
    assert.deepEqual(requests,['fonts/times32.exe','fonts/libarchive.wasm'].map(file=>`https://example.test${basePath}${file}`));
    for(const [url,options] of [
      ['https://other.test'+basePath+'fonts/times32.exe'],
      [basePath+'fonts/times32.exe?formula=x'],
      [basePath+'fonts/not-approved.ttf'],
      [basePath+'fonts/times32.exe',{method:'POST'}],
      ...(basePath==='/'?[]:[['/fonts/times32.exe'],['/fonts/libarchive.wasm']]),
    ])assert.throws(()=>context.fetch(url,options),/Unexpected font resource/);
    assert.equal(requests.length,2);
  });
}
