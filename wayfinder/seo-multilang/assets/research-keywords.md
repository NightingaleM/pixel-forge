# 四语种 SEO 关键词与竞品用语研究（en/ja/es/pt）

- 研究票：wayfinder/seo-multilang「四语种 SEO 关键词与竞品用语」
- 日期：2026-10-21
- 方法：
  - 真实查询词 = Google Suggest 官方接口（`suggestqueries.google.com/complete/search?client=firefox`，hl/gl 按语种：en+us / ja+jp / es+es / pt+br），共 3 批 ~70 个种子词，原始返回见附录 A。Suggest 返回的是真实用户输入过的补全，属需求侧证据。
  - 竞品用语 = 直接 HTTP 抓取页面（urllib + Chrome UA），逐字提取 `<title>` / meta description / H1，未翻译。取证清单见第 2 节。
  - 本地事实 = `src/lib/StyleRegistry.ts`（15 风格实名）、`src/i18n/zh.json` / `en.json`（现行 meta.*）、`src/lib/pageMeta.ts`（页面集：home / 2d / 3d / about / privacy / terms / help / license）。
- 局限：Canva 全站对脚本抓取返回 403，zhipu 搜索亦未返回其本地化页面标题，Canva 一栏标记为取证失败，不作臆测。PhotoFunia 的 /ja 路径 title 未本地化（返回英文），仅 es/pt 有本地化证据。

---

## 1. 各语种真实查询词 + title/description 骨架

### 1.1 EN（hl=en, gl=us）

**后缀模式（suggest 实证）**：`online` / `online free` / `free` / `no sign up` / `without watermark` / `generator` / `converter` / `maker` / `app`。动词框架：`photo to X`、`turn photo into X`。

| 类别 | 核心词（高需求） | 长尾词（suggest 原样） | 备注 |
|---|---|---|---|
| 总称 | photo to art, photo effects, art filters, photo filter online | photo to art generator / converter / online free; turn photo into art online free; photo effect generator online free | BeFunky 官方主打 "Photo to Art"（见 2 节） |
| 半色调 | halftone effect | halftone generator online free / for dtf / for screen printing; halftone converter online; halftone effect online | DTF/丝网印刷人群是隐藏流量池 |
| 波普 | pop art photo | pop art photo filter / generator; photo to pop art converter free / online free | |
| 素描 | photo to sketch | photo to sketch online free no sign up / without watermark / converter | |
| 像素化 | pixelate image | pixelate image online / free / with grid / generator | |
| 万花筒 | kaleidoscope photo | kaleidoscope photo effect / editor / effect app | |
| ASCII | ascii art generator | ascii art generator from image / image to text | |
| 移轴 | tilt shift | tilt shift effect photo / add tilt shift effect to photos | |
| 色散 | chromatic aberration | chromatic aberration effect online; prism effect photo | chromatic aberration 需求 > prism effect |
| 全息箔 | holographic foil | holographic foil effect / texture / texture free | |
| 玻璃 | glass distortion | glass distortion effect online | |
| 3D | 3d particle effects | 3d particle generator | generator 补全多为 Minecraft 噪声，量小 |
| 反例 | ~~image stylization~~ | 仅补全出 "arbitrary image stylization"（论文标题） | 学术词，无搜索需求，现行 en 标题正在用它 |

**title 骨架**（关键词前置，品牌后置，≤60 字符）：
- home：`Photo to Art — Free Online Art Filters & Effects | PixelForge`
- 2d：`Halftone, Pop Art, Sketch & 15 Art Filters Online Free | PixelForge`
- 3d：`3D Particle Effects from GLTF Models — Free Online | PixelForge`

**description 骨架**（~150 字符，动词开头 + 风格枚举 + 修饰词）：
- home：`Turn photos into art online: halftone, pop art, sketch, kaleidoscope, ASCII and 15 art filters in all. Real-time preview, free, no sign-up — images never leave your browser.`
- 2d：`Free online art filter studio: halftone generator, pop art, pencil sketch, pointillism, kaleidoscope and more. Adjustable presets, no watermark, no sign-up, all in your browser.`
- 3d：`Turn GLTF/GLB models into GPU 3D particle effects online, free. Volumetric sampling, particle & background controls, rendered locally in your browser.`

### 1.2 JA（hl=ja, gl=jp）

