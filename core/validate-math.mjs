// A deliberately finite math-input language for the fixed, trusted wrapper.
// This is an admission check, not a TeX interpreter or a complete sandbox.
// No normalization, macro expansion, deletion, or replacement is performed.

export const DEFAULT_LIMITS = Object.freeze({
  maxLength: 10000, maxTokens: 6000, maxBraceDepth: 48,
  maxEnvironmentDepth: 12, maxNesting: 64, maxRows: 100, maxAlignmentTabs: 400,
});

const words = value => new Set(value.trim().split(/\s+/));
const SYMBOLS = words(`
  alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa
  varkappa lambda mu nu xi omicron pi varpi rho varrho sigma varsigma tau
  upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma
  Upsilon Phi Psi Omega varTheta
  partial nabla infty ell hbar imath jmath Re Im wp aleph beth gimel daleth
  emptyset varnothing top bot angle triangle square Box Diamond
  pm mp times div cdot ast star circ bullet cap cup uplus sqcap sqcup
  vee wedge setminus wr diamond bigtriangleup bigtriangledown triangleleft
  triangleright oplus ominus otimes oslash odot bigcirc amalg
  le leq ge geq neq ne equiv sim simeq approx cong asymp propto ll gg
  prec succ preceq succeq subset supset subseteq supseteq sqsubseteq sqsupseteq
  in ni notin owns parallel nparallel perp mid nmid vdash dashv models
  doteq bowtie smile frown therefore because coloneq coloneqq
  to gets leftarrow rightarrow leftrightarrow Leftarrow Rightarrow Leftrightarrow
  longleftarrow longrightarrow longleftrightarrow Longleftarrow Longrightarrow
  Longleftrightarrow mapsto longmapsto hookleftarrow hookrightarrow
  leftharpoonup leftharpoondown rightharpoonup rightharpoondown rightleftharpoons
  uparrow downarrow updownarrow Uparrow Downarrow Updownarrow nearrow searrow
  swarrow nwarrow implies impliedby iff
  forall exists nexists neg land lor lnot
  sum prod coprod int iint iiint iiiint oint bigcap bigcup bigvee bigwedge
  biguplus bigodot bigoplus bigotimes bigsqcup
  sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh coth
  log ln lg exp lim limsup liminf max min sup inf det dim gcd hom ker Pr arg
  deg mod bmod
  ldots cdots vdots ddots dots dotsc dotsb dotsm dotsi dotso
  lbrace rbrace langle rangle lvert rvert lVert rVert vert Vert backslash
  lfloor rfloor lceil rceil surd prime doubleprime tripleprime
  eu upmu piup
`);
const MODIFIERS = words(`displaystyle textstyle scriptstyle scriptscriptstyle
  limits nolimits displaylimits not quad qquad enspace thinspace medspace negthinspace`);
