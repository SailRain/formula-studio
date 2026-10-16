import {createCompilerClient} from '../shared/compiler-client.mjs';
import {formulas,referenceFormulas,structureFormulas} from '../tests/formulas.mjs';
const client=createCompilerClient(),$=s=>document.querySelector(s),urls=new Set();let epoch=0;
const variants=String.raw`\phi\quad\epsilon\quad\vartheta\quad\varkappa\quad\varrho\quad\varpi\quad\varTheta`;
const extra=[
  {id:'seven-variants-four-styles',latex:String.raw`\begin{gathered}\symup{${variants}}\\\symit{${variants}}\\\symbfup{${variants}}\\\symbfit{${variants}}\end{gathered}`},
  {id:'command-meaning-and-dotless-j',latex:String.raw`\phi\ne\varphi\quad\epsilon\ne\varepsilon\quad\jmath\quad\hat{\jmath}\quad\mathrm{\jmath}\quad\text{Script=Latin}`},
  {id:'white-background',latex:formulas[2].latex,background:'white'},
];
function clear(){epoch++;client.clear();for(const url of urls)URL.revokeObjectURL(url);urls.clear();$('#summary').replaceChildren();$('#outputs').replaceChildren();$('#report').textContent='';$('#status').textContent='已清空';}
const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('');
function row(text){const p=document.createElement('p');p.textContent=text;$('#summary').append(p);}
async function run(corpus){clear();const id=epoch,report={userAgent:navigator.userAgent,origin:location.origin,sizePt:Number($('#size').value),samples:[],startedAt:new Date().toISOString()};
  try{for(const f of corpus){
    if(id!==epoch)return;
    const result=await client.compile(f.latex,{sizePt:report.sizePt,dpi:600,arrayStretch:f.arrayStretch??1,background:f.background||'transparent'},p=>{if(id===epoch)$('#status').textContent=f.id+'：'+p.message;});
    const png=result.png[0];const sample={id:f.id,report:result.report,pdfBytes:result.pdf.length,png:{...png,bytes:png.bytes.length},sha256:await hash(png.bytes)};
    if(id!==epoch)return;report.samples.push(sample);row(`${f.id}：通过；600 dpi SHA256 ${sample.sha256}`);
    const article=document.createElement('article');const title=document.createElement('h2');title.textContent=f.id;article.append(title);
    for(const [name,bytes,type]of [[f.id+'.pdf',result.pdf,'application/pdf'],[f.id+'.svg',result.svg,'image/svg+xml'],[f.id+'.png',png.bytes,'image/png']]){const a=document.createElement('a');a.textContent=name;a.download=name;a.href=URL.createObjectURL(new Blob([bytes],{type}));urls.add(a.href);article.append(a);if(type==='image/svg+xml'){const img=document.createElement('img');img.src=a.href;img.alt=f.id;img.style.width=((result.report.boundsPt[2]-result.report.boundsPt[0])*3)+'px';article.append(img);}}
    $('#outputs').append(article);$('#report').textContent=JSON.stringify(report,null,2);
  }report.completed=true;$('#status').textContent=`完成 ${report.samples.length} 条；全部通过`;
  }catch(e){if(id!==epoch)return;report.error=e.message;$('#status').textContent='失败：'+e.message;}finally{if(id===epoch)$('#report').textContent=JSON.stringify(report,null,2);}
}
async function negatives(){clear();const id=epoch,report={userAgent:navigator.userAgent,tests:[]};
  try{for(const [name,input]of [['file-access',String.raw`\input{secrets}`],['command-definition',String.raw`\def\x{x}\x`],['undefined-command',String.raw`\NotARealCommand{x}`],['missing-brace',String.raw`\frac{1}{x`],['length','x'.repeat(10001)],['nesting','{'.repeat(49)+'x'+'}'.repeat(49)],['bold-dotless-j',String.raw`\symbf{\jmath}`]]){
    let rejected=false,message='';try{await client.compile(input,{},p=>{if(id===epoch)$('#status').textContent=name+'：'+p.message;});}catch(e){rejected=true;message=e.message;}if(id!==epoch)return;report.tests.push({id:name,passed:rejected,message});row(name+'：'+rejected);
  }
  const pending=client.compile('x+1');client.cancel();let cancelled=false;try{await pending;}catch(e){cancelled=e.name==='AbortError';}report.tests.push({id:'immediate-cancel',passed:cancelled});row('immediate-cancel：'+cancelled);
  await client.compile('x+1',{},p=>{if(id===epoch)$('#status').textContent='取消后重启：'+p.message;});report.tests.push({id:'restart-after-cancel',passed:true});row('restart-after-cancel：true');
  report.completed=report.tests.every(t=>t.passed);$('#status').textContent=report.completed?'9 项错误与取消检查通过':'存在未通过检查';
  }catch(e){if(id!==epoch)return;report.error=e.message;$('#status').textContent='失败：'+e.message;}finally{if(id===epoch)$('#report').textContent=JSON.stringify(report,null,2);}
}
$('#run').onclick=()=>run(formulas);$('#reference').onclick=()=>run(referenceFormulas.map(f=>({...f,arrayStretch:1.08})));$('#variants').onclick=()=>run(extra);$('#negative').onclick=negatives;$('#clear').onclick=clear;addEventListener('pagehide',clear);
$('#structure').onclick=()=>run(structureFormulas);
