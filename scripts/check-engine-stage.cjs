/* Offline regression helper. Execute one trusted engine stage in a fresh Node process. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
const {webcrypto} = require('node:crypto');
const options = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const {project, candidateDir, stage, input, output, reportPath} = options;
if (!['xetex', 'dvipdfm'].includes(stage)) throw Error('Unsupported engine stage');
const loaded = new Map(), missing = new Set();
let finished = false;
function finish(report, bytes) {
  if (finished) return;
  finished = true;
  if (bytes) fs.writeFileSync(output, Buffer.from(bytes));
  fs.writeFileSync(reportPath, JSON.stringify({...report, missing:[...missing]}, null, 2) + '\n');
  setImmediate(() => process.exit(report.result === 'ok' && report.status === 0 ? 0 : 1));
}
async function main() {
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
  // Extract the verified original package only into process memory.
  const {extractTimes} = await import(pathToFileURL(path.join(project, 'runtime/fonts/extract-times.mjs')).href);
  const bundle = await extractTimes(new Uint8Array(fs.readFileSync(path.join(project, 'runtime/fonts/times32.exe'))), {
    wasmBytes:new Uint8Array(fs.readFileSync(path.join(project, 'runtime/fonts/libarchive.wasm'))),
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(project, 'runtime/assets.json'), 'utf8'));
  const {assertMathInput} = await import(pathToFileURL(path.join(project, 'core/validate-math.mjs')).href);
  if (stage === 'xetex') assertMathInput(options.latex);
  global.self = global;
  global.require = require;
  global.__dirname = candidateDir;
  global.fetch = undefined;
  global.XMLHttpRequest = class { open() { throw Error('Network/dynamic resources are disabled in offline regression'); } };
  global.postMessage = data => {
    if (data.result === 'ok' && !data.cmd) {
      setTimeout(() => {
        try {
          FS.mkdir('/work/fonts');
          for (const item of manifest) {
            if (stage === 'dvipdfm' && item.name.endsWith('.fmt')) continue;
            const local = new URL(item.url, pathToFileURL(path.join(project, 'runtime') + path.sep));
            const bytes = new Uint8Array(fs.readFileSync(local));
            FS.writeFile('/work/' + item.name, bytes);
            loaded.set(item.name, '/work/' + item.name);
            loaded.set(item.name.split('/').at(-1), '/work/' + item.name);
          }
          for (const [name, bytes] of Object.entries(bundle.fonts)) {
            FS.writeFile('/work/fonts/' + name, bytes);
            loaded.set(name, '/work/fonts/' + name);
            loaded.set('fonts/' + name, '/work/fonts/' + name);
          }
          if (stage === 'xetex') {
            FS.writeFile('/work/main.tex', fs.readFileSync(input, 'utf8'));
            self.mainfile = 'main.tex';
            prepareExecutionContext();
            cwrap('setMainEntry', 'number', ['string'])(self.mainfile);
            const status = _compileLaTeX();
            const bytes = status === 0 ? FS.readFile('/work/main.xdv', {encoding:'binary'}) : null;
            finish({status, result:status === 0 ? 'ok' : 'failed', log:self.memlog}, bytes);
          } else {
            FS.writeFile('/work/main.xdv', new Uint8Array(fs.readFileSync(input)));
            self.mainfile = 'main.xdv';
            compilePDFRoutine();
          }
        } catch (error) {
          finish({status:1, result:'failed', log:self.memlog || '', error:error.stack || String(error)});
        }
      }, 0);
    } else if (data.cmd === 'compile') {
      finish({status:data.status, result:data.result, log:data.log || ''}, data.pdf);
    }
  };
  const engineName = `swiftlatex${stage}.js`;
  vm.runInThisContext(fs.readFileSync(path.join(candidateDir, engineName), 'utf8'), {filename:engineName});
  // Match the application worker: fixed manifest resources; no fontconfig or package downloader.
  kpse_find_file_impl = (pointer, format) => {
    const name = UTF8ToString(pointer);
    const suffix = {3:'.tfm', 26:'.tex', 32:'.pfb', 36:'.ttf', 47:'.otf'}[format];
    const resolved = loaded.get(name) || loaded.get(name.replace(/^\/work\//, '')) || (suffix && loaded.get(name + suffix));
    if (resolved) return allocate(intArrayFromString(resolved), 'i8', ALLOC_NORMAL);
    missing.add(name); return 0;
  };
  if (typeof fontconfig_search_font_impl === 'function') fontconfig_search_font_impl = () => 0;
}
main().catch(error => finish({status:1, result:'failed', error:error.stack || String(error), log:''}));
