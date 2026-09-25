// src/lib/license/verify.ts
// 会员判定核心:localStorage 存码原文(购买凭证),每次现验——不缓存状态,篡改无意义。
// 生产公钥上线前替换(来源:后端生成密钥对,见 docs/2026-09-25-backend-license-api.md 第 0 节)。
import { ed25519 } from '@noble/curves/ed25519'
import type { LicenseTier, StorageLike } from './types'
import { redeemCode } from './redeem'

const STORAGE_KEY = 'pixel-forge.license.v1'
const DEVICE_ID_KEY = 'pixel-forge.deviceId.v1'

// ── 开发公钥(后端 2026-09-25 交付)。⚠️ 上线前用户会另给真生产公钥,替换本值
//    并重新构建。构建产物硬编码此值,无运行时后门;仅 dev 模式可经
//    VITE_LICENSE_PUBKEY 覆盖为测试公钥,供浏览器回归脚本
//    (scripts/verify-license.mjs)用测试私钥造码走通激活流 ──
let publicKeyHex = '2e9e43fd307c835c05dbc39a46806ff605bba7b3f91c35362ebf1ed12cc6f529'
if (import.meta.env.DEV && import.meta.env.VITE_LICENSE_PUBKEY) {
  publicKeyHex = import.meta.env.VITE_LICENSE_PUBKEY as string
}
export function setLicensePublicKey(hex: string): void { publicKeyHex = hex }

// 同 presetStore:localStorage getter 在禁 cookie 环境会抛,模块加载期必须吞掉
let storage: StorageLike | null = null
try {
  storage = typeof window !== 'undefined' ? window.localStorage : null
} catch { storage = null }
export function setLicenseStorage(s: StorageLike | null): void { storage = s }

export type LicenseParseResult =
  | { ok: true; tier: LicenseTier; expAt: number }
  | { ok: false; reason: 'format' | 'signature' | 'expired' }

export type UnredeemedParseResult =
  | { ok: true; tier: LicenseTier; iat: number }
  | { ok: false; reason: 'format' | 'signature' }

const TIERS: LicenseTier[] = ['day', 'week', 'month', 'year', 'lifetime']

function fromB64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : ''
  let bin: string
  try { bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad) }
  catch { return null }
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** 两类码共享的前半段:结构拆解 → b64url 解码 → 验签。产出已验签的 payload 字节。 */
function verifyAndDecode(code: string): { msg: Uint8Array } | { err: 'format' | 'signature' } {
  // 先验签后解析:签名覆盖 payload 全部字节,payload 任何篡改一律 signature
  // (不依赖 JSON 是否恰好损坏),且不解析未验签内容。
  const parts = code.trim().split('.')
  if (parts.length !== 3 || parts[0] !== 'PF1') return { err: 'format' }
  const msg = fromB64Url(parts[1])
  const sig = fromB64Url(parts[2])
  if (!msg || !sig) return { err: 'format' }
  try {
    // @noble/curves@1.9 实测参数序:verify(signature, message, publicKey)
    if (!ed25519.verify(sig, msg, publicKeyHex)) return { err: 'signature' }
  } catch { return { err: 'signature' } }   // 公钥未注入/长度错等
  return { msg }
}

export function parseLicenseCode(code: string, now: number = Date.now()): LicenseParseResult {
  const head = verifyAndDecode(code)
  if ('err' in head) return { ok: false, reason: head.err }
  let parsed: { v?: unknown; tier?: unknown; exp?: unknown }
  try { parsed = JSON.parse(new TextDecoder().decode(head.msg)) } catch { return { ok: false, reason: 'format' } }
  if (parsed.v !== 1 || typeof parsed.tier !== 'string' || !TIERS.includes(parsed.tier as LicenseTier)
    || typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp)) return { ok: false, reason: 'format' }
  if (parsed.exp * 1000 <= now) return { ok: false, reason: 'expired' }
  return { ok: true, tier: parsed.tier as LicenseTier, expAt: parsed.exp }
}

/** 未兑换码解析(兑换码方案):payload {v:1,tier,iat},永不过期故无 expired 分支。
 *  与 parseLicenseCode 互斥:有 exp 无 iat → format,反之亦然。 */
