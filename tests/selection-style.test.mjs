import test from 'node:test';
import assert from 'node:assert/strict';
import {fromVisualStyle,toVisualStyle,plainSelection,applySelectionStyle} from '../src/editor/selection-style.mjs';
import {validateMathInput} from '../core/validate-math.mjs';

test('MathLive bold serialization is explicitly mapped, without changing Greek variants',()=>{
  for(const raw of [String.raw`\mathbf{\mathbfit{A\phi\varphi}}`,String.raw`\bm{\mathbfit{A\phi\varphi}}`]) {
    const source=fromVisualStyle(raw);
    assert.equal(source,String.raw`\symbfit{A\phi\varphi}`);
    assert.equal(toVisualStyle(source),String.raw`\mathbfit{A\phi\varphi}`);
    assert.equal(validateMathInput(source).ok,true);
  }
  assert.equal(fromVisualStyle(String.raw`\mathnormal{x123}`),String.raw`\symit{x123}`);
  assert.equal(toVisualStyle(String.raw`\symit{x123}`),String.raw`\mathnormal{x123}`);
  assert.equal(fromVisualStyle(String.raw`\bm{\alpha}`),String.raw`\mathbf{\alpha}`);
  assert.equal(fromVisualStyle(String.raw`\mathbf{\mathbfit{x}_1}`),String.raw`\mathbf{\symbfit{x}_1}`);
  assert.equal(fromVisualStyle(String.raw`\mathrm{d}x+\frac{a}{b}`),String.raw`\mathrm{d}x+\frac{a}{b}`);
});
test('literal text conversion retains spaces and rejects mathematical structure',()=>{
  assert.equal(plainSelection(String.raw`\text{speed limit}`),'speed limit');
  assert.equal(plainSelection(String.raw`\mathrm{dx}`),'dx');
  for(const s of [String.raw`\frac{a}{b}`,String.raw`\sqrt{x}`,'x_1',String.raw`\alpha`])assert.throws(()=>plainSelection(s),/style.plainOnly/);
});
test('empty selection never sets a future input style; failed changes restore selection',()=>{
  assert.throws(()=>applySelectionStyle({selection:{ranges:[[0,0]]}},'upright'),/style.selectFirst/);
  let value='x',selection={ranges:[[0,1]]};
  const f={selection,getValue:()=>value,applyStyle(){value='broken';},get errors(){return ['bad'];},setValue(v){value=v;}};
  assert.throws(()=>applySelectionStyle(f,'vector'),/style.failed/);
  assert.equal(value,'x');assert.deepEqual(f.selection,selection);
});
test('a matrix wrapper is a uniform style, but nested conflicting styles are mixed',async()=>{
  const {selectedStyle}=await import('../src/editor/selection-style.mjs');
  const field={selection:{ranges:[[0,5]]},queryStyle:()=> 'some',getValue:()=>String.raw`\mathbf{\begin{pmatrix}a&b\\c&d\end{pmatrix}}`};
  assert.equal(selectedStyle(field),'bold');
  field.getValue=()=>String.raw`\mathbf{a\mathrm{b}}`;
  assert.equal(selectedStyle(field),'mixed');
});
