// Fresh-process, offline WASM output regression. This does not replace browser acceptance.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {buildDocument} from '../core/tex-document.mjs';
import {engineOutputCases} from '../tests/engine-output-cases.mjs';
import {convertPDF} from '../runtime/converter/converter.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {values} = parseArgs({options:{
  'candidate-dir':{type:'string', default:path.join(project, 'runtime')},
  output:{type:'string'},
  expected:{type:'string', default:path.join(project, 'tests/fixtures/expected-600dpi.json')},
  case:{type:'string', multiple:true},
  'timeout-ms':{type:'string', default:'120000'},
  help:{type:'boolean', default:false},
}});
if (values.help) {
  console.log('Usage: node scripts/check-engine-output.mjs [--candidate-dir DIR] [--output DIR] [--case KEY] [--timeout-ms 120000]\nCandidates must contain swiftlatexxetex.js/.wasm and swiftlatexdvipdfm.js/.wasm. Default: validate current runtime. Output defaults to ignored .qa/. No binaries or baselines are promoted or updated.');
  process.exit(0);
}
const timeout = Number(values['timeout-ms']);
if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 600000) throw Error('Invalid --timeout-ms');
const candidateDir = path.resolve(values['candidate-dir']);
const outputRoot = path.resolve(values.output || path.join(project, '.qa', 'engine-output-' + new Date().toISOString().replaceAll(':','-')));
const expectedPath = path.resolve(values.expected);
const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
const selected = values.case ? engineOutputCases.filter(item => values.case.includes(item.key)) : engineOutputCases;
if (!selected.length || values.case?.some(key => !selected.some(item => item.key === key))) throw Error('Unknown --case');
if (engineOutputCases.length !== 35 || new Set(engineOutputCases.map(item=>item.key)).size !== 35 || Object.keys(expected).length !== 35 || engineOutputCases.some(item => !/^[a-f0-9]{64}$/.test(expected[item.key] || ''))) throw Error('Expected exactly 35 complete approved cases');
fs.mkdirSync(outputRoot, {recursive:true});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const metadata = file => ({name:path.basename(file), sha256:sha(fs.readFileSync(file)), bytes:fs.statSync(file).size});
const candidateFiles = ['swiftlatexxetex.js','swiftlatexxetex.wasm','swiftlatexdvipdfm.js','swiftlatexdvipdfm.wasm'].map(name => metadata(path.join(candidateDir, name)));
const report = {schemaVersion:1, startedAt:new Date().toISOString(), environment:'Offline Node WASM in fresh processes; browser validation remains separate',
  outputRegressionPassed:false, allCasesSelected:selected.length === 35, expectedCaseCount:35,
  candidateFiles, core:metadata(path.join(project, 'core/tex-document.mjs')),
  baseline:metadata(expectedPath), fontPackage:metadata(path.join(project, 'runtime/fonts/times32.exe')),
  settings:{dpi:600, background:'transparent', cropToInk:true}, fontWarnings:0, cases:[]};