**后缀模式（suggest 实证）**：`加工`（第一动词！）/ `変換` / `サイト` / `アプリ` / `ツール` / `無料` / `おしゃれ`。`メーカー` 仅在「万華鏡 メーカー」出现（弱）；`効果`/`エフェクト` 多在 AE/Photoshop/ゲーム语境。竞品官方也用「写真加工」（Fotor jp，见 2 节）。「画像編集サイト」是品类词（Fotor jp title 原文）。

| 类别 | 核心词 | 长尾词（suggest 原样） | 备注 |
|---|---|---|---|
| 总称 | 写真 加工 / 画像編集 オンライン 無料 | 写真 加工 アプリ 無料 人気; 写真 ピクセル アート 変換 | 「写真をアートに」不是主流输入 |
| 半色调 | ハーフトーン 加工 | ハーフトーン 加工 サイト / アプリ; 写真・画像 ハーフトーン 加工 | サイト后缀=网页工具需求 |
| 波普 | 写真 ポップアート | 写真 ポップアート 加工 | |
| 素描 | 写真 スケッチ風 | 写真 スケッチ風 加工 サイト; スケッチ風加工アプリ 無料; スケッチ風 変換 | |
| 像素/点阵 | ドット絵 変換 | ドット絵 変換 サイト / ツール / アプリ; モザイク 加工 サイト / ブラウザ | モザイク=马赛克像素化，量大 |
| 万花筒 | 万華鏡 加工 | 万華鏡 加工アプリ 無料 / サイト; 万華鏡 メーカー; 万華鏡 写真 加工 | |
| ASCII | アスキーアート 変換 | アスキーアート 変換 画像 / ツール; 写真 アスキーアート 変換 | |
| 移轴 | ミニチュア風 加工 | 写真 ミニチュア風 加工; ティルトシフト 写真（弱） | 日语先说「ミニチュア風」 |
| 色散 | 色収差 加工 | 色収差 加工サイト / アプリ; イラスト 加工 色収差 | 色収差是主检索词 |
| 全息 | ホログラム 加工 / ホロ箔 | ホログラム 加工 イラスト / カード / 画像; ホロ箔 カード | 印刷业词 ホロ箔 与效果词 ホログラム加工 并存 |
| 动漫光 | アニメ風 加工 | アニメ風 加工 アプリ 無料 / イラスト | |
| 点彩 | 点描 写真 | 写真 を 点描 に する; 写真 点描 加工 | |
| 文字栅格 | テキスト モザイク | テキスト モザイクアート | |
| 3D | 3d パーティクル | 3d パーティクル エフェクト / 素材 | 语境偏 AE/Unity，小众 |

**title 骨架**（关键词前置，30–40 全角字符内）：
- home：`写真をアートに変える無料オンライン加工ツール｜PixelForge`
- 2d：`ハーフトーン・ポップアート・万華鏡など15種の写真加工 無料・登録なし｜PixelForge`
- 3d：`GLTFモデルを3Dパーティクルエフェクトに変換 無料オンライン｜PixelForge`

**description 骨架**（~120–140 全角字符，「画像はサーバーに送信されません」隐私句式是日区强卖点）：
- home：`写真をハーフトーン、ポップアート、スケッチ風、万華鏡、アスキーアートなど15種のアートに無料で変換。ブラウザ内でリアルタイム処理、画像はサーバーに送信されません。登録不要。`
- 2d：`ハーフトーン加工、ポップアート、点描、ミニチュア風など15種のアート変換をオンラインで。パラメータ調整・プリセット・シード共有対応。無料・透かしなし・登録なし。`
- 3d：`GLTF/GLBモデルをGPUパーティクルエフェクトに変換。ボリュメトリックサンプリングと背景・粒子の調整が可能。ブラウザ内でレンダリング、無料で利用できます。`

### 1.3 ES（hl=es, gl=es）

**后缀模式（suggest 实证）**：`online`（比 "en línea" 更普遍于搜索，竞品 Pixlr/PhotoFunia 用 en línea——两种都合规，搜索侧用 online）/ `gratis` / `sin registro` / `sin marca de agua` / `convertidor` / `generador`。动词框架：`convertir foto en X`、`pasar foto a X`、`transformar`。

