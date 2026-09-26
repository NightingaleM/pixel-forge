# 后端需求:激活码 license 服务(micro_server_nest_ai)

日期:2026-09-25(兑换码方案)/ **2026-09-26 链式方案修订(本文档现行版)**
来源:前端付费方案设计 `docs/superpowers/specs/2026-09-25-2d-monetization-design.md`
与链式重设计 `docs/superpowers/specs/2026-09-26-license-chain-redesign-design.md`(均经用户确认)。
本文档是交付给后端的完整需求;免费侧零后端,会员使用零后端(离线验签)。

## 总原则

**兑换依赖后端,使用不依赖。** 用户激活/续费/刷新必须调后端(这些接口是发卡模式的
组成部分,需可用);换回隐藏凭证后一切离线(验签/水印 gating),后端故障不影响已有
会员。`recover` 不可用时前端静默降级。`generate` 是后台管理功能,依赖后台既有登录鉴权。

### 链式模型(2026-09-26 修订动机)

旧模型(一码一兑):多码取最晚到期、时长不叠加、已兑换码不记名可无限复制——三个
反直觉语义,详见链式 spec。新模型:

- **码即身份**:首个被无会员设备激活的未兑换码成为**身份码**,其 code_hash 即**链**的记账键;
- **补充包**:会员设备上输入的未使用码被消耗进链(链 `exp += 时长`,次数 +1),即刻死亡;
- **次数**:链可绑定设备数,初始 5,每绑新设备 −1,每补充包 +1;已绑定设备重复操作 0;
- **隐藏凭证**:redeem 应答的 `{v:2,cid,exp,did}`,前端离线验签并校验 did==本机——
  凭证复制到未绑定设备自动失效,次数限制从软变真。

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
- ⚠️ @noble/curves@1.9 的 ed25519.verify 参数序是 **(signature, message, publicKey)**,
  与常见文档相反——后端对接时注意。

## 1. 码格式规范(前后端契约,必须逐字节一致)

```
码     = "PF1." + b64url(payloadUtf8) + "." + b64url(signature)
signature = ed25519.sign(payloadUtf8, privateKey)
```

两类 payload(紧凑 JSON,键序固定,`JSON.stringify` 字面量序):

| 类型 | payload | 签发者/时机 |
|---|---|---|
| 未兑换码 | `{ v: 1, tier: <string>, iat: <unix秒> }` | 后端 generate(键序 v/tier/iat);身份码与补充包**同形态**,服务端按库内 status 区分 |
| 隐藏凭证 | `{ v: 2, cid: <16hex>, exp: <unix秒>, did: <deviceId> }` | 后端 redeem/refresh 应答(键序 v/cid/exp/did) |

- `tier` ∈ `day | week | month | year | lifetime`。
- 时长映射:`day=86400 / week=604800 / month=2592000 / year=31536000 /
  lifetime=4102444800`(lifetime 的 exp 固定值 = 2100-01-01)。
- `cid` = 身份码 `code_hash` 前 16 hex(链标识);`did` = 本凭证绑定的 deviceId(1..128 字符)。
- **凭证不落库**:按 `{cid, 链当前exp, did}` 确定性重签——同设备重复请求返回逐字节相同的
  码,幂等天然成立,多设备凭证互不干扰。
- b64url:标准 base64url 无 padding(`base64url` 库或 `Buffer.toString('base64url')`)。
- 两类码互斥:v1 无 cid/exp 凭证键,v2 无 tier/iat;后端 redeem 收到不符形态一律 400。
- 系统**未上线,无历史码兼容包袱**:2026-09-26 前生成的旧 v1 已兑换码全部作废。

## 2. 生成接口(上线必需)

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
| code_hash | char(64) | SHA-256 hex(对账/关联键,建索引) |
| tier | string | |
| batch_id | string | 生成批次 |
| note | string? | |
| status | string | `unused` / `identity`(已成为某链身份码) / `supplement`(已消耗为补充包) |
| chain_hash | char(64)? | supplement 行回填:所属链(= 身份码 code_hash);identity 行 NULL |

链记账放在**身份码行**上(避免两张表):

| 列(仅 identity 行使用) | 类型 | 说明 |
|---|---|---|
| exp_at | bigint | 链当前到期(unix 秒);每次补充包 += 时长 |
| count | int | 剩余可绑定设备数,初始 5,绑新设备 −1,补充包 +1 |
| device_ids | json | string[],已绑定 deviceId 台账 |
| created_at / redeemed_at / updated_at | datetime | |

## 3. 兑换与刷新(redeem 是发卡模式组成部分)

### POST /api/license/redeem —— 公开接口(核心)

- body: `{ code: string, deviceId: string(1..128), credential?: string }`
  (credential = 本地隐藏凭证原文,会员态自动携带;前端先用同一公钥验签,后端必须同样验签。)
- 限流:IP 维度 10 次/分钟(超限 `429`)。