const MATH_UNARY = words(`
  mathrm mathit mathbf mathsf mathtt mathnormal mathcal mathbb mathfrak mathscr
  symup symit symbf symbfup symbfit symcal symbfcal symscr symbfscr symbb
  symfrak symbffrak symsf symsfup symsfit symbfsf symbfsfup symbfsfit symtt
  boldsymbol mat vect
  hat widehat check widecheck tilde widetilde acute grave dot ddot dddot ddddot
  bar breve vec overline underline overbrace underbrace
  overrightarrow overleftarrow overleftrightarrow underrightarrow underleftarrow
  underleftrightarrow overgroup undergroup overparen underparen
  mathord mathop mathbin mathrel mathopen mathclose mathpunct mathinner
  phantom hphantom vphantom smash
  pmod pod
`);
const MATH_BINARY = words('frac dfrac tfrac binom dbinom tbinom overset underset stackrel');
const TEXT_UNARY = words('text textrm textnormal textbf textit textsf texttt textsc emph');
const TEXT_SYMBOLS = words('textbackslash textasciicircum textasciitilde textless textgreater textbar textbraceleft textbraceright');
const DELIMITERS = words('lbrace rbrace langle rangle lvert rvert lVert rVert vert Vert lfloor rfloor lceil rceil backslash uparrow downarrow updownarrow Uparrow Downarrow Updownarrow');
const BIG_DELIMITERS = words('big Big bigg Bigg bigl bigr bigm Bigl Bigr Bigm biggl biggr biggm Biggl Biggr Biggm');
const ESCAPED_CHARACTERS = new Set(['{', '}', '%', '#', '$', '&', '_', ' ', ',', ';', ':', '!']);
const TEXT_ESCAPED = new Set(['{', '}', '%', '#', '$', '&', '_', ' ']);
const ENVIRONMENTS = Object.freeze({
  aligned: { position: true }, alignedat: { position: true, pairs: true },
  gathered: { position: true, noTabs: true }, cases: {}, matrix: {}, pmatrix: {},
  bmatrix: {}, Bmatrix: {}, vmatrix: {}, Vmatrix: {}, smallmatrix: {},
  array: { columns: true },
});
const ASCII_LITERAL = /^[A-Za-z0-9+\-*/=<>(),.;:!?|'"`\[\]]$/;
const TEXT_LITERAL = /^[\p{L}\p{N}\p{M}\p{P}\p{S}]$/u;
const SPACE = /^[ \t\r\n]$/;
const LETTER = /^[A-Za-z]$/;
const MODE = Object.freeze({ math: 'math', text: 'text' });

function isMathUnicode(code) {
  return (code >= 0x0370 && code <= 0x03ff) || (code >= 0x1f00 && code <= 0x1fff)
    || (code >= 0x2190 && code <= 0x22ff) || (code >= 0x27c0 && code <= 0x27ef)
    || (code >= 0x2980 && code <= 0x2aff) || (code >= 0x1d400 && code <= 0x1d7ff)
    || [0x00b1, 0x00b7, 0x00d7, 0x00f7, 0x00b0].includes(code);
}

export class MathInputError extends Error {
  constructor(code, message, index, source) {
    const before = source.slice(0, index);
    const line = before.split('\n').length;
    const column = Array.from(before.slice(before.lastIndexOf('\n') + 1)).length + 1;
    super(`${message}（第 ${line} 行，第 ${column} 列）`);
    this.name = 'MathInputError'; this.code = code;
    this.index = index; this.line = line; this.column = column;
  }
}

class Parser {
  constructor(source, limits) {
    this.source = source; this.limits = limits; this.i = 0; this.tokens = 0;
    this.braceDepth = 0; this.environmentDepth = 0; this.rows = 0; this.tabs = 0;
    this.maxBraceDepth = 0; this.maxEnvironmentDepth = 0; this.commandCount = 0;
    this.nesting = 0; this.maxNesting = 0;
  }
  fail(code, message, index = this.i) { throw new MathInputError(code, message, index, this.source); }
  peek() { return this.source[this.i]; }
  space() { while (this.i < this.source.length && SPACE.test(this.peek())) this.i++; }
  tick() { if (++this.tokens > this.limits.maxTokens) this.fail('TOKEN_LIMIT', `公式结构过多，最多允许 ${this.limits.maxTokens} 个词法单元`); }
  enter(start) {
    if (++this.nesting > this.limits.maxNesting) this.fail('NESTING_LIMIT', `整体结构最多嵌套 ${this.limits.maxNesting} 层`, start);
    this.maxNesting = Math.max(this.maxNesting, this.nesting);
  }
  command() {
    const start = this.i++;
    if (this.i >= this.source.length) this.fail('TRAILING_ESCAPE', '反斜线后缺少命令或可转义字符', start);
    let name = '';
    if (LETTER.test(this.peek())) {
      while (this.i < this.source.length && LETTER.test(this.peek())) name += this.source[this.i++];
      // A Unicode letter directly after an ASCII control word may have a
      // different catcode in the fixed TeX format. Never guess its boundary.
      const next = String.fromCodePoint(this.source.codePointAt(this.i) || 0);
      if (/^[\p{L}\p{M}]$/u.test(next) && !LETTER.test(next))
        this.fail('AMBIGUOUS_COMMAND', '命令后请用空格或花括号分隔 Unicode 字母', this.i);
    } else name = this.source[this.i++];
    this.tick(); this.commandCount++;
    return { name, start };
  }
  environmentName() {
    this.space();
    const start = this.i;
    if (this.peek() !== '{') this.fail('ENVIRONMENT_NAME', '环境名称必须直接写在花括号中');
    const end = this.source.indexOf('}', this.i + 1);
    if (end < 0) this.fail('ENVIRONMENT_NAME', '环境名称缺少右花括号');
    const name = this.source.slice(this.i + 1, end);
    if (!/^[A-Za-z]+$/.test(name) || !Object.hasOwn(ENVIRONMENTS, name))
      this.fail('ENVIRONMENT_NOT_ALLOWED', '仅支持 aligned、alignedat、gathered、cases、matrix 类和受限 array 环境', start);
    this.i = end + 1; return name;
  }
  simpleArgument(pattern, description, max) {
    this.space(); const start = this.i;
    if (this.peek() !== '{') this.fail('ARGUMENT_REQUIRED', `${description}必须写在花括号中`);
    const end = this.source.indexOf('}', this.i + 1);
    if (end < 0) this.fail('UNCLOSED_GROUP', `${description}缺少右花括号`);
    const value = this.source.slice(this.i + 1, end);
    if (!pattern.test(value) || (max && Number(value) > max)) this.fail('RESTRICTED_ARGUMENT', `${description}不在允许范围内`, start);
    this.i = end + 1;
  }
  group(mode, context) {
    const start = this.i++;
    this.tick(); this.enter(start);
    if (++this.braceDepth > this.limits.maxBraceDepth) this.fail('BRACE_DEPTH', `花括号最多嵌套 ${this.limits.maxBraceDepth} 层`, start);
    this.maxBraceDepth = Math.max(this.maxBraceDepth, this.braceDepth);
    this.sequence(mode, context, { char: '}', start });
    this.braceDepth--; this.nesting--;
  }
  atom(mode, context, { braced = false } = {}) {
    this.space();
    if (this.peek() === '{') { this.group(mode, context); return; }
    if (braced) this.fail('ARGUMENT_REQUIRED', '此命令的参数必须写在花括号中');
    if (this.i >= this.source.length || /[}\]^_&]/.test(this.peek())) this.fail('ARGUMENT_REQUIRED', '命令或上下标后缺少参数');
    if (this.peek() === '\\') {
      const { name, start } = this.command();
      if (mode === MODE.math && SYMBOLS.has(name)) return;
      if ((mode === MODE.math ? ESCAPED_CHARACTERS : TEXT_ESCAPED).has(name)) return;
      if (MATH_UNARY.has(name) || MATH_BINARY.has(name) || TEXT_UNARY.has(name)
        || ['sqrt', 'substack', 'operatorname', 'left'].includes(name))
        this.fail('ARGUMENT_GROUP_REQUIRED', '这个复合命令不能直接作为单个参数，请用花括号包住完整表达式', start);
      this.fail('COMMAND_NOT_ALLOWED', `参数中不支持命令 \\${name}`, start);
    }
    this.literal(mode);
  }
  delimiter() {
    this.space();
    if (this.peek() === '\\') {
      const { name, start } = this.command();
      if (DELIMITERS.has(name) || name === '{' || name === '}') return;
      this.fail('DELIMITER', '此处需要允许的定界符，如 (、[、\\{ 或 \\langle', start);
    }
    if (!this.peek() || !'()[]|./<>'.includes(this.peek())) this.fail('DELIMITER', '此处需要允许的定界符');
    this.tick(); this.i++;
  }
  literal(mode) {
    const start = this.i, code = this.source.codePointAt(this.i);
    const char = String.fromCodePoint(code);
    if (mode === MODE.text && ['^', '_', '&'].includes(char)) this.fail('TEXT_SPECIAL', '文本中的特殊字符必须使用相应转义命令', start);
    if (!(mode === MODE.math ? ASCII_LITERAL.test(char) || isMathUnicode(code) : TEXT_LITERAL.test(char)))
      this.fail('CHARACTER_NOT_ALLOWED', `不支持字符 U+${code.toString(16).toUpperCase().padStart(4, '0')}；请使用已支持的数学命令`, start);
    this.tick(); this.i += char.length;
  }
  row(context, start) {
    if (!context.rows) this.fail('ROW_OUTSIDE_ALIGNMENT', '换行命令只能用于矩阵、对齐环境或 \\substack 内', start);
    if (++this.rows > this.limits.maxRows) this.fail('ROW_LIMIT', `最多允许 ${this.limits.maxRows} 个换行命令`, start);
    this.space();
    if (this.peek() === '[' || this.peek() === '*') this.fail('ROW_OPTION', '当前不支持换行后的可选间距或星号参数');
  }
  beginEnvironment(mode, context, start) {
    if (mode !== MODE.math) this.fail('ENVIRONMENT_IN_TEXT', '文本参数中不能开始数学环境', start);
    const name = this.environmentName(), spec = ENVIRONMENTS[name];
    this.enter(start);
    if (++this.environmentDepth > this.limits.maxEnvironmentDepth) this.fail('ENVIRONMENT_DEPTH', `环境最多嵌套 ${this.limits.maxEnvironmentDepth} 层`, start);
    this.maxEnvironmentDepth = Math.max(this.maxEnvironmentDepth, this.environmentDepth);
    this.space();
    if (this.peek() === '[') {
      if (!spec.position || !/^\[[tcb]\]/.test(this.source.slice(this.i))) this.fail('ENVIRONMENT_OPTION', '此环境仅允许 [t]、[c] 或 [b] 位置参数');
      this.i += 3;
    }
    if (spec.pairs) this.simpleArgument(/^[1-9][0-9]?$/, 'alignedat 对齐列对数（1–20）', 20);
    if (spec.columns) this.simpleArgument(/^[lcr|]{1,32}$/, 'array 列格式（仅 l、c、r、|，最多 32 字符）');
    this.sequence(mode, { ...context, rows: true, tabs: !spec.noTabs }, { environment: name, start });
    this.environmentDepth--; this.nesting--;
  }
  sequence(mode, context, stop = {}) {
    const left = [];
    while (this.i < this.source.length) {
      const char = this.peek();
      if (SPACE.test(char)) { this.space(); continue; }
      if (char === stop.char) {
        if (left.length) this.fail('UNCLOSED_LEFT', '\\left 缺少同层的 \\right', left.at(-1));
        this.tick(); this.i++; return;
      }
      if (char === '}') this.fail('UNEXPECTED_GROUP_END', '多余的右花括号，不能关闭公式包装');
      if (char === '{') { this.group(mode, context); continue; }
      if (mode === MODE.math && (char === '^' || char === '_')) {
        this.tick(); this.i++; this.atom(mode, context); continue;
      }
      if (mode === MODE.math && char === '&') {
        if (!context.tabs) this.fail('ALIGNMENT_OUTSIDE_ENVIRONMENT', '& 只能出现在允许的对齐环境中');
        if (++this.tabs > this.limits.maxAlignmentTabs) this.fail('ALIGNMENT_LIMIT', `最多允许 ${this.limits.maxAlignmentTabs} 个对齐分隔符`);
        this.tick(); this.i++; continue;
      }
      if (char !== '\\') { this.literal(mode); continue; }
      const { name, start } = this.command();
      if (name === 'end') {
        if (!stop.environment) this.fail('UNEXPECTED_ENVIRONMENT_END', '\\end 不能出现在环境外，或跨越未关闭的花括号', start);
        const ended = this.environmentName();
        if (ended !== stop.environment) this.fail('ENVIRONMENT_MISMATCH', `环境不匹配：此处应结束 ${stop.environment}`, start);
        if (left.length) this.fail('UNCLOSED_LEFT', '\\left 缺少同层的 \\right', left.at(-1));
        return;
      }
      if (name === 'begin') { this.beginEnvironment(mode, context, start); continue; }
      if ((mode === MODE.math ? ESCAPED_CHARACTERS : TEXT_ESCAPED).has(name)) continue;
      if (mode === MODE.text) {
        if (TEXT_UNARY.has(name)) { this.atom(MODE.text, { rows: false, tabs: false }, { braced: true }); continue; }
        if (TEXT_SYMBOLS.has(name)) continue;
        this.fail('TEXT_COMMAND_NOT_ALLOWED', '文本中仅支持文本样式命令和常见字符转义', start);
      }
      if (name === '\\') { this.row(context, start); continue; }
      if (SYMBOLS.has(name) || MODIFIERS.has(name)) continue;
      if (MATH_UNARY.has(name)) { this.atom(mode, context); continue; }
      if (MATH_BINARY.has(name)) { this.atom(mode, context); this.atom(mode, context); continue; }
      if (TEXT_UNARY.has(name)) { this.atom(MODE.text, { rows: false, tabs: false }, { braced: true }); continue; }
      if (name === 'operatorname') {
        this.space(); if (this.peek() === '*') this.i++;
        this.atom(MODE.text, { rows: false, tabs: false }, { braced: true }); continue;
      }
      if (name === 'substack') { this.atom(mode, { rows: true, tabs: false }, { braced: true }); continue; }
      if (name === 'sqrt') {
        this.space();
        if (this.peek() === '[') {
          const indexStart = this.i++;
          this.enter(indexStart);
          this.sequence(mode, { rows: false, tabs: false }, { char: ']', start: indexStart });
          this.nesting--;
        }
        this.atom(mode, context); continue;
      }
      if (name === 'left') { this.enter(start); this.delimiter(); left.push(start); continue; }
      if (name === 'right') {
        if (!left.length) this.fail('UNEXPECTED_RIGHT', '\\right 缺少同层的 \\left', start);
        this.delimiter(); left.pop(); this.nesting--; continue;
      }
      if (name === 'middle') {
        if (!left.length) this.fail('UNEXPECTED_MIDDLE', '\\middle 只能出现在同层的 \\left 和 \\right 之间', start);
        this.delimiter(); continue;
      }
      if (BIG_DELIMITERS.has(name)) { this.delimiter(); continue; }
      this.fail('COMMAND_NOT_ALLOWED', `不支持命令 \\${name}；仅接受允许列表中的数学命令`, start);
    }
    if (stop.environment) this.fail('UNCLOSED_ENVIRONMENT', `环境 ${stop.environment} 缺少 \\end{${stop.environment}}`, stop.start);
    if (stop.char) this.fail('UNCLOSED_GROUP', stop.char === '}' ? '花括号尚未闭合' : '根次参数缺少 ]', stop.start);
    if (left.length) this.fail('UNCLOSED_LEFT', '\\left 缺少同层的 \\right', left.at(-1));
  }
}

