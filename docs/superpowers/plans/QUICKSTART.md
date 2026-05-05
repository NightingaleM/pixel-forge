# Info Pages 快速启动提示

## 目标
为 PixelForge 添加上线前必要页面：About、Privacy Policy、Terms of Service、Help、404，以及首页 Footer 导航。

## 实现计划
完整计划在 `docs/superpowers/plans/2026-05-05-info-pages.md`，设计规格在 `docs/superpowers/specs/2026-05-05-info-pages-design.md`。

## 执行方式
使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 按计划逐步执行。计划共 12 个 Task，全部代码已写在计划文档中。

## 核心改动（12 个文件）

### 新建 7 个组件
- `src/components/InfoPage.tsx` — 通用布局（灰底 + 白卡片 + 返回链接 + 标题）
- `src/components/About.tsx` — 项目介绍
- `src/components/Privacy.tsx` — 隐私政策（占位）
- `src/components/Terms.tsx` — 使用条款（占位）
- `src/components/Help.tsx` — 使用说明
- `src/components/NotFound.tsx` — 404 页面
- `src/components/Footer.tsx` — 首页底部导航链接 + 版权

### 修改 4 个现有文件
- `src/App.tsx` — lazy 导入新页面，添加 5 条路由，`*` 改为 NotFound
- `src/components/Home.tsx` — 导入 Footer，加在 home-links 后面
- `src/i18n/en.json` — 添加 about/privacy/terms/help/notFound/footer 六组翻译
- `src/i18n/zh.json` — 同上中文版
- `src/styles/global.css` — 添加 .info-page / .info-card / .footer / .not-found-page 样式

## 设计约束
- 居中卡片式布局（浅灰 #f5f5f0 底 + 白 #fff 卡片，max-width 680px）
- 无阴影、无渐变、无圆角，2px 黑色边框
- 所有内容走 i18next 双语（复用现有 `common.backToHome`）
- 每个页面 `document.title = PixelForge - ${pageName}`
- Footer 只在首页显示

## 关键上下文
- 现有路由：`/`（Home）、`/2d`（App2D）、`/3d`（App3D），所有页面 lazy-load
- 翻译 key 用顶级命名空间（common、home、app2d 等），新页面加 about、privacy 等
- CSS 全局单文件 `src/styles/global.css`，不用 CSS Modules
- 组件默认 export + `useTranslation()` hook，遵循现有模式
