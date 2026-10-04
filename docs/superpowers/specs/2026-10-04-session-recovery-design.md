# 移动端会话恢复（方案 B · IndexedDB）设计

日期：2026-10-04（定稿，用户确认；实现 2026-10-04/05）
前置：docs/superpowers/specs/2026-10-02-mobile-h5-design.md（移动端 H5 适配）
验收问题 #5：微信内置浏览器划后台后 WebView 被回收，回来页面整页重载，
用户调好的参数和批量处理进度全部丢失。

## 目标

异常关闭（微信被杀 / 标签页回收 / 崩溃 / 意外刷新）后，/2d 能完整恢复上一次
会话：图片、参数、批量处理进度与已完成结果。桌面同样生效（微信是主要受益
场景，方案不分端）。

## 存储

IndexedDB（原生 API 手写 promise 封装，不新增 npm 依赖），单记录存整个会话：

```
库 pixel-forge-session / store sessions / key '2d-current'

会话记录 = {
  schemaVersion: 1,
  savedAt: number,
  activeStyle, seedMode, format, selectedIndex,   // 会话级状态
  batchBase: { params, textParams },               // 整批共享基线
  rows: [{ id, fileName, seed, status, originBlob, // 每行：原图 blob + 种子 + 结果
           resultBlob | null, renderedSeed, renderedStyleId }]
}
```

- 照片与参数的绑定由数据结构保证：每行 = 原图 blob + 该行种子码（种子码经
  decodeSeed 完整还原该行参数），不靠文件名匹配。
- status 落盘即归一为 `pending | done`；processing/failed 恢复后归一 pending。
- 图片只存本机 IDB（符合项目「本地处理不上传」承诺）。

## 写入时机（分层缩小丢失窗口）

1. 图片上传/追加后
2. 参数变更后防抖 ~500ms
3. 批量每张 done 即落盘结果 blob（断点保护，不等防抖）
4. pagehide / visibilitychange→hidden / 组件卸载兜底全量快照
5. 正常关闭会话（删到 0 张 / 确认关闭）= 删记录；异常关闭（重载/被杀）= 记录留存

写入串行化（promise 链）防乱序；空会话不写。

## 恢复流程

进入 /2d 挂载时检测到未结束会话 → 弹确认「检测到上次会话：N 张图，X 分钟前」
→ 恢复 / 丢弃（已确认决策：必须提示确认，不静默自动恢复）。

恢复：originBlob→objectURL→Image 重建行（移动端沿用上传同款 >4096 降采样口径）、
种子还原参数（统一=基线、独立=选中行 loadWorking）、done 行连结果 blob 一起回来
（已确认决策：批量结果也存）、processing/failed 行归一为 pending。

## 边界

- IDB 写失败/超配额 → 静默降级放弃持久化（console.warn，不弹错，后续不再重试）
- schemaVersion 不符 → 记录视为不可恢复，丢弃
- 单行解码失败 → 跳过该行；全部失败 → 丢弃记录
- 恢复确认前用户已自行上传 → 放弃恢复（不覆盖用户操作）

## 实现要点

- `src/lib/batch/sessionCodec.ts`（纯函数，vitest 单测）：buildSessionRecord /
  normalizeStoredSession / StoredSession 类型
- `src/lib/batch/sessionIdb.ts`（IDB 存取层，不做单测，浏览器手测）：
  save/load/clear + disabled 降级
- `src/lib/readImageFiles.ts`：返回值补 file（原始 File 未保留是既有缺口）
- `BatchImage` 加 `originFile: Blob | null`；测试图行 fetch(src) 异步补 blob
- App2D：sessInputsRef（跨闭包最新输入）+ 防抖持久化 + done 即写 + 兜底 flush +
  挂载检测 + 恢复弹窗（复用 ConfirmDialog，cancelLabel 加可选 prop）
- i18n：session.found / session.restore / session.discard / 时间文案（zh/en）

## 已知取舍

- 快照「所见即所存」：独立模式选中行的种子用工作副本实时编码编入快照
  （不写回 state），未同步编辑不因被杀丢失；统一模式行种子原样透传
- 字体（ascii FontFace）不可序列化，不持久化——与「字体不随种子/预设携带」
  既有语义一致，恢复后回默认字体
- 风格记忆（styleMemoryRef）会话级不持久化：恢复后切风格回该风格默认
- originFile 缺失的行（测试图 fetch 未落定窗口）序列化时剔除
- 单记录全量 put 的体积：Chromium 对 IDB 内 Blob 走引用优化；若 Safari 分支实测
  卡顿，备选方案为行级分片记录（meta + row:{id}），语义不变

## 验收清单

- 微信模拟重载恢复：上传+调参 → reload → 确认弹窗 → 恢复完整
- 批量断点：跑到一半 reload → 已 done 行带结果回来、其余 pending 可续跑
- 正常关闭不残留：确认关闭 / 删到 0 → reload 无弹窗
- IDB 降级：环境异常时 console.warn、UI 无感、无报错弹窗
- 桌面回归：上传/调参/批量/导出/水印链路零回归
