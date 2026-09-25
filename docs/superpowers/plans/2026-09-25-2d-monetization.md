# 2D 会员制(水印墙+激活码)前端实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 2D 单图/批量导出加上「免费每日 5 次无水印 + 超额水印兜底 + 会员无水印」的付费墙,会员由 Ed25519 离线验签激活码驱动。

**Architecture:** 新增 `src/lib/license/` 模块(emit/verify/quota/watermark/gating 五个单元),调用方仅 App2D 三个下载 handler 与 runBatch 渲染闭包;水印在导出副本上合成,预览画布永不污染;会员判定每次现验 localStorage 中的码原文。

**Tech Stack:** React 19 + TS + @noble/curves(ed25519) + vitest(node 环境,无 canvas——纯逻辑单测+浏览器实测兜底)。

**Spec:** `docs/superpowers/specs/2026-09-25-2d-monetization-design.md`(付费墙矩阵、码格式契约、水印规格以 spec 为准;后端契约见 `docs/2026-09-25-backend-license-api.md`)

## Global Constraints

- 3D 相关(App3D.tsx / RecordingControls.tsx / shaders3d)零改动。
- 新按钮图标一律手绘内联 SVG,禁 emoji(项目 UI 规范)。
- lint 基线 11 个预先存在错误(均在 3D 文件),验收标准=不新增。
- localStorage 访问遵循 presetStore.ts 的 StorageLike 注入 + try/catch 模式(见 `src/lib/presetStore.ts:19-38`),键名 `pixel-forge.*.v1`。
- vitest 跑 node 环境无 DOM/canvas:凡 canvas 绘制逻辑不得进单测,靠 Task 7 浏览器实测;纯逻辑(解析/计数/SVG 字符串/布局)必须单测。
- 码格式契约(与后端文档逐字节一致):
  `码 = "PF1." + b64url(payloadUtf8) + "." + b64url(signature)`,
  `payload = JSON.stringify({v:1,tier,exp})`(键序固定 v/tier/exp,紧凑无空格),
  `signature = ed25519.sign(sha512, payloadUtf8, privateKey)`,
  b64url = 标准 base64url 无 padding。
- 中文注释,风格与现有代码一致(讲"为什么"不讲"是什么")。
- 每任务一次 commit,消息末尾加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。

---

### Task 1: 测试密钥对 + 签发/验签核心(emit.ts / verify.ts / testKey.ts)

**Files:**
- Create: `src/lib/license/testKey.ts`
- Create: `src/lib/license/emit.ts`
- Create: `src/lib/license/verify.ts`
- Create: `src/lib/license/emit.test.ts`
- Create: `scripts/genLicense.mjs`
- Modify: `package.json`(依赖 @noble/curves)

**Interfaces:**
- Produces(后续任务依赖的精确签名):
  - `TEST_PRIVATE_KEY_HEX: string`、`TEST_PUBLIC_KEY_HEX: string`(testKey.ts)
  - `type LicenseTier = 'day'|'week'|'month'|'year'|'lifetime'`、`interface LicensePayload { v: 1; tier: LicenseTier; exp: number }`
  - `signLicense(payload: LicensePayload, privateKeyHex: string): string`(emit.ts)
  - `type LicenseParseResult = { ok: true; tier: LicenseTier; expAt: number } | { ok: false; reason: 'format'|'signature'|'expired' }`
  - `parseLicenseCode(code: string, now?: number): LicenseParseResult`
  - `activateCode(code: string, now?: number): LicenseParseResult`(验签,通过且 exp 晚于现存码则存储)
  - `loadStoredCode(): string | null`、`getLicenseStatus(now?: number): { active: boolean; tier?: LicenseTier; expAt?: number }`
  - `setLicenseStorage(s: StorageLike | null): void`

- [ ] **Step 1: 安装依赖**

```bash
npm i @noble/curves@^1
```

- [ ] **Step 2: 生成测试密钥对并写入 testKey.ts**

Run(项目内已有 @noble/curves 后直接跑):
```bash
node -e "const {ed25519}=require('@noble/curves/ed25519');const p=ed25519.utils.randomPrivateKey();const u=ed25519.getPublicKey(p);console.log(Buffer.from(p).toString('hex'));console.log(Buffer.from(u).toString('hex'))"
```
输出两行 hex,写入(注释注明与 scripts/genLicense.mjs 内嵌副本保持同步):
```ts
// src/lib/license/testKey.ts
// 开发自测密钥对(仅用于本地造码验证,与生产密钥无关;生产公钥见 verify.ts)。
// 与 scripts/genLicense.mjs 顶部的内嵌副本是同一对,换钥需两处同步。
export const TEST_PRIVATE_KEY_HEX = '<Step2 输出的第一行>'
export const TEST_PUBLIC_KEY_HEX = '<Step2 输出的第二行>'
```

- [ ] **Step 3: 写失败测试 emit.test.ts**

覆盖:roundtrip、篡改 payload、篡改 signature、过期码、格式错(非 PF1 前缀/段数不对/b64url 非法/JSON 非法)、activateCode 多码保留 exp 晚者、storage 异常不抛。

