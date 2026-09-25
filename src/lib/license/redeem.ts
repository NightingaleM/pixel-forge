// src/lib/license/redeem.ts
// 兑换:未兑换码(永不过期)→ 后端换已兑换码(exp=兑换时刻+时长)。
// 契约见 docs/2026-09-25-backend-license-api.md 第 3 节(与后端提示词逐字一致):
//   POST /api/license/redeem {code, deviceId?, email?} → 200 {code:<已兑换PF1码>, tier, expAt}
//   400 invalid_code / 409 device_limit / 429 限流;重复 redeem 同码幂等返回同一张。
// 兑换依赖后端,使用不依赖:本模块只在激活时被调用,会员判定(verify.ts)永不上网。
// VITE_API_BASE:开发 .env.local 指向 mock/本地后端,生产留空走同源(上线前注入正式值)。
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export type RedeemResult =
  | { ok: true; code: string }   // 已兑换码原文;签名由调用方验(不信响应体)
  | { ok: false; reason: 'network' | 'invalid_code' | 'device_limit' | 'rate_limited' }

export async function redeemCode(code: string, deviceId?: string, email?: string): Promise<RedeemResult> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/license/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, deviceId, email }),
    })
  } catch { return { ok: false, reason: 'network' } }
  if (res.status === 400) return { ok: false, reason: 'invalid_code' }
  if (res.status === 409) return { ok: false, reason: 'device_limit' }
  if (res.status === 429) return { ok: false, reason: 'rate_limited' }
  if (!res.ok) return { ok: false, reason: 'network' }
  try {
    const body: unknown = await res.json()
    const codeOut = (body as { code?: unknown })?.code
    if (typeof codeOut !== 'string' || !codeOut) return { ok: false, reason: 'network' }
    return { ok: true, code: codeOut }
  } catch { return { ok: false, reason: 'network' } }
}
