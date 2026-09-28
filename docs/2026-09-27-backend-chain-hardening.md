# 后端需求增补:链式 license 加固(admin 处置接口 / 每日绑定上限 / lifetime 不可续)

日期:2026-09-27
状态:待实施
前置:链式方案 v2(redeem 带 credential / refresh / status=count=device_ids=chain_hash 表结构)
**已在 micro_server_nest_ai 实施完成**(契约见 `docs/2026-09-25-backend-license-api.md`
2026-09-26 修订版)。本文件是**增量需求**,不改既有 redeem/refresh 主语义,只加
三条规则与三个接口。本文档可整份直接交给后端,自包含。

## 背景(为什么加,三句话)

1. **lifetime 套利**:lifetime 链 exp 固定 2100 不变,而任何档位补充包都给链
   **+1 设备次数**——买一个 lifetime 码后,每个最便宜的 day 包(¥3-6)等于新增
   一个终身设备席位,可无限复制、适合拆卖。
2. **烧次数无节流**:deviceId 是客户端自报的随机串,清 localStorage 即新设备;
   拿到身份码原文的人可脚本化烧光 5 个绑定名额,现有 IP 限流(10/min)挡不住
   跨日的慢速烧。烧尽后用户无自助通道,客诉必然发生。
3. **运营零处置手段**:退款、盗码、纠纷、封禁,当前只能手改数据库。

## 1. 新增事件日志表 `license_chain_event`(先建,后两条规则依赖它)

| 列 | 类型 | 说明 |
|---|---|---|
| id | 自增 PK | |
| chain_hash | char(64) | 索引(与 license_codes.code_hash 同域) |
| device_id | varchar(128) null | 本次操作设备 |
| event | varchar(16) | `bind` / `renew` / `refresh` / `seal` / `reset_count` |
| detail | json null | 变更明细(如 seal 记 `{"oldExpAt":...}`,reset_count 记旧值) |
| ip | varchar(45) null | 溯源用 |
| created_at | datetime | |

- 写入时机:**每次成功** bind(新设备绑定)/ renew(消耗补充包)/ refresh,以及
  每次 admin 操作(第 4 节)。
- 用途:第 2 节每日上限的计数源;运营对账(生成台账 vs 销量 vs 兑换日志)、
  异常排查(某链短时间大量 bind = 烧次数攻击)、误封还原(detail 存旧值)。
- 若后端已有等价日志表可复用,字段至少覆盖 chain_hash / event / device_id / created_at。

## 2. 每链每日新设备绑定上限

- **规则**:同一链,每个**东八区自然日**内,新 deviceId 绑定(含建链首绑)最多
  N 次。默认 **N=3**,环境变量 `LICENSE_DAILY_BIND_LIMIT`(0=不限制)。
- **作用范围**:仅"无 credential 激活路径"的新设备绑定分支(原判定表场景 1/2 的
  新绑列)。已绑设备的幂等重签、refresh、续费消耗(+1 次)**不受影响**。
- **超限返回**:`409 {error:"bind_daily_limit"}`——不绑定、不动 count。与
  device_exhausted 同为 409,靠 body.error 区分(沿用既有模式)。
- **计数源**:license_chain_event 中该链当日 `event='bind'` 行数。**判定与绑定
  必须在同一行锁事务内**(与既有"同链 redeem 串行化"同一把锁),防并发穿透。
- **时区**:按 UTC+8 计算自然日,**勿依赖容器本地时区**(容器常是 UTC)。
- N=3 的含义:合法用户"PC+笔记本+手机"首日全激活不受阻;攻击者烧 5 个名额
  至少要跨 2 天,给运营从事件表发现并处置留出时间窗。

## 3. lifetime 链不可消耗补充包

- **规则**:identity 行 `tier='lifetime'` 的链,redeem 带 credential 且 code 为
  unused(即原"补充包"路径)→ 拒绝:`409 {error:"lifetime_no_renew"}`。