```ts
// src/lib/license/emit.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { signLicense, type LicensePayload } from './emit'
import { parseLicenseCode, activateCode, loadStoredCode, setLicenseStorage, setLicensePublicKey } from './verify'
import { TEST_PRIVATE_KEY_HEX, TEST_PUBLIC_KEY_HEX } from './testKey'

// 内存 storage(node 无 window),同 presetStore 测试模式
class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}

const priv = TEST_PRIVATE_KEY_HEX
const pub = TEST_PUBLIC_KEY_HEX
const NOW = 1_750_000_000_000

beforeEach(() => {
  const s = new MemStorage()
  setLicenseStorage(s)
  setLicensePublicKey(pub)
})

const day: LicensePayload = { v: 1, tier: 'day', exp: Math.floor(NOW / 1000) + 86400 }

describe('signLicense / parseLicenseCode', () => {
  it('roundtrip:签发→解析回同 tier/exp', () => {
    const code = signLicense(day, priv)
    expect(code.startsWith('PF1.')).toBe(true)
    const r = parseLicenseCode(code, NOW)
    expect(r).toEqual({ ok: true, tier: 'day', expAt: day.exp })
  })

  it('篡改 payload 任一字符 → signature 失败', () => {
    const code = signLicense(day, priv)
    const parts = code.split('.')
    // 篡改 payload 段中间字符:尾字符仅高 2 位有效且 atob 宽容丢弃越界位,
    // 替换尾字符字节可能不变;中间字符每一位都映射到字节,必然改变
    const mid = 5
    parts[1] = parts[1].slice(0, mid) + (parts[1][mid] === 'A' ? 'B' : 'A') + parts[1].slice(mid + 1)
    const r = parseLicenseCode(parts.join('.'), NOW)
    expect(r).toEqual({ ok: false, reason: 'signature' })
  })

  it('篡改 signature → signature 失败', () => {
    const code = signLicense(day, priv)
    const parts = code.split('.')
    const mid = 5
    parts[2] = parts[2].slice(0, mid) + (parts[2][mid] === 'A' ? 'B' : 'A') + parts[2].slice(mid + 1)
    expect(parseLicenseCode(parts.join('.'), NOW)).toEqual({ ok: false, reason: 'signature' })
  })

  it('exp 已过 → expired', () => {
    const expired = signLicense({ v: 1, tier: 'day', exp: Math.floor(NOW / 1000) - 1 }, priv)
    expect(parseLicenseCode(expired, NOW)).toEqual({ ok: false, reason: 'expired' })
  })

  it('格式错:非 PF1 前缀 / 段数不对 / 非法 b64url / 非法 JSON', () => {
    expect(parseLicenseCode('XX1.a.b', NOW)).toEqual({ ok: false, reason: 'format' })
    expect(parseLicenseCode('PF1.only-two', NOW)).toEqual({ ok: false, reason: 'format' })
    expect(parseLicenseCode('PF1.!!??.zzzz', NOW)).toEqual({ ok: false, reason: 'format' })
    // 合法 b64url 但内容不是 JSON
    const notJson = Buffer.from('not json').toString('base64url')
    expect(parseLicenseCode(`PF1.${notJson}.x`, NOW)).toEqual({ ok: false, reason: 'format' })
  })
})

describe('activateCode', () => {
  it('首次激活存储码原文;重输同码幂等', () => {
    const code = signLicense(day, priv)
    expect(activateCode(code, NOW).ok).toBe(true)
    expect(loadStoredCode()).toBe(code)
    expect(activateCode(code, NOW).ok).toBe(true)
    expect(loadStoredCode()).toBe(code)
  })

  it('新码 exp 更早 → 不覆盖现存;更晚 → 覆盖', () => {
    const late = signLicense({ v: 1, tier: 'year', exp: Math.floor(NOW / 1000) + 3e7 }, priv)
    const early = day
    activateCode(late, NOW)
    activateCode(signLicense(early, priv), NOW)   // 更早,不覆盖
    expect(loadStoredCode()).toBe(late)
    const later = signLicense({ v: 1, tier: 'lifetime', exp: 4102444800 }, priv)
    activateCode(later, NOW)
    expect(loadStoredCode()).toBe(later)
  })

  it('坏码不触碰已存码', () => {
    const code = signLicense(day, priv)
    activateCode(code, NOW)
    activateCode('garbage', NOW)
    expect(loadStoredCode()).toBe(code)
  })
})

describe('storage 健壮性', () => {
  it('storage 为 null 时一切安全回落', () => {
    setLicenseStorage(null)
    expect(loadStoredCode()).toBe(null)
    expect(activateCode(signLicense(day, priv), NOW).ok).toBe(true)  // 验签仍通过,只是不持久化
  })
})
```

注意:测试要求 verify.ts 额外导出 `setLicensePublicKey(pubHex: string): void`(生产公钥常量的测试注入阀,默认值为生产公钥占位——见 Step 4 文件头说明)。

- [ ] **Step 4: 跑测试确认失败**

```bash
npx vitest run src/lib/license/emit.test.ts
```
Expected: FAIL(模块不存在)。

- [ ] **Step 5: 实现 emit.ts / verify.ts**

```ts
// src/lib/license/emit.ts
// 签发侧(仅开发自测与 scripts/genLicense.mjs 使用;生产签发在后端)。
// 码格式契约见 docs/2026-09-25-backend-license-api.md 第 1 节,前后端逐字节一致。
import { ed25519 } from '@noble/curves/ed25519'
import type { LicenseTier } from './types'

export interface LicensePayload { v: 1; tier: LicenseTier; exp: number }

function toB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function signLicense(payload: LicensePayload, privateKeyHex: string): string {
  // 键序固定 v/tier/exp:JSON.stringify 按字面量序输出,契约两端一致的前提
  const payloadStr = JSON.stringify({ v: payload.v, tier: payload.tier, exp: payload.exp })
  const msg = new TextEncoder().encode(payloadStr)
  const sig = ed25519.sign(msg, privateKeyHex)
  return `PF1.${toB64Url(msg)}.${toB64Url(sig)}`
}
```

```ts
// src/lib/license/types.ts
export type LicenseTier = 'day' | 'week' | 'month' | 'year' | 'lifetime'
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
```

```ts
// src/lib/license/verify.ts
// 会员判定核心:localStorage 存码原文(购买凭证),每次现验——不缓存状态,篡改无意义。
// 生产公钥上线前替换(来源:后端生成密钥对,见 docs/2026-09-25-backend-license-api.md 第 0 节);
// 开发期默认指向测试公钥,与 testKey.ts 同步替换。
import { ed25519 } from '@noble/curves/ed25519'
import type { LicenseTier, StorageLike } from './types'

const STORAGE_KEY = 'pixel-forge.license.v1'

// ── 上线前替换为生产公钥 hex(后端交付);当前为测试公钥占位,与 testKey.ts 保持一致 ──
let publicKeyHex = ''   // Task1 Step5 先置空,由 setLicensePublicKey 注入;提交前用测试公钥 hex 字面量替换本行
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
```

说明:`atob/btoa` 在 node 18+ 全局存在,vitest node 环境可直接用;`publicKeyHex` 初始为空串时 `ed25519.verify` 会抛——已由 try/catch 归为 signature 失败,提交时务必完成字面量替换。

- [ ] **Step 6: 跑测试确认全绿**

```bash
npx vitest run src/lib/license/emit.test.ts
```
Expected: PASS(全部用例)。

- [ ] **Step 7: 写 scripts/genLicense.mjs(开发自测造码 CLI)**

