import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFormulaClipboard} from '../src/editor/clipboard.mjs';

const result = {config:{dpi:600}, png:[{dpi:300,bytes:new Uint8Array([3])},{dpi:600,bytes:new Uint8Array([6])}],svg:'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'};
function environment(supported) {
  const writes=[];
  class Item { static supports() {return supported;} constructor(data) {this.data=data;} }
  return {writes,ClipboardItem:Item,navigator:{clipboard:{write(items){writes.push(items);return Promise.resolve();},writeText(text){writes.push(text);return Promise.resolve();}}}};
}
test('PNG writes selected DPI bytes immediately from the click, without another render',async()=>{
  const env=environment(true);const pending=writeFormulaClipboard(result,'png',env);
  assert.equal(env.writes.length,1);assert.equal(pending.kind,'png');
  const blob=env.writes[0][0].data['image/png'];assert.equal(blob.type,'image/png');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),new Uint8Array([6]));await pending.completion;
});
test('SVG provides vector and original markup representations together',async()=>{
  const env=environment(true);const pending=writeFormulaClipboard(result,'svg',env);
  assert.equal(pending.kind,'svg');assert.equal(env.writes.length,1);
  for(const mime of ['image/svg+xml','text/plain']) assert.equal(await env.writes[0][0].data[mime].text(),result.svg);
});
test('unsupported SVG copies explicit source, including browsers without ClipboardItem',()=>{
  const env=environment(false);assert.equal(writeFormulaClipboard(result,'svg',env).kind,'svg-source');
  delete env.ClipboardItem;writeFormulaClipboard(result,'svg',env);
  assert.deepEqual(env.writes,[result.svg,result.svg]);
});
test('unavailable image clipboard fails without a silent download or text substitution',()=>{
  const env=environment(false);delete env.ClipboardItem;
  assert.throws(()=>writeFormulaClipboard(result,'png',env),/unavailable/);
  assert.deepEqual(env.writes,[]);
});
