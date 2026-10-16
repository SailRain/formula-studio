import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formulas, referenceFormulas, negativeFormulas } from './formulas.mjs';
import { assertMathInput, validateMathInput, DEFAULT_LIMITS } from '../core/validate-math.mjs';
import * as mathDocument from '../core/tex-document.mjs';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const good = source => {
  const result = validateMathInput(source);
  assert.equal(result.ok, true, `${source}: ${result.error?.message}`);
  assert.equal(result.source, source, 'Successful validation must preserve every input code unit');
  return result;
};
const bad = (source, code, options) => {
  const result = validateMathInput(source, options);
  assert.equal(result.ok, false, `Unexpected admission: ${JSON.stringify(source)}`);
  if (code) assert.equal(result.error.code, code, result.error.message);
  assert.equal(typeof result.error.message, 'string');
  assert.ok(/[\u3400-\u9fff]/u.test(result.error.message), 'Errors should explain rejection in Chinese');
  assert.ok(!Object.hasOwn(result, 'source'), 'Failure must not supply a sanitized formula');
  return result;
};

test('all existing formula and user-reference fixtures retain their original source', () => {
  for (const { latex } of [...formulas, ...referenceFormulas]) good(latex);
  for (const { latex } of negativeFormulas) bad(latex);
});

test('supported math sublanguage: common symbols, scripts, text, arrays and nested environments', () => {
  [
    String.raw`\frac1{k}+\frac\alpha\beta+\sqrt[n+1]{x_i^2}`,
    String.raw`α+β+Γ+Ω≤π\quad \symup{αβ}+\symbfit{XYZ}`,
    String.raw`\operatorname{rank}(A)=\dim V\quad\operatorname*{argmin}_{x\in X} f(x)`,
    String.raw`\sum_{\substack{1\le i\le n\\i\neq j}}x_i`,
    String.raw`\begin{alignedat}[t]{2}a&=b&c&=d\\x&=y&z&=0\end{alignedat}`,
    String.raw`\begin{array}{c|rr}x&1&2\\y&3&4\end{array}`,
    String.raw`\left\{\begin{cases}\begin{pmatrix}a&b\\c&d\end{pmatrix},&x>0\\0,&x\le0\end{cases}\right.`,
    String.raw`\text{rate 50\%: \textbf{A\_B}, \#1, \$2, \{x\}, a\&b}`,
    String.raw`\text{若满足条件，则}\quad x>0`,
    String.raw`\left\langle x\middle|y\right\rangle+\bigl(\frac a b\bigr)`,
    'x^2  +\n\t y_1\r\n',
    String.raw`\begin{gathered}[b]x=y\\z=0\end{gathered}`,
  ].forEach(good);
});

test('reject document-wrapper escape, cross-scope environments, math boundaries and grouping escape', () => {
  [
    String.raw`\end{document}`, String.raw`\begin{document}x\end{document}`,
    String.raw`\begin{equation}x\end{equation}`, String.raw`\end{aligned}`,
    String.raw`\begin{aligned}x\end{cases}`, String.raw`\begin{aligned}{x\end{aligned}}`,
    String.raw`\text{\end{aligned}}`, String.raw`\text{\begin{matrix}x\end{matrix}}`,
    String.raw`}\end{document}{`, String.raw`x}$\shipout\hbox{evil}$ {`,
    String.raw`\begin{aligned}\end{aligned}\end{aligned}`,
    String.raw`\begin{aligned}x\end {document}`,
    String.raw`\begin{\mathrm{matrix}}x\end{matrix}`,
    String.raw`\(x\)`, String.raw`\[x\]`, '$x$', '$$x$$',
    '{x', 'x}', String.raw`\left(x`, String.raw`x\right)`,
    String.raw`\left({x\right)}`, String.raw`{\left(x}\right)`,
    String.raw`\middle|x`, String.raw`\left\input{x}\right.`,
  ].forEach(source => bad(source));
});

