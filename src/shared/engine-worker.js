const resourceBase = new URL('./', self.location.href);
const resourceURL = path => new URL(path, resourceBase).href;
// Only validated math expressions enter the fixed, trusted document wrapper.
importScripts(resourceURL('compiler-core.js'));
const engine = new URL(self.location.href).searchParams.get('engine');
if (!['xetex','dvipdfm'].includes(engine)) throw new Error('Unknown engine');
const emit = self.postMessage.bind(self);
const fetchStatic = self.fetch.bind(self);
const allowed = new Set([`swiftlatex${engine}.wasm`, 'assets.json'].map(path => new URL(resourceURL(path)).pathname));
const requests = []; const missing = new Set(); const loaded = new Map();
let ready = false, compileStart = 0, preloadBytes = 0;
const started = performance.now();
let lastPhase='starting';
const progress = (phase, detail={}) => {lastPhase=phase;emit({type:'progress',engine,phase,elapsedMs:performance.now()-started,...detail});};
// The upstream asynchronous WASM loader does not forward all rejected fetches.
self.addEventListener('unhandledrejection',event=>emit({type:'error',engine,phase:lastPhase,message:String(event.reason?.message??event.reason??'Unhandled Worker rejection')}));
self.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url,self.location.href);
  if (url.origin !== self.location.origin || url.search || !allowed.has(url.pathname) || (options?.method || 'GET') !== 'GET') throw new Error('Static network allowlist rejected request');
  requests.push(url.pathname);
  const isWasm=url.pathname.endsWith('.wasm');
  if(isWasm) progress('wasm-fetch',{current:url.pathname});
  return fetchStatic(url.href, options).then(response=>{
    if(isWasm) progress('wasm-response',{current:url.pathname,status:response.status,contentType:response.headers?.get('content-type')??null});
    return response;
  },error=>{
    emit({type:'error',engine,phase:lastPhase,message:`请求 ${url.pathname} 失败：${error.message??error}`});
    throw error;
  });
};
// Any legacy package downloader fails locally, before opening a request.
self.XMLHttpRequest = class { open(){throw new Error('Dynamic resource requests disabled');} };
self.postMessage = data => {
  if (data.result === 'ok' && !data.cmd) {
    setTimeout(async () => {
      try {
        progress('manifest',{current:new URL(resourceURL('assets.json')).pathname});
        const manifestResponse = await fetch(resourceURL('assets.json'));
        if(!manifestResponse.ok) throw new Error('Static manifest HTTP '+manifestResponse.status);
        const manifest = await manifestResponse.json();
        FS.mkdir('/work/fonts');
        const items=manifest.filter(item=>!(engine==='dvipdfm' && item.name.endsWith('.fmt')));
        const active=new Set(); let next=0,completed=0,failed=false;
        const update=current=>progress('resources',{completed,total:items.length,current,active:[...active],preloadBytes});
        update(null);
        // Bound network pressure while avoiding one full round trip per macro file.
        await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{
          while(!failed&&next<items.length){
            const item=items[next++];
            const assetURL = new URL(item.url, resourceBase);
            if (assetURL.origin !== resourceBase.origin || !assetURL.pathname.startsWith(resourceBase.pathname) || assetURL.search || assetURL.hash) throw new Error('Invalid static resource URL');
            allowed.add(assetURL.pathname); active.add(item.name); update(item.name);
            try{
              const response=await fetch(assetURL.href);
              if(!response.ok) throw new Error('Static resource '+item.name+' HTTP '+response.status);
              const bytes=new Uint8Array(await response.arrayBuffer());
              FS.writeFile('/work/'+item.name,bytes); loaded.set(item.name,'/work/'+item.name);
              loaded.set(item.name.split('/').at(-1),'/work/'+item.name); preloadBytes+=bytes.byteLength;
              completed++;
            }catch(error){failed=true;throw Object.assign(new Error(`资源 ${item.name} 加载失败：${error.message??error}`),{resource:item.name});}
            finally{active.delete(item.name);update(item.name);}
          }
        }));
        ready=true;
        emit({type:'ready',engine,loadMs:performance.now()-started,preloadBytes,requests,wasmMemoryBytes:wasmMemory.buffer.byteLength,snapshotBytes:self.initmem?.byteLength||0});
      } catch(error) { emit({type:'error',engine,phase:lastPhase,resource:error.resource??null,message:error.message}); }
    },0);
  } else if (data.cmd==='compile') {
    emit({type:'result',engine,result:data.result,status:data.status,bytes:data.pdf,log:data.log,compileMs:performance.now()-compileStart,missing:[...missing],requests,wasmMemoryBytes:wasmMemory.buffer.byteLength,snapshotBytes:self.initmem?.byteLength||0});
  }
};
progress('engine-script',{current:new URL(resourceURL(`swiftlatex${engine}.js`)).pathname});
importScripts(resourceURL(`swiftlatex${engine}.js`));
kpse_find_file_impl = (ptr,format) => {
  const name=UTF8ToString(ptr); const suffix={3:'.tfm',26:'.tex',32:'.pfb',36:'.ttf',47:'.otf'}[format];
  const path=loaded.get(name)||loaded.get(name.replace(/^\/work\//,''))||(suffix&&loaded.get(name+suffix));
  if (path) return allocate(intArrayFromString(path),'i8',ALLOC_NORMAL);
  missing.add(name); return 0;
};
if (typeof fontconfig_search_font_impl==='function') fontconfig_search_font_impl=()=>0;
self.onmessage=({data})=>{
  if(!ready) return;
  if(data?.type==='fonts'){
    try{
      const names=['Times.TTF','Timesi.TTF','Timesbd.TTF','Timesbi.TTF'];
      if(Object.keys(data.fonts).sort().join('|')!==names.sort().join('|')) throw new Error('Unexpected font bundle');
      for(const name of names){
        const bytes=data.fonts[name];
        if(!(bytes instanceof Uint8Array)||bytes.length<100000||bytes.length>1000000) throw new Error('Invalid font bytes');
        FS.writeFile('/work/fonts/'+name,bytes);loaded.set(name,'/work/fonts/'+name);loaded.set('fonts/'+name,'/work/fonts/'+name);
      }
      emit({type:'fonts-ready',engine});
    }catch(error){emit({type:'error',message:error.message});}
    return;
  }
  if(data?.type!=='compile') return;
  missing.clear(); compileStart=performance.now();
  try {
    if(engine==='xetex'){
      const latex = self.mathAdmission.assertMathInput(data.latex);
      const source = self.mathDocument.buildDocument(latex,{sizePt:data.sizePt,arrayStretch:data.arrayStretch});
      FS.writeFile('/work/main.tex',source); self.mainfile='main.tex';
      prepareExecutionContext(); cwrap('setMainEntry','number',['string'])(self.mainfile);
      const status=_compileLaTeX();
      // Equations have no bibliography. Do not invoke the upstream automatic BibTeX pass.
      const bytes=status===0 ? FS.readFile('/work/main.xdv',{encoding:'binary'}) : null;
      self.postMessage({cmd:'compile',result:status===0?'ok':'failed',status,log:self.memlog,pdf:bytes?.buffer});
    }else{
      if(!(data.xdv instanceof ArrayBuffer)||data.xdv.byteLength>10_000_000) throw new Error('Intermediate file exceeds size limit');
      FS.writeFile('/work/main.xdv',new Uint8Array(data.xdv)); self.mainfile='main.xdv'; compilePDFRoutine();
    }
  } catch(error){emit({type:'error',message:error.message,log:self.memlog,missing:[...missing]});}
};
