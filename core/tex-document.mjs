// Browser formula document wrapper with explicit, approved font supplements.
// This is not a general TeX sandbox.
export const fontFiles = {
  regular: 'Times New Roman.ttf', italic: 'Times New Roman Italic.ttf',
  bold: 'Times New Roman Bold.ttf', boldItalic: 'Times New Roman Bold Italic.ttf',
};

export const coreFontFiles = { regular: 'Times.TTF', italic: 'Timesi.TTF', bold: 'Timesbd.TTF', boldItalic: 'Timesbi.TTF' };

export const MAX_LATEX_CHARACTERS = 10_000;
export const MAX_DOCUMENT_CHARACTERS = 32_768;

export const missingGreekVariantTargets = Object.freeze([
  0x03D1, 0x03D5, 0x03D6, 0x03F0, 0x03F1, 0x03F4, 0x03F5,
  0x1D6B9, 0x1D6DC, 0x1D6DD, 0x1D6DE, 0x1D6DF, 0x1D6E0, 0x1D6E1,
  0x1D6F3, 0x1D716, 0x1D717, 0x1D718, 0x1D719, 0x1D71A, 0x1D71B,
  0x1D72D, 0x1D750, 0x1D751, 0x1D752, 0x1D753, 0x1D754, 0x1D755,
]);

export function buildDocument(latex, {sizePt=10, arrayStretch=1, fontPath='fonts/', mathFont='texgyretermes-math.otf', mathPath='fonts/', fonts=coreFontFiles, fontScript="CustomDefault", restoreVariants=true, restoreDotlessJ=true}={}) {
  if (typeof latex !== 'string' || latex.length > MAX_LATEX_CHARACTERS) throw new Error('LaTeX input must be a string of at most 10000 characters');
  if (typeof restoreVariants !== 'boolean' || typeof restoreDotlessJ !== 'boolean') throw new Error('Font supplement options must be boolean');
  if (restoreDotlessJ && !restoreVariants) throw new Error('Dotless-j supplementation without variant compatibility has not been validated');
  if (![8,10,12,16,20,24].includes(sizePt)) throw new Error('Unsupported test size');
  // The editor uses the CSF default. 1.08 is only for the historical exam fixture.
  if (![1,1.08].includes(arrayStretch)) throw new Error('Unsupported array stretch');
  if (!['Latin','CustomDefault'].includes(fontScript)) throw new Error('Unsupported font script policy');
  // Path values are trusted test configuration, never user-input fields.
  for (const path of [fontPath, mathPath, mathFont]) if (typeof path !== 'string' || /[{}\n\r]/.test(path)) throw new Error('Invalid path');
  // Keep the original filenames supplied by the selected font package.
  for (const key of ['regular', 'italic', 'bold', 'boldItalic']) if (typeof fonts?.[key] !== 'string' || !/^[\w .-]+$/.test(fonts[key])) throw new Error('Invalid font filename');
  const fontFiles = fonts;
  const textFontOptions = `Path={${fontPath}},ItalicFont={${fontFiles.italic}},BoldFont={${fontFiles.bold}},BoldItalicFont={${fontFiles.boldItalic}}`;
  const textFamilies = ['setmainfont','setsansfont','setmonofont'].map(command => `\\${command}{${fontFiles.regular}}[${textFontOptions}]`).join('\n');
  const supplement = buildFontSupplement({ mathFont, mathPath, restoreVariants, restoreDotlessJ });
  const source = String.raw`\documentclass[10pt]{article}
\usepackage{amsmath}
\usepackage{fontspec}
\usepackage[math-style=ISO]{unicode-math}
% Match fontspec's real bold family (b), rather than the old format's bx default.
\DeclareFontSeriesDefault[rm]{bf}{b}
\defaultfontfeatures{Ligatures=TeX}
${textFamilies}
\setmathfont{${mathFont}}[Path={${mathPath}}]
\setmathfont{${fontFiles.regular}}[Path={${fontPath}},range={up/{Latin,latin,num,Greek,greek}},Script=${fontScript},script-features={},sscript-features={}]
\setmathfont{${fontFiles.italic}}[Path={${fontPath}},range={it/{Latin,latin,Greek,greek}->up},Script=${fontScript},script-features={},sscript-features={}]
\setmathfont{${fontFiles.bold}}[Path={${fontPath}},range={bfup/{Latin,latin,num,Greek,greek}->up},Script=${fontScript},script-features={},sscript-features={}]
\setmathfont{${fontFiles.boldItalic}}[Path={${fontPath}},range={bfit/{Latin,latin,Greek,greek}->up},Script=${fontScript},script-features={},sscript-features={}]
\setmathfont{${fontFiles.regular}}[Path={${fontPath}},range={"002B,"2212,"00B1,"00D7,"00F7,"003D,"003C,"003E,"2264,"2265,"2260,"2248},Script=${fontScript},script-features={},sscript-features={}]
${supplement}\AtBeginDocument{\Umathcodenum${String.fromCharCode(96)}\-=\Umathcodenum"2212\relax}
\setoperatorfont\mathrm
\renewcommand{\boldsymbol}[1]{\symbfit{#1}}
\newcommand{\mat}[1]{\symbfit{#1}}
\newcommand{\vect}[1]{\symbfit{#1}}
\newcommand{\eu}{\mathrm{e}}
\providecommand{\upmu}{\symup{\mu}}
\providecommand{\piup}{\symup{\pi}}
% TeX Gyre Termes Math 1.543 MATH constants: 74% script, 55% scriptscript.
\DeclareMathSizes{${sizePt}}{${sizePt}}{${Number((sizePt*.74).toFixed(4))}}{${Number((sizePt*.55).toFixed(4))}}
% CSF uses the standard matrix strut; the historical exam opts into 1.08.
\renewcommand{\arraystretch}{${arrayStretch}}
\tracinglostchars=3
\pagestyle{empty}
\newsavebox{\EquationBox}
% Generous staging page; the vector converter crops actual glyph ink afterwards.
\newdimen\ExportMargin \ExportMargin=${sizePt*2+2}pt
\begin{document}
\fontsize{${sizePt}}{${sizePt*1.2}}\selectfont
\setbox\EquationBox=\hbox{$\displaystyle ${latex}$}
\paperwidth=\wd\EquationBox \advance\paperwidth by 2\ExportMargin
\paperheight=\ht\EquationBox \advance\paperheight by \dp\EquationBox \advance\paperheight by 2\ExportMargin
\typeout{EQUATION_WIDTH_SP=\number\wd\EquationBox}
\typeout{EQUATION_HEIGHT_SP=\number\ht\EquationBox}
\typeout{EQUATION_DEPTH_SP=\number\dp\EquationBox}
\typeout{PAGE_WIDTH_SP=\number\paperwidth}
\typeout{PAGE_HEIGHT_SP=\number\paperheight}
\hoffset=-1in \voffset=-1in
\shipout\vbox to\paperheight{\offinterlineskip
\special{papersize=\the\paperwidth,\the\paperheight}
\kern\ExportMargin
\hbox to\paperwidth{\kern\ExportMargin\box\EquationBox\hss}\vss}
\end{document}
`;
  if (source.length > MAX_DOCUMENT_CHARACTERS) throw new Error('Generated document exceeds 32768 characters');
  return source;
}

