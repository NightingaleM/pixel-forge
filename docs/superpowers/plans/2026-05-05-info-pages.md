# Info Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add About, Privacy, Terms, Help, 404 pages and a Footer component to PixelForge for public launch.

**Architecture:** Shared `InfoPage` layout component wraps all info pages. Footer links on home page provide navigation. All content internationalized via existing i18next. New pages are lazy-loaded like existing routes.

**Tech Stack:** React 19, TypeScript, react-router-dom v7, i18next, CSS (no CSS modules — project uses global CSS)

**Spec:** `docs/superpowers/specs/2026-05-05-info-pages-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/components/InfoPage.tsx` | Shared layout: gray bg, white card, back link, title, content slot |
| `src/components/About.tsx` | About page content (description, features, tech, contact) |
| `src/components/Privacy.tsx` | Privacy policy with placeholder legal sections |
| `src/components/Terms.tsx` | Terms of service with placeholder legal sections |
| `src/components/Help.tsx` | Usage guide for 2D and 3D features |
| `src/components/NotFound.tsx` | 404 page with back-to-home button |
| `src/components/Footer.tsx` | Footer links (About, Privacy, Terms, Help) + copyright |
| `src/App.tsx` | Add lazy imports and routes for all new pages |
| `src/components/Home.tsx` | Import and render Footer below home-links |
| `src/i18n/en.json` | Add `about`, `privacy`, `terms`, `help`, `notFound`, `footer` keys |
| `src/i18n/zh.json` | Same keys in Chinese |
| `src/styles/global.css` | Add `.info-page`, `.info-card`, `.footer`, `.not-found-page` styles |

---

### Task 1: Add i18n translations

