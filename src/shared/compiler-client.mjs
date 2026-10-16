import {resourceURL} from './resources.mjs';
import {assertMathInput} from '../core/validate-math.mjs';

// Each job owns all its Workers. Completion, cancellation, and failure release
// their entire in-memory filesystems, including source, logs and intermediates.
export function createCompilerClient() {
  let active=null;
  function cancel(){
    const job=active;if(!job)return;
    active=null;job.cancelled=true;
    for(const reject of [...job.pending])reject(Object.assign(new Error('已取消'),{name:'AbortError'}));
    for(const worker of job.workers)worker.terminate();
    job.pending.clear();job.workers.clear();
  }
  async function compile(latex,{sizePt=10,background='transparent',dpi=600,arrayStretch=1}={},onProgress=()=>{}){
    cancel();
    assertMathInput(latex);
    if(![8,10,12,16,20,24].includes(sizePt)||![300,600].includes(dpi)||![1,1.08].includes(arrayStretch)||!['transparent','white'].includes(background))throw new Error('导出设置不在支持范围内');
    const job={workers:new Set(),pending:new Set(),cancelled:false};active=job;
    const start=performance.now();
    const ensureActive=()=>{if(job.cancelled||active!==job)throw Object.assign(new Error('已取消'),{name:'AbortError'});};
    const progress=(phase,message,detail={})=>{ensureActive();onProgress({phase,message,...detail});ensureActive();};
    const worker=(url,options)=>{ensureActive();const w=new Worker(url,options);job.workers.add(w);return w;};
    const wait=(w,message,expected,label,timeout=60000)=>new Promise((resolve,reject)=>{
      ensureActive();
      let timer;
      const cleanup=()=>{clearTimeout(timer);job.pending.delete(fail);w.onmessage=w.onerror=w.onmessageerror=null;};
      const fail=error=>{cleanup();reject(error);};job.pending.add(fail);
      timer=setTimeout(()=>fail(new Error(`${label}超时，已停止。请重试或缩短公式。`)),timeout);
      w.onerror=e=>fail(new Error(`${label}失败：${e.message||'无法加载组件，请重试'}`));
      w.onmessageerror=()=>fail(new Error(`${label}消息读取失败`));
      w.onmessage=({data})=>{
        if(data?.type==='progress'){try{progress('loading',`${label}：${data.phase==='resources'?`${data.completed}/${data.total} 个资源`:data.current||'初始化'}`,{engine:data.engine});}catch(error){fail(error);}return;}
        if(data?.type==='error'){fail(new Error(`${label}：${data.message}`));return;}
        if(data?.type!==expected){fail(new Error(`${label}返回了意外消息`));return;}
        cleanup();resolve(data);
      };
      if(message)try{w.postMessage(message);}catch(error){fail(error);}
    });
    const exportWarnings=[];
    const checked=(response,label,{pdf=false}={})=>{
      if(response.result!=='ok'){
        const lines=(response.log||'').split('\n');
        const errorLine=lines.findIndex(line=>/^!|Missing character|Package formula-fonts Error/.test(line));
        const detail=errorLine>=0?lines.slice(errorLine,errorLine+4).join(' '):'请检查命令、花括号和上下标。';
        throw new Error(`${label}失败：${detail}`);
      }
      const knownMathCmap=pdf&&/warning: Unable to read OpenType\/TrueType Unicode cmap table\./.test(response.log||'')&&/warning: Failed to load ToUnicode CMap for font "TeXGyreTermesMath-Regular"/.test(response.log||'');
      const warnings=(response.log||'').split('\n').filter(line=>/warning|missing character|substitut/i.test(line)).filter(line=>{
        // These subsets contain unencoded math construction glyphs (radical
        // and delimiter size variants). Verified outlines remain unchanged;
        // require the known pair, and report the PDF copy-text limitation.
        if(knownMathCmap&&/^warning: (Unable to read OpenType\/TrueType Unicode cmap table\.|Failed to load ToUnicode CMap for font "TeXGyreTermesMath-Regular")$/.test(line.trim())){
          if(!exportWarnings.length)exportWarnings.push('PDF 的部分数学符号可能无法正确复制为文字；矢量字形、SVG 和 PNG 不受影响。');
          return false;
        }return true;
      });
      if(warnings.length)throw new Error(`字体排版未通过：${warnings.slice(0,3).join(' ')}`);
      return response;
    };
    try{
      progress('loading','首次载入排版组件；稍后编译会使用浏览器的静态资源缓存。');
      const tex=worker(resourceURL('formula-worker.js?engine=xetex'));
      const pdf=worker(resourceURL('formula-worker.js?engine=dvipdfm'));
      const converter=worker(resourceURL('converter/worker.mjs'),{type:'module'});
      const font=worker(resourceURL('font-worker.mjs'),{type:'module'});
      const loaded=await Promise.all([
        wait(tex,null,'ready','XeTeX',120000),wait(pdf,null,'ready','PDF 引擎',120000),
        wait(converter,null,'ready','转换器',120000),wait(font,null,'fonts','字体包',120000),
      ]);
      if(job.cancelled)throw Object.assign(new Error('已取消'),{name:'AbortError'});
      font.terminate();job.workers.delete(font);
      const bundle=loaded[3];
      await Promise.all([wait(tex,{type:'fonts',fonts:bundle.fonts},'fonts-ready','字体装入'),wait(pdf,{type:'fonts',fonts:bundle.fonts},'fonts-ready','字体装入')]);
      bundle.fonts=null;
      progress('typesetting','正在使用 Times New Roman 排版…');
      const xdv=checked(await wait(tex,{type:'compile',latex,sizePt,arrayStretch},'result','公式排版'),'公式排版');
      progress('pdf','正在生成矢量 PDF…');
      const compiled=checked(await wait(pdf,{type:'compile',xdv:xdv.bytes},'result','PDF 生成'),'PDF 生成',{pdf:true});
      progress('exporting','正在裁切并导出 SVG、PNG…');
      const converted=await wait(converter,{type:'convert',pdf:compiled.bytes,options:{dpi:[dpi],background,cropToInk:true}},'result','图像导出');
      if(job.cancelled)throw Object.assign(new Error('已取消'),{name:'AbortError'});
      const result=converted.result;
      Object.assign(result.report,{sizePt,arrayStretch,totalMs:performance.now()-start,texMs:xdv.compileMs,pdfMs:compiled.compileMs,conversionMs:converted.durationMs,fontPackageSHA256:bundle.report.package.sha256,warnings:exportWarnings});
      result.report.staticRequests=[...new Set([...xdv.requests,...compiled.requests,...converted.requests,...bundle.report.requests])];
      result.report.wasmMemoryBytes={tex:xdv.wasmMemoryBytes,pdf:compiled.wasmMemoryBytes,texSnapshot:xdv.snapshotBytes};
      progress('complete','准确预览与导出已更新。');
      return result;
    }finally{
      for(const w of job.workers)w.terminate();job.workers.clear();
      for(const reject of [...job.pending])reject(Object.assign(new Error('已停止'),{name:'AbortError'}));job.pending.clear();
      if(active===job)active=null;
    }
  }
  return {compile,cancel,clear:cancel};
}