| 类别 | 核心词 | 长尾词（suggest 原样） | 备注 |
|---|---|---|---|
| 总称 | efectos para fotos online | efectos para fotos online gratis (sin descargar); convertir foto en arte (en obra de arte); editar fotos online gratis sin registro | |
| 半色调 | efecto semitono | efecto semitono online / en canva / de color photoshop | semitono 为标准印刷译名 |
| 波普 | convertir foto en pop art | convertir foto en pop art online gratis; foto pop art online gratis; pasar foto a pop art online; efecto pop art online gratis | arte pop 与 pop art 混用，搜索侧 pop art 更常见 |
| 素描 | foto a lápiz | foto a lápiz online / online gratis / gratis; foto a boceto lápiz | |
| 像素化 | pixelar imagen | pixelar imagen online / online gratis / en photoshop | |
| 万花筒 | efecto caleidoscopio | efecto caleidoscopio fotos | 量小但真实 |
| 点彩 | efecto puntillismo | efecto puntillismo online / imagen / en canva | |
| ASCII | arte ascii | generador de arte ascii; arte ascii foto | |
| 移轴 | efecto tilt shift | efecto tilt shift online / photoshop / video | 英语借词 tilt shift 保留不译 |
| 色散 | efecto prisma foto | （补全浅）aberración cromática 为摄影标准词 | SEO 双命名：prisma + aberración cromática |
| 全息 | efecto holograma | efecto holograma online / photoshop | holográfico/holograma 均真实 |
| 玻璃 | efecto vidrio foto | （补全浅但存在） | |
| 3D | efectos 3d para fotos online gratis | — | 3D 粒子本身小众 |

**title 骨架**：
- home：`Editor de efectos de arte para fotos online y gratis | PixelForge`
- 2d：`Convierte fotos en arte: semitono, arte pop, puntillismo y más | PixelForge`
- 3d：`Convierte modelos GLTF en efectos de partículas 3D online | PixelForge`

**description 骨架**：
- home：`Convierte tus fotos en arte con 15 efectos artísticos online: semitono, arte pop, boceto a lápiz, caleidoscopio, ASCII y más. Gratis, sin registro y sin subir tus imágenes a ningún servidor.`
- 2d：`Efectos de arte para fotos online y gratis: semitono, pop art, puntillismo, miniatura tilt-shift y más, con vista previa en tiempo real. Sin registro y sin marca de agua.`
- 3d：`Convierte modelos GLTF/GLB en efectos de partículas 3D con muestreo volumétrico. Gratis, online y renderizado local en tu navegador.`

### 1.4 PT-BR（hl=pt, gl=br）

**后缀模式（suggest 实证）**：`online` / `grátis` / `gratuito` / `gerador` / `conversor` / `para celular` / `capcut`（大量剪辑场景迁移词）。动词框架：`transformar foto em X`、`foto em X`、`efeito X`。

| 类别 | 核心词 | 长尾词（suggest 原样） | 备注 |
|---|---|---|---|
| 总称 | efeitos para fotos online grátis | efeitos para fotos online grátis; editor de fotos online grátis (ia / para celular); transformar foto em arte (online / digital / vetorial) | |
| 最大流量词 | foto em desenho | foto em desenho online / animado / preto e branco; foto em desenho a lapis online; transformar foto em desenho a lapis online gratis | 「照片→画」是巴西超级需求，素描风格直接吃这个词 |
| 波普 | transformar foto em pop art | transformar foto em pop art online; foto pop art online gratis; efeito foto pop art | |
| 半色调 | efeito meio tom | efeito meio tom photoshop / illustrator / corel | meio-tom 为印刷标准名 |
| 像素化 | pixelar imagem | pixelar imagem online / photoshop / canva / pixel art | |
| 万花筒 | efeito caleidoscópio | efeito caleidoscópio online / imagem / em foto | |
| 点彩 | pontilhismo | pontilhismo arte / desenho | |
| ASCII | arte ascii | gerador de arte ascii | |
| 移轴 | efeito tilt shift | efeito tilt shift online / como fazer / no celular | |
| 色散 | efeito cromático | efeito cromatico foto; efeito halo cromático | aberração cromática 为标准摄影词，双命名 |
| 全息 | efeito holográfico | efeito holográfico foto | |
| 玻璃 | efeito vidro foto | （补全浅但存在） | |
| 3D | efeitos 3d para fotos online grátis | — | |

**title 骨架**：
- home：`Editor de efeitos artísticos para fotos online grátis | PixelForge`
- 2d：`Transforme fotos em arte: meio-tom, pop art, pontilhismo e mais | PixelForge`
- 3d：`Transforme modelos GLTF em efeitos de partículas 3D online | PixelForge`