```js
// scripts/genLicense.mjs
// 开发自测造码工具。测试密钥对与 src/lib/license/testKey.ts 是同一对(换钥两处同步)。
// 生产签发在后端(micro_server_nest_ai),本脚本不接触生产私钥。
// 用法: node scripts/genLicense.mjs --tier day [--count 5] [--valid-seconds 86400]
import { ed25519 } from '@noble/curves/ed25519'
const TEST_PRIVATE_KEY_HEX = '<与 testKey.ts 相同的私钥 hex>'
const DURATIONS = { day: 86400, week: 7 * 86400, month: 30 * 86400, year: 365 * 86400, lifetime: 0 }

const args = process.argv.slice(2)
const get = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined }
const tier = get('tier') ?? 'day'
const count = Number(get('count') ?? 1)
const valid = Number(get('valid-seconds') ?? DURATIONS[tier])
if (!(tier in DURATIONS)) { console.error(`未知 tier: ${tier}`); process.exit(1) }

const toB64Url = (bytes) => Buffer.from(bytes).toString('base64url')
for (let i = 0; i < count; i++) {
  const exp = tier === 'lifetime' ? 4102444800 : Math.floor(Date.now() / 1000) + valid
  const payload = JSON.stringify({ v: 1, tier, exp })
  const msg = Buffer.from(payload, 'utf8')
  const sig = ed25519.sign(msg, TEST_PRIVATE_KEY_HEX)
  console.log(`PF1.${toB64Url(msg)}.${toB64Url(sig)}`)
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/license/ scripts/genLicense.mjs package.json package-lock.json
git commit -m "feat: 激活码签发/验签核心(Ed25519 离线验签+localStorage 码原文存储)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 每日免费无水印额度(quota.ts)

**Files:**
- Create: `src/lib/license/quota.ts`
- Create: `src/lib/license/quota.test.ts`

**Interfaces:**
- Consumes: `StorageLike`(types.ts,Task 1 已建)
- Produces:
  - `FREE_DAILY_NO_WATERMARK = 5`
  - `todayKey(now?: number): string`(本地时区 'YYYY-MM-DD')
  - `remainingToday(now?: number): number`
  - `consumeOne(now?: number): boolean`(成功消耗 true,额度已尽 false)
  - `setQuotaStorage(s: StorageLike | null): void`

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/license/quota.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { FREE_DAILY_NO_WATERMARK, todayKey, remainingToday, consumeOne, setQuotaStorage } from './quota'

class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}

beforeEach(() => setQuotaStorage(new MemStorage()))

describe('quota', () => {
  it('初始剩余 5,消耗递减,耗尽返回 false', () => {
    const now = new Date(2026, 8, 25, 10, 0).getTime()
    expect(remainingToday(now)).toBe(FREE_DAILY_NO_WATERMARK)
    for (let i = 0; i < FREE_DAILY_NO_WATERMARK; i++) expect(consumeOne(now)).toBe(true)
    expect(remainingToday(now)).toBe(0)
    expect(consumeOne(now)).toBe(false)
  })

  it('跨本地自然日重置(23:59 → 次日 00:01)', () => {
    const night = new Date(2026, 8, 25, 23, 59).getTime()
    const dawn = new Date(2026, 8, 26, 0, 1).getTime()
    for (let i = 0; i < FREE_DAILY_NO_WATERMARK; i++) consumeOne(night)
    expect(remainingToday(dawn)).toBe(FREE_DAILY_NO_WATERMARK)
  })

  it('todayKey 用本地时区日期(非 UTC)', () => {
    // 本地 2026-09-26 00:30;若用 UTC 在东八区会得到 09-25——断言取本地
    const t = new Date(2026, 8, 26, 0, 30).getTime()
    expect(todayKey(t)).toBe('2026-09-26')
  })

  it('坏 JSON / 坏结构 / 异常 storage 均安全回落为满额或原值', () => {
    const bad = new MemStorage()
    bad.setItem('pixel-forge.freeExports.v1', '{oops')
    setQuotaStorage(bad)
    expect(remainingToday(Date.now())).toBe(FREE_DAILY_NO_WATERMARK)
    bad.setItem('pixel-forge.freeExports.v1', JSON.stringify({ date: todayKey(Date.now()), count: 'x' }))
    expect(remainingToday(Date.now())).toBe(FREE_DAILY_NO_WATERMARK)
    setQuotaStorage(null)
    expect(remainingToday(Date.now())).toBe(0)   // 无存储视为不可享额度(不会在浏览器出现)
    expect(consumeOne(Date.now())).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/lib/license/quota.test.ts
```
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 quota.ts**

```ts
// src/lib/license/quota.ts
// 每日免费无水印额度:单键自清洁——读时 date 非今日即归零,无垃圾键、无清理逻辑。
// 只存 localStorage:清存储的损害仅为"多得 5 次无水印",接受(spec 决策)。
import type { StorageLike } from './types'

export const FREE_DAILY_NO_WATERMARK = 5
const STORAGE_KEY = 'pixel-forge.freeExports.v1'

let storage: StorageLike | null = null
try {
  storage = typeof window !== 'undefined' ? window.localStorage : null
} catch { storage = null }
export function setQuotaStorage(s: StorageLike | null): void { storage = s }

/** 本地时区自然日键。禁 toISOString:那是 UTC,东八区 0:30 会落到前一天。 */
export function todayKey(now: number = Date.now()): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

interface QuotaState { date: string; count: number }

function readState(now: number): QuotaState {
  const today = todayKey(now)
  if (!storage) return { date: today, count: FREE_DAILY_NO_WATERMARK }
  let raw: string | null = null
  try { raw = storage.getItem(STORAGE_KEY) } catch { raw = null }
  if (raw) {
    try {
      const p = JSON.parse(raw)
      if (typeof p?.date === 'string' && typeof p?.count === 'number' && Number.isFinite(p.count)) {
        // 跨日/负数脏值统一归零重计
        return p.date === today && p.count >= 0 ? p : { date: today, count: 0 }
      }
    } catch { /* 坏 JSON 当作无记录 */ }
  }
  return { date: today, count: 0 }
}

function writeState(s: QuotaState): void {
  if (!storage) return
  try { storage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* 配额满忽略 */ }
}

export function remainingToday(now: number = Date.now()): number {
  const s = readState(now)
  return Math.max(0, FREE_DAILY_NO_WATERMARK - s.count)
}

export function consumeOne(now: number = Date.now()): boolean {
  if (remainingToday(now) <= 0) return false
  writeState({ date: todayKey(now), count: readState(now).count + 1 })
  return true
}
```

- [ ] **Step 4: 跑测试确认全绿**

```bash
npx vitest run src/lib/license/quota.test.ts
```
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/license/quota.ts src/lib/license/quota.test.ts
git commit -m "feat: 每日免费无水印额度计数(单键自清洁,跨本地自然日重置)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: 水印(watermark.ts 纯逻辑 + canvas 薄层)与 compositeOnBlack 提炼

**Files:**
- Create: `src/lib/license/watermark.ts`
- Create: `src/lib/license/watermark.test.ts`
- Modify: `src/lib/renderImage.ts:130-141`(提炼 compositeOnBlack,exportJpgWithBlackBg 改为复用)