test('reject capabilities by positive grammar, even in arguments, scripts, indices or dead branches', () => {
  const forbidden = [
    'input', 'include', 'includeonly', 'includegraphics', 'special', 'pdfspecial',
    'directlua', 'latelua', 'write', 'write18', 'openout', 'closeout', 'read', 'openin', 'closein',
    'immediate', 'typeout', 'message', 'errmessage', 'shellescape', 'sys_shell_now',
    'csname', 'endcsname', 'def', 'edef', 'gdef', 'xdef', 'let', 'futurelet',
    'newcommand', 'renewcommand', 'providecommand', 'newenvironment', 'renewenvironment',
    'catcode', 'mathcode', 'lccode', 'uccode', 'uccodes', 'everymath', 'everyjob', 'everypar',
    'expandafter', 'noexpand', 'string', 'detokenize', 'scantokens', 'unexpanded', 'the',
    'char', 'Uchar', 'symbol', 'chardef', 'mathchardef', 'Umathchar', 'lowercase', 'uppercase',
    'begingroup', 'endgroup', 'bgroup', 'egroup', 'global', 'long', 'outer', 'protected',
    'usepackage', 'RequirePackage', 'documentclass', 'font', 'fontspec', 'setmainfont',
    'setmathfont', 'fontdimen', 'newfontfamily', 'fontfamily', 'selectfont',
    'shipout', 'box', 'setbox', 'hbox', 'vbox', 'newbox', 'newread', 'newwrite',
    'href', 'url', 'label', 'ref', 'eqref', 'pageref', 'cite', 'bibliography',
    'pdfobj', 'pdfcatalog', 'pdfannot', 'pdfliteral', 'pdfextension', 'pdfximage',
    'IfFileExists', 'InputIfFileExists', 'file_if_exist', 'ExplSyntaxOn', 'makeatletter',
    'loop', 'repeat', 'if', 'ifx', 'ifnum', 'else', 'fi', 'whiledo',
    'verb', 'verbatim', 'cr', 'crcr', 'noalign', 'omit', 'halign', 'valign',
    'afterassignment', 'aftergroup', 'endinput', 'stop', 'end',
  ];
  const wrappers = [x => x, x => `{${x}}`, x => `x^{${x}}`, x => `\\frac{1}{${x}}`,
    x => `\\sqrt[${x}]{x}`, x => `\\text{${x}}`, x => `\\begin{matrix}${x}\\end{matrix}`];
  for (const name of forbidden) for (const wrap of wrappers) bad(wrap(`\\${name}{payload}`));
});

test('reject character-code, comment, whitespace, Unicode and control-word spelling evasions', () => {
  [
    String.raw`^^5cinput{secret}`, String.raw`\in^^70ut{secret}`, String.raw`\^^69nput{secret}`,
    String.raw`^^^^005cinput{secret}`, String.raw`^^^^^^00005cinput{secret}`,
    String.raw`\csname in put\endcsname`, String.raw`\csname input\endcsname`,
    '\\in% comment\nput{x}',
    String.raw`\Input{secret}`, String.raw`\INPUT{secret}`, String.raw`\input@{secret}`,
    String.raw`\text{\string\input}`, String.raw`\text{\verb|\input|}`,
    'x\u0000y', 'x\u000by', 'x\u001by', 'x\u007fy', 'x\u202ey', 'x\u200by',
    '\\in\u200dput{x}', '\\input\u2060{x}', 'x\uFEFFy', 'x\uD800y',
    '\\α', '\\alphaβ', '\\mathrmα', '＼input{secret}',
    String.raw`x%\end{document}`, String.raw`x#1`, String.raw`x~y`,
    String.raw`\begin{matrix}x\\% hidden row comment
\end{matrix}`,
    String.raw`\text{a\\%comment}`, String.raw`\text{a_1}`, String.raw`\text{x^2}`,
  ].forEach(source => bad(source));
  good(String.raw`\text{literal \% and \# and \$}`);
  good(String.raw`\begin{matrix}x\\\%\end{matrix}`);
  good(String.raw`\alpha β`);
  good(String.raw`\alpha{}β`);
  // Under the required standard math catcodes these are not control-word
  // concatenation: newline terminates \in; '_' is a subscript token after \int.
  good('\\in\nput{x}');
  good('\\in\rput{x}');
  good(String.raw`\int_eval{x}`);
});

