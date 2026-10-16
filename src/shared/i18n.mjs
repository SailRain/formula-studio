import {messages} from './messages.mjs';
export {messages};
export const locales = ['en-US','zh-CN'];
let locale = 'en-US';
export const getLocale = () => locale;
export function setLocale(value) { locale = locales.includes(value) ? value : 'en-US'; }
export function t(key, params = {}, lang = locale) {
  const value = messages[key]?.[lang] ?? messages[key]?.['en-US'] ?? key;
  return value.replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match);
}
const exact = new Map(Object.entries(messages).map(([key,value]) => [value['zh-CN'],key]));
const patterns = [];
function pattern(key, zh, en, regex) { messages[key] = {'zh-CN':zh,'en-US':en}; patterns.push({key,regex}); }
pattern('error.position','{0}（第 {1} 行，第 {2} 列）','{0} (line {1}, column {2})',/^(.*)（第 (\d+) 行，第 (\d+) 列）$/s);
pattern('visual.preserved','源码已保留：{0}','Source preserved: {0}',/^源码已保留：(.*)$/s);
pattern('visual.command','{0} 的可视化语义尚未与本工具核对，请使用源码模式。','Visual semantics for {0} have not been verified. Use source mode.',/^(.*) 的可视化语义尚未与本工具核对，请使用源码模式。$/);
pattern('result.hint','{0} pt 排版 · PNG {1} dpi · 预览缩放不影响导出','{0} pt typesetting · PNG {1} dpi · Zoom does not affect exports',/^(\d+) pt 排版 · PNG (\d+) dpi · 预览缩放不影响导出$/);
pattern('result.info','SVG 使用字形轮廓，无需接收设备安装字体；PDF 为矢量文档。PNG 背景：{0}。本次排版、裁切与三个导出使用同一结果。','SVG uses glyph outlines; no fonts are needed on the receiving device. PDF is vector-based. PNG background: {0}. All exports share the same typesetting and crop.',/^SVG 使用字形轮廓，无需接收设备安装字体；PDF 为矢量文档。PNG 背景：(.*?)。本次排版、裁切与三个导出使用同一结果。$/);
pattern('result.seconds','{0} 秒','{0} s',/^([\d.]+) 秒$/);
pattern('engine.timeout','{0}超时，已停止。请重试或缩短公式。','{0} timed out and stopped. Retry or shorten the formula.',/^(.*)超时，已停止。请重试或缩短公式。$/);
pattern('engine.resource','资源 {0} 加载失败：{1}','Could not load resource {0}: {1}',/^资源 (.*?) 加载失败：(.*)$/s);
pattern('engine.request','请求 {0} 失败：{1}','Request {0} failed: {1}',/^请求 (.*?) 失败：(.*)$/s);
pattern('engine.failed','{0}失败：{1}','{0} failed: {1}',/^(.*?)失败：(.*)$/s);
pattern('engine.decode','{0}消息读取失败','Could not decode a message from {0}',/^(.*)消息读取失败$/);
pattern('engine.unexpected','{0}返回了意外消息','Unexpected message from {0}',/^(.*)返回了意外消息$/);
pattern('engine.fontCheck','字体排版未通过：{0}','Font validation failed: {0}',/^字体排版未通过：(.*)$/s);
pattern('engine.resources','{0}/{1} 个资源','{0}/{1} resources',/^(\d+)\/(\d+) 个资源$/);
pattern('engine.detail','{0}：{1}','{0}: {1}',/^(XeTeX|PDF 引擎|转换器|字体包|字体装入|公式排版|PDF 生成|图像导出)：(.*)$/s);
pattern("validation.tokens","公式结构过多，最多允许 {0} 个词法单元","Formula is too complex; at most {0} tokens are allowed",new RegExp("^\u516c\u5f0f\u7ed3\u6784\u8fc7\u591a\uff0c\u6700\u591a\u5141\u8bb8 (\\d+) \u4e2a\u8bcd\u6cd5\u5355\u5143$"));
pattern("validation.nesting","整体结构最多嵌套 {0} 层","At most {0} nesting levels are allowed",new RegExp("^\u6574\u4f53\u7ed3\u6784\u6700\u591a\u5d4c\u5957 (\\d+) \u5c42$"));
pattern("validation.braces","花括号最多嵌套 {0} 层","At most {0} brace nesting levels are allowed",new RegExp("^\u82b1\u62ec\u53f7\u6700\u591a\u5d4c\u5957 (\\d+) \u5c42$"));
pattern("validation.envDepth","环境最多嵌套 {0} 层","At most {0} nested environments are allowed",new RegExp("^\u73af\u5883\u6700\u591a\u5d4c\u5957 (\\d+) \u5c42$"));
pattern("validation.rows","最多允许 {0} 个换行命令","At most {0} line breaks are allowed",new RegExp("^\u6700\u591a\u5141\u8bb8 (\\d+) \u4e2a\u6362\u884c\u547d\u4ee4$"));
pattern("validation.tabs","最多允许 {0} 个对齐分隔符","At most {0} alignment separators are allowed",new RegExp("^\u6700\u591a\u5141\u8bb8 (\\d+) \u4e2a\u5bf9\u9f50\u5206\u9694\u7b26$"));
pattern("validation.length","公式最多允许 {0} 个 UTF-16 字符","At most {0} UTF-16 code units are allowed",new RegExp("^\u516c\u5f0f\u6700\u591a\u5141\u8bb8 (\\d+) \u4e2a UTF-16 \u5b57\u7b26$"));
pattern("validation.command","不支持命令 {0}；仅接受允许列表中的数学命令","Unsupported command {0}; only allowlisted math commands are accepted",new RegExp("^\u4e0d\u652f\u6301\u547d\u4ee4 (.*?)\uff1b\u4ec5\u63a5\u53d7\u5141\u8bb8\u5217\u8868\u4e2d\u7684\u6570\u5b66\u547d\u4ee4$"));
pattern("validation.argCommand","参数中不支持命令 {0}","Unsupported command in argument: {0}",new RegExp("^\u53c2\u6570\u4e2d\u4e0d\u652f\u6301\u547d\u4ee4 (.*)$"));
pattern("validation.char","不支持字符 {0}；请使用已支持的数学命令","Unsupported character {0}; use a supported math command",new RegExp("^\u4e0d\u652f\u6301\u5b57\u7b26 (.*?)\uff1b\u8bf7\u4f7f\u7528\u5df2\u652f\u6301\u7684\u6570\u5b66\u547d\u4ee4$"));
pattern("validation.mismatch","环境不匹配：此处应结束 {0}","Environment mismatch; expected the end of {0}",new RegExp("^\u73af\u5883\u4e0d\u5339\u914d\uff1a\u6b64\u5904\u5e94\u7ed3\u675f (.*)$"));
pattern("validation.unclosed","环境 {0} 缺少 {1}","Environment {0} is missing {1}",new RegExp("^\u73af\u5883 (.*?) \u7f3a\u5c11 (.*)$"));
pattern("validation.required","{0}必须写在花括号中","Enclose {0} in braces",new RegExp("^(.*?)\u5fc5\u987b\u5199\u5728\u82b1\u62ec\u53f7\u4e2d$"));
pattern("validation.missing","{0}缺少右花括号","Missing closing brace for {0}",new RegExp("^(.*?)\u7f3a\u5c11\u53f3\u82b1\u62ec\u53f7$"));
pattern("validation.restricted","{0}不在允许范围内","{0} is outside the allowed range",new RegExp("^(.*?)\u4e0d\u5728\u5141\u8bb8\u8303\u56f4\u5185$"));
// Convert legacy compiler messages at the presentation boundary. The descriptor
// keeps original parameters, so an in-flight message can be re-rendered in either language.
export function describe(value) {
  if (typeof value !== 'string') return value;
  if (!value) return {raw:''};
  if (exact.has(value)) return {key:exact.get(value)};
  for (const {key,regex} of patterns) { const m=value.match(regex); if(m)return {key,params:Object.fromEntries(m.slice(1).map((v,i)=>[i,describe(v)]))}; }
  return {raw:value};
}
export function render(value, lang = locale) {
  const d = typeof value === 'string' ? describe(value) : value;
  if (!d) return '';
  if ('raw' in d) return d.raw;
  return t(d.key,Object.fromEntries(Object.entries(d.params||{}).map(([k,v])=>[k,typeof v==='object'?render(v,lang):v])),lang);
}
export function localizeStatic(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent=t(node.dataset.i18n);
  for (const attr of ['title','aria-label','placeholder','alt','content']) {
    for (const node of root.querySelectorAll(`[data-i18n-${attr}]`)) node.setAttribute(attr,t(node.getAttribute(`data-i18n-${attr}`)));
  }
}
