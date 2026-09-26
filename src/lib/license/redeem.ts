// src/lib/license/redeem.ts
// 兑换:未兑换码 → 后端换隐藏凭证(设备绑定)。契约见 docs/2026-09-25-backend-license-api.md
// 第 3 节(链式方案,2026-09-26 修订):
//   POST /api/license/redeem   {code, deviceId, credential?} → 200 {code:<凭证>, expAt, count}
//     400 invalid_code / 409 device_exhausted|identity_conflict(body.error 区分) / 429 限流
//   POST /api/license/refresh  {credential, deviceId} → 200 同上 / 410 expired
// 兑换依赖后端,使用不依赖:本模块只在激活/续费/刷新时被调用,会员判定(verify.ts)永不上网。
// VITE_API_BASE:开发 .env.local 指向 mock/本地后端,生产留空走同源(上线前注入正式值)。
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export type RedeemFailReason
  = 'network' | 'invalid_code' | 'device_exhausted' | 'identity_conflict' | 'rate_limited' | 'expired'

export type RedeemResult =
  | { ok: true; code: string; expAt: number; count: number }   // 凭证原文;签名由调用方验(不信响应体)
  | { ok: false; reason: RedeemFailReason }

/** 409 两种语义靠 body.error 区分(device_exhausted / identity_conflict),读体失败归 network。 */
async function post(path: string, body: Record<string, unknown>): Promise<RedeemResult> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch { return { ok: false, reason: 'network' } }
  if (res.status === 400) return { ok: false, reason: 'invalid_code' }
  if (res.status === 429) return { ok: false, reason: 'rate_limited' }
  if (res.status === 410) return { ok: false, reason: 'expired' }
  if (res.status === 409) {
    try {
      const err = ((await res.json()) as { error?: unknown })?.error
      if (err === 'device_exhausted') return { ok: false, reason: 'device_exhausted' }
      if (err === 'identity_conflict') return { ok: false, reason: 'identity_conflict' }
    } catch { /* body 不可读按未知 409 处理 */ }
    return { ok: false, reason: 'network' }
  }
  if (!res.ok) return { ok: false, reason: 'network' }
  try {
    const b = await res.json() as { code?: unknown; expAt?: unknown; count?: unknown }
    if (typeof b.code !== 'string' || !b.code
      || typeof b.expAt !== 'number' || !Number.isFinite(b.expAt)
      || typeof b.count !== 'number' || !Number.isFinite(b.count)) return { ok: false, reason: 'network' }
    return { ok: true, code: b.code, expAt: b.expAt, count: b.count }
  } catch { return { ok: false, reason: 'network' } }
}

/** 激活入口:未兑换码(新码或身份码)+ 本机 deviceId,不携凭证。 */
export function redeemActivate(code: string, deviceId: string): Promise<RedeemResult> {
  return post('/api/license/redeem', { code, deviceId })
}

/** 续费入口:未兑换码 + 本机在期凭证(服务端按凭证定位链,消耗补充包延长 exp 并 +1 次)。 */
export function redeemRenew(code: string, deviceId: string, credential: string): Promise<RedeemResult> {
  return post('/api/license/redeem', { code, deviceId, credential })
}

/** 刷新:免输码,凭本地凭证同步链当前 exp(多设备续费后的同步通道,0 次数)。 */
export function redeemRefresh(credential: string, deviceId: string): Promise<RedeemResult> {
  return post('/api/license/refresh', { credential, deviceId })
}
