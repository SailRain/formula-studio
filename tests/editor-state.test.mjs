import test from 'node:test';
import assert from 'node:assert/strict';
import {SourceHistory, insertSourceTemplate, nextPlaceholder, hasPlaceholder, visualCompatibilityReason} from '../src/editor/editor-state.mjs';
import {categories, examples} from '../src/editor/templates.mjs';
import {validateMathInput} from '../core/validate-math.mjs';

test('source history preserves bytes, branches on edits, and clear destroys undo and redo', () => {
  const history = new SourceHistory();
  const raw = '  \\frac{a}{b}\n';
  history.record(raw); history.record(raw + 'x');
  assert.equal(history.undo(), raw); assert.equal(history.redo(), raw + 'x');
  history.undo(); history.record(raw + 'y'); assert.equal(history.canRedo, false);
  assert.equal(history.undo(), raw);
  history.reset(); assert.deepEqual(history.values, ['']);
  assert.equal(history.canUndo, false); assert.equal(history.canRedo, false);
  assert.equal(history.undo(), ''); assert.equal(history.redo(), '');
});

test('history is bounded and does not skip the most recent editable state', () => {
  const history = new SourceHistory(3);
  for (const value of ['a','b','c','d']) history.record(value);
  assert.deepEqual(history.values, ['b','c','d']);
  assert.equal(history.undo(), 'c'); assert.equal(history.undo(), 'b');
  assert.equal(history.canUndo, false); assert.equal(history.redo(), 'c');
});

test('source templates preserve surrounding text and wrap the exact selection', () => {
  const raw = '  a + b\n';
  const inserted = insertSourceTemplate(raw, 2, 7, String.raw`\frac{#0}{#?}`);
  assert.equal(inserted.value, '  \\frac{a + b}{□}\n');
  assert.equal(inserted.value.slice(inserted.start, inserted.end), '□');
  const bare = insertSourceTemplate('x', 0, 0, String.raw`\alpha`);
  assert.equal(bare.value, String.raw`\alpha x`);
  assert.equal(insertSourceTemplate('β', 0, 0, String.raw`\alpha`).value, String.raw`\alpha β`);
  assert.equal(insertSourceTemplate('𝑥', 0, 0, String.raw`\alpha`).value, String.raw`\alpha 𝑥`);
  const ordinary = insertSourceTemplate('x', 1, 1, '+');
  assert.equal(ordinary.value, 'x+'); assert.equal(ordinary.start, 2);
  const literalSelection = insertSourceTemplate('a#?b#0c', 0, 7, String.raw`\frac{#0}{#?}`);
  assert.equal(literalSelection.value, String.raw`\frac{a#?b#0c}{□}`);
});

test('placeholder navigation moves both ways, wraps, and leaves ordinary Tab alone', () => {
  const raw = '□+□+□';
  assert.equal(nextPlaceholder(raw, 0, 1), 2);
  assert.equal(nextPlaceholder(raw, 4, 5), 0);
  assert.equal(nextPlaceholder(raw, 2, 3, true), 0);
  assert.equal(nextPlaceholder(raw, 0, 1, true), 4);
  assert.equal(nextPlaceholder('x+y', 0, 0), null);
  assert.equal(nextPlaceholder(String.raw`x+\placeholder{}+y`, 0, 0), 2);
  assert.equal(hasPlaceholder(String.raw`\frac{\placeholder{}}{x}`), true);
  assert.equal(hasPlaceholder('x+□'), true); assert.equal(hasPlaceholder('x+y'), false);
});

test('known semantic mismatches cannot pass through a visually identical roundtrip', () => {
  for (const raw of [String.raw`\varTheta`, String.raw`\boldsymbol{x}`, String.raw`\symbfit{Q}`, String.raw`\mat{P}`, String.raw`\vect{v}`, String.raw`\eu`, String.raw`\mathrm{\phi}`, String.raw`\mathbf{α}`])
    assert.notEqual(visualCompatibilityReason(raw), '', raw);
  for (const raw of ['', 'x+y', String.raw`\phi+\varphi+\epsilon+\varepsilon`, String.raw`\mathrm{d}x`])
    assert.equal(visualCompatibilityReason(raw), '', raw);
});

test('every offered template and fixed example fits the actual compiler grammar when filled', () => {
  for (const category of categories) for (const item of category.items) {
    const filled = item.latex.replace(/#0|#\?/g, 'x');
    const result = validateMathInput(filled);
    assert.equal(result.ok, true, `${category.label}: ${item.title}: ${result.error?.message}`);
  }
  for (const [name, raw] of Object.entries(examples)) {
    const result = validateMathInput(raw);
    assert.equal(result.ok, true, `${name}: ${result.error?.message}`);
    assert.equal(result.source, raw);
  }
});
