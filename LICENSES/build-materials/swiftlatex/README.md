# Traceable SwiftLaTeX engine build

The public runtime is selected from the artifacts of `scripts/rebuild-swiftlatex.py`, not from the historical `.a` files bundled in the upstream tag. `toolchain.json` records the toolchain used. The source archives and their integrity values are in `../../source-manifest.json`.

The recipe makes these choices explicit:

- SwiftLaTeX `v20022022`, commit `912068d6f746a58c210eec69053ef72e2ed60b4c`, supplies the engine implementation, bridges, JavaScript prelude, Makefiles, and Xpdf implementation sources.
- Graphite2 `1.3.14` is built statically in Release mode with `GRAPHITE2_VM_TYPE=call`, matching the historical library's call-machine backend. Tracing is disabled; the file-face API remains enabled.
- HarfBuzz `3.2.0` uses the source list and compile options in the retained Emscripten `3.1.4` port recipe, with `HAVE_GRAPHITE2` and the retained Graphite headers added because XeTeX calls that backend. Its FreeType headers come from the same pinned SDK port, not a host font library.
- Xpdf `4.02` is built from the complete `pdftex.wasm/xpdf` implementation in the same SwiftLaTeX tag. The three headers that differ from the XeTeX header subset (`aconf.h`, `xpdf/GlobalParams.h`, and `xpdf/config.h`) are overlaid from that tag's `xetex.wasm/xpdf` directory before compilation. The recipe uses `-O3 -flto=thin`; it retains all original source notices.
- Every historical `.a` is removed before building. The three newly built libraries are supplied to the original engine Makefiles.
- FreeType `version_1`, ICU `68.2`, libpng `1.6.37`, and zlib `1.2.11` are the sources fixed by the Emscripten `3.1.4` port recipes. Complete archives are verified against both retained SHA-256 and original port SHA-512 values, then unpacked into a build-local `EM_PORTS` source cache. Port builds therefore use the retained source, without a new network download.

The normal site build simply copies the selected, checked runtime. Rebuilding the engine is optional for users and maintainers who only want to deploy the existing release; it is documented and reproducible from the retained source for anyone who wants to modify it.

After a successful candidate build, run the full output regression:

```sh
node scripts/check-engine-output.mjs --candidate-dir /tmp/formula-studio-engine-build/artifacts --output .qa/engine-regression
```

This checks all 35 retained 600 dpi reference cases, including 10/12 pt formulas, radicals and delimiters, text styles, Greek variants, and historical reference settings. It rejects a partial run as release evidence. The four candidate file hashes must match the actual deployed runtime. A passing raster baseline establishes the tested formula output; it is not a claim of byte-identical upstream WASM or arbitrary LaTeX coverage.

The release manifest points to the retained build and regression reports. `scripts/verify-license-materials.mjs` checks the full case set, reference hashes, font warnings, build/test/runtime hash correspondence, source archives, and source-material hashes before deployment.

## Source-only distribution

`source-only-derivation.json` records the original SwiftLaTeX archive identity, the exact four historical `.a` members omitted from the distributed archive, their sizes and hashes, and the hash of every retained preferred-source file. Implementation, header, license, data and build-file bytes are unchanged.

The executed build3 recipe (`executed-build3.py`) extracted the original archive and removed those same four `.a` files before compilation. The final reproduction recipe reads the source-only archive directly. The build report preserves both recipe hashes and explicitly records this source-preparation equivalence; it does not claim that the later filename-only recipe change was separately executed. All published engine and output-regression hashes remain those of the actual tested build3 artifacts.
