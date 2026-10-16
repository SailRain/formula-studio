import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildDocument, coreFontFiles, fontFiles, MAX_LATEX_CHARACTERS, MAX_DOCUMENT_CHARACTERS} from '../core/tex-document.mjs';

test('default document uses the original package member names and compatible script policy', () => {
  const source=buildDocument(String.raw`\phi+\varphi+\jmath`);
  for(const name of Object.values(coreFontFiles)) assert.ok(source.includes(`{${name}}`));
  assert.ok(source.includes('Script=CustomDefault'));
  assert.ok(!source.includes('Times New Roman.ttf'));
});

test('CSF defaults use the standard matrix strut and explicit TNR main/sans/mono families', () => {
  const source=buildDocument(String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}+\sqrt{\frac aa}`);
  assert.ok(source.includes(String.raw`\renewcommand{\arraystretch}{1}`));
  assert.ok(source.includes(String.raw`\DeclareMathSizes{10}{10}{7.4}{5.5}`));
  const options=String.raw`[Path={fonts/},ItalicFont={Timesi.TTF},BoldFont={Timesbd.TTF},BoldItalicFont={Timesbi.TTF}]`;
  for(const family of ['setmainfont','setsansfont','setmonofont'])assert.ok(source.includes(`\\${family}{Times.TTF}${options}`));
});

test('historical exam matrix spacing is explicit and cannot leak into the production default', () => {
  const latex=String.raw`\mat{Q}=\begin{bmatrix}-2&1&1\\3&-5&2\\0&4&-4\end{bmatrix}`;
  const standard=buildDocument(latex),historical=buildDocument(latex,{arrayStretch:1.08});
  assert.equal(historical.replace(String.raw`\renewcommand{\arraystretch}{1.08}`,String.raw`\renewcommand{\arraystretch}{1}`),standard);
  for(const value of [0,1.2,'1',NaN,Infinity,null])assert.throws(()=>buildDocument('x',{arrayStretch:value}),/array stretch/);
});

test('user text and requested math commands are preserved verbatim', () => {
  const latex=String.raw`\text{Script=Latin}\quad\phi+\varphi+\epsilon+\varepsilon+\jmath`;
  const source=buildDocument(latex);
  assert.ok(source.includes(`\\setbox\\EquationBox=\\hbox{$\\displaystyle ${latex}$}`));
  assert.ok(source.includes(String.raw`\text{Script=Latin}`));
});

test('10000 input characters fit the 32768 document budget at every supported size', () => {
  assert.equal(MAX_LATEX_CHARACTERS,10000);
  assert.equal(MAX_DOCUMENT_CHARACTERS,32768);
  for(const sizePt of [8,10,12,16,20,24]) {
    const source=buildDocument('x'.repeat(MAX_LATEX_CHARACTERS),{sizePt});
    assert.ok(source.length<=MAX_DOCUMENT_CHARACTERS,`${sizePt} pt exceeds document budget`);
  }
  assert.throws(()=>buildDocument('x'.repeat(MAX_LATEX_CHARACTERS+1)),/at most 10000/);
  assert.throws(()=>buildDocument('x',{fontPath:'f'.repeat(10000)+'/'}),/exceeds 32768/);
});

test('unvalidated dotless-only configuration is rejected before generating TeX', () => {
  assert.throws(()=>buildDocument('x',{restoreVariants:false,restoreDotlessJ:true}),/has not been validated/);
  assert.throws(()=>buildDocument('x',{restoreVariants:'false'}),/must be boolean/);
  assert.doesNotThrow(()=>buildDocument('x',{restoreVariants:true,restoreDotlessJ:false}));
});

test('historical fonts remain available only through explicit configuration', () => {
  const source=buildDocument('x',{fonts:fontFiles,fontScript:'Latin',restoreVariants:false,restoreDotlessJ:false});
  assert.ok(source.includes(String.raw`\setmainfont{Times New Roman.ttf}`));
  assert.ok(source.includes('Script=Latin'));
  assert.ok(!source.includes('{Times.TTF}'));
});

test('incomplete font configuration cannot emit undefined font filenames', () => {
  assert.throws(()=>buildDocument('x',{fonts:{regular:'Times.TTF'}}),/Invalid font filename/);
  assert.throws(()=>buildDocument('x',{fonts:null}),/Invalid font filename/);
});