test('restricted environment parameters cannot admit TeX column hooks or dimensions', () => {
  [
    String.raw`\begin{array}{>{\input{x}}c}x\end{array}`,
    String.raw`\begin{array}{@{\special{x}}c}x\end{array}`,
    String.raw`\begin{array}{p{999999in}}x\end{array}`,
    String.raw`\begin{array}{*{99999}{c}}x\end{array}`,
    String.raw`\begin{array}{c\string}x\end{array}`,
    String.raw`\begin{alignedat}{0}x\end{alignedat}`,
    String.raw`\begin{alignedat}{21}x\end{alignedat}`,
    String.raw`\begin{alignedat}{\input{x}}x\end{alignedat}`,
    String.raw`\begin{aligned}[\input{x}]x\end{aligned}`,
    String.raw`\begin{matrix}[c]x\end{matrix}`,
    String.raw`\begin{matrix}a\\[9999in]b\end{matrix}`,
    String.raw`\begin{matrix}a\\*b\end{matrix}`,
    String.raw`x&y`, String.raw`x\\y`, String.raw`\begin{gathered}x&y\end{gathered}`,
  ].forEach(source => bad(source));
});

test('limits bound parser work and recursive structures; callers may only tighten', () => {
  bad('x'.repeat(DEFAULT_LIMITS.maxLength + 1), 'LENGTH_LIMIT');
  bad('x'.repeat(DEFAULT_LIMITS.maxTokens + 1), 'TOKEN_LIMIT');
  good('{'.repeat(48) + 'x' + '}'.repeat(48));
  bad('{'.repeat(49) + 'x' + '}'.repeat(49), 'BRACE_DEPTH');
  good(String.raw`\begin{matrix}`.repeat(12) + 'x' + String.raw`\end{matrix}`.repeat(12));
  bad(String.raw`\begin{matrix}`.repeat(13) + 'x' + String.raw`\end{matrix}`.repeat(13), 'ENVIRONMENT_DEPTH');
  bad(String.raw`\sqrt[`.repeat(65) + '2' + ']{x}'.repeat(65), 'NESTING_LIMIT');
  bad(String.raw`\left(`.repeat(65) + 'x' + String.raw`\right)`.repeat(65), 'NESTING_LIMIT');
  bad(String.raw`\begin{matrix}` + String.raw`x\\`.repeat(101) + 'x' + String.raw`\end{matrix}`, 'ROW_LIMIT');
  bad(String.raw`\begin{matrix}` + 'x&'.repeat(401) + 'x' + String.raw`\end{matrix}`, 'ALIGNMENT_LIMIT');
  bad('xxxxx', 'LENGTH_LIMIT', { limits: { maxLength: 4 } });
  bad('{{x}}', 'BRACE_DEPTH', { limits: { maxBraceDepth: 1 } });
  assert.throws(() => validateMathInput('x', { limits: { maxLength: 10001 } }), RangeError);
  assert.throws(() => validateMathInput('x', { limits: { maxNesting: Infinity } }), RangeError);
  assert.throws(() => validateMathInput('x', { limits: { surprise: 1 } }), TypeError);
});

