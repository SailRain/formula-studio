import {resourceURL} from './shared/resources.mjs';
import {t, render, describe, getLocale, setLocale, localizeStatic} from './shared/i18n.mjs';
import {createCompilerClient} from './shared/compiler-client.mjs';
import {validateMathInput} from './core/validate-math.mjs';
import {SourceHistory, insertSourceTemplate, nextPlaceholder, hasPlaceholder, visualCompatibilityReason} from './editor-state.mjs';
import {writeFormulaClipboard, supportsSVGClipboard} from './clipboard.mjs';
import {categories, examples} from './templates.mjs';

const $ = id => document.getElementById(id);
const client = createCompilerClient();
const history = new SourceHistory();
let source = '', mode = 'source', revision = 0, busy = false, result = null;
let field = null, fieldReady = false, programmatic = false, category = categories[0];
let MathfieldElement, validateLatex;
let copying = false;
const resultURLs = new Set();
const stages = new Map();
const translatedNodes = new Map();
function setText(node, value) {
  const descriptor = describe(value);
  translatedNodes.set(node, descriptor);
  node.textContent = render(descriptor);
}
function setLanguage(value) {
  setLocale(value); document.documentElement.lang = getLocale();
  localizeStatic();
  for (const [node, descriptor] of translatedNodes) {
    if (node.isConnected === false) { translatedNodes.delete(node); continue; }
    if (node.childNodes?.length > 1 && node.firstChild?.nodeType === 3) node.firstChild.nodeValue = render(descriptor);
    else node.textContent = render(descriptor);
  }
  for (const entry of categories) $('category-' + entry.id).textContent = t('category.' + entry.id);
  // Update existing palette nodes in place: preserve keyboard focus and selection.
  for (const [index, item] of category.items.entries()) {
    const button = $('symbol-palette').children[index];
    button.title = `${render(item.title)} · ${item.latex.replace(/#0|#\?/g, '□')}${button.disabled ? render(' · 请切换到源码模式') : ''}`;
    button.setAttribute('aria-label', render(item.title));
  }
  $('language-en').setAttribute('aria-pressed', String(getLocale() === 'en-US'));
  $('language-zh').setAttribute('aria-pressed', String(getLocale() === 'zh-CN'));
  $('license-link').href = resourceURL('licenses/third-party.html') + '?lang=' + getLocale();
  if (MathfieldElement) MathfieldElement.locale = getLocale();
  if (field) field.setAttribute('aria-label', render('可视化公式编辑器'));
  refreshStages();
}
function refreshStages() {
  $('progress-details').textContent = [...stages.values()].map(message => render(message)).join(' · ');
}