**Interfaces:**
- Produces:
  - `WATERMARK_SITE = 'PixelForge'`、`WATERMARK_DOMAIN = 'pixelforge.oylz.site'`
  - `watermarkText(seed: string): string`
  - `tiledLayout(w: number): { fontSize: number; gap: number }`
  - `applyCanvasWatermark(canvas: HTMLCanvasElement, mode: 'corner'|'tiled', seed: string): void`(就地画,导出副本上调用)
  - `exportWatermarked(src: HTMLCanvasElement, mode: 'corner'|'tiled', seed: string, type: 'image/png'|'image/jpeg'): Promise<Blob|null>`(copy→水印→toBlob,不污染 src)
  - `injectSvgWatermark(svg: string, mode: 'corner'|'tiled', seed: string): string`
  - renderImage.ts 新增 `compositeOnBlack(source: HTMLCanvasElement): HTMLCanvasElement`
- Consumes: renderImage.ts 的 `exportCanvasBlob`

- [ ] **Step 1: 写失败测试(纯逻辑部分)**

```ts
// src/lib/license/watermark.test.ts
import { describe, it, expect } from 'vitest'
import { watermarkText, tiledLayout, injectSvgWatermark, WATERMARK_DOMAIN } from './watermark'

describe('watermarkText', () => {
  it('三要素:站名 · 种子码 · 域名', () => {
    expect(watermarkText('0A3fK')).toBe(`PixelForge · 0A3fK · ${WATERMARK_DOMAIN}`)
  })
})

describe('tiledLayout', () => {
  it('字号=gap/6.67 一类比例:大图字号大,小图有下限', () => {
    const big = tiledLayout(4000)
    const small = tiledLayout(400)
    expect(big.fontSize).toBeGreaterThan(small.fontSize)
    expect(big.gap).toBeGreaterThan(small.gap)
    expect(small.fontSize).toBeGreaterThanOrEqual(10)   // 小图可读下限
  })
})

describe('injectSvgWatermark', () => {
  const base = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><text>x</text></svg>'

  it('tiled:注入 pattern(rotate 45)+覆盖 rect,插在 </svg> 前,含种子码与域名', () => {
    const out = injectSvgWatermark(base, 'tiled', '0A3fK')
    expect(out).toContain('<pattern')
    expect(out).toContain('rotate(45)')
    expect(out).toContain('0A3fK')
    expect(out).toContain(WATERMARK_DOMAIN)
    expect(out.indexOf('<pattern')).toBeGreaterThan(out.indexOf('<text>x</text>'))   // 覆盖在内容之后
    expect(out.endsWith('</svg>')).toBe(true)
  })

  it('corner:右下角单行 text(anchor end + 100% 定位)', () => {
    const out = injectSvgWatermark(base, 'corner', '0A3fK')
    expect(out).toContain('text-anchor="end"')
    expect(out).toContain('x="100%"')
    expect(out).toContain('y="100%"')
    expect(out).not.toContain('<pattern')
  })

  it('无 </svg> 的非法输入原样返回(不抛)', () => {
    expect(injectSvgWatermark('not svg', 'tiled', 'x')).toBe('not svg')
  })

  it('种子码做 XML 转义(base62 本安全,防御手改 localStorage 脏值)', () => {
    const out = injectSvgWatermark(base, 'tiled', 'a<b>&c')
    expect(out).not.toContain('<b>')
    expect(out).toContain('a&lt;b&gt;&amp;c')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/lib/license/watermark.test.ts
```
Expected: FAIL。

- [ ] **Step 3: 实现 watermark.ts**

```ts
// src/lib/license/watermark.ts
// 导出水印:canvas 分支(copy 后画,预览画布永不污染)、SVG 分支(字符串注入)。
// 布局/文本为纯函数可单测;canvas 绘制是薄层,浏览器实测兜底(node 无 canvas)。
import { exportCanvasBlob } from '../renderImage'

export const WATERMARK_SITE = 'PixelForge'
export const WATERMARK_DOMAIN = 'pixelforge.oylz.site'

export function watermarkText(seed: string): string {
  return `${WATERMARK_SITE} · ${seed} · ${WATERMARK_DOMAIN}`
}

/** 平铺布局:字号≈图宽/40(下限 10),间距≈图宽/6。 */
export function tiledLayout(w: number): { fontSize: number; gap: number } {
  return { fontSize: Math.max(10, Math.round(w / 40)), gap: Math.max(80, Math.round(w / 6)) }
}

/** 就地在 canvas 上画水印。corner=右下角单行(白 60%+阴影);tiled=45° 平铺(15%)。 */
export function applyCanvasWatermark(canvas: HTMLCanvasElement, mode: 'corner' | 'tiled', seed: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const text = watermarkText(seed)
  if (mode === 'corner') {
    const fontSize = Math.max(12, Math.round(canvas.width / 50))
    ctx.save()
    ctx.font = `${fontSize}px sans-serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 3
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText(text, canvas.width - fontSize * 0.5, canvas.height - fontSize * 0.5)
    ctx.restore()
    return
  }
  const { fontSize, gap } = tiledLayout(canvas.width)
  ctx.save()
  ctx.font = `${fontSize}px sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  // 45° 旋转后平铺:行进方向沿对角,起始扩到负对角线长度保证全覆盖
  const diag = Math.ceil(Math.hypot(canvas.width, canvas.height))
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(-Math.PI / 4)
  for (let y = -diag; y <= diag; y += gap) {
    for (let x = -diag; x <= diag; x += gap) {
      ctx.fillText(text, x, y)
    }
  }
  ctx.restore()
}

/** 副本导出:copy src → 水印 → toBlob。会员路径不经过此函数(直接 exportCanvasBlob)。 */
export async function exportWatermarked(
  src: HTMLCanvasElement, mode: 'corner' | 'tiled', seed: string, type: 'image/png' | 'image/jpeg',
): Promise<Blob | null> {
  const tmp = document.createElement('canvas')
  tmp.width = src.width
  tmp.height = src.height
  const ctx = tmp.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(src, 0, 0)
  applyCanvasWatermark(tmp, mode, seed)
  return exportCanvasBlob(tmp, type)
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** SVG 水印:插入 root 闭合标签前(覆盖在内容之上)。无 </svg> 视为非法,原样返回。 */
export function injectSvgWatermark(svg: string, mode: 'corner' | 'tiled', seed: string): string {
  const idx = svg.lastIndexOf('</svg>')
  if (idx < 0) return svg
  const text = escapeXml(watermarkText(seed))
  let inject: string
  if (mode === 'corner') {
    const fontSize = Math.max(10, 1)   // SVG 用百分比:由 viewBox 缩放,取小值即可
    inject = `<text x="100%" y="100%" text-anchor="end" dy="-${fontSize}" font-size="${fontSize}" fill="rgba(255,255,255,0.6)" font-family="sans-serif">${text}</text>`
  } else {
    inject =
      `<defs><pattern id="pfwm" width="30%" height="20%" patternUnits="objectBoundingBox" patternTransform="rotate(45)">` +
      `<text font-size="1" fill="rgba(255,255,255,0.15)" font-family="sans-serif">${text}</text>` +
      `</pattern></defs>` +
      `<rect width="100%" height="100%" fill="url(#pfwm)"/>`
  }
  return svg.slice(0, idx) + inject + svg.slice(idx)
}
```

