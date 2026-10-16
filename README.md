# Formula Studio

[**Try online**](https://sailrain.github.io/formula-studio/) · **English** · [简体中文](README.zh-CN.md)

A browser-based LaTeX formula editor with Times New Roman typesetting and PNG, SVG, and PDF export. No local LaTeX installation, account, API key, or application server is required.

## Features

- Edit LaTeX source or use a visual editor, categorized templates, and examples.
- Select characters in visual mode and use **Style** for math default, italic variables, upright numbers or differential d, text, bold italic vectors/matrices, and bold upright letters. Styles affect exports and can be undone.
- Typeset with an actual XeTeX → PDF pipeline running in browser workers. Preview and exports come from the same compilation.
- Keep Times New Roman 2.82 for the configured Latin, numeral, Greek, and operator ranges, with TeX Gyre Termes Math for mathematical symbols and missing glyphs. Formula commands are not automatically substituted.
- Export tightly cropped vector PDF and SVG with outlined glyphs, or PNG at 300 / 600 dpi with transparent / white background. Export sizes are 8, 10, 12, 16, 20, and 24 pt.
- Copy PNG and SVG, with separate compact download buttons. SVG uses native vector clipboard data where supported and otherwise copies its source.
- Switch between English and Simplified Chinese. Every new page or refresh starts in English and LaTeX source mode; language is not saved.
- Process formulas and results in page memory. The application does not upload them or save them to browser storage. Static program and font resources may be cached by the browser.

## Use online

Open **[Formula Studio](https://sailrain.github.io/formula-studio/)**, enter a formula fragment, and click **Update preview** (⌘Enter / Ctrl+Enter). Do not include `$`, `\[`, a document class, or a full document.

```latex
\sqrt{\frac{a}{b}}
```

```latex
\begin{pmatrix}1&2\\3&4\end{pmatrix}
\quad
\int_0^\infty \mathrm{e}^{-x^2}\,\mathrm{d}x
=\frac{\sqrt{\pi}}{2}
```

To make only the d in dx upright, select d in visual mode and choose **Upright / Number**. Style changes affect only the selection; choose **Update preview** to regenerate exports. Text conversion accepts plain characters and rejects formula structures or commands.

Fill each `□` template slot before compiling. Use Tab / Shift+Tab to move between slots. Change the export settings before updating the preview; preview zoom changes only its display size. **Clear** releases the current formula, results, and undo history. It does not erase your system clipboard.

The first compilation loads the browser typesetting components and may take longer. **Cancel** stops the current workers; **Update preview** starts a fresh attempt.

## Run locally

Requirements: Node.js **22** and Python **3** for the preview server. Runtime dependencies, fonts, and TeX resources are vendored; no `npm install` or system TeX installation is needed.

```sh
git clone https://github.com/SailRain/formula-studio.git
cd formula-studio
node scripts/verify-license-materials.mjs
node --test tests/*.test.mjs
node scripts/build.mjs
python3 scripts/serve-preview.py --pages
```

Open <http://127.0.0.1:8768/formula-studio/>. The same server also exposes the root URL <http://127.0.0.1:8768/>. `--pages` emulates GitHub Pages without custom response security headers; the HTML Content Security Policy remains active. Omit it to use the development server’s additional headers. You can select another port with `--port 9000`.

The build validates the unchanged Microsoft font package, all three MuPDF distribution files, and the retained third-party license, source, and regression materials. When building a Git checkout, it also checks that those MuPDF files are tracked so a clean clone cannot silently depend on ignored local files. The static output includes the corresponding upstream sources under `LICENSES/` and a deterministic application-source archive under `sources/`; these are downloaded only when explicitly opened.

## Deploy your own copy

1. Fork this repository and enable GitHub Actions.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source.
3. Push to `main` or run **Check and publish GitHub Pages** manually from the Actions tab.
4. After the deployment succeeds, use the URL shown by the `github-pages` environment. For a project repository it normally ends in `/repository-name/`.

Pull requests run the license checks, tests, and build without deploying. Pushes to `main` deploy only after those checks pass. The workflow uses Node.js 22 and pins the official GitHub Actions to immutable commit hashes.

The generated `dist/` directory can also be served by another static HTTPS host, at the domain root or a subdirectory. Serve `.wasm` as `application/wasm` and JavaScript modules as JavaScript. Open the site through HTTP(S), not `file://`. No backend, private token, cross-origin service, or persistent worker service is needed. Preserve all distributed license and source materials when redistributing.

## Limits and compatibility

- This is a formula editor, not a full LaTeX document editor. A finite admission language supports common mathematics, matrices, piecewise expressions, and aligned equations. Custom macros, file operations, package loading, and arbitrary TeX are rejected. The input limit is 10,000 characters; structural limits also apply.
- If visual mode cannot preserve the entered source exactly, the source is retained and the interface explains the limitation. Source mode remains the default.
- Accurate preview uses the configured Times New Roman / TeX Gyre fonts. The visual input editor’s immediate rendering uses its own editing fonts; use **Update preview** to judge the exported appearance.
- WebAssembly compilation uses the visitor’s CPU and memory while it runs. It does not require a local TeX installation or a background service.
- Clipboard access requires HTTPS (or localhost), browser permission, and a direct user action. Vector paste depends on the receiving application. Download remains available when copying is unsupported or denied.
- SVG contains self-contained glyph outlines and does not require fonts on the receiving device. Some PDF mathematical characters may not copy correctly as text because of the engine’s font mapping; the vector shapes and PNG / SVG output are unaffected.
- Chrome and Safari are the current acceptance-test browsers. Clipboard capabilities can differ between browser versions and receiving applications.

## Source and licenses

Original Formula Studio code is available under the **[MIT License](LICENSE)**, copyright **2026 Pierson Bian**. Third-party components retain their own terms. **The complete distribution is not entirely MIT-licensed.**

Read the **[third-party license and source index](LICENSES/README.md)** and **[source manifest](LICENSES/source-manifest.json)** before redistributing or changing bundled components. SwiftLaTeX and MuPDF include AGPL-covered code; font and TeX packages use their respective licenses. Corresponding source and build materials are documented in that index and must accompany distribution as required by those licenses.

Times New Roman is supplied only as the complete, unchanged `times32.exe` original package with its Microsoft EULA. Fonts are decoded in browser memory, not shipped as standalone extracted font files. MIT does not grant additional rights to the Microsoft fonts. The hosted tool is free, with no advertising or paid features; forks must review and follow the original font package terms.

The in-app **Fonts and open-source licenses** page includes the same attribution and original license texts. Third-party license originals are preserved in their original language.

For bugs or suggestions, [open an issue](https://github.com/SailRain/formula-studio/issues) with a minimal formula and browser version. Avoid including private documents or sensitive content.

The optional `node scripts/build.mjs --sites` profile serves the exact application source with the candidate and links unchanged upstream source archives to a verified immutable GitHub revision, reducing Sites upload size. The default build retains all archives locally.