**判定状态机**(code 验签为未兑换形态后,按 code_hash 查库):

| 前置 | code 库内状态 | 判定 | 动作 | 次数 |
|---|---|---|---|---|
| 无 credential | unused | 新链 | 建 identity 行(exp=now+时长,lifetime 固定值),绑 deviceId,签发凭证 | 初始 5,绑定 −1 |
| 无 credential | identity | deviceId 已绑 | 幂等:重签返回 | 0 |
| 无 credential | identity | 未绑,余次>0 | 绑定新 deviceId,重签 | −1 |
| 无 credential | identity | 未绑,余次=0 | `409 {error:"device_exhausted"}` | — |
| 无 credential | identity | 链已过期 | `410 {error:"expired"}` | — |
| 无 credential | supplement | 已消耗 | `400 {error:"invalid_code"}`(前端提示"该码已被使用") | — |
| 带 credential | — | 凭证验签过、did==请求 deviceId、cid 链存在且未过期、**deviceId 已绑定该链** | 前提;任一不满足 → 400/410 | — |
| 带 credential | unused | 补充包 | 消耗(status→supplement,回填 chain_hash),链 exp += 时长(lifetime 直接置固定值),次数 +1,重签 | +1 |
| 带 credential | identity 且同链 | 幂等 | 重签 | 0 |
| 带 credential | identity 且异链 | 冲突 | `409 {error:"identity_conflict"}`(前端提示"该码是其他会员的身份码") | — |
| 带 credential | supplement | 已消耗 | `400 {error:"invalid_code"}` | — |

- **并发**:同一链的 redeem 必须串行化(行锁/事务),防止两设备同时贴码丢时长。
- deviceId 未绑定链时不得接受带 credential 的续费(堵凭证复制洗牌)。
- email 字段(可选)非空则 upsert 到 `license_binding`(v2 recover 用,后写覆盖)。
- 返回: `200 { code: <隐藏凭证>, expAt: <unix秒>, count: <剩余次数> }`
  (前端不信响应体:对 code 重新验签 + 校验 did 才落库。)

### POST /api/license/refresh —— 公开接口(新增)

- body: `{ credential: string, deviceId: string }`
- 行为:验签 → did==deviceId → cid 定位链 → 链过期 `410` → 否则按链当前 exp 重签。
- 用途:多设备场景下,其他设备续费后本设备免输码同步最新到期(已绑定设备,不消耗次数)。
- 返回/限流:同 redeem。

### POST /api/license/recover —— 公开接口(v2 不变)

- body: `{ email: string }`
- 行为:查 `license_binding` 该邮箱绑定的所有**未过期**链 → 发送按该邮箱绑定 deviceId
  重签的凭证原文(用户重贴即恢复)。恒定 `{ ok: true }`——邮箱不存在也返回 ok(防枚举)。
- 限流:同邮箱 1 次/分钟 + IP 维度限流。依赖:SMTP 配置。

### 表 license_binding

| 列 | 类型 | 说明 |
|---|---|---|
| code_hash | char(64) PK | 链(身份码)hash |
| email | string? | 建索引 |
| device_ids | json | string[](与链行冗余,recover 发信用) |
| created_at / updated_at | datetime | |

## 4. 验收要点

1. 后端生成的未兑换码,前端用同一公钥验签通过(联调金标准)。
2. redeem/refresh 返回的隐藏凭证,前端验签通过、`expAt` = 链当前 exp、`did` = 请求 deviceId。
3. 激活未使用码 → 链建立,count=4(5−首台);同设备重输 → 逐字节相同凭证(确定性重签)。
4. 带 credential 消耗补充包 → 链 exp 精确 += 时长映射、count+1;该补充包任何途径再用 → 400。
5. 身份码绑第 6 台(无补充包时)→ 409 device_exhausted;他链身份码带凭证来 → 409 identity_conflict。
6. 篡改 payload 任一字符 → 前后端验签均失败;非未兑换形态交给 redeem → 400。
7. 并发:两请求同时对同一链消耗补充包 → 两次 += 都生效(不丢时长)。
8. 私钥不出现在 git、日志、错误响应;generate 未鉴权调用 → 401/403。
9. recover 对不存在邮箱返回 ok 且不发信。

## 5. 前端行为摘要(后端无需实现,供对照)

- 激活入口(非会员):`activateCode` → redeem(无 credential);续费入口(会员):`renewCode`
  → redeem(自动携 credential);刷新:`refreshCredential` → refresh。三者错误分类一致
  (format/signature/expired/used/identity_conflict/device_exhausted/network/rate_limited)。
- 会员判定:`getLicenseStatus` 纯离线——验签 + `did == 本机 deviceId`,凭证复制失效。
- 上线前前端注入生产公钥与同源 `/api` 反代(生产 `VITE_API_BASE` 留空,nginx 转发到后端)。
