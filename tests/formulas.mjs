export const formulas = [
  {id:'linear-system',latex:String.raw`\boldsymbol{x}_{n+1}=\mu\boldsymbol{x}_n+\boldsymbol{G}\boldsymbol{F}(\boldsymbol{x}_n)`},
  {id:'three-equations',latex:String.raw`\left\{\begin{aligned}x_{1,n+1}&=\mu x_{1,n}+2\sin x_{2,n},\\x_{2,n+1}&=\mu x_{2,n}+2\cos x_{3,n},\\x_{3,n+1}&=\mu x_{3,n}-2\tanh x_{1,n}.\end{aligned}\right.`},
  {id:'eigenvalues',latex:String.raw`\lambda_{2,3}=\mu-\frac{a}{2}\pm\mathrm{i}\frac{\sqrt{3}a}{2}`},
  {id:'ohms',latex:String.raw`R_\mu=\frac{10\,\mathrm{k}\symup{\Omega}}{\mu}`},
  {id:'gaussian-integral',latex:String.raw`\int_0^\infty\mathrm{e}^{-x^2}\,\mathrm{d}x=\frac{\sqrt{\pi}}{2}`},
  {id:'font-styles',latex:String.raw`\begin{aligned}\mathrm{ABCxyz0123}&\quad\mathit{ABCxyz}\quad\mathbf{ABCxyz0123}\\\symup{\Gamma\Delta\Omega\alpha\beta\mu}&\quad\symit{\Gamma\Delta\Omega\alpha\beta\mu}\\\symbfup{\Gamma\Delta\Omega\alpha\beta\mu}&\quad\boldsymbol{\Gamma\Delta\Omega\alpha\beta\mu}\\\phi\quad\varphi\quad\epsilon\quad\varepsilon&\quad+\;-\;\pm\;\times\;\div\;=\;<\;>\;\leq\;\geq\;\neq\;\approx\end{aligned}`},
  {id:'nested-fractions',latex:String.raw`\frac{1+\frac{a}{b}}{\sqrt{1+\frac{x^2}{y^2}}}`},
  {id:'scripts',latex:String.raw`\sqrt[3]{x_{i_{j}}^{n+1}}+\sum_{k=0}^{N}\frac{a_k}{k!}`},
  {id:'matrix',latex:String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}\quad\begin{vmatrix}a&b\\c&d\end{vmatrix}=ad-bc`},
  {id:'cases',latex:String.raw`f(x)=\begin{cases}x^2,&x\ge0,\\-x,&x<0.\end{cases}`},
  {id:'accents',latex:String.raw`\hat{x}+\widehat{ABC}+\vec{v}+\overrightarrow{AB}+\dot{x}+\ddot{x}+\bar{\mu}`},
  {id:'scalable-delimiters',latex:String.raw`\left\langle\frac{\sqrt{x}}{1+x^2}\right\rangle+\left[\prod_{k=1}^{n}\left(1+\frac1{k}\right)\right]`},
];
export const negativeFormulas = [
  {id:'undefined-command',latex:String.raw`\NotARealCommand{x}`},
  {id:'missing-brace',latex:String.raw`\frac{1}{x`},
];
// Generic matrix, radical, and integral geometry regression fixtures.
export const structureFormulas = [
  {id:'matrix-radical',latex:String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}\sqrt{\frac{a}{a}}`},
  {id:'radical-heights',latex:String.raw`\sqrt{x}\quad\sqrt{\frac{a}{b}}\quad\sqrt{\frac{1+\frac{a}{b}}{x^2}}\quad\sqrt[3]{x}`},
  {id:'definite-integral',latex:String.raw`\exp\!\left[-\frac{1}{C}\int_{t_0}^{t}G(v_\varphi)\,\mathrm{d}\tau\right]`},
];
// Generic rate-matrix, transition-matrix, and random-sum fixtures.
export const referenceFormulas = [
  {id:'reference-rate-matrix',latex:String.raw`\mat{Q}=\begin{bmatrix}-2&1&1\\3&-5&2\\0&4&-4\end{bmatrix}`},
  {id:'reference-transition-matrix',latex:String.raw`\mat{P}=\begin{bmatrix}0.7&0.3\\0.4&0.6\end{bmatrix}`},
  {id:'reference-poisson-sum',latex:String.raw`Y(t)=\sum_{n=1}^{N(t)}X_n`},
];
