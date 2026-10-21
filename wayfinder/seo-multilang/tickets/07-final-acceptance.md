---
title: 执行票——统一验收与本地合入
labels: [wayfinder:task]
status: closed
assignee: 主会话（已完成）
blocked-by: [04-execute-architecture, 05-execute-content]
---

## Question

架构（票 04）与内容（票 05）全部落地后的统一关卡：

1. 全量 lint（基线 11 错不新增）、tsc、单测。
2. `build + prerender` 冒烟：40 页产物齐全，抽查各语言深链（如 `/ja/2d`、`/pt/3d`）的 title/description/canonical/hreflang/`<html lang>`。
3. 浏览器实测按 memory 中 browser-verification-playbook：语言切换器切换与持久化、旧路径访问行为、首访协商跳转（清 localStorage 模拟海外浏览器语言）、H5 视口抽查。
4. 通过后本地 commit 合入 main（**不主动 push**，常设偏好），图目的地达成。

## Resolution

**2026-10-21 全关通过，已合入本地 main（67cbcf0，未 push）**：

1. **静态验证**：tsc 0 错；lint 11 错=基线持平（全 3D）；vitest 497/498——唯一 fail 为既有 motion MediaRecorder 时戳抖动（差 0.002s 触下限，单跑 6/6 绿，与本次改动零交集，上游容差问题另案）。
2. **构建冒烟**：build+prerender 40 页全产出；抽查 ja/2d、es/、pt/3d、en/2d 深链——title 关键词前置、html lang、hreflang×6、og:locale、canonical 全正确；根 stub 五语言链接；sitemap 40 URL。
3. **浏览器实测 13/13 PASS**（vite dev+Edge headless，脚本含首访协商 en/ja、旧路径 /2d→/zh/2d、深链 /ja/2d、切换器全流程含 localStorage 记忆回根、非法前缀 noindex、H5 视口触达区）。
4. 合入 commit：47 文件 +4360/−193；既有未跟踪文件（docs/、findings.md 等）未触碰。