function notice(message = '') { setText($('mode-notice'), message); $('mode-notice').hidden = !message; }
function status(message, state = '') { setText($('status'), message); $('status-dot').className = `status-dot ${state}`; }
function showError(message = '') { setText($('error'), message); $('error').hidden = !message; }
function controls() {
  for (const node of translatedNodes.keys()) if (node.isConnected === false) translatedNodes.delete(node);
  $('compile').disabled = busy || !source.trim();
  $('cancel').disabled = !busy;
  $('undo').disabled = !history.canUndo;
  $('redo').disabled = !history.canRedo;
  setText($('character-count'), `${source.length.toLocaleString('en-US')} / 10,000`);
  for (const type of ['png','svg','pdf']) $('download-' + type).disabled = !result || result.revision !== revision || busy;
  for (const type of ['png','svg']) $('copy-' + type).disabled = !result || result.revision !== revision || busy || copying;
}
function copyFeedback(message = '') { setText($('copy-status'), message); $('copy-status').hidden = !message; }
function stopWork() { copyFeedback(); revision++; client.cancel(); busy = false; stages.clear(); $('progress-details').hidden = true; }
function invalidate(message = '内容已修改，请更新准确预览。') {
  stopWork(); showError(); setText($('elapsed'), '');
  if (result) { $('preview').classList.add('stale'); $('stale-badge').hidden = false; $('result-details').hidden = true; }
  status(message); controls();
}
function commit(next, {record = true} = {}) {
  if (next === source) return;
  source = next;
  if (record) history.record(next);
  invalidate();
}
function updateMode(next) {
  mode = next;
  $('visual-pane').hidden = next !== 'visual';
  $('source-pane').hidden = next !== 'source';
  $('mode-visual').setAttribute('aria-pressed', String(next === 'visual'));
  $('mode-source').setAttribute('aria-pressed', String(next === 'source'));
  setText($('input-caption'), next === 'visual'
    ? '可视化仅用于输入；最终字体以下方准确预览为准。'
    : '源码按原文保留并编译；模板的 □ 待填位置不会进入导出。');
  renderPalette();
}
function sourceMode(message = '', focus = true) {
  $('latex-source').value = source;
  updateMode('source'); notice(message);
  if (focus) $('latex-source').focus();
}
function tryVisual(raw, {internal = false} = {}) {
  if (!fieldReady) return '可视化编辑器尚未就绪；可以继续使用源码编辑。';
  const reason = visualCompatibilityReason(raw);
  if (reason) return reason;
  // Only application-created history may contain MathLive's own empty slots.
  // Arbitrary source is checked unchanged before reaching its parser.
  const checkedSource = internal ? raw.replace(/\\placeholder\{\}/g, '0') : raw;
  if (checkedSource.trim()) {
    const validation = validateMathInput(checkedSource);
    if (!validation.ok) return `源码已保留：${validation.error.message}`;
  }
  try {
    if (validateLatex(raw).length) return '这段源码不在可视化编辑器支持的范围内，原文已保留。';
    programmatic = true;
    field.setValue(raw, {format:'latex', mode:'math', silenceNotifications:true, selectionMode:'after', feedback:false});
    if (field.errors.length || field.getValue('latex') !== raw) return '此公式不能逐字无损切换为可视化编辑，已完整保留源码。';
    field.resetUndo();
    return '';
  } catch { return '可视化编辑器无法保真解析这段源码，原文已保留。'; }
  finally { programmatic = false; }
}
function visualMode({focus = true, internal = false} = {}) {
  const reason = tryVisual(source, {internal});
  if (reason) { sourceMode(reason, focus); return false; }
  updateMode('visual'); notice();
  if (focus) field.focus();
  return true;
}