export function parseUnredeemedCode(code: string): UnredeemedParseResult {
  const head = verifyAndDecode(code)
  if ('err' in head) return { ok: false, reason: head.err }
  let parsed: { v?: unknown; tier?: unknown; iat?: unknown; exp?: unknown }
  try { parsed = JSON.parse(new TextDecoder().decode(head.msg)) } catch { return { ok: false, reason: 'format' } }
  if (parsed.v !== 1 || typeof parsed.tier !== 'string' || !TIERS.includes(parsed.tier as LicenseTier)
    || typeof parsed.iat !== 'number' || !Number.isFinite(parsed.iat)
    // 有 exp 的已兑换码混进来也拒绝:两类码必须互斥,兑换流程才不失控
    || parsed.exp !== undefined) return { ok: false, reason: 'format' }
  return { ok: true, tier: parsed.tier as LicenseTier, iat: parsed.iat }
}

export function loadStoredCode(): string | null {
  if (!storage) return null
  try { return storage.getItem(STORAGE_KEY) } catch { return null }
}

/** 本机身份(redeem 防分享绑定用):首次生成持久化,禁存储环境回落一次性随机 id。 */
export function getOrCreateDeviceId(): string {
  if (storage) {
    try {
      const existing = storage.getItem(DEVICE_ID_KEY)
      if (existing) return existing
      const id = crypto.randomUUID()
      storage.setItem(DEVICE_ID_KEY, id)
      return id
    } catch { /* 禁 cookie/配额满:每次激活都是新 id,兑换不受阻 */ }
  }
  return crypto.randomUUID()
}

export type ActivateResult =
  | { ok: true; tier: LicenseTier; expAt: number }
  | { ok: false; reason: 'format' | 'signature' | 'expired' | 'network' | 'device_limit' | 'rate_limited' }

/** 存储策略:exp 晚于现存码才落库(多码保留更晚者,续费=新码覆盖)。已兑换码专用。 */
function storeIfBetter(code: string, parsed: { expAt: number }, now: number): void {
  if (!storage) return
  const existing = loadStoredCode()
  if (existing) {
    const er = parseLicenseCode(existing, now)
    // 现存码已过期/损坏也直接覆盖
    if (er.ok && er.expAt >= parsed.expAt) return
  }
  try { storage.setItem(STORAGE_KEY, code.trim()) } catch { /* 配额满:本次会话内存态也已无,忽略 */ }
}

/**
 * 激活入口(兑换码方案):
 * - 已兑换码合法 → 离线直接存(客服手工签发兼容路径,零网络);
 * - 未兑换码合法 → redeem 换已兑换码 → 验返回码签名 → 存(兑换依赖后端);
 * - 其余 → 原错误分类,不发网络请求。
 */
export async function activateCode(code: string, now: number = Date.now()): Promise<ActivateResult> {
  const r = parseLicenseCode(code, now)
  if (r.ok) {
    storeIfBetter(code, r, now)
    return r
  }
  if (r.reason === 'format') {
    const u = parseUnredeemedCode(code)
    if (!u.ok) return r   // 未兑换码也不合法:保持原 format 判定
    const rr = await redeemCode(code.trim(), getOrCreateDeviceId())
    if (!rr.ok) {
      // 后端不认码与本地验签失败同义(联系卖家);其余错误已在 ActivateResult 枚举内
      if (rr.reason === 'invalid_code') return { ok: false, reason: 'signature' }
      return { ok: false, reason: rr.reason }
    }
    const verified = parseLicenseCode(rr.code, now)
    if (!verified.ok) return { ok: false, reason: 'signature' }   // 不信响应体:返回码必须过本端验签
    storeIfBetter(rr.code, verified, now)
    return verified
  }
  return r   // signature(已兑换码验签失败/未兑换码被篡改)与 expired 都不走网络
}

export function getLicenseStatus(now: number = Date.now()): { active: boolean; tier?: LicenseTier; expAt?: number } {
  const code = loadStoredCode()
  if (!code) return { active: false }
  const r = parseLicenseCode(code, now)
  return r.ok ? { active: true, tier: r.tier, expAt: r.expAt } : { active: false }
}