test('results preserve source and report clear error positions without coercing objects', () => {
  let called = false;
  bad({ toString() { called = true; return 'x'; } }, 'INPUT_TYPE'); assert.equal(called, false);
  bad('', 'EMPTY_INPUT'); bad(' \t\r\n', 'EMPTY_INPUT');
  const result = bad('x+\n\\input{x}', 'COMMAND_NOT_ALLOWED');
  assert.deepEqual([result.error.line, result.error.column, result.error.index], [2, 1, 3]);
  assert.equal(assertMathInput('  x  '), '  x  ');
  assert.throws(() => assertMathInput(String.raw`\input{x}`), error => error.code === 'COMMAND_NOT_ALLOWED');
});

test('every unknown ASCII control word stays rejected in every admitted structure', () => {
  // Deterministic mutation sampling: independent spellings, suffixes and argument
  // positions exercise exact-name allowlisting instead of a few blacklist words.
  let seed = 0x8173;
  for (let i = 0; i < 300; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const name = 'Unlisted' + [...Array(7)].map((_, j) => String.fromCharCode(97 + ((seed >>> (j * 4)) % 26))).join('');
    for (const source of [`\\${name}`, `x^{\\${name}}`, `\\text{\\${name}}`,
      `\\begin{aligned}x&=\\${name}\\end{aligned}`]) bad(source);
  }
});

const workerSource=await readFile(new URL('../src/shared/engine-worker.js',import.meta.url),'utf8');

async function workerHarness(engine='xetex',{basePath='/',manifest=[]}={}){
  const events=[],writes=[],requests=[],imports=[],files=new Map();let texCalls=0,pdfCalls=0;
  let resolveReady;
  const initialized=new Promise(resolve=>{resolveReady=resolve;});
  const context=vm.createContext({URL,Uint8Array,ArrayBuffer,Map,Set,Promise,performance,
    location:{href:`https://local.test${basePath}formula-worker.js?engine=${engine}`,origin:'https://local.test'},
    addEventListener(){},
    setTimeout(callback){queueMicrotask(callback);},
    postMessage(message){events.push(message);if(message.type==='ready'||message.type==='error')resolveReady(message);},
    fetch:async url=>{requests.push(String(url));return {ok:true,json:async()=>manifest,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};},
    FS:{mkdir(){},writeFile(path,bytes){writes.push({path,bytes});files.set(path,bytes);},readFile(path){return files.get(path);}},
    wasmMemory:{buffer:new ArrayBuffer(16)},memlog:'',
    prepareExecutionContext(){},cwrap(){return ()=>0;},
    _compileLaTeX(){texCalls++;files.set('/work/main.xdv',new Uint8Array([1,2,3]));return 0;},
    compilePDFRoutine(){pdfCalls++;context.postMessage({cmd:'compile',result:'ok',status:0,log:'',pdf:new ArrayBuffer(4)});},
    importScripts(path){
      imports.push(path);
      if(new URL(path).pathname===basePath+'compiler-core.js'){context.mathAdmission={assertMathInput};context.mathDocument=mathDocument;}
      else queueMicrotask(()=>context.postMessage({result:'ok'}));
    },
  });
  context.self=context;
  vm.runInContext(workerSource,context);
  assert.equal((await initialized).type,'ready');
  return {context,events,writes,requests,imports,files,get texCalls(){return texCalls;},get pdfCalls(){return pdfCalls;},
    send(data){context.onmessage({data});return events.at(-1);}};
}

test('production Worker validates raw input again and never accepts a caller-supplied wrapper',async()=>{
  const h=await workerHarness();
  for(const latex of [String.raw`\input{secret}`,String.raw`\end{document}`,'x'.repeat(10001),null]){
    const result=h.send({type:'compile',latex,sizePt:10,source:'this supplied wrapper must never be used'});
    assert.equal(result.type,'error');assert.equal(h.texCalls,0);assert.equal(h.files.has('/work/main.tex'),false);
  }
  const latex=String.raw`\mathrm{\phi}+\text{Script=Latin}`;
  const result=h.send({type:'compile',latex,sizePt:12,source:String.raw`\input{secret}`});
  assert.equal(result.type,'result');assert.equal(result.result,'ok');assert.equal(h.texCalls,1);
  assert.equal(h.files.get('/work/main.tex'),mathDocument.buildDocument(latex,{sizePt:12}));
  assert.ok(h.files.get('/work/main.tex').includes(latex));
  assert.equal(h.requests.length,1,'only the static resource manifest was fetched in this fixture');
});