function renderPalette() {
  const palette = $('symbol-palette'); palette.replaceChildren();
  palette.setAttribute('aria-labelledby', 'category-' + category.id);
  for (const item of category.items) {
    const button = document.createElement('button');
    button.className = `symbol-button${item.sourceOnly ? ' source-only' : ''}`; setText(button, item.label);
    button.title = `${render(item.title)} · ${item.latex.replace(/#0|#\?/g, '□')}`;
    button.setAttribute('aria-label', render(item.title));
    button.disabled = mode === 'visual' && item.sourceOnly;
    if (button.disabled) button.title += render(' · 请切换到源码模式');
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', () => insertTemplate(item));
    palette.append(button);
  }
  if (mode === 'visual' && category.items.some(item => item.sourceOnly)) {
    const hint = document.createElement('span'); hint.className = 'palette-note';
    setText(hint, '虚线项请切到源码插入'); palette.append(hint);
  }
}
function renderTabs() {
  const tabs = $('category-tabs');
  for (const entry of categories) {
    const button = document.createElement('button');
    button.id = 'category-' + entry.id; setText(button, {key:'category.' + entry.id});
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'symbol-palette');
    button.setAttribute('aria-selected', String(entry === category)); button.tabIndex = entry === category ? 0 : -1;
    button.addEventListener('click', () => {
      category = entry;
      for (const tab of tabs.children) { const selected = tab === button; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; }
      renderPalette();
    });
    button.addEventListener('keydown', event => {
      const index = categories.indexOf(entry);
      const next = event.key === 'ArrowRight' ? (index + 1) % categories.length : event.key === 'ArrowLeft' ? (index + categories.length - 1) % categories.length : event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); tabs.children[next].click(); tabs.children[next].focus();
    });
    tabs.append(button);
  }
  renderPalette();
}
function insertTemplate(item) {
  if (mode === 'visual') {
    if (!fieldReady || item.sourceOnly) return;
    // MathLive's built-in #0 reads latex-unstyled. Use the public styled
    // selection serializer so wrapping a selected term keeps its style.
    const selected = field.getValue(field.selection, 'latex');
    const template = item.latex.replace(/#0/g, () => selected || '#?');
    field.insert(template, {format:'latex', mode:'math', insertionMode:'replaceSelection', selectionMode:'placeholder', focus:true, feedback:false});
    commit(field.getValue('latex'));
  } else {
    const area = $('latex-source');
    const inserted = insertSourceTemplate(source, area.selectionStart, area.selectionEnd, item.latex);
    commit(inserted.value); area.value = source; area.focus(); area.setSelectionRange(inserted.start, inserted.end);
  }
}

function bindSource(area) {
  area.addEventListener('input', () => { commit(area.value); notice(); });
  area.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
    const position = nextPlaceholder(source, area.selectionStart, area.selectionEnd, event.shiftKey);
    if (position === null) return;
    event.preventDefault(); area.setSelectionRange(position, position + (source.startsWith('\\placeholder{}', position) ? 14 : 1));
  });
}
function restoreHistory(direction) {
  if (direction === 'undo' ? !history.canUndo : !history.canRedo) return;
  commit(history[direction](), {record:false});
  if (mode === 'visual') visualMode({internal:true});
  else { $('latex-source').value = source; $('latex-source').focus(); }
  controls();
}
function releaseResult() {
  copyFeedback();
  $('preview-image').removeAttribute('src'); $('preview-image').hidden = true;
  for (const url of resultURLs) URL.revokeObjectURL(url);
  resultURLs.clear(); result = null;
  $('preview-empty').hidden = false; $('preview').classList.remove('stale'); $('stale-badge').hidden = true;
  $('result-details').hidden = true; $('warnings').replaceChildren(); setText($('result-info'), '');
  setText($('dimensions'), '导出尺寸会在排版完成后显示。');
  const hint = document.createElement('span'); setText(hint, '预览缩放不会改变导出大小。'); $('dimensions').append(hint);
}
function clear() {
  stopWork(); client.clear(); source = ''; history.reset(); releaseResult(); showError(); notice();
  setText($('elapsed'), ''); $('progress-details').replaceChildren();
  if (fieldReady) { programmatic = true; field.setValue('', {silenceNotifications:true}); field.resetUndo(); programmatic = false; }
  // Replacing the textarea also discards its browser-native undo buffer.
  const oldArea = $('latex-source'), area = oldArea.cloneNode(false); area.value = ''; oldArea.replaceWith(area); bindSource(area);
  $('examples').value = '';
  status('已清空公式、结果与撤销历史。'); controls();
  if (mode === 'visual' && fieldReady) field.focus(); else area.focus();
}
function options() { return {sizePt:Number($('size').value), dpi:Number($('dpi').value), background:$('background').value}; }
function previewScale() {
  $('preview').classList.toggle('transparent-grid', $('background').value === 'transparent');
  if (result) $('preview-image').style.width = `${result.widthPt * 96 / 72 * Number($('zoom').value)}px`;
}
function makeURL(bytes, type) { const url = URL.createObjectURL(new Blob([bytes], {type})); resultURLs.add(url); return url; }
function showResult(output, id, config) {
  const bounds = output.report.boundsPt;
  const widthPt = bounds[2] - bounds[0], heightPt = bounds[3] - bounds[1];
  const png = output.png.find(item => item.dpi === config.dpi);
  if (!png || !(widthPt > 0) || !(heightPt > 0)) throw new Error('导出结果尺寸无效，请重新排版。');
  releaseResult();
  result = {...output, revision:id, config, widthPt, urls:{pdf:makeURL(output.pdf, 'application/pdf'), svg:makeURL(output.svg, 'image/svg+xml'), png:makeURL(png.bytes, 'image/png')}};
  $('preview-image').src = result.urls.svg; $('preview-image').hidden = false; $('preview-empty').hidden = true;
  previewScale();
  const physical = `${(widthPt * 25.4 / 72).toFixed(2)} × ${(heightPt * 25.4 / 72).toFixed(2)} mm`;
  setText($('dimensions'), `${physical} · ${png.metadata.width} × ${png.metadata.height} px`);
  const hint = document.createElement('span'); setText(hint, `${config.sizePt} pt 排版 · PNG ${config.dpi} dpi · 预览缩放不影响导出`); $('dimensions').append(hint);
  const warnings = output.report.warnings || [];
  for (const warning of warnings) { const li = document.createElement('li'); setText(li, warning); $('warnings').append(li); }
  $('warnings').hidden = !warnings.length;
  setText($('result-info'), `SVG 使用字形轮廓，无需接收设备安装字体；PDF 为矢量文档。PNG 背景：${config.background === 'white' ? '白色' : '透明'}。本次排版、裁切与三个导出使用同一结果。`);
  $('result-details').hidden = false; $('result-details').open = warnings.length > 0;
  setText($('elapsed'), `${(output.report.totalMs / 1000).toFixed(1)} 秒`);
  status(warnings.length ? '预览与三个导出已更新；PDF 文字复制说明见下方。' : '准确预览与三个导出已更新。', warnings.length ? 'warning' : 'success');
}
async function compile() {
  if (busy || !source.trim()) return;
  if (hasPlaceholder(source)) { showError('请先填完模板中的所有待填位置，再更新准确预览。'); return; }
  const validation = validateMathInput(source);
  if (!validation.ok) {
    showError(validation.error.message);
    if (mode === 'source') { $('latex-source').focus(); $('latex-source').setSelectionRange(validation.error.index, validation.error.index + 1); }
    return;
  }
  invalidate('正在准备浏览器排版…');
  const id = revision, config = options(), snapshot = source;
  busy = true; controls(); status('正在准备浏览器排版…', 'busy');
  try {
    const output = await client.compile(snapshot, config, progress => {
      if (id !== revision) return;
      status(progress.message, 'busy');
      if (progress.phase !== 'loading') { stages.clear(); $('progress-details').hidden = true; }
      else {
        stages.set(progress.engine || '组件', progress.message);
        refreshStages();
        $('progress-details').hidden = false;
      }
    });
    if (id !== revision) return;
    showResult(output, id, config);
  } catch (error) {
    if (id !== revision) return;
    if (error.name === 'AbortError') status('本次排版已取消。');
    else { status('排版未完成，请检查提示后重试。', 'error'); showError(error.message || '排版失败，请重试。'); }
  } finally {
    if (id === revision) { busy = false; stages.clear(); $('progress-details').hidden = true; controls(); }
  }
}
function download(type) {
  if (!result || result.revision !== revision || busy) return;
  const anchor = document.createElement('a'); anchor.href = result.urls[type];
  anchor.download = `formula-${result.config.sizePt}pt${type === 'png' ? '-' + result.config.dpi + 'dpi' : ''}.${type}`;
  document.body.append(anchor); anchor.click(); anchor.remove();
}

