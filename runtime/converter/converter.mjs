import mupdf from './vendor/package/dist/mupdf.js';
import { cropPDFToVectorBounds } from './crop-module.mjs';

export const MUPDF_VERSION = '1.28.1';

export function inspectPNG(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if ([137, 80, 78, 71, 13, 10, 26, 10].some((n, i) => bytes[i] !== n)) throw new Error('Not a PNG');
  const report = { chunks: [] };
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = view.getUint32(at);
    if (at + 12 + length > bytes.length) throw new Error('Truncated PNG chunk');
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    report.chunks.push(type);
    if (type === 'IHDR') Object.assign(report, { width: view.getUint32(at + 8), height: view.getUint32(at + 12), bitDepth: bytes[at + 16], colorType: bytes[at + 17] });
    if (type === 'pHYs') {
      report.physical = { xPixelsPerMetre: view.getUint32(at + 8), yPixelsPerMetre: view.getUint32(at + 12), unit: bytes[at + 16] };
      if (report.physical.unit === 1) report.dpi = [report.physical.xPixelsPerMetre * 0.0254, report.physical.yPixelsPerMetre * 0.0254];
    }
    at += 12 + length;
    if (type === 'IEND') { report.complete = at === bytes.length; break; }
  }
  return report;
}

export function inspectSVG(svg) {
  return {
    hasSVGRoot: /<svg\b/.test(svg),
    pathCount: (svg.match(/<path\b/g) ?? []).length,
    textCount: (svg.match(/<text\b/g) ?? []).length,
    imageCount: (svg.match(/<image\b/g) ?? []).length,
    externalReferenceCount: (svg.match(/(?:href|src)\s*=\s*["'](?!#)[^"']+/g) ?? []).length,
    viewBox: svg.match(/\bviewBox="([^"]+)"/)?.[1] ?? null,
    width: svg.match(/\bwidth="([^"]+)"/)?.[1] ?? null,
    height: svg.match(/\bheight="([^"]+)"/)?.[1] ?? null,
  };
}

function inspectAlpha(pixmap) {
  const pixels = pixmap.getPixels();
  const components = pixmap.getNumberOfComponents();
  if(!pixmap.getAlpha()) return {hasAlpha:false,transparent:0,opaque:pixels.length/components,partial:0,cornerAlpha:255};
  let transparent = 0, opaque = 0, partial = 0;
  for (let i = components - 1; i < pixels.length; i += components) {
    if (pixels[i] === 0) ++transparent;
    else if (pixels[i] === 255) ++opaque;
    else ++partial;
  }
  return { hasAlpha: pixmap.getAlpha(), transparent, opaque, partial, cornerAlpha: pixels[components - 1] };
}

// Synchronous computation belongs in a dedicated module Worker. All outputs are
// owned Uint8Arrays/strings, never views into the MuPDF WASM heap.
export function convertPDF(input, { dpi = [300, 600], maxPixels = 32_000_000, cropToInk = false, background = 'transparent' } = {}) {
  if (!(input instanceof Uint8Array || input instanceof ArrayBuffer)) throw new TypeError('Expected PDF bytes');
  if(input.byteLength>10_000_000) throw new RangeError('PDF exceeds 10 MB limit');
  if (!Array.isArray(dpi) || !dpi.length || dpi.length>2 || dpi.some(value => ![300, 600].includes(value))) throw new RangeError('Use 300 or 600 dpi');
  if(!['transparent','white'].includes(background)) throw new RangeError('Unknown background');
  if(!Number.isInteger(maxPixels)||maxPixels<1||maxPixels>32_000_000) throw new RangeError('Invalid pixel limit');
  const cropped = cropToInk ? cropPDFToVectorBounds(input) : null;
  const inputBytes = cropped ? cropped.pdf : new Uint8Array(input).slice();
  const doc = mupdf.Document.openDocument(inputBytes, 'application/pdf');
  let page, buffer, writer, device;
  try {
    if (doc.countPages() !== 1) throw new Error('Formula PDF must contain exactly one page');
    page = doc.loadPage(0);
    const bounds = page.getBounds();
    const width = bounds[2] - bounds[0], height = bounds[3] - bounds[1];
    if (!(width > 0 && height > 0)) throw new Error('Empty PDF page');
    if(width>2000||height>2000) throw new RangeError('Formula exceeds the 2000 pt dimension limit');
    for(const resolution of dpi) if(Math.ceil(width*resolution/72)*Math.ceil(height*resolution/72)>maxPixels) throw new RangeError('Requested raster exceeds pixel limit');
    buffer = new mupdf.Buffer();
    writer = new mupdf.DocumentWriter(buffer, 'svg', 'text=path');
    device = writer.beginPage(bounds);
    page.runPageContents(device, mupdf.Matrix.identity);
    writer.endPage();
    writer.close();
    // MuPDF emits numeric SVG dimensions, interpreted as CSS pixels. Explicit
    // points preserve the PDF's physical size while retaining its vector viewBox.
    const svg = buffer.asString().replace(/<svg\b([^>]+)>/, (root) => root
      .replace(/\bwidth="[^"]+"/, `width="${width}pt"`)
      .replace(/\bheight="[^"]+"/, `height="${height}pt"`));
    const svgReport = inspectSVG(svg);
    if (!svgReport.hasSVGRoot || svgReport.textCount || svgReport.imageCount || svgReport.externalReferenceCount) throw new Error('SVG must be self-contained paths, without raster images or live text');
    const png = [];
    for (const resolution of dpi) {
      const scale = resolution / 72;
      if (Math.ceil(width * scale) * Math.ceil(height * scale) > maxPixels) throw new RangeError('Requested raster exceeds pixel limit');
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, background !== 'white', false);
      try {
        pixmap.setResolution(resolution, resolution);
        const bytes = pixmap.asPNG();
        png.push({ dpi: resolution, bytes, metadata: inspectPNG(bytes), alpha: inspectAlpha(pixmap) });
      } finally { pixmap.destroy(); }
    }
    return { pdf: inputBytes, svg, png, report: { converter: `mupdf@${MUPDF_VERSION}`, pageCount: 1, boundsPt: bounds, background, crop: cropped?.report ?? null, svg: svgReport } };
  } finally {
    device?.destroy();
    writer?.destroy();
    buffer?.destroy();
    page?.destroy();
    doc.destroy();
  }
}
