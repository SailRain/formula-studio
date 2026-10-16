export function supportsSVGClipboard(Item = globalThis.ClipboardItem) {
  return Boolean(Item?.supports?.('image/svg+xml'));
}

// Deliberately synchronous up to write(): Safari requires the click activation.
// No fetch, rendering, conversion or clipboard read takes place here.
export function writeFormulaClipboard(result, type, env = globalThis) {
  const clipboard = env.navigator?.clipboard, Item = env.ClipboardItem;
  if (!clipboard) throw new Error('Clipboard unavailable');
  if (type === 'png') {
    const png = result.png.find(item => item.dpi === result.config.dpi);
    if (!png || !Item || !clipboard.write) throw new Error('PNG clipboard unavailable');
    return {kind:'png', completion:clipboard.write([new Item({'image/png':new Blob([png.bytes], {type:'image/png'})})])};
  }
  if (type !== 'svg') throw new Error('Unsupported clipboard format');
  if (clipboard.write && supportsSVGClipboard(Item)) {
    return {kind:'svg', completion:clipboard.write([new Item({
      'image/svg+xml':new Blob([result.svg], {type:'image/svg+xml'}),
      'text/plain':new Blob([result.svg], {type:'text/plain'}),
    })])};
  }
  if (!clipboard.writeText) throw new Error('Text clipboard unavailable');
  return {kind:'svg-source', completion:clipboard.writeText(result.svg)};
}
