import mupdf from './vendor/package/dist/mupdf.js';

// Candidate for the generated single-page formula PDFs only. This does not
// rasterize, replace fonts, rewrite operators, or scale glyphs.
const BP_PER_TEX_PT = 72 / 72.27;
const EPSILON = 1e-4;
const close = (a, b) => Math.abs(a - b) <= EPSILON;
const roundOut = rect => [Math.floor(rect[0] * 10000) / 10000, Math.floor(rect[1] * 10000) / 10000, Math.ceil(rect[2] * 10000) / 10000, Math.ceil(rect[3] * 10000) / 10000];
const sameRect = (a, b) => a.every((value, index) => close(value, b[index]));

function valueOf(object, key, fallback, inherit = false) {
  const value = inherit ? object.getInheritable(key) : object.get(key);
  try { return value.isNull() ? fallback : value.asJS(); }
  finally { value.destroy(); }
}

function measure(page) {
  let bounds = null;
  const counts = { fillText: 0, strokeText: 0, fillPath: 0, strokePath: 0, ignoredText: 0 };
  const unsupported = new Set();
  const add = (rect, kind, alpha) => {
    ++counts[kind];
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new Error('Invalid PDF paint opacity');
    if (alpha === 0 || mupdf.Rect.isEmpty(rect)) return;
    if (rect.some(value => !Number.isFinite(value) || Math.abs(value) > 1_000_000)) throw new Error('Invalid vector bounds');
    bounds = bounds ? [Math.min(bounds[0], rect[0]), Math.min(bounds[1], rect[1]), Math.max(bounds[2], rect[2]), Math.max(bounds[3], rect[3])] : rect.slice();
  };
  // The 1.28.1 JS bridge keeps the Path/Text/StrokeState/ColorSpace handles
  // passed to these callbacks. Release them immediately rather than wait for GC.
  const device = new mupdf.Device({
    fillText(text, ctm, colorspace, color, alpha) {
      try { add(text.getBounds(null, ctm), 'fillText', alpha); }
      finally { text.destroy(); colorspace.destroy(); }
    },
    strokeText(text, stroke, ctm, colorspace, color, alpha) {
      try { add(text.getBounds(stroke, ctm), 'strokeText', alpha); }
      finally { text.destroy(); stroke.destroy(); colorspace.destroy(); }
    },
    fillPath(path, evenOdd, ctm, colorspace, color, alpha) {
      try { add(path.getBounds(null, ctm), 'fillPath', alpha); }
      finally { path.destroy(); colorspace.destroy(); }
    },
    strokePath(path, stroke, ctm, colorspace, color, alpha) {
      try { add(path.getBounds(stroke, ctm), 'strokePath', alpha); }
      finally { path.destroy(); stroke.destroy(); colorspace.destroy(); }
    },
    ignoreText(text) { ++counts.ignoredText; text.destroy(); },
    clipPath(path) { unsupported.add('clipPath'); path.destroy(); },
    clipStrokePath(path, stroke) { unsupported.add('clipStrokePath'); path.destroy(); stroke.destroy(); },
    clipText(text) { unsupported.add('clipText'); text.destroy(); },
    clipStrokeText(text, stroke) { unsupported.add('clipStrokeText'); text.destroy(); stroke.destroy(); },
    fillImage() { unsupported.add('image'); },
    fillImageMask(image, ctm, colorspace) { unsupported.add('imageMask'); colorspace.destroy(); },
    clipImageMask() { unsupported.add('clipImageMask'); },
    fillShade() { unsupported.add('shade'); },
    beginMask(area, luminosity, colorspace) { unsupported.add('mask'); colorspace.destroy(); },
    beginGroup(area, colorspace) { unsupported.add('transparencyGroup'); colorspace.destroy(); },
    beginTile() { unsupported.add('tile'); return 0; },
    beginLayer() { unsupported.add('optionalContentLayer'); },
  });
  try { page.runPageContents(device, mupdf.Matrix.identity); device.close(); }
  finally { device.destroy(); }
  if (unsupported.size) throw new Error(`Unsupported formula PDF drawing feature: ${[...unsupported].join(', ')}`);
  if (!bounds) throw new Error('Formula PDF has no visible vector ink');
  return { bounds, counts };
}

