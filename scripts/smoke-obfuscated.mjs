// scripts/smoke-obfuscated.mjs
// 混淆产物冒烟(2026-10-14):验证「混淆后的 license chunk 在真实浏览器功能完好」。
// 与 dev 回归(verify-license.mjs)的差异:本脚本对 build 产物跑——页面里没有 /src
// 源码可 import,故用 vite build --mode development 让 define 注入测试公钥(src 无
// import.meta.env.DEV 用点,development 构建对应用行为无分叉,仅公钥不同),mock
// 后端 + 自签码 + 真 UI 激活链路全程走混淆后的 verify.ts 代码。
// 断言:UI 激活成功 + localStorage 落 v2 凭证 + did 设备绑定 + 面板会员文案 +
//   产物 license chunk 无敏感明文(页面侧二次核验) + 全程零 pageerror。
// 用法: node scripts/smoke-obfuscated.mjs  (自动 build→preview→测试→恢复正式产物)
// 产物: artifacts/obf-smoke/ 截图 + result.json
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { ed25519 } from '@noble/curves/ed25519'
import fs from 'node:fs'
import path from 'node:path'

// preview 起始端口(被占时 vite 自动顺延,实际端口从 stdout 解析)
const PORT = 18923
const OUT = path.resolve('artifacts/obf-smoke')
fs.mkdirSync(OUT, { recursive: true })

const { TEST_PRIVATE_KEY_HEX } = await import('./read-test-key.mjs')
const sign = (payload) => {
  const msg = Buffer.from(JSON.stringify(payload), 'utf8')
  return `PF1.${msg.toString('base64url')}.${Buffer.from(ed25519.sign(msg, TEST_PRIVATE_KEY_HEX)).toString('base64url')}`
}
const codeA = sign({ v: 1, tier: 'day', iat: Math.floor(Date.now() / 1000) })
const b64urlJson = (code) => JSON.parse(Buffer.from(code.split('.')[1], 'base64url').toString('utf8'))

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
if (!EDGE) { console.error('未找到 Edge'); process.exit(1) }

const results = []
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`)
}

// 子进程统一用 process.execPath 直启 node_modules 里的 bin(win 下 spawn('npx')
// 需 shell:true,kill 只能杀到 shell,服务进程会残留——2026-10-10 排查结论)
const procs = []
const run = (args, env = {}) => {
  const p = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), ...args],
    { stdio: 'pipe', env: { ...process.env, ...env } })
  procs.push(p)
  return p
}
process.on('exit', () => { for (const p of procs) { try { p.kill() } catch { /* 已退出 */ } } })

const waitFor = async (fn, ms, what) => {
  for (let i = 0; i < Math.ceil(ms / 200); i++) {
    try { if (await fn()) return true } catch { /* 未就绪,继续轮询 */ }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`等待超时: ${what}`)
}
const exitOk = (p) => new Promise((res, rej) => p.on('exit', c => (c === 0 ? res() : rej(new Error(`build 退出码 ${c}`)))))

// ── 1. 混淆产物 build(mode=development → define 注入测试公钥)──
const devBuild = run(['build', '--mode', 'development'])
devBuild.stderr?.on('data', d => process.stderr.write(d))
await exitOk(devBuild)
const licFile = fs.readdirSync('dist/assets').find(f => /^license-.*\.js$/.test(f))
ok('S1 build 产出 license chunk', !!licFile, licFile ?? '未找到')
const licSize = licFile ? fs.statSync(path.join('dist/assets', licFile)).size : 0
ok('S1b license chunk 为混淆产物(>100KB,非 47KB 明文压缩态)', licSize > 100_000, `${(licSize / 1024).toFixed(0)}KB`)

// ── 2. mock 后端 + preview(proxy /api → 3999)──
// 端口不带 --strictPort:本机出站连接源端口偶发撞车(TIME_WAIT/ESTABLISHED 占住
// 低段端口,netstat 无监听进程)会让 bind 假报占用;让 vite 自选空位并从 stdout
// 解析实际端口(2026-10-14 排查,4179/4399 两轮复现)。
const mock = spawn(process.execPath, ['scripts/mock-redeem.mjs', '3999'], { stdio: 'pipe' })
procs.push(mock)
await waitFor(async () => (await fetch('http://localhost:3999/')).ok, 10_000, 'mock redeem 就绪')
let actualPort = PORT
const preview = run(['preview', '--port', String(PORT)], { API_PROXY_TARGET: 'http://localhost:3999' })
preview.stdout?.on('data', d => {
  const m = String(d).match(/localhost:(\d+)/)
  if (m) actualPort = Number(m[1])
})
preview.stderr?.on('data', d => process.stderr.write(d))
const base = `http://localhost:${actualPort}`
await waitFor(async () => (await fetch(base)).ok, 30_000, `preview 就绪(${base})`)