**Files:**
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/zh.json`

- [ ] **Step 1: Add English translations to `src/i18n/en.json`**

Append these new top-level keys before the closing `}`:

```json
  "about": {
    "title": "About",
    "description": "PixelForge is a web-based real-time image artistic style transfer tool powered by WebGL shaders. It offers both 2D image stylization and 3D particle animation capabilities, running entirely in your browser with no server-side processing.",
    "featuresTitle": "Core Features",
    "feature2d": "2D Image Stylization — 10 artistic effects including Halftone, Diffusion, Pop Art, Light & Shadow, Sketch, Pointillism, Kaleidoscope, Crosshatch, Anime Light, and Text Raster.",
    "feature3d": "3D Particle Animation — Transform GLTF models into particle effects with Explosion, Morph, Vortex, and Density simulations.",
    "techTitle": "Technology",
    "techStack": "Built with React 19, TypeScript, Three.js, WebGL shaders, and Vite.",
    "contactTitle": "Contact",
    "contactEmail": "oychi.oylz@gmail.com"
  },
  "privacy": {
    "title": "Privacy Policy",
    "lastUpdated": "Last updated: May 2026",
    "collectTitle": "Information We Collect",
    "collectBody": "PixelForge runs entirely in your browser. We do not collect, store, or transmit any personal data. Images you upload are processed locally using WebGL and never leave your device.",
    "usageTitle": "How We Use Information",
    "usageBody": "Since no data is collected or transmitted, there is no usage of personal information.",
    "cookiesTitle": "Cookies",
    "cookiesBody": "We may use essential cookies to store your language preference. No tracking cookies are used.",
    "thirdPartyTitle": "Third-Party Services",
    "thirdPartyBody": "PixelForge does not integrate with any third-party analytics, advertising, or data collection services.",
    "securityTitle": "Data Security",
    "securityBody": "All image processing happens locally in your browser using WebGL. Your files are never uploaded to any server.",
    "rightsTitle": "Your Rights",
    "rightsBody": "Since we do not collect any personal data, there is no data to access, modify, or delete.",
    "changesTitle": "Changes to This Policy",
    "changesBody": "We may update this privacy policy from time to time. Any changes will be posted on this page with an updated revision date.",
    "contactTitle": "Contact Us",
    "contactBody": "If you have questions about this privacy policy, please contact us at oychi.oylz@gmail.com"
  },
  "terms": {
    "title": "Terms of Service",
    "lastUpdated": "Last updated: May 2026",
    "acceptanceTitle": "Acceptance of Terms",
    "acceptanceBody": "By accessing and using PixelForge, you accept and agree to be bound by these terms and conditions.",
    "licenseTitle": "Use License",
    "licenseBody": "Permission is granted to use PixelForge for personal and commercial purposes. This license does not include the right to modify, distribute, or sublicense the software.",
    "userContentTitle": "User Content",
    "userContentBody": "You retain all rights to images and models you upload. PixelForge processes your content locally and does not store or transmit it.",
    "limitationsTitle": "Limitations",
    "limitationsBody": "PixelForge is provided \"as is\" without warranties of any kind. We do not guarantee uninterrupted or error-free operation.",
    "disclaimerTitle": "Disclaimer",
    "disclaimerBody": "The software is provided for creative and educational purposes. The developers shall not be held liable for any damages arising from the use of this software.",
    "governingLawTitle": "Governing Law",
    "governingLawBody": "These terms shall be governed by and construed in accordance with applicable local laws.",
    "changesTitle": "Changes to Terms",
    "changesBody": "We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting.",
    "contactTitle": "Contact Us",
    "contactBody": "For questions about these terms, please contact oychi.oylz@gmail.com"
  },
  "help": {
    "title": "Help",
    "style2dTitle": "2D Image Stylization",
    "style2dSteps": "1. Click \"2D Image Stylization\" on the home page\n2. Upload an image by dragging or clicking the upload area\n3. Select an artistic style from the left panel\n4. Adjust effect parameters using the sliders\n5. Click the download button to save your result",
    "style3dTitle": "3D Particle Animation",
    "style3dSteps": "1. Click \"3D Particle Animation\" on the home page\n2. Upload a GLTF or GLB model file\n3. Choose a particle effect from the effect panel\n4. Adjust particle parameters (size, color, speed, etc.)\n5. Use the capture panel to take screenshots or record video",
    "tipsTitle": "Tips",
    "tipsBrowser": "Best viewed in Chrome, Edge, or Firefox with hardware acceleration enabled.",
    "tipsFormats": "2D mode supports JPG, PNG, and WebP images. 3D mode supports GLTF and GLB model files.",
    "tipsPerformance": "Large images or complex models may affect performance. Try reducing image resolution or model complexity if you experience lag."
  },
  "notFound": {
    "title": "404",
    "message": "Page not found"
  },
  "footer": {
    "about": "About",
    "privacy": "Privacy Policy",
    "terms": "Terms of Service",
    "help": "Help",
    "copyright": "© 2026 PixelForge. All rights reserved."
  }