**description 骨架**：
- home：`Transforme suas fotos em arte com 15 efeitos artísticos online: meio-tom, pop art, desenho a lápis, caleidoscópio, ASCII e mais. Grátis, sem cadastro e sem enviar suas imagens para servidores.`
- 2d：`Efeitos artísticos para fotos online e grátis: meio-tom, pop art, pontilhismo, caleidoscópio, miniatura tilt-shift e mais, com prévia em tempo real. Sem cadastro e sem marca d'água.`
- 3d：`Transforme modelos GLTF/GLB em efeitos de partículas 3D com amostragem volumétrica. Grátis, online e renderizado no seu navegador.`

---

## 2. 竞品用语取证表（2026-10-21 实抓，原文未翻译）

| 竞品 | 语种/URL | title（原文） | H1 / meta description 要点 | 可借鉴用词 |
|---|---|---|---|---|
| Photopea | en `photopea.com/` | `Photopea \| Online Photo Editor` | H1 `Free Online Photo Editor`；meta "edit photos, apply effects, filters… in your browser for free!" | online photo editor, effects, filters, free, browser |
| Fotor | en `fotor.com/` | `Photo Editor: Free Online Photo Editing & Image Editor \| Fotor` | H1 `Online photo editor for everyone`；meta "Crop, add text & effects, retouch images" | photo editing, effects |
| Fotor | es `fotor.com/es/` | `Editor de fotos: Editar fotos online gratis \| Fotor` | H1 `Editor de fotos online gratis` | **editor de fotos online gratis**（title=H1=核心词，直给） |
| Fotor | pt `fotor.com/pt/` | `Editor de Fotos - Editar Foto Online Gratuito \| Fotor` | H1 `Editor de fotos online gratuito para todos` | gratuito 与 grátis 并用 |
| Fotor | ja `fotor.com/jp/` | `画像編集サイト｜オンラインで無料で写真加工をする｜Fotor` | H1 `無料画像編集サイト`；meta「写真加工…クロップ、文字入れ、エフェクトの追加」 | **写真加工 / 画像編集サイト**——ja 品类词的官方印证 |
| BeFunky | en `befunky.com/features/photo-to-art/` | `Photo to Art: BeFunky - One Click Turns Your Photo Into Art` | H1 `Turn Your Photo Into Art With One Click` | **photo to art / turn photo into art**——en 核心词的最强竞品印证 |
| BeFunky | es `befunky.com/es/` | `Editor De Fotos │ BeFunky: Editor De Fotos Y Diseñador De Collage Gratis` | H1 `Edición de fotos y diseño gráfico hecho para todos` | editor de fotos, gratis |
| Pixlr | es `pixlr.com/es/` | `Editor de fotos en línea gratuito de IA, generador de imágenes y herramienta de diseño` | H1 `Editor de fotos` | en línea（正式文案）vs online（搜索习惯）|
| Pixlr | br `pixlr.com/br/` | `Editor de fotos de IA online grátis, Gerador de imagem & Ferramenta de design` | H1 `Editor de fotos` | **online grátis** 连写模式 |
| PicsArt | en `picsart.com/photo-effects/` | `Photo Filters & Effects - Free & Online` | H1 `Free creative photo filters and effects`；meta "apply artistic filters" | photo filters & effects, free & online, artistic filters |
| PicsArt | es `picsart.com/es/` | `Picsart: la plataforma creativa con IA` | H1 `Crea videos, imágenes y audio…` | 品牌词策略，可借鉴度低 |
| PhotoFunia | es `photofunia.com/es` | `Todos los efectos - PhotoFunia: Editor de imágenes gratuito en línea con biblioteca de efectos de imagen y filtros de fotos` | meta "efectos de editor de imágenes y filtros de fotos" | **efectos de imagen / filtros de fotos** |
| PhotoFunia | pt `photofunia.com/pt` | `Todos os efeitos - PhotoFunia: Editor de imagens gratuito online com biblioteca de efeitos de imagem e filtros de fotos` | 同上葡语 | efeitos de imagem / filtros de fotos |
| PhotoFunia | ja `photofunia.com/ja` | （title 未本地化，返回英文，取证无效） | — | — |
| FotoJet | ja `fotojet.com/jp/` | `無料オンライングラフィックデザイナー\| コラージュメーカー\| フォトエディタ - FotoJet` | H1 `アイデアを魅力的な芸術作品に変えよう` | フォトエディタ；**コラージュメーカー**（メーカー后缀在品类名中仍活） |
| Canva | en/ja/es/pt | **403 Forbidden（反爬），取证失败** | — | 不作引用 |
| gazolab.jp | ja | 站点已转型图像生成 AI 对比站，非同品类 | — | 排除 |

