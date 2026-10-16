// The adapter uses only MathLive's public selection, style and insertion APIs.
export const styleDefinitions = {
  default: {variant:'normal',variantStyle:''},
  italic: {variant:'normal',variantStyle:'italic'},
  upright: {variant:'main',variantStyle:'up'},
  vector: {variant:'main',variantStyle:'bolditalic'},
  bold: {variant:'main',variantStyle:'bold'},
};
// Parse groups rather than replacing substrings: text and command names survive.
function rewrite(input, direction) {
  let i=0;
  function walk(end=false, text=false) {
    let out='';
    while(i<input.length) {
      const c=input[i++];
      if(c==='}' && end) return out;
      if(c==='{') {out+='{'+walk(true,text)+'}';continue;}
      if(c!=='\\') {out+=c;continue;}
      const match=input.slice(i).match(/^[A-Za-z]+|^./s);const name=match?.[0]||'';i+=name.length;
      if(input[i]==='{') {
        i++;const body=walk(true,text||name==='text');let command=name, value=body;
        if(!text) {
          if(direction==='visual' && name==='symbfit') command='mathbfit';
          if(direction==='visual' && name==='symit') command='mathnormal';
          if(direction==='source') {
            if(name==='mathbfit') command='symbfit';
            if(name==='mathnormal') command='symit';
            if(name==='bm') command='mathbf';
            if(['bm','mathbf'].includes(name) && body.startsWith('\\symbfit{') && balancedWhole(body.slice(8))) {out+=body;continue;}
          }
        }
        out+='\\'+command+'{'+value+'}';
      } else out+='\\'+name;
    }
    return out;
  }
  return walk();
}
function balancedWhole(s){let n=0;for(let i=0;i<s.length;i++){if(s[i]==='\\'){i++;continue;}if(s[i]==='{')n++;if(s[i]==='}'&&--n===0)return i===s.length-1;}return false;}
export const toVisualStyle = value => rewrite(value,'visual');
export const fromVisualStyle = value => rewrite(value,'source');
export function selectedStyle(field) {
  const latex=field.getValue(field.selection,'latex');
  if(/^\\text\{/.test(latex)&&!latex.replace(/\\text\{[^{}]*\}/g,'').trim())return 'text';
  for(const key of ['vector','bold','italic','upright']) if(field.queryStyle({variantStyle:styleDefinitions[key].variantStyle})==='all') return key;
  // Structural atoms (matrix fences/rows) have no variant metadata. A single
  // whole style wrapper still describes an unambiguous uniformly styled group.
  const wrapper=latex.match(/^\\(mathrm|mathit|mathnormal|mathbf|mathbfit|bm)\{/);
  if(wrapper && balancedWhole(latex.slice(wrapper[0].length-1)) && !/\\(?:mathrm|mathit|mathnormal|mathbf|mathbfit|bm|text)\{/.test(latex.slice(wrapper[0].length)))
    return {mathrm:'upright',mathit:'italic',mathnormal:'italic',mathbf:'bold',mathbfit:'vector',bm:'bold'}[wrapper[1]];
  const any=Object.values(styleDefinitions).slice(1).some(style=>field.queryStyle({variantStyle:style.variantStyle})!=='none');
  return any||/\\(?:text|math|bm)/.test(latex)?'mixed':'default';
}
// Text conversion is intentionally limited to literal characters, without
// turning a fraction, command, or matrix into a misleading plain-text string.
export function plainSelection(latex) {
  let text=latex.replace(/\\(?:mathrm|mathit|mathbf|mathbfit|symbfit|mathnormal|text)\{/g,'{');
  text=text.replace(/[{}]/g,'');
  if(/[\\^_&]/.test(text)) throw new Error('style.plainOnly');
  return text;
}
export function applySelectionStyle(field,key) {
  const selection=structuredClone(field.selection);
  if(!selection.ranges.length || selection.ranges.every(([a,b])=>a===b))throw new Error('style.selectFirst');
  const before=field.getValue('latex');
  try {
    if(key==='text') {
      const text=plainSelection(field.getValue(selection,'latex'));
      field.insert(text,{format:'latex',mode:'text',insertionMode:'replaceSelection',selectionMode:'item',focus:false,feedback:false});
    } else {
      if(!styleDefinitions[key])throw new Error('style.failed');
      const selected=field.getValue(selection,'latex');
      if(/\\text\{/.test(selected)) {
        const text=plainSelection(selected);
        field.insert(text,{format:'latex',mode:'math',insertionMode:'replaceSelection',selectionMode:'item',focus:false,feedback:false});
      }
      field.applyStyle(styleDefinitions[key],{operation:'set'});
    }
    if(field.errors.length)throw new Error('style.failed');
    return fromVisualStyle(field.getValue('latex'));
  } catch(error) {
    field.setValue(before,{silenceNotifications:true});field.selection=selection;throw error;
  }
}
