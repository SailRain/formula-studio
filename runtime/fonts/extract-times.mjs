// In-memory extraction of one exact, user-approved original package.
// Decoder: unmodified libarchive.js 2.0.2 ESM glue + libarchive 3.7.2 WASM.
// No installer is executed and no font is written, renamed, or transformed.
import createLibarchive from './libarchive.mjs';

export const TIMES_PACKAGE = Object.freeze({
  filename: 'times32.exe', bytes: 661728,
  sha256: 'db56595ec6ef5d3de5c24994f001f03b2a13e37cee27bc25c58f6f43e8f807ab',
  cabOffset: 67104, cabBytes: 585365, compression: 'LZX', windowBits: 21,
});
export const TIMES_FONTS = Object.freeze({
  'Times.TTF': Object.freeze({ bytes: 330412, sha256: '4e98adeff8ccc8ef4e3ece8d4547e288ff85fdc9c7ca711a4599c234874bbe86' }),
  'Timesbd.TTF': Object.freeze({ bytes: 333900, sha256: '4357b63cef20c01661a53c5dae70ffd20cb4765503aaed6d38b17a57c5a90bff' }),
  'Timesbi.TTF': Object.freeze({ bytes: 238612, sha256: '192e1b0d18e90334e999a99f8c32808d6a2e74b3698b8cd90c943c2249a46549' }),
  'Timesi.TTF': Object.freeze({ bytes: 247092, sha256: 'c25ae529b4cecdbca148b6ccb862ee0abad770af8b1fd29c8dba619d1b8da78a' }),
});
export const ARCHIVE_RUNTIME = Object.freeze({
  package: 'libarchive.js@2.0.2', version: 'libarchive 3.7.2',
  wasmFilename: 'libarchive.wasm', wasmBytes: 1002547,
  wasmSha256: '8a66066ed3ea1e6db0469ec752d8fca888a6bf737c6cff21fdbcb62241a72424',
});
const EXPECTED_ENTRIES = Object.freeze({
  'fontinst.inf': 58, ...Object.fromEntries(Object.entries(TIMES_FONTS).map(([name, meta]) => [name, meta.bytes])),
  'FONTINST.EXE': 45568,
});
let runtimePromise;

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 requires a secure browser context.');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function verify(bytes, expectedBytes, expectedHash, label) {
  if (bytes.byteLength !== expectedBytes) throw new Error(`${label}: unexpected byte length.`);
  const hash = await sha256(bytes);
  if (hash !== expectedHash) throw new Error(`${label}: SHA-256 mismatch.`);
  return hash;
}

function checkKnownCabinet(bytes) {
  // The EXE contains two earlier "MSCF" strings in code, so a first-signature
  // search is incorrect. These offsets are only used after whole-package SHA-256.
  const h = new DataView(bytes.buffer, bytes.byteOffset + TIMES_PACKAGE.cabOffset, TIMES_PACKAGE.cabBytes);
  if (h.getUint32(0, true) !== 0x4643534d || h.getUint32(8, true) !== TIMES_PACKAGE.cabBytes ||
      h.getUint32(16, true) !== 44 || h.getUint8(24) !== 3 || h.getUint8(25) !== 1 ||
      h.getUint16(26, true) !== 1 || h.getUint16(28, true) !== 6 || h.getUint16(30, true) !== 0 ||
      h.getUint32(36, true) !== 211 || h.getUint16(40, true) !== 37 || h.getUint16(42, true) !== 0x1503) {
    throw new Error('times32.exe: unexpected cabinet structure.');
  }
}