async function copy(type) {
  if (!result || result.revision !== revision || busy || copying) return;
  const snapshot = result, id = revision;
  let copyTimer;
  copying = true; controls(); copyFeedback('正在复制…');
  try {
    // Start the browser write in this click's activation, using bytes already in memory.
    const {completion, kind} = writeFormulaClipboard(snapshot, type);
    await Promise.race([completion, new Promise((_, reject) => { copyTimer = setTimeout(() => reject(Object.assign(new Error('Clipboard timeout'), {name:'TimeoutError'})), 10000); })]);
    if (id !== revision || result !== snapshot) return;
    copyFeedback(kind === 'png' ? 'PNG 图片已复制，可直接粘贴到支持图片的应用。'
      : kind === 'svg' ? 'SVG 已复制（含矢量内容和源码）；粘贴效果取决于目标应用。'
      : 'SVG 源码已复制；此浏览器不支持复制 SVG 图片。需要图片时请复制 PNG，或下载 SVG。');
  } catch (error) {
    if (id !== revision || result !== snapshot) return;
    copyFeedback(error.name === 'TimeoutError'
      ? '浏览器尚未完成复制；请保持页面在前台后重试，或使用下载按钮。'
      : error.name === 'NotAllowedError'
      ? '未能复制：请允许此网站写入剪贴板，再点击复制；也可以使用旁边的下载按钮。'
      : '此浏览器未能复制该格式，请使用旁边的下载按钮。');
  } finally { clearTimeout(copyTimer); copying = false; controls(); }
}

