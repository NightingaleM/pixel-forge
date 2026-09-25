// src/lib/license/verify.ts
// 会员判定核心:localStorage 存码原文(购买凭证),每次现验——不缓存状态,篡改无意义。
// 生产公钥上线前替换(来源:后端生成密钥对,见 docs/2026-09-25-backend-license-api.md 第 0 节)。
import { ed25519 } from '@noble/curves/ed25519'
import type { LicenseTier, StorageLike } from './types'

const STORAGE_KEY = 'pixel-forge.license.v1'

// ── 生产公钥(后端 2026-09-25 交付)。构建产物硬编码此值,无运行时后门;
//    仅 dev 模式可经 VITE_LICENSE_PUBKEY 覆盖为测试公钥,供浏览器回归脚本
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

export function parseLicenseCode(code: string, now: number = Date.now()): LicenseParseResult {
  // 检查顺序即语义契约:结构→b64url→验签→JSON 解析→过期。
  // 先验签后解析:签名覆盖 payload 全部字节,payload 任何篡改一律 signature
  // (不依赖 JSON 是否恰好损坏),且不解析未验签内容。
  const parts = code.trim().split('.')
  if (parts.length !== 3 || parts[0] !== 'PF1') return { ok: false, reason: 'format' }
  const msg = fromB64Url(parts[1])
  const sig = fromB64Url(parts[2])
  if (!msg || !sig) return { ok: false, reason: 'format' }
  try {
    // @noble/curves@1.9 实测参数序:verify(signature, message, publicKey)
    if (!ed25519.verify(sig, msg, publicKeyHex)) return { ok: false, reason: 'signature' }
  } catch { return { ok: false, reason: 'signature' } }   // 公钥未注入/长度错等
  let parsed: { v?: unknown; tier?: unknown; exp?: unknown }
  try { parsed = JSON.parse(new TextDecoder().decode(msg)) } catch { return { ok: false, reason: 'format' } }
  if (parsed.v !== 1 || typeof parsed.tier !== 'string' || !TIERS.includes(parsed.tier as LicenseTier)
    || typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp)) return { ok: false, reason: 'format' }
  if (parsed.exp * 1000 <= now) return { ok: false, reason: 'expired' }
  return { ok: true, tier: parsed.tier as LicenseTier, expAt: parsed.exp }
}

export function loadStoredCode(): string | null {
  if (!storage) return null
  try { return storage.getItem(STORAGE_KEY) } catch { return null }
}

/** 激活入口:验签通过且 exp 晚于现存码才落库(多码保留更晚者,续费=新码覆盖)。 */
export function activateCode(code: string, now: number = Date.now()): LicenseParseResult {
  const r = parseLicenseCode(code, now)
  if (!r.ok || !storage) return r
  const existing = loadStoredCode()
  if (existing) {
    const er = parseLicenseCode(existing, now)
    // 现存码已过期/损坏也直接覆盖
    if (er.ok && er.expAt >= r.expAt) return r
  }
  try { storage.setItem(STORAGE_KEY, code.trim()) } catch { /* 配额满:本次会话内存态也已无,忽略 */ }
  return r
}

export function getLicenseStatus(now: number = Date.now()): { active: boolean; tier?: LicenseTier; expAt?: number } {
  const code = loadStoredCode()
  if (!code) return { active: false }
  const r = parseLicenseCode(code, now)
  return r.ok ? { active: true, tier: r.tier, expAt: r.expAt } : { active: false }
}