// ── 3. 浏览器冒烟 ──
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

try {
  await page.goto(`${base}/2d`, { waitUntil: 'networkidle0', timeout: 30_000 })
  await page.evaluate(async () => {
    localStorage.clear()
    try {
      const ds = await indexedDB.databases()
      for (const d of ds) if (d.name) indexedDB.deleteDatabase(d.name)
    } catch { indexedDB.deleteDatabase('pixel-forge-session') }
  })

  // UI 贴码激活(走真实交互,同 verify-license.mjs:会员钮开面板→输入→主按钮)
  await page.waitForSelector('.action-bar .action-btn', { timeout: 15_000 })
  const memberBtn = (await page.evaluateHandle(() => [...document.querySelectorAll('.action-bar .action-btn')]
    .find(x => x.textContent?.includes('会员') || x.textContent?.includes('Member')))).asElement()
  if (!memberBtn) throw new Error('未找到会员按钮')
  await memberBtn.click()
  await page.waitForSelector('.license-panel input', { timeout: 8_000 })
  const input = await page.$('.license-panel input')
  await input.click({ clickCount: 3 })
  await input.type(codeA)
  await (await page.$('.license-panel .action-btn--primary')).click()

  // 激活成功 = 混淆后的 ed25519 验签 + parseCredential + settle + storeCredential 全链路工作
  await page.waitForFunction(() => document.querySelector('.license-msg--ok') !== null, { timeout: 10_000 })
  ok('S2 混淆产物激活成功(验签→兑换→凭证落库全链路)', true)

  const storedCode = await page.evaluate(() => localStorage.getItem('pixel-forge.license.v2'))
  const storedPayload = storedCode ? b64urlJson(storedCode) : null
  const localDeviceId = await page.evaluate(() => localStorage.getItem('pixel-forge.deviceId.v1'))
  ok('S3 落库为 v2 隐藏凭证(cid/exp/did,无 tier/iat)',
    storedPayload?.v === 2 && /^[0-9a-f]{16}$/.test(storedPayload?.cid ?? '')
      && typeof storedPayload?.exp === 'number' && storedPayload.iat === undefined,
    storedCode ? JSON.stringify(storedPayload) : 'storage 空')
  ok('S4 凭证 did 与本机 deviceId 一致(设备绑定在混淆代码下工作)',
    storedPayload?.did === localDeviceId, `did=${storedPayload?.did?.slice(0, 8)}…`)

  const panelText = await page.evaluate(() => document.querySelector('.license-panel')?.textContent ?? '')
  ok('S5 会员面板显示有效期', /有效期|Active until/.test(panelText), panelText.slice(0, 100))
  await page.screenshot({ path: path.join(OUT, 'smoke-member-panel.png') })

  // 页面侧二次核验:产物 license chunk 无敏感明文(存储键/码头)
  const plainCheck = await page.evaluate(async (licName) => {
    const src = await fetch(`/assets/${licName}`).then(r => r.text())
    return { hasStorageKey: src.includes('pixel-forge.license'), hasHead: src.includes('PF1') }
  }, licFile)
  ok('S6 产物无存储键明文', !plainCheck.hasStorageKey)
  ok('S7 产物无 PF1 码头明文', !plainCheck.hasHead)

  ok('S8 全程零 pageerror(混淆代码运行时无异常)', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (err) {
  ok('冒烟流程', false, String(err).slice(0, 200))
  await page.screenshot({ path: path.join(OUT, 'smoke-fail.png') }).catch(() => {})
} finally {
  await browser.close().catch(() => {})
}

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ results, errors }, null, 2))
const failed = results.filter(r => !r.pass).length
console.log(`\n${failed === 0 ? '✓ 冒烟全过' : `✗ ${failed} 项失败`}(明细 ${OUT}/result.json)`)

// ── 4. 恢复正式产物(冒烟用的是 development 公钥产物)──
console.log('恢复 production 产物中…')
const prodBuild = run(['build'])
prodBuild.stderr?.on('data', d => process.stderr.write(d))
await exitOk(prodBuild)
process.exit(failed === 0 ? 0 : 1)