---

## 3. zh/en 现行 meta 体检清单

对象：`src/i18n/zh.json` / `src/i18n/en.json` 的 `meta.*`（经 `src/lib/pageMeta.ts` 应用于 8 个页面）。

| # | 位置 | 问题 | 证据 | 建议 |
|---|---|---|---|---|
| 1 | en home title `Image Stylization & 3D Particle Animation` | **直译痕迹（zh「图片风格化」→ image stylization）**：学术词，无搜索需求 | suggest：`image stylization` 仅补全出论文标题 "arbitrary image stylization"；无竞品使用 | 改 `Photo to Art — Free Online Art Filters & Effects`（BeFunky 同款主词） |
| 2 | zh/en home + p2d（desc 与 title）`11 种艺术风格 / 11 art styles` | **数字过期**：StyleRegistry 实有 15 个风格（halftone…tiltshift） | `src/lib/StyleRegistry.ts` 逐条清点 = 15 | 全部改 15，并建议机制化（数字由脚本从注册表生成，避免再漂移） |
| 3 | en home desc | 有 "Free, no sign-up" 但缺 `online`、`no watermark` 高频修饰词；缺 converter/generator 句式 | suggest：online free / no sign up / without watermark 为固定搭配 | desc 按 1.1 骨架补齐 |
| 4 | en p2d title `PixelForge 2D Studio - … Art Filters` | `2D Studio` 是内部黑话，用户不搜 "2d studio"；且品牌前置挤压关键词 | 竞品全部关键词前置（BeFunky/Fotor/PicsArt） | 关键词前置、品牌后置，删 "2D Studio" 或置于末尾 |
| 5 | en p3d `3D Particle Studio / particle effects` | "particle animation" 弱于 "particle effects/generator"；GLTF 是差异化关键词应保住 | suggest：`3d particle generator / 3d particle effects` | 用 "3D Particle Effects from GLTF Models" |
| 6 | en desc 风格枚举 `halftone, pop art, sketch and pointillism` | 选词好（都是真实检索词），但缺 kaleidoscope（有独立搜索需求） | suggest：kaleidoscope photo effect | 枚举加入 kaleidoscope，并保留 "and more" |
| 7 | zh home title `图片风格化` | 中文搜索侧更常见「照片变漫画/照片转手绘/图片滤镜/艺术特效」；「风格化」偏圈内词但可保留 | （zh 非本期四语种对象，轻改） | 可加「艺术滤镜/照片特效」类词：`免费在线图片艺术滤镜 & 3D 粒子特效` |
| 8 | zh/en about/privacy/terms/help/license | 无 SEO 硬伤，句式自然；license 页内容正确 | — | 仅随风格数修正联动（about desc 未提数字，无需动） |
| 9 | 结构性 | `pageMeta.ts` 把同一字符串灌入 title/og:title/twitter:title——改词时三处自动同步，无额外工作；但 **ja/es/pt 新增 json 后 noindex/canonical 逻辑无需改动**（语言切换已设计为可重入） | `applyPageMeta` 源码 | 多语种落地只需新增 i18n 文案 + hreflang（不在本票范围，提醒后续票） |
| 10 | 直译预警（写给未来 ja/es/pt 文案作者） | 「风格化」若直译：ja スタイリゼーション／es estilización／pt estilização——三语种 suggest 均无此需求 | 附录 A 全量补全中零出现 | 一律用当地动词框架：ja 加工/変換、es convertir…en、pt transformar…em |

---

## 4. 15 风格术语表（StyleRegistry 实名 × zh/en/ja/es/pt）

证据标记：〔S〕= Google Suggest 实证（2026-10，附录 A）；〔C〕= 竞品页面实证（第 2 节）；〔S〕〔C〕均无 = 标准艺术/印刷/摄影行业词，标注来源类型。SEO 词列 = 页面文案与 keyword 布局应优先采用的检索侧表达（可与 UI 标签不同）。

