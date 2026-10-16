// Static Formula Studio distribution. All runtime dependencies are vendored.
import {cp,mkdir,readFile,writeFile,rm,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist=path.join(root,'dist');
const copyOptions={recursive:true,filter:source=>!path.basename(source).startsWith('._')&&path.basename(source)!=='.DS_Store'};
// A static build is a distributable release: never omit the corresponding
// source/license verification merely because the caller did not use CI.
execFileSync(process.execPath,[path.join(root,'scripts/verify-license-materials.mjs')],{cwd:root,stdio:'inherit'});
// These were previously hidden by an unanchored dist/ ignore rule. Validate the
// exact vendored distribution before copying and reject an incomplete checkout.
const converterFiles=new Map([
  ['runtime/converter/vendor/package/dist/mupdf.js','5d237eadcb9640584e0050f6f958e547887b7a54d80a04043e12be9420931076'],
  ['runtime/converter/vendor/package/dist/mupdf-wasm.js','25382abbfbf5c52191e5ac59e1412a0da88647fecfab0c1d797bb5948443eea4'],
  ['runtime/converter/vendor/package/dist/mupdf-wasm.wasm','5a30ef7b027f541ea8fc54e7c73f16414b0b59940741a12efe5e55f1fd0a99d7'],
]);
for(const [file,expected] of converterFiles){
  const bytes=await readFile(path.join(root,file));
  if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error(`Vendored converter integrity failed: ${file}`);
}
if(await access(path.join(root,'.git')).then(()=>true,()=>false)){
  execFileSync('git',['-C',root,'ls-files','--error-unmatch','--',...converterFiles.keys()],{stdio:'pipe'});
}
const fontPackage=await readFile(path.join(root,'runtime/fonts/times32.exe'));
if(createHash('sha256').update(fontPackage).digest('hex')!=='db56595ec6ef5d3de5c24994f001f03b2a13e37cee27bc25c58f6f43e8f807ab')throw new Error('Original font package integrity failed');
if((await readdir(path.join(root,'runtime/fonts'))).some(name=>/\.(ttf|woff2?|otf)$/i.test(name)))throw new Error('Never deploy extracted TNR fonts');
await rm(dist,{recursive:true,force:true}); await mkdir(dist,{recursive:true});
await cp(path.join(root,'src/editor'),dist,copyOptions);
await cp(path.join(root,'src/diagnostics'),path.join(dist,'diagnostics'),copyOptions);
await cp(path.join(root,'src/probe/font-worker.mjs'),path.join(dist,'font-worker.mjs'));
await cp(path.join(root,'src/shared'),path.join(dist,'shared'),copyOptions);
await cp(path.join(root,'src/shared/engine-worker.js'),path.join(dist,'formula-worker.js'));
await rm(path.join(dist,'shared/engine-worker.js'));
await cp(path.join(root,'runtime'),dist,copyOptions);
await cp(path.join(root,'LICENSES'),path.join(dist,'LICENSES'),copyOptions);
await cp(path.join(root,'core'),path.join(dist,'core'),copyOptions);
await mkdir(path.join(dist,'tests'),{recursive:true});
await cp(path.join(root,'tests/formulas.mjs'),path.join(dist,'tests/formulas.mjs'));
// The classic upstream engine uses importScripts. These two self-contained
// modules are wrapped without an eval, runtime compiler, or added dependency.
let compilerCore='';
for(const [file,namespace,names] of [
  ['core/tex-document.mjs','mathDocument',['buildDocument']],
  ['core/validate-math.mjs','mathAdmission',['assertMathInput']],
]){
  let source=await readFile(path.join(root,file),'utf8');
  if(/^import\s|^export\s+(?!const\s|function\s|class\s)/m.test(source))throw new Error('Unsupported worker core module syntax');
  source=source.replace(/^export\s+(?=const\s|function\s|class\s)/gm,'');
  compilerCore+=`self.${namespace}=(()=>{\n${source}\nreturn {${names.join(',')}};})();\n`;
}
await writeFile(path.join(dist,'compiler-core.js'),compilerCore);
// GitHub Pages receives this prebuilt artifact, without a Jekyll transform.
await writeFile(path.join(dist,'.nojekyll'),'');
await writeFile(path.join(dist,'_headers'),`/*
  Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src blob: data:; font-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
`);
execFileSync('python3',[
  path.join(root,'scripts/prepare-source-bundle.py'),
  '--application-output',path.join(dist,'sources/application-source.tar.gz'),
],{cwd:root,stdio:'inherit'});
console.log('Built Formula Studio; validated original font package and vendored MuPDF assets.');
