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
  const sourceOnly = commands.find(command => (/^sym/.test(command) && !['symbfit','symit'].includes(command)) || ['varTheta', 'boldsymbol', 'bm', 'bold', 'mat', 'vect', 'eu', 'upmu', 'piup'].includes(command));
  if (sourceOnly) return `\\${sourceOnly} 的可视化语义尚未与本工具核对，请使用源码模式。`;
  // The style adapter verifies these three text-math families, symit and symbfit.
  // Other unicode-math macros above still require source mode; the caller
  // additionally requires exact serialization and successful admission.
  return '';
}