| id（注册表） | zh（现行） | en | ja | es | pt | SEO 词备注 |
|---|---|---|---|---|---|---|
| halftone | 半色调 | Halftone | ハーフトーン（網点） | Semitono | Meio-tom | en: halftone generator〔S，DTF/丝印红利〕；es: efecto semitono〔S〕；pt: efeito meio tom〔S〕；ja: ハーフトーン 加工 サイト〔S〕 |
| diffusion | 扩散抖动 | Error Diffusion (Dither) | ディザ（誤差拡散） | Dithering (difusión de error) | Dithering (difusão de erro) | 四语种都用 dithering 家族〔S：efecto/efeito dithering〕；「扩散」概念不出现在任何语种的检索词中 |
| popart | 波普艺术 | Pop Art | ポップアート | Arte pop | Arte pop | 四语种全实证：photo to pop art〔S〕/ 写真 ポップアート 加工〔S〕/ convertir foto en pop art〔S〕/ transformar foto em pop art〔S〕；es/pt 检索多用 pop art 不带 arte |
| lightshadow | 光影 | Light & Shadow | 光と影（ライト＆シャドウ） | Luz y sombra | Luz e sombra | 无独立检索需求（行业通用词〔无 S/C〕），作家族化 UI 名即可，SEO 不单独投放 |
| sketch | 素描 | Pencil Sketch | スケッチ風（鉛筆画） | Boceto a lápiz | Desenho a lápiz | en: photo to sketch online free〔S〕；ja: 写真 スケッチ風 加工〔S〕；es: foto a lápiz〔S〕；pt: foto em desenho a lapis〔S，巴西超流量词 foto em desenho 的素描子集〕 |
| pointillism | 点彩 | Pointillism | 点描 | Puntillismo | Pontilhismo | es efecto puntillismo〔S〕、pt pontilhismo〔S〕、ja 点描 写真 加工〔S〕、en 标准艺术史词 |
| kaleidoscope | 万花筒 | Kaleidoscope | 万華鏡 | Caleidoscopio | Caleidoscópio | 全实证：kaleidoscope photo effect〔S〕/ 万華鏡 加工〔S〕/ efecto caleidoscopio fotos〔S〕/ efeito caleidoscópio online〔S〕；注意 es/pt 重音差异 |
| crosshatch | 网纹底稿 | Crosshatch (Screen-tone) | クロスハッチング（スクリーントーン風） | Trama cruzada | Hachura cruzada | 低检索量 UI 词；ja スクリーントーン 为漫画行业标准词，es trama / pt hachura 为制图标准词 |
| animelight | 动画光影 | Anime Light | アニメ風ライティング | Iluminación anime | Iluminação anime | ja: アニメ風 加工〔S〕；es 侧「convertir foto en anime」有真实流量（suggest 出现 convertidor de fotos a anime online）〔S〕可作关联词 |
| textraster | 文字栅格 | Text Mosaic | テキストモザイク（文字モザイク） | Mosaico de texto | Mosaico de texto | ja: テキスト モザイクアート〔S〕；en text mosaic 为既有品类名；es/pt 直译 mosaico de texto 成立（无 S 反证，行业通用构词） |
| ascii | ASCII字符艺术 | ASCII Art | アスキーアート（AA） | Arte ASCII | Arte ASCII | 全实证：ascii art generator from image〔S〕/ アスキーアート 変換〔S〕/ generador de arte ascii〔S〕/ arte ascii〔S〕 |
| glassdistort | 玻璃扭曲 | Glass Distortion | ガラスゆがみ（ガラスディストーション） | Efecto de vidrio | Efeito de vidro | en: glass distortion effect online〔S〕；es: efecto vidrio foto〔S〕；pt: efeito vidro foto〔S〕；ja 无补全证据，UI 建议双写「ガラスゆがみ（グラスワープ）」并靠描述页承接 |
| holofoil | 全息箔 | Holographic Foil | ホロ箔（ホログラム加工） | Efecto holográfico | Efeito holográfico | en: holographic foil effect/texture〔S〕；ja: ホロ箔〔S，印刷业词〕+ ホログラム 加工〔S〕；es: efecto holograma online〔S〕；pt: efeito holográfico foto〔S〕 |
| prism | 棱镜色散 | Prism Dispersion | プリズム分散（色収差） | Dispersión de prisma (aberración cromática) | Dispersão de prisma (aberração cromática) | **双命名**：品牌名 Prism + 检索词。en: chromatic aberration effect online〔S，量 > prism effect〕；ja: 色収差 加工〔S，强〕；pt: efeito cromático/aberração cromática〔S〕；es: efecto prisma foto〔S，浅〕+ 摄影标准词 aberración cromática |
| tiltshift | 移轴微缩 | Tilt-Shift Miniature | ティルトシフト（ミニチュア風） | Tilt-shift (efecto miniatura) | Tilt-shift (efeito miniatura) | 四语种均保留英语借词 tilt shift〔S 全实证〕；ja 主检索词是 ミニチュア風 加工〔S〕；pt 关联 capcut/celular 场景词〔S〕 |