/**
 * Get a conservative vector ink box, add margin, and alter only PDF page boxes.
 * MuPDF's text bounds include its built-in 1 bp glyph-cache safety expansion;
 * this is not a claim of pixel-tight bounds. Start from a generous TeX page.
 */
export function cropPDFToVectorBounds(input, { marginTeXPt = 2, requireInkInsidePage = true, maxPageBp = 14400 } = {}) {
  if (!(input instanceof Uint8Array || input instanceof ArrayBuffer)) throw new TypeError('Expected PDF bytes');
  if (!Number.isFinite(marginTeXPt) || marginTeXPt < 0 || marginTeXPt > 100) throw new RangeError('Invalid margin');
  const doc = mupdf.Document.openDocument(new Uint8Array(input), 'application/pdf');
  let page, object, output;
  try {
    if (!(doc instanceof mupdf.PDFDocument) || doc.countPages() !== 1) throw new Error('Expected one generated PDF page');
    page = doc.loadPage(0);
    object = page.getObject();
    const rotate = valueOf(object, 'Rotate', 0, true);
    const userUnit = valueOf(object, 'UserUnit', 1);
    if (rotate !== 0 || userUnit !== 1) throw new Error('Generated formula PDF must have Rotate=0 and UserUnit=1');
    const annotations = valueOf(object, 'Annots', []);
    if (annotations.length) throw new Error('Generated formula PDF must not contain annotations');
    const mediaBox = valueOf(object, 'MediaBox', null, true);
    const cropBox = valueOf(object, 'CropBox', mediaBox, true);
    if (!Array.isArray(mediaBox) || mediaBox.length !== 4 || !sameRect(mediaBox, cropBox)) throw new Error('Generated PDF requires equal MediaBox and CropBox');
    const originalBounds = page.getBounds();
    const transformPDFToMuPDF = page.getTransform();
    // Verified against 1.28.1 pdf-page.c and offset-origin fixtures. Despite
    // the prose description in some docs, this maps PDF user space to MuPDF.
    const expected = [1, 0, 0, -1, -mediaBox[0], mediaBox[3]];
    if (!sameRect(transformPDFToMuPDF, expected)) throw new Error('Unexpected generated PDF page transform');
    const { bounds: vectorBounds, counts } = measure(page);
    const safeInside = vectorBounds[0] >= originalBounds[0] && vectorBounds[1] >= originalBounds[1] && vectorBounds[2] <= originalBounds[2] && vectorBounds[3] <= originalBounds[3];
    if (requireInkInsidePage && !safeInside) throw new Error('Source PDF may already clip ink; compile with a larger staging margin first');
    const marginBp = marginTeXPt * BP_PER_TEX_PT;
    const cropMuPDF = roundOut([vectorBounds[0] - marginBp, vectorBounds[1] - marginBp, vectorBounds[2] + marginBp, vectorBounds[3] + marginBp]);
    const cropPDF = roundOut(mupdf.Rect.transform(cropMuPDF, mupdf.Matrix.invert(transformPDFToMuPDF)));
    if (cropMuPDF[2] - cropMuPDF[0] > maxPageBp || cropMuPDF[3] - cropMuPDF[1] > maxPageBp) throw new Error('Formula page is too large');
    // Set both raw PDF boxes using the same saved transform. Sequential
    // setPageBox calls would otherwise recompute the coordinate origin.
    object.put('MediaBox', cropPDF).destroy();
    object.put('CropBox', cropPDF).destroy();
    for (const box of ['TrimBox', 'BleedBox', 'ArtBox']) object.delete(box);
    output = doc.saveToBuffer('compress');
    const pdf = output.asUint8Array().slice();
    return {
      pdf,
      report: { method: 'MuPDF 1.28.1 vector Device bounds; page-box mutation only', originalBoundsBp: originalBounds, conservativeInkBoundsBp: vectorBounds, stagingInkInsidePage: safeInside, marginTeXPt, marginBp, cropMuPDFBp: cropMuPDF, newPDFMediaBox: cropPDF, pageTransformPDFToMuPDF: transformPDFToMuPDF, paintCounts: counts },
    };
  } finally { output?.destroy(); object?.destroy(); page?.destroy(); doc.destroy(); }
}
