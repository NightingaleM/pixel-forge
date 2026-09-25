# 后端需求:激活码 license 服务(micro_server_nest_ai)

日期:2026-09-25
来源:前端付费方案设计 `docs/superpowers/specs/2026-09-25-2d-monetization-design.md`(已确认)。
本文档是交付给后端的完整需求;前端不依赖其中任何接口即可上线(v1 免费侧零后端,
会员离线验签)。

## 总原则

**后端是增强,不是依赖。** `activate`/`recover` 不可用时前端静默降级纯离线模式,
因此这两个接口只需正常返回 4xx/5xx,无需特殊错误协议。`generate` 是后台管理功能,
依赖后台既有登录鉴权。

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
码   = "PF1." + b64url(payloadUtf8) + "." + b64url(signature)
payload = JSON.stringify({ v: 1, tier: <string>, exp: <unix秒> })
signature = ed25519.sign(sha512, payloadUtf8, privateKey)
```

- `tier` ∈ `day | week | month | year | lifetime`(首发只发前四种)。
- `exp` = 生成时刻 + 对应时长(lifetime 用 4102444800 = 2100-01-01)。
- b64url:标准 base64url 无 padding(`base64url` 库或 `Buffer.toString('base64url')`)。
- exp 由**生成时**写死,激活不在 exp 上做延长(续费 = 发新码,前端支持多码时取最晚
  到期的活跃码——v1 前端行为,后端无需关心)。

## 2. v1:生成接口(上线必需)

### POST /api/admin/license/generate

- 鉴权:后台管理系统既有登录态。
- body: `{ tier: string, count: number(1..200), note?: string }`
- 行为:生成 count 个码,**先入库再返回**;同批共用 batch_id 与 note。
- 返回: `{ batchId, codes: string[] }`
- 后台页面(用户自行实现):生成表单 + 列表(筛选 tier/status/批次)+ 复制/导出 CSV。

### 表 license_codes

| 列 | 类型 | 说明 |
|---|---|---|
| id | 自增 PK | |
| code | string | 码明文(后台复制发货用) |
| code_hash | char(64) | SHA-256 hex(对账/绑定关联键,建索引) |
| tier | string | |
| exp_at | bigint | unix 秒 |
| batch_id | string | 生成批次 |
| note | string? | |
| status | string | `unused` / `issued`(贴库存或发货时标) / `activated`(首次 activate 回填) |
| created_at | datetime | |

## 3. v2:绑定与找回(自动化阶段)

### POST /api/license/activate —— 公开接口

- body: `{ code: string, deviceId: string(1..128字符), email?: string }`
- 行为:公钥验签码(不合法 400)→ 查/建 `license_binding`:
  - 新建:插入 code_hash + deviceId;
  - 已存在:deviceId 不在列表则追加,**超过 3 台返回 409 `{error:"device_limit"}`**;
  - email 非空则 upsert(后写覆盖);
  - `license_codes.status` 尚为 issued 时回填 `activated`。
- 返回: `{ ok: true, devices: number }`
- 限流:IP 维度(建议 ≥10 次/分钟阈值用 @nestjs/throttler 默认档)。

### POST /api/license/recover —— 公开接口

- body: `{ email: string }`
- 行为:查 `license_binding` 该邮箱绑定的所有**未过期**码 → 逐个发送原文到邮箱。
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

1. 后端生成的码,前端用同一公钥验签通过(联调金标准)。
2. 篡改 payload 任一字符 → 前后端验签均失败。
3. 私钥不出现在 git、日志、错误响应。
4. activate 第 4 台设备返回 409;recover 对不存在邮箱返回 ok 且不发信。
5. generate 接口未鉴权调用 → 401/403。
