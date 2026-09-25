# 后端需求:激活码 license 服务(micro_server_nest_ai)

日期:2026-09-25(兑换码方案修订)
来源:前端付费方案设计 `docs/superpowers/specs/2026-09-25-2d-monetization-design.md`(已确认)。
本文档是交付给后端的完整需求;免费侧零后端,会员使用零后端(离线验签)。

## 总原则

**兑换依赖后端,使用不依赖。** 用户激活未兑换码必须调 `redeem`(此接口是发卡
模式的组成部分,需可用);换回已兑换码后,一切离线(验签/水印 gating/续存恢复),
后端故障不影响已有会员。`recover` 不可用时前端静默降级,无需特殊错误协议。
`generate` 是后台管理功能,依赖后台既有登录鉴权。

### 兑换码模型(2026-09-25 修订动机)

旧模型:码生成时写死 `exp`,预生成囤库存持续损耗时长 → 发卡平台预贴库存不可行。
新模型:**后端只生成"未兑换码"(永不过期,含 iat 无 exp)**;用户激活时前端调
`POST /api/license/redeem` 换回"已兑换码"(`exp` = 兑换时刻 + 时长,PF1 格式不变)。
预贴库存零损耗,时长从用户激活那一刻起算。

## 0. 密钥管理(先于一切)

Ed25519 密钥对,生成一次长期使用(轮换 = 换密钥对 + 前端发版换公钥)。

生成(项目内装好 `@noble/curves` 后):

```js
// node -e 或临时脚本
const { ed25519 } = require('@noble/curves/ed25519')
const priv = ed25519.utils.randomPrivateKey()          // Uint8Array(32)
const pub  = ed25519.getPublicKey(priv)                // Uint8Array(32)
console.log('PRIVATE(hex):', Buffer.from(priv).toString('hex'))
console.log('PUBLIC(hex):',  Buffer.from(pub).toString('hex'))
```

- 私钥 hex(64 字符)存环境变量 `LICENSE_PRIVATE_KEY`,**不进 git、不打日志**。
- 公钥 hex 交给前端硬编码(两端必须同一对)。
- 前端另持有一对"测试密钥"(开发自试用,与生产无关),联调时注意区分。

## 1. 码格式规范(前后端契约,必须逐字节一致)

```
码     = "PF1." + b64url(payloadUtf8) + "." + b64url(signature)
signature = ed25519.sign(sha512, payloadUtf8, privateKey)
```

两类 payload(紧凑 JSON,键序固定,`JSON.stringify` 字面量序):

| 类型 | payload | 签发者/时机 |
|---|---|---|
| 未兑换码 | `{ v: 1, tier: <string>, iat: <unix秒> }` | 后端 generate(键序 v/tier/iat) |
| 已兑换码 | `{ v: 1, tier: <string>, exp: <unix秒> }` | 后端 redeem 时刻(键序 v/tier/exp) |

- `tier` ∈ `day | week | month | year | lifetime`(首发只发前四种)。
- 时长映射(redeem 时刻起算):`day=86400 / week=604800 / month=2592000 /
  year=31536000 / lifetime=4102444800`(lifetime 的 exp 固定值 = 2100-01-01)。
- b64url:标准 base64url 无 padding(`base64url` 库或 `Buffer.toString('base64url')`)。
- **exp 由 redeem 时刻写死**(未兑换码无 exp,囤库存零损耗);激活不在 exp 上做
  延长(续费 = 发新码,前端支持多码时取最晚到期的活跃码——v1 前端行为,后端无需
  关心)。

## 2. v1:生成接口(上线必需)

### POST /api/admin/license/generate

- 鉴权:后台管理系统既有登录态。
- body: `{ tier: string, count: number(1..200), note?: string }`
- 行为:生成 count 个**未兑换码**(`{v:1,tier,iat}`,iat=生成时刻),**先入库再返回**;
  同批共用 batch_id 与 note。
- 返回: `{ batchId, codes: string[] }`
- 后台页面(用户自行实现):生成表单 + 列表(筛选 tier/status/批次)+ 复制/导出 CSV。

### 表 license_codes

| 列 | 类型 | 说明 |
|---|---|---|
| id | 自增 PK | |
| code | string | 未兑换码明文(后台复制发货用) |
| code_hash | char(64) | SHA-256 hex(对账/绑定关联键,建索引) |
| tier | string | |
| batch_id | string | 生成批次 |
| note | string? | |
| status | string | `unused` / `issued`(贴库存或发货时标) / `redeemed`(首次 redeem 回填) |
| redeemed_code | string? | redeem 时签发的已兑换码原文(幂等:重复 redeem 返回同一张) |
| redeemed_exp_at | bigint? | unix 秒(redeem 时刻 + 时长) |
| created_at | datetime | |
| redeemed_at | datetime? | |

## 3. v2:兑换与找回(redeem 是发卡模式组成部分)

### POST /api/license/redeem —— 公开接口(核心)

- body: `{ code: string, deviceId?: string(1..128字符), email?: string }`
- 行为:公钥验签(未兑换码格式,不合法或非未兑换码 → `400 {error:"invalid_code"}`)
  → 按 code_hash 查库:
  - 未兑换过:签发已兑换码(`exp = now + 时长映射`,lifetime 用固定 4102444800)
    → 入库 `redeemed_code`/`redeemed_exp_at`/`redeemed_at`,status 回填 `redeemed`
    → 若带 deviceId,查/建 `license_binding` 并追加(deviceId 超过 3 台 →
    **`409 {error:"device_limit"}`**,且不签发);
  - 已兑换过(幂等):直接返回库中同一张 `redeemed_code`;deviceId 若为新设备
    追加绑定(同样受 3 台上限,超限 409);
  - email 非空则 upsert(后写覆盖)。
- 返回: `200 { code: <已兑换PF1码>, tier: string, expAt: <unix秒> }`
- 限流:IP 维度 10 次/分钟(超限 `429`)。
- 前端行为:拿到 `code` 后**本地验签**才入库(不信响应体);网络失败提示
  "激活需要联网"。

### POST /api/license/recover —— 公开接口

- body: `{ email: string }`
- 行为:查 `license_binding` 该邮箱绑定的所有**未过期**已兑换码 → 逐个发送
  `redeemed_code` 原文到邮箱(用户重贴即离线恢复)。
- 返回:恒定 `{ ok: true }`——**邮箱不存在也返回 ok**(防枚举)。
- 限流:同邮箱 1 次/分钟 + IP 维度限流(防邮件轰炸)。
- 依赖:SMTP 配置(阿里云邮件推送或同类)。

### 表 license_binding

| 列 | 类型 | 说明 |
|---|---|---|
| code_hash | char(64) PK | |
| email | string? | 建索引 |
| device_ids | json | string[] |
| created_at / updated_at | datetime | |

## 4. 验收要点

1. 后端生成的未兑换码,前端用同一公钥验签通过(联调金标准)。
2. redeem 返回的已兑换码,前端验签通过且 `expAt` = 兑换时刻 + 时长映射。
3. 篡改 payload 任一字符 → 前后端验签均失败;redeem 非未兑换码格式 → 400。
4. 重复 redeem 同码 → 200 返回同一张已兑换码(幂等)。
5. 私钥不出现在 git、日志、错误响应。
6. redeem 第 4 台设备返回 409;recover 对不存在邮箱返回 ok 且不发信。
7. generate 接口未鉴权调用 → 401/403。