```

- [ ] **Step 2: Add Chinese translations to `src/i18n/zh.json`**

Append these new top-level keys before the closing `}`:

```json
  "about": {
    "title": "关于",
    "description": "PixelForge 是一个基于 WebGL 着色器的在线实时图像艺术风格转换工具。它提供 2D 图像风格化和 3D 粒子动画两种功能，完全在浏览器中运行，无需服务器端处理。",
    "featuresTitle": "核心功能",
    "feature2d": "2D 图像风格化 — 包含半调、扩散抖动、波普艺术、光影、素描、点彩、万花筒、交叉排线、动漫光影和文字栅格共 10 种艺术效果。",
    "feature3d": "3D 粒子动画 — 将 GLTF 模型转换为粒子效果，支持爆散聚合、形状变换、旋转涡流和密度模拟。",
    "techTitle": "技术栈",
    "techStack": "基于 React 19、TypeScript、Three.js、WebGL 着色器和 Vite 构建。",
    "contactTitle": "联系方式",
    "contactEmail": "oychi.oylz@gmail.com"
  },
  "privacy": {
    "title": "隐私政策",
    "lastUpdated": "最后更新：2026 年 5 月",
    "collectTitle": "我们收集的信息",
    "collectBody": "PixelForge 完全在您的浏览器中运行。我们不收集、存储或传输任何个人数据。您上传的图片通过 WebGL 在本地处理，不会离开您的设备。",
    "usageTitle": "我们如何使用信息",
    "usageBody": "由于不收集或传输任何数据，因此不存在对个人信息的使用。",
    "cookiesTitle": "Cookie",
    "cookiesBody": "我们可能使用必要的 Cookie 来存储您的语言偏好设置。不使用任何跟踪 Cookie。",
    "thirdPartyTitle": "第三方服务",
    "thirdPartyBody": "PixelForge 不集成任何第三方分析、广告或数据收集服务。",
    "securityTitle": "数据安全",
    "securityBody": "所有图像处理均通过 WebGL 在您的浏览器本地完成。您的文件不会被上传到任何服务器。",
    "rightsTitle": "您的权利",
    "rightsBody": "由于我们不收集任何个人数据，因此不存在需要访问、修改或删除的数据。",
    "changesTitle": "政策变更",
    "changesBody": "我们可能会不时更新本隐私政策。任何变更将在此页面上发布，并附上更新日期。",
    "contactTitle": "联系我们",
    "contactBody": "如果您对本隐私政策有任何疑问，请通过 oychi.oylz@gmail.com 联系我们。"
  },
  "terms": {
    "title": "使用条款",
    "lastUpdated": "最后更新：2026 年 5 月",
    "acceptanceTitle": "接受条款",
    "acceptanceBody": "访问和使用 PixelForge 即表示您接受并同意受这些条款和条件的约束。",
    "licenseTitle": "使用许可",
    "licenseBody": "允许将 PixelForge 用于个人和商业目的。此许可不包括修改、分发或再授权本软件的权利。",
    "userContentTitle": "用户内容",
    "userContentBody": "您保留对上传的图片和模型的所有权利。PixelForge 在本地处理您的内容，不会存储或传输它。",
    "limitationsTitle": "限制",
    "limitationsBody": "PixelForge 按\"原样\"提供，不提供任何形式的保证。我们不保证不间断或无错误的运行。",
    "disclaimerTitle": "免责声明",
    "disclaimerBody": "本软件仅供创意和教育目的使用。开发者不对因使用本软件而产生的任何损害承担责任。",
    "governingLawTitle": "适用法律",
    "governingLawBody": "这些条款应受适用的当地法律管辖并据其解释。",
    "changesTitle": "条款变更",
    "changesBody": "我们保留随时修改这些条款的权利。变更将在发布后立即生效。",
    "contactTitle": "联系我们",
    "contactBody": "有关这些条款的问题，请通过 oychi.oylz@gmail.com 联系我们。"
  },
  "help": {
    "title": "使用说明",
    "style2dTitle": "2D 图像风格化",
    "style2dSteps": "1. 在首页点击\"2D 图片风格化\"\n2. 拖拽或点击上传区域上传图片\n3. 从左侧面板选择艺术风格\n4. 使用滑块调整效果参数\n5. 点击下载按钮保存结果",
    "style3dTitle": "3D 粒子动画",
    "style3dSteps": "1. 在首页点击\"3D 粒子动画\"\n2. 上传 GLTF 或 GLB 模型文件\n3. 从效果面板选择粒子特效\n4. 调整粒子参数（大小、颜色、速度等）\n5. 使用录制截图面板进行截图或录制视频",
    "tipsTitle": "使用提示",
    "tipsBrowser": "推荐使用 Chrome、Edge 或 Firefox 浏览器，并启用硬件加速。",
    "tipsFormats": "2D 模式支持 JPG、PNG 和 WebP 图片。3D 模式支持 GLTF 和 GLB 模型文件。",
    "tipsPerformance": "较大的图片或复杂模型可能影响性能。如遇卡顿，请尝试降低图片分辨率或模型复杂度。"
  },
  "notFound": {
    "title": "404",
    "message": "页面未找到"
  },
  "footer": {
    "about": "关于",
    "privacy": "隐私政策",
    "terms": "使用条款",
    "help": "使用说明",
    "copyright": "© 2026 PixelForge. 保留所有权利。"
  }
