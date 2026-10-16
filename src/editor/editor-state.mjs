// These helpers never normalize or serialize the user's source.
export class SourceHistory {
  constructor(limit = 120) { this.limit = limit; this.reset(); }
  reset() { this.values = ['']; this.index = 0; }
  record(value) {
    if (value === this.values[this.index]) return;
    this.values.splice(this.index + 1);
    this.values.push(value);
    if (this.values.length > this.limit) this.values.shift();
    this.index = this.values.length - 1;
  }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.values.length - 1; }
  undo() { if (this.canUndo) this.index--; return this.values[this.index]; }
  redo() { if (this.canRedo) this.index++; return this.values[this.index]; }
}

export function insertSourceTemplate(source, start, end, template) {
  const selection = source.slice(start, end);
  let inserted = template.replace(/#0|#\?/g, token => token === '#0' ? selection || '□' : '□');
  if (/\\[A-Za-z]+$/.test(inserted) && /^[\p{L}\p{M}]/u.test(source.slice(end))) inserted += ' ';
  const value = source.slice(0, start) + inserted + source.slice(end);
  const hole = inserted.indexOf('□');
  return { value, start: start + (hole < 0 ? inserted.length : hole), end: start + (hole < 0 ? inserted.length : hole + 1) };
}

export function nextPlaceholder(source, start, end, backwards = false) {
  const positions = Array.from(source.matchAll(/□|\\placeholder\{\}/g), match => match.index);
  if (!positions.length) return null;
  return backwards
    ? positions.filter(position => position < start).at(-1) ?? positions.at(-1)
    : positions.find(position => position >= end) ?? positions[0];
}

export function hasPlaceholder(source) { return /□|\\placeholder\b/.test(source); }

// A successful string roundtrip alone does not establish macro semantics.
export function visualCompatibilityReason(source) {
  const commands = [...source.matchAll(/\\([A-Za-z]+)/g)].map(match => match[1]);
  const sourceOnly = commands.find(command => /^sym/.test(command) || ['varTheta', 'boldsymbol', 'bm', 'bold', 'mat', 'vect', 'eu', 'upmu', 'piup'].includes(command));
  if (sourceOnly) return `\\${sourceOnly} 的可视化语义尚未与本工具核对，请使用源码模式。`;
  const styled = commands.some(command => ['mathrm', 'mathit', 'mathbf'].includes(command));
  const greek = /[\u0370-\u03ff\u{1d400}-\u{1d7ff}]/u.test(source) || commands.some(command => /^(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|varkappa|lambda|mu|nu|xi|omicron|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)$/.test(command));
  return styled && greek ? '含希腊字母的文字数学样式请保留源码，确保样式语义不被改写。' : '';
}
