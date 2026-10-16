# Formula Studio · 公式工作台

[**在线使用**](https://sailrain.github.io/formula-studio/) · [English](README.md) · **简体中文**

在浏览器中编辑 LaTeX 公式，以 Times New Roman 排版，并导出 PNG、SVG 和 PDF。无需安装本地 LaTeX、注册账号、提供 API 密钥或运行应用服务器。

## 功能

- 支持 LaTeX 源码和可视化编辑，提供分类模板和公式示例。
- 在浏览器 Worker 中运行真正的 XeTeX → PDF 排版流程；准确预览与导出共用同一次编译结果。
- 配置的拉丁字母、数字、希腊字母和运算符范围使用 Times New Roman 2.82；数学符号和缺失字形由 TeX Gyre Termes Math 提供。不自动替换输入的公式命令。
- 导出紧密裁切的矢量 PDF、字形轮廓 SVG，以及 300 / 600 dpi、透明 / 白底 PNG。导出字号支持 8、10、12、16、20、24 pt。
- PNG 和 SVG 支持复制，并提供独立的紧凑下载按钮。浏览器支持时，SVG 同时提供原生矢量剪贴板数据；否则复制 SVG 源码。
- 提供英语和简体中文。每次新打开或刷新均默认英语、LaTeX 源码模式，不保存语言偏好。
- 公式和结果在页面内存中处理；应用不会上传公式或结果，也不将其存入浏览器存储。静态程序和字体资源可由浏览器正常缓存。

## 在线使用

打开 **[公式工作台](https://sailrain.github.io/formula-studio/)**，输入公式片段，点击 **更新准确预览**（⌘Enter / Ctrl+Enter）。不要包含 `$`、`\[`、文档类或完整 LaTeX 文档。

```latex
\sqrt{\frac{a}{b}}
```

```latex
\begin{pmatrix}1&2\\3&4\end{pmatrix}
\quad
\int_0^\infty \mathrm{e}^{-x^2}\,\mathrm{d}x
=\frac{\sqrt{\pi}}{2}
```

编译前请填完模板中的 `□` 占位位置；使用 Tab / Shift+Tab 在位置之间移动。修改导出设置后，需要更新预览；预览缩放仅影响显示尺寸。**清空**会释放当前公式、结果和撤销历史，但不会清除系统剪贴板。

首次编译需要加载浏览器排版组件，可能较慢。**取消**会停止当前 Worker；再次点击 **更新准确预览**即可重新尝试。

## 本地运行

需要 Node.js **22**，以及用于预览服务器的 Python **3**。运行依赖、字体和 TeX 资源均已随仓库提供，无需 `npm install` 或系统 TeX 环境。

```sh
git clone https://github.com/SailRain/formula-studio.git
cd formula-studio
node scripts/verify-license-materials.mjs
node --test tests/*.test.mjs
node scripts/build.mjs
python3 scripts/serve-preview.py --pages
```

打开 <http://127.0.0.1:8768/formula-studio/>。同一服务器也支持根路径 <http://127.0.0.1:8768/>。`--pages` 模拟 GitHub Pages 不提供自定义安全响应头的环境，HTML 中的内容安全策略仍然生效；省略此参数可使用开发服务器额外的响应头。需要其他端口时，可添加 `--port 9000`。

构建会校验未修改的微软字体原包、三个 MuPDF 分发文件，以及保留的第三方许可、源码和排版回归材料。在 Git 检出目录中，还会确认这三个 MuPDF 文件已被跟踪，避免干净克隆依赖被忽略的本地文件。静态输出包含 `LICENSES/` 下的对应上游源码和 `sources/` 下的确定性应用源码归档；只有主动打开时才会下载这些材料。

## 部署自己的版本

1. Fork 本仓库，并启用 GitHub Actions。
2. 打开 **Settings → Pages → Build and deployment**，将发布来源设为 **GitHub Actions**。
3. 向 `main` 推送更新，或在 Actions 页面手动运行 **Check and publish GitHub Pages**。
4. 部署成功后，使用 `github-pages` 环境显示的网址。项目仓库的网址通常以 `/仓库名/` 结尾。

Pull request 会执行许可校验、测试和构建，不发布网站。只有 `main` 更新并通过检查后才部署。工作流使用 Node.js 22，并将官方 GitHub Actions 固定到不可变的提交哈希。

也可以将生成的 `dist/` 放到其他静态 HTTPS 主机，支持域名根路径或子目录。主机应以 `application/wasm` 提供 `.wasm` 文件，并为 JavaScript 模块提供正确类型。请通过 HTTP(S) 访问，不要使用 `file://`。无需后端、私密令牌、跨域服务或常驻 Worker 服务。再次分发时，应保留相应许可与源码材料。

## 限制与兼容性

- 这是公式编辑器，不是完整 LaTeX 文稿编辑器。有限的输入语法支持常用数学命令、矩阵、分段函数和对齐公式；不支持自定义宏、文件操作、加载宏包或任意 TeX。输入上限为 10,000 个字符，另有结构复杂度限制。
- 如果可视化模式无法完整保留输入源码，系统会保留原文并说明限制。默认使用源码模式。
- 准确预览使用配置的 Times New Roman / TeX Gyre 字体。可视化输入区的即时显示使用编辑器自身字体；请以 **更新准确预览** 后的结果判断导出效果。
- WebAssembly 编译运行期间会使用访问者设备的 CPU 和内存，无需本地 TeX 环境或后台常驻服务。
- 剪贴板功能需要 HTTPS（或 localhost）、浏览器许可及用户直接点击。矢量粘贴效果取决于接收应用；复制不受支持或被拒绝时，仍可下载文件。
- SVG 使用自包含字形轮廓，接收设备无需安装字体。受引擎字体映射影响，PDF 的部分数学字符可能无法正确复制为文字；矢量字形以及 PNG / SVG 输出不受影响。
- 当前验收浏览器为 Chrome 和 Safari。不同浏览器版本和接收应用的剪贴板能力可能不同。

## 源码与许可

Formula Studio 原创代码采用 **[MIT 许可证](LICENSE)**，版权标注为 **2026 Pierson Bian**。第三方组件各自保留原许可；**整个分发包并非全部采用 MIT**。

重新分发或更改随附组件前，请阅读 **[第三方许可与源码索引](LICENSES/README.md)** 和 **[源码清单](LICENSES/source-manifest.json)**。SwiftLaTeX 和 MuPDF 包含 AGPL 覆盖的代码，字体和 TeX 包分别适用各自许可；对应源码与构建材料在索引中说明，分发时须遵守相关交付要求。

Times New Roman 仅以完整、未修改的 `times32.exe` 原始发布包提供，并保留微软 EULA。字体在浏览器内存中解包，不发布独立提取的字体文件。MIT 不会授予额外的微软字体使用权。在线工具免费、无广告、无付费功能；Fork 发布者须自行阅读并遵守字体原包的许可条款。

应用内的 **字体与开源许可** 页面也提供相应署名和许可原文。第三方许可证原文保持原语言，不翻译或修改。

反馈问题或建议时，请 [创建 issue](https://github.com/SailRain/formula-studio/issues)，并提供最小公式示例和浏览器版本。请勿提交私人文稿或敏感内容。