function resolveLimits(requested) {
  if (!requested || typeof requested !== 'object' || Array.isArray(requested)) throw new TypeError('限制配置必须是对象');
  for (const key of Object.keys(requested)) if (!Object.hasOwn(DEFAULT_LIMITS, key)) throw new TypeError(`未知限制配置：${key}`);
  const result = { ...DEFAULT_LIMITS, ...requested };
  // Callers may tighten these bounds, but cannot weaken the audited defaults.
  for (const [key, value] of Object.entries(result))
    if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULT_LIMITS[key]) throw new RangeError(`限制 ${key} 必须为 1–${DEFAULT_LIMITS[key]} 的整数`);
  return result;
}

/** Return the exact original source on success; never return a cleaned version. */
export function validateMathInput(source, { limits = {} } = {}) {
  const effective = resolveLimits(limits);
  if (typeof source !== 'string') return { ok: false, error: { code: 'INPUT_TYPE', message: '公式必须是字符串', index: 0, line: 1, column: 1 } };
  try {
    const fail = (code, message, index = 0) => { throw new MathInputError(code, message, index, source); };
    if (source.length > effective.maxLength) fail('LENGTH_LIMIT', `公式最多允许 ${effective.maxLength} 个 UTF-16 字符`);
    if (!source.trim()) fail('EMPTY_INPUT', '请输入公式');
    const encoded = source.indexOf('^^');
    if (encoded >= 0) fail('TEX_CHARACTER_ENCODING', '不允许 TeX 的 ^^ 字符编码写法', encoded);
    for (let i = 0; i < source.length;) {
      const code = source.codePointAt(i), char = String.fromCodePoint(code);
      if (/\p{C}/u.test(char) && !['\t', '\r', '\n'].includes(char))
        fail('CONTROL_CHARACTER', '不允许控制字符、不可见格式字符或无效 Unicode', i);
      if (['$', '%', '#', '~'].includes(char)) {
        // A literal control-symbol escape is handled by the lexer. Count the
        // preceding slash run: \\% is a row command followed by a comment, not \%.
        let slashes = 0; for (let j = i - 1; j >= 0 && source[j] === '\\'; j--) slashes++;
        if (!(slashes % 2) || char === '~') fail('SPECIAL_CHARACTER', '不允许数学模式边界、注释、参数符或活动字符；字面符号请用明确转义', i);
      }
      i += char.length;
    }
    const parser = new Parser(source, effective);
    parser.sequence(MODE.math, { rows: false, tabs: false });
    return { ok: true, source, stats: { utf16Length: source.length, tokens: parser.tokens,
      commands: parser.commandCount, maxBraceDepth: parser.maxBraceDepth,
      maxEnvironmentDepth: parser.maxEnvironmentDepth, maxNesting: parser.maxNesting,
      rows: parser.rows, alignmentTabs: parser.tabs } };
  } catch (error) {
    if (!(error instanceof MathInputError)) throw error;
    return { ok: false, error: { code: error.code, message: error.message, index: error.index, line: error.line, column: error.column } };
  }
}

export function assertMathInput(source, options) {
  const result = validateMathInput(source, options);
  if (!result.ok) {
    const error = new Error(result.error.message);
    Object.assign(error, result.error, { name: 'MathInputError' }); throw error;
  }
  return result.source;
}
