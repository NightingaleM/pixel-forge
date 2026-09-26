// src/lib/license/emit.ts
// 签发侧(仅开发自测与 scripts/genLicense.mjs 使用;生产签发在后端)。
// 码格式契约见 docs/2026-09-25-backend-license-api.md 第 1 节(链式方案修订),前后端逐字节一致:
//   未兑换码 {v:1,tier,iat}(永不过期) / 隐藏凭证 {v:2,cid,exp,did}(设备绑定,见 spec 2026-09-26)。
import { ed25519 } from '@noble/curves/ed25519'
import type { LicenseTier } from './types'

/** 未兑换码 payload:永不过期,iat 仅作签发时刻台账;首个被激活者成为身份码。 */
export interface UnredeemedPayload { v: 1; tier: LicenseTier; iat: number }
/** 隐藏凭证 payload:cid=链标识(身份码 code_hash 前 16 hex),did=绑定设备。 */
export interface CredentialPayload { v: 2; cid: string; exp: number; did: string }

function toB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function signUnredeemed(payload: UnredeemedPayload, privateKeyHex: string): string {
  // 键序固定 v/tier/iat(与后端契约逐字节一致),无 exp:时长在兑换时刻起算
  const payloadStr = JSON.stringify({ v: payload.v, tier: payload.tier, iat: payload.iat })
  const msg = new TextEncoder().encode(payloadStr)
  const sig = ed25519.sign(msg, privateKeyHex)
  return `PF1.${toB64Url(msg)}.${toB64Url(sig)}`
}

export function signCredential(payload: CredentialPayload, privateKeyHex: string): string {
  // 键序固定 v/cid/exp/did:后端按同序确定性重签,幂等天然成立
  const payloadStr = JSON.stringify({ v: payload.v, cid: payload.cid, exp: payload.exp, did: payload.did })
  const msg = new TextEncoder().encode(payloadStr)
  const sig = ed25519.sign(msg, privateKeyHex)
  return `PF1.${toB64Url(msg)}.${toB64Url(sig)}`
}
