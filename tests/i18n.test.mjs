import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {messages,t,render,describe,setLocale,getLocale} from '../src/shared/i18n.mjs';
import {validateMathInput} from '../core/validate-math.mjs';

test('both dictionaries are complete, placeholders match, and English is the fallback',()=>{
  for(const [key,value] of Object.entries(messages)) {
    assert.ok(value['en-US'],key);assert.ok(value['zh-CN'],key);
    assert.deepEqual(value['en-US'].match(/\{\w+\}/g)?.sort(),value['zh-CN'].match(/\{\w+\}/g)?.sort(),key);
  }
  assert.equal(t('app.title',{},'unknown'),'Formula Studio');
  setLocale('zh-CN');assert.equal(t('app.title'),'公式工作台');setLocale('unknown');assert.equal(getLocale(),'en-US');
});
test('nested progress and errors remain re-renderable without changing raw parameters',()=>{
  const progress=describe('PDF 引擎：3/37 个资源');
  assert.equal(render(progress,'en-US'),'PDF engine: 3/37 resources');assert.equal(render(progress,'zh-CN'),'PDF 引擎：3/37 个资源');
  const error=describe('转换器失败：RuntimeError: original engine detail');
  assert.equal(render(error,'en-US'),'Converter failed: RuntimeError: original engine detail');
  const invalid=validateMathInput(String.raw`\input{foo}`);
  const en=render(invalid.error.message,'en-US');assert.match(en,/Unsupported command \\input/);assert.match(en,/line 1, column 1/);assert.doesNotMatch(en,/[\u4e00-\u9fff]/);
});
test('initial HTML is English, controls are keyboard-native and no locale storage is used',async()=>{
  const html=await readFile(new URL('../src/editor/index.html',import.meta.url),'utf8');
  assert.match(html,/<html lang="en-US">/);assert.match(html,/id="language-en"/);assert.match(html,/id="language-zh"/);
  assert.doesNotMatch(html.replace('简体中文',''),/[\u4e00-\u9fff]/);
  const script=await readFile(new URL('../src/editor/editor.mjs',import.meta.url),'utf8');assert.doesNotMatch(script,/localStorage|sessionStorage|navigator.language/);
});