注意:corner SVG 的 font-size 采用 viewBox 单位制(值 1 起步)是实现起点,视觉比例在 Task 7 浏览器实测时按截图微调,不改变函数签名。

- [ ] **Step 4: 跑测试确认全绿**

```bash
npx vitest run src/lib/license/watermark.test.ts
```
Expected: PASS。

- [ ] **Step 5: 提炼 compositeOnBlack(行为等价重构)**

renderImage.ts 中 `exportJpgWithBlackBg` 的 tmp 构建段提炼为导出函数(JPG 水印顺序契约:渲染→黑底→水印→toBlob,单图与批量都要在"黑底产物"上加水印,故需独立导出):

```ts
/** 黑底合成:返回新 canvas(不改源)。JPG 无 alpha,背景关闭时透明区否则变白。 */
export function compositeOnBlack(source: HTMLCanvasElement): HTMLCanvasElement {
  const tmp = document.createElement('canvas')
  tmp.width = source.width
  tmp.height = source.height
  const ctx = tmp.getContext('2d')
  if (!ctx) return tmp   // 调用方 toBlob 会得到空图,与原实现失败路径一致
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, tmp.width, tmp.height)
  ctx.drawImage(source, 0, 0)
  return tmp
}

/** JPG 无 alpha:先合成黑底(背景关闭时 ASCII 透明区域否则变白)。 */
export async function exportJpgWithBlackBg(source: HTMLCanvasElement): Promise<Blob | null> {
  return exportCanvasBlob(compositeOnBlack(source), 'image/jpeg')
}
```

- [ ] **Step 6: 全量测试 + lint 确认无回归**

```bash
npm test && npm run lint
```
Expected: 测试全绿;lint 仍为基线 11 个错误(3D 文件)。

- [ ] **Step 7: Commit**

```bash
git add src/lib/license/watermark.ts src/lib/license/watermark.test.ts src/lib/renderImage.ts
git commit -m "feat: 导出水印(角落/平铺 canvas+SVG 注入)与 compositeOnBlack 提炼

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: 导出决策(gating.ts)与 App2D 单图三 handler 接入

**Files:**
- Create: `src/lib/license/gating.ts`
- Create: `src/lib/license/gating.test.ts`
- Modify: `src/components/App2D.tsx:854-883`(三个下载 handler)
- Modify: `src/components/App2D.tsx`(顶部 import、toast state;seed useMemo 在 949 行附近,复用其现有变量)
- Modify: `src/i18n/zh.json`、`src/i18n/en.json`(仅先行加入 toastCorner 一个 key,其余 Task 6 补齐)

**Interfaces:**
- Consumes: Task 1 `getLicenseStatus`、Task 2 `remainingToday/consumeOne`、Task 3 `exportWatermarked/injectSvgWatermark/compositeOnBlack`
- Produces:
  - `decideSingleExport(now?: number): { mode: 'none' | 'corner' }`(免费额度内会消耗 1 次)
  - `decideBatchExport(now?: number): { mode: 'none' | 'tiled' }`(批量不消耗额度)

- [ ] **Step 1: 写失败测试**

```ts
// src/lib/license/gating.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { signLicense } from './emit'
import { activateCode, setLicenseStorage, setLicensePublicKey } from './verify'
import { FREE_DAILY_NO_WATERMARK, setQuotaStorage } from './quota'
import { decideSingleExport, decideBatchExport } from './gating'
import { TEST_PRIVATE_KEY_HEX, TEST_PUBLIC_KEY_HEX } from './testKey'

class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}

const NOW = new Date(2026, 8, 25, 10, 0).getTime()

beforeEach(() => {
  setLicenseStorage(new MemStorage())   // 码与额度同用一份存储,贴近真实 localStorage
  setQuotaStorage(new MemStorage())
  setLicensePublicKey(TEST_PUBLIC_KEY_HEX)
})

describe('decideSingleExport', () => {
  it('免费:前 5 次 none(逐次消耗),第 6 次起 corner', () => {
    for (let i = 0; i < FREE_DAILY_NO_WATERMARK; i++) {
      expect(decideSingleExport(NOW).mode).toBe('none')
    }
    expect(decideSingleExport(NOW).mode).toBe('corner')
  })

  it('会员:始终 none 且不消耗额度', () => {
    activateCode(signLicense({ v: 1, tier: 'month', exp: Math.floor(NOW / 1000) + 1 }, TEST_PRIVATE_KEY_HEX), NOW)
    for (let i = 0; i < FREE_DAILY_NO_WATERMARK + 3; i++) {
      expect(decideSingleExport(NOW).mode).toBe('none')
    }
  })

  it('过期会员回落免费逻辑', () => {
    activateCode(signLicense({ v: 1, tier: 'day', exp: Math.floor(NOW / 1000) - 1 }, TEST_PRIVATE_KEY_HEX), NOW)
    expect(decideSingleExport(NOW).mode).toBe('none')   // 免费第 1 次
    expect(decideSingleExport(NOW).mode).toBe('none')
  })
})