function buildFontSupplement({ mathFont, mathPath, restoreVariants, restoreDotlessJ }) {
  const targets = [...(restoreVariants ? missingGreekVariantTargets : []), ...(restoreDotlessJ ? [0x0237, 0x1D6A5] : [])];
  if (targets.length) {
    const range = targets.map(code => `"${code.toString(16).toUpperCase()}`).join(',');
    let line = `\\setmathfont{${mathFont}}[Path={${mathPath}},range={${range}}]`;
    if (restoreVariants) {
      // Pinned unicode-math compatibility: its Greek range list omits the
      // variant slots from named-slot inheritance after TNR -> up remapping.
      // Append only the seven missing symbols to its existing style maps.
      const variants = {
        up: [0x03F4, 0x03F5, 0x03D1, 0x03F0, 0x03D5, 0x03F1, 0x03D6],
        it: [0x1D6F3, 0x1D716, 0x1D717, 0x1D718, 0x1D719, 0x1D71A, 0x1D71B],
        bfup: [0x1D6B9, 0x1D6DC, 0x1D6DD, 0x1D6DE, 0x1D6DF, 0x1D6E0, 0x1D6E1],
        bfit: [0x1D72D, 0x1D750, 0x1D751, 0x1D752, 0x1D753, 0x1D754, 0x1D755],
      };
      const mapping = [String.raw`\cs_if_exist:NF\__um_mathmap_noparse:nnn{\PackageError{formula-fonts}{Unsupported~unicode-math~compatibility~API}{Use~the~pinned~unicode-math~runtime.}}
\cs_if_exist:NF\__um_set_mathcode:nnnn{\PackageError{formula-fonts}{Unsupported~unicode-math~compatibility~API}{Use~the~pinned~unicode-math~runtime.}}`];
      for (const style of ['up', 'it', 'bfup', 'bfit', 'bf']) {
        const destination = variants[style === 'bf' ? 'bfit' : style];
        for (const input of Object.values(variants)) for (let index = 0; index < 7; ++index) {
          mapping.push(`\\__um_mathmap_noparse:nnn{${style}}{"${input[index].toString(16).toUpperCase()}}{"${destination[index].toString(16).toUpperCase()}}`);
        }
      }
      if (restoreDotlessJ) {
        for (const [style, target] of [['up', 0x237], ['it', 0x1D6A5]]) for (const input of [0x237, 0x1D6A5]) {
          mapping.push(`\\__um_mathmap_noparse:nnn{${style}}{${input}}{${target}}`);
        }
        // No encoded bold dotless-j is available through this pinned math
        // engine. Reject both command and literal Unicode forms rather than
        // silently presenting the ordinary italic glyph as bold.
        mapping.push(String.raw`\cs_new_protected:Npn\__formula_unsupported_bold_jmath:{\PackageError{formula-fonts}{Bold~dotless~j~is~not~supported~by~this~font~configuration}{Use~ordinary~dotless~j~or~remove~the~bold~style.}}
\char_gset_active_eq:nN{"0237}\__formula_unsupported_bold_jmath:
\char_gset_active_eq:nN{"1D6A5}\__formula_unsupported_bold_jmath:`);
        for (const style of ['bf', 'bfup', 'bfit']) mapping.push(`\\tl_gput_right:cn{g__um_switchto_${style}_tl}{\\mathcode"0237="8000\\scan_stop:\\mathcode"1D6A5="8000\\scan_stop:}`);
      }
      const textCompatibility = [];
      for (const [command, style] of [['mathrm', 'up'], ['mathit', 'it'], ['mathbf', 'bfup']]) {
        const codes = [];
        for (const input of Object.values(variants)) for (let index = 0; index < 7; ++index) {
          codes.push(`\\__um_set_mathcode:nnnn{"${input[index].toString(16).toUpperCase()}}{\\mathord}{\\l__um_symfont_label_tl}{"${variants[style][index].toString(16).toUpperCase()}}`);
        }
        if (restoreDotlessJ && style !== 'bfup') for (const input of [0x237, 0x1D6A5]) codes.push(`\\__um_set_mathcode:nnnn{${input}}{\\mathord}{\\l__um_symfont_label_tl}{${style === 'up' ? 0x237 : 0x1D6A5}}`);
        textCompatibility.push(`\\tl_gset:cx{g__formula_missing_${style}_tl}{${codes.join('\n')}}`);
        if (restoreDotlessJ && style === 'bfup') textCompatibility.push(String.raw`\tl_gput_right:cn{g__formula_missing_bfup_tl}{\mathcode"0237="8000\scan_stop:\mathcode"1D6A5="8000\scan_stop:}`);
        const flag = command === 'mathrm' ? 'rm' : command === 'mathit' ? 'it' : 'bf';
        textCompatibility.push(`\\AtBeginDocument{\\cs_gset_eq:NN\\__formula_original_${command}\\${command}\\cs_gset_protected:Npn\\${command}{\\bool_if:NT\\g__um_math${flag}_text_bool{\\tl_set:Nn\\l__formula_pending_style_tl{${style}}}\\__formula_original_${command}}}`);
      }
      const textGroup = String.raw`
\tl_new:N\l__formula_pending_style_tl
\cs_new_protected:Npn\__formula_text_greek:nn#1#2{
  \int_step_inline:nnn{0}{24}{
    \int_compare:nNnF{##1}={17}{\Umathcode\int_eval:n{#1+##1}=7~0~\int_eval:n{"0391+##1}\scan_stop:}
    \Umathcode\int_eval:n{#2+##1}=7~0~\int_eval:n{"03B1+##1}\scan_stop:
  }
}
\cs_new:Npn\__formula_mathgroup:nnn#1#2#3{
  \tl_clear:N\l__formula_pending_style_tl
  \math@bgroup
  \cs_if_eq:cNF{M@\f@encoding}#2{#2}
  \__um_switch_to:n{literal}
  \__um_mathgroup_set:n{#3}
  \__formula_text_greek:nn{"0391}{"03B1}
  \__formula_text_greek:nn{"1D6A8}{"1D6C2}
  \__formula_text_greek:nn{"1D6E2}{"1D6FC}
  \__formula_text_greek:nn{"1D71C}{"1D736}
  \tl_use:c{g__formula_missing_#1_tl}
  \math@egroup
}
\AtBeginDocument{
  \cs_gset_eq:NN\__formula_original_use_mathgroup\use@mathgroup
  \cs_gset:Npn\use@mathgroup#1#2{
    \tl_if_empty:NTF\l__formula_pending_style_tl
    {\__formula_original_use_mathgroup{#1}{#2}}
    {\exp_args:NV\__formula_mathgroup:nnn\l__formula_pending_style_tl{#1}{#2}}
  }
}
`;
      line += `\n\\makeatletter\n\\ExplSyntaxOn\n${mapping.join('\n')}\n${textGroup}\n${textCompatibility.join('\n')}\n\\ExplSyntaxOff\n\\makeatother`;
    }
    return `${line}\n`;
  }
  return '';
}
