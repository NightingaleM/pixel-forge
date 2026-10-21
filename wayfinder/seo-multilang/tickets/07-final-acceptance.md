---
title: 执行票——统一验收与本地合入
labels: [wayfinder:task]
status: open
assignee: 主会话（执行中）
blocked-by: [04-execute-architecture, 05-execute-content]
---

## Question

架构（票 04）与内容（票 05）全部落地后的统一关卡：

1. 全量 lint（基线 11 错不新增）、tsc、单测。
2. `build + prerender` 冒烟：40 页产物齐全，抽查各语言深链（如 `/ja/2d`、`/pt/3d`）的 title/description/canonical/hreflang/`<html lang>`。
3. 浏览器实测按 memory 中 browser-verification-playbook：语言切换器切换与持久化、旧路径访问行为、首访协商跳转（清 localStorage 模拟海外浏览器语言）、H5 视口抽查。
4. 通过后本地 commit 合入 main（**不主动 push**，常设偏好），图目的地达成。
