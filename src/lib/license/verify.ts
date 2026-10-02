// src/lib/license/verify.ts
// 会员判定核心(链式方案,spec 2026-09-26):localStorage 存隐藏凭证 {v:2,cid,exp,did} 原文,
// 每次现验——验签 + did 绑定本机,凭证复制到未绑定设备自动失效。篡改无意义,不缓存状态。
// 用户全程只接触兑换码原文(身份码/补充包);凭证由本模块自动存取,不可见无需备份。
// 退款作废(2026-10-01 契约):refresh/renew 收 410 voided 时写 voided 标记(挂钩凭证 cid),
// 凭证本身仍验签有效,故 getLicenseStatus 额外查标记;成功兑换新凭证即清除标记。
import { ed25519 } from '@noble/curves/ed25519'
import type { LicenseTier, StorageLike } from './types'
import { redeemActivate, redeemRenew, redeemRefresh, type RedeemResult } from './redeem'

const CREDENTIAL_KEY = 'pixel-forge.license.v2'
const META_KEY = 'pixel-forge.licenseMeta.v2'
const DEVICE_ID_KEY = 'pixel-forge.deviceId.v1'
const VOIDED_KEY = 'pixel-forge.licenseVoided.v1'

// ── 后端公钥(2026-09-26 链式方案重做时新生成交付)。⚠️ 若后端再换密钥对,
//    替换本值并重新构建。构建产物硬编码此值,无运行时后门;仅 dev 模式可经
//    VITE_LICENSE_PUBKEY 覆盖为测试公钥,供浏览器回归脚本
//    (scripts/verify-license.mjs)用测试私钥造码走通激活流 ──
let publicKeyHex = '99fba9f2714f8c84597d97ecef10dbc7d10f9c71b49679de4d957cf5991269ae'
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

export type CredentialParseResult =
  | { ok: true; cid: string; expAt: number; did: string }
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

/** 隐藏凭证解析:payload {v:2,cid,exp,did},did 由调用方与本地 deviceId 比对。 */
export function parseCredential(code: string, now: number = Date.now()): CredentialParseResult {
  const head = verifyAndDecode(code)
  if ('err' in head) return { ok: false, reason: head.err }
  let parsed: { v?: unknown; cid?: unknown; exp?: unknown; did?: unknown; iat?: unknown }
  try { parsed = JSON.parse(new TextDecoder().decode(head.msg)) } catch { return { ok: false, reason: 'format' } }
  if (parsed.v !== 2
    || typeof parsed.cid !== 'string' || !/^[0-9a-f]{16}$/.test(parsed.cid)
    || typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp)
    || typeof parsed.did !== 'string' || !parsed.did
    // 未兑换码混进来也拒绝:两类码互斥
    || parsed.iat !== undefined) return { ok: false, reason: 'format' }
  if (parsed.exp * 1000 <= now) return { ok: false, reason: 'expired' }
  return { ok: true, cid: parsed.cid, expAt: parsed.exp, did: parsed.did }
}

/** 未兑换码解析:payload {v:1,tier,iat},永不过期故无 expired 分支。身份码/补充包同形态。 */
export function parseUnredeemedCode(code: string): UnredeemedParseResult {
  const head = verifyAndDecode(code)
  if ('err' in head) return { ok: false, reason: head.err }
  let parsed: { v?: unknown; tier?: unknown; iat?: unknown; exp?: unknown; cid?: unknown }
  try { parsed = JSON.parse(new TextDecoder().decode(head.msg)) } catch { return { ok: false, reason: 'format' } }
  if (parsed.v !== 1 || typeof parsed.tier !== 'string' || !TIERS.includes(parsed.tier as LicenseTier)
    || typeof parsed.iat !== 'number' || !Number.isFinite(parsed.iat)
    // 有 exp/cid 的凭证混进来也拒绝:两类码必须互斥
    || parsed.exp !== undefined || parsed.cid !== undefined) return { ok: false, reason: 'format' }
  return { ok: true, tier: parsed.tier as LicenseTier, iat: parsed.iat }
}