async function initializeVisual() {
  try {
    ({MathfieldElement, validateLatex} = await import(resourceURL('editor-vendor/mathlive-0.111.1/mathlive.min.mjs')));
    MathfieldElement.fontsDirectory = resourceURL('editor-vendor/mathlive-0.111.1/fonts');
    MathfieldElement.soundsDirectory = null; MathfieldElement.computeEngine = null;
    MathfieldElement.speakHook = () => {}; MathfieldElement.readAloudHook = () => {}; MathfieldElement.openUrl = () => {};
    MathfieldElement.locale = getLocale();
    field = new MathfieldElement(); field.setAttribute('aria-label', render('可视化公式编辑器'));
    field.mathVirtualKeyboardPolicy = 'manual'; field.smartMode = false; field.smartFence = false;
    field.smartSuperscript = false; field.removeExtraneousParentheses = false;
    field.letterShapeStyle = 'iso'; field.defaultMode = 'math';
    field.addEventListener('input', () => { if (!programmatic) { commit(field.getValue('latex')); notice(); } });
    field.addEventListener('paste', event => {
      const text = event.clipboardData?.getData('text/plain') || '';
      if (text.includes('\\')) {
        event.preventDefault(); event.stopImmediatePropagation();
        notice('为完整保留 LaTeX 原文，请切换到“源码”后粘贴。当前公式未改变。');
      }
    }, true);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('编辑器加载超时')), 15000);
      field.addEventListener('mount', () => { clearTimeout(timer); resolve(); }, {once:true});
      $('mathfield-host').append(field);
    });
    field.inlineShortcuts = {}; field.menuItems = [];
    fieldReady = true; $('visual-loading').hidden = true;
    if (mode === 'visual') visualMode({focus:false});
  } catch (error) {
    console.error('[editor:init]', error);
    $('visual-loading').hidden = true;
    sourceMode('可视化组件未能加载，源码编辑和准确排版仍可使用。', false);
  }
}

renderTabs(); bindSource($('latex-source'));
$('mode-source').addEventListener('click', () => sourceMode());
$('mode-visual').addEventListener('click', () => { if (mode !== 'visual') visualMode(); });
$('undo').addEventListener('click', () => restoreHistory('undo'));
$('redo').addEventListener('click', () => restoreHistory('redo'));
$('clear').addEventListener('click', clear);
$('cancel').addEventListener('click', () => { invalidate('本次排版已取消。'); });
$('compile').addEventListener('click', compile);
$('examples').addEventListener('change', event => {
  const next = examples[event.target.value]; event.target.value = ''; if (!next) return;
  commit(next);
  if (mode === 'visual') visualMode(); else { $('latex-source').value = source; $('latex-source').focus(); notice(); }
});
for (const name of ['size','dpi','background']) $(name).addEventListener('change', () => { invalidate('导出设置已改变，请更新准确预览。'); previewScale(); });
$('zoom').addEventListener('change', previewScale);
for (const type of ['png','svg','pdf']) $('download-' + type).addEventListener('click', () => download(type));
for (const type of ['png','svg']) $('copy-' + type).addEventListener('click', () => copy(type));
setText($('copy-svg'), supportsSVGClipboard() ? '复制 SVG' : '复制 SVG 源码');
updateMode('source');
document.querySelector('[data-editor-zone]').addEventListener('keydown', event => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
  if (event.key === 'Enter') { event.preventDefault(); compile(); return; }
  if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.stopPropagation(); restoreHistory(event.shiftKey ? 'redo' : 'undo'); }
  else if (event.ctrlKey && event.key.toLowerCase() === 'y') { event.preventDefault(); event.stopPropagation(); restoreHistory('redo'); }
}, true);
window.addEventListener('pagehide', () => { stopWork(); releaseResult(); history.reset(); source = ''; if (fieldReady) { field.setValue('', {silenceNotifications:true}); field.resetUndo(); } $('latex-source').value = ''; });
window.addEventListener('pageshow', event => { if (event.persisted) { clear(); setLanguage('en-US'); } });
$('language-en').addEventListener('click', () => setLanguage('en-US'));
$('language-zh').addEventListener('click', () => setLanguage('zh-CN'));
status('输入公式后，点击“更新准确预览”。');
setLanguage('en-US');
controls(); initializeVisual();