- **事务性**:**先判链 tier,再决定是否消耗 code**——绝不可出现"码已置
  supplement 又报错"的半途状态。被拒的 code 保持 unused,买家仍可在非会员
  设备上用它激活成全新链,不产生废票。
- lifetime 链其余行为不变:场景 2 的新设备绑定照常(仍受 count 与第 2 节上限约束)。
- 前端将展示:"终身会员无需续费,如需增加设备位请联系客服"。
- (前端侧本文件不涉及;错误码命名以本文为准,若后端要改名,先同步本文再动手。)

## 4. admin 处置接口(三个,鉴权同 `/api/admin/license/generate` 的后台登录态)

### 4.1 GET /api/admin/license/chain —— 查链

- query:`code`(兑换码原文)| `code_hash` | `cid` 三选一;可选 `withEvents=1`。
- 返回:

```json
{
  "codeHash": "...", "cid": "...", "tier": "month", "status": "identity",
  "expAt": 1790000000, "count": 3,
  "deviceIds": ["..."],
  "createdAt": "...", "redeemedAt": "...",
  "supplements": [ { "codeHash": "...", "tier": "day", "consumedAt": "..." } ],
  "events": [ ... ]
}
```

- supplements 按 `chain_hash` 关联查出;`events` 仅 withEvents=1 时返回该链最近
  50 条(倒序)。查无此链 → 404。

### 4.2 POST /api/admin/license/chain/seal —— 封链(退款/违规/盗码处置)

- body:`{ code? , codeHash? , cid? , reason? }`(三选一定位链,下同)
- 行为:identity 行 `exp_at = 当前时刻秒`;若已过期则幂等 200。
  **detail 必记旧值** `{"oldExpAt":...,"reason":...}`(误封可人工还原)。
- 生效路径无需新代码:refresh → 410 expired;带 credential 的 redeem → 410
  (链已过期);离线凭证到 exp 即自然失效(前端本地判)。
- 返回 `{ codeHash, expAt }`。不做解封接口(误封按事件表旧值人工恢复)。

### 4.3 POST /api/admin/license/chain/reset-count —— 重置设备次数

- body:`{ code? , codeHash? , cid? , count?: number(1..99) , reason? }`
- 行为:identity 行 `count = 给定值`;缺省 = 建链初始常量(当前 5)。
  detail 记 `{"oldCount":...,"reason":...}`。
- 返回 `{ codeHash, count }`。

三个 admin 接口的操作均写 license_chain_event(event=`seal`/`reset_count`,
device_id 置操作人账号或 null),并纳入后台既有审计/鉴权中间件。

## 5. 验收要点

1. 新链当日依次绑第 1/2/3 台 → 200;第 4 台(默认 N=3)→ `409 bind_daily_limit`;
   已绑设备同日重复激活/刷新 → 200,不占用也不校验每日额度;次日再绑 → 成功且
   count 正确 −1。
2. lifetime 链带 credential 贴 unused day 码 → `409 lifetime_no_renew`,库内该码
   仍为 unused,且可在他处正常激活成新链;year 链同操作 → 正常消耗、exp += 、
   count +1(回归确认原路径未被误伤)。
3. 封链后:refresh → 410;带 credential redeem → 410;事件表可查 oldExpAt。
4. count=0 的链 reset-count 5 → 新设备可绑,count 变 4。
5. admin 三接口未登录 → 401/403;所有操作入事件表。
6. 两个新错误码字符串逐字一致:`bind_daily_limit` / `lifetime_no_renew`
   (前端按 body.error 区分,同 409)。
7. 并发:同链同时刻两请求绑不同新设备且当日额度仅剩 1 → 恰好一个成功。
8. `LICENSE_DAILY_BIND_LIMIT=0` → 完全回归现行行为(不限制)。

## 6. 本期明确不做(防镀金)

- 补充包 +1 限制 tier≥week(时间有界套利,随链到期自然封顶,暂接受);
- 解封接口、链合并、按邮箱找回(recover v2 另行排期);
- 心跳/同时在线验证(前端架构君子协定,不做)。
