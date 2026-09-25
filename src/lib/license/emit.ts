// src/lib/license/emit.ts
// 签发侧(仅开发自测与 scripts/genLicense.mjs 使用;生产签发在后端)。
// 码格式契约见 docs/2026-09-25-backend-license-api.md 第 1 节,前后端逐字节一致。
import { ed25519 } from '@noble/curves/ed25519'
import type { LicenseTier } from './types'

export interface LicensePayload { v: 1; tier: LicenseTier; exp: number }
/** 未兑换码 payload(兑换码方案):永不过期,iat 仅作签发时刻台账,激活时换已兑换码。 */
export interface UnredeemedPayload { v: 1; tier: LicenseTier; iat: number }

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

export function signUnredeemed(payload: UnredeemedPayload, privateKeyHex: string): string {
  // 键序固定 v/tier/iat(与后端契约逐字节一致),无 exp:时长在兑换时刻起算
  const payloadStr = JSON.stringify({ v: payload.v, tier: payload.tier, iat: payload.iat })
  const msg = new TextEncoder().encode(payloadStr)
  const sig = ed25519.sign(msg, privateKeyHex)
  return `PF1.${toB64Url(msg)}.${toB64Url(sig)}`
}
