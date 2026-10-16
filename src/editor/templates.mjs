const t = (label, title, latex, sourceOnly = false) => ({label, title, latex, sourceOnly});
export const categories = [
  {id:'common', label:'常用', items:[t('a/b','分式',String.raw`\frac{#0}{#?}`),t('√','平方根',String.raw`\sqrt{#0}`),t('xⁿ','上标','#0^{#?}'),t('xₙ','下标','#0_{#?}'),t('±','正负',String.raw`\pm`),t('×','乘号',String.raw`\times`),t('·','点乘',String.raw`\cdot`),t('≤','小于等于',String.raw`\leq`),t('≥','大于等于',String.raw`\geq`),t('≠','不等于',String.raw`\neq`),t('≈','约等于',String.raw`\approx`),t('∞','无穷',String.raw`\infty`),t('→','右箭头',String.raw`\to`),t('∈','属于',String.raw`\in`)]},
  {id:'greek', label:'希腊字母', items:[...['alpha','beta','gamma','delta','epsilon','varepsilon','theta','vartheta','lambda','mu','pi','rho','sigma','phi','varphi','omega','Gamma','Delta','Theta','Lambda','Pi','Sigma','Phi','Omega'].map((command,index)=>t(['α','β','γ','δ','ϵ','ε','θ','ϑ','λ','μ','π','ρ','σ','ϕ','φ','ω','Γ','Δ','Θ','Λ','Π','Σ','Φ','Ω'][index],command,'\\'+command)),t('ϴ','大写 Theta 变体（源码）',String.raw`\varTheta`,true)]},
  {id:'fraction', label:'分式', items:[t('a/b','分式',String.raw`\frac{#0}{#?}`),t('a⁄b','显示分式',String.raw`\dfrac{#0}{#?}`),t('½','紧凑分式',String.raw`\tfrac{#0}{#?}`),t('(ⁿₖ)','二项式',String.raw`\binom{#0}{#?}`)]},
  {id:'roots', label:'根式', items:[t('√x','平方根',String.raw`\sqrt{#0}`),t('ⁿ√x','n 次根',String.raw`\sqrt[#?]{#0}`)]},
  {id:'scripts', label:'上下标', items:[t('xⁿ','上标','#0^{#?}'),t('xₙ','下标','#0_{#?}'),t('xⁿₖ','上下标','#0_{#?}^{#?}'),t('x̄','上划线',String.raw`\overline{#0}`),t('x̂','帽子重音',String.raw`\hat{#0}`),t('x⃗','向量箭头',String.raw`\vec{#0}`),t('ẋ','点重音',String.raw`\dot{#0}`),t('𝐱','粗斜体（源码）',String.raw`\boldsymbol{#0}`,true)]},
  {id:'limits', label:'极限 / 对数', items:[t('lim','极限',String.raw`\lim_{#?\to #?}#0`),t('log','对数',String.raw`\log_{#?}#0`),t('ln','自然对数',String.raw`\ln #0`),t('exp','指数',String.raw`\exp\left(#0\right)`),t('max','最大值',String.raw`\max_{#?}#0`),t('min','最小值',String.raw`\min_{#?}#0`)]},
  {id:'trig', label:'三角函数', items:['sin','cos','tan','cot','sec','csc','arcsin','arccos','arctan','sinh','cosh','tanh'].map(command=>t(command,command,'\\'+command+' #0'))},
  {id:'integrals', label:'积分', items:[t('∫','积分',String.raw`\int #0\,\mathrm{d}#?`),t('∫ᵇₐ','定积分',String.raw`\int_{#?}^{#?}#0\,\mathrm{d}#?`),t('∬','二重积分',String.raw`\iint_{#?}#0`),t('∭','三重积分',String.raw`\iiint_{#?}#0`),t('∮','闭合积分',String.raw`\oint_{#?}#0`)]},
  {id:'sums', label:'求和 / 积', items:[t('∑','求和',String.raw`\sum_{#?}^{#?}#0`),t('∏','连乘',String.raw`\prod_{#?}^{#?}#0`),t('⋃','并集',String.raw`\bigcup_{#?}^{#?}#0`),t('⋂','交集',String.raw`\bigcap_{#?}^{#?}#0`)]},
  {id:'brackets', label:'括号', items:[t('( )','伸缩圆括号',String.raw`\left(#0\right)`),t('[ ]','伸缩方括号',String.raw`\left[#0\right]`),t('{ }','伸缩大括号',String.raw`\left\{#0\right\}`),t('| |','绝对值',String.raw`\left|#0\right|`),t('‖ ‖','范数',String.raw`\left\lVert #0\right\rVert`),t('〈 〉','尖括号',String.raw`\left\langle #0\right\rangle`),t('⌊ ⌋','下取整',String.raw`\left\lfloor #0\right\rfloor`)]},
  {id:'matrices', label:'矩阵', items:[t('(₂×₂)','2 × 2 圆括号矩阵',String.raw`\begin{pmatrix}#?&#?\\#?&#?\end{pmatrix}`),t('[₂×₂]','2 × 2 方括号矩阵',String.raw`\begin{bmatrix}#?&#?\\#?&#?\end{bmatrix}`),t('|₂×₂|','2 × 2 行列式',String.raw`\begin{vmatrix}#?&#?\\#?&#?\end{vmatrix}`),t('(₃×₃)','3 × 3 圆括号矩阵',String.raw`\begin{pmatrix}#?&#?&#?\\#?&#?&#?\\#?&#?&#?\end{pmatrix}`),t('(₃×₁)','列向量',String.raw`\begin{pmatrix}#?\\#?\\#?\end{pmatrix}`),t('⋯','横向省略号',String.raw`\cdots`),t('⋮','纵向省略号',String.raw`\vdots`),t('⋱','斜向省略号',String.raw`\ddots`)]},
  {id:'aligned', label:'分段 / 对齐', items:[t('{ f','两段函数',String.raw`\begin{cases}#?&#?\\#?&#?\end{cases}`),t('= =','两行对齐',String.raw`\begin{aligned}#?&=#?\\#?&=#?\end{aligned}`),t('≡ ≡','三行对齐',String.raw`\begin{aligned}#?&=#?\\#?&=#?\\#?&=#?\end{aligned}`)]},
];

export const examples = {
  gaussian: String.raw`\int_0^\infty \mathrm{e}^{-x^2}\,\mathrm{d}x=\frac{\sqrt{\pi}}{2}`,
  fraction: String.raw`\frac{-b+\sqrt{b^2-4ac}}{2a}`,
  matrix: String.raw`P=\begin{pmatrix}0.7&0.3\\0.4&0.6\end{pmatrix}`,
  system: String.raw`\begin{aligned}x+y&=3\\2x-y&=0\end{aligned}`,
  vector: String.raw`\boldsymbol{v}=\begin{pmatrix}x\\y\\z\end{pmatrix}`,
};