```

- [ ] **Step 3: Commit translations**

```bash
git add src/i18n/en.json src/i18n/zh.json
git commit -m "feat(i18n): add translations for info pages"
```

---

### Task 2: Create InfoPage layout component

**Files:**
- Create: `src/components/InfoPage.tsx`

- [ ] **Step 1: Create `src/components/InfoPage.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'

interface Props {
  titleKey: string
  children: ReactNode
}

export default function InfoPage({ titleKey, children }: Props) {
  const { t } = useTranslation()

  return (
    <div className="info-page">
      <div className="info-card">
        <Link to="/" className="info-back-link">← {t('common.backToHome')}</Link>
        <h1 className="info-title">{t(titleKey)}</h1>
        <div className="info-accent" />
        <div className="info-content">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/InfoPage.tsx
git commit -m "feat: add InfoPage shared layout component"
```

---

### Task 3: Create Footer component

**Files:**
- Create: `src/components/Footer.tsx`

- [ ] **Step 1: Create `src/components/Footer.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="footer">
      <div className="footer-links">
        <Link to="/about" className="footer-link">{t('footer.about')}</Link>
        <Link to="/privacy" className="footer-link">{t('footer.privacy')}</Link>
        <Link to="/terms" className="footer-link">{t('footer.terms')}</Link>
        <Link to="/help" className="footer-link">{t('footer.help')}</Link>
      </div>
      <p className="footer-copyright">{t('footer.copyright')}</p>
    </footer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Footer.tsx
git commit -m "feat: add Footer component with navigation links"
```

---

### Task 4: Create About page

**Files:**
- Create: `src/components/About.tsx`

- [ ] **Step 1: Create `src/components/About.tsx`**

```tsx
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import InfoPage from './InfoPage'

export default function About() {
  const { t } = useTranslation()

  useEffect(() => { document.title = `PixelForge - ${t('about.title')}` }, [t])

  return (
    <InfoPage titleKey="about.title">
      <p>{t('about.description')}</p>

      <h2>{t('about.featuresTitle')}</h2>
      <p>{t('about.feature2d')}</p>
      <p>{t('about.feature3d')}</p>

      <h2>{t('about.techTitle')}</h2>
      <p>{t('about.techStack')}</p>

      <h2>{t('about.contactTitle')}</h2>
      <p>{t('about.contactEmail')}</p>
    </InfoPage>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/About.tsx
git commit -m "feat: add About page"
```

---

### Task 5: Create Privacy Policy page

**Files:**
- Create: `src/components/Privacy.tsx`

- [ ] **Step 1: Create `src/components/Privacy.tsx`**

```tsx
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import InfoPage from './InfoPage'

const sections = ['collect', 'usage', 'cookies', 'thirdParty', 'security', 'rights', 'changes', 'contact'] as const

export default function Privacy() {
  const { t } = useTranslation()

  useEffect(() => { document.title = `PixelForge - ${t('privacy.title')}` }, [t])

  return (
    <InfoPage titleKey="privacy.title">
      <p className="info-updated">{t('privacy.lastUpdated')}</p>
      {sections.map((key) => (
        <section key={key}>
          <h2>{t(`privacy.${key}Title`)}</h2>
          <p>{t(`privacy.${key}Body`)}</p>
        </section>
      ))}
    </InfoPage>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Privacy.tsx
git commit -m "feat: add Privacy Policy page with placeholder content"
```

---

### Task 6: Create Terms of Service page

**Files:**
- Create: `src/components/Terms.tsx`

- [ ] **Step 1: Create `src/components/Terms.tsx`**

```tsx
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import InfoPage from './InfoPage'

const sections = ['acceptance', 'license', 'userContent', 'limitations', 'disclaimer', 'governingLaw', 'changes', 'contact'] as const

export default function Terms() {
  const { t } = useTranslation()

  useEffect(() => { document.title = `PixelForge - ${t('terms.title')}` }, [t])

  return (
    <InfoPage titleKey="terms.title">
      <p className="info-updated">{t('terms.lastUpdated')}</p>
      {sections.map((key) => (
        <section key={key}>
          <h2>{t(`terms.${key}Title`)}</h2>
          <p>{t(`terms.${key}Body`)}</p>
        </section>
      ))}
    </InfoPage>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Terms.tsx
git commit -m "feat: add Terms of Service page with placeholder content"
```

---

### Task 7: Create Help page

**Files:**
- Create: `src/components/Help.tsx`

- [ ] **Step 1: Create `src/components/Help.tsx`**

```tsx
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import InfoPage from './InfoPage'

export default function Help() {
  const { t } = useTranslation()

  useEffect(() => { document.title = `PixelForge - ${t('help.title')}` }, [t])

  return (
    <InfoPage titleKey="help.title">
      <section>
        <h2>{t('help.style2dTitle')}</h2>
        <p className="info-steps">{t('help.style2dSteps')}</p>
      </section>

      <section>
        <h2>{t('help.style3dTitle')}</h2>
        <p className="info-steps">{t('help.style3dSteps')}</p>
      </section>

      <section>
        <h2>{t('help.tipsTitle')}</h2>
        <ul>
          <li>{t('help.tipsBrowser')}</li>
          <li>{t('help.tipsFormats')}</li>
          <li>{t('help.tipsPerformance')}</li>
        </ul>
      </section>
    </InfoPage>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Help.tsx
git commit -m "feat: add Help page with usage guide"
```

---

### Task 8: Create 404 Not Found page

**Files:**
- Create: `src/components/NotFound.tsx`

- [ ] **Step 1: Create `src/components/NotFound.tsx`**

```tsx
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()

  useEffect(() => { document.title = `PixelForge - ${t('notFound.message')}` }, [t])

  return (
    <div className="not-found-page">
      <h1 className="not-found-code">{t('notFound.title')}</h1>
      <p className="not-found-msg">{t('notFound.message')}</p>
      <Link to="/" className="not-found-btn">← {t('common.backToHome')}</Link>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/NotFound.tsx
git commit -m "feat: add 404 Not Found page"
```

---

### Task 9: Add CSS styles

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: Append new styles to the end of `src/styles/global.css`**

```css
/* --- Info Page Layout --- */

.info-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  padding: 48px 24px;
  background: #f5f5f0;
  box-sizing: border-box;
}

.info-card {
  width: 100%;
  max-width: 680px;
  background: #fff;
  border: 2px solid #000;
  padding: 40px 48px;
  box-sizing: border-box;
  height: fit-content;
}

.info-back-link {
  display: inline-block;
  font-size: 13px;
  color: #666;
  text-decoration: none;
  margin-bottom: 24px;
}
.info-back-link:hover {
  color: #000;
}

.info-title {
  font-size: 32px;
  font-weight: 700;
  color: #000;
  margin: 0 0 8px;
}

.info-accent {
  width: 40px;
  height: 3px;
  background: #000;
  margin-bottom: 32px;
}

.info-content h2 {
  font-size: 18px;
  font-weight: 600;
  color: #000;
  margin: 28px 0 8px;
}

.info-content p {
  font-size: 15px;
  line-height: 1.7;
  color: #333;
  margin: 0 0 8px;
}

.info-content ul {
  padding-left: 20px;
  margin: 0 0 8px;
}

.info-content li {
  font-size: 15px;
  line-height: 1.7;
  color: #333;
}

.info-updated {
  font-size: 13px;
  color: #999;
  margin-bottom: 24px;
}

.info-steps {
  white-space: pre-line;
}

/* --- Footer --- */

.footer {
  margin-top: 64px;
  padding: 20px 0;
  border-top: 1px solid #ddd;
  text-align: center;
}

.footer-links {
  display: flex;
  gap: 24px;
  justify-content: center;
  margin-bottom: 12px;
}

.footer-link {
  font-size: 13px;
  color: #666;
  text-decoration: underline;
}
.footer-link:hover {
  color: #000;
}

.footer-copyright {
  font-size: 11px;
  color: #999;
  margin: 0;
}

/* --- 404 Not Found --- */

.not-found-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f5f5f0;
}

.not-found-code {
  font-size: 120px;
  font-weight: 700;
  color: #000;
  margin: 0 0 8px;
  line-height: 1;
}

.not-found-msg {
  font-size: 18px;
  color: #666;
  margin: 0 0 32px;
}

.not-found-btn {
  display: inline-block;
  padding: 10px 24px;
  background: #000;
  color: #fff;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
}
.not-found-btn:hover {
  background: #333;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: add CSS styles for info pages, footer, and 404"
```

---

### Task 10: Wire up routes in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add lazy imports for new pages in `src/App.tsx`**

After the existing lazy imports (line 8), add:

```tsx
const About = lazy(() => import('./components/About'))
const Privacy = lazy(() => import('./components/Privacy'))
const Terms = lazy(() => import('./components/Terms'))
const Help = lazy(() => import('./components/Help'))
const NotFound = lazy(() => import('./components/NotFound'))
```

- [ ] **Step 2: Add routes in `src/App.tsx`**

Before the `<Route path="*">` line (line 43), add:

```tsx
<Route path="/about" element={<About />} />
<Route path="/privacy" element={<Privacy />} />
<Route path="/terms" element={<Terms />} />
<Route path="/help" element={<Help />} />
```

Change the catch-all from `<Home />` to `<NotFound />`:

```tsx
<Route path="*" element={<NotFound />} />
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add routes for info pages and 404"
```

---

### Task 11: Add Footer to Home page

**Files:**
- Modify: `src/components/Home.tsx`

- [ ] **Step 1: Import Footer and add to Home component**

Add import at top:

```tsx
import Footer from './Footer'
```

Add `<Footer />` after the closing `</div>` of `home-links`, still inside `home-content`:

The `home-page` div should change from `min-height: 100vh` with `align-items: center` to a column layout so the footer sits at the bottom. Wrap existing content and footer in a flex column:

```tsx
export default function Home() {
  const { t } = useTranslation()

  return (
    <div className="home-page">
      <div className="home-content">
        <h1 className="home-title">PixelForge</h1>
        <p className="home-subtitle">{t('home.subtitle')}</p>

        <div className="home-links">
          <Link to="/2d" className="home-link">
            <div className="home-link-card">
              <div className="home-link-icon">🎨</div>
              <div className="home-link-title">{t('home.style2d')}</div>
              <div className="home-link-desc">{t('home.style2dDesc')}</div>
            </div>
          </Link>

          <Link to="/3d" className="home-link">
            <div className="home-link-card">
              <div className="home-link-icon">🎭</div>
              <div className="home-link-title">{t('home.style3d')}</div>
              <div className="home-link-desc">{t('home.style3dDesc')}</div>
            </div>
          </Link>
        </div>

        <Footer />
      </div>
    </div>
  )
}
```

Note: The existing `.home-page` uses `align-items: center` which centers the content vertically. With the footer, the content should still be centered but the footer pushed to the bottom. This works naturally because `.home-page` is `min-height: 100vh` with `display: flex` and `align-items: center` — the content is centered and the footer is part of `home-content` so it flows below the cards.

- [ ] **Step 2: Commit**

```bash
git add src/components/Home.tsx
git commit -m "feat: add Footer to home page"
```

---

### Task 12: Build verification

- [ ] **Step 1: Run TypeScript type check**

```bash
cd c:/Users/Night/Desktop/dev/web_pic_design_ai && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 2: Run build**

```bash
cd c:/Users/Night/Desktop/dev/web_pic_design_ai && npm run build
```

Expected: successful build with no errors

- [ ] **Step 3: Manual verification checklist**

Open the dev server (`npm run dev`) and verify:

- [ ] Home page shows Footer with 4 links + copyright at bottom
- [ ] Clicking "About" navigates to `/about` — shows project info with back link
- [ ] Clicking "Privacy Policy" navigates to `/privacy` — shows legal sections
- [ ] Clicking "Terms of Service" navigates to `/terms` — shows legal sections
- [ ] Clicking "Help" navigates to `/help` — shows usage guide
- [ ] Navigating to a nonexistent URL (e.g., `/foo`) shows 404 page
- [ ] Language switcher toggles all new page content between EN/ZH
- [ ] All "Back to Home" links return to home page
- [ ] All pages match the design system (no shadows, black borders, correct colors)
