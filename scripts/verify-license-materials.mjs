// Copyright (c) 2026 Pierson Bian. MIT; third-party materials retain their terms.
import {readFile, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest=JSON.parse(await readFile(path.join(root,'LICENSES/source-manifest.json'),'utf8'));
const failures=[];
for(const entry of [...manifest.sourceArchives,...manifest.runtimeFiles,...(manifest.buildMaterials??[]),...(manifest.licenseTexts??[])]){
  const target=path.resolve(root,entry.path);
  if(!target.startsWith(root+path.sep)){failures.push('Unsafe material path: '+entry.path);continue;}
  try{
    const bytes=await readFile(target);
    if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256) failures.push('Material integrity mismatch: '+entry.path);
  }catch{failures.push('Missing material: '+entry.path);}
}
for(const name of ['LICENSE','LICENSES/README.md','THIRD_PARTY_NOTICES.md','runtime/licenses/Formula-Studio-MIT.txt','runtime/licenses/Microsoft-EULA.txt','runtime/licenses/THIRD_PARTY_NOTICES.txt']){
  try{await access(path.join(root,name));}catch{failures.push('Missing license file: '+name);}
}
const license=await readFile(path.join(root,'LICENSE'),'utf8');
if(!license.includes('Copyright (c) 2026 Pierson Bian'))failures.push('Project MIT attribution is incorrect');
if(manifest.releaseGate?.ready!==true)failures.push('Public release gate is closed: '+(manifest.releaseGate?.reason??'source closure has not been verified'));
if(manifest.sourceClosure?.SwiftLaTeX?.status!=='traceable-build-verified')failures.push('SwiftLaTeX must use the retained traceable build');
if(manifest.sourceClosure?.SwiftLaTeX?.outputRegressionPassed!==true)failures.push('Formula output regression evidence has not passed');
if(manifest.releaseGate?.ready===true){
  try{
    const closure=manifest.sourceClosure.SwiftLaTeX;
    for(const field of ['buildReport','regressionReport'])if(!manifest.buildMaterials.some(x=>x.path===closure[field]))throw new Error('Release proof is not covered by material hashes: '+field);
    const build=JSON.parse(await readFile(path.join(root,closure.buildReport),'utf8'));
    const regression=JSON.parse(await readFile(path.join(root,closure.regressionReport),'utf8'));
    const baselineBytes=await readFile(path.join(root,'tests/fixtures/expected-600dpi.json'));
    const baseline=JSON.parse(baselineBytes);
    const baselineHash=createHash('sha256').update(baselineBytes).digest('hex');
    if(regression.baseline?.sha256!==baselineHash)throw new Error('Output regression used a different baseline');
    const expectedKeys=Object.keys(baseline).sort();
    if(expectedKeys.length!==35||regression.expectedCaseCount!==35||regression.allCasesSelected!==true||regression.outputRegressionPassed!==true||regression.fontWarnings!==0)throw new Error('Full 35-case output regression did not pass');
    if(JSON.stringify(regression.cases.map(x=>x.key).sort())!==JSON.stringify(expectedKeys))throw new Error('Output regression case set is incomplete');
    for(const entry of regression.cases)if(entry.match!==true||entry.baselinePNGHash!==baseline[entry.key]||entry.candidatePNGHash!==baseline[entry.key]||entry.fontWarnings?.length!==0)throw new Error('Output regression mismatch: '+entry.key);
    for(const name of ['swiftlatexxetex.js','swiftlatexxetex.wasm','swiftlatexdvipdfm.js','swiftlatexdvipdfm.wasm']){
      const runtime=manifest.runtimeFiles.find(x=>x.path==='runtime/'+name);
      const built=build.artifacts?.find(x=>x.file===name);
      const tested=regression.candidateFiles?.find(x=>x.name===name);
      if(!runtime||built?.sha256!==runtime.sha256||tested?.sha256!==runtime.sha256||built?.bytes!==runtime.bytes||tested?.bytes!==runtime.bytes)throw new Error('Published engine differs from built/tested engine: '+name);
    }
    for(const [field,file] of [['core','core/tex-document.mjs'],['fontPackage','runtime/fonts/times32.exe']]){
      const bytes=await readFile(path.join(root,file));
      if(regression[field]?.sha256!==createHash('sha256').update(bytes).digest('hex'))throw new Error('Output regression input changed: '+file);
    }
    if(build.sourceVersion!=='v20022022'||!build.emscriptenVersion?.includes('3.1.4')||build.libraries?.length!==3)throw new Error('Pinned source/library build evidence is incomplete');
  }catch(error){failures.push('Release evidence verification failed: '+error.message);}
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log('Verified licenses, source archives, pinned runtime materials, and public release evidence.');