describe('decideBatchExport', () => {
  it('免费=tiled 且不消耗单图额度;会员=none', () => {
    expect(decideBatchExport(NOW).mode).toBe('tiled')
    expect(decideSingleExport(NOW).mode).toBe('none')   // 额度未被批量动过
    activateCode(signLicense({ v: 1, tier: 'day', exp: Math.floor(NOW / 1000) + 100 }, TEST_PRIVATE_KEY_HEX), NOW)
    expect(decideBatchExport(NOW).mode).toBe('none')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/lib/license/gating.test.ts
```
Expected: FAIL。

- [ ] **Step 3: 实现 gating.ts**

```ts
// src/lib/license/gating.ts
// 导出决策:唯一知道"会员态×额度"组合规则的地方。纯逻辑,无 DOM。
// 单图:额度内消耗 1 次得 none,尽则 corner;批量:会员 none,免费 tiled(不消耗额度)。
import { getLicenseStatus } from './verify'
import { consumeOne } from './quota'

export type SingleExportMode = { mode: 'none' | 'corner' }
export type BatchExportMode = { mode: 'none' | 'tiled' }

export function decideSingleExport(now: number = Date.now()): SingleExportMode {
  if (getLicenseStatus(now).active) return { mode: 'none' }
  return consumeOne(now) ? { mode: 'none' } : { mode: 'corner' }
}

export function decideBatchExport(now: number = Date.now()): BatchExportMode {
  if (getLicenseStatus(now).active) return { mode: 'none' }
  return { mode: 'tiled' }
}
```

- [ ] **Step 4: 跑测试确认全绿**

```bash
npx vitest run src/lib/license/gating.test.ts
```
Expected: PASS。

- [ ] **Step 5: 改造 App2D 三个下载 handler**

App2D.tsx 顶部追加 import:
```ts
import { decideSingleExport } from '../lib/license/gating'
import { exportWatermarked, injectSvgWatermark } from '../lib/license/watermark'
import { compositeOnBlack, exportCanvasBlob } from '../lib/renderImage'   // exportCanvasBlob 已在 import 列表,补 compositeOnBlack
```

组件内新增一次性降级 toast(state 紧邻既有 useState 群):
```ts
// 水印降级一次性提示:首次从"无水印"跌到"带水印"时弹一次,3s 自清,不反复骚扰
const [wmToast, setWmToast] = useState(false)
useEffect(() => {
  if (!wmToast) return
  const t = setTimeout(() => setWmToast(false), 3000)
  return () => clearTimeout(t)
}, [wmToast])
```

三个 handler 替换为(保留原 `useCallback` 依赖结构;`seed` 为 App2D.tsx:949 附近现有 useMemo 变量名,执行时以实际为准):
```ts
const handleDownloadPng = useCallback(async () => {
  const src = getExportCanvas()
  if (!src) return
  const d = decideSingleExport()
  if (d.mode === 'none') {
    const b = await exportCanvasBlob(src, 'image/png')
    downloadBlob(b, 'png')
    return
  }
  setWmToast(true)
  const b = await exportWatermarked(src, 'corner', seed, 'image/png')
  downloadBlob(b, 'png')
}, [getExportCanvas, downloadBlob, seed])

const handleDownloadJpg = useCallback(async () => {
  const styleDef = getStyle(activeStyle)
  const showBg = params['uShowBg'] ?? 1
  const src = getExportCanvas()
  if (!src) return
  // JPG 水印顺序契约:渲染→黑底→水印→toBlob(水印不被黑底覆盖)
  const base = styleDef?.renderMode === 'canvas2d' && showBg !== 1 ? compositeOnBlack(src) : src
  const d = decideSingleExport()
  if (d.mode === 'none') {
    const b = await exportCanvasBlob(base, 'image/jpeg')
    downloadBlob(b, 'jpg')
    return
  }
  setWmToast(true)
  const b = await exportWatermarked(base, 'corner', seed, 'image/jpeg')
  downloadBlob(b, 'jpg')
}, [activeStyle, params, getExportCanvas, downloadBlob, seed])

const handleDownloadSvg = useCallback(() => {
  const family = fontParams['uFont']?.family ?? 'monospace'
  const svg = asciiRendererRef.current?.exportSvg(family)
  if (!svg) return
  const d = decideSingleExport()
  const out = d.mode === 'corner' ? injectSvgWatermark(svg, 'corner', seed) : svg
  if (d.mode === 'corner') setWmToast(true)
  downloadBlob(new Blob([out], { type: 'image/svg+xml' }), 'svg')
}, [fontParams, downloadBlob, seed])
```

JSX 前,先在 zh.json / en.json 顶层加入本任务用到的 key(其余 license 文案 Task 6 统一补齐):
`"license": { "toastCorner": "今日无水印额度已用完,本次导出带水印" }` /
`"license": { "toastCorner": "Watermark-free quota used up today; exports now carry a watermark" }`。

JSX 中(组件返回树末尾、既有弹窗/浮窗节点旁)追加:
```tsx
{wmToast && (
  <div style={{ position: 'fixed', left: '50%', bottom: '72px', transform: 'translateX(-50%)',
    background: 'rgba(30,30,30,0.92)', color: '#fff', padding: '8px 14px', borderRadius: 8,
    fontSize: 13, zIndex: 1000, pointerEvents: 'none' }}>
    {t('license.toastCorner')}
  </div>
)}
```

- [ ] **Step 6: 全量测试 + lint + tsc**

```bash
npm test && npm run lint && npx tsc -b
```
Expected: 全绿/基线 11 错误;App2D handler 属组件层,交互效果由 Task 7 浏览器实测验收。

- [ ] **Step 7: Commit**

```bash
git add src/lib/license/gating.ts src/lib/license/gating.test.ts src/components/App2D.tsx
git commit -m "feat: 单图导出接入会员 gating(额度内无水印,超额角落水印+一次性提示)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: 批量导出接入(runBatch)与 BatchPanel 免费横幅

**Files:**
- Modify: `src/lib/batch/runBatch.ts:104-182`(createCanvasRenderTask 闭包)
- Modify: `src/components/BatchPanel.tsx`(props + 配置 tab 顶部横幅)
- Modify: `src/components/App2D.tsx`(传新 prop)
- Modify: `src/i18n/zh.json`、`src/i18n/en.json`(先行加入 batchBanner 一个 key)

**Interfaces:**
- Consumes: Task 4 `decideBatchExport`、Task 3 `exportWatermarked/injectSvgWatermark/compositeOnBlack`、`encodeSeed`(seedCodec)
- Produces: BatchPanelProps 新增 `licenseActive: boolean`

- [ ] **Step 1: 改造 createCanvasRenderTask 闭包**

runBatch.ts 顶部追加 import:
```ts
import { decideBatchExport } from '../license/gating'
import { exportWatermarked, injectSvgWatermark } from '../license/watermark'
import { compositeOnBlack } from '../renderImage'   // 与既有 exportJpgWithBlackBg 等同源导入合并
import { encodeSeed } from '../seedCodec'
```

闭包内(现 161-177 行)导出段替换。种子码由渲染状态现编码(与行 seed roundtrip 等价,RenderTask 接口无需加字段):
```ts
      const out = isCanvas2d ? asciiCanvas! : canvas!
      // 批量水印决策:每张导出瞬间现查(会员 none/免费 tiled;批量不消耗单图额度)
      const wm = decideBatchExport().mode
      const seedText = encodeSeed(t.styleId, t.params, def, t.textParams)
      if (t.format === 'svg') {
        const family = baseline.fontParams['uFont']?.family ?? 'monospace'
        const svg = asciiRenderer.exportSvg(family)
        return new Blob([wm === 'tiled' ? injectSvgWatermark(svg, 'tiled', seedText) : svg], { type: 'image/svg+xml' })
      }
      if (t.format === 'jpg') {
        const showBg = t.params['uShowBg'] ?? 1
        // JPG 顺序契约:黑底→水印→toBlob(与单图同规则)
        const base = isCanvas2d && showBg !== 1 ? compositeOnBlack(out) : out
        const jpg = wm === 'tiled'
          ? await exportWatermarked(base, 'tiled', seedText, 'image/jpeg')
          : await exportCanvasBlob(base, 'image/jpeg')
        if (!jpg) throw new Error('jpg export failed')
        return jpg
      }
      const png = wm === 'tiled'
        ? await exportWatermarked(out, 'tiled', seedText, 'image/png')
        : await exportCanvasBlob(out, 'image/png')
      if (!png) throw new Error('png export failed')
      return png
```

原 `exportJpgWithBlackBg` 导入若再无引用则从 import 列表移除(lint 会提示)。

- [ ] **Step 2: BatchPanel 加免费横幅**

BatchPanelProps 追加:
```ts
  /** 会员态(App2D 现查):免费时配置 tab 顶部显示水印横幅 */
  licenseActive: boolean
```
配置 tab 顶部(`开始处理` 区块上方)插入(先在 zh/en.json 的 license 对象补
`"batchBanner": "免费版批量导出带水印"` / `"batchBanner": "Free batch exports are watermarked"`):
```tsx
{!licenseActive && (
  <div className="batch-wm-banner">{t('license.batchBanner')}</div>
)}
```
global.css 追加(色彩语言与 batch-panel 既有样式一致):
```css
.batch-wm-banner { margin: 8px 0; padding: 6px 10px; border-radius: 8px;
  background: rgba(255, 193, 7, 0.12); color: #e6a700; font-size: 12px; text-align: center; }
```

- [ ] **Step 3: App2D 传 prop**

App2D 渲染 `<BatchPanel ... />` 处追加 `licenseActive={getLicenseStatus().active}`(import 自 `../lib/license/verify`;渲染期现查,激活后经面板重开/状态刷新生效,如需即时反映可在 LicensePanel 激活成功回调里 `setShowBatchPanel(v => v)` 触发重渲——实现时以最简可达者为准,验收标准是激活后重开面板横幅消失)。

- [ ] **Step 4: 全量测试 + lint + tsc**

```bash
npm test && npm run lint && npx tsc -b
```
Expected: 全绿/基线不变。批量水印的视觉效果在 Task 7 浏览器实测验收(node 不可测 canvas,SVG 注入已有单测)。

- [ ] **Step 5: Commit**

```bash
git add src/lib/batch/runBatch.ts src/components/BatchPanel.tsx src/components/App2D.tsx src/styles/global.css
git commit -m "feat: 批量导出接入水印 gating(免费平铺/会员无水印)+面板免费横幅

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: LicensePanel 会员面板 + ActionBar 入口 + i18n

**Files:**
- Create: `src/components/LicensePanel.tsx`
- Modify: `src/components/ActionBar.tsx`(可选 props + 按钮)
- Modify: `src/components/App2D.tsx`(接线)
- Modify: `src/i18n/zh.json`、`src/i18n/en.json`(license 命名空间)
- Modify: `src/styles/global.css`(.license-panel 等)

**Interfaces:**
- Consumes: Task 1 `activateCode/getLicenseStatus/loadStoredCode`、Task 2 `remainingToday`
- Produces: ActionBarProps 新增 `onOpenLicense?: () => void; licenseActive?: boolean`

- [ ] **Step 1: i18n 文案(补齐 license 命名空间;toastCorner/batchBanner 已分别随 Task 4/5 先行加入,此步并入同一对象)**

zh.json 中把 license 对象整体替换为以下最终全量(两处旧 key 随之归位,无重复):
```json
"license": {
  "panelTitle": "会员",
  "freeTitle": "免费版",
  "memberTitle": "会员",
  "freeRemaining": "今日剩余无水印导出 {{count}} 次",
  "memberUntil": "有效期至 {{date}}",
  "expiredTag": "已过期,续费激活",
  "activate": "激活",
  "placeholder": "粘贴激活码…",
  "activated": "激活成功",
  "errFormat": "激活码格式不正确",
  "errSignature": "激活码无效,请联系卖家",
  "errExpired": "激活码已过期",
  "backup": "复制激活码备份",
  "purchase": "购买激活码",
  "toastCorner": "今日无水印额度已用完,本次导出带水印",
  "batchBanner": "免费版批量导出带水印",
  "badge": "会员"
}
```
en.json 对应英文(freeRemaining: "{{count}} watermark-free exports left today"、memberUntil: "Active until {{date}}"、errSignature: "Invalid code, please contact the seller" 等,逐一对应)。

- [ ] **Step 2: 实现 LicensePanel.tsx**

```tsx
// src/components/LicensePanel.tsx
// 会员浮窗:状态卡(免费剩余/会员到期)+激活+备份+购买链接。纯视图+本地激活,
// 激活成功回调上交 App2D(触发状态刷新)。v1 无邮箱托底(后端 v2 就绪后再加)。
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraggable } from '../lib/useDraggable'
import { activateCode, getLicenseStatus, loadStoredCode, type LicenseParseResult } from '../lib/license/verify'
import { remainingToday, FREE_DAILY_NO_WATERMARK } from '../lib/license/quota'

// v1 冷启动:面包多商品页;上线前替换为实际链接(收款路线见 spec 第 7 节)
const PURCHASE_URL = 'https://mianbaoduo.com/'

interface LicensePanelProps {
  onClose: () => void
  /** 激活/状态变化通知(App2D 触发重渲,批量横幅等即时刷新) */
  onChanged: () => void
}

function LicensePanel({ onClose, onChanged }: LicensePanelProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const { bind, style } = useDraggable()   // 与 PresetPanel/BatchPanel 同款拖动;签名以 useDraggable.ts 现有导出为准
  const status = getLicenseStatus()
  const expired = !status.active && loadStoredCode() !== null

  const handleActivate = () => {
    const r: LicenseParseResult = activateCode(input)
    if (r.ok) {
      setMsg({ kind: 'ok', text: t('license.activated') })
      setInput('')
      onChanged()
    } else {
      const key = r.reason === 'format' ? 'errFormat' : r.reason === 'signature' ? 'errSignature' : 'errExpired'
      setMsg({ kind: 'err', text: t(`license.${key}`) })
    }
  }

  return (
    <div className="preset-panel license-panel" style={style} {...bind}>
      <div className="preset-panel-header">
        <span>{t('license.panelTitle')}</span>
        <button className="panel-close" onClick={onClose} aria-label="close">✕</button>
      </div>
      <div className="license-body">
        {status.active ? (
          <div className="license-card license-card--member">
            <div className="license-card-title">{t('license.memberTitle')}</div>
            <div>{t('license.memberUntil', { date: new Date((status.expAt ?? 0) * 1000).toLocaleDateString() })}</div>
          </div>
        ) : (
          <div className="license-card">
            <div className="license-card-title">{t('license.freeTitle')}{expired ? ` · ${t('license.expiredTag')}` : ''}</div>
            <div>{t('license.freeRemaining', { count: remainingToday() })} / {FREE_DAILY_NO_WATERMARK}</div>
          </div>
        )}
        <div className="license-activate">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('license.placeholder')}
            spellCheck={false}
          />
          <button className="action-btn action-btn--primary" onClick={handleActivate}>{t('license.activate')}</button>
        </div>
        {msg && <div className={`license-msg license-msg--${msg.kind}`}>{msg.text}</div>}
        {loadStoredCode() && (
          <button className="license-link-btn" onClick={() => navigator.clipboard?.writeText(loadStoredCode()!)}>
            {t('license.backup')}
          </button>
        )}
        <a className="license-link-btn" href={PURCHASE_URL} target="_blank" rel="noreferrer">{t('license.purchase')} ↗</a>
      </div>
    </div>
  )
}

export default LicensePanel
```

说明:`useDraggable` 的解构签名(bind/style)以 `src/lib/useDraggable.ts` 实际导出为准,执行时对齐 PresetPanel 的用法;关闭钮的 `✕` 是项目既有 panel-close 样式用法,若 PresetPanel 用 SVG 则跟随。panel-close 若项目里是字符 ✕ 保留,否则换成同款 SVG(禁 emoji 规范针对图标,文本 ✕ 属既有惯例)。

- [ ] **Step 3: ActionBar 入口**

ActionBarProps 追加两个可选 props,按钮插在 `onBatchApply` 按钮之后、`imageInfo` 之前(手绘 SVG:皇冠线稿,与既有 13px 手绘图标同风格):
```tsx
interface ActionBarProps {
  // ...(既有 props 不动)
  onOpenLicense?: () => void
  licenseActive?: boolean
}

// JSX:
{onOpenLicense && (
  <button className={`action-btn ${licenseActive ? 'action-btn--secondary' : 'action-btn--primary'}`} onClick={onOpenLicense}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 4 }} aria-hidden="true">
      <path d="M3 8l4 4 5-6 5 6 4-4v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
    {t('license.badge')}
  </button>
)}
```

- [ ] **Step 4: App2D 接线**

```ts
const [showLicensePanel, setShowLicensePanel] = useState(false)
```
ActionBar 渲染处传 `onOpenLicense={() => setShowLicensePanel(v => !v)}`、`licenseActive={getLicenseStatus().active}`(getLicenseStatus 已在 Task 5 import);浮窗渲染处:
```tsx
{showLicensePanel && (
  <LicensePanel
    onClose={() => setShowLicensePanel(false)}
    onChanged={() => setImages((v) => [...v])}   // 最小触发重渲:批量横幅/按钮态即时刷新
  />
)}
```

- [ ] **Step 5: CSS**

global.css 追加(`.preset-panel` 提供浮窗底盘,仅补专属样式):
```css
.license-panel { width: 300px; max-width: calc(100vw - 24px); }
.license-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.license-card { border: 1px solid rgba(128,128,128,0.25); border-radius: 10px; padding: 10px 12px; font-size: 13px; }
.license-card--member { border-color: rgba(230,167,0,0.5); background: rgba(230,167,0,0.08); }
.license-card-title { font-weight: 600; margin-bottom: 4px; }
.license-activate { display: flex; gap: 8px; }
.license-activate input { flex: 1; min-width: 0; }
.license-msg { font-size: 12px; }
.license-msg--ok { color: #4caf50; }
.license-msg--err { color: #ef5350; }
.license-link-btn { background: none; border: none; color: #8ab4ff; cursor: pointer; font-size: 12px; padding: 0; text-align: left; text-decoration: none; }
```

- [ ] **Step 6: 全量测试 + lint + tsc + build**

```bash
npm test && npm run lint && npx tsc -b && npm run build
```
Expected: 全绿/基线不变/build 成功。

- [ ] **Step 7: Commit**

```bash
git add src/components/LicensePanel.tsx src/components/ActionBar.tsx src/components/App2D.tsx src/i18n/zh.json src/i18n/en.json src/styles/global.css
git commit -m "feat: 会员面板(激活/备份/购买入口)+ActionBar 会员钮+i18n

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: 浏览器实测(视觉与 gating 全链路验收)

**Files:**
- Create: `artifacts/license-verify/`(截图与记录,不进 git 或按项目 artifacts 惯例)

**Interfaces:**
- Consumes: 全部前序任务;`scripts/genLicense.mjs` 造测试码

- [ ] **Step 1: 启动 dev 与造码**

```bash
npm run dev &
node scripts/genLicense.mjs --tier month --count 1
```
记下输出的测试码。

- [ ] **Step 2: puppeteer 脚本逐场景验收(项目 playbook:vite dev + puppeteer-core + Edge headless,视觉复核须放大局部截图)**

场景与通过标准:
1. **免费额度内无水印**:上传测试图,导出 5 次,每次主画布/下载产物无水印(预览画布本身永不带水印,验证下载 blob)。
2. **第 6 次角落水印 + toast**:第 6 次导出,toast 出现;把 `exportWatermarked` 产物(页面内临时挂 img 或直接截下载预览)右下角局部放大 200%,可见 `PixelForge · <种子码> · pixelforge.oylz.site`。
3. **免费批量平铺**:上传 ≥2 张图跑批量,done 行预览/下载产物 45° 平铺水印,局部放大 200% 可辨认;SVG 格式批量(ASCII 风格)下载文件内容含 `<pattern id="pfwm"`。
4. **激活会员全解锁**:LicensePanel 粘贴测试码 → "激活成功" → 状态卡显示会员与到期日;单图/批量/PNG/JPG/SVG 全部无水印;BatchPanel 横幅消失。
5. **持久性**:刷新页面会员态保持;devtools 清 localStorage → 回落免费;重输码恢复会员。
6. **3D 零改动**:3D 页导出走原路径(不 import license 模块),导出无水印。

- [ ] **Step 3: 视觉微调(如需)**

依据截图微调 corner/tiled 的字号、透明度、SVG font-size 比例(spec 标注"初值,实现时微调");只动 watermark.ts 常量与 SVG 数值,不动函数签名。

- [ ] **Step 4: 最终门禁**

```bash
npm test && npm run lint && npm run build
```
Expected: 测试全绿;lint 基线 11(3D 文件);build 成功。

- [ ] **Step 5: Commit(如有微调)**

```bash
git add -A src/
git commit -m "fix: 水印视觉参数按浏览器实测微调

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## 上线前清单(非本计划任务,交付时提醒)

1. verify.ts `publicKeyHex` 替换为生产公钥(后端交付);scripts/genLicense.mjs 与 testKey.ts 保持测试对。
2. `PURCHASE_URL` 替换为面包多实际商品页。
3. 后端 v1(生成接口+表)就绪后,按 `docs/2026-09-25-backend-license-api.md` 联调一次生成码可被前端验签。
