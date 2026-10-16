// No formula data is sent over the network. The sole fetch is a same-origin WASM.
const wasmURL = new URL('./vendor/package/dist/mupdf-wasm.wasm', import.meta.url).href;
const nativeFetch = globalThis.fetch.bind(globalThis);
const requests = [];
globalThis.fetch = (resource, init) => {
  const url = new URL(typeof resource === 'string' ? resource : resource.url, import.meta.url).href;
  if (url !== wasmURL || (init?.method ?? 'GET') !== 'GET') throw new Error(`Network request blocked: ${url}`);
  requests.push(url);
  return nativeFetch(resource, init);
};
let convertPDF;
try {
  ({ convertPDF } = await import('./converter.mjs'));
  postMessage({ type: 'ready', requests });
} catch (error) {
  postMessage({ type: 'error', message: error.message, stack: error.stack });
}
self.onmessage = ({ data }) => {
  if (data?.type !== 'convert' || !convertPDF) return;
  try {
    const start = performance.now();
    const result = convertPDF(data.pdf, data.options);
    const durationMs = performance.now() - start;
    postMessage({ type: 'result', id: data.id, result, durationMs, requests }, [result.pdf.buffer, ...result.png.map(item => item.bytes.buffer)]);
  } catch (error) {
    postMessage({ type: 'error', id: data.id, message: error.message, stack: error.stack });
  }
};