const knownCopyWarnings = [
  'warning: Unable to read OpenType/TrueType Unicode cmap table.',
  'Unable to read OpenType/TrueType Unicode cmap table.',
  'warning: Failed to load ToUnicode CMap for font "TeXGyreTermesMath-Regular"',
  'Failed to load ToUnicode CMap for font "TeXGyreTermesMath-Regular"',
];
function warnings(log, stage) {
  const lines=log.split('\n').map(line=>line.trim()).filter(Boolean);
  const knownPair=stage==='dvipdfm' && lines.includes(knownCopyWarnings[0]) && lines.includes(knownCopyWarnings[2]);
  return {fontWarnings:lines.filter(line=>/warning|missing character|substitut|undefined|not available/i.test(line) && !(knownPair && knownCopyWarnings.includes(line))),
    knownPDFTextCopyWarnings:knownPair ? lines.filter(line=>knownCopyWarnings.includes(line)) : []};
}
function stageRun(stage, input, output, directory, item) {
  const reportPath = path.join(directory, stage+'-report.json');
  const jobPath = path.join(directory, stage+'-job.json');
  fs.writeFileSync(jobPath, JSON.stringify({project, candidateDir, stage, input, output, reportPath, latex:item.latex})+'\n');
  const result=spawnSync(process.execPath, [path.join(project, 'scripts/check-engine-stage.cjs'), jobPath], {
    encoding:'utf8', timeout, maxBuffer:8_000_000,
  });
  fs.writeFileSync(path.join(directory,stage+'-console.txt'),(result.stdout||'')+(result.stderr||''));
  let proof=fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath,'utf8')) : {};
  proof={...proof, ...warnings(proof.log || '',stage)};
  fs.writeFileSync(reportPath,JSON.stringify(proof,null,2)+'\n');
  if (result.error || result.status !== 0 || proof.status !== 0 || proof.result !== 'ok') throw Object.assign(new Error(`${stage} failed: ${result.error?.message || proof.error || 'see stage log'}`), {stageProof:proof});
  return proof;
}
for(const item of selected) {
  const directory=path.join(outputRoot,item.key);fs.mkdirSync(directory,{recursive:true});
  const entry={key:item.key,sizePt:item.sizePt,arrayStretch:item.arrayStretch,baselinePNGHash:expected[item.key],candidatePNGHash:null,match:false,fontWarnings:[],knownPDFTextCopyWarnings:[]};
  try {
    const source=buildDocument(item.latex,{sizePt:item.sizePt,arrayStretch:item.arrayStretch});
    entry.sourceSHA256=sha(source);fs.writeFileSync(path.join(directory,'main.tex'),source);
    const tex=stageRun('xetex',path.join(directory,'main.tex'),path.join(directory,'main.xdv'),directory,item);
    entry.fontWarnings.push(...tex.fontWarnings);
    const pdf=stageRun('dvipdfm',path.join(directory,'main.xdv'),path.join(directory,'main.pdf'),directory,item);
    entry.fontWarnings.push(...pdf.fontWarnings);entry.knownPDFTextCopyWarnings=pdf.knownPDFTextCopyWarnings;
    const result=convertPDF(new Uint8Array(fs.readFileSync(path.join(directory,'main.pdf'))),{dpi:[600],background:'transparent',cropToInk:true});
    if(!result.report.crop.stagingInkInsidePage)throw Error('Ink exceeds staging page');
    const png=result.png[0];fs.writeFileSync(path.join(directory,'output-600dpi.png'),png.bytes);
    fs.writeFileSync(path.join(directory,'output.svg'),result.svg);fs.writeFileSync(path.join(directory,'output.pdf'),result.pdf);
    entry.candidatePNGHash=sha(png.bytes);entry.pngMetadata=png.metadata;entry.boundsPt=result.report.boundsPt;
    entry.match=entry.candidatePNGHash === entry.baselinePNGHash;
    if(!entry.match)entry.error='PNG hash differs from approved output';
    if(entry.fontWarnings.length)entry.error='Unexpected font/typesetting warnings';
  } catch(error) {
    entry.error=error.message;
    if(error.stageProof?.fontWarnings)entry.fontWarnings.push(...error.stageProof.fontWarnings);
  }
  report.fontWarnings += entry.fontWarnings.length;report.cases.push(entry);
  fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(entry,null,2)+'\n');
  fs.writeFileSync(path.join(outputRoot,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({key:entry.key,match:entry.match,fontWarnings:entry.fontWarnings.length,error:entry.error}));
}
report.completedAt=new Date().toISOString();
report.outputRegressionPassed=report.allCasesSelected && report.cases.every(item=>item.match && !item.error) && report.fontWarnings === 0;
fs.writeFileSync(path.join(outputRoot,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(`${report.outputRegressionPassed ? 'PASS' : values.case && report.cases.every(item=>item.match&&!item.error) ? 'PARTIAL PASS' : 'FAIL'} ${report.cases.filter(item=>item.match&&!item.error).length}/${selected.length}; report: ${path.join(outputRoot,'report.json')}`);
if(!report.cases.every(item=>item.match&&!item.error))process.exitCode=1;