（zh 列为现行 i18n 实名，来源 `src/i18n/zh.json`，供对照，不在重写范围。）

---

## 5. 结论摘要（≤10 行）

1. en 弃用 "image stylization"（零需求学术词，直译痕迹），主词改 **photo to art / art filters / photo effects**——BeFunky 官方 title/H1 原文即为 "Photo to Art / Turn Your Photo Into Art"。
2. en 风格侧最高红利词：**halftone generator**（DTF/丝印人群）、photo to sketch online free no sign up、ascii art generator from image。
3. ja 的动词文化是 **加工/変換**，不是 効果/スタイル；品类词 **写真加工 / 画像編集サイト**（Fotor jp 官方 title 印证）；网页工具后缀 サイト、隐私句式「画像はサーバーに送信されません」是日区差异化卖点。
4. es 骨架 = **convertir foto en arte/pop art** + **efectos para fotos online gratis**；semitono / puntillismo / caleidoscopio / foto a lápiz 全部 suggest 实证。
5. pt-BR 最大流量词是 **foto em desenho**（照片→画）与 **transformar foto em arte**；meio tom / pop art / caleidoscópio / pontilhismo / tilt shift 全实证；修饰词 online grátis / sem cadastro。
6. 通用修饰词四语种：online / free・無料・gratis・grátis；no sign up・登録なし・sin registro・sem cadastro；no/without watermark・透かしなし・sin marca de agua・sem marca d'água。
7. 双命名策略两处：prism 风格挂 chromatic aberration/色収差/aberración cromática 检索词；holofoil 挂 holographic foil/ホログラム 加工/efecto holograma。
8. 现行 meta 两处硬伤：en 主 title 用了直译词 "Image Stylization"；zh/en 全站 **"11 种风格" 数字过期（注册表实为 15）**，建议数字由构建脚本从 StyleRegistry 生成防再漂移。
9. 竞品 title 模式统一为**关键词前置 + 品牌后置 + 免费/在线修饰**（Fotor es title=H1=核心词）；现行 "PixelForge 2D Studio" 品牌前置+黑话模式应反转。
10. 术语表 15×4 已交付（第 4 节），多数词条有 suggest/竞品双实证；弱证据项（ja 玻璃扭曲、es prism）已标注并给出兜底写法。

---

## 附录 A：Google Suggest 原始证据（节选，2026-10-21，client=firefox）

**en（hl=en, gl=us）**
- `photo to art` → photo to art print / artwork / generator / ai / converter / app / **online free**
- `image stylization` → arbitrary image stylization（仅论文，无工具需求）
- `halftone generator` → online free / for dtf / free / app / online / for screen printing / photoshop
- `halftone converter` → a hugging face / free / online / halftone image converter / dot converter
- `photo to sketch online` → free / **free no sign up** / free ai / converter / **free without watermark** / free app
- `pop art photo` → photography / photos / **photo filter** / photoshop / **photo generator**
- `photo to pop art` → converter / converter free / online free / free / ai / app / generator
- `pixelate image` → online / with grid / free / in photoshop / generator / ai
- `kaleidoscope photo` → photos / photography / **photo effect** / photo booth / photo editor
- `ascii art generator` → **from image** / from text / copy and paste / **image to text** / ai
- `chromatic aberration effect` → photoshop / dying light / **online** / in games / davinci resolve
- `prism effect photo` → photoshop / photos / photography / free / action / tutorial / photo editor
- `holographic foil effect` → photoshop / texture / texture png / texture free / texture photoshop
- `glass distortion effect` → photoshop / css / **online** / figma / illustrator
- `tilt shift effect photo` → photoshop / photography / affinity photo / **add tilt shift effect to photos**
- `photo effect generator` → free / online；`photo filter online` → free / free download / ai / free instagram
- `3d particle generator` → minecraft / **3d particle effects**
- `photo effects online free` → photo editor online free / **no sign up** / background change

