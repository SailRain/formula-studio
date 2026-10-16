// Approved generic output fixtures. Changing these is a deliberate baseline change.
import {formulas, referenceFormulas, structureFormulas} from './formulas.mjs';
const probes = [...structureFormulas, {
  id:'text-families',
  latex:String.raw`\textsf{ABCxyz0123}\quad\texttt{ABCxyz0123}\quad\mathsf{ABCxyz0123}\quad\mathtt{ABCxyz0123}`,
}];
export const engineOutputCases = [
  ...formulas.flatMap(item => [10,12].map(sizePt => ({...item, sizePt, arrayStretch:1}))),
  ...probes.flatMap(item => [10,12].map(sizePt => ({...item, sizePt, arrayStretch:1}))),
  ...referenceFormulas.map(item => ({...item, sizePt:10, arrayStretch:1.08})),
].map(item => ({...item, key:`${item.id}-${item.sizePt}`}));