async function getRuntime(suppliedWasm) {
  // An optional byte source allows the same exact module to be tested offline in
  // Node or initialized by an application's static asset loader. It cannot
  // override the pinned version or integrity check.
  let wasm;
  if (suppliedWasm !== undefined) {
    if (!(suppliedWasm instanceof Uint8Array)) throw new TypeError('wasmBytes must be a Uint8Array.');
    wasm = new Uint8Array(suppliedWasm);
    await verify(wasm, ARCHIVE_RUNTIME.wasmBytes, ARCHIVE_RUNTIME.wasmSha256, 'libarchive.wasm');
  }
  if (!runtimePromise) {
    runtimePromise = (async () => {
      if (!wasm) {
        const response = await fetch(new URL('./libarchive.wasm', import.meta.url).href);
        if (!response.ok) throw new Error(`Could not load libarchive.wasm (${response.status}).`);
        wasm = new Uint8Array(await response.arrayBuffer());
        await verify(wasm, ARCHIVE_RUNTIME.wasmBytes, ARCHIVE_RUNTIME.wasmSha256, 'libarchive.wasm');
      }
      // Supplying verified wasmBinary prevents the glue from making any fetch.
      const module = await createLibarchive({ wasmBinary: wasm });
      const wrap = (name, result, args) => module.cwrap(name, result, args);
      const api = {
        module, version: wrap('get_version', 'string', [])(),
        open: wrap('archive_open', 'number', ['number', 'number', 'string', 'string']),
        next: wrap('get_next_entry', 'number', ['number']),
        name: wrap('archive_entry_pathname', 'string', ['number']),
        size: wrap('archive_entry_size', 'number', ['number']),
        type: wrap('archive_entry_filetype', 'number', ['number']),
        data: wrap('get_filedata', 'number', ['number', 'number']),
        skip: wrap('archive_read_data_skip', 'number', ['number']),
        error: wrap('archive_error_string', 'string', ['number']),
        close: wrap('archive_close', null, ['number']),
      };
      if (api.version !== ARCHIVE_RUNTIME.version) throw new Error('Unexpected archive runtime version.');
      return api;
    })().catch(error => { runtimePromise = undefined; throw error; });
  }
  return runtimePromise;
}

/**
 * Decode the approved complete times32.exe inside the calling Worker.
 * Returns owned font byte arrays under their unchanged original filenames.
 * Keeps the caller's complete package unchanged. No network calls occur except
 * the first fixed, adjacent libarchive.wasm fetch when wasmBytes is not supplied.
 */
export async function extractTimes(input, { wasmBytes } = {}) {
  const started = performance.now();
  if (!(input instanceof Uint8Array)) throw new TypeError('Expected complete times32.exe as Uint8Array.');
  // Snapshot before asynchronous hashing; concurrent changes to caller memory
  // cannot turn validated input into different bytes during decoding.
  if (input.byteLength !== TIMES_PACKAGE.bytes) throw new Error('times32.exe: unexpected byte length.');
  const packageBytes = new Uint8Array(input);
  await verify(packageBytes, TIMES_PACKAGE.bytes, TIMES_PACKAGE.sha256, 'times32.exe');
  checkKnownCabinet(packageBytes);
  const api = await getRuntime(wasmBytes);
  const { module } = api;
  const fonts = {};
  const entries = [];
  const pointer = module._malloc(packageBytes.length);
  if (!pointer) throw new Error('Archive input allocation failed.');
  let archive;
  try {
    module.HEAPU8.set(packageBytes, pointer);
    archive = api.open(pointer, packageBytes.length, null, 'en_US.UTF-8');
    if (!archive) throw new Error('Could not open verified times32.exe.');
    const seen = new Set();
    for (let entry; (entry = api.next(archive));) {
      const name = api.name(entry), size = api.size(entry);
      if (entries.length >= 6 || seen.has(name) || !Object.hasOwn(EXPECTED_ENTRIES, name) ||
          EXPECTED_ENTRIES[name] !== size || api.type(entry) !== 32768) {
        throw new Error('Unexpected entry in verified times32.exe.');
      }
      seen.add(name);
      entries.push({ name, bytes: size });
      if (!Object.hasOwn(TIMES_FONTS, name)) {
        if (api.skip(archive) !== 0) throw new Error(api.error(archive) || 'Archive skip failed.');
        continue;
      }
      const dataPointer = api.data(archive, size);
      if (dataPointer <= 0) throw new Error(api.error(archive) || 'Font extraction failed.');
      try { fonts[name] = module.HEAPU8.slice(dataPointer, dataPointer + size); }
      finally { module._free(dataPointer); }
    }
    if (entries.length !== 6 || Object.keys(fonts).length !== 4) throw new Error('Incomplete times32.exe extraction.');
  } finally {
    if (archive) api.close(archive);
    module._free(pointer);
  }
  const verifiedFonts = [];
  for (const [name, expected] of Object.entries(TIMES_FONTS)) {
    const hash = await verify(fonts[name], expected.bytes, expected.sha256, name);
    verifiedFonts.push({ name, bytes: expected.bytes, sha256: hash, version: '2.82' });
  }
  return {
    fonts,
    report: {
      package: { ...TIMES_PACKAGE, verified: true },
      decoder: { ...ARCHIVE_RUNTIME, wasmVerified: true, heapBytes: module.HEAPU8.byteLength },
      entries, fonts: verifiedFonts, complete: true,
      elapsedMs: performance.now() - started,
    },
  };
}