test('production Worker independently enforces wrapper settings and fixed in-memory font paths',async()=>{
  const h=await workerHarness();
  for(const sizePt of [0,11,99,NaN,'10']){
    assert.equal(h.send({type:'compile',latex:'x',sizePt}).type,'error');assert.equal(h.texCalls,0);
  }
  const bytes=new Uint8Array(100000);
  const names=['Times.TTF','Timesi.TTF','Timesbd.TTF','Timesbi.TTF'];
  const fonts=Object.fromEntries(names.map(name=>[name,bytes]));
  assert.equal(h.send({type:'fonts',fonts:{...fonts,'../main.tex':bytes}}).type,'error');
  assert.equal(h.writes.length,0);
  assert.equal(h.send({type:'fonts',fonts}).type,'fonts-ready');
  assert.deepEqual(h.writes.map(w=>w.path).sort(),names.map(name=>'/work/fonts/'+name).sort());
});

test('production Worker prevents dynamic or cross-origin requests and bounds PDF intermediates',async()=>{
  const h=await workerHarness('dvipdfm');
  for(const [url,options] of [['https://evil.test/assets.json'],['/assets.json?formula=x'],['/user-source.tex'],['/assets.json',{method:'POST'}]])
    assert.throws(()=>h.context.fetch(url,options),/allowlist/);
  assert.throws(()=>new h.context.XMLHttpRequest().open('GET','/secret'),/disabled/);
  assert.equal(h.requests.length,1);
  for(const xdv of [new Uint8Array(4),new ArrayBuffer(10_000_001),null]){
    assert.equal(h.send({type:'compile',xdv}).type,'error');assert.equal(h.pdfCalls,0);
  }
  const bytes=new ArrayBuffer(4);assert.equal(h.send({type:'compile',xdv:bytes}).result,'ok');
  assert.equal(h.pdfCalls,1);assert.equal(h.writes[0].path,'/work/main.xdv');
});

test('production Worker loads a project-relative manifest and keeps its allowlist inside that project',async()=>{
  const h=await workerHarness('xetex',{basePath:'/formula-studio/',manifest:[
    {name:'article.cls',url:'./assets/article.cls'},
    {name:'fonts/texgyretermes-math.otf',url:'./assets/texgyretermes-math.otf'},
  ]});
  assert.deepEqual(h.imports,[
    'https://local.test/formula-studio/compiler-core.js',
    'https://local.test/formula-studio/swiftlatexxetex.js',
  ]);
  assert.deepEqual(h.requests,[
    'https://local.test/formula-studio/assets.json',
    'https://local.test/formula-studio/assets/article.cls',
    'https://local.test/formula-studio/assets/texgyretermes-math.otf',
  ]);
  assert.deepEqual(h.writes.map(entry=>entry.path),['/work/article.cls','/work/fonts/texgyretermes-math.otf']);
  await h.context.fetch('/formula-studio/swiftlatexxetex.wasm');
  for(const [url,options] of [
    ['/assets.json'],['/assets/article.cls'],['/swiftlatexxetex.wasm'],
    ['/formula-studio/assets.json?formula=x'],['https://evil.test/formula-studio/assets.json'],
    ['/formula-studio/assets.json',{method:'POST'}],
  ])assert.throws(()=>h.context.fetch(url,options),/allowlist/);
  assert.equal(h.send({type:'compile',latex:String.raw`\sqrt{\frac{a}{b}}`,sizePt:10}).result,'ok');
});