export function loadStoredCredential(): string | null {
  if (!storage) return null
  try { return storage.getItem(CREDENTIAL_KEY) } catch { return null }
}

/** 面板显示"可绑定设备余 N 次":最近一次 redeem/refresh 应答的 count 快照。 */
export function loadLicenseCount(): number | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(META_KEY)
    if (!raw) return null
    const count = (JSON.parse(raw) as { count?: unknown })?.count
    return typeof count === 'number' && Number.isFinite(count) ? count : null
  } catch { return null }
}

function storeCredential(credential: string, count: number): void {
  if (!storage) return
  try {
    storage.setItem(CREDENTIAL_KEY, credential.trim())
    storage.setItem(META_KEY, JSON.stringify({ count }))
    // 新凭证生效 = 旧作废标记作废(激活新链即自救;renew 误标记可经 refresh/重激活仲裁)
    storage.removeItem(VOIDED_KEY)
  } catch { /* 配额满:本次会话内存态也已无,忽略 */ }
}

// ── 退款作废标记(410 voided 终态,不可恢复)──

type VoidedMarker = { cid: string; at: string; reason: string }

function loadVoidedMarker(): VoidedMarker | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(VOIDED_KEY)
    if (!raw) return null
    const m = JSON.parse(raw) as { cid?: unknown; at?: unknown; reason?: unknown }
    if (typeof m.cid !== 'string' || !m.cid
      || typeof m.at !== 'string' || typeof m.reason !== 'string') return null
    return { cid: m.cid, at: m.at, reason: m.reason }
  } catch { return null }
}

function markVoided(cid: string, at: string, reason: string): void {
  if (!storage) return
  try { storage.setItem(VOIDED_KEY, JSON.stringify({ cid, at, reason })) } catch { /* 忽略 */ }
}

/** 取凭证 payload 的 cid(不校验 exp/did):作废标记与当前凭证挂钩用的轻量读取。 */
function peekCredentialCid(code: string): string | null {
  const head = verifyAndDecode(code)
  if ('err' in head) return null
  try {
    const p = JSON.parse(new TextDecoder().decode(head.msg)) as { cid?: unknown }
    return typeof p.cid === 'string' ? p.cid : null
  } catch { return null }
}

/** 已作废凭证的短路应答(终态:refresh/renew 不再发网重试)。 */
function voidedShortCircuit(cid: string): LicenseResult | null {
  const m = loadVoidedMarker()
  return m && m.cid === cid
    ? { ok: false, reason: 'voided', voidedAt: m.at, voidReason: m.reason }
    : null
}

/** 退款作废信息(仅当标记挂钩当前存储凭证时返回;面板展示作废 tag 用)。 */
export function getVoidedInfo(): { voidedAt: string; reason: string } | null {
  const code = loadStoredCredential()
  if (!code) return null
  const m = loadVoidedMarker()
  if (!m || peekCredentialCid(code) !== m.cid) return null
  return { voidedAt: m.at, reason: m.reason }
}

/** randomUUID 仅 secure context(https/localhost)提供;局域网 IP 明文访问时用
 *  getRandomValues(不受该限制)手工组 UUID v4,格式与 randomUUID 一致。 */
function uuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40   // version 4
  b[8] = (b[8] & 0x3f) | 0x80   // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** 只读本机 deviceId(会员判定路径不写存储)。 */
function peekDeviceId(): string | null {
  if (!storage) return null
  try { return storage.getItem(DEVICE_ID_KEY) } catch { return null }
}

/** 本机身份(链设备绑定用):首次生成持久化,禁存储环境回落一次性随机 id。 */
export function getOrCreateDeviceId(): string {
  if (storage) {
    try {
      const existing = storage.getItem(DEVICE_ID_KEY)
      if (existing) return existing
      const id = uuidV4()
      storage.setItem(DEVICE_ID_KEY, id)
      return id
    } catch { /* 禁 cookie/配额满:每次激活都是新 id,兑换不受阻 */ }
  }
  return uuidV4()
}

export type LicenseFailReason =
  'format' | 'signature' | 'expired' | 'used' | 'identity_conflict' | 'device_exhausted' | 'network' | 'rate_limited' | 'voided'