**ja（hl=ja, gl=jp）**
- `ハーフトーン 加工` → サイト / アプリ / クリスタ / 写真・画像 ハーフトーン 加工 / ae
- `写真 スケッチ風` → 加工アプリ / 加工 / 加工 サイト / 加工アプリ 無料 / 変換
- `写真 ポップアート` → 写真 ポップアート 加工 / 3d ポップアート 写真
- `写真 アート 変換` → 写真 ピクセル アート 変換
- `ドット絵 変換` → サイト / ツール / アプリ / ai / マイクラ / あつ森
- `モザイク 加工` → アプリ / iphone / サイト / おしゃれ / **ブラウザ** / web / パソコン
- `万華鏡 加工` → アプリ 無料 / サイト / アプリ / photoshop / 風 加工 / 画像 万華鏡 加工；`万華鏡 メーカー`（存在，弱）
- `テキスト モザイク` → テキスト モザイクアート
- `アスキーアート 変換` → 文字 / サイト / ツール / 画像 / 器；`写真 アスキーアート` → 変換 / 加工
- `色収差 加工` → 加工サイト / アプリ / 画像・イラスト 加工 色収差 / クリスタ
- `ミニチュア風 加工` → 動画 / 写真 / フォトショップ；`ティルトシフト 写真`（存在，弱）
- `アニメ風 加工` → イラスト / クリスタ / アプリ 無料
- `点描 写真` → 写真 を 点描 に する / 写真 点描 加工
- `ホログラム 加工` → photoshop / イラスト / カード / とは / シール / 印刷 / 画像；`ホロ箔` → ホロ箔押しとは / カード
- `3d パーティクル` → エフェクト 素材 集 / 素材 / エフェクト / ae / unity
- `写真 加工 アプリ` → 無料 / おすすめ / 顔 / 無料 人気 / モザイク / ぼかし；`画像編集 オンライン 無料`

**es（hl=es, gl=es）**
- `convertir foto en arte` → arte lineal / **arte pop** / gratis / abstracto / vectorial / **arte ascii** / obra de arte
- `convertir foto en pop art` → online gratis / gratis / **convertir foto en arte pop** / a pop art online / photoshop
- `foto pop art online` → gratis / convertir foto en pop art online gratis / pasar foto a pop art online
- `efecto semitono` → photoshop / illustrator / **online** / de color photoshop / after effects / affinity / **en canva**
- `foto a lápiz` → online / online gratis / photoshop / ia / gratis / pasar foto a lápiz / boceto
- `efecto puntillismo` → illustrator / photoshop / **online** / corel draw / **en canva** / imagen
- `pixelar imagen` → online / online gratis / gratis / con paint / **canva** / iphone / photoshop
- `efecto caleidoscopio foto` → efecto caleidoscopio fotos
- `convertir foto en dibujo` → animado / gratis / online gratis / lineal / para colorear / con ia
- `efectos para fotos online` → gratis / **gratis sin descargar** / divertidos / animados / 3d / de caricatura
- `editar fotos online gratis` → **sin registro** / con ia / collage / **sin marca de agua**
- `efecto tilt shift` → android / capcut / iphone / photoshop / video / **online**
- `efecto holograma` → after effects / uñas / stickers / photoshop / capcut / **online**
- `efecto vidrio foto`、`efecto prisma foto`（存在，浅）
- `generador de arte` → ia gratis / **arte ascii** / ia
- `convertidor de fotos online` → gratis / a jpg / a pdf / **a anime online**

**pt（hl=pt, gl=br）**
- `transformar foto em arte` → online / digital / vetorial / ia / 3d / abstrata / para tatuagem
- `foto em desenho` → animado / **online** / ia / preto e branco（超流量品类词）
- `foto em desenho a lapis` → online / transformar foto em desenho a lapis / **online gratis** / app
- `transformar foto em pop art` → online / app para transformar
- `foto em pop art online` → transformar foto em pop art online / foto pop art online gratis
- `efeito meio tom` → photoshop / illustrator / corel
- `pixelar imagem` → online / meme / **pixel art** / photoshop / canva
- `efeito caleidoscópio` → photoshop / **online** / imagem / capcut / video / **em foto**
- `efeito tilt shift` → como fazer / instagram / **no celular** / capcut / **online**
- `efeito cromático` → capcut / **foto** / halo cromático
- `efeito holográfico foto`、`foto efeito vidro`、`efeito prisma foto`（存在，浅）
- `efeitos para fotos online` → **grátis** / molduras e efeitos para fotos e montagens divertidos online
- `editor de fotos online grátis` → ia / para celular / remover fundo / para pc
- `gerador de arte` → ia gratuito / **arte ascii** / de parede rasterbator
- `pontilhismo` → desenho / tattoo / arte / o que é

*（完）*
