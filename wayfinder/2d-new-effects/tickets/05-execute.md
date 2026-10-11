---
title: 注册表接入与三端验收执行
labels: [wayfinder:task]
status: open
assignee: 主会话（2026-10-11 起，全自动执行中）
blocked-by: [04-spec-lock]
---

## Question

按票 04 锁定规格实施两风格并全量验收：StyleId + 2 frag + StyleRegistry 末位两条目 + i18n 34 键×2 + 测试用例；测试基线 329 只增不减、lint 2D 零新增；种子码新旧往返无损；三端（桌面/批量/H5）实测 + 浏览器视觉复核（toDataURL 直出、局部放大）；本地 commit 合入 main（不 push）。拉丝/珠光档浏览器实测定稿。