export type LicenseResult =
  | { ok: true; expAt: number; count: number }
  | { ok: false; reason: Exclude<LicenseFailReason, 'voided'> }
  | { ok: false; reason: 'voided'; voidedAt: string; voidReason: string }

/** 应答统一处理:验返回凭证签名 + did 必须为本机(不信响应体),过才落库。 */
async function settle(rr: RedeemResult, deviceId: string, now: number): Promise<LicenseResult> {
  if (!rr.ok) {
    // 本地验签已过的码被后端 400 拒 = 已消耗(补充包/他链),提示"已被使用"
    if (rr.reason === 'invalid_code') return { ok: false, reason: 'used' }
    return rr.reason === 'voided'
      ? { ok: false, reason: 'voided', voidedAt: rr.voidedAt, voidReason: rr.voidReason }
      : { ok: false, reason: rr.reason }
  }
  const verified = parseCredential(rr.code, now)
  if (!verified.ok) return { ok: false, reason: 'signature' }
  if (verified.did !== deviceId) return { ok: false, reason: 'signature' }
  storeCredential(rr.code, rr.count)
  return { ok: true, expAt: verified.expAt, count: rr.count }
}

/** 激活入口(非会员设备):输入未兑换码——新码建链成身份码,或身份码迁移/刷新本机。 */
export async function activateCode(code: string, now: number = Date.now()): Promise<LicenseResult> {
  const u = parseUnredeemedCode(code)
  if (!u.ok) return { ok: false, reason: u.reason }   // 凭证文本/旧 v1 码/垃圾输入一律 format|signature
  const deviceId = getOrCreateDeviceId()
  return settle(await redeemActivate(code.trim(), deviceId), deviceId, now)
}

/** 续费入口(会员设备):输入未使用码 → 消耗为补充包,链 exp 延长、次数 +1。 */
export async function renewCode(code: string, now: number = Date.now()): Promise<LicenseResult> {
  const stored = loadStoredCredential()
  if (!stored) return { ok: false, reason: 'format' }
  const c = parseCredential(stored, now)
  if (!c.ok) return { ok: false, reason: c.reason }
  if (c.did !== peekDeviceId()) return { ok: false, reason: 'format' }
  const short = voidedShortCircuit(c.cid)   // 终态:本机凭证已作废,续费无意义不发网
  if (short) return short
  const u = parseUnredeemedCode(code)
  if (!u.ok) return { ok: false, reason: u.reason }
  const deviceId = getOrCreateDeviceId()
  const rr = await redeemRenew(code.trim(), deviceId, stored)
  if (!rr.ok && rr.reason === 'voided') markVoided(c.cid, rr.voidedAt, rr.voidReason)
  return settle(rr, deviceId, now)
}

/** 刷新(会员设备,免输码):同步链当前 exp(其他设备续费后的同步通道,0 次数)。
 *  也是作废失效的感知通道:链被退款作废后服务端不推送,下次刷新收到 410 voided。 */
export async function refreshCredential(now: number = Date.now()): Promise<LicenseResult> {
  const stored = loadStoredCredential()
  if (!stored) return { ok: false, reason: 'format' }
  const c = parseCredential(stored, now)
  if (!c.ok) return { ok: false, reason: c.reason }
  const short = voidedShortCircuit(c.cid)   // 终态:已作废凭证不再发网重试
  if (short) return short
  const deviceId = getOrCreateDeviceId()
  const rr = await redeemRefresh(stored, deviceId)
  if (!rr.ok && rr.reason === 'voided') markVoided(c.cid, rr.voidedAt, rr.voidReason)
  return settle(rr, deviceId, now)
}

export function getLicenseStatus(now: number = Date.now()): { active: boolean; expAt?: number } {
  const code = loadStoredCredential()
  if (!code) return { active: false }
  const r = parseCredential(code, now)
  // voided 标记优先于自然到期判定:凭证签名与 exp 仍有效,但链已被退款作废
  if (!r.ok || r.did !== peekDeviceId() || loadVoidedMarker()?.cid === r.cid) return { active: false }
  return { active: true, expAt: r.expAt }
}
