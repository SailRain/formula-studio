// A dedicated, short-lived Worker: unpack only the verified original package.
const resourceBase = new URL('./', self.location.href);
const resourceURL = path => new URL(path, resourceBase).href;
const allowed=new Set(['fonts/times32.exe','fonts/libarchive.wasm'].map(path=>new URL(resourceURL(path)).pathname));
const nativeFetch=self.fetch.bind(self),requests=[];
self.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,self.location.href);
  if(url.origin!==self.location.origin||url.search||!allowed.has(url.pathname)||(options?.method??'GET')!=='GET')throw new Error('Unexpected font resource request');
  requests.push(url.pathname);return nativeFetch(url,options);
};
try{
  const {extractTimes}=await import(resourceURL('fonts/extract-times.mjs'));
  const response=await fetch(resourceURL('fonts/times32.exe'));
  if(!response.ok)throw new Error('Cannot load the original font package');
  const result=await extractTimes(new Uint8Array(await response.arrayBuffer()));
  postMessage({type:'fonts',fonts:result.fonts,report:{...result.report,requests}},Object.values(result.fonts).map(bytes=>bytes.buffer));
}catch(error){postMessage({type:'error',message:error.message});}
