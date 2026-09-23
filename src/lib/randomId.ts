// src/lib/randomId.ts
// 随机 id 生成:crypto.randomUUID 仅在安全上下文(https/localhost)存在,
// http 部署下直接调用会 TypeError。所有运行时 id 统一走此助手,
// 非安全上下文回退到「时间戳-随机串」,与 presetStore 原有守卫同语义。
export function randomId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
